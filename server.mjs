import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {extname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {QUESTIONS} from './questions.mjs';
const root=fileURLToPath(new URL('.',import.meta.url)),rooms=new Map();
const json=(r,s,x)=>{r.writeHead(s,{'content-type':'application/json; charset=utf-8'});r.end(JSON.stringify(x))};
const body=async q=>{let s='';for await(const c of q)s+=c;return JSON.parse(s||'{}')};
const shuffle=a=>a.sort(()=>Math.random()-.5),code=()=>Math.random().toString(36).slice(2,7).toUpperCase();
const adj=(a,b)=>Math.abs(Math.floor(a/6)-Math.floor(b/6))+Math.abs(a%6-b%6)===1;
const nums={الاولى:1,الاول:1,واحد:1,واحده:1,الثاني:2,الثانيه:2,اثنان:2,اثنين:2,الثالث:3,الثالثه:3,ثلاثه:3,الرابع:4,الرابعه:4,اربعه:4,الخامس:5,الخامسه:5,خمسه:5,السادس:6,السادسه:6,سته:6,السابع:7,السابعه:7,سبعه:7,الثامن:8,الثامنه:8,ثمانيه:8,التاسع:9,التاسعه:9,تسعه:9,العاشر:10,العاشره:10,عشره:10};
const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u064B-\u065F\u0670]/g,'').replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').replace(/ى/g,'ي').replace(/[،,.!?]/g,' ').split(/\s+/).filter(Boolean).map(w=>nums[w]??w).filter(w=>!['السنه','سنه','العام','عام','عدد','الهجريه','للهجره'].includes(String(w)));
const correct=(given,answer)=>{let a=norm(given),b=norm(answer),aa=a.join(''),bb=b.join('');if(!aa)return false;let an=a.filter(x=>typeof x==='number'),bn=b.filter(x=>typeof x==='number');return an.some(x=>bn.includes(x))||aa===bb||bb.includes(aa)||aa.includes(bb)};
function publicState(g){let x=structuredClone(g);for(let i=0;i<x.lands.length;i++){if(!x.lands[i].bonusRevealed)delete x.lands[i].bonus;delete x.lands[i].difficulty}if(x.phase==='duel'&&!x.answerShown&&x.question)delete x.question.answer;return x}
function seedBonuses(lands){let open=shuffle(lands.map((l,i)=>l.owner===null?i:-1).filter(i=>i>=0)).slice(0,10),types=['hint','twoAnswers','consult','double'];open.forEach((i,n)=>lands[i].bonus=types[n%4]);return lands}
function revealBonus(g,i){let l=g.lands[i];if(!l.bonus||l.bonusRevealed)return '';l.bonusRevealed=true;g.countries[g.turn].helps[l.bonus]++;return l.bonus==='hint'?'وجدتم ميزة غششني!':l.bonus==='twoAnswers'?'وجدتم ميزة إجابتين!':l.bonus==='consult'?'وجدتم ميزة المشاورة!':'وجدتم ميزة دبلها!'}
function pick(g,cat,diff){let excluded=new Set([...g.excluded,...g.used]),pool=QUESTIONS.filter(q=>q.category===cat&&q.difficulty===diff&&!excluded.has(q.id));if(!pool.length)pool=QUESTIONS.filter(q=>q.category===cat&&!excluded.has(q.id));return pool[Math.floor(Math.random()*pool.length)]}
function next(g){g.turn=1-g.turn;let c=g.countries[g.turn];if(!c.bag.length)c.bag=shuffle(c.players.map((_,i)=>i));g.player=c.bag.pop();g.phase='draw';g.question=null;g.targets=[];g.double=false;g.attack=false;g.hint=null;g.twoAnswers=false;g.answerShown=false;g.note='جاري سحب اللاعب...'}
function record(g,team,player,started){if(player==null)return;let s=g.countries[team].stats[player];s.correct++;s.totalMs+=Math.max(0,Date.now()-started)}
function winnerInfo(g){let list=[];g.countries.forEach((c,team)=>c.players.forEach((name,i)=>list.push({name,team,correct:c.stats[i].correct,avgMs:c.stats[i].correct?Math.round(c.stats[i].totalMs/c.stats[i].correct):null})));list.sort((a,b)=>b.correct-a.correct||(a.avgMs??Infinity)-(b.avgMs??Infinity));return list[0]}
function captured(g,team){return g.lands.filter(l=>l.owner===team).length}
function afterCapture(g){let win=captured(g,g.turn)>=13?g.turn:null;g.pendingWinner=win;g.phase='mapResult';g.note='تم تحديث الخريطة'}
async function api(req,res,url){
 const p=url.pathname.split('/').filter(Boolean);
 if(req.method==='POST'&&url.pathname==='/api/create'){
  let b=await body(req),id=code(),token=crypto.randomUUID(),cats=[...new Set(QUESTIONS.map(q=>q.category))],levels=['easy','medium','hard'];
  let lands=seedBonuses(Array.from({length:24},(_,i)=>({owner:[2,3,20,21].includes(i)?0:[6,11,12,17].includes(i)?1:null,category:cats[i%cats.length],difficulty:levels[Math.floor(Math.random()*3)]})));
  let countries=b.countries.map(c=>({...c,helps:{consult:0,hint:0,twoAnswers:0,double:0},bag:shuffle(c.players.map((_,i)=>i)),stats:c.players.map(()=>({correct:0,totalMs:0}))}));
  let g={room:id,phase:'draw',turn:1,player:0,countries,lands,targets:[],question:null,used:[],excluded:b.excluded||[],winner:null,pendingWinner:null};next(g);rooms.set(id,{token,g});return json(res,200,{room:id,token,state:publicState(g)});
 }
 let rm=rooms.get(p[1]);if(!rm)return json(res,404,{error:'الغرفة غير موجودة'});let g=rm.g;if(req.method==='GET')return json(res,200,publicState(g));if(req.headers['x-host-token']!==rm.token)return json(res,403,{error:'غير مصرح'});let b=await body(req),a=b.action;
 if(a==='reveal'&&g.phase==='draw'){g.phase='choose';g.note='اختر أرضًا محايدة أو هاجم أرضًا مجاورة للخصم';return json(res,200,publicState(g))}
 if(a==='armDouble'&&g.phase==='choose'&&!g.targets.length){let c=g.countries[g.turn];if(!c.helps.double)return json(res,400,{error:'لا تملك ميزة دبلها'});c.helps.double--;g.double=true;g.note='دبلها مفعّلة';return json(res,200,publicState(g))}
 if(a==='target'&&g.phase==='choose'){
  let i=+b.index,l=g.lands[i],own=g.lands.map((x,j)=>x.owner===g.turn?j:-1).filter(j=>j>=0);if(l.owner===g.turn)return json(res,400,{error:'هذه الأرض ملككم'});
  if(g.double&&g.targets.length===1){if(l.owner!==null||!adj(g.targets[0],i))return json(res,400,{error:'الأرض الثانية يجب أن تكون محايدة ومجاورة للأولى'});g.targets.push(i);let bonus=revealBonus(g,i);g.phase='countdown';g.note=bonus||'تم اختيار الأرضين';return json(res,200,publicState(g))}
  if(!own.some(j=>adj(j,i)))return json(res,400,{error:'اختر أرضًا ملاصقة لإحدى أراضيكم'});
  if(l.owner===1-g.turn){if(g.double)return json(res,400,{error:'لا تستخدم دبلها عند مهاجمة الخصم'});g.targets=[i];g.attack=true;g.phase='countdown';g.note='مواجهة أسرع إجابة على أرض الخصم';return json(res,200,publicState(g))}
  g.targets=[i];let bonus=revealBonus(g,i);if(g.double)g.note=(bonus?bonus+' — ':'')+'اختر الأرض الثانية';else{g.phase='countdown';g.note=bonus||'تم اختيار الأرض'}return json(res,200,publicState(g));
 }
 if(a==='start'&&g.phase==='countdown'){let land=g.lands[g.targets[0]],q=pick(g,land.category,land.difficulty);if(!q)return json(res,409,{error:'انتهت الأسئلة الجديدة في هذا القسم'});g.question=q;g.used.push(q.id);g.phase=g.attack?'duel':'question';g.endsAt=Date.now()+(g.attack?20000:30000);g.startedAt=Date.now();g.note=g.attack?'أسرع إجابة — الحكم يحدد من أجاب أولًا':'أجيبوا خلال 30 ثانية';return json(res,200,publicState(g))}
 if(a==='helper'&&g.phase==='question'){let c=g.countries[g.turn],h=b.helper;if(!c.helps[h])return json(res,400,{error:'لا تملكون هذه الميزة'});c.helps[h]--;if(h==='hint')g.hint=String(g.question.answer).trim().charAt(0);if(h==='twoAnswers')g.twoAnswers=true;if(h==='consult')g.note='المشاورة مسموحة';return json(res,200,publicState(g))}
 if(a==='submit'&&g.phase==='question'){let ok=correct(b.text,g.question.answer)||(g.twoAnswers&&correct(b.text2,g.question.answer));g.lastResult={id:Date.now(),correct:ok,final:ok,answer:g.question.answer};if(ok){for(const i of g.targets)g.lands[i].owner=g.turn;record(g,g.turn,g.player,g.startedAt);afterCapture(g)}else{g.phase='steal';g.hint=null;g.twoAnswers=false;g.endsAt=Date.now()+30000;g.startedAt=Date.now();g.note='انتقل السؤال للدولة الأخرى، والمشاورة مسموحة'}return json(res,200,publicState(g))}
 if(a==='steal'&&g.phase==='steal'){let ok=correct(b.text,g.question.answer);g.lastResult={id:Date.now(),correct:ok,final:true,answer:g.question.answer};if(ok){let team=1-g.turn;g.lands[g.targets[0]].owner=team;g.pendingWinner=captured(g,team)>=13?team:null;g.phase='mapResult';g.note='تم تحديث الخريطة'}else next(g);return json(res,200,publicState(g))}
 if(a==='revealAnswer'&&g.phase==='duel'){g.answerShown=true;return json(res,200,publicState(g))}
 if(a==='duelResult'&&g.phase==='duel'){let who=b.team===null?null:+b.team;if(who===g.turn){g.lands[g.targets[0]].owner=g.turn;record(g,g.turn,g.player,g.startedAt);g.lastResult={id:Date.now(),correct:true,final:true,answer:g.question.answer};afterCapture(g)}else{g.lastResult={id:Date.now(),correct:false,final:true,answer:g.question.answer};g.phase='mapResult';g.note=who===1-g.turn?'نجح المدافع وبقيت الأرض له':'لم تتغير ملكية الأرض'}return json(res,200,publicState(g))}
 if(a==='continue'&&g.phase==='mapResult'){if(g.pendingWinner!==null){g.winner=g.pendingWinner;g.bestPlayer=winnerInfo(g);g.phase='finished'}else next(g);return json(res,200,publicState(g))}
 return json(res,400,{error:'طلب غير صحيح'});
}
const mime={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.png':'image/png','.svg':'image/svg+xml'};
http.createServer(async(req,res)=>{try{let u=new URL(req.url,'http://x');if(u.pathname.startsWith('/api/'))return await api(req,res,u);let f=u.pathname==='/'?'index.html':u.pathname.slice(1),d=await readFile(join(root,f));res.writeHead(200,{'content-type':mime[extname(f)]||'application/octet-stream'});res.end(d)}catch(e){json(res,500,{error:e.message})}}).listen(process.env.PORT||3000);
