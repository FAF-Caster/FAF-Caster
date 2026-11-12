import {useMemo,useState} from 'react';
import {Activity,BarChart3,ChartNoAxesCombined,ChevronDown,Clapperboard,Copy,Eye,Gamepad2,LayoutDashboard,Monitor,Radio,Search,Settings2,Shield,SlidersHorizontal,Users,Zap} from 'lucide-react';
import './local-dashboard.css';

export type CasterPlayer={armyId:number;name:string;type:string;faction:number;gameTime:number;massIncome:number;massSpent:number;massStored:number;energyIncome:number;energySpent:number;energyStored:number;units:number;kills:number;losses:number;score:number;built:number;landBuilt:number;airBuilt:number;navalBuilt:number;structuresBuilt:number;experimentalBuilt:number;massReclaimed:number};
export type CasterPoint={time:number;massIncome:number;massSpent:number;energyIncome:number;energySpent:number;massStored:number;energyStored:number};
export type CasterSession={sessionId:string|null;matchId:string|null;generation:number;status:'waiting'|'detected'|'capturing'|'idle';source:string|null;records:number;players:number};
type Props={players:CasterPlayer[];history:Record<number,CasterPoint[]>;session?:CasterSession;connected:boolean;teams:Record<number,number>;onTeam:(armyId:number,team:number)=>void;error:string};
const fmt=(n:number,d=0)=>Number.isFinite(n)?n.toLocaleString('en-GB',{maximumFractionDigits:d}):'—';
const factions:Record<number,string>={1:'UEF',2:'Aeon',3:'Cybran',4:'Seraphim'};
const factionClass:Record<number,string>={1:'uef',2:'aeon',3:'cybran',4:'sera'};
type Tab='Overview'|'Economy'|'Armies'|'Production'|'Combat'|'Analysis';
const tabs:Tab[]=['Overview','Economy','Armies','Production','Combat','Analysis'];
const tabIcons=[LayoutDashboard,ChartNoAxesCombined,Users,Clapperboard,Shield,BarChart3];
const palette=['#32e79a','#ff9b37','#60bbff','#ba90ff','#f77d96','#f4dc78'];
function Trend({title,players,history,teams,metric}:{title:string;players:CasterPlayer[];history:Record<number,CasterPoint[]>;teams:Record<number,number>;metric:'massIncome'|'energyIncome'|'units'}){
 const series=useMemo(()=>{
  const grouped=new Map<number,Map<number,number>>();
  for(const p of players){
   const team=teams[p.armyId]||0;
   const bucket=grouped.get(team)??new Map<number,number>();
   if(metric==='units'){bucket.set(Math.round(p.gameTime), (bucket.get(Math.round(p.gameTime))??0)+p.units);}
   else for(const point of history[p.armyId]??[]){
    const t=Math.round(point.time/5)*5;
    bucket.set(t,(bucket.get(t)??0)+(Number(point[metric])||0));
   }
   grouped.set(team,bucket);
  }
  return [...grouped.entries()].sort(([a],[b])=>a-b).slice(0,6).map(([team,buckets],i)=>({name:team>0?'Team '+team:'Unassigned',color:palette[i],data:[...buckets.entries()].sort(([a],[b])=>a-b).map(([t,v])=>({t,v}))}));
 },[players,history,teams,metric]);
 const all=series.flatMap(s=>s.data),min=Math.min(...all.map(p=>p.t)),max=Math.max(...all.map(p=>p.t)),peak=Math.max(1,...all.map(p=>p.v));
 const points=(data:{t:number;v:number}[])=>data.map((p,i)=>`${36+(max>min?(p.t-min)/(max-min):i/Math.max(1,data.length-1))*640},${175-Math.max(0,p.v)/peak*150}`).join(' ');
 return <section className="caster-panel trend-panel"><div className="caster-panel-head"><h3><ChartNoAxesCombined size={19}/>{title}</h3><span className="muted">Live telemetry</span></div>{all.length<2?<div className="caster-empty-chart">Waiting for historical samples</div>:<svg className="caster-trend" viewBox="0 0 710 205" preserveAspectRatio="none" role="img" aria-label={title}>{[25,75,125,175].map(y=><line key={y} x1="36" x2="680" y1={y} y2={y} stroke="#1d3a51" strokeDasharray="3 5"/>)}{series.map(s=>s.data.length>1?<polyline key={s.name} fill="none" stroke={s.color} strokeWidth="2.5" vectorEffect="non-scaling-stroke" points={points(s.data)}/>:null)}</svg>}<div className="caster-legend">{series.map(s=><span key={s.name}><i style={{background:s.color}}/>{s.name} {fmt(s.data.at(-1)?.v??0,1)}</span>)}</div></section>;
}
export default function LocalDashboard({players,history,session,connected,teams,onTeam,error}:Props){
 const [tab,setTab]=useState<Tab>('Overview'),[search,setSearch]=useState(''),[sort,setSort]=useState('team'),[selected,setSelected]=useState<number|null>(null),[copied,setCopied]=useState(false);
 const time=Math.max(0,...players.map(p=>p.gameTime||0));
 const timer=`${String(Math.floor(time/3600)).padStart(2,'0')}:${String(Math.floor(time%3600/60)).padStart(2,'0')}:${String(Math.floor(time%60)).padStart(2,'0')}`;
 const groups=useMemo(()=>{
  const map=new Map<number,CasterPlayer[]>();
  for(const p of players){const team=teams[p.armyId]||0;map.set(team,[...(map.get(team)??[]),p]);}
  return [...map.entries()].sort(([a],[b])=>a-b);
 },[players,teams]);
 const visible=useMemo(()=>players.filter(p=>p.name.toLowerCase().includes(search.toLowerCase())||String(p.armyId).includes(search)).sort((a,b)=>sort==='name'?a.name.localeCompare(b.name):sort==='units'?b.units-a.units:sort==='score'?b.score-a.score:(teams[a.armyId]||0)-(teams[b.armyId]||0)||a.armyId-b.armyId),[players,search,sort,teams]);
 const selectedPlayer=players.find(p=>p.armyId===selected);
 const teamStats=groups.map(([team,members])=>({team,members,units:members.reduce((a,p)=>a+p.units,0),mass:members.reduce((a,p)=>a+p.massIncome,0),energy:members.reduce((a,p)=>a+p.energyIncome,0),kills:members.reduce((a,p)=>a+p.kills,0),losses:members.reduce((a,p)=>a+p.losses,0)}));
 const source=session?.source?.split(/[\\/]/).pop()??'Waiting for match';
 const state=session?.status??'waiting';
 return <div className="caster-shell">
  <aside className="caster-sidebar">
   <div className="caster-sidebar-top"><div className="caster-logo"><Monitor size={23}/><strong>FAF <span>CASTER</span></strong></div><div className={'caster-live '+(state==='capturing'?'active':'')}><i/>{state==='capturing'?'LIVE OBSERVER':state==='idle'?'MATCH IDLE':state==='detected'?'MATCH DETECTED':'AWAITING MATCH'}</div><div className="caster-timer">{timer}</div></div>
   <section className="caster-map-card"><div className="caster-map-placeholder"><Gamepad2 size={38}/><strong>Match map</strong><span>Map preview available when map metadata is connected</span></div><h2>{session?.matchId?'Match #'+session.matchId:'No active match'}</h2><p>{players.length} players · {groups.filter(([team])=>team>0).length} assigned teams</p><div className="caster-rule"><span>Source</span><strong title={session?.source??''}>{source}</strong></div><div className="caster-rule"><span>Telemetry</span><strong>{fmt(session?.records??0)} records</strong></div><div className="caster-rule"><span>Connection</span><strong>{connected?'Local Bridge':'Disconnected'}</strong></div></section>
   <section className="caster-side-panel"><h3><Radio size={17}/> Session</h3><div className="caster-good">{connected?'Automatically connected':'Waiting for Bridge'}</div><small>Local Windows mode · No pairing code</small><button className="caster-copy" onClick={async()=>{try{await navigator.clipboard.writeText(location.origin+'/local/overlay');setCopied(true)}catch{setCopied(false)}}}><Copy size={14}/>{copied?'Overlay URL copied':'Copy OBS overlay URL'}</button></section>
   <section className="caster-side-panel"><h3><Users size={17}/> Teams ({groups.length})</h3>{groups.map(([team,members],i)=><div className="caster-team-chip" key={team} style={{borderLeftColor:palette[i%palette.length]}}><strong>{team?'Team '+team:'Unassigned'}</strong><span>{members.length} players</span></div>)}</section>
   <div className="caster-side-links"><details><summary>Match details <ChevronDown size={15}/></summary><p>Match ID: {session?.matchId??'Unknown'}</p><p>Status: {state}</p></details><details><summary>Game settings <ChevronDown size={15}/></summary><p>Lobby settings require match metadata.</p></details><details><summary>Events & timeline <ChevronDown size={15}/></summary><p>Event tracking is not available yet.</p></details></div>
  </aside>
  <div className="caster-workspace">
   <header className="caster-nav"><div className="caster-tabs">{tabs.map((t,i)=>{const Icon=tabIcons[i];return <button key={t} className={tab===t?'active':''} onClick={()=>setTab(t)}><Icon size={17}/>{t}</button>})}</div><div className="caster-nav-actions"><span><span className={'caster-dot '+(connected?'online':'')}/>{connected?'LOCAL':'OFFLINE'}</span><a href="/" title="Cloud sessions"><Settings2 size={19}/></a></div></header>
   <main className="caster-content">
    {error&&<div className="caster-warning">{error}</div>}
    <section className="caster-panel caster-command"><div className="caster-panel-head"><div><h2><Users size={21}/>{tab==='Overview'?'Player Command Centre':tab+' Intelligence'}</h2><p>Live player data, economy and army overview</p></div><div className="caster-tools"><label><Search size={16}/><input placeholder="Search players…" value={search} onChange={e=>setSearch(e.target.value)}/></label><select aria-label="Sort players" value={sort} onChange={e=>setSort(e.target.value)}><option value="team">Sort: Team / Player</option><option value="name">Name</option><option value="units">Units</option><option value="score">Score</option></select><SlidersHorizontal size={18}/></div></div>
    <div className="caster-table-scroll"><table className="caster-table"><thead><tr><th>#</th><th>Player</th><th>Team</th><th>Faction</th><th>Mass (inc / exp)</th><th>Energy (inc / exp)</th><th>Units</th><th>K / L</th><th>Score</th></tr></thead><tbody>{visible.map(p=><tr key={p.armyId} onClick={()=>setSelected(selected===p.armyId?null:p.armyId)} className={selected===p.armyId?'selected':''}><td>{String(p.armyId).padStart(2,'0')}</td><td className="caster-player-name"><span className="caster-square" style={{background:palette[Math.max(0,groups.findIndex(([team])=>team===(teams[p.armyId]||0)))%palette.length]}}/>{p.name}</td><td><select aria-label={'Team for '+p.name} value={teams[p.armyId]||0} onClick={e=>e.stopPropagation()} onChange={e=>onTeam(p.armyId,Number(e.target.value))}><option value={0}>—</option>{Array.from({length:16},(_,i)=><option value={i+1} key={i+1}>T{i+1}</option>)}</select></td><td><span className={'caster-faction '+(factionClass[p.faction]||'')}>{factions[p.faction]||'Unknown'}</span></td><td><span className="caster-positive">+{fmt(p.massIncome,1)}</span> / {fmt(p.massSpent,1)}<div className="caster-mini-bar"><i style={{width:Math.min(100,Math.max(0,p.massIncome)/(Math.max(1,p.massIncome,p.massSpent))*100)+'%'}}/></div></td><td><span className="caster-positive">+{fmt(p.energyIncome)}</span> / {fmt(p.energySpent)}<div className="caster-mini-bar"><i style={{width:Math.min(100,Math.max(0,p.energyIncome)/Math.max(1,p.energyIncome,p.energySpent)*100)+'%'}}/></div></td><td>{fmt(p.units)}</td><td>{fmt(p.kills)} / {fmt(p.losses)}</td><td>{fmt(p.score)}</td></tr>)}</tbody></table>{visible.length===0&&<div className="caster-table-empty">{players.length?'No matching players':'Waiting for FAF observer telemetry'}</div>}</div>
    {selectedPlayer&&<div className="caster-selection"><strong>{selectedPlayer.name}</strong><span>Reclaimed: {fmt(selectedPlayer.massReclaimed,1)}</span><span>Built: {fmt(selectedPlayer.built)}</span><span>Land: {fmt(selectedPlayer.landBuilt)}</span><span>Air: {fmt(selectedPlayer.airBuilt)}</span><span>Naval: {fmt(selectedPlayer.navalBuilt)}</span><span>Experimental: {fmt(selectedPlayer.experimentalBuilt)}</span><button onClick={()=>setSelected(null)}>Close</button></div>}</section>
    <div className="caster-charts"><Trend title="Mass Economy Trend" metric="massIncome" players={players} history={history} teams={teams}/><Trend title="Energy Economy Trend" metric="energyIncome" players={players} history={history} teams={teams}/></div>
    <div className="caster-bottom"><section className="caster-panel"><div className="caster-panel-head"><h3><Users size={18}/> Team Summary</h3></div><table className="caster-summary"><thead><tr><th>Team</th><th>Units</th><th>Mass inc.</th><th>Energy inc.</th><th>Kills</th><th>Losses</th></tr></thead><tbody>{teamStats.map((t,i)=><tr key={t.team}><td><i style={{background:palette[i%palette.length]}}/>{t.team?'Team '+t.team:'Unassigned'}</td><td>{fmt(t.units)}</td><td className="caster-positive">{fmt(t.mass,1)}</td><td>{fmt(t.energy)}</td><td>{fmt(t.kills)}</td><td>{fmt(t.losses)}</td></tr>)}</tbody></table></section>
    <section className="caster-panel caster-notes"><div className="caster-panel-head"><h3><Activity size={18}/> Match Insights</h3></div><div className="caster-insight"><Zap size={19}/><div><strong>{fmt(players.reduce((n,p)=>n+p.massIncome,0),1)} mass/s</strong><span>Combined reported income</span></div></div><div className="caster-insight"><Shield size={19}/><div><strong>{fmt(players.reduce((n,p)=>n+p.units,0))} units</strong><span>All observed armies</span></div></div><p>Commander health and live army value will appear when verified telemetry is available.</p></section>
    <section className="caster-panel caster-notes"><div className="caster-panel-head"><h3><Eye size={18}/> Broadcast Status</h3></div><div className="caster-insight"><Radio size={19}/><div><strong>{state==='capturing'?'Capturing match':state==='idle'?'Waiting for updates':'Awaiting telemetry'}</strong><span>{source}</span></div></div><a className="caster-overlay-link" href="/local/overlay" target="_blank" rel="noreferrer">Open OBS overlay</a><p>Local-only connection. Cloud pairing remains available separately.</p></section></div>
   </main>
  </div>
 </div>;
}
