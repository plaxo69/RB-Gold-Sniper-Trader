const webpush=require('web-push');
const axios=require('axios');
const marketModule=require('./market');
const REPO='plaxo69/RB-Gold-Sniper-Trader',BRANCH='main',PATH='historico-trades.json',API='https://api.github.com';
const PROD_AUD='https://rb-gold-sniper-trader.vercel.app/api/monitor';
let analyzerLoaded=false;

function out(res,status,body){return res.status(status).json(body)}
function ts(v){if(v==null)return NaN;if(typeof v==='number')return v<1e12?v*1000:v;const n=Number(v);if(Number.isFinite(n))return n<1e12?n*1000:n;const d=Date.parse(v);return Number.isFinite(d)?d:NaN}
function keyOf(t){return t?.signalKey||t?.key||((t?.type||'')+'-'+(t?.signalTimestamp||t?.time||''))}
function movementKey(a){const t=a?.tactical||{},side=a?.type||'WAIT',ev=side==='BUY'?t.buyEvent:t.sellEvent,level=side==='BUY'?t.buyLevel:t.sellLevel;if(ev?.type&&Number.isFinite(+level))return side+'-'+ev.type+'-'+Number(level).toFixed(2);if(Number.isFinite(+level))return side+'-LEVEL-'+Number(level).toFixed(2);return side+'-STRUCT-'+Number(a?.support||0).toFixed(2)+'-'+Number(a?.resistance||0).toFixed(2)}
function normalize(t){if(!t)return t;const s=String(t.status||'ALERTA').toUpperCase();if(['WIN','LOSS','ALERTA'].includes(s))return{...t,status:s};if(s==='BE')return{...t,status:'BE',outcomeReason:t.outcomeReason||'Trade fechada em BE'};if(s==='EXPIRADA')return{...t,status:'LOSS',outcomeReason:t.outcomeReason||'Resultado EXPIRADA legado convertido para LOSS'};return{...t,status:'ALERTA'}}
function readHistory(token){
 return fetch(API+'/repos/'+REPO+'/contents/'+PATH+'?ref='+BRANCH,{headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'RB-TRADER-PRO-MONITOR'}})
 .then(async r=>{if(r.status===404)return{trades:[],sha:null};const d=await r.json();if(!r.ok)throw Error(d.message||'Falha ao ler histórico');const raw=Buffer.from(d.content||'','base64').toString('utf8');let p={};try{p=JSON.parse(raw)}catch{};return{trades:Array.isArray(p)?p:(Array.isArray(p.trades)?p.trades:[]),sha:d.sha||null}})
}
async function writeHistory(token,trades,sha,message){
 const headers={Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json','User-Agent':'RB-TRADER-PRO-MONITOR'};
 const payload={exportedAt:new Date().toISOString(),source:'RB TRADER PRO',formatVersion:2,total:trades.length,trades};
 const body={message,content:Buffer.from(JSON.stringify(payload,null,2),'utf8').toString('base64'),branch:BRANCH,...(sha?{sha}:{})};
 const r=await fetch(API+'/repos/'+REPO+'/contents/'+PATH,{method:'PUT',headers,body:JSON.stringify(body)});
 const d=await r.json();if(!r.ok)throw Error(d.message||'Falha ao gravar histórico');return d;
}
async function sendPush(title,body,tag,subsToken){
 const r=await fetch(API+'/repos/'+REPO+'/contents/push-subscriptions.json?ref='+BRANCH,{headers:{Authorization:'Bearer '+subsToken,Accept:'application/vnd.github+json','User-Agent':'RB-TRADER-PRO-MONITOR'}});
 if(r.status===404)return 0;const d=await r.json();if(!r.ok)throw Error(d.message||'Falha ao ler subscriptions');
 let subs=[];try{subs=JSON.parse(Buffer.from(d.content||'','base64').toString('utf8'))}catch{}
 if(!Array.isArray(subs)||!subs.length)return 0;
 webpush.setVapidDetails(process.env.VAPID_SUBJECT||'mailto:rbtraderpro@users.noreply.github.com',process.env.VAPID_PUBLIC_KEY,process.env.VAPID_PRIVATE_KEY);
 const payload=JSON.stringify({title,body,url:'/',tag});
 let sent=0;for(const s of subs){try{await webpush.sendNotification(s,payload);sent++}catch{}}
 return sent;
}
function ensureAnalyzer(){
 if(analyzerLoaded)return;
 global.window=global;global.localStorage={getItem:()=>JSON.stringify(global.__RB_HISTORY||[]),setItem:()=>{},removeItem:()=>{}};
 require('../public/sniper-v2.js');require('../public/ai-sniper.js');analyzerLoaded=true;
}
function mergeOne(trades,t){
 const k=keyOf(t);if(!k)return trades;const i=trades.findIndex(x=>keyOf(x)===k);if(i<0)trades.push(t);else{const old=normalize(trades[i]),nw=normalize(t);trades[i]=old.status==='ALERTA'&&nw.status!=='ALERTA'?nw:nw.status==='ALERTA'&&old.status!=='ALERTA'?old:nw}return trades;
}
async function verifyGitHubOIDC(req){
 const auth=String(req.headers.authorization||'');if(!auth.startsWith('Bearer '))throw Object.assign(Error('OIDC em falta'),{status:401});
 const token=auth.slice(7);const {jwtVerify,createRemoteJWKSet}=await import('jose');
 const JWKS=createRemoteJWKSet(new URL('https://token.actions.githubusercontent.com/.well-known/jwks'));
 const {payload}=await jwtVerify(token,JWKS,{issuer:'https://token.actions.githubusercontent.com',audience:PROD_AUD});
 if(payload.repository!==REPO||payload.ref!=='refs/heads/main')throw Object.assign(Error('GitHub Actions não autorizado'),{status:403});
 return payload;
}
async function runMonitor(){
 const gh=process.env.GITHUB_TOKEN;if(!gh)throw Error('GITHUB_TOKEN não configurado');
 ensureAnalyzer();
 const h=await readHistory(gh),trades=h.trades.map(normalize);
 global.__RB_HISTORY=trades;
 const m1=await marketModule.getMarket('1m',500),m5=await marketModule.getMarket('5m',500),m15=await marketModule.getMarket('15m',500),h1=await marketModule.getMarket('1h',500);
 const result={checkedAt:new Date().toISOString(),marketState:m1.marketState,price:m1.price,events:[]};
 let changed=false;
 let active=trades.filter(t=>['BUY','SELL'].includes(t.type)&&t.status==='ALERTA').sort((a,b)=>(ts(b.signalTimestamp||b.time)||0)-(ts(a.signalTimestamp||a.time)||0))[0]||null;
 if(active){
   const created=ts(active.signalTimestamp||active.time);const live=await marketModule.getMarket('1m',2000,Number.isFinite(created)?new Date(created).toISOString():null,new Date().toISOString());
   const candles=(live.candles||[]).filter(c=>ts(c.timestamp)>created);
   const entry=Number(active.price),sl=Number(active.sl),tp=Number(active.tp);
   let outcome=null,when=null,reason='';
   for(const c of candles){const hi=Number(c.high),lo=Number(c.low);const hitTP=active.type==='BUY'?hi>=tp:lo<=tp;const hitSL=active.type==='BUY'?lo<=sl:hi>=sl;if(hitTP&&hitSL){outcome='LOSS';reason='TP e SL tocados no mesmo candle; resultado conservador = LOSS';when=c.timestamp;break}if(hitTP){outcome='WIN';reason='TP atingido';when=c.timestamp;break}if(hitSL){outcome='LOSS';reason='SL atingido';when=c.timestamp;break}}
   if(outcome){active.status=outcome;active.resolvedAt=when;active.outcomeReason=reason;delete active.beAlerted;changed=true;result.events.push(outcome==='WIN'?'WIN':'LOSS');await sendPush(outcome==='WIN'?'RB TRADER PRO — WIN':'RB TRADER PRO — LOSS',outcome==='WIN'?'🟢 TP atingido — trade fechada com WIN':'🔴 SL atingido — trade fechada com LOSS','rb-result-'+keyOf(active),gh);active=null}
 }
 if(active){
   const entry=Number(active.price),tp=Number(active.tp),dist=Math.abs(tp-entry);
   let beWhen=null,bePrice=null;
   if(dist>0){for(const c of candles){const hi=Number(c.high),lo=Number(c.low),fav=active.type==='BUY'?hi-entry:entry-lo;if(Number.isFinite(fav)&&fav>=dist*.50){beWhen=c.timestamp;bePrice=active.type==='BUY'?hi:lo;break}}}
   if(!beWhen&&m1.marketState==='open'&&Number.isFinite(m1.price)){const fav=active.type==='BUY'?m1.price-entry:entry-m1.price;if(dist>0&&fav>=dist*.50){beWhen=new Date().toISOString();bePrice=m1.price}}
   if(beWhen){active.status='BE';active.resolvedAt=beWhen;active.beTriggeredAt=beWhen;active.beTriggerPrice=bePrice;active.outcomeReason='Proteção BE atingida — trade fechada em BE';delete active.beAlerted;delete active.beArmed;changed=true;result.events.push('BE');await sendPush('RB TRADER PRO — BE',(active.type==='BUY'?'📈 COMPRA':'📉 VENDA')+' atingiu a zona de BE — trade fechada em BE','rb-be-'+keyOf(active),gh);active=null}
 }
 if(!active&&m1.marketState==='open'&&m1.realOpenBar===true&&Number(m1.quoteAgeSec)<=15&&m1.stale!==true&&Number(m1.candleAgeSec)<=150){
   global.__RB_HISTORY=trades;
   const base=global.RBGoldSniper.analyze(m1.candles,m5.candles,m15.candles,h1.candles);
   const a=global.RBTraderProAI.attach(base,{m1:m1.candles,m5:m5.candles,m15:m15.candles,h1:h1.candles});
   let signal=a;
   if(signal?.type==='WAIT'&&signal?.aiOpportunity)signal=signal.aiOpportunity;
   if(signal&&['BUY','SELL'].includes(signal.type)){
     const k=(signal.source==='IA'?'IA-':'')+signal.type+'-'+signal.signalTimestamp;
     const exists=trades.some(t=>keyOf(t)===k||t.signalKey===k);
     const previous=trades.filter(t=>['BUY','SELL'].includes(t.type)&&ts(t.signalTimestamp||t.time)<ts(signal.signalTimestamp)).sort((x,y)=>(ts(y.signalTimestamp||y.time)||0)-(ts(x.signalTimestamp||x.time)||0))[0];
     const sameMove=previous&&previous.type===signal.type&&previous.movementKey===movementKey(signal);
     const allowedReentry=!sameMove||((previous.status==='WIN')&&Number(previous.reentryCount||0)<2);
     if(!exists&&allowedReentry){
       const rec={...signal,key:k,signalKey:k,movementKey:movementKey(signal),status:'ALERTA',time:signal.signalTimestamp,reentryCount:sameMove?Number(previous.reentryCount||0)+1:0,serverMonitor:true};
       trades.push(rec);global.__RB_HISTORY=trades;changed=true;result.events.push('TRADE');await sendPush('RB TRADER PRO — '+signal.type,signal.type==='BUY'?'📈 NOVA COMPRA XAU/USD':'📉 NOVA VENDA XAU/USD','rb-trade-'+k,gh);
     }
   }
 }
 if(changed){trades.sort((a,b)=>(ts(b.signalTimestamp||b.time)||0)-(ts(a.signalTimestamp||a.time)||0));await writeHistory(gh,trades.slice(0,500),h.sha,'RB TRADER PRO — monitor servidor '+new Date().toISOString())}
 result.activeTrade=active?{type:active.type,status:active.status,price:active.price,tp:active.tp,sl:active.sl}:null;
 result.changed=changed;return result;
}
module.exports=async function(req,res){
 if(req.method!=='POST')return out(res,405,{ok:false,error:'Method not allowed'});
 try{await verifyGitHubOIDC(req);const r=await runMonitor();return out(res,200,{ok:true,...r})}catch(e){console.error('MONITOR ERROR',e);return out(res,e.status||500,{ok:false,error:e.message||'Monitor error'})}
};