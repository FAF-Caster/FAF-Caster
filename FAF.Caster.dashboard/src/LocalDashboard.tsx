import {Fragment,useMemo,useState} from 'react';
import {Activity,BarChart3,ChartNoAxesCombined,ChevronDown,Clapperboard,Copy,Eye,Gamepad2,LayoutDashboard,Monitor,Radio,Search,Settings2,Shield,SlidersHorizontal,Users,Zap} from 'lucide-react';
import './local-dashboard.css';

export type CasterPlayer={color?:string;armyColor?:string;armyId:number;name:string;type:string;faction:number;gameTime:number;massIncome:number;massSpent:number;massStored:number;massCapacity?:number;massStorageMax?:number;massStorageCapacity?:number;energyIncome:number;energySpent:number;energyStored:number;energyCapacity?:number;energyStorageMax?:number;energyStorageCapacity?:number;units:number;kills:number;losses:number;score:number;built:number;landBuilt:number;airBuilt:number;navalBuilt:number;structuresBuilt:number;experimentalBuilt:number;massReclaimed:number};
export type CasterPoint={time:number;massIncome:number;massSpent:number;energyIncome:number;energySpent:number;massStored:number;energyStored:number};
export type CasterSession={sessionId:string|null;matchId:string|null;generation:number;status:'waiting'|'detected'|'capturing'|'idle';source:string|null;records:number;players:number};
type MatchInfo={mapId?:string|null;replayId?:string|null;settings:Record<string,string>;teams:Record<string,number>};
type Props={players:CasterPlayer[];history:Record<number,CasterPoint[]>;session?:CasterSession;metadata?:MatchInfo|null;connected:boolean;teams:Record<number,number>;error:string};
const fmt=(n:number,d=0)=>Number.isFinite(n)?n.toLocaleString('en-GB',{maximumFractionDigits:d}):'—';
function ResourceStorage({kind,stored,capacity,comparisonMax,income,spent}:{kind:'mass'|'energy';stored:number;capacity?:number;comparisonMax:number;income:number;spent:number}){
 const max=typeof capacity==='number'&&Number.isFinite(capacity)&&capacity>0?capacity:null;
 // FAF currently reports stored resources but not maximum capacity. In that case,
 // compare against the highest observed stored value, never pretend it is capacity.
 const scale=max??Math.max(1,comparisonMax);
 const percent=Math.max(0,Math.min(100,stored/scale*100));
 const label=max===null?'Relative to highest observed '+kind+' storage ('+fmt(scale)+'); actual capacity not reported':fmt(stored)+' of '+fmt(max)+' stored';
 return <div className={'caster-storage caster-storage-'+kind} title={label}>
  <div className="caster-storage-label"><strong>{fmt(stored,kind==='mass'?1:0)}{max===null?' '+(kind==='mass'?'Mass':'Energy'):' / '+fmt(max)}</strong><span>(+{fmt(income,kind==='mass'?1:0)} / {fmt(spent,kind==='mass'?1:0)})</span></div>
  <div className={'caster-storage-track '+(max===null?'relative-storage':'')} role="progressbar" aria-label={kind==='mass'?'Mass storage relative to observed peak':'Energy storage relative to observed peak'} aria-valuemin={0} aria-valuemax={scale} aria-valuenow={Math.max(0,stored)}><i style={{width:percent+'%'}}/></div>
 </div>;
}
const factions:Record<number,string>={1:'UEF',2:'Aeon',3:'Cybran',4:'Seraphim'};
// Confirmed in FAF's LaunchFAInstances.ps1; other maps retain their IDs until a trusted resolver is available.
const knownMapNames:Record<string,string>={scmp_009:"Seton's Clutch"};
const factionClass:Record<number,string>={1:'uef',2:'aeon',3:'cybran',4:'sera'};
type Tab='Overview'|'Economy'|'Armies'|'Production'|'Combat'|'Analysis';
const tabs:Tab[]=['Overview','Economy','Armies','Production','Combat','Analysis'];
const tabIcons=[LayoutDashboard,ChartNoAxesCombined,Users,Clapperboard,Shield,BarChart3];
// Only use an explicitly reported FAF army colour. Never infer one from army/team order.
function playerColor(p:CasterPlayer):string|undefined{
 const raw=p.armyColor??p.color;
 if(typeof raw!=='string')return undefined;
 const value=raw.trim();
 if(/^#[0-9a-f]{6}$/i.test(value))return value;
 if(/^[0-9a-f]{6}$/i.test(value))return '#'+value;
 if(/^#[0-9a-f]{8}$/i.test(value))return '#'+value.slice(3); // FAF #AARRGGBB
 if(/^[0-9a-f]{8}$/i.test(value))return '#'+value.slice(2); // FAF AARRGGBB
 return undefined;
}
const palette=['#32e79a','#ff9b37','#60bbff','#ba90ff','#f77d96','#f4dc78'];
const massPalette=['#32e79a','#169f6a','#a1f5a9','#54cfa6','#0c8063','#c5f6ce'];
const energyPalette=['#ffb547','#e78921','#ffe08a','#f59e39','#ca6d13','#fff0b0'];
function Trend({title,players,history,teams,metric}:{title:string;players:CasterPlayer[];history:Record<number,CasterPoint[]>;teams:Record<number,number>;metric:'massIncome'|'energyIncome'|'units'}){
 const series=useMemo(()=>{
  // Keep one latest observation per player in each five-second bucket before summing teams.
  const grouped=new Map<number,Map<number,number>>();
  for(const p of players){
   const team=teams[p.armyId]??0;
   const buckets=grouped.get(team)??new Map<number,number>();
   if(metric==='units'){
    const t=Math.round(p.gameTime/5)*5;
    buckets.set(t,(buckets.get(t)??0)+p.units);
   }else{
    const latest=new Map<number,CasterPoint>();
    for(const point of history[p.armyId]??[]){
     if(!Number.isFinite(point.time))continue;
     const t=Math.round(point.time/5)*5;
     if(!latest.has(t)||point.time>=latest.get(t)!.time)latest.set(t,point);
    }
    for(const [t,point] of latest)buckets.set(t,(buckets.get(t)??0)+(Number(point[metric])||0));
   }
   grouped.set(team,buckets);
  }
  const positiveTeams=[...grouped.keys()].filter(t=>t>0).sort((a,b)=>a-b);
  const labels=new Map(positiveTeams.map((t,i)=>[t,i+1]));
  return [...grouped.entries()].sort(([a],[b])=>a===0?1:b===0?-1:a-b).slice(0,6).map(([team,buckets],i)=>({team,name:team>0?'Team '+labels.get(team):'Unknown',color:(metric==='massIncome'?massPalette:metric==='energyIncome'?energyPalette:palette)[i],data:[...buckets.entries()].sort(([a],[b])=>a-b).map(([t,v])=>({t,v}))}));
 },[players,history,teams,metric]);
 const resource=metric==='massIncome'?'mass':metric==='energyIncome'?'energy':null;
 const all=series.flatMap(s=>s.data),min=Math.min(...all.map(p=>p.t)),max=Math.max(...all.map(p=>p.t)),peak=Math.max(1,...all.map(p=>p.v));
 const points=(data:{t:number;v:number}[])=>data.map((p,i)=>`${36+(max>min?(p.t-min)/(max-min):i/Math.max(1,data.length-1))*640},${175-Math.max(0,p.v)/peak*150}`).join(' ');
 return <section className={'caster-panel trend-panel '+(resource?'caster-resource-'+resource:'')}><div className="caster-panel-head"><h3><ChartNoAxesCombined size={19}/>{title}</h3><span className="muted">Live telemetry</span></div>{all.length<2?<div className="caster-empty-chart">Waiting for historical samples</div>:<svg className="caster-trend" viewBox="0 0 710 205" preserveAspectRatio="none" role="img" aria-label={title}>{[25,75,125,175].map(y=><line key={y} x1="36" x2="680" y1={y} y2={y} stroke="#1d3a51" strokeDasharray="3 5"/>)}{series.map(s=>s.data.length>1?<polyline key={s.name} fill="none" stroke={s.color} strokeWidth="2.5" vectorEffect="non-scaling-stroke" points={points(s.data)}/>:null)}</svg>}<div className="caster-legend">{series.map(s=><span key={s.name}><i style={{background:s.color}}/>{s.name} · {metric==='units'?'Units '+fmt(s.data.at(-1)?.v??0):'Income '+fmt(s.data.at(-1)?.v??0,1)+'/s'}{resource?' · Stored '+fmt(players.filter(p=>(teams[p.armyId]??0)===s.team).reduce((n,p)=>n+(resource==='mass'?p.massStored:p.energyStored),0)):''}</span>)}</div></section>;
}
export default function LocalDashboard({players,history,session,metadata,connected,teams,error}:Props){
 const [tab,setTab]=useState<Tab>('Overview'),[search,setSearch]=useState(''),[sort,setSort]=useState('team'),[selected,setSelected]=useState<number|null>(null),[copied,setCopied]=useState(false);
 const time=Math.max(0,...players.map(p=>p.gameTime||0));
 const timer=`${String(Math.floor(time/3600)).padStart(2,'0')}:${String(Math.floor(time%3600/60)).padStart(2,'0')}:${String(Math.floor(time%60)).padStart(2,'0')}`;
 const groups=useMemo(()=>{
  const map=new Map<number,CasterPlayer[]>();
  for(const p of players){const team=teams[p.armyId]||0;map.set(team,[...(map.get(team)??[]),p]);}
  return [...map.entries()].sort(([a],[b])=>a-b);
 },[players,teams]);
 const displayTeams=useMemo(()=>new Map(groups.filter(([team])=>team>0).map(([team],i)=>[team,i+1])),[groups]);
 const displayTeam=(team:number)=>team>0?'Team '+(displayTeams.get(team)??team):'Unknown';
 const visible=useMemo(()=>players.filter(p=>p.name.toLowerCase().includes(search.toLowerCase())||String(p.armyId).includes(search)).sort((a,b)=>sort==='name'?a.name.localeCompare(b.name):sort==='units'?b.units-a.units:sort==='score'?b.score-a.score:(teams[a.armyId]||0)-(teams[b.armyId]||0)||a.armyId-b.armyId),[players,search,sort,teams]);
 const observedStoragePeaks=useMemo(()=>{
  const peaks={mass:1,energy:1};
  for(const p of players){peaks.mass=Math.max(peaks.mass,p.massStored||0);peaks.energy=Math.max(peaks.energy,p.energyStored||0);}
  for(const points of Object.values(history))for(const point of points){peaks.mass=Math.max(peaks.mass,point.massStored||0);peaks.energy=Math.max(peaks.energy,point.energyStored||0);}
  return peaks;
 },[players,history]);
 const tableGroups=useMemo(()=>{
  const grouped=new Map<number,CasterPlayer[]>();
  for(const p of visible){const team=teams[p.armyId]||0;grouped.set(team,[...(grouped.get(team)??[]),p]);}
  return [...grouped.entries()].sort(([a],[b])=>a===0?1:b===0?-1:a-b);
 },[visible,teams]);
 const selectedPlayer=players.find(p=>p.armyId===selected);
 const totals={mass:players.reduce((n,p)=>n+p.massIncome,0),energy:players.reduce((n,p)=>n+p.energyIncome,0),units:players.reduce((n,p)=>n+p.units,0),kills:players.reduce((n,p)=>n+p.kills,0),losses:players.reduce((n,p)=>n+p.losses,0),built:players.reduce((n,p)=>n+p.built,0),reclaim:players.reduce((n,p)=>n+p.massReclaimed,0)};
 const tabDescription:Record<Tab,string>={Overview:'Live player data, economy and army overview',Economy:'Resource income, spending, storage and reclaim',Armies:'Army strength, unit counts and construction',Production:'Cumulative production reported by each army',Combat:'Kills, losses and combat efficiency',Analysis:'Team comparisons and historical performance'};
 const teamStats=groups.map(([team,members])=>({team,members,units:members.reduce((a,p)=>a+p.units,0),mass:members.reduce((a,p)=>a+p.massIncome,0),massStored:members.reduce((a,p)=>a+p.massStored,0),energy:members.reduce((a,p)=>a+p.energyIncome,0),energyStored:members.reduce((a,p)=>a+p.energyStored,0),kills:members.reduce((a,p)=>a+p.kills,0),losses:members.reduce((a,p)=>a+p.losses,0)}));
 const settingLabels:Record<string,string>={Victory:'Victory condition',UnitCap:'Unit cap',FogOfWar:'Fog of war',TeamSpawn:'Team spawn',TeamLock:'Team lock',CheatsEnabled:'Cheats enabled',GameSpeed:'Game speed',AllowObservers:'Observers allowed',NoRushOption:'No rush',Share:'Unit sharing',Slots:'Lobby slots',AutoTeams:'Automatic teams'};
 const importantSettings=['Victory','UnitCap','FogOfWar','TeamSpawn','TeamLock','CheatsEnabled','GameSpeed','AllowObservers','NoRushOption','Share','Slots','AutoTeams'];
 const readableSetting=(key:string,value:string)=>key==='Victory'&&value==='demoralization'?'Assassination':value==='true'?'Yes':value==='false'?'No':value.replaceAll('_',' ');
 const source=session?.source?.split(/[\\/]/).pop()??'Waiting for match';
 const state=session?.status??'waiting';
 return <div className="caster-shell">
  <aside className="caster-sidebar">
   <div className="caster-sidebar-top"><div className="caster-logo"><Monitor size={23}/><strong>FAF <span>CASTER</span></strong></div><div className={'caster-live '+(state==='capturing'?'active':'')}><i/>{state==='capturing'?'LIVE OBSERVER':state==='idle'?'MATCH IDLE':state==='detected'?'MATCH DETECTED':'AWAITING MATCH'}</div><div className="caster-timer">{timer}</div></div>
   <section className="caster-map-card"><div className="caster-map-placeholder"><Gamepad2 size={38}/><strong>Match map</strong><span>Map preview available when map metadata is connected</span></div><h2>{metadata?.mapId?knownMapNames[metadata.mapId.toLowerCase()]??metadata.mapId.replaceAll('_',' '):session?.matchId?'Match #'+session.matchId:'No active match'}</h2><p>{players.length} players · {groups.filter(([team])=>team>0).length} assigned teams</p><div className="caster-rule"><span>Source</span><strong title={session?.source??''}>{source}</strong></div><div className="caster-rule"><span>Telemetry</span><strong>{fmt(session?.records??0)} records</strong></div><div className="caster-rule"><span>Connection</span><strong>{connected?'Local Bridge':'Disconnected'}</strong></div></section>
   <section className="caster-side-panel"><h3><Radio size={17}/> Session</h3><div className="caster-good">{connected?'Automatically connected':'Waiting for Bridge'}</div><small>Local Windows mode · No pairing code</small><button className="caster-copy" onClick={async()=>{try{await navigator.clipboard.writeText(location.origin+'/local/overlay');setCopied(true)}catch{setCopied(false)}}}><Copy size={14}/>{copied?'Overlay URL copied':'Copy OBS overlay URL'}</button></section>
   <section className="caster-side-panel"><h3><Users size={17}/> Teams ({groups.length})</h3>{groups.map(([team,members],i)=><div className="caster-team-chip" key={team} style={{borderLeftColor:palette[i%palette.length]}}><strong>{displayTeam(team)}</strong><span>{members.length} players</span></div>)}</section>
   <div className="caster-side-links"><details><summary>Match details <ChevronDown size={15}/></summary><p>Match ID: {metadata?.replayId??session?.matchId??'Unknown'}</p><p>Map: {metadata?.mapId??'Not detected'}</p><p>Status: {state}</p></details><details><summary>Game settings <ChevronDown size={15}/></summary>{Object.entries(metadata?.settings??{}).length?<><div className="caster-settings-list">{importantSettings.filter(key=>metadata?.settings?.[key]!==undefined).map(key=><div className="caster-setting-row" key={key}><span>{settingLabels[key]??key}</span><strong>{readableSetting(key,metadata!.settings[key])}</strong></div>)}</div><details className="caster-extra-settings"><summary>All detected settings ({Object.keys(metadata?.settings??{}).length})</summary>{Object.entries(metadata?.settings??{}).filter(([key])=>!importantSettings.includes(key)).map(([key,value])=><p key={key}><strong>{key}:</strong> {value}</p>)}</details></>:<p>No lobby settings detected in this log.</p>}</details><details><summary>Events & timeline <ChevronDown size={15}/></summary><p>Event tracking is not available yet.</p></details></div>
  </aside>
  <div className="caster-workspace">
   <header className="caster-nav"><div className="caster-tabs">{tabs.map((t,i)=>{const Icon=tabIcons[i];return <button key={t} className={tab===t?'active':''} onClick={()=>setTab(t)}><Icon size={17}/>{t}</button>})}</div><div className="caster-nav-actions"><span><span className={'caster-dot '+(connected?'online':'')}/>{connected?'LOCAL':'OFFLINE'}</span><a href="/" title="Cloud sessions"><Settings2 size={19}/></a></div></header>
   <main className="caster-content">
    {error&&<div className="caster-warning">{error}</div>}
    <section className="caster-panel caster-command"><div className="caster-panel-head"><div><h2><Users size={21}/>{tab==='Overview'?'Player Command Centre':tab+' Intelligence'}</h2><p>{tabDescription[tab]}</p></div><div className="caster-tools"><label><Search size={16}/><input placeholder="Search players…" value={search} onChange={e=>setSearch(e.target.value)}/></label><select aria-label="Sort players" value={sort} onChange={e=>setSort(e.target.value)}><option value="team">Sort: Team / Player</option><option value="name">Name</option><option value="units">Units</option><option value="score">Score</option></select><SlidersHorizontal size={18}/></div></div>
    <div className="caster-table-scroll"><table className={"caster-table "+((tab==="Overview"||tab==="Economy"||tab==="Analysis")?"caster-table-economy":"")}><thead><tr><th>#</th><th>Player</th><th>Faction</th>{tab==='Production'?<><th>Built</th><th>Land</th><th>Air</th><th>Naval</th><th>Structures</th><th>Experimental</th></>:tab==='Combat'?<><th>Kills</th><th>Losses</th><th>K / L</th><th>Score</th><th>Units</th><th>Mass reclaimed</th></>:tab==='Armies'?<><th>Units</th><th>Land built</th><th>Air built</th><th>Naval built</th><th>Experimental built</th><th>Score</th></>:<><th>Mass storage (inc / exp)</th><th>Energy storage (inc / exp)</th><th>Units</th><th>K / L</th><th>Score</th></>}</tr></thead><tbody>{tableGroups.map(([team,members],groupIndex)=><Fragment key={team}><tr className="caster-team-divider"><th colSpan={tab==='Overview'||tab==='Economy'||tab==='Analysis'?8:9} scope="rowgroup"><span className="caster-team-divider-mark" style={{background:team===0?'#64748b':palette[groupIndex%palette.length]}}/><strong>{displayTeam(team)}</strong><span>{members.length} {members.length===1?'player':'players'}</span></th></tr>{members.map(p=><tr key={p.armyId} onClick={()=>setSelected(selected===p.armyId?null:p.armyId)} className={selected===p.armyId?'selected':''}><td>{String(p.armyId).padStart(2,'0')}</td><td className="caster-player-name"><span className="caster-square" style={{background:playerColor(p)??'#64748b'}}/>{p.name}</td><td><span className={'caster-faction-icon '+(factionClass[p.faction]||'')} title={factions[p.faction]||'Unknown faction'} aria-label={factions[p.faction]||'Unknown faction'}>{({1:'✦',2:'◈',3:'⬡',4:'✧'} as Record<number,string>)[p.faction]||'?'}</span></td>{tab==='Production'?<><td>{fmt(p.built)}</td><td>{fmt(p.landBuilt)}</td><td>{fmt(p.airBuilt)}</td><td>{fmt(p.navalBuilt)}</td><td>{fmt(p.structuresBuilt)}</td><td>{fmt(p.experimentalBuilt)}</td></>:tab==='Combat'?<><td>{fmt(p.kills)}</td><td>{fmt(p.losses)}</td><td>{fmt(p.kills/Math.max(1,p.losses),2)}</td><td>{fmt(p.score)}</td><td>{fmt(p.units)}</td><td>{fmt(p.massReclaimed,1)}</td></>:tab==='Armies'?<><td>{fmt(p.units)}</td><td>{fmt(p.landBuilt)}</td><td>{fmt(p.airBuilt)}</td><td>{fmt(p.navalBuilt)}</td><td>{fmt(p.experimentalBuilt)}</td><td>{fmt(p.score)}</td></>:<><td><ResourceStorage kind="mass" stored={p.massStored} capacity={p.massCapacity??p.massStorageMax??p.massStorageCapacity} comparisonMax={observedStoragePeaks.mass} income={p.massIncome} spent={p.massSpent}/></td><td><ResourceStorage kind="energy" stored={p.energyStored} capacity={p.energyCapacity??p.energyStorageMax??p.energyStorageCapacity} comparisonMax={observedStoragePeaks.energy} income={p.energyIncome} spent={p.energySpent}/></td><td>{fmt(p.units)}</td><td>{fmt(p.kills)} / {fmt(p.losses)}</td><td>{fmt(p.score)}</td></>}</tr>)}</Fragment>)}</tbody></table>{visible.length===0&&<div className="caster-table-empty">{players.length?'No matching players':'Waiting for FAF observer telemetry'}</div>}</div>
    {selectedPlayer&&<div className="caster-selection"><strong>{selectedPlayer.name}</strong><span>Reclaimed: {fmt(selectedPlayer.massReclaimed,1)}</span><span>Built: {fmt(selectedPlayer.built)}</span><span>Land: {fmt(selectedPlayer.landBuilt)}</span><span>Air: {fmt(selectedPlayer.airBuilt)}</span><span>Naval: {fmt(selectedPlayer.navalBuilt)}</span><span>Experimental: {fmt(selectedPlayer.experimentalBuilt)}</span><button onClick={()=>setSelected(null)}>Close</button></div>}</section>
    {tab!=='Overview'&&<section className="caster-tab-focus caster-panel"><div className="caster-panel-head"><h3><Activity size={18}/>{tab} dashboard</h3></div><div className="caster-focus-grid">{(tab==='Economy'?[['Mass income',fmt(totals.mass,1)+'/s'],['Energy income',fmt(totals.energy,1)+'/s'],['Total reclaimed',fmt(totals.reclaim,1)],['Mass spending',fmt(players.reduce((n,p)=>n+p.massSpent,0),1)+'/s']]:tab==='Armies'?[['Units in play',fmt(totals.units)],['Armies observed',fmt(players.length)],['Land built',fmt(players.reduce((n,p)=>n+p.landBuilt,0))],['Air built',fmt(players.reduce((n,p)=>n+p.airBuilt,0))]]:tab==='Production'?[['Total units built',fmt(totals.built)],['Land built',fmt(players.reduce((n,p)=>n+p.landBuilt,0))],['Naval built',fmt(players.reduce((n,p)=>n+p.navalBuilt,0))],['Experimentals built',fmt(players.reduce((n,p)=>n+p.experimentalBuilt,0))]]:tab==='Combat'?[['Kills',fmt(totals.kills)],['Losses',fmt(totals.losses)],['Kill / loss ratio',fmt(totals.kills/Math.max(1,totals.losses),2)],['Armies observed',fmt(players.length)]]:[['Assigned teams',fmt(groups.filter(([t])=>t>0).length)],['Total units',fmt(totals.units)],['Combined mass income',fmt(totals.mass,1)],['Combined energy income',fmt(totals.energy,1)]]).map(([label,value])=><div className="caster-focus-stat" key={label}><small>{label}</small><strong>{value}</strong></div>)}</div><p className="caster-focus-note">Metrics shown are derived from available FAF Caster telemetry; production counts are cumulative, not current build rates.</p></section>}
    {tab==='Analysis'&&<section className="caster-panel caster-comparison"><div className="caster-panel-head"><h3><BarChart3 size={18}/> Team comparison</h3><span className="muted">Current observed values</span></div>{teamStats.length===0?<p className="caster-focus-note">Waiting for team telemetry.</p>:<div className="caster-comparison-grid">{([['Mass income','mass','/s'],['Mass stored','massStored',''],['Energy income','energy','/s'],['Energy stored','energyStored',''],['Units in play','units',''],['Kills','kills','']] as const).map(([label,key,suffix])=>{const max=Math.max(1,...teamStats.map(t=>t[key]));return <div className={'caster-comparison-metric '+(key.startsWith('mass')?'caster-resource-mass':key.startsWith('energy')?'caster-resource-energy':'')} key={key}><h4>{label}</h4>{teamStats.map((t,i)=><div className="caster-comparison-row" key={t.team}><span>{displayTeam(t.team)}</span><div className="caster-comparison-track"><i style={{width:Math.max(0,Math.min(100,t[key]/max*100))+'%',background:key.startsWith('mass')?massPalette[i%massPalette.length]:key.startsWith('energy')?energyPalette[i%energyPalette.length]:palette[i%palette.length]}}/></div><strong>{fmt(t[key],key==='mass'?1:0)}{suffix}</strong></div>)}</div>})}</div>}</section>}
    {(tab==='Overview'||tab==='Economy'||tab==='Analysis')&&<div className="caster-charts"><Trend title="Mass Economy Trend" metric="massIncome" players={players} history={history} teams={teams}/><Trend title="Energy Economy Trend" metric="energyIncome" players={players} history={history} teams={teams}/></div>}
    <div className="caster-bottom"><section className="caster-panel"><div className="caster-panel-head"><h3><Users size={18}/> Team Summary</h3></div><table className="caster-summary"><thead><tr><th>Team</th><th>Units</th><th>Mass inc.</th><th>Energy inc.</th><th>Kills</th><th>Losses</th></tr></thead><tbody>{teamStats.map((t,i)=><tr key={t.team}><td><i style={{background:palette[i%palette.length]}}/>{displayTeam(t.team)}</td><td>{fmt(t.units)}</td><td className="caster-positive">{fmt(t.mass,1)}</td><td>{fmt(t.energy)}</td><td>{fmt(t.kills)}</td><td>{fmt(t.losses)}</td></tr>)}</tbody></table></section>
    <section className="caster-panel caster-notes"><div className="caster-panel-head"><h3><Activity size={18}/> Match Insights</h3></div><div className="caster-insight"><Zap size={19}/><div><strong>{fmt(players.reduce((n,p)=>n+p.massIncome,0),1)} mass/s</strong><span>Combined reported income</span></div></div><div className="caster-insight"><Shield size={19}/><div><strong>{fmt(players.reduce((n,p)=>n+p.units,0))} units</strong><span>All observed armies</span></div></div><p>Commander health and live army value will appear when verified telemetry is available.</p></section>
    <section className="caster-panel caster-notes"><div className="caster-panel-head"><h3><Eye size={18}/> Broadcast Status</h3></div><div className="caster-insight"><Radio size={19}/><div><strong>{state==='capturing'?'Capturing match':state==='idle'?'Waiting for updates':'Awaiting telemetry'}</strong><span>{source}</span></div></div><a className="caster-overlay-link" href="/local/overlay" target="_blank" rel="noreferrer">Open OBS overlay</a><p>Local-only connection. Cloud pairing remains available separately.</p></section></div>
   </main>
  </div>
 </div>;
}
