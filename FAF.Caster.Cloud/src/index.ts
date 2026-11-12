import { DurableObject } from 'cloudflare:workers';

interface Env { SESSIONS: DurableObjectNamespace<CasterSession>; CODES: DurableObjectNamespace<LinkRegistry>; }
const json = (data: unknown, status = 200, extra: Record<string,string> = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra } });
const fail = (message: string, status: number) => json({ error: message }, status);
const randomHex = (bytes = 16) => Array.from(crypto.getRandomValues(new Uint8Array(bytes)), n => n.toString(16).padStart(2,'0')).join('');
const code = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), n => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[n % 32]).join('');
const hash = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), n=>n.toString(16).padStart(2,'0')).join('');
const ID = /^[a-f0-9]{32}$/;
const MAX_PAYLOAD = 128 * 1024;
const LINK_TTL_MS = 10 * 60_000;
const SESSION_TTL_MS = 6 * 60 * 60_000;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, {status: 204, headers: cors(request)});
    let result: Response;
    try {
      if (url.pathname === '/api/health' && request.method === 'GET') result = json({ status: 'ok', service: 'faf-caster-cloud' });
      else if (url.pathname === '/api/sessions' && request.method === 'POST') {
        const id = randomHex();
        const registry = env.CODES.get(env.CODES.idFromName('global'));
        let linkingCode = '';
        for (let attempt = 0; attempt < 12; attempt++) {
          const candidate = code();
          const reservation = await registry.fetch(new Request('https://codes.internal/reserve', {method:'POST',body:JSON.stringify({code:candidate,id,expiresAt:Date.now()+LINK_TTL_MS})}));
          if (reservation.ok) { linkingCode = candidate; break; }
        }
        if (!linkingCode) return fail('Unable to allocate linking code',503);
        const stub = env.SESSIONS.get(env.SESSIONS.idFromName(id));
        result = await stub.fetch(new Request(`https://session.internal/init`, {method:'POST',body:JSON.stringify({linkingCode})}));
        if (result.ok) {
          const body = await result.json() as Record<string, unknown>;
          result = json({ ...body, sessionId: id, viewerPath: `/session/${id}` }, 201);
        }
      } else if (url.pathname === '/api/link' && request.method === 'POST') {
        const raw = await request.text();
        if (raw.length > 1024) return fail('Invalid request',400);
        let body: {code?:unknown};
        try {body = JSON.parse(raw)} catch {return fail('Invalid JSON',400)}
        if (typeof body.code !== 'string' || !/^[A-Z2-9]{6}$/.test(body.code.trim().toUpperCase())) return fail('Invalid code',403);
        const registry = env.CODES.get(env.CODES.idFromName('global'));
        const lookup = await registry.fetch(new Request('https://codes.internal/lookup',{method:'POST',body:JSON.stringify({code:body.code.trim().toUpperCase()})}));
        if (!lookup.ok) result = fail('Invalid or expired code',403);
        else {
          const {id} = await lookup.json() as {id:string};
          const stub = env.SESSIONS.get(env.SESSIONS.idFromName(id));
          const linked = await stub.fetch(new Request('https://session.internal/link',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:body.code.trim().toUpperCase()})}));
          if (linked.ok) {
            const tokenData = await linked.json() as Record<string,unknown>;
            result = json({...tokenData,sessionId:id});
            await registry.fetch(new Request('https://codes.internal/release',{method:'POST',body:JSON.stringify({code:body.code.trim().toUpperCase(),id})}));
          } else result = linked;
        }
      } else {
        const match = url.pathname.match(/^\/api\/sessions\/([a-f0-9]{32})\/(link|telemetry|metadata|players|history|status|stream)$/);
        if (!match || !ID.test(match[1])) result = fail('Not found',404);
        else {
          const [, id, action] = match;
          const stub = env.SESSIONS.get(env.SESSIONS.idFromName(id));
          const upstream = new URL(request.url);
          upstream.pathname = `/${action}`;
          result = await stub.fetch(new Request(upstream.toString(), request));
        }
      }
    } catch (e) {
      console.error('Request failed', e);
      result = fail('Internal error',500);
    }
    const headers = new Headers(result.headers);
    for (const [k,v] of Object.entries(cors(request))) headers.set(k,v);
    return new Response(result.body, { status: result.status, statusText: result.statusText, headers, webSocket: result.webSocket });
  }
} satisfies ExportedHandler<Env>;

function cors(request: Request): Record<string,string> {
  // POC: public read access; do not expose secrets to browsers. Lock down allowed origins before production.
  return { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'Content-Type, Authorization' };
}

type SessionState = { createdAt: number; expiresAt: number; linkCodeHash: string; linkExpiresAt: number; uploaderHash?: string; claimed: boolean; records: number; players: Record<string, unknown>; history: Record<string, unknown[]>; metadata?: Record<string, unknown> };
export class CasterSession extends DurableObject<Env> {
  private async getState(): Promise<SessionState | null> { return await this.ctx.storage.get<SessionState>('session') ?? null; }
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const now = Date.now();
    if (url.pathname === '/init' && request.method === 'POST') {
      if (await this.getState()) return fail('Already initialized',409);
      const initBody = await request.json() as {linkingCode?:string};
      const linkingCode = initBody.linkingCode;
      if (!linkingCode || !/^[A-Z2-9]{6}$/.test(linkingCode)) return fail('Invalid linking code',400);
      const state: SessionState = { createdAt:now, expiresAt:now+SESSION_TTL_MS, linkCodeHash:await hash(linkingCode), linkExpiresAt:now+LINK_TTL_MS, claimed:false, records:0, players:{}, history:{} };
      await this.ctx.storage.put('session',state);
      await this.ctx.storage.setAlarm(state.expiresAt);
      return json({ linkingCode, linkExpiresAt: new Date(state.linkExpiresAt).toISOString(), expiresAt:new Date(state.expiresAt).toISOString() },201);
    }
    const state = await this.getState();
    if (!state || now >= state.expiresAt) return fail('Session expired or missing',404);
    if (url.pathname === '/link' && request.method === 'POST') {
      if (state.claimed || now > state.linkExpiresAt) return fail('Linking code unavailable',410);
      const raw = await request.text();
      if (raw.length > 1024) return fail('Invalid request',400);
      let body: {code?: unknown};
      try { body = JSON.parse(raw); } catch { return fail('Invalid JSON',400); }
      if (typeof body.code !== 'string' || (await hash(body.code.trim().toUpperCase())) !== state.linkCodeHash) return fail('Invalid code',403);
      const token = randomHex(32);
      state.uploaderHash = await hash(token);
      state.claimed = true;
      await this.ctx.storage.put('session',state);
      return json({ uploadToken: token, expiresAt: new Date(state.expiresAt).toISOString() });
    }
    if (url.pathname === '/telemetry' && request.method === 'POST') {
      const auth = request.headers.get('authorization') ?? '';
      if (!state.claimed || !state.uploaderHash || !auth.startsWith('Bearer ') || await hash(auth.slice(7)) !== state.uploaderHash) return fail('Unauthorized',401);
      const contentLength = Number(request.headers.get('content-length') ?? '0');
      if (contentLength > MAX_PAYLOAD) return fail('Payload too large',413);
      const raw = await request.text();
      if (raw.length > MAX_PAYLOAD) return fail('Payload too large',413);
      let body: unknown;
      try { body = JSON.parse(raw); } catch { return fail('Invalid JSON',400); }
      const entries = Array.isArray(body) ? body : [body];
      if (entries.length < 1 || entries.length > 64) return fail('Expected 1–64 player records',400);
      for (const item of entries) {
        if (!item || typeof item !== 'object') return fail('Invalid record',400);
        const p = item as Record<string,unknown>;
        if (p.version !== 2 || !Number.isInteger(p.armyId) || (p.armyId as number) < 1 || (p.armyId as number) > 32 || typeof p.gameTime !== 'number' || !Number.isFinite(p.gameTime) || p.gameTime < 0 || typeof p.name !== 'string' || p.name.length > 120) return fail('Invalid telemetry schema',400);
      }
      for (const item of entries) {
        const p = item as Record<string,unknown>;
        const key = String(p.armyId);
        state.players[key] = p;
        const history = state.history[key] ?? [];
        const last = history[history.length - 1] as Record<string,unknown> | undefined;
        if (!last || (p.gameTime as number) > (last.gameTime as number)) {
          history.push({ gameTime:p.gameTime, massIncome:p.massIncome, massSpent:p.massSpent, energyIncome:p.energyIncome, energySpent:p.energySpent, massStored:p.massStored, energyStored:p.energyStored });
          state.history[key] = history.slice(-300);
        }
        state.records++;
      }
      await this.ctx.storage.put('session',state);
      for (const ws of this.ctx.getWebSockets()) {
        try { ws.send(JSON.stringify({type:'players', players:entries})); } catch { try { ws.close(); } catch {} }
      }
      return json({accepted:entries.length, records:state.records});
    }
    if (url.pathname === '/metadata' && request.method === 'POST') {
      const auth = request.headers.get('authorization') ?? '';
      if (!state.claimed || !state.uploaderHash || !auth.startsWith('Bearer ') || await hash(auth.slice(7)) !== state.uploaderHash) return fail('Unauthorized',401);
      const raw = await request.text();
      if (raw.length > 16384) return fail('Metadata too large',413);
      let metadata: Record<string,unknown>;
      try { metadata = JSON.parse(raw) as Record<string,unknown>; } catch { return fail('Invalid JSON',400); }
      if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata) || metadata.version !== 1 ||
          (metadata.replayId != null && (typeof metadata.replayId !== 'string' || !/^\d{1,15}$/.test(metadata.replayId))) ||
          (metadata.mapId != null && (typeof metadata.mapId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(metadata.mapId))) ||
          !metadata.teams || typeof metadata.teams !== 'object' || Array.isArray(metadata.teams) ||
          !metadata.settings || typeof metadata.settings !== 'object' || Array.isArray(metadata.settings)) return fail('Invalid metadata schema',400);
      const teams = Object.entries(metadata.teams as Record<string,unknown>);
      const settings = Object.entries(metadata.settings as Record<string,unknown>);
      if (teams.length > 32 || settings.length > 80 ||
          teams.some(([army,team])=> !/^(?:[1-9]|[12]\d|3[0-2])$/.test(army) || !Number.isInteger(team) || (team as number) < 0 || (team as number) > 32) ||
          settings.some(([key,value])=> key.length > 80 || !/^[A-Za-z0-9_]+$/.test(key) || typeof value !== 'string' || value.length > 180)) return fail('Invalid metadata values',400);
      const oldId = state.metadata?.replayId;
      if (oldId && metadata.replayId && oldId !== metadata.replayId) return fail('Session already belongs to another match; create a new session',409);
      state.metadata = {version:1, replayId:metadata.replayId ?? null, mapId:metadata.mapId ?? null, teams:Object.fromEntries(teams), settings:Object.fromEntries(settings)};
      await this.ctx.storage.put('session',state);
      for (const ws of this.ctx.getWebSockets()) { try { ws.send(JSON.stringify({type:'metadata', metadata:state.metadata})); } catch {} }
      return json({ok:true});
    }
    if (url.pathname === '/metadata' && request.method === 'GET') return json({metadata:state.metadata ?? null});
    if (url.pathname === '/status' && request.method === 'GET') return json({ linked: state.claimed, records: state.records, players: Object.keys(state.players).length, expiresAt: new Date(state.expiresAt).toISOString(), linkExpiresAt: new Date(state.linkExpiresAt).toISOString() });
    if (url.pathname === '/players' && request.method === 'GET') return json({ players:Object.values(state.players), records:state.records });
    if (url.pathname === '/history' && request.method === 'GET') return json({ history:state.history });
    if (url.pathname === '/stream' && request.method === 'GET') {
      if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') return fail('WebSocket upgrade required',426);
      const pair = new WebSocketPair();
      const client = pair[0], server = pair[1];
      this.ctx.acceptWebSocket(server);
      server.send(JSON.stringify({type:'snapshot', players:Object.values(state.players), history:state.history, metadata:state.metadata ?? null}));
      return new Response(null, {status:101, webSocket:client});
    }
    return fail('Not found',404);
  }
  async alarm(): Promise<void> {
    const state = await this.getState();
    if (state && Date.now() >= state.expiresAt) {
      for (const ws of this.ctx.getWebSockets()) { try { ws.close(1000,'Session expired'); } catch {} }
      await this.ctx.storage.deleteAll();
    }
  }
}

// A single Durable Object serializes code reservations across all sessions.
export class LinkRegistry extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (request.method !== 'POST') return fail('Not found',404);
    const body = await request.json() as {code?:string;id?:string;expiresAt?:number};
    if (!body.code || !/^[A-Z2-9]{6}$/.test(body.code)) return fail('Invalid code',400);
    const key = `code:${body.code}`;
    const existing = await this.ctx.storage.get<{id:string;expiresAt:number}>(key);
    if (path === '/reserve') {
      if (!body.id || !ID.test(body.id) || !body.expiresAt) return fail('Invalid reservation',400);
      if (existing && existing.expiresAt > Date.now()) return fail('Code already reserved',409);
      await this.ctx.storage.put(key,{id:body.id,expiresAt:body.expiresAt});
      return json({ok:true});
    }
    if (path === '/lookup') {
      if (!existing || existing.expiresAt <= Date.now()) return fail('Invalid or expired code',404);
      return json({id:existing.id});
    }
    if (path === '/release') {
      if (existing && existing.id === body.id) await this.ctx.storage.delete(key);
      return json({ok:true});
    }
    return fail('Not found',404);
  }
}
