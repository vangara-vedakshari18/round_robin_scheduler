/* Round Robin discrete-event simulator. All internal times are integer milliseconds. */
(function(root){
const LIMIT=200000;
function ticks(n,label,zero=true){if(!Number.isFinite(Number(n))||String(n).trim()===''||Number(n)<(zero?0:.001)||Number(n)>1e6||Math.abs(Number(n)*1000-Math.round(Number(n)*1000))>1e-5)throw Error(label+': use a number from '+(zero?'0':'0.001')+' to 1,000,000, with at most 3 decimals.');return Math.round(Number(n)*1000);}
function normalize(input,options={}){
 if(!Array.isArray(input)||!input.length||input.length>100)throw Error('Provide between 1 and 100 processes.');
 const names=new Set();const jobs=input.map((j,id)=>{const name=String(j.name||'P'+(id+1)).trim();if(!/^[\w -]{1,20}$/.test(name)||names.has(name))throw Error('Use unique process names (letters, digits, spaces, hyphens; 1–20 characters).');names.add(name);
 const list=v=>Array.isArray(v)?v:String(v??'').trim()?String(v).split(/[;/|]/).map(s=>s.trim()):[];
 const cpu=list(j.cpu??j.burst).map(v=>ticks(v,name+' CPU burst',false)),io=list(j.io).map(v=>ticks(v,name+' I/O burst',false));
 if(!cpu.length||cpu.length>50||io.length!==cpu.length-1)throw Error(name+': enter one I/O burst between each pair of CPU bursts (e.g. CPU 5/4, I/O 3).');
 const priority=Number(j.priority??3),memory=Number(j.memory??64);if(!Number.isSafeInteger(priority)||priority<0||priority>999||!Number.isSafeInteger(memory)||memory<0||memory>1e9)throw Error(name+': priority must be 0–999 and memory 0–1,000,000,000.');
 return {id,name,arrival:ticks(j.arrival,'Arrival'),cpu,io,priority,memory,total:cpu.reduce((a,b)=>a+b,0),ioTotal:io.reduce((a,b)=>a+b,0)};});
 return {jobs,q:ticks(options.quantum??1,'Quantum',false),cost:ticks(options.cost??0,'Switch cost')};
}
function simulate(input,options={}){
 const cfg=normalize(input,options),{q,cost}=cfg;
 const jobs=cfg.jobs.map(j=>({...j,phase:0,left:j.cpu[0],used:0,status:'new',wake:null,order:0,first:null,finish:null,wait:0,readyAt:null,history:[]}));
 const pending=[...jobs].sort((a,b)=>a.arrival-b.arrival||a.id-b.id),queue=[],segments=[],events=[];let next=0,t=0,order=0,running=null,last=null,slice=q,switches=0,dispatches=0,busy=0,overhead=0,idle=0;
 function record(j){const state={t,status:j.status,used:j.used,left:j.left,phase:j.phase,wake:j.wake,order:j.order,first:j.first,finish:j.finish,wait:j.wait,readyAt:j.readyAt};if(j.history.at(-1)?.t===t)j.history[j.history.length-1]=state;else j.history.push(state);}
 function event(kind,j,text,from=null){if(events.length>=LIMIT)throw Error('This workload exceeds 200,000 scheduling events. Increase the quantum or reduce the number of jobs/bursts.');events.push({t,kind,id:j?.id??null,from,text});}
 function ready(j,kind){j.status='ready';j.wake=null;j.readyAt=t;j.order=order++;queue.push(j);record(j);event(kind,j,`${j.name} joins the tail of the ready queue.`);}
 function arrivals(){while(next<pending.length&&pending[next].arrival<=t)ready(pending[next++],'ARRIVAL');jobs.filter(j=>j.status==='blocked'&&j.wake<=t).sort((a,b)=>a.wake-b.wake||a.id-b.id).forEach(j=>ready(j,'I/O COMPLETE'));}
 function external(){return Math.min(next<pending.length?pending[next].arrival:Infinity,...jobs.filter(j=>j.status==='blocked').map(j=>j.wake));}
 function segment(kind,end,id=null,from=null){if(end<=t)return;const prev=segments.at(-1);if(prev&&prev.kind===kind&&prev.id===id&&prev.from===from&&prev.end===t)prev.end=end;else segments.push({start:t,end,kind,id,from});t=end;}
 jobs.forEach(record);
 while(true){
  arrivals();
  if(running){
   if(running.left===0){const j=running;last=j.id;running=null;if(j.phase<j.io.length){j.status='blocked';j.wake=t+j.io[j.phase];j.phase++;j.left=j.cpu[j.phase];event('I/O REQUEST',j,`${j.name} blocks for I/O; CPU becomes available.`);}else{j.status='done';j.finish=t;event('SIGINT',j,`${j.name} completes; release the process.`);}record(j);}
   else if(slice===0){if(queue.length){const j=running;last=j.id;running=null;event('SAVE',j,`Save ${j.name}'s PC and registers to its PCB; SIGTSTP suspends it.`);ready(j,'REQUEUE');}else slice=q;}
  }
  if(!running&&queue.length){const j=queue.shift();dispatches++;if(last!==null&&last!==j.id){switches++;event('SWITCH',j,`Switch CPU context from ${jobs[last].name} to ${j.name}.`,last);if(cost){j.status='switching';record(j);const end=t+cost;while(t<end){const stop=Math.min(end,external());segment('switch',stop,j.id,last);arrivals();}overhead+=cost;}}
   j.wait+=t-j.readyAt;j.readyAt=null;j.status='running';if(j.first===null)j.first=t;event(j.used===0?'START':'RESTORE',j,j.used===0?`Start ${j.name}; load its initial context.`:`Restore ${j.name}'s saved context; SIGCONT resumes execution.`,last);running=j;slice=q;record(j);
  }
  if(!running){const wake=external();if(wake===Infinity)break;last=null;event('IDLE',null,'CPU idle until the next arrival or I/O completion.');idle+=wake-t;segment('idle',wake);continue;}
  const ext=external();let delta;
  if(queue.length)delta=Math.min(running.left,slice,ext-t);
  else delta=Math.min(running.left,ext-t); // Skip repeated quanta with no competitor.
  if(!(delta>0))throw Error('Scheduler did not advance.');
  running.left-=delta;running.used+=delta;busy+=delta;
  slice=delta<slice?slice-delta:((delta-slice)%q===0?0:q-(delta-slice)%q);
  segment('run',t+delta,running.id);record(running);
 }
 event('COMPLETE',null,'All processes have completed.');
 return {jobs,segments,events,duration:t,q,cost,switches,dispatches,busy,overhead,idle};
}
function lastAt(array,time,key='t'){let lo=0,hi=array.length-1,found=-1;while(lo<=hi){const mid=(lo+hi)>>1;if(array[mid][key]<=time){found=mid;lo=mid+1;}else hi=mid-1;}return found;}
function inspect(model,time){const t=Math.max(0,Math.min(model.duration,Math.round(time)));const si=lastAt(model.segments,t,'start');const seg=model.segments[si];const active=seg&&t<seg.end?seg:null;
 const jobs=model.jobs.map(j=>{const h=j.history[Math.max(0,lastAt(j.history,t))];let used=h.used,left=h.left;if(h.status==='running'&&active?.kind==='run'&&active.id===j.id){used+=t-h.t;left-=t-h.t;}return {...j,...h,used,left,wait:h.wait+(h.readyAt===null?0:t-h.readyAt)};});
 const ei=lastAt(model.events,t);const eventTime=model.events[ei]?.t;let start=ei;while(start>0&&model.events[start-1].t===eventTime)start--;
 return {t,jobs,active,events:model.events.slice(Math.max(0,start),ei+1),eventTime,ready:jobs.filter(j=>j.status==='ready').sort((a,b)=>a.order-b.order),finished:t===model.duration};
}
function registers(j){const n=Math.floor(j.used/10);return {PC:'0x'+(4096+j.id*4096+n*4).toString(16).toUpperCase(),SP:'0x'+(65536-j.id*256).toString(16).toUpperCase(),R0:n,R1:(j.id+1)*17+n,FLAGS:n===0?'Z':'NZ'};}
function csvExport(jobs){return 'name,arrival,priority,memory,cpu,io\n'+jobs.map(j=>[j.name,j.arrival,j.priority,j.memory,Array.isArray(j.cpu)?j.cpu.join('/'):j.cpu,Array.isArray(j.io)?j.io.join('/'):j.io||''].join(',')).join('\n');}
function csvImport(text){const lines=text.replace(/^\uFEFF/,'').trim().split(/\r?\n/).filter(l=>l.trim());if(lines[0]?.trim().toLowerCase()!=='name,arrival,priority,memory,cpu,io')throw Error('Expected CSV header: name,arrival,priority,memory,cpu,io');return lines.slice(1).map((line,i)=>{const v=line.split(',').map(x=>x.trim());if(v.length!==6)throw Error('CSV row '+(i+2)+' must have 6 fields. Use / between bursts.');return {name:v[0],arrival:v[1],priority:v[2],memory:v[3],cpu:v[4],io:v[5]};});}
const API={simulate,inspect,registers,normalize,csvExport,csvImport};if(typeof module!=='undefined')module.exports=API;else Object.assign(root,API);
})(typeof self!=='undefined'?self:this);
