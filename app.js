const $=id=>document.getElementById(id),esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const colors=[['#dcebc7','#4c692d'],['#f4dfb5','#8b6422'],['#d5e7ec','#3c6d7a'],['#e7dcef','#765b8c'],['#f4dcd2','#a06148'],['#d1e6db','#376a51'],['#e0e3f5','#56638e'],['#f0e6bc','#7a7028']];
const style=id=>`--job-bg:${colors[id%8][0]};--job-fg:${colors[id%8][1]}`;
const sec=t=>(t/1000).toLocaleString('en-US',{maximumFractionDigits:3});
function preset(key){const base=(name,arrival,cpu,io='')=>({name,arrival,priority:3,memory:64,cpu,io});if(key==='io')return [base('A',0,'5/4','3'),base('B',0,'2/2/2','5/5'),base('C',1,'12'),base('D',3,'1/3','4')];if(key==='large')return [base('A',0,'1000'),base('B',2,'2500'),base('C',4,'1200/800','50')];if(key==='idle')return [base('A',5,'1/2','7'),base('B',5,'3'),base('C',20,'2')];return [3,6,4,5,2].map((cpu,i)=>base(String.fromCharCode(65+i),i*2,String(cpu)));}
const cardNodes=new Map(),flights=new Map(),htmlCache=new Map();
let switchEvents=[],timelineKey='',timelineRange=null,lastRender=0;
const reducedMotion=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
function html(id,value){if(htmlCache.get(id)!==value){$(id).innerHTML=value;htmlCache.set(id,value);}}
function clearFlights(){for(const f of flights.values()){f.animation.cancel();f.ghost.remove();f.node.style.visibility='';}flights.clear();}
let input=preset('original'),model=null,time=0,selected=0,playing=false,clock=null,worker=null,revision=0,activeInput=null;
function rows(){ $('inputs').innerHTML=input.map((j,i)=>`<tr>${['name','arrival','priority','memory','cpu','io'].map(k=>`<td><input aria-label="Process ${i+1} ${k}" data-id="${i}" data-field="${k}" type="${['arrival','priority','memory'].includes(k)?'number':'text'}" value="${esc(j[k])}" ${k==='io'?'placeholder="None"':''}></td>`).join('')}<td><button data-remove="${i}" aria-label="Remove process ${i+1}" ${input.length===1?'disabled':''}>×</button></td></tr>`).join('');$('add').disabled=input.length>=100;}
function dirty(){pause();$('error').textContent='Unapplied changes — select Build simulation.';}
$('inputs').oninput=e=>{if(e.target.dataset.field){input[+e.target.dataset.id][e.target.dataset.field]=e.target.value;dirty();}};
$('inputs').onclick=e=>{if(e.target.dataset.remove!==undefined){input.splice(+e.target.dataset.remove,1);rows();dirty();}};
$('add').onclick=()=>{let n=input.length+1;while(input.some(j=>j.name==='P'+n))n++;input.push({name:'P'+n,arrival:0,priority:3,memory:64,cpu:'5',io:''});rows();dirty();};
['quantum','cost'].forEach(id=>$(id).oninput=dirty);
function build(){pause();let options={quantum:$('quantum').value,cost:$('cost').value};try{normalize(input,options);}catch(e){$('error').textContent=e.message;return;}const version=++revision;worker?.terminate();$('error').textContent='Computing scheduling events…';$('apply').disabled=true;['play','next','back','finish','reset','go','export-results'].forEach(id=>$(id).disabled=true);const jobs=JSON.parse(JSON.stringify(input));
 const finish=result=>{if(version!==revision)return;$('apply').disabled=false;['play','next','back','finish','reset','go','export-results'].forEach(id=>$(id).disabled=false);if(result.error){$('error').textContent=result.error;return;}clearFlights();cardNodes.clear();htmlCache.clear();timelineKey='';timelineRange=null;model=result.model;switchEvents=model.events.filter(e=>e.kind==='SWITCH');activeInput={jobs,options};time=0;selected=0;$('jump').value=0;$('context').dataset.key='';$('scrubber').max=model.duration;$('jump').max=model.duration/1000;$('inspect').innerHTML=model.jobs.map(j=>`<option value="${j.id}">${esc(j.name)}</option>`).join('');$('error').textContent=`Built ${model.jobs.length} processes · ${model.events.length.toLocaleString()} events · ${sec(model.duration)} simulated seconds.`;render(false);};
 if(location.protocol!=='file:'&&typeof Worker!=='undefined'){try{worker=new Worker('worker.js?v=6');worker.onmessage=e=>{finish(e.data);worker.terminate();};worker.onerror=()=>{worker.terminate();finish({error:'Simulation worker could not load. Reload the page and try again.'});};worker.postMessage({jobs,options});}catch(e){finish({error:e.message});}}
 else setTimeout(()=>{try{finish({model:simulate(jobs,options)});}catch(e){finish({error:e.message});}},0);
}
$('apply').onclick=build;$('load-preset').onclick=()=>{input=preset($('preset').value);rows();$('quantum').value=1;$('cost').value=$('preset').value==='io'?.2:0;build();};
function badge(j){return `<span class="badge" style="${style(j.id)}">${esc(j.name)}</span>`;}
function card(j){let detail=j.status==='blocked'?`I/O ${sec(Math.max(0,j.wake-time))}s`:j.status==='new'?`arrives ${sec(j.arrival)}s`:`${sec(j.total-j.used)}s CPU left`;return `<button class="card ${selected===j.id?'selected':''}" data-job="${j.id}" style="${style(j.id)}" aria-label="Inspect ${esc(j.name)}"><strong>${esc(j.name)}</strong><small>${detail}</small></button>`;}
function fill(id,jobs,empty){
 const host=$(id),wanted=jobs.slice(0,24).map(j=>{
  let node=cardNodes.get(j.id);if(!node){const temp=document.createElement('template');temp.innerHTML=card(j);node=temp.content.firstElementChild;cardNodes.set(j.id,node);}
  node.classList.toggle('selected',selected===j.id);
  const detail=j.status==='blocked'?`I/O ${sec(Math.max(0,j.wake-time))}s`:j.status==='new'?`arrives ${sec(j.arrival)}s`:`${sec(j.total-j.used)}s CPU left`;
  const text=node.querySelector('small');if(text.textContent!==detail)text.textContent=detail;
  return node;
 });
 if(!wanted.length||jobs.length>24){let note=host.querySelector('[data-note]');if(!note){note=document.createElement('span');note.dataset.note='';note.className='empty';}note.textContent=jobs.length?`+ ${jobs.length-24} more · see notebook`:empty;wanted.push(note);}
 wanted.forEach((node,index)=>{if(host.children[index]!==node)host.insertBefore(node,host.children[index]||null);});
 const keep=new Set(wanted);for(const node of [...host.children])if(!keep.has(node))node.remove();
}
function moveCards(before,animate){
 if(!animate||reducedMotion()){clearFlights();return;}
 const duration=playing?Math.max(80,Math.min(480,(model.q+model.cost)/Number($('speed').value)*.7)):480;
 for(const node of document.querySelectorAll('[data-job]')){
  const old=before.get(node.dataset.job),now=node.getBoundingClientRect();
  if(!old||Math.abs(old.x-now.x)+Math.abs(old.y-now.y)<1)continue;
  const previous=flights.get(node.dataset.job),start=previous?previous.ghost.getBoundingClientRect():old;
  if(previous){previous.animation.cancel();previous.ghost.remove();flights.delete(node.dataset.job);}
  const ghost=node.cloneNode(true);ghost.removeAttribute('data-job');ghost.removeAttribute('aria-label');ghost.setAttribute('aria-hidden','true');ghost.tabIndex=-1;ghost.classList.add('flight-card');
  Object.assign(ghost.style,{left:now.x+'px',top:now.y+'px',width:now.width+'px',height:now.height+'px',visibility:'visible'});document.body.appendChild(ghost);node.style.visibility='hidden';
  const animation=ghost.animate([{transform:`translate(${start.x-now.x}px,${start.y-now.y}px)`},{transform:'translate(0,0)'}],{duration,easing:'cubic-bezier(.22,.68,0,1)',fill:'both'});
  const flight={ghost,node,animation};flights.set(node.dataset.job,flight);
  animation.onfinish=()=>{if(flights.get(node.dataset.job)!==flight)return;node.style.visibility='';ghost.remove();flights.delete(node.dataset.job);};
 }
}
function latestSwitch(t){let lo=0,hi=switchEvents.length-1,found=null;while(lo<=hi){const mid=(lo+hi)>>1;if(switchEvents[mid].t<=t){found=switchEvents[mid];lo=mid+1;}else hi=mid-1;}return found;}
function regsHTML(regs){return Object.entries(regs).map(([k,v])=>`<div class="reg"><span>${k}</span>${v}</div>`).join('');}
function render(animate=true){if(!model)return;const before=new Map([...document.querySelectorAll('[data-job]')].map(el=>[el.dataset.job,el.getBoundingClientRect()]));const f=inspect(model,time);time=f.t;
 fill('pending',f.jobs.filter(j=>j.status==='new'),'All admitted');fill('ready',f.ready,'No ready process');fill('blocked',f.jobs.filter(j=>j.status==='blocked'),'No I/O pending');fill('done',f.jobs.filter(j=>j.status==='done'),'None yet');
 const cpu=f.jobs.find(j=>j.status==='running'),switching=f.jobs.find(j=>j.status==='switching');fill('cpu',cpu?[cpu]:switching?[switching]:[],f.finished?'Complete':'Idle');html('registers',cpu?regsHTML(registers(cpu)):'<span class="empty">'+(switching?'Context transfer in progress':'No active context')+'</span>');
 const sw=latestSwitch(time);
 const contextKey=sw?`${sw.t}:${sw.from}:${sw.id}`:`run:${cpu?.id}:${f.finished}`;
 if($('context').dataset.key!==contextKey){$('context').dataset.key=contextKey;$('context').className='context-strip'+(sw?' switching':'');
 if(sw){const transferState=inspect(model,sw.t);const outgoing=registers(transferState.jobs[sw.from]),incoming=registers(transferState.jobs[sw.id]);$('context').innerHTML=`<div class="context-bank"><b>SAVE → PCB ${esc(f.jobs[sw.from].name)}</b><div class="bank-values">${regsHTML(outgoing)}</div></div><div class="context-transfer"><small>Restore ${esc(f.jobs[sw.id].name)} → CPU</small><div class="packets">${Object.entries(incoming).map(([k,v],i)=>`<span class="packet" style="animation-delay:${i*90}ms">${k}<b>${v}</b></span>`).join('')}</div><small>${model.cost?'Saved/restored context · switch cost '+sec(model.cost)+'s':'Animation only · zero simulated switch cost'}</small></div>`;}
 else $('context').innerHTML=`<span class="message">${cpu?`Executing ${esc(cpu.name)} · context preserved across turns`:f.finished?'All CPU and I/O bursts completed.':'CPU is idle while processes have not arrived or wait for I/O.'}</span><small>Quantum ${sec(model.q)}s · switch cost ${sec(model.cost)}s</small>`;
 }

 $('clock').textContent=playing?(time/1000).toLocaleString('en-US',{minimumFractionDigits:1,maximumFractionDigits:1}):sec(time);$('state').textContent=f.finished?'COMPLETE':switching?'CONTEXT SWITCH':playing?'RUNNING':'PAUSED';$('play').textContent=f.finished?'↺ Replay':playing?'Ⅱ Pause':'▶ Play';$('scrubber').value=time;$('duration').textContent=`${sec(time)} / ${sec(model.duration)} s`;$('back').disabled=time===0;$('next').disabled=f.finished;$('finish').disabled=f.finished;document.body.classList.toggle('running',playing);document.body.classList.toggle('fast-playback',playing&&Number($('speed').value)>10);
 let busy=0,overhead=0;for(const s of model.segments){if(s.start>=time)break;const d=Math.min(s.end,time)-s.start;if(s.kind==='run')busy+=d;if(s.kind==='switch')overhead+=d;}
 const completed=f.jobs.filter(j=>j.status==='done').length,switches=model.events.filter(e=>e.kind==='SWITCH'&&e.t<=time).length;
 const stats=[['Completed',`${completed}/${f.jobs.length}`,'processes'],['Useful CPU',time?(100*busy/time).toFixed(1)+'%':'—',`${sec(busy)}s executing`],['Switches',switches,`${sec(overhead)}s overhead`],['Throughput',time?(completed/(time/1000)).toFixed(3):'—','completed / second'],['Idle',sec(time-busy-overhead)+'s','no ready process'],['Total duration',sec(model.duration)+'s','computed schedule']];html('dashboard',stats.map(([a,b,c])=>`<div class="stat"><small>${a}</small><strong>${b}</strong><span>${c}</span></div>`).join(''));
 $('event-time').textContent=`Latest boundary · ${sec(f.eventTime??0)}s`;html('events',f.events.slice(-12).map(e=>`<div class="event"><code>${esc(e.kind)}</code><span>${esc(e.text)}</span></div>`).join(''));
 html('metrics',f.jobs.map(j=>`<tr><td>${badge(j)}</td><td>${j.status}</td><td>${sec(j.total-j.used)}s</td><td>${j.total>j.ioTotal?'CPU-heavy':j.total<j.ioTotal?'I/O-heavy':'Balanced'}</td><td>${j.finish===null?'—':sec(j.finish)}</td><td>${j.finish===null?'—':sec(j.finish-j.arrival)}</td><td>${sec(j.wait)}</td><td>${j.first===null?'—':sec(j.first-j.arrival)}</td></tr>`).join(''));
 const finished=f.jobs.filter(j=>j.finish!==null);$('averages').textContent=f.finished?`Averages · Turnaround ${sec(finished.reduce((a,j)=>a+j.finish-j.arrival,0)/finished.length)}s · Ready wait ${sec(finished.reduce((a,j)=>a+j.wait,0)/finished.length)}s · Response ${sec(finished.reduce((a,j)=>a+j.first-j.arrival,0)/finished.length)}s`:'Times are in seconds. Waiting accumulates only in ready/dispatch states. Final averages appear on completion.';
 renderPCB(f);renderTimeline();moveCards(before,animate);
}
function renderPCB(f){const j=f.jobs[selected]||f.jobs[0],h=j.history.filter(h=>h.t<=time).at(-1),saved=registers({...j,used:h.used});$('inspect').value=j.id;html('pcb',`<div class="pcb-grid">${[['State',j.status],['Priority',j.priority],['Memory',j.memory+' units'],['CPU phase',`${j.phase+1} / ${j.cpu.length}`],['CPU executed',sec(j.used)+'s'],['I/O total',sec(j.ioTotal)+'s']].map(([k,v])=>`<div class="pcb-field"><small>${k}</small>${v}</div>`).join('')}</div><div class="pcb-regs">${regsHTML(saved)}</div><p class="pcb-help">${j.status==='running'?'PCB shows the context at the last scheduling boundary; live registers advance in the processor.':'Saved context stays unchanged while the process is ready or blocked.'} Select a process card to inspect its PCB.</p>`);}
function findSegment(t){let lo=0,hi=model.segments.length-1,r=0;while(lo<=hi){const mid=(lo+hi)>>1;if(model.segments[mid].start<=t){r=mid;lo=mid+1;}else hi=mid-1;}return r;}
function renderTimeline(){const requested=$('window').value,span=requested==='all'?model.duration:Math.min(model.duration,Number(requested)*1000),start=Math.max(0,Math.min(Math.floor(time/span)*span,model.duration-span)),end=start+span;timelineRange={start,span};const key=`${requested}:${start}:${model.duration}`;if(timelineKey===key){updateCursor();return;}timelineKey=key;let i=findSegment(start),visible=[];while(i<model.segments.length&&model.segments[i].start<end){visible.push(model.segments[i++]);}const aggregate=visible.length>250;if(aggregate){visible=Array.from({length:200},(_,k)=>{const a=start+span*k/200,b=start+span*(k+1)/200,s=model.segments[findSegment((a+b)/2)];return {...s,start:a,end:b};});}
 $('timeline').innerHTML=visible.map(s=>{const a=Math.max(start,s.start),b=Math.min(end,s.end),label=s.kind==='run'?model.jobs[s.id].name:s.kind==='switch'?'CS':'Idle';return `<button class="segment ${s.kind}" style="${s.id===null?'':style(s.id)};left:${(a-start)/span*100}%;width:${(b-a)/span*100}%" data-time="${Math.round(a)}" title="${esc(label)} · ${sec(a)}–${sec(b)}s${aggregate?' (overview sample)':''}" aria-label="Inspect ${sec(a)} seconds">${(b-a)/span>.025?esc(label):''}</button>`;}).join('')+Array.from({length:5},(_,k)=>`<span class="timeline-tick" style="left:${2+k*24}%">${sec(start+span*k/4)}</span>`).join('')+`<span class="cursor" style="left:${Math.min(99.8,Math.max(0,(time-start)/span*100))}%"></span>`;
 $('range-label').textContent=`${sec(start)}–${sec(end)}s · ${aggregate?'aggregated overview':visible.length+' segments'}`;$('timeline-note').textContent=aggregate?'Zoom in for exact transitions; colors sample each interval.':'Click a segment to inspect its start.';
}
function updateCursor(){if(!timelineRange)return;const cursor=$('timeline').querySelector('.cursor');if(cursor)cursor.style.left=`${Math.min(99.8,Math.max(0,(time-timelineRange.start)/timelineRange.span*100))}%`;}
function pause(){playing=false;cancelAnimationFrame(clock);clock=null;if(model){$('play').textContent=time===model.duration?'↺ Replay':'▶ Play';document.body.classList.remove('running');}}
function seek(t){pause();const previous=time;time=Math.max(0,Math.min(model.duration,Math.round(t)));render(Math.abs(time-previous)<=Math.max(model.q+model.cost,2000));}
$('play').onclick=()=>{
 if(!model)return;if(playing){pause();render(false);return;}if(time===model.duration){clearFlights();time=0;}
 playing=true;let previous=performance.now();lastRender=0;render(false);
 function frame(now){
  if(!playing)return;const delta=now-previous;previous=now;time=Math.min(model.duration,time+delta*Number($('speed').value));
  $('clock').textContent=(time/1000).toLocaleString('en-US',{minimumFractionDigits:1,maximumFractionDigits:1});$('scrubber').value=Math.round(time);updateCursor();
  if(now-lastRender>=100||time>=model.duration){lastRender=now;const logicalTime=time;render(Number($('speed').value)<=10);time=logicalTime;}
  if(time>=model.duration){pause();render(false);return;}clock=requestAnimationFrame(frame);
 }
 clock=requestAnimationFrame(frame);
};
document.addEventListener('visibilitychange',()=>{if(document.hidden&&playing){pause();render(false);}});
window.addEventListener('resize',clearFlights);window.addEventListener('scroll',clearFlights,{passive:true});
$('next').onclick=()=>{if(model)seek(model.events.find(e=>e.t>time)?.t??model.duration);};$('back').onclick=()=>{if(model)seek(model.events.filter(e=>e.t<time).at(-1)?.t??0);};$('reset').onclick=()=>model&&seek(0);$('finish').onclick=()=>model&&seek(model.duration);$('go').onclick=()=>{const n=Number($('jump').value);if(!Number.isFinite(n)||n<0||n>model.duration/1000){$('error').textContent='Jump time must be within the computed schedule.';return;}seek(n*1000);};$('scrubber').oninput=e=>model&&seek(Number(e.target.value));$('window').onchange=()=>{timelineKey='';if(model)renderTimeline();};$('timeline').onclick=e=>{const el=e.target.closest('[data-time]');if(el)seek(Number(el.dataset.time));};$('inspect').onchange=e=>{selected=Number(e.target.value);render(false);};document.querySelector('.stage').onclick=e=>{const el=e.target.closest('[data-job]');if(el){selected=Number(el.dataset.job);render(false);}};
$('present').onclick=()=>{const on=document.body.classList.toggle('present');$('present').textContent=on?'↙ Exit presentation':'⛶ Present';window.scrollTo({top:0,behavior:'smooth'});};
function download(name,text,type){const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('export-input').onclick=()=>{try{normalize(input,{quantum:$('quantum').value,cost:$('cost').value});download('rr-workload.csv',csvExport(input),'text/csv');}catch(e){$('error').textContent=e.message;}};
$('export-results').onclick=()=>{if(!model)return;download('rr-results.json',JSON.stringify({units:'internal times are milliseconds',configuration:activeInput,summary:{duration:model.duration,cpu:model.busy,overhead:model.overhead,idle:model.idle,switches:model.switches},processes:model.jobs.map(({history,...j})=>j),timeline:model.segments,events:model.events},null,2),'application/json');};
$('import').onclick=()=>$('file').click();$('file').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>1000000)throw Error('CSV files must be under 1 MB.');const jobs=csvImport(await file.text());normalize(jobs,{quantum:$('quantum').value,cost:$('cost').value});input=jobs;rows();build();}catch(error){$('error').textContent=error.message;}e.target.value='';};
$('tests').onclick=()=>{pause();$('test-results').textContent='Running deterministic regression tests…';setTimeout(()=>{const results=runTests();$('test-results').innerHTML=`<b>${results.filter(r=>r.pass).length}/${results.length} checks passed</b>`+results.map(r=>`<div class="test-line ${r.pass?'pass':'fail'}">${r.pass?'✓':'✗'} ${esc(r.name)}${r.error?' — '+esc(r.error):''}</div>`).join('');},20);};
document.addEventListener('keydown',e=>{if(['INPUT','SELECT','TEXTAREA','BUTTON'].includes(document.activeElement.tagName))return;if(e.code==='Space'){e.preventDefault();$('play').click();}if(e.key==='ArrowRight')$('next').click();if(e.key==='Escape'&&document.body.classList.contains('present'))$('present').click();});
rows();build();
