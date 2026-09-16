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
  function set(text,good=false){const el=ensure();if(!el)return;el.firstElementChild.textContent=text;el.firstElementChild.style.color=good?"#35d07f":"#ffc107"}
  function num(id){const t=document.getElementById(id)?.textContent?.replace(",",".");const m=t?.match(/-?\d+(?:\.\d+)?/);return m?Number(m[0]):null}
  function filterText(label){const items=[...document.querySelectorAll("#filter-status .filter-item")];const x=items.find(i=>i.firstElementChild?.textContent===label);return x?.lastElementChild?.textContent||null}
  async function run(){
    ensure();
    try{
      const t=filterText("M1 gatilho")||"WAIT",m3=filterText("M3 confirmação")||"WAIT",m5=filterText("M5 tendência")||"WAIT",m15=filterText("M15 tendência")||"WAIT",h1=filterText("H1 contexto")||"WAIT";
      const type=t.startsWith("BUY")?"BUY":t.startsWith("SELL")?"SELL":"WAIT";
      const tfs=await Promise.all(["1m","3m","5m","15m","1h"].map(async tf=>{const r=await fetch(`/api/market?timeframe=${tf}&t=${Date.now()}`,{cache:"no-store"});const d=await r.json();return d.candles||[]}));
      const signal={type,price:num("current-price"),rsi:num("rsi-value"),atr:num("macd-value"),ema20:num("ma20"),trend3:m3.split(" ")[0],trend5:m5.split(" ")[0],trend15:m15.split(" ")[0],trend1:h1.split(" ")[0],filters:{technicalPass:(document.querySelector("#filter-status .filter-item:last-child strong")?.textContent||"").includes("PASS")}};
      const r=await fetch("/api/ai/opinion",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({signal,candles:tfs[0]})});
      const d=await r.json();
      if(d.available&&Number.isFinite(Number(d.confidence))){set(`🧠 Confiança IA: ${Math.round(Number(d.confidence))}%${d.opinion?` • ${d.opinion}`:""}`,true);if(d.note)box().title=d.note}
      else set("🧠 Confiança IA: indisponível");
    }catch(e){set("🧠 Confiança IA: indisponível")}
  }
  window.addEventListener("load",()=>{setTimeout(run,3500);setInterval(run,60000)});
})();
