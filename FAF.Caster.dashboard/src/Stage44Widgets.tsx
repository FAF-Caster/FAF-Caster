import type {CasterPlayer} from './LocalDashboard';
export type TelemetryWidgetKind='scoreboard'|'economy'|'timer'|'title'|'tournament';
export type TelemetryWidget={id:string;kind:TelemetryWidgetKind;playerIds?:number[];teamId?:number;economyView?:'both'|'mass'|'energy';maxPlayers?:number;groupByTeam?:boolean};
export type TelemetrySlot={mode:'caster'|'tournament';tournamentName:string;round:string;score:string;teamNames?:Record<string,string>;showTeams:boolean};
export type TelemetryContext={players:CasterPlayer[];teams?:Record<number,number>;};
export const factionNames:Record<number,string>={1:'UEF',2:'Aeon',3:'Cybran',4:'Seraphim'};
const n=(value:number|undefined,decimals=1)=>Number.isFinite(value)?Number(value).toLocaleString('en-GB',{maximumFractionDigits:decimals}):'—';
export function selectWidgetPlayers(widget:TelemetryWidget,context:TelemetryContext):CasterPlayer[]{
 const ids=widget.playerIds;
 return [...context.players].filter(p=>(!ids?.length||ids.includes(p.armyId))&&(!widget.teamId||(context.teams?.[p.armyId]??0)===widget.teamId))
 .sort((a,b)=>(b.score??0)-(a.score??0)).slice(0,Math.max(1,Math.min(16,widget.maxPlayers??4)));
}
export function WidgetTelemetry({widget,slot,context}:{widget:TelemetryWidget;slot:TelemetrySlot;context:TelemetryContext}){
 const players=selectWidgetPlayers(widget,context);
 const time=Math.max(0,...context.players.map(p=>p.gameTime||0));
 if(widget.kind==='title')return <div className="os-widget-title">{slot.mode==='tournament'?slot.tournamentName:'FAF CASTER'}</div>;
 if(widget.kind==='timer')return <div className="os-widget-timer">{Math.floor(time/60).toString().padStart(2,'0')}:{Math.floor(time%60).toString().padStart(2,'0')}</div>;
 if(widget.kind==='tournament')return <div className="os-widget-info"><strong>{slot.tournamentName}</strong><span>{slot.round}</span><b>{slot.score}</b></div>;
 if(!players.length)return <div className="os-widget-empty">Waiting for matching player telemetry</div>;
 const teamName=(id:number)=>slot.teamNames?.[String(id)]||`Team ${id}`;
 if(widget.kind==='scoreboard'){
  const groups=new Map<number,CasterPlayer[]>();
  for(const p of players){const team=context.teams?.[p.armyId]??0;groups.set(team,[...(groups.get(team)||[]),p]);}
  const renderPlayer=(p:CasterPlayer)=><div key={p.armyId} className={'os-widget-player '+(p.defeated?'os-defeated':'')}>
   <span className="os-player-identity"><i className="os-faction-dot" style={{background:p.color||p.armyColor||'#59c7d4'}}/><strong>{p.name}</strong><small>{factionNames[p.faction]||'Unknown'}</small></span>
   <span className="os-score-value">{p.defeated?'OUT':n(p.score,0)}</span>
  </div>;
  return <div className="os-widget-players">{widget.groupByTeam?[...groups.entries()].map(([team,members])=><section key={team}><div className="os-team-heading">{team>0?teamName(team):'Unassigned'} <span>{n(members.reduce((v,p)=>v+(p.score||0),0),0)}</span></div>{members.map(renderPlayer)}</section>):players.map(renderPlayer)}</div>;
 }
 const view=widget.economyView||'both';
 return <div className="os-widget-players os-economy-table">{players.map(p=><div className="os-economy-player" key={p.armyId}><strong>{p.name}</strong>
 {(view==='both'||view==='mass')&&<div className="os-economy-resource"><span>MASS</span><span>+{n(p.massIncome)} / -{n(p.massSpent)}</span><span>{n(p.massStored,0)} stored</span></div>}
 {(view==='both'||view==='energy')&&<div className="os-economy-resource"><span>ENERGY</span><span>+{n(p.energyIncome,0)} / -{n(p.energySpent,0)}</span><span>{n(p.energyStored,0)} stored</span></div>}
 </div>)}</div>;
}
export type PresetName='1v1'|'2v2'|'team'|'tournament';
export function presetWidgets(preset:PresetName){
 const base=[
 {id:'title',kind:'title' as const,x:4,y:4,w:43,h:10,visible:true},
 {id:'timer',kind:'timer' as const,x:84,y:4,w:12,h:10,visible:true},
 {id:'scoreboard',kind:'scoreboard' as const,x:4,y:20,w:55,h:38,visible:true,maxPlayers:preset==='1v1'?2:preset==='2v2'?4:12,groupByTeam:preset!=='1v1'},
 {id:'economy',kind:'economy' as const,x:4,y:61,w:55,h:28,visible:preset!=='tournament',maxPlayers:preset==='1v1'?2:4,economyView:'both' as const},
 {id:'tournament',kind:'tournament' as const,x:61,y:20,w:35,h:23,visible:preset==='tournament'}
 ];
 return base;
}
