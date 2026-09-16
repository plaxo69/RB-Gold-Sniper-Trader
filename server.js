const express = require("express");
const cors = require("cors");
const path = require("path");
const axios = require("axios");
const { Pool } = require("pg");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
const DATABASE_URL = process.env.DATABASE_URL;
const STRATEGY_VERSION = "adaptive-v1";

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.static(PUBLIC_DIR, { index: "index.html" }));
app.get("/", (_req, res) => res.sendFile(path.join(PUBLIC_DIR, "index.html")));

const pool = DATABASE_URL ? new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3, idleTimeoutMillis: 10000, connectionTimeoutMillis: 5000 }) : null;

const TF = {
  "1m": { interval: "1m", range: "7d" },
  "3m": { interval: "1m", range: "7d" },
  "5m": { interval: "5m", range: "1mo" },
  "15m": { interval: "15m", range: "1mo" },
  "1h": { interval: "60m", range: "3mo" }
};

function aggregate3m(candles) {
  const out = [];
  for (const c of candles) {
    const bucket = Math.floor(new Date(c.timestamp).getTime() / 180000) * 180000;
    let g = out[out.length - 1];
    if (!g || g.bucket !== bucket) {
      g = { bucket, timestamp: new Date(bucket).toISOString(), open:c.open, high:c.high, low:c.low, close:c.close, volume:c.volume||0 };
      out.push(g);
    } else {
      g.high=Math.max(g.high,c.high); g.low=Math.min(g.low,c.low); g.close=c.close; g.volume+=c.volume||0;
    }
  }
  return out.map(({bucket,...c})=>c);
}

async function yahoo(timeframe) {
  const cfg=TF[timeframe];
  const symbol="GC=F";
  const url=`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`;
  const response=await axios.get(url,{params:{interval:cfg.interval,range:cfg.range,includePrePost:true,events:"div,splits"},timeout:10000,headers:{"User-Agent":"Mozilla/5.0 RB-Gold-Sniper/2.2"}});
  const result=response.data?.chart?.result?.[0];
  if(!result)throw new Error("Yahoo Finance não devolveu dados do ouro (GC=F)");
  const q=result.indicators?.quote?.[0]||{};
  let candles=(result.timestamp||[]).map((ts,i)=>({timestamp:new Date(ts*1000).toISOString(),open:Number(q.open?.[i]),high:Number(q.high?.[i]),low:Number(q.low?.[i]),close:Number(q.close?.[i]),volume:Number(q.volume?.[i]||0)})).filter(c=>[c.open,c.high,c.low,c.close].every(Number.isFinite));
  if(timeframe==="3m")candles=aggregate3m(candles);
  candles=candles.slice(-300);
  if(!candles.length)throw new Error("Yahoo Finance não devolveu candles válidos para GC=F");
  const meta=result.meta||{};
  const last=candles[candles.length-1];
  const livePrice=Number(meta.regularMarketPrice);
  if(Number.isFinite(livePrice))last.close=livePrice;
  return {source:"Yahoo Finance — Gold Futures (GC=F), sem API key",symbol,timeframe,candles,last};
}

async function market(timeframe){if(!TF[timeframe])throw new Error("Timeframe inválido");return yahoo(timeframe)}

function dbReady(){return Boolean(pool)}
function cleanTrade(input){
  if(!input || !["BUY","SELL"].includes(input.type)) throw new Error("Tipo de trade inválido");
  if(!Number.isFinite(Number(input.price)) || !Number.isFinite(Number(input.tp)) || !Number.isFinite(Number(input.sl))) throw new Error("Entrada, TP e SL são obrigatórios");
  return {
    signalKey:String(input.signalKey||`${input.type}-${Number(input.price).toFixed(2)}-${String(input.time||"").slice(0,16)}`).slice(0,180),
    type:input.type, createdAt:input.time||new Date().toISOString(), entryPrice:Number(input.price), tp:Number(input.tp), sl:Number(input.sl), rr:Number.isFinite(Number(input.rr))?Number(input.rr):null,
    confidence:Number.isFinite(Number(input.confidence))?Number(input.confidence):null, rsi:Number.isFinite(Number(input.rsi))?Number(input.rsi):null, atr:Number.isFinite(Number(input.atr))?Number(input.atr):null,
    ema20:Number.isFinite(Number(input.ema20))?Number(input.ema20):null, ema50:Number.isFinite(Number(input.ema50))?Number(input.ema50):null, ema200:Number.isFinite(Number(input.ema200))?Number(input.ema200):null,
    support:Number.isFinite(Number(input.support))?Number(input.support):null, resistance:Number.isFinite(Number(input.resistance))?Number(input.resistance):null,
    trend3:input.trend3||null, trend5:input.trend5||null, trend15:input.trend15||null, trend1:input.trend1||null, score:Number.isFinite(Number(input.score))?Number(input.score):null,
    source:input.source||"candles reais fechados", timeframe:input.timeframe||"1m", strategyVersion:input.strategyVersion||STRATEGY_VERSION,
    filters:input.filters||{}, reasons:input.reasons||[], rejectionReasons:input.rejectionReasons||[], rawSignal:input
  };
}

async function saveTrade(input){
  if(!dbReady()) return {saved:false,reason:"DATABASE_URL não configurada"};
  const t=cleanTrade(input);
  const q=`INSERT INTO sniper_trades (signal_key,created_at,type,status,entry_price,tp,sl,rr,confidence,rsi,atr,ema20,ema50,ema200,support,resistance,trend3,trend5,trend15,trend1,score,source,timeframe,strategy_version,filters,reasons,rejection_reasons,raw_signal) VALUES ($1,$2,'${t.type}','ALERTA',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27) ON CONFLICT (signal_key) DO NOTHING RETURNING id,created_at,status`;
  const values=[t.signalKey,t.createdAt,t.entryPrice,t.tp,t.sl,t.rr,t.confidence,t.rsi,t.atr,t.ema20,t.ema50,t.ema200,t.support,t.resistance,t.trend3,t.trend5,t.trend15,t.trend1,t.score,t.source,t.timeframe,t.strategyVersion,JSON.stringify(t.filters),JSON.stringify(t.reasons),JSON.stringify(t.rejectionReasons),JSON.stringify(t.rawSignal)];
  const result=await pool.query(q,values);
  return {saved:true,inserted:result.rowCount>0,id:result.rows[0]?.id||null};
}

async function getTrades(limit=200){
  if(!dbReady()) return [];
  const n=Math.min(Math.max(Number(limit)||200,1),1000);
  const result=await pool.query(`SELECT id,signal_key AS "signalKey",created_at AS "time",resolved_at AS "resolvedAt",type,status,entry_price AS price,tp,sl,rr,confidence,rsi,atr,ema20,ema50,ema200,support,resistance,trend3,trend5,trend15,trend1,score,source,timeframe,max_price AS "maxPrice",min_price AS "minPrice",outcome_reason AS "outcomeReason",strategy_version AS "strategyVersion",filters,reasons,rejection_reasons AS "rejectionReasons" FROM sniper_trades ORDER BY created_at DESC LIMIT $1`,[n]);
  return result.rows;
}

async function resolveTrades(){
  if(!dbReady()) return {resolved:0};
  const open=(await pool.query(`SELECT id,type,created_at,entry_price,tp,sl FROM sniper_trades WHERE status='ALERTA' ORDER BY created_at ASC LIMIT 500`)).rows;
  if(!open.length) return {resolved:0};
  const m=await market("1m");
  let resolved=0;
  for(const t of open){
    const created=new Date(t.created_at).getTime();
    const candles=m.candles.filter(c=>new Date(c.timestamp).getTime()>created);
    let result=null, resolvedAt=null, reason=null, maxPrice=null, minPrice=null;
    for(const c of candles){
      maxPrice=maxPrice===null?c.high:Math.max(maxPrice,c.high);
      minPrice=minPrice===null?c.low:Math.min(minPrice,c.low);
      const tpHit=t.type==='BUY'?c.high>=t.tp:c.low<=t.tp;
      const slHit=t.type==='BUY'?c.low<=t.sl:c.high>=t.sl;
      if(tpHit&&slHit){result='EXPIRADA';reason='TP e SL atingidos na mesma vela de 1m; resultado marcado como ambíguo';resolvedAt=c.timestamp;break}
      if(tpHit){result='WIN';reason='TP atingido';resolvedAt=c.timestamp;break}
      if(slHit){result='LOSS';reason='SL atingido';resolvedAt=c.timestamp;break}
    }
    if(!result){
      const age=Date.now()-created;
      if(age>=6*60*60*1000){result='EXPIRADA';reason='Sem TP/SL após 6 horas';resolvedAt=new Date().toISOString()}
    }
    if(result){await pool.query(`UPDATE sniper_trades SET status=$1,resolved_at=$2,max_price=$3,min_price=$4,outcome_reason=$5 WHERE id=$6`,[result,resolvedAt,maxPrice,minPrice,reason,t.id]);resolved++}
  }
  return {resolved};
}

app.get("/api/health",async(_req,res)=>{try{const m=await market("1m");res.json({status:"OK",marketConnected:true,historyDatabase:dbReady(),source:m.source,symbol:m.symbol,aiEnabled:false,mode:"ALERTAS",timestamp:new Date().toISOString()})}catch(e){res.status(503).json({status:"DEGRADED",marketConnected:false,historyDatabase:dbReady(),aiEnabled:false,mode:"ALERTAS",error:e.message})}});
app.get("/api/market",async(req,res)=>{const timeframe=String(req.query.timeframe||"1m");try{const m=await market(timeframe);res.json({success:true,source:m.source,symbol:m.symbol,timeframe,candles:m.candles,price:m.last.close,bid:null,ask:null,spread:null,timestamp:m.last.timestamp})}catch(e){res.status(502).json({success:false,error:"Não foi possível obter dados do ouro.",details:e.message})}});
app.post("/api/trades",async(req,res)=>{try{const result=await saveTrade(req.body);res.status(result.saved?200:503).json({success:result.saved,...result})}catch(e){res.status(400).json({success:false,error:e.message})}});
app.get("/api/trades",async(req,res)=>{try{const trades=await getTrades(req.query.limit);res.json({success:true,database:dbReady(),trades})}catch(e){res.status(503).json({success:false,error:e.message,trades:[]})}});
app.post("/api/trades/resolve",async(_req,res)=>{try{const result=await resolveTrades();res.json({success:true,...result})}catch(e){res.status(503).json({success:false,error:e.message})}});
app.get("/api/trades/stats",async(_req,res)=>{try{if(!dbReady())return res.status(503).json({success:false});const r=await pool.query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status='WIN')::int AS wins, COUNT(*) FILTER (WHERE status='LOSS')::int AS losses, COUNT(*) FILTER (WHERE status='EXPIRADA')::int AS expired, COUNT(*) FILTER (WHERE status='ALERTA')::int AS open FROM sniper_trades`);res.json({success:true,stats:r.rows[0]})}catch(e){res.status(503).json({success:false,error:e.message})}});
app.get("/api/settings",(_req,res)=>res.json({success:true,settings:{mode:"ALERTAS",aiEnabled:false,historyDatabase:dbReady(),source:"Yahoo Finance",symbol:"GC=F",chart:"OANDA:XAUUSD",strategyVersion:STRATEGY_VERSION}}));
app.use((req,res)=>res.status(404).json({error:"Endpoint não encontrado",path:req.path}));
app.use((err,_req,res,_next)=>res.status(500).json({error:"Erro interno",message:err.message}));
if(require.main===module)app.listen(PORT,()=>console.log(`RB Gold Sniper ativo em ${PORT}`));
module.exports=app;
