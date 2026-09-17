(() => {
  const KEY="rb_gold_sniper_signals_v1";
  const originalFetch=window.fetch.bind(window);
  const read=()=>{try{const x=JSON.parse(localStorage.getItem(KEY)||"[]");return Array.isArray(x)?x:[]}catch{return[]}};
  const write=x=>localStorage.setItem(KEY,JSON.stringify(x.slice(0,500)));
  const response=data=>new Response(JSON.stringify(data),{status:200,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
  function resolveLocal(candles){
    const now=Date.now(),all=read();let changed=false;
    for(const t of all){if(!t||!["BUY","SELL"].includes(t.type)||t.status!=="ALERTA")continue;const created=Date.parse(t.time||t.signalTimestamp||"");if(!Number.isFinite(created))continue;const relevant=(candles||[]).filter(c=>Date.parse(c.timestamp)>created);let result=null,when=null,reason="",max=null,min=null;
      for(const c of relevant){max=max==null?c.high:Math.max(max,c.high);min=min==null?c.low:Math.min(min,c.low);const tp=t.type==="BUY"?c.high>=Number(t.tp):c.low<=Number(t.tp);const sl=t.type==="BUY"?c.low<=Number(t.sl):c.high>=Number(t.sl);if(tp&&sl){result="EXPIRADA";reason="TP e SL atingidos na mesma vela; resultado ambíguo";when=c.timestamp;break}if(tp){result="WIN";reason="TP atingido";when=c.timestamp;break}if(sl){result="LOSS";reason="SL atingido";when=c.timestamp;break}}
      if(!result&&now-created>=6*60*60*1000){result="EXPIRADA";reason="Sem TP/SL após 6 horas";when=new Date().toISOString()}
      if(result){t.status=result;t.resolvedAt=when;t.outcomeReason=reason;t.maxPrice=max;t.minPrice=min;changed=true}
    }
    if(changed)write(all);return all;
  }
  async function localResolve(){try{const r=await originalFetch("/api/market?timeframe=1m&t="+Date.now(),{cache:"no-store"});const d=await r.json();resolveLocal(d.candles||[])}catch{}return response({success:true,resolved:0,local:true})}
  window.fetch=async function(input,init){
    const url=typeof input==="string"?input:input?.url||"";if(!url.includes("/api/trades"))return originalFetch(input,init);
    try{const r=await originalFetch(input,init);if(r.ok){const clone=r.clone();const d=await clone.json().catch(()=>null);if(d&&d.success!==false)return r}}catch{}
    if(url.includes("/api/trades/resolve"))return localResolve();
    const method=(init?.method||"GET").toUpperCase(),h=read();
    if(url.includes("/api/trades/stats"))return response({success:true,database:false,local:true,total:h.length,wins:h.filter(x=>x.status==="WIN").length,losses:h.filter(x=>x.status==="LOSS").length,expired:h.filter(x=>x.status==="EXPIRADA").length,open:h.filter(x=>x.status==="ALERTA").length});
    if(method==="POST"){let body={};try{body=JSON.parse(init?.body||"{}")}catch{}if(body.signalKey&&!h.some(x=>x.signalKey===body.signalKey)){h.unshift({...body,status:"ALERTA",local:true,time:body.time||new Date().toISOString()});write(h)}return response({success:true,saved:true,local:true})}
    return response({success:true,database:false,local:true,trades:h});
  };
  window.addEventListener("load",()=>setTimeout(async()=>{try{const r=await originalFetch("/api/market?timeframe=1m&t="+Date.now(),{cache:"no-store"});const d=await r.json();resolveLocal(d.candles||[]);window.dispatchEvent(new Event("rb-history-updated"))}catch{}},3000));
})();
