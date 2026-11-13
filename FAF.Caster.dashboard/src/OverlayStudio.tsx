import {useEffect,useRef,useState} from 'react';
import type {PointerEvent as ReactPointerEvent, CSSProperties} from 'react';
import type {CasterPlayer} from './LocalDashboard';
import './overlay-studio.css';
import {WidgetTelemetry,presetWidgets} from './Stage44Widgets';
import type {PresetName} from './Stage44Widgets';
type Mode='caster'|'tournament';
type Layout='scoreboard'|'economy'|'comparison'|'match'|'custom';
type WidgetKind='scoreboard'|'economy'|'timer'|'title'|'tournament';
type Widget={id:string;kind:WidgetKind;x:number;y:number;w:number;h:number;visible:boolean;playerIds?:number[];teamId?:number;economyView?:'both'|'mass'|'energy';maxPlayers?:number;groupByTeam?:boolean};
type Slot={theme?:'midnight'|'broadcast'|'minimal';backgroundOpacity?:number;textColor?:string;logoData?:string;widgets?:Widget[];teamNames?:Record<string,string>;teamAssignments?:Record<string,number>;id:number;name:string;mode:Mode;layout:Layout;accent:string;scale:number;showEconomy:boolean;showTimer:boolean;showTeams:boolean;tournamentName:string;round:string;score:string};
const KEY='fafcaster.overlay-studio.v1';
const themePresets={midnight:{accent:'#17b8c5',textColor:'#f5fbff',backgroundOpacity:90},broadcast:{accent:'#ffbb54',textColor:'#ffffff',backgroundOpacity:95},minimal:{accent:'#ffffff',textColor:'#f5fbff',backgroundOpacity:65}} as const;
const defaults:Slot[]=Array.from({length:5},(_,i)=>({id:i+1,name:['Main scoreboard','Economy panel','Player comparison','Match information','Custom overlay'][i],mode:i===3?'tournament':'caster',layout:(['scoreboard','economy','comparison','match','custom'] as Layout[])[i],accent:'#17b8c5',scale:100,showEconomy:true,showTimer:true,showTeams:true,tournamentName:'FAF Tournament',round:'Round 1',score:'0 – 0'}));
const kinds:WidgetKind[]=['scoreboard','economy','timer','title','tournament'];
const widgetLabels:Record<WidgetKind,string>={scoreboard:'Player scoreboard',economy:'Economy',timer:'Match timer',title:'Broadcast title',tournament:'Tournament information'};
const initialWidgets=(slot:Slot):Widget[]=>{
 const base:Widget[]=[
 {id:'title',kind:'title',x:5,y:5,w:42,h:11,visible:true},
 {id:'timer',kind:'timer',x:83,y:5,w:12,h:10,visible:slot.showTimer},
 {id:'scoreboard',kind:'scoreboard',x:5,y:22,w:52,h:34,visible:slot.layout!=='match'},
 {id:'economy',kind:'economy',x:5,y:59,w:52,h:21,visible:slot.showEconomy&&slot.layout!=='match'},
 {id:'tournament',kind:'tournament',x:58,y:22,w:36,h:20,visible:slot.mode==='tournament'}
 ];
 return base;
};
const getWidgets=(slot:Slot)=>slot.widgets??initialWidgets(slot);
const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));
function Scene({slot,players,teams,editing,selectedWidget,onSelect,onUpdate,grid}:{slot:Slot;players:CasterPlayer[];teams:Record<number,number>;editing:boolean;selectedWidget:string|null;onSelect?:(id:string)=>void;onUpdate?:(id:string,patch:Partial<Widget>)=>void;grid:boolean}){
 const ref=useRef<HTMLDivElement>(null);
 const drag=useRef<{id:string;mode:'move'|'resize';startX:number;startY:number;initial:Widget}|null>(null);
 const widgets=getWidgets(slot);
 const down=(event:ReactPointerEvent<HTMLDivElement>,widget:Widget,mode:'move'|'resize')=>{
  if(!editing)return;
  event.preventDefault();event.stopPropagation();onSelect?.(widget.id);
  drag.current={id:widget.id,mode,startX:event.clientX,startY:event.clientY,initial:{...widget}};
  event.currentTarget.setPointerCapture(event.pointerId);
 };
 const move=(event:ReactPointerEvent<HTMLDivElement>)=>{
  const d=drag.current;const rect=ref.current?.getBoundingClientRect();
  if(!d||!rect)return;
  const dx=(event.clientX-d.startX)/rect.width*100;
  const dy=(event.clientY-d.startY)/rect.height*100;
  const snap=(v:number)=>grid?Math.round(v/2)*2:v;
  if(d.mode==='move')onUpdate?.(d.id,{x:clamp(snap(d.initial.x+dx),0,100-d.initial.w),y:clamp(snap(d.initial.y+dy),0,100-d.initial.h)});
  else onUpdate?.(d.id,{w:clamp(snap(d.initial.w+dx),8,100-d.initial.x),h:clamp(snap(d.initial.h+dy),7,100-d.initial.y)});
 };
 return <div ref={ref} className={'os-scene '+(editing?'os-scene-edit ':'')+(grid&&editing?'os-scene-grid':'')} style={{'--os-accent':slot.accent,'--os-text':slot.textColor||'#f5fbff','--os-opacity':(slot.backgroundOpacity??90)/100} as CSSProperties}>
 {widgets.filter(w=>w.visible).map(w=><div key={w.id} className={'os-widget '+(editing&&selectedWidget===w.id?'os-widget-selected':'')} style={{left:w.x+'%',top:w.y+'%',width:w.w+'%',height:w.h+'%'}} onPointerDown={e=>down(e,w,'move')} onPointerMove={move} onPointerUp={()=>{drag.current=null}} onPointerCancel={()=>{drag.current=null}}>
 {editing&&<span className="os-widget-tag">{widgetLabels[w.kind]}</span>}<WidgetTelemetry widget={w} slot={slot} context={{players,teams:{...teams,...Object.fromEntries(Object.entries(slot.teamAssignments??{}).map(([id,team])=>[Number(id),team]))}}}/>{editing&&selectedWidget===w.id&&<div className="os-widget-resizer" onPointerDown={e=>down(e,w,'resize')} onPointerMove={move} onPointerUp={()=>{drag.current=null}} onPointerCancel={()=>{drag.current=null}}/>}
 </div>)}
 </div>;
}
function load():Slot[]{try{const value=JSON.parse(localStorage.getItem(KEY)||'null');if(Array.isArray(value)&&value.length===5)return defaults.map((d,i)=>({...d,...value[i],id:i+1}));}catch{}return defaults;}
function fmt(n:number){return Number.isFinite(n)?n.toLocaleString('en-GB',{maximumFractionDigits:1}):'—';}
function Preview({slot,players}:{slot:Slot;players:CasterPlayer[]}){
 const ordered=[...players].sort((a,b)=>b.score-a.score).slice(0,slot.mode==='tournament'?4:2);
 const time=Math.max(0,...ordered.map(p=>p.gameTime||0));
 const clock=`${Math.floor(time/60).toString().padStart(2,'0')}:${Math.floor(time%60).toString().padStart(2,'0')}`;
 return <div className="os-preview" style={{'--os-accent':slot.accent,'--os-scale':slot.scale/100} as CSSProperties}><div className="os-preview-inner">
  <div className="os-preview-header"><strong>{slot.mode==='tournament'?slot.tournamentName:'FAF CASTER'}</strong>{slot.showTimer&&<span>{clock}</span>}</div>
  {slot.mode==='tournament'&&slot.showTeams&&<div className="os-tournament">{slot.round} <strong>{slot.score}</strong></div>}
  {slot.layout==='match'&&<div className="os-placeholder">MATCH OVERVIEW · {ordered.length} PLAYERS</div>}
  {ordered.length===0?<div className="os-placeholder">Waiting for live FAF telemetry</div>:ordered.map(p=><div className="os-player" key={p.armyId}><div className="os-player-name"><span className="os-army">#{p.armyId}</span><strong>{p.name}</strong><span>{p.defeated?'DEFEATED':`Score ${fmt(p.score)}`}</span></div>{slot.showEconomy&&slot.layout!=='match'&&<div className="os-stats"><span>MASS <strong>+{fmt(p.massIncome)}</strong></span><span>ENERGY <strong>+{fmt(p.energyIncome)}</strong></span>{slot.layout==='comparison'&&<span>UNITS <strong>{fmt(p.units)}</strong></span>}</div>}</div>)}
 </div></div>;
}
export default function OverlayStudio({players=[],teams={},overlayId}:{players?:CasterPlayer[];teams?:Record<number,number>;overlayId?:number}){
 const [slots,setSlots]=useState<Slot[]>(load);const [selected,setSelected]=useState(1);const [copied,setCopied]=useState(false);
 const [selectedWidget,setSelectedWidget]=useState<string|null>(null);const [grid,setGrid]=useState(true);const [zoom,setZoom]=useState(100);
 const [ready,setReady]=useState(false);const [saveState,setSaveState]=useState<'loading'|'saved'|'saving'|'offline'>('loading');
 const slotsRef=useRef(slots);const changed=useRef(false);const version=useRef('');
 useEffect(()=>{slotsRef.current=slots;},[slots]);
 useEffect(()=>{
   let active=true;
   const refresh=async()=>{
     try{
       const response=await fetch('/local-api/overlay-config',{cache:'no-store'});
       if(!response.ok)throw new Error('Bridge unavailable');
       const data:unknown=await response.json();
       if(!active)return;
       if(Array.isArray(data)&&data.length===5){
         const raw=JSON.stringify(data);
         if(!changed.current&&raw!==version.current){
           version.current=raw;
           setSlots(defaults.map((d,i)=>({...d,...data[i],id:i+1})));
         }
       }
       setReady(true);setSaveState(state=>state==='loading'?'saved':state);
     }catch{if(active){setReady(true);setSaveState('offline');}}
   };
   void refresh();const timer=window.setInterval(()=>{if(!changed.current)void refresh();},1200);
   return()=>{active=false;window.clearInterval(timer)};
 },[]);
 useEffect(()=>{
   if(!ready||!changed.current)return;
   setSaveState('saving');
   const timer=window.setTimeout(async()=>{
     try{
       const body=JSON.stringify(slotsRef.current);
       const response=await fetch('/local-api/overlay-config',{method:'PUT',headers:{'Content-Type':'application/json'},body});
       if(!response.ok)throw new Error('Save failed');
       version.current=body;changed.current=false;setSaveState('saved');
     }catch{setSaveState('offline');}
   },350);
   return()=>window.clearTimeout(timer);
 },[slots,ready]);
 useEffect(()=>{localStorage.setItem(KEY,JSON.stringify(slots));},[slots]);
 const slot=slots[(overlayId??selected)-1]??slots[0];
 const change=(patch:Partial<Slot>)=>{changed.current=true;setSlots(current=>current.map(s=>s.id===selected?{...s,...patch}:s));};
 const updateWidget=(id:string,patch:Partial<Widget>)=>change({widgets:getWidgets(slot).map(w=>w.id===id?{...w,...patch}:w)});
 const addWidget=(kind:WidgetKind)=>{const widgets=getWidgets(slot);const id=kind+'-'+Date.now();change({widgets:[...widgets,{id,kind,x:10,y:10,w:kind==='timer'?18:40,h:kind==='timer'?12:24,visible:true}]});setSelectedWidget(id);};
 const currentWidget=getWidgets(slot).find(w=>w.id===selectedWidget);
 const knownTeams=[...new Set([...players.map(p=>slot.teamAssignments?.[String(p.armyId)]??teams[p.armyId]??0),1,2].filter(t=>t>0))].sort((a,b)=>a-b);
 const applyPreset=(preset:PresetName)=>{if(!window.confirm('Replace the widgets in this overlay with the '+preset+' preset?'))return;change({layout:'custom',mode:preset==='tournament'?'tournament':'caster',widgets:presetWidgets(preset)});setSelectedWidget(null);};
 const url=`${window.location.origin}/local/studio/overlay/${slot.id}`;
 const exportConfig=()=>{const blob=new Blob([JSON.stringify({format:'faf-caster-overlays',version:1,slots},null,2)],{type:'application/json'});const href=URL.createObjectURL(blob);const a=document.createElement('a');a.href=href;a.download='faf-caster-overlays.json';a.click();window.setTimeout(()=>URL.revokeObjectURL(href),1000);};
 const importConfig=async(file:File)=>{try{if(file.size>1024*1024)throw new Error('File is larger than 1 MB');const data:unknown=JSON.parse(await file.text());if(!data||typeof data!=='object'||!('format' in data)||data.format!=='faf-caster-overlays'||!('version' in data)||data.version!==1||!('slots' in data)||!Array.isArray(data.slots)||data.slots.length!==5)throw new Error('Not a FAF Caster overlay export');const incoming=data.slots as unknown[];if(!incoming.every((x,i)=>x&&typeof x==='object'&&'id' in x&&x.id===i+1&&'name' in x&&typeof x.name==='string'&&'mode' in x&&(x.mode==='caster'||x.mode==='tournament')&&'widgets' in x&&Array.isArray(x.widgets)&&x.widgets.length<=50))throw new Error('Invalid slot configuration');if(!window.confirm('Replace all five overlay configurations with this backup?'))return;changed.current=true;setSlots(defaults.map((d,i)=>({...d,...incoming[i] as Slot,id:i+1})));setSelectedWidget(null);}catch(error){window.alert(error instanceof Error?error.message:'Import failed');}};
 const setLogo=async(file:File)=>{if(!file.type.startsWith('image/')||file.type==='image/svg+xml'||file.size>200*1024){window.alert('Choose a PNG, JPEG or WebP image under 200 KB.');return;}const reader=new FileReader();reader.onload=()=>{if(typeof reader.result==='string')change({logoData:reader.result})};reader.readAsDataURL(file);};
 if(overlayId)return <div className="os-browser-source"><Scene slot={slot} players={players} teams={teams} editing={false} selectedWidget={null} grid={false}/></div>;
 return <div className="os-page"><header className="os-top"><div><div className="os-kicker">FAF CASTER / STAGE 4</div><h1>Overlay Studio</h1><p>Five independent OBS browser sources. Configure once, use across your scenes.</p></div><div className="os-header-actions"><button type="button" onClick={exportConfig}>Export all slots</button><label className="os-import-button">Import backup<input type="file" accept=".json,application/json" onChange={e=>{const file=e.target.files?.[0];if(file)void importConfig(file);e.target.value=''}}/></label><a href="/local" className="os-back">← Live dashboard</a></div></header>
 <div className="os-workspace"><aside className="os-sidebar"><h2>Overlay slots <span>5 / 5</span></h2>{slots.map(s=><button type="button" key={s.id} className={'os-slot '+(selected===s.id?'active':'')} onClick={()=>{setSelected(s.id);setSelectedWidget(null);setCopied(false)}}><span className="os-slot-number">0{s.id}</span><span><strong>{s.name}</strong><small>{s.mode==='caster'?'Caster':'Tournament'} · {s.layout}</small></span></button>)}<div className="os-hint"><strong>HOW IT WORKS</strong><p>Select a slot, adjust its appearance, then copy its URL into an OBS Browser Source.</p><p>All five sources can be active simultaneously.</p></div></aside>
 <main className="os-editor"><div className="os-editor-title"><div><div className="os-kicker">EDITING SLOT 0{selected}</div><h2>{slot.name}</h2></div><span className="os-status">{saveState==='saved'?'SAVED TO BRIDGE':saveState==='saving'?'SAVING…':saveState==='offline'?'BRIDGE OFFLINE':'LOADING…'}</span></div><div className="os-canvas-toolbar"><span><span className="os-live-dot"/> SCENE PREVIEW <small>1920 × 1080 · 16:9</small></span><span className="os-canvas-controls"><label><input type="checkbox" checked={grid} onChange={e=>setGrid(e.target.checked)}/> Snap to grid</label><button type="button" onClick={()=>setZoom(z=>z===100?75:z===75?50:100)}>Zoom {zoom}%</button></span></div><div className="os-preview-frame"><div className="os-canvas"><div className="os-canvas-safe" style={{transform:`scale(${zoom/100})`,transformOrigin:"top left",width:`${10000/zoom}%`,height:`${10000/zoom}%`}}><Scene slot={slot} players={players} teams={teams} editing selectedWidget={selectedWidget} onSelect={setSelectedWidget} onUpdate={updateWidget} grid={grid}/></div><div className="os-canvas-watermark">FAF CASTER · LIVE SCENE</div></div></div><div className="os-url"><div><strong>OBS browser source</strong><code>{url}</code></div><div className="os-url-actions"><a href={url} target="_blank" rel="noreferrer">Open</a><button type="button" onClick={()=>{void navigator.clipboard.writeText(url).then(()=>setCopied(true)).catch(()=>setCopied(false))}}>{copied?'Copied':'Copy URL'}</button></div></div><p className="os-note">Suggested OBS browser source size: 1920 × 1080. The browser view has a transparent background. OBS updates automatically while the Bridge is running.</p></main>
 <aside className="os-settings"><div className="os-properties-heading"><div className="os-kicker">OVERLAY CONFIGURATION</div><h2>Properties</h2><p>Changes are saved to the local Bridge and shared with OBS.</p></div><div className="os-property-group"><h3>General</h3><label>Name<input value={slot.name} maxLength={64} onChange={e=>change({name:e.target.value})}/></label><label>Mode<select value={slot.mode} onChange={e=>change({mode:e.target.value as Mode})}><option value="caster">Caster Mode</option><option value="tournament">Tournament Mode</option></select></label><label>Layout<select value={slot.layout} onChange={e=>change({layout:e.target.value as Layout})}><option value="scoreboard">Scoreboard</option><option value="economy">Economy</option><option value="comparison">Player comparison</option><option value="match">Match information</option><option value="custom">Custom (starter layout)</option></select></label></div><div className="os-property-group"><h3>Broadcast presets</h3><div className="os-preset-grid">{(['1v1','2v2','team','tournament'] as PresetName[]).map(p=><button key={p} type="button" onClick={()=>applyPreset(p)}>{p==='team'?'Team game':p==='tournament'?'Tournament':p}</button>)}</div></div><div className="os-property-group"><h3>Appearance</h3><label>Accent colour<input type="color" value={slot.accent} onChange={e=>change({accent:e.target.value})}/></label><label>Scale · {slot.scale}%<input type="range" min="60" max="140" step="5" value={slot.scale} onChange={e=>change({scale:Number(e.target.value)})}/></label></div><div className="os-property-group"><h3>Broadcast branding</h3><label>Theme<select value={slot.theme??'midnight'} onChange={e=>{const theme=e.target.value as keyof typeof themePresets;change({theme,...themePresets[theme]})}}><option value="midnight">Midnight teal</option><option value="broadcast">Broadcast gold</option><option value="minimal">Minimal white</option></select></label><label>Text colour<input type="color" value={slot.textColor??'#f5fbff'} onChange={e=>change({textColor:e.target.value})}/></label><label>Panel opacity · {slot.backgroundOpacity??90}%<input type="range" min="0" max="100" step="5" value={slot.backgroundOpacity??90} onChange={e=>change({backgroundOpacity:Number(e.target.value)})}/></label><label>Broadcast logo (PNG, JPEG or WebP, max 200 KB)<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>{const file=e.target.files?.[0];if(file)void setLogo(file);e.target.value=''}}/></label>{slot.logoData&&<div className="os-logo-preview"><img src={slot.logoData} alt="Broadcast logo preview"/><button type="button" onClick={()=>change({logoData:''})}>Remove logo</button></div>}</div><div className="os-property-group"><h3>Team assignments</h3><p className="os-field-help">Overrides saved with this overlay, including for OBS.</p>{players.map(p=><label key={p.armyId}>{p.name}<select value={slot.teamAssignments?.[String(p.armyId)]??teams[p.armyId]??0} onChange={e=>change({teamAssignments:{...slot.teamAssignments,[String(p.armyId)]:Number(e.target.value)}})}><option value={0}>Unassigned</option>{Array.from({length:16},(_,i)=><option key={i+1} value={i+1}>Team {i+1}</option>)}</select></label>)}</div><div className="os-property-group"><h3>Widgets</h3><label>Add widget<select value="" onChange={e=>{if(e.target.value)addWidget(e.target.value as WidgetKind)}}><option value="">Choose a widget…</option>{kinds.map(kind=><option key={kind} value={kind}>{widgetLabels[kind]}</option>)}</select></label>{getWidgets(slot).map(w=><div key={w.id} className="os-widget-row"><button type="button" className={selectedWidget===w.id?'active':''} onClick={()=>setSelectedWidget(w.id)}>{widgetLabels[w.kind]}</button><input aria-label={'Show '+widgetLabels[w.kind]} type="checkbox" checked={w.visible} onChange={e=>updateWidget(w.id,{visible:e.target.checked})}/></div>)}{currentWidget&&<div className="os-widget-properties"><strong>Selected: {widgetLabels[currentWidget.kind]}</strong>{(currentWidget.kind==='scoreboard'||currentWidget.kind==='economy')&&<><label>Players (leave all unchecked to show everyone)<div className="os-player-filter">{players.map(p=><label key={p.armyId}><input type="checkbox" checked={currentWidget.playerIds?.includes(p.armyId)??false} onChange={e=>updateWidget(currentWidget.id,{playerIds:e.target.checked?[...(currentWidget.playerIds??[]),p.armyId]:(currentWidget.playerIds??[]).filter(id=>id!==p.armyId)})}/>{p.name}</label>)}</div></label><label>Team filter<select value={currentWidget.teamId??0} onChange={e=>updateWidget(currentWidget.id,{teamId:Number(e.target.value)})}><option value={0}>All teams</option>{knownTeams.map(team=><option key={team} value={team}>{slot.teamNames?.[String(team)]||`Team ${team}`}</option>)}</select></label><label>Maximum players<input type="number" min="1" max="16" value={currentWidget.maxPlayers??4} onChange={e=>updateWidget(currentWidget.id,{maxPlayers:clamp(Number(e.target.value)||1,1,16)})}/></label>{currentWidget.kind==='scoreboard'?<label className="os-check"><input type="checkbox" checked={currentWidget.groupByTeam??false} onChange={e=>updateWidget(currentWidget.id,{groupByTeam:e.target.checked})}/> Group by team</label>:<label>Economy resources<select value={currentWidget.economyView??'both'} onChange={e=>updateWidget(currentWidget.id,{economyView:e.target.value as 'both'|'mass'|'energy'})}><option value="both">Mass and energy</option><option value="mass">Mass only</option><option value="energy">Energy only</option></select></label>}</>}{(['x','y','w','h'] as const).map(prop=><label key={prop}>{({x:'Left',y:'Top',w:'Width',h:'Height'})[prop]} (%)<input type="number" min="0" max="100" value={Math.round(currentWidget[prop])} onChange={e=>updateWidget(currentWidget.id,{[prop]:clamp(Number(e.target.value),0,100)} as Partial<Widget>)}/></label>)}<button type="button" className="os-reset" onClick={()=>{change({widgets:getWidgets(slot).filter(w=>w.id!==currentWidget.id)});setSelectedWidget(null)}}>Remove widget</button></div>}</div><div className="os-property-group"><h3>Visible elements</h3><label className="os-check"><input type="checkbox" checked={slot.showEconomy} onChange={e=>change({showEconomy:e.target.checked})}/> Economy data</label><label className="os-check"><input type="checkbox" checked={slot.showTimer} onChange={e=>change({showTimer:e.target.checked})}/> Match timer</label>{slot.mode==='tournament'&&<><label className="os-check"><input type="checkbox" checked={slot.showTeams} onChange={e=>change({showTeams:e.target.checked})}/> Tournament header</label>{knownTeams.map(team=><label key={team}>Team {team} display name<input value={slot.teamNames?.[String(team)]??''} placeholder={`Team ${team}`} onChange={e=>change({teamNames:{...slot.teamNames,[String(team)]:e.target.value}})}/></label>)}<label>Tournament<input value={slot.tournamentName} onChange={e=>change({tournamentName:e.target.value})}/></label><label>Round<input value={slot.round} onChange={e=>change({round:e.target.value})}/></label><label>Series score<input value={slot.score} onChange={e=>change({score:e.target.value})}/></label></>}</div><button className="os-reset" type="button" onClick={()=>{change({...defaults[selected-1],widgets:initialWidgets(defaults[selected-1])});setSelectedWidget(null)}}>Reset this slot</button></aside></div></div>;
}