(()=>{
  const box=()=>document.getElementById("ai-confidence");
  function ensure(){
    let el=box();
    if(el)return el;
    const target=document.getElementById("filter-status");
    if(!target||!target.parentElement)return null;
    el=document.createElement("div");el.id="ai-confidence";
    el.style.cssText="display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 0 7px;padding:8px 10px;border:1px solid #263453;border-radius:7px;background:#0b1020;font-size:.78rem";
    el.innerHTML='<strong>🧠 Confiança IA: —</strong><span style="font-size:.68rem;color:#9aa5bd">parecer independente</span>';
    target.parentElement.insertBefore(el,target);
    return el;
  }
  function set(text,good=false,note=""){const el=ensure();if(!el)return;el.firstElementChild.textContent=text;el.firstElementChild.style.color=good?"#35d07f":"#ffc107";if(note)el.title=note}
  function num(id){const t=document.getElementById(id)?.textContent?.replace(",",".");const m=t?.match(/-?\d+(?:\.\d+)?/);return m?Number(m[0]):null}
  function filterText(label){const items=[...document.querySelectorAll("#filter-status .filter-item")];const x=items.find(i=>i.firstElementChild?.textContent===label);return x?.lastElementChild?.textContent||null}
  async function getJSON(url,options){const r=await fetch(url,options);let d=null;try{d=await r.json()}catch{}if(!r.ok)throw new Error(d?.error||d?.details||`HTTP ${r.status}`);return d}
  async function run(){
    ensure();
    try{
      const health=await getJSON(`/api/health?t=${Date.now()}`,{cache:"no-store"});
      if(!health.aiEnabled){set("🧠 Confiança IA: indisponível","", "OPENAI_API_KEY não está configurada no ambiente de produção do Vercel.");return}
      const t=filterText("M1 gatilho")||"WAIT",m3=filterText("M3 confirmação")||"WAIT",m5=filterText("M5 tendência")||"WAIT",m15=filterText("M15 tendência")||"WAIT",h1=filterText("H1 contexto")||"WAIT";
      const type=t.startsWith("BUY")?"BUY":t.startsWith("SELL")?"SELL":"WAIT";
      const market=await getJSON(`/api/market?timeframe=1m&t=${Date.now()}`,{cache:"no-store"});
      const signal={type,price:num("current-price"),rsi:num("rsi-value"),atr:num("macd-value"),ema20:num("ma20"),trend3:m3.split(" ")[0],trend5:m5.split(" ")[0],trend15:m15.split(" ")[0],trend1:h1.split(" ")[0],filters:{technicalPass:(document.querySelector("#filter-status .filter-item:last-child strong")?.textContent||"").includes("PASS")}};
      const d=await getJSON("/api/ai/opinion",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({signal,candles:market.candles||[]}),cache:"no-store"});
      if(d.available&&Number.isFinite(Number(d.confidence))){set(`🧠 Confiança IA: ${Math.round(Number(d.confidence))}%${d.opinion?` • ${d.opinion}`:""}`,true,d.note||"")}
      else set("🧠 Confiança IA: indisponível",false,d.note||"A IA não devolveu uma confiança válida.");
    }catch(e){set("🧠 Confiança IA: indisponível",false,e.message||"Erro ao consultar a IA")}
  }
  window.addEventListener("load",()=>{setTimeout(run,2500);setInterval(run,60000)});
})();