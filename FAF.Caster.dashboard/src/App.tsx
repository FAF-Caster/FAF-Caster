import {useEffect,useMemo,useState} from 'react';
import {Activity,BarChart3,Radio,RefreshCcw,Shield,Users,Zap,Copy,Check,Plus} from 'lucide-react';

type Player={version:number;update:number;gameTime:number;armyId:number;name:string;type:string;faction:number;massIncome:number;massSpent:number;massStored:number;massCapacity:number;massReclaimed:number;energyIncome:number;energySpent:number;energyStored:number;energyCapacity:number;units:number;unitCap:number;kills:number;losses:number;built:number;score:number;landBuilt:number;airBuilt:number;navalBuilt:number;structuresBuilt:number;experimentalBuilt:number;cdrLost:number};
type MatchMetadata={version:number;replayId?:string|null;mapId?:string|null;teams:Record<string,number>;settings:Record<string,string>};
type Health={status:string;players:number;records:number;lastUpdateUtc:string|null;source:string|null};
type Connection='connecting'|'connected'|'disconnected';
const factions:Record<number,string>={1:'UEF',2:'Aeon',3:'Cybran',4:'Seraphim'};
const fmt=(n:number,d=0)=>Number.isFinite(n)?n.toLocaleString('en-GB',{maximumFractionDigits:d}):'—';
const pct=(n:number,max:number)=>max>0?Math.min(100,Math.max(0,n/max*100)):0;
function Meter({value,max,tone}:{value:number;max:number;tone:'mass'|'energy'}){return <div className="meter"><span className={'meter-fill '+tone} style={{width:pct(value,max)+'%'}}/></div>}
type EconomyPoint={time:number;massIncome:number;massSpent:number;energyIncome:number;energySpent:number;massStored:number;energyStored:number};
const MAX_POINTS=300;
function EconomyChart({points,resource}:{points:EconomyPoint[];resource:'mass'|'energy'}){
 const income=resource==='mass'?'massIncome':'energyIncome';const spent=resource==='mass'?'massSpent':'energySpent';
 const width=700,height=185,pad=24;
 const max=Math.max(1,...points.flatMap(p=>[p[income],p[spent]]));
 const minT=points[0]?.time??0,maxT=points[points.length-1]?.time??1;
 const coords=(key:'massIncome'|'massSpent'|'energyIncome'|'energySpent')=>points.map((p,i)=>{
  const x=pad+(maxT>minT?(p.time-minT)/(maxT-minT):i/Math.max(1,points.length-1))*(width-pad*2);
  const y=height-pad-(Math.max(0,p[key])/max)*(height-pad*2);
  return `${x.toFixed(1)},${y.toFixed(1)}`;
 }).join(' ');
 return <div className="economy-chart"><div className="chart-heading"><strong>{resource==='mass'?'Mass':'Energy'} rates <small>(raw Sync.Score values)</small></strong><span><i className="legend income"/>Income <i className="legend spent"/>Spent</span></div>
 {points.length<2?<div className="chart-empty">Waiting for live samples. Start or restart a replay while the bridge and dashboard are running.</div>:<><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${resource} income and spending over game time`} preserveAspectRatio="none"><line x1={pad} x2={width-pad} y1={height-pad} y2={height-pad} stroke="#3c5068"/><line x1={pad} x2={width-pad} y1={pad} y2={pad} stroke="#28384b" strokeDasharray="4 5"/><polyline points={coords(income)} fill="none" stroke="#40d6a4" strokeWidth="2.5" vectorEffect="non-scaling-stroke"/><polyline points={coords(spent)} fill="none" stroke="#f3bb68" strokeWidth="2.5" vectorEffect="non-scaling-stroke"/></svg><div className="chart-axis"><span>{fmt(minT,0)}s</span><span>Max {fmt(max,2)}</span><span>{fmt(maxT,0)}s</span></div></>}
 </div>
}
const comparisonColors=['#4dd5aa','#f2b66d','#78a8ff','#d48bff','#f1788e','#ffe078','#80d8e9','#b5c1d4'];
function ComparisonChart({history,players,teams,metric,mode}:{history:Record<number,EconomyPoint[]>;players:Player[];teams:Record<number,number>;metric:keyof Omit<EconomyPoint,'time'>;mode:'players'|'teams'}){
 const series=useMemo(()=>{
  const grouped=new Map<string,Player[]>();
  for(const p of players){const team=teams[p.armyId]??0;const label=mode==='teams'?team>0?`Team ${team}`:'Unassigned':p.name+' (#'+p.armyId+')';grouped.set(label,[...(grouped.get(label)??[]),p]);}
  return [...grouped.entries()].slice(0,16).map(([label,members],i)=>{
   const buckets=new Map<number,{sum:number;count:number}>();
   for(const member of members)for(const point of history[member.armyId]??[]){const second=Math.round(point.time/5)*5;const bucket=buckets.get(second)??{sum:0,count:0};bucket.sum+=Number(point[metric])||0;bucket.count++;buckets.set(second,bucket);}
   const data=[...buckets.entries()].sort(([a],[b])=>a-b).map(([time,b])=>({time,value:mode==='teams'?b.sum:b.sum/b.count}));
   return {label,color:comparisonColors[i%comparisonColors.length],data};
  });
 },[history,players,teams,metric,mode]);
 const points=series.flatMap(s=>s.data);const minT=Math.min(...points.map(p=>p.time)),maxT=Math.max(...points.map(p=>p.time));const maxV=Math.max(1,...points.map(p=>p.value));
 const w=760,h=240,pad=28;
 const coords=(data:{time:number;value:number}[])=>data.map((p,i)=>`${(pad+(maxT>minT?(p.time-minT)/(maxT-minT):i/Math.max(1,data.length-1))*(w-2*pad)).toFixed(1)},${(h-pad-Math.max(0,p.value)/maxV*(h-2*pad)).toFixed(1)}`).join(' ');
 return <div className="comparison-visual">{points.length<2?<div className="chart-empty">Waiting for history samples from the linked Companion.</div>:<><svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`${metric} comparison over replay time`} preserveAspectRatio="none"><line x1={pad} x2={w-pad} y1={h-pad} y2={h-pad} stroke="#435269"/>{series.map(s=>s.data.length>1?<polyline key={s.label} points={coords(s.data)} fill="none" stroke={s.color} strokeWidth="2.5" vectorEffect="non-scaling-stroke"/>:null)}</svg><div className="chart-axis"><span>{fmt(minT)}s</span><span>Peak {fmt(maxV,1)}</span><span>{fmt(maxT)}s</span></div></>}<div className="comparison-legend">{series.map(s=><span key={s.label}><i style={{background:s.color}}/>{s.label}</span>)}</div><p className="comparison-note">Team values are summed across available player samples, grouped into five-second buckets. Historical samples are limited to the most recent 300 per player.</p></div>;
}
function App(){
 const [metadata,setMetadata]=useState<MatchMetadata|null>(null);
 const [comparisonMetric,setComparisonMetric]=useState<'massIncome'|'massSpent'|'massStored'|'energyIncome'|'energySpent'|'energyStored'>('massIncome');
 const [comparisonMode,setComparisonMode]=useState<'players'|'teams'>('players');
 const [history,setHistory]=useState<Record<number,EconomyPoint[]>>({});const [chartArmy,setChartArmy]=useState<number|null>(null);const [players,setPlayers]=useState<Player[]>([]);const [health,setHealth]=useState<Health|null>(null);const [connection,setConnection]=useState<Connection>('connecting');const [sort,setSort]=useState<'score'|'units'|'armyId'|'massIncome'|'energyIncome'>('score');const [selected,setSelected]=useState<number|null>(null);const [lastMessage,setLastMessage]=useState<number|null>(null);
 const [sessionInput,setSessionInput]=useState(() => location.pathname.match(/^\/(?:session|overlay)\/([a-f0-9]{32})$/)?.[1] ?? '');
 const [sessionId,setSessionId]=useState(() => location.pathname.match(/^\/(?:session|overlay)\/([a-f0-9]{32})$/)?.[1] ?? '');
 const [error,setError]=useState('');
 const [creating,setCreating]=useState(false);
 const [linkCode,setLinkCode]=useState<string|null>(()=>{try{const raw=sessionStorage.getItem('fafcaster-session-code');const saved=raw?JSON.parse(raw):null;return saved?.id===location.pathname.match(/^\/session\/([a-f0-9]{32})$/)?.[1]?saved.code:null;}catch{return null;}});
 const [linkExpiry,setLinkExpiry]=useState<string|null>(()=>{try{const raw=sessionStorage.getItem('fafcaster-session-code');const saved=raw?JSON.parse(raw):null;return saved?.id===location.pathname.match(/^\/session\/([a-f0-9]{32})$/)?.[1]?saved.expiresAt:null;}catch{return null;}});
 const [linked,setLinked]=useState(false);
 const [copied,setCopied]=useState(false);const [viewerCopied,setViewerCopied]=useState(false);
 const [expiresAt,setExpiresAt]=useState<string|null>(null);
 const [now,setNow]=useState(Date.now());
 const createSession=async()=>{
  if(creating)return;setCreating(true);setError('');
  try{const response=await fetch(api('/api/sessions'),{method:'POST'});
   if(!response.ok)throw Error(`Could not create session (HTTP ${response.status})`);
   const data=await response.json() as {sessionId:string;linkingCode:string;linkExpiresAt:string};
   if(!/^[a-f0-9]{32}$/.test(data.sessionId)||!data.linkingCode)throw Error('Invalid session response');
   sessionStorage.setItem('fafcaster-session-code',JSON.stringify({id:data.sessionId,code:data.linkingCode,expiresAt:data.linkExpiresAt}));
   location.assign(`/session/${data.sessionId}`);
  }catch(e){setError(e instanceof Error?e.message:'Unable to create session');setCreating(false);}
 };
 const copyCode=async()=>{if(!linkCode)return;try{await navigator.clipboard.writeText(linkCode);setCopied(true);}catch{setError('Clipboard unavailable. Select and copy the code manually.');}};
 useEffect(()=>{const timer=window.setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer)},[]);
 const codeSeconds=linkExpiry?Math.max(0,Math.ceil((Date.parse(linkExpiry)-now)/1000)):0;

 const overlay=location.pathname.startsWith('/overlay/');
 const copyViewer=async()=>{try{await navigator.clipboard.writeText(`${location.origin}/session/${sessionId}`);setViewerCopied(true);window.setTimeout(()=>setViewerCopied(false),2500);}catch{setError('Could not copy viewer link.');}};
 const api=(path:string)=>`${import.meta.env.VITE_CASTER_API_URL || 'http://127.0.0.1:8787'}${path}`;
 const openSession=()=>{const id=sessionInput.trim().toLowerCase();if(!/^[a-f0-9]{32}$/.test(id)){setError('Enter a 32-character session ID.');return;}location.href=`/session/${id}`;};
 useEffect(()=>{
  if(!sessionId){setConnection('disconnected');return;}
  let active=true;let socket:WebSocket|null=null;let retry:number|undefined;
  const base=api(`/api/sessions/${sessionId}`);
  const append=(incoming:Player[])=>{
   setPlayers(prev=>{const next=new Map(prev.map(p=>[p.armyId,p]));for(const p of incoming)next.set(p.armyId,p);return [...next.values()];});
   setHistory(prev=>{const next={...prev};for(const p of incoming){const old=next[p.armyId]??[];if(old.length&&p.gameTime<=old[old.length-1].time)continue;next[p.armyId]=[...old,{time:p.gameTime,massIncome:p.massIncome,massSpent:p.massSpent,energyIncome:p.energyIncome,energySpent:p.energySpent,massStored:p.massStored,energyStored:p.energyStored}].slice(-MAX_POINTS);}return next;});
   setLastMessage(Date.now());
  };
  const loadStatus=async()=>{try{const response=await fetch(base+'/status');if(!response.ok)throw Error('status failed');const status=await response.json() as {linked:boolean;expiresAt:string};if(active){setLinked(status.linked);setExpiresAt(status.expiresAt);}}catch{ /* keep telemetry retry active */ }};
  const load=async()=>{
   try{const [pr,hr,mr]=await Promise.all([fetch(base+'/players'),fetch(base+'/history'),fetch(base+'/metadata')]);if(!pr.ok||!hr.ok)throw Error(`Session unavailable (HTTP ${pr.status}/${hr.status}).`);
    const playerData=await pr.json() as {players:Player[];records:number};const histData=await hr.json() as {history:Record<string,Array<{gameTime:number;massIncome:number;massSpent:number;energyIncome:number;energySpent:number;massStored:number;energyStored:number}>>};
    if(!active)return;if(mr.ok){const md=await mr.json() as {metadata:MatchMetadata|null};setMetadata(md.metadata??null);}setPlayers(playerData.players??[]);setHealth({status:'ok',players:playerData.players?.length??0,records:playerData.records??0,lastUpdateUtc:null,source:sessionId});
    const mapped:Record<number,EconomyPoint[]>={};for(const [key,points] of Object.entries(histData.history??{})){mapped[Number(key)]=(points??[]).map(p=>({time:p.gameTime,massIncome:p.massIncome,massSpent:p.massSpent,energyIncome:p.energyIncome,energySpent:p.energySpent,massStored:p.massStored,energyStored:p.energyStored}));}setHistory(mapped);setError('');
   }catch(e){if(active)setError(e instanceof Error?e.message:'Unable to load session');}
  };
  const connect=()=>{
   if(!active)return;setConnection('connecting');const wsUrl=base.replace(/^http/,'ws')+'/stream';socket=new WebSocket(wsUrl);
   socket.onopen=()=>{if(active){setConnection('connected');setError('');void load();}};
   socket.onmessage=e=>{if(!active)return;try{const data=JSON.parse(e.data);if(data.type==='snapshot'){
      if(Array.isArray(data.players))setPlayers(data.players);if(data.metadata)setMetadata(data.metadata);
      const mapped:Record<number,EconomyPoint[]>={};for(const [key,points] of Object.entries(data.history??{}) as [string,any[]][])mapped[Number(key)]=(points??[]).map(p=>({time:p.gameTime,...p}));setHistory(mapped);setLastMessage(Date.now());
    }else if(data.type==='metadata'){setMetadata(data.metadata??null);}else if(data.type==='players'&&Array.isArray(data.players))append(data.players);else if(data.type==='player'&&data.player)append([data.player]);}catch{}};
   socket.onerror=()=>socket?.close();socket.onclose=()=>{if(!active)return;setConnection('disconnected');retry=window.setTimeout(connect,2500);};
  };
  void load();void loadStatus();connect();const poll=window.setInterval(()=>{void load();void loadStatus();},3000);
  return()=>{active=false;window.clearInterval(poll);window.clearTimeout(retry);socket?.close();};
 },[sessionId]);
 const [teamAssignments,setTeamAssignments]=useState<Record<string,Record<number,number>>>(()=>{
  try{return JSON.parse(localStorage.getItem('fafcaster-team-assignments-v1')||'{}')}catch{return {}}
 });
 const replayKey=sessionId||'unknown-session';
 const teams:Record<number,number>={...Object.fromEntries(Object.entries(metadata?.teams??{}).map(([k,v])=>[Number(k),v])),...(teamAssignments[replayKey]??{})};
 const assignTeam=(armyId:number,team:number)=>setTeamAssignments(prev=>{
  const next={...prev,[replayKey]:{...(prev[replayKey]??{}),[armyId]:team}};
  try{localStorage.setItem('fafcaster-team-assignments-v1',JSON.stringify(next))}catch{}
  return next;
 });
 const teamGroups=useMemo(()=>{
  const groups=new Map<number,Player[]>();
  for(const player of [...players].sort((a,b)=>sort==='armyId'?a.armyId-b.armyId:b[sort]-a[sort])){
   const team=teams[player.armyId]??0;
   groups.set(team,[...(groups.get(team)??[]),player]);
  }
  return [...groups.entries()].sort(([a],[b])=>a===0?1:b===0?-1:a-b);
 },[players,sort,teams]);
 const chartId=chartArmy??players[0]?.armyId??null;const chartPoints=chartId===null?[]:(history[chartId]??[]);
 const focused=players.find(p=>p.armyId===selected)??null;
 const time=Math.max(0,...players.map(p=>p.gameTime||0));const mins=Math.floor(time/60);const secs=Math.floor(time%60);
 const totalUnits=players.reduce((n,p)=>n+p.units,0);const totalKills=players.reduce((n,p)=>n+p.kills,0);const telemetryFresh=lastMessage!==null&&now-lastMessage<12000;const teamCount=new Set(players.map(p=>teams[p.armyId]).filter(t=>t&&t>0)).size;
 return <div className={overlay?"app overlay-mode":"app"}><header className="topbar"><div className="brand"><div className="brand-icon"><Radio size={22}/></div><div><div className="eyebrow">LIVE MATCH INTELLIGENCE · FAF</div><h1>FAF <span>CASTER</span></h1></div></div><div className="header-right"><span className={'connection '+connection}><i/>{connection==='connected'?'CLOUD CONNECTED':connection==='connecting'?'CONNECTING':'CLOUD OFFLINE'}</span><span className="clock" title="Replay game time">{String(mins).padStart(2,'0')}:{String(secs).padStart(2,'0')}</span></div></header>
 <main>{!overlay&&sessionId&&<div className="cloud-session"><label>Cloud session ID <input aria-label="Cloud session ID" placeholder="Paste 32-character session ID" value={sessionInput} onChange={e=>setSessionInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')openSession()}}/></label><button onClick={openSession}>Open session</button>{sessionId&&<><button type="button" className="share-action" onClick={()=>void copyViewer()}>{viewerCopied?<Check size={14}/>:<Copy size={14}/>} {viewerCopied?'Copied':'Copy viewer link'}</button><a href={`/overlay/${sessionId}`} target="_blank" rel="noreferrer">OBS overlay ↗</a></>}</div>}{error&&<div className="cloud-error" role="alert">{error}</div>}{!sessionId?<div className="cloud-welcome"><div className="eyebrow">FAF CASTER / LIVE OBSERVER TELEMETRY</div><h2>Start a casting session</h2><p>Create a session on the website, enter its six-character code in the Windows Companion, and see match data update here automatically.</p><button className="create-session" disabled={creating} onClick={()=>void createSession()}><Plus size={18}/>{creating?'Creating session…':'Start casting session'}</button><div className="welcome-steps"><span>1. Create session</span><span>2. Link companion</span><span>3. Watch live stats</span></div></div>:<><section className="session-status"><div><div className="eyebrow">CASTING SESSION</div><h2>{linked?'Companion linked':linkCode&&codeSeconds>0?'Connect your companion':'Session ready'}</h2><p>{linked?'Telemetry will appear automatically as the companion uploads it.':linkCode&&codeSeconds>0?'Enter this code in the FAF Caster Windows Companion.':'The linking code is unavailable or expired. Create a new session to link a companion.'}</p></div><div className="session-actions">{!linked&&linkCode&&codeSeconds>0&&<div className="link-code"><small>COMPANION LINK CODE</small><div className="code-line"><strong>{linkCode}</strong><button onClick={()=>void copyCode()} aria-label="Copy linking code">{copied?<Check size={17}/>:<Copy size={17}/>}</button></div><small>Expires in {Math.floor(codeSeconds/60)}:{String(codeSeconds%60).padStart(2,'0')}</small></div>}<div className="session-indicators"><span className={'link-state '+(linked?'is-linked':'')}>{linked?'● Companion linked':'○ Waiting for companion'}</span><span>{health?.records??0} records received</span>{expiresAt&&<span>Session ends {new Date(expiresAt).toLocaleTimeString()}</span>}</div><button className="secondary-action" onClick={()=>void createSession()} disabled={creating}>{creating?'Creating…':'New session'}</button></div></section><div className="page-heading"><div><div className="eyebrow">MATCH CONTROL / LIVE TELEMETRY</div><h2>Match overview</h2><p>Live observer intelligence · FAF score stream</p></div><button className="refresh" onClick={()=>location.reload()}><RefreshCcw size={15}/> Refresh</button></div>
 {!overlay&&<section className="match-metadata"><div className="eyebrow">MATCH INFORMATION / LOBBY RULES</div><div className="match-metadata-head"><div><h3>{metadata?.mapId?`Map: ${metadata.mapId}`:'Map not detected yet'}</h3><p>{metadata?.replayId?`Replay #${metadata.replayId}`:'Waiting for replay ID'} · {metadata?`${Object.keys(metadata.teams).length} army team assignments`:'Waiting for match metadata'}</p></div><div className="map-preview-placeholder">MAP PREVIEW<br/><small>Available after map asset integration</small></div></div>{metadata&&<details><summary>Match settings ({Object.keys(metadata.settings).length})</summary><div className="settings-grid">{Object.entries(metadata.settings).sort(([a],[b])=>a.localeCompare(b)).map(([key,value])=><div key={key}><span>{key}</span><strong>{value}</strong></div>)}</div></details>}<p className="metadata-note">Team assignments are read from logged lobby settings when available. Unknown teams remain unassigned; manual selections override detected teams.</p></section>}<div className="telemetry-banner"><span className={'pulse-dot '+(telemetryFresh?'fresh':'')}/><strong>{telemetryFresh?'RECEIVING TELEMETRY':players.length?'WAITING FOR NEW UPDATES':'AWAITING MATCH DATA'}</strong><span>{teamCount} assigned teams · {players.length} players · {lastMessage?`Updated ${Math.floor((now-lastMessage)/1000)}s ago`:'No telemetry received yet'}</span></div><div className="stats"><div className="stat"><div className="stat-top"><span>ACTIVE ARMIES</span><Users size={17}/></div><strong>{players.length}</strong><small>Observed player slots</small></div><div className="stat"><div className="stat-top"><span>TOTAL UNITS</span><Shield size={17}/></div><strong>{fmt(totalUnits)}</strong><small>Across all armies</small></div><div className="stat"><div className="stat-top"><span>TOTAL KILLS</span><Activity size={17}/></div><strong>{fmt(totalKills)}</strong><small>Cumulative kills</small></div><div className="stat"><div className="stat-top"><span>TELEMETRY RECORDS</span><BarChart3 size={17}/></div><strong>{fmt(health?.records??0)}</strong><small>{lastMessage?'Latest data received':'Waiting for data'}</small></div></div>
 {!overlay&&sessionId&&<section className="comparison-panel"><div className="comparison-heading"><div><div className="eyebrow">MILESTONE 11B / LIVE TEAM INTELLIGENCE</div><h3>Team comparison</h3><p>Totals update automatically as telemetry arrives. Teams are detected from match logs when available. You can override them below.</p></div></div><div className="team-comparison-grid">{teamGroups.map(([team,members])=><div className="team-comparison-card" key={team}><div className="team-comparison-title">{team===0?'Unassigned':`Team ${team}`} <small>{members.length} players</small></div><div className="team-comparison-stats"><div><small>Mass income</small><strong>{fmt(members.reduce((n,p)=>n+p.massIncome,0),2)}</strong></div><div><small>Energy income</small><strong>{fmt(members.reduce((n,p)=>n+p.energyIncome,0),2)}</strong></div><div><small>Units</small><strong>{fmt(members.reduce((n,p)=>n+p.units,0))}</strong></div><div><small>Kills</small><strong>{fmt(members.reduce((n,p)=>n+p.kills,0))}</strong></div><div><small>Reclaim</small><strong>{fmt(members.reduce((n,p)=>n+p.massReclaimed,0),1)}</strong></div><div><small>Score</small><strong>{fmt(members.reduce((n,p)=>n+p.score,0))}</strong></div></div></div>)}</div><div className="comparison-heading"><div><h3>Advanced economy comparison</h3><p>Compare historical resource rates and storage across players or assigned teams.</p></div><div className="comparison-controls"><label>View<select value={comparisonMode} onChange={e=>setComparisonMode(e.target.value as 'players'|'teams')}><option value="players">Players</option><option value="teams">Teams</option></select></label><label>Metric<select value={comparisonMetric} onChange={e=>setComparisonMetric(e.target.value as typeof comparisonMetric)}><option value="massIncome">Mass income</option><option value="massSpent">Mass spent</option><option value="massStored">Mass stored</option><option value="energyIncome">Energy income</option><option value="energySpent">Energy spent</option><option value="energyStored">Energy stored</option></select></label></div></div><ComparisonChart history={history} players={players} teams={teams} metric={comparisonMetric} mode={comparisonMode}/></section>}
 <section className="live-economy"><div className="live-head"><div><div className="eyebrow">ECONOMY INTELLIGENCE / HISTORICAL TREND</div><h3>Economy analysis</h3><p>Charts load recent samples from the cloud session and continue updating live. Up to 300 samples are kept per player.</p></div><label className="sort">PLAYER <select value={chartId??''} onChange={e=>setChartArmy(Number(e.target.value))}>{players.map(p=><option key={p.armyId} value={p.armyId}>{p.name}</option>)}</select></label></div><div className="chart-grid"><EconomyChart points={chartPoints} resource="mass"/><EconomyChart points={chartPoints} resource="energy"/></div><div className="chart-foot">{chartPoints.length} samples · {chartPoints.length?`Latest game time ${fmt(chartPoints[chartPoints.length-1].time,1)}s`:'No replay history yet'} · Last 300 samples retained per army</div></section>
 <div className="section-head"><div><h3>Player command centre <span>{players.length} ARMIES</span></h3><p>Teams detected from match logs when available · manual overrides remain available</p></div><label className="sort">SORT BY <select value={sort} onChange={e=>setSort(e.target.value as typeof sort)}><option value="score">Score</option><option value="units">Unit count</option><option value="armyId">Army ID</option><option value="massIncome">Mass income</option><option value="energyIncome">Energy income</option></select></label></div>
 {players.length===0?<div className="empty">No telemetry yet. Link the companion to this session and start a FAF replay.</div>:<div className="team-sections">{teamGroups.map(([team,members])=><section className="team-section" key={team}><div className="team-heading"><div><span className="team-label">{team===0?'UNASSIGNED PLAYERS':`TEAM ${team}`}</span><h3>{team===0?'Assign players to their teams':`Team ${team}`}</h3></div><div className="team-totals">{members.length} players · {fmt(members.reduce((n,p)=>n+p.units,0))} units · {fmt(members.reduce((n,p)=>n+p.score,0))} score</div></div><div className="players">{members.map(p=><div className="team-player" key={p.armyId}><button className={'player '+(selected===p.armyId?'selected':'')} onClick={()=>setSelected(selected===p.armyId?null:p.armyId)}><div className="player-head"><div className="avatar">{p.armyId.toString().padStart(2,'0')}</div><div className="identity"><strong>{p.name}</strong><span>{factions[p.faction]??'Unknown faction'} · {p.type}</span></div><div className="score"><span>SCORE</span><strong>{fmt(p.score)}</strong></div></div><div className="player-metrics"><div><small>UNITS</small><strong>{fmt(p.units)}</strong></div><div><small>KILLS</small><strong>{fmt(p.kills)}</strong></div><div><small>LOSSES</small><strong>{fmt(p.losses)}</strong></div></div><div className="economy"><div className="resource-title"><span className="mass-dot"/> MASS <b>{fmt(p.massStored,1)} <em>/ {fmt(p.massCapacity)}</em></b></div><Meter value={p.massStored} max={p.massCapacity} tone="mass"/><div className="resource-foot"><span>IN {fmt(p.massIncome,2)}</span><span>OUT {fmt(p.massSpent,2)}</span></div><div className="resource-title energy-title"><Zap size={12}/> ENERGY <b>{fmt(p.energyStored,0)} <em>/ {fmt(p.energyCapacity)}</em></b></div><Meter value={p.energyStored} max={p.energyCapacity} tone="energy"/><div className="resource-foot"><span>IN {fmt(p.energyIncome,2)}</span><span>OUT {fmt(p.energySpent,2)}</span></div></div></button><label className="team-assign">TEAM <select aria-label={`Assign ${p.name} to team`} value={teams[p.armyId]??0} onChange={e=>assignTeam(p.armyId,Number(e.target.value))}><option value={0}>Unassigned</option>{Array.from({length:16},(_,i)=><option key={i+1} value={i+1}>Team {i+1}</option>)}</select></label></div>)}</div></section>)}</div>}
 {focused&&<div className="details"><div className="details-head"><h3>{focused.name} <span>ARMY {focused.armyId}</span></h3><button onClick={()=>setSelected(null)}>Close ×</button></div><div className="detail-grid"><div><small>Mass reclaimed (total)</small><strong>{fmt(focused.massReclaimed,1)}</strong></div><div><small>Units built (total)</small><strong>{fmt(focused.built)}</strong></div><div><small>Land built</small><strong>{fmt(focused.landBuilt)}</strong></div><div><small>Air built</small><strong>{fmt(focused.airBuilt)}</strong></div><div><small>Naval built</small><strong>{fmt(focused.navalBuilt)}</strong></div><div><small>Structures built</small><strong>{fmt(focused.structuresBuilt)}</strong></div><div><small>Experimental built</small><strong>{fmt(focused.experimentalBuilt)}</strong></div><div><small>ACUs lost</small><strong>{fmt(focused.cdrLost)}</strong></div></div><p>Category “built” counts are cumulative, not current live composition.</p></div>}
 <footer><span><i className={'footer-dot '+connection}/> FAF CASTER TELEMETRY · SCHEMA V2</span><span>GAME TIME {String(mins).padStart(2,'0')}:{String(secs).padStart(2,'0')} · UPDATE {Math.max(0,...players.map(p=>p.update||0))}</span></footer>
 </>}</main></div>}
export default App;
