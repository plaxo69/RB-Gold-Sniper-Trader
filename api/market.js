const axios = require("axios");

// XAUUSD market feed.
// Biquote supplies XAUUSD candles plus a live MT5-based quote.
// TradingView remains OANDA:XAUUSD visually. Sniper strategy is unchanged.
const BASE="https://biquote.io/api";
const SYMBOL="XAUUSD";
const TF={"1m":{interval:"1m",stale:150},"5m":{interval:"5m",stale:720},"15m":{interval:"15m",stale:1500},"1h":{interval:"1h",stale:5400}};
const cache=new Map(),inflight=new Map();
const CACHE_MS=5000,LIMIT=300;
function finite(v){return Number.isFinite(Number(v))}
function valid(c){return [c.open,c.high,c.low,c.close].every(finite)&&c.open>0&&c.high>=Math.max(c.open,c.close)&&c.low<=Math.min(c.open,c.close)&&c.high>=c.low}
function clean(a){return a.filter(valid).sort((a,b)=>Date.parse(a.timestamp)-Date.parse(b.timestamp)).filter((c,i,s)=>i===0||c.timestamp!==s[i-1].timestamp)}
async function request(path,params={}){return axios.get(`${BASE}/${path}`,{params,timeout:9000,headers:{Accept:"application/json","User-Agent":"RB-Gold-Sniper/5.2"}})}
async function fetchCandles(timeframe){
  const cfg=TF[timeframe];if(!cfg)throw new Error("Timeframe inválido");
  const [br,tr]=await Promise.all([request(`${SYMBOL}/ohlc`,{interval:cfg.interval,limit:LIMIT}),request(SYMBOL,{allowStale:false})]);
  const bars=Array.isArray(br.data?.bars)?br.data.bars:[];if(!bars.length)throw new Error("Biquote não devolveu candles XAUUSD");
  let candles=clean(bars.map(b=>({timestamp:new Date(b.openTime).toISOString(),open:Number(b.open),high:Number(b.high),low:Number(b.low),close:Number(b.close),volume:Number(b.volume||0),complete:b.isOpen!==true}))).slice(-LIMIT);
  if(candles.length<50)throw new Error(`Biquote devolveu poucos candles (${candles.length})`);
  const now=Date.now(),tick=tr.data||{},livePrice=Number(tick.mid),quoteAge=Number(tick.quoteAgeSeconds||0),marketState=tick.marketState||"unknown";
  const last=candles[candles.length-1],lastTs=Date.parse(last.timestamp),age=Math.max(0,Math.round((now-lastTs)/1000));

  // Biquote can publish the live MT5 tick before its official M1 bar.
  // For M1 only, when that tick is fresh, create the CURRENT in-progress
  // candle from the last known close. This is a trigger candle, not invented
  // historical data. M5/M15/H1 are never synthesized.
  let effectiveAge=age,liveM1=false;
  if(timeframe==="1m"&&Number.isFinite(livePrice)&&quoteAge<=15&&age>60&&age<=900){
    const minuteStart=Math.floor(now/60000)*60000;
    if(minuteStart>lastTs){
      const base=Number(last.close);
      candles=[...candles.slice(0,-1),{timestamp:new Date(minuteStart).toISOString(),open:base,high:Math.max(base,livePrice),low:Math.min(base,livePrice),close:livePrice,volume:Number(last.volume||0),complete:false,liveSynthetic:true}];
      effectiveAge=0;liveM1=true;
    }
  }
  const effectiveLast=candles[candles.length-1],price=Number.isFinite(livePrice)?livePrice:effectiveLast.close;
  const stale=quoteAge>300||(timeframe!=="1m"&&effectiveAge>cfg.stale)||(timeframe==="1m"&&effectiveAge>cfg.stale);
  return {success:true,source:"Biquote XAUUSD — feed MT5",symbol:SYMBOL,displaySymbol:"OANDA:XAUUSD",timeframe,candles,last:effectiveLast,price:Number.isFinite(price)?price:effectiveLast.close,delayedBy:effectiveAge,candleTimestamp:effectiveLast.timestamp,quoteTimestamp:tick.timestamp||new Date().toISOString(),candleAgeSec:effectiveAge,candleStartAgeSec:effectiveAge,quoteAgeSec:Number.isFinite(quoteAge)?quoteAge:0,stale,marketState,liveM1,oandaLive:false,feedNotice:"XAUUSD/MT5 com preço ao vivo; M1 usa o tick fresco para o candle em formação quando o oficial atrasa; M5/M15/H1 permanecem oficiais; TradingView mostra OANDA:XAUUSD"};
}
async function getMarket(timeframe){
  if(!TF[timeframe])throw new Error("Timeframe inválido");
  const key=`biquote:${SYMBOL}:${timeframe}`,hit=cache.get(key);if(hit&&Date.now()-hit.t<CACHE_MS)return hit.v;if(inflight.has(key))return inflight.get(key);
  const p=fetchCandles(timeframe).then(v=>{cache.set(key,{t:Date.now(),v});inflight.delete(key);return v}).catch(e=>{inflight.delete(key);throw e});inflight.set(key,p);return p;
}
async function handler(req,res){res.setHeader("Cache-Control","no-store, max-age=0");try{const timeframe=String(req.query.timeframe||"1m"),m=await getMarket(timeframe);res.status(200).json(m)}catch(e){console.error("MARKET ERROR",e.message);res.status(502).json({success:false,error:"Falha no feed XAUUSD",details:e.message,source:"Biquote XAUUSD"})}}
handler.getMarket=getMarket;module.exports=handler;
