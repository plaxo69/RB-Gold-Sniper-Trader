(()=>{
const KEY='rb_gold_sniper_signals_v1',COOLDOWN=15*60*1000,ROOM_ATR=.75;
const ts=v=>{if(v==null)return NaN;if(typeof v==='number')return v<1e12?v*1000:v;const n=Number(v);if(Number.isFinite(n))return n<1e12?n*1000:n;const d=Date.parse(v);return Number.isFinite(d)?d:NaN};
const history=()=>{try{const x=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(x)?x.filter(t=>t&&['BUY','SELL'].includes(t.type)).sort((a,b)=>ts(b.signalTimestamp??b.time)-ts(a.signalTimestamp??a.time)):[]}catch{return[]}};
function atr(c,p=14){if(!Array.isArray(c)||c.length<p+1)return NaN;const r=[];for(let i=1;i<c.length;i++){const x=c[i],q=c[i-1].close;r.push(Math.max(x.high-x.low,Math.abs(x.high-q),Math.abs(x.low-q)))}return r.slice(-p).reduce((s,x)=>s+x,0)/p}
function levels(c,p=20){const x=c.slice(-(p+1),-1);return x.length<p?null:{support:Math.min(...x.map(v=>v.low)),resistance:Math.max(...x.map(v=>v.high))}}
function guard(c,a,dir){
 const h=history(),last=h[0],sameLoss=h.find(x=>x.type===dir&&x.status==='LOSS'),now=ts(c.at(-1)?.timestamp);
 if(last?.status==='ALERTA')return`já existe ${last.type} aberto`;
 const lt=ts(last?.signalTimestamp??last?.time);
 if(Number.isFinite(lt)&&Number.isFinite(now)&&now-lt<COOLDOWN)return'aguardar novo ciclo após sinal anterior';
 if(sameLoss){
  const resolved=ts(sameLoss.resolvedAt),ev=a?.tactical?.[dir==='BUY'?'buyEvent':'sellEvent'];
  const et=ev&&c[ev.index]?ts(c[ev.index].timestamp):NaN;
  if(!Number.isFinite(resolved)||!Number.isFinite(et)||et<=resolved)return`${dir} bloqueado após SL — exige novo breakout`;
 }
 return null;
}
function roomGuard(c,dir){
 const closed=c.slice(0,-1),sig=closed.at(-1),A=atr(closed),S=levels(closed);
 if(!sig||!Number.isFinite(A)||!S)return null;
 if(dir==='BUY'&&sig.close<S.resistance){const room=S.resistance-sig.close;if(room<A*ROOM_ATR)return`BUY bloqueado — apenas ${room.toFixed(2)} até à resistência (mínimo ${ (A*ROOM_ATR).toFixed(2) })`}
 if(dir==='SELL'&&sig.close>S.support){const room=sig.close-S.support;if(room<A*ROOM_ATR)return`SELL bloqueado — apenas ${room.toFixed(2)} até ao suporte (mínimo ${ (A*ROOM_ATR).toFixed(2) })`}
 return null;
}
function wrap(){
 const api=window.RBGoldSniper;if(!api||typeof api.analyze!=='function'||api.analyze.__learningGuard)return;
 const original=api.analyze;
 function analyze(main,m5,m15,h1){
  const a=original(main,m5,m15,h1);if(!a)return a;
  const f=a.filters||{},t=a.tactical||{},closed=Array.isArray(main)?main.length-2:-1;
  let block=null;
  if(a.type==='BUY'){
   if(t.buyRetestIndex==null)block='BUY sem pullback/reteste confirmado';
   else if(t.buyConfirmationIndex!==closed)block='BUY sem confirmação no último M1 fechado';
   else if(!(f.m5Buy&&f.m15Buy))block='BUY sem alinhamento M5 + M15';
   else if(f.h1Sell)block='BUY contra H1';
   else if(!(f.bosBuy||f.chochBuy))block='BUY sem BOS/CHOCH confirmado';
   else block=roomGuard(main,'BUY')||guard(main,a,'BUY');
  }else if(a.type==='SELL'){
   if(t.sellRetestIndex==null)block='SELL sem pullback/reteste confirmado';
   else if(t.sellConfirmationIndex!==closed)block='SELL sem confirmação no último M1 fechado';
   else if(!(f.m5Sell&&f.m15Sell))block='SELL sem alinhamento M5 + M15';
   else if(f.h1Buy)block='SELL contra H1';
   else if(!(f.bosSell||f.chochSell))block='SELL sem BOS/CHOCH confirmado';
   else block=roomGuard(main,'SELL')||guard(main,a,'SELL');
  }
  if(block){
   a.type='WAIT';a.score=0;a.confidence=0;a.sl=null;a.tp=null;a.tp1=null;a.tp2=null;a.rr=null;a.rr1=null;a.rr2=null;a.tp2Eligible=false;
   a.rejectionReasons=[block,...(a.rejectionReasons||[]).filter(x=>x!==block)];
   a.reasons=[];a.setupState='SEM SETUP';a.armedDirection=null;a.learning={blocked:true,reason:block};
  }else if(a.type==='BUY'||a.type==='SELL')a.learning={blocked:false,rule:'strict sniper: breakout → pullback → confirmação + M5/M15 + H1 + BOS/CHOCH + espaço até à zona',cooldownMs:COOLDOWN,roomAtr:ROOM_ATR};
  return a;
 }
 analyze.__learningGuard=true;api.analyze=analyze;
}
if(window.RBGoldSniper)wrap();else window.addEventListener('load',wrap);
})();
