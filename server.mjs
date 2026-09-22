import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {extname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {QUESTIONS,choicesFor} from './questions.mjs';
const root=fileURLToPath(new URL('.',import.meta.url)), rooms=new Map();
const json=(r,s,x)=>{r.writeHead(s,{'content-type':'application/json; charset=utf-8'});r.end(JSON.stringify(x))};
const body=async q=>{let s='';for await(const c of q)s+=c;return JSON.parse(s||'{}')};
const shuffle=a=>a.sort(()=>Math.random()-.5), code=()=>Math.random().toString(36).slice(2,7).toUpperCase();
const adj=(a,b)=>{let ar=Math.floor(a/6),br=Math.floor(b/6);return Math.abs(ar-br)+Math.abs(a%6-b%6)===1};
function next(g){g.turn=1-g.turn;let c=g.countries[g.turn];if(!c.bag.length)c.bag=shuffle(c.players.map((_,i)=>i));g.player=c.bag.pop();g.phase='choose';g.question=null;g.targets=[];g.double=false;g.options=null;g.note='اختر أرضًا ملاصقة لدولتك';}
function publicState(g,host=false){let x=structuredClone(g);if(!host&&x.question)delete x.question.answer;return x}
function pick(g,cat,diff){let excluded=new Set([...g.excluded,...g.used]);let pool=QUESTIONS.filter(q=>q.category===cat&&q.difficulty===diff&&!excluded.has(q.id));if(!pool.length)pool=QUESTIONS.filter(q=>q.category===cat&&!excluded.has(q.id));return pool[Math.floor(Math.random()*pool.length)]}
async function api(req,res,url){
 let p=url.pathname.split('/').filter(Boolean);
 if(req.method==='POST'&&url.pathname==='/api/create'){let b=await body(req),id=code(),token=crypto.randomUUID();let cats=[...new Set(QUESTIONS.map(q=>q.category))];let lands=Array.from({length:24},(_,i)=>({owner:[0,6,12,18].includes(i)?0:[5,11,17,23].includes(i)?1:null,category:cats[i%cats.length]}));let countries=b.countries.map(c=>({...c,helps:{consult:2,choices:1,time:1,double:1},bag:shuffle(c.players.map((_,i)=>i))}));let g={room:id,phase:'choose',turn:1,player:0,countries,lands,targets:[],question:null,used:[],excluded:b.excluded||[],note:'',winner:null};next(g);rooms.set(id,{token,g});return json(res,200,{room:id,token,state:publicState(g,true)});}
 let rm=rooms.get(p[1]);if(!rm)return json(res,404,{error:'الغرفة غير موجودة'});let host=req.headers['x-host-token']===rm.token,g=rm.g;
 if(req.method==='GET')return json(res,200,publicState(g,host));if(!host)return json(res,403,{error:'غير مصرح'});let b=await body(req),a=b.action;
 if(a==='target'){if(g.phase!=='choose')return json(res,400,{error:'ليس وقت الاختيار'});let i=+b.index,own=g.lands.map((l,j)=>l.owner===g.turn?j:-1).filter(j=>j>=0);if(!own.some(j=>adj(j,i)))return json(res,400,{error:'اختر أرضًا ملاصقة لدولتك'});g.targets=[i];return json(res,200,publicState(g,true));}
 if(a==='helper'){let h=b.helper,c=g.countries[g.turn];if(!c.helps[h])return json(res,400,{error:'المساعدة منتهية'});if(h==='double'){if(g.phase!=='choose'||!g.targets.length)return json(res,400,{error:'اختر الأرض الأولى قبل دبلها'});let i=+b.index;if(!adj(g.targets[0],i)||i===g.targets[0])return json(res,400,{error:'الأرض الثانية يجب أن تلاصق الأولى'});g.targets.push(i);g.double=true;}else if(!g.question)return json(res,400,{error:'ابدأ السؤال أولًا'});c.helps[h]--;if(h==='choices')g.options=choicesFor(g.question,QUESTIONS);if(h==='time')g.endsAt+=15000;if(h==='consult')g.note='سُمح بالمشاورة لهذا السؤال';return json(res,200,publicState(g,true));}
 if(a==='ask'){if(!g.targets.length)return json(res,400,{error:'اختر أرضًا'});let land=g.lands[g.targets[0]],q=pick(g,land.category,b.difficulty||'medium');if(!q)return json(res,409,{error:'انتهت الأسئلة الجديدة في هذا القسم'});g.question=q;g.used.push(q.id);g.phase='question';g.endsAt=Date.now()+30000;g.note='يجيب اللاعب المختار دون نقاش';return json(res,200,publicState(g,true));}
 if(a==='answer'&&g.question){if(b.correct){for(const i of g.targets)g.lands[i].owner=g.turn;g.note='إجابة صحيحة!';let n=g.lands.filter(l=>l.owner===g.turn).length;if(n>=13){g.phase='finished';g.winner=g.turn}else next(g)}else{g.phase='steal';g.note='انتقل السؤال للدولة الأخرى، والمشاورة مسموحة';g.endsAt=Date.now()+30000;}return json(res,200,publicState(g,true));}
 if(a==='steal'&&g.phase==='steal'){if(b.correct)g.lands[g.targets[0]].owner=1-g.turn;next(g);return json(res,200,publicState(g,true));}
 return json(res,400,{error:'طلب غير صحيح'});
}
const mime={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml'};
http.createServer(async(req,res)=>{try{let u=new URL(req.url,'http://x');if(u.pathname.startsWith('/api/'))return await api(req,res,u);let f=u.pathname==='/'?'index.html':u.pathname.slice(1);let d=await readFile(join(root,f));res.writeHead(200,{'content-type':mime[extname(f)]||'application/octet-stream'});res.end(d)}catch(e){json(res,500,{error:e.message})}}).listen(process.env.PORT||3000);
