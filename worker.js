const REPO = "plaxo69/RB-Gold-Sniper-Trader";
const HISTORY_PATH = "historico-trades.json";
// Histórico em branch dedicada: evita commits de cada trade na branch de deploy/Vercel.
function historyBranch(env) { return String(env.GITHUB_HISTORY_BRANCH || "rb-trader-history").trim() || "rb-trader-history"; }
const GH_API = "https://api.github.com";
const MARKET_BASE = "https://biquote.io/api";
// Partilha a cotação entre os pedidos M1/M5/M15/H1 disparados ao mesmo tempo pelo browser.
let quoteCache = null;
let quoteInflight = null;
const QUOTE_CACHE_MS = 5000;
async function getSharedQuote() {
  if (quoteCache && Date.now() - quoteCache.at < QUOTE_CACHE_MS) return quoteCache.value;
  if (quoteInflight) return quoteInflight;
  quoteInflight = fetch(`${MARKET_BASE}/XAUUSD?allowStale=true`, {headers:{Accept:"application/json","User-Agent":"RB-Gold-Sniper/5.3"}})
    .then(async r => { if (!r.ok) throw new Error(`Fornecedor Biquote: cotação HTTP ${r.status}`); const value = await r.json(); quoteCache = {at:Date.now(),value}; return value; })
    .finally(() => { quoteInflight = null; });
  return quoteInflight;
}
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type,Authorization" };
const tfConfig = {
  "1m": { interval: "1m", stale: 150 }, "5m": { interval: "5m", stale: 720 },
  "15m": { interval: "15m", stale: 1500 }, "1h": { interval: "1h", stale: 5400 }
};
function json(body, status=200, extra={}) { return new Response(JSON.stringify(body), { status, headers: { "Content-Type":"application/json; charset=utf-8", "Cache-Control":"no-store", ...corsHeaders, ...extra } }); }
function decodeBase64(s) { const raw = atob(String(s||"").replace(/\s/g,"")); const bytes = Uint8Array.from(raw, c=>c.charCodeAt(0)); return new TextDecoder().decode(bytes); }
function encodeBase64(s) { const bytes = new TextEncoder().encode(s); let raw=""; for(let i=0;i<bytes.length;i+=0x8000) raw += String.fromCharCode(...bytes.subarray(i,i+0x8000)); return btoa(raw); }
async function github(path, env, init={}) {
  if (!env.GITHUB_TOKEN) throw new Error("GITHUB_TOKEN não configurado nos Secrets do Cloudflare.");
  return fetch(`${GH_API}/repos/${REPO}/contents/${path}`, { ...init, headers: { Authorization:`Bearer ${env.GITHUB_TOKEN}`, Accept:"application/vnd.github+json", "X-GitHub-Api-Version":"2022-11-28", "User-Agent":"RB-TRADER-PRO-CLOUDFLARE", ...(init.headers||{}) } });
}
async function getHistory(env, limit=1000) {
  const branch = historyBranch(env);
  const r = await github(`${HISTORY_PATH}?ref=${encodeURIComponent(branch)}`, env);
  if(r.status===404) return {ok:true,trades:[],total:0,source:"github",branch};
  const d=await r.json(); if(!r.ok) throw new Error(d.message||"Falha ao ler histórico do GitHub");
  let p={}; try{p=JSON.parse(decodeBase64(d.content));}catch{}
  const trades=Array.isArray(p)?p:(Array.isArray(p.trades)?p.trades:[]);
  return {ok:true,trades:trades.slice(-limit),total:trades.length,source:"github",branch:"main",exportedAt:p?.exportedAt||null};
}
function keyOf(t){return t?.signalKey||t?.key||((t?.type||"")+"-"+(t?.signalTimestamp||t?.time||""))}
function timeOf(t){const n=Date.parse(t?.signalTimestamp??t?.time??0);return Number.isFinite(n)?n:0}
async function saveHistory(env, incoming) {
  const branch=historyBranch(env);
  const path=`${HISTORY_PATH}?ref=${encodeURIComponent(branch)}`;
  const existing=await github(path,env);
  let sha=null, remote=[];
  if(existing.ok){const d=await existing.json();sha=d.sha||null;try{const p=JSON.parse(decodeBase64(d.content));remote=Array.isArray(p.trades)?p.trades:Array.isArray(p)?p:[];}catch{}}
  else if(existing.status!==404){const d=await existing.json().catch(()=>({}));throw new Error(d.message||"Não foi possível consultar o histórico");}
  const map=new Map();
  for(const t of [...remote,...incoming]) {
    const k=keyOf(t); if(!k) continue;
    const old=map.get(k);
    if(!old) { map.set(k,t); continue; }
    const oldStatus=String(old.status||"ALERTA"), nextStatus=String(t.status||"ALERTA");
    let chosen;
    if(oldStatus!=="ALERTA" && nextStatus==="ALERTA") chosen=old;
    else if(oldStatus==="ALERTA" && nextStatus!=="ALERTA") chosen=t;
    else chosen={...old,...t};
    map.set(k,{
      ...chosen,
      indicatorSnapshot:chosen.indicatorSnapshot||old.indicatorSnapshot||t.indicatorSnapshot,
      indicatorSnapshotVersion:chosen.indicatorSnapshotVersion||old.indicatorSnapshotVersion||t.indicatorSnapshotVersion,
      beAlerted:!!(old.beAlerted||t.beAlerted),
      beArmed:!!(old.beArmed||t.beArmed),
      bePushSent:!!(old.bePushSent||t.bePushSent),
      beTriggeredAt:old.beTriggeredAt||t.beTriggeredAt,
      beTriggerPrice:old.beTriggerPrice!=null?old.beTriggerPrice:t.beTriggerPrice,
      beAlertMessage:old.beAlertMessage||t.beAlertMessage
    });
  }
  const trades=[...map.values()].sort((a,b)=>timeOf(b)-timeOf(a)).slice(0,500);
  const payload={exportedAt:new Date().toISOString(),source:"RB TRADER PRO",formatVersion:2,total:trades.length,trades};
  const put=await github(HISTORY_PATH,env,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:"RB TRADER PRO — atualizar histórico de trades",content:encodeBase64(JSON.stringify(payload,null,2)),branch,...(sha?{sha}:{})})});
  const d=await put.json();if(!put.ok)throw new Error(d.message||"Falha ao gravar histórico");
  return {ok:true,branch,path:HISTORY_PATH,total:trades.length,commit:d.commit?.sha||null,url:d.content?.html_url||null};
}
async function market(tf) {
  const cfg=tfConfig[tf]; if(!cfg) throw new Error("Timeframe inválido");
  const [barsRes,tick]=await Promise.all([
    fetch(`${MARKET_BASE}/XAUUSD/ohlc?interval=${cfg.interval}&limit=500`,{headers:{Accept:"application/json","User-Agent":"RB-Gold-Sniper/5.3"}}),
    getSharedQuote()
  ]);
  if(!barsRes.ok) throw new Error(`Fornecedor Biquote: candles ${cfg.interval} HTTP ${barsRes.status}`);
  const bd=await barsRes.json();
  const bars=Array.isArray(bd?.bars)?bd.bars:[];
  const candles=bars.map(b=>({timestamp:new Date(b.openTime).toISOString(),open:Number(b.open),high:Number(b.high),low:Number(b.low),close:Number(b.close),volume:Number(Number(b.volume)>0?b.volume:(Number.isFinite(Number(b.tickVolume))?b.tickVolume:0)),tickVolume:Number.isFinite(Number(b.tickVolume))?Number(b.tickVolume):0,realVolume:Number.isFinite(Number(b.volume))?Number(b.volume):0,volumeSource:Number(b.volume)>0?"REAL":(Number.isFinite(Number(b.tickVolume))?"TICK_VOLUME":"UNAVAILABLE"),complete:b.isOpen!==true,isOpen:b.isOpen===true}))
    .filter(c=>[c.open,c.high,c.low,c.close].every(Number.isFinite)&&c.open>0&&c.high>=Math.max(c.open,c.close)&&c.low<=Math.min(c.open,c.close)&&c.high>=c.low)
    .sort((a,b)=>Date.parse(a.timestamp)-Date.parse(b.timestamp))
    .filter((c,i,a)=>i===0||c.timestamp!==a[i-1].timestamp).slice(-500);
  if(candles.length<50) throw new Error(`Biquote devolveu poucos candles XAUUSD (${candles.length})`);
  const last=candles[candles.length-1], age=Math.max(0,Math.round((Date.now()-Date.parse(last.timestamp))/1000));
  const quoteAge=Number(tick.quoteAgeSeconds), marketState=String(tick.marketState||"unknown").toLowerCase();
  const stale=marketState!=="open"||!Number.isFinite(quoteAge)||quoteAge>300||age>cfg.stale||(tf==="1m"&&last.isOpen!==true&&age>60);
  const price=Number(tick.mid);
  return {success:true,source:"Biquote XAUUSD — feed MT5",symbol:"XAUUSD",displaySymbol:"OANDA:XAUUSD",timeframe:tf,candles,last,price:Number.isFinite(price)?price:last.close,delayedBy:age,candleTimestamp:last.timestamp,quoteTimestamp:tick.timestamp||tick.lastQuoteAt||last.timestamp,candleAgeSec:age,candleStartAgeSec:age,quoteAgeSec:Number.isFinite(quoteAge)?quoteAge:null,stale,marketState,realOpenBar:last.isOpen===true,liveM1:tf==="1m"&&last.isOpen===true&&Number.isFinite(quoteAge)&&quoteAge<=15&&!stale,oandaLive:false,feedNotice:"XAUUSD/MT5 com candles oficiais do fornecedor; sem preços inventados."};
}
async function yahooQuote(symbol) {
  const u=new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);
  u.searchParams.set("interval","1m");u.searchParams.set("range","1d");u.searchParams.set("includePrePost","true");
  const r=await fetch(u,{headers:{"User-Agent":"Mozilla/5.0 RB-Gold-Sniper/4.0"}});
  const d=await r.json(), result=d?.chart?.result?.[0];if(!r.ok||!result)throw new Error("Yahoo não devolveu cotação de referência");
  const meta=result.meta||{},price=Number(meta.regularMarketPrice),ts=Number(meta.regularMarketTime||0);
  if(!Number.isFinite(price))throw new Error("Preço de referência inválido");
  return {symbol,price,timestamp:ts?new Date(ts*1000).toISOString():new Date().toISOString(),delayedBy:Number(meta.exchangeDataDelayedBy||0)};
}
function aiText(d){if(typeof d?.output_text==="string"&&d.output_text.trim())return d.output_text.trim();return (d?.output||[]).flatMap(i=>(i?.content||[]).map(c=>c?.text||c?.value||"")).join("\n").trim()}
async function aiOpinion(body,env) {
  if(!env.OPENAI_API_KEY)return {available:false,confidence:null,opinion:"NEUTRO",note:"IA indisponível: falta OPENAI_API_KEY no Cloudflare"};
  const signal=body?.signal||{}, candles=body?.candles||[];
  const payload={technicalSignal:signal.type||"WAIT",technicalConfidence:signal.confidence??null,price:signal.price??null,tp:signal.tp??null,sl:signal.sl??null,rr:signal.rr??null,rsi:signal.rsi??null,atr:signal.atr??null,ema20:signal.ema20??null,ema50:signal.ema50??null,ema200:signal.ema200??null,support:signal.support??null,resistance:signal.resistance??null,trends:{m3:signal.trend3,m5:signal.trend5,m15:signal.trend15,h1:signal.trend1},filters:signal.filters||{},rejectionReasons:signal.rejectionReasons||[],lastCandles:candles.slice(-12).map(c=>({t:c.timestamp,o:c.open,h:c.high,l:c.low,c:c.close}))};
  const r=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:`Bearer ${env.OPENAI_API_KEY}`,"Content-Type":"application/json"},body:JSON.stringify({model:env.OPENAI_MODEL||"gpt-6-luna",input:[{role:"system",content:[{type:"input_text",text:"És um analista auxiliar do RB Gold Sniper. Dá apenas um parecer independente sobre XAUUSD. NÃO alteres, substituas ou cries o sinal técnico. Não inventes dados. Devolve JSON válido com confidence (0-100), opinion (BUY, SELL ou NEUTRO) e note (máximo 140 caracteres)."}]},{role:"user",content:[{type:"input_text",text:JSON.stringify(payload)}]}],text:{format:{type:"json_object"}},max_output_tokens:180})});
  const d=await r.json();if(!r.ok)throw new Error(d?.error?.message||"Falha na API OpenAI");
  const raw=aiText(d);let p;try{p=JSON.parse(raw)}catch{const m=raw.match(/\{[\s\S]*\}/);if(!m)throw new Error("A IA devolveu uma resposta não-JSON");p=JSON.parse(m[0])}
  const n=typeof p.confidence==="number"?p.confidence:Number(String(p.confidence??"").replace(",",".").match(/-?\d+(?:\.\d+)?/)?.[0]);
  if(!Number.isFinite(n))throw new Error("A IA não devolveu confiança numérica");
  const opinion=String(p.opinion||"").toUpperCase();
  return {available:true,confidence:Math.max(0,Math.min(100,Math.round(n))),opinion:["BUY","SELL","NEUTRO"].includes(opinion)?opinion:"NEUTRO",note:String(p.note||"").slice(0,140)};
}
export default {
 async fetch(request,env) {
  if(request.method==="OPTIONS") return new Response(null,{status:204,headers:corsHeaders});
  const url=new URL(request.url), path=url.pathname;
  try {
   if(path==="/api/health"&&request.method==="GET") {
    try {const m=await market("1m");return json({status:"OK",marketConnected:true,source:m.source,symbol:m.symbol,history:"localStorage/GitHub",historyConfigured:Boolean(env.GITHUB_TOKEN),historyBranch:historyBranch(env),aiEnabled:Boolean(env.OPENAI_API_KEY),pushEnabled:false,mode:"ALERTAS",timestamp:new Date().toISOString()});}
    catch(e){return json({status:"DEGRADED",marketConnected:false,history:"localStorage/GitHub",historyConfigured:Boolean(env.GITHUB_TOKEN),historyBranch:historyBranch(env),aiEnabled:Boolean(env.OPENAI_API_KEY),pushEnabled:false,mode:"ALERTAS",error:e.message},503);}
   }
   if(path==="/api/market"&&request.method==="GET") return json(await market(url.searchParams.get("timeframe")||"1m"));
   if(path==="/api/oanda-reference"&&request.method==="GET") {try{return json({success:true,calibrated:false,offset:0,futures:await yahooQuote("GC=F"),spot:null,source:"Yahoo Finance GC=F — referência"});}catch(e){return json({success:false,calibrated:false,offset:0,error:e.message},502);}}
   if(path==="/api/ai/opinion"&&request.method==="POST") {try{return json({success:true,...await aiOpinion(await request.json(),env),model:env.OPENAI_MODEL||"gpt-5.6-luna"});}catch(e){return json({success:false,available:Boolean(env.OPENAI_API_KEY),confidence:null,opinion:"NEUTRO",note:e.message},502);}}
   if(path==="/api/trades"&&request.method==="GET") {if(!env.GITHUB_TOKEN)return json({ok:false,error:"GITHUB_TOKEN não configurado nos Secrets do Cloudflare."},503);return json(await getHistory(env,Math.min(Math.max(parseInt(url.searchParams.get("limit")||"1000",10)||1000,1),5000)));}
   if(path==="/api/export-history"&&request.method==="POST") {const b=await request.json();if(!Array.isArray(b.trades))return json({ok:false,error:"Formato inválido: trades[] em falta."},400);return json(await saveHistory(env,b.trades));}
   if(path==="/api/push-config"&&request.method==="GET") return json({ok:false,error:"Web Push ainda não foi migrado para Cloudflare; as notificações não estão ativas nesta pré-visualização."},503);
   if(path==="/api/push-subscribe"||path==="/api/push-send") return json({ok:false,error:"Web Push ainda não foi migrado para Cloudflare; não envia notificações nesta pré-visualização."},503);
   if(path==="/api/trades/resolve") return json({ok:true,mode:"client-side",note:"A resolução local da app é mantida; não existe monitorização server-side nesta pré-visualização."});
   return env.ASSETS.fetch(request);
  } catch(e) {return json({success:false,ok:false,error:e.message||"Erro interno no Worker"},500);}
 }
};
