var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/index.ts
import { DurableObject } from "cloudflare:workers";
var json = /* @__PURE__ */ __name((data, status = 200, extra = {}) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra } }), "json");
var fail = /* @__PURE__ */ __name((message, status) => json({ error: message }, status), "fail");
var randomHex = /* @__PURE__ */ __name((bytes = 16) => Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (n) => n.toString(16).padStart(2, "0")).join(""), "randomHex");
var code = /* @__PURE__ */ __name(() => Array.from(crypto.getRandomValues(new Uint8Array(6)), (n) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[n % 32]).join(""), "code");
var hash = /* @__PURE__ */ __name(async (value) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))), (n) => n.toString(16).padStart(2, "0")).join(""), "hash");
var ID = /^[a-f0-9]{32}$/;
var MAX_PAYLOAD = 128 * 1024;
var LINK_TTL_MS = 10 * 6e4;
var SESSION_TTL_MS = 6 * 60 * 6e4;
var src_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(request) });
    let result;
    try {
      if (url.pathname === "/api/health" && request.method === "GET") result = json({ status: "ok", service: "faf-caster-cloud" });
      else if (url.pathname === "/api/sessions" && request.method === "POST") {
        const id = randomHex();
        const registry = env.CODES.get(env.CODES.idFromName("global"));
        let linkingCode = "";
        for (let attempt = 0; attempt < 12; attempt++) {
          const candidate = code();
          const reservation = await registry.fetch(new Request("https://codes.internal/reserve", { method: "POST", body: JSON.stringify({ code: candidate, id, expiresAt: Date.now() + LINK_TTL_MS }) }));
          if (reservation.ok) {
            linkingCode = candidate;
            break;
          }
        }
        if (!linkingCode) return fail("Unable to allocate linking code", 503);
        const stub = env.SESSIONS.get(env.SESSIONS.idFromName(id));
        result = await stub.fetch(new Request(`https://session.internal/init`, { method: "POST", body: JSON.stringify({ linkingCode }) }));
        if (result.ok) {
          const body = await result.json();
          result = json({ ...body, sessionId: id, viewerPath: `/session/${id}` }, 201);
        }
      } else if (url.pathname === "/api/link" && request.method === "POST") {
        const raw = await request.text();
        if (raw.length > 1024) return fail("Invalid request", 400);
        let body;
        try {
          body = JSON.parse(raw);
        } catch {
          return fail("Invalid JSON", 400);
        }
        if (typeof body.code !== "string" || !/^[A-Z2-9]{6}$/.test(body.code.trim().toUpperCase())) return fail("Invalid code", 403);
        const registry = env.CODES.get(env.CODES.idFromName("global"));
        const lookup = await registry.fetch(new Request("https://codes.internal/lookup", { method: "POST", body: JSON.stringify({ code: body.code.trim().toUpperCase() }) }));
        if (!lookup.ok) result = fail("Invalid or expired code", 403);
        else {
          const { id } = await lookup.json();
          const stub = env.SESSIONS.get(env.SESSIONS.idFromName(id));
          const linked = await stub.fetch(new Request("https://session.internal/link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: body.code.trim().toUpperCase() }) }));
          if (linked.ok) {
            const tokenData = await linked.json();
            result = json({ ...tokenData, sessionId: id });
            await registry.fetch(new Request("https://codes.internal/release", { method: "POST", body: JSON.stringify({ code: body.code.trim().toUpperCase(), id }) }));
          } else result = linked;
        }
      } else {
        const match = url.pathname.match(/^\/api\/sessions\/([a-f0-9]{32})\/(link|telemetry|metadata|players|history|status|stream)$/);
        if (!match || !ID.test(match[1])) result = fail("Not found", 404);
        else {
          const [, id, action] = match;
          const stub = env.SESSIONS.get(env.SESSIONS.idFromName(id));
          const upstream = new URL(request.url);
          upstream.pathname = `/${action}`;
          result = await stub.fetch(new Request(upstream.toString(), request));
        }
      }
    } catch (e) {
      console.error("Request failed", e);
      result = fail("Internal error", 500);
    }
    const headers = new Headers(result.headers);
    for (const [k, v] of Object.entries(cors(request))) headers.set(k, v);
    return new Response(result.body, { status: result.status, statusText: result.statusText, headers, webSocket: result.webSocket });
  }
};
function cors(request) {
  return { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "Content-Type, Authorization" };
}
__name(cors, "cors");
var CasterSession = class extends DurableObject {
  static {
    __name(this, "CasterSession");
  }
  async getState() {
    return await this.ctx.storage.get("session") ?? null;
  }
  async fetch(request) {
    const url = new URL(request.url);
    const now = Date.now();
    if (url.pathname === "/init" && request.method === "POST") {
      if (await this.getState()) return fail("Already initialized", 409);
      const initBody = await request.json();
      const linkingCode = initBody.linkingCode;
      if (!linkingCode || !/^[A-Z2-9]{6}$/.test(linkingCode)) return fail("Invalid linking code", 400);
      const state2 = { createdAt: now, expiresAt: now + SESSION_TTL_MS, linkCodeHash: await hash(linkingCode), linkExpiresAt: now + LINK_TTL_MS, claimed: false, records: 0, players: {}, history: {} };
      await this.ctx.storage.put("session", state2);
      await this.ctx.storage.setAlarm(state2.expiresAt);
      return json({ linkingCode, linkExpiresAt: new Date(state2.linkExpiresAt).toISOString(), expiresAt: new Date(state2.expiresAt).toISOString() }, 201);
    }
    const state = await this.getState();
    if (!state || now >= state.expiresAt) return fail("Session expired or missing", 404);
    if (url.pathname === "/link" && request.method === "POST") {
      if (state.claimed || now > state.linkExpiresAt) return fail("Linking code unavailable", 410);
      const raw = await request.text();
      if (raw.length > 1024) return fail("Invalid request", 400);
      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        return fail("Invalid JSON", 400);
      }
      if (typeof body.code !== "string" || await hash(body.code.trim().toUpperCase()) !== state.linkCodeHash) return fail("Invalid code", 403);
      const token = randomHex(32);
      state.uploaderHash = await hash(token);
      state.claimed = true;
      await this.ctx.storage.put("session", state);
      return json({ uploadToken: token, expiresAt: new Date(state.expiresAt).toISOString() });
    }
    if (url.pathname === "/telemetry" && request.method === "POST") {
      const auth = request.headers.get("authorization") ?? "";
      if (!state.claimed || !state.uploaderHash || !auth.startsWith("Bearer ") || await hash(auth.slice(7)) !== state.uploaderHash) return fail("Unauthorized", 401);
      const contentLength = Number(request.headers.get("content-length") ?? "0");
      if (contentLength > MAX_PAYLOAD) return fail("Payload too large", 413);
      const raw = await request.text();
      if (raw.length > MAX_PAYLOAD) return fail("Payload too large", 413);
      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        return fail("Invalid JSON", 400);
      }
      const entries = Array.isArray(body) ? body : [body];
      if (entries.length < 1 || entries.length > 64) return fail("Expected 1\u201364 player records", 400);
      for (const item of entries) {
        if (!item || typeof item !== "object") return fail("Invalid record", 400);
        const p = item;
        if (p.version !== 2 || !Number.isInteger(p.armyId) || p.armyId < 1 || p.armyId > 32 || typeof p.gameTime !== "number" || !Number.isFinite(p.gameTime) || p.gameTime < 0 || typeof p.name !== "string" || p.name.length > 120) return fail("Invalid telemetry schema", 400);
      }
      for (const item of entries) {
        const p = item;
        const key = String(p.armyId);
        state.players[key] = p;
        const history = state.history[key] ?? [];
        const last = history[history.length - 1];
        if (!last || p.gameTime > last.gameTime) {
          history.push({ gameTime: p.gameTime, massIncome: p.massIncome, massSpent: p.massSpent, energyIncome: p.energyIncome, energySpent: p.energySpent, massStored: p.massStored, energyStored: p.energyStored });
          state.history[key] = history.slice(-300);
        }
        state.records++;
      }
      await this.ctx.storage.put("session", state);
      for (const ws of this.ctx.getWebSockets()) {
        try {
          ws.send(JSON.stringify({ type: "players", players: entries }));
        } catch {
          try {
            ws.close();
          } catch {
          }
        }
      }
      return json({ accepted: entries.length, records: state.records });
    }
    if (url.pathname === "/metadata" && request.method === "POST") {
      const auth = request.headers.get("authorization") ?? "";
      if (!state.claimed || !state.uploaderHash || !auth.startsWith("Bearer ") || await hash(auth.slice(7)) !== state.uploaderHash) return fail("Unauthorized", 401);
      const raw = await request.text();
      if (raw.length > 16384) return fail("Metadata too large", 413);
      let metadata;
      try {
        metadata = JSON.parse(raw);
      } catch {
        return fail("Invalid JSON", 400);
      }
      if (!metadata || typeof metadata !== "object" || Array.isArray(metadata) || metadata.version !== 1 || metadata.replayId != null && (typeof metadata.replayId !== "string" || !/^\d{1,15}$/.test(metadata.replayId)) || metadata.mapId != null && (typeof metadata.mapId !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(metadata.mapId)) || !metadata.teams || typeof metadata.teams !== "object" || Array.isArray(metadata.teams) || !metadata.settings || typeof metadata.settings !== "object" || Array.isArray(metadata.settings)) return fail("Invalid metadata schema", 400);
      const teams = Object.entries(metadata.teams);
      const settings = Object.entries(metadata.settings);
      if (teams.length > 32 || settings.length > 80 || teams.some(([army, team]) => !/^(?:[1-9]|[12]\d|3[0-2])$/.test(army) || !Number.isInteger(team) || team < 0 || team > 32) || settings.some(([key, value]) => key.length > 80 || !/^[A-Za-z0-9_]+$/.test(key) || typeof value !== "string" || value.length > 180)) return fail("Invalid metadata values", 400);
      const oldId = state.metadata?.replayId;
      if (oldId && metadata.replayId && oldId !== metadata.replayId) return fail("Session already belongs to another match; create a new session", 409);
      state.metadata = { version: 1, replayId: metadata.replayId ?? null, mapId: metadata.mapId ?? null, teams: Object.fromEntries(teams), settings: Object.fromEntries(settings) };
      await this.ctx.storage.put("session", state);
      for (const ws of this.ctx.getWebSockets()) {
        try {
          ws.send(JSON.stringify({ type: "metadata", metadata: state.metadata }));
        } catch {
        }
      }
      return json({ ok: true });
    }
    if (url.pathname === "/metadata" && request.method === "GET") return json({ metadata: state.metadata ?? null });
    if (url.pathname === "/status" && request.method === "GET") return json({ linked: state.claimed, records: state.records, players: Object.keys(state.players).length, expiresAt: new Date(state.expiresAt).toISOString(), linkExpiresAt: new Date(state.linkExpiresAt).toISOString() });
    if (url.pathname === "/players" && request.method === "GET") return json({ players: Object.values(state.players), records: state.records });
    if (url.pathname === "/history" && request.method === "GET") return json({ history: state.history });
    if (url.pathname === "/stream" && request.method === "GET") {
      if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") return fail("WebSocket upgrade required", 426);
      const pair = new WebSocketPair();
      const client = pair[0], server = pair[1];
      this.ctx.acceptWebSocket(server);
      server.send(JSON.stringify({ type: "snapshot", players: Object.values(state.players), history: state.history, metadata: state.metadata ?? null }));
      return new Response(null, { status: 101, webSocket: client });
    }
    return fail("Not found", 404);
  }
  async alarm() {
    const state = await this.getState();
    if (state && Date.now() >= state.expiresAt) {
      for (const ws of this.ctx.getWebSockets()) {
        try {
          ws.close(1e3, "Session expired");
        } catch {
        }
      }
      await this.ctx.storage.deleteAll();
    }
  }
};
var LinkRegistry = class extends DurableObject {
  static {
    __name(this, "LinkRegistry");
  }
  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (request.method !== "POST") return fail("Not found", 404);
    const body = await request.json();
    if (!body.code || !/^[A-Z2-9]{6}$/.test(body.code)) return fail("Invalid code", 400);
    const key = `code:${body.code}`;
    const existing = await this.ctx.storage.get(key);
    if (path === "/reserve") {
      if (!body.id || !ID.test(body.id) || !body.expiresAt) return fail("Invalid reservation", 400);
      if (existing && existing.expiresAt > Date.now()) return fail("Code already reserved", 409);
      await this.ctx.storage.put(key, { id: body.id, expiresAt: body.expiresAt });
      return json({ ok: true });
    }
    if (path === "/lookup") {
      if (!existing || existing.expiresAt <= Date.now()) return fail("Invalid or expired code", 404);
      return json({ id: existing.id });
    }
    if (path === "/release") {
      if (existing && existing.id === body.id) await this.ctx.storage.delete(key);
      return json({ ok: true });
    }
    return fail("Not found", 404);
  }
};

// node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    const body = JSON.stringify(error);
    const headers = {
      "Content-Type": "application/json",
      "MF-Experimental-Error-Stack": "true"
    };
    const encoded = encodeURIComponent(body);
    if (encoded.length <= 8192) {
      headers["MF-Experimental-Error-Stack-Payload"] = encoded;
    }
    return new Response(body, { status: 500, headers });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-nxOq0P/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = src_default;

// node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-nxOq0P/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  CasterSession,
  LinkRegistry,
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
