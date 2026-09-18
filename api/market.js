const axios = require("axios");

// XAUUSD market feed.
// Biquote exposes XAUUSD candles and live MT5-based ticks without an API key.
// TradingView remains OANDA:XAUUSD visually; analysis uses the same XAUUSD feed.
const BASE = "https://biquote.io/api";
const SYMBOL = "XAUUSD";
const TF = {
  "1m": { interval: "1m", stale: 150 },
  "5m": { interval: "5m", stale: 720 },
  "15m": { interval: "15m", stale: 1500 },
  "1h": { interval: "1h", stale: 5400 }
};
const cache = new Map();
const inflight = new Map();
const CACHE_MS = 5000;
const LIMIT = 300;

function finite(v) { return Number.isFinite(Number(v)); }
function valid(c) {
  return [c.open,c.high,c.low,c.close].every(finite) &&
    c.open > 0 && c.high >= Math.max(c.open,c.close) &&
    c.low <= Math.min(c.open,c.close) && c.high >= c.low;
}
function clean(a) {
  return a.filter(valid)
    .sort((a,b)=>Date.parse(a.timestamp)-Date.parse(b.timestamp))
    .filter((c,i,s)=>i===0 || c.timestamp!==s[i-1].timestamp);
}
async function request(path, params={}) {
  return axios.get(`${BASE}/${path}`, {
    params, timeout: 9000,
    headers: { Accept:"application/json", "User-Agent":"RB-Gold-Sniper/5.0" }
  });
}
async function fetchCandles(timeframe) {
  const cfg=TF[timeframe];
  if(!cfg) throw new Error("Timeframe inválido");

  const [br,tr]=await Promise.all([
    request(`${SYMBOL}/ohlc`, { interval:cfg.interval, limit:LIMIT }),
    request(SYMBOL, { allowStale:false })
  ]);
  const bars=Array.isArray(br.data?.bars)?br.data.bars:[];
  if(!bars.length) throw new Error("Biquote não devolveu candles XAUUSD");

  const candles=clean(bars.map(b=>({
    timestamp:new Date(b.openTime).toISOString(),
    open:Number(b.open), high:Number(b.high), low:Number(b.low), close:Number(b.close),
    volume:Number(b.volume||0),
    complete:b.isOpen!==true
  }))).slice(-LIMIT);
  if(candles.length<50) throw new Error(`Biquote devolveu poucos candles (${candles.length})`);

  const now=Date.now();
  const last=candles[candles.length-1];
  const candleTs=Date.parse(last.timestamp);
  const age=Math.max(0,Math.round((now-candleTs)/1000));
  const tick=tr.data||{};
  const livePrice=Number(tick.mid);
  const price=Number.isFinite(livePrice)?livePrice:last.close;
  const quoteAge=Number(tick.quoteAgeSeconds||0);
  const marketState=tick.marketState||"unknown";

  return {
    success:true,
    source:"Biquote XAUUSD — feed MT5",
    symbol:SYMBOL,
    displaySymbol:"OANDA:XAUUSD",
    timeframe,candles,last,
    price:Number.isFinite(price)?price:last.close,
    delayedBy:age,
    candleTimestamp:last.timestamp,
    quoteTimestamp:tick.timestamp||new Date().toISOString(),
    candleAgeSec:age,
    candleStartAgeSec:age,
    quoteAgeSec:Number.isFinite(quoteAge)?quoteAge:0,
    stale:age>cfg.stale || quoteAge>300,
    marketState,
    oandaLive:false,
    feedNotice:"Preço e candles XAUUSD pelo feed Biquote/MT5; TradingView mostra OANDA:XAUUSD"
  };
}
async function getMarket(timeframe) {
  if(!TF[timeframe]) throw new Error("Timeframe inválido");
  const key=`biquote:${SYMBOL}:${timeframe}`;
  const hit=cache.get(key);
  if(hit&&Date.now()-hit.t<CACHE_MS) return hit.v;
  if(inflight.has(key)) return inflight.get(key);
  const p=fetchCandles(timeframe).then(v=>{
    cache.set(key,{t:Date.now(),v}); inflight.delete(key); return v;
  }).catch(e=>{inflight.delete(key);throw e;});
  inflight.set(key,p); return p;
}
async function handler(req,res){
  res.setHeader("Cache-Control","no-store, max-age=0");
  try{
    const timeframe=String(req.query.timeframe||"1m");
    const m=await getMarket(timeframe);
    res.status(200).json(m);
  }catch(e){
    console.error("MARKET ERROR",e.message);
    res.status(502).json({success:false,error:"Falha no feed XAUUSD",details:e.message,source:"Biquote XAUUSD"});
  }
}
handler.getMarket=getMarket;
module.exports=handler;
