(()=>{
  const box=()=>document.getElementById("ai-confidence");
  function ensure(){let el=box();if(el)return el;const target=document.getElementById("filter-status");if(!target||!target.parentElement)return null;el=document.createElement("div");el.id="ai-confidence";el.style.cssText="display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 0 7px;padding:8px 10px;border:1px solid #263453;border-radius:7px;background:#0b1020;font-size:.78rem";el.innerHTML='<strong id="ai-confidence-value">🧠 Confiança IA: —</strong><span id="ai-confidence-note" style="font-size:.68rem;color:#9aa5bd">segunda validação</span>';target.parentElement.insertBefore(el,target);return el}
  function set(text,good=false,note=""){const el=ensure();if(!el)return;const value=el.querySelector("#ai-confidence-value")||el.querySelector("strong"),noteEl=el.querySelector("#ai-confidence-note");if(value){value.textContent=text;value.style.color=good?"#35d07f":"#ffc107"}if(noteEl&&note)noteEl.textContent=note;if(note)el.title=note}
  function num(id){const t=document.getElementById(id)?.textContent?.replace(",",".");const m=t?.match(/-?\d+(?:\.\d+)?/);return m?Number(m[0]):null}
  function filterText(label){const items=[...document.querySelectorAll("#filter-status .filter-item")];const x=items.find(i=>i.firstElementChild?.textContent===label);return x?.lastElementChild?.textContent||null}
  async function getJSON(url,options){const r=await fetch(url,options);let d=null;try{d=await r.json()}catch{}if(!r.ok)throw Object.assign(new Error(d?.error||d?.details||`HTTP ${r.status}`),{status:r.status,body:d});return d}
  async function run(){ensure();try{
    const t=filterText("M1 gatilho")||"WAIT",type=t.startsWith("COMPRA")||t.startsWith("BUY")?"BUY":t.startsWith("VENDA")||t.startsWith("SELL")?"SELL":"WAIT";
    if(type==="WAIT"){set("🧠 IA: em espera",false,"Só consulta a IA quando o filtro técnico encontra um gatilho.");return}
    const health=await getJSON(`/api/health?t=${Date.now()}`,{cache:"no-store"});
    if(!health.aiEnabled){set("🧠 IA: indisponível",false,"OPENAI_API_KEY não disponível no ambiente.");return}
    const market=await getJSON(`/api/market?timeframe=1m&t=${Date.now()}`,{cache:"no-store"});
    const signal={type,price:num("current-price"),rsi:num("rsi-value"),atr:num("macd-value"),ema20:num("ma20"),trend3:filterText("M3")||"WAIT",trend5:filterText("M5")||"WAIT",trend15:filterText("M15")||"WAIT",trend1:filterText("H1")||"WAIT",filters:{technicalPass:(document.querySelector("#filter-status .filter-item:last-child strong")?.textContent||"").includes("PASS")}};
    const d=await getJSON("/api/ai/opinion",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({signal,candles:market.candles||[]}),cache:"no-store"});
    if(d.available&&Number.isFinite(Number(d.confidence)))set(`🧠 IA: ${Math.round(Number(d.confidence))}%${d.opinion?` • ${d.opinion}`:""}`,true,d.note||"segunda validação independente");
    else set("🧠 IA: indisponível",false,d.note||"Sem resposta válida.");
  }catch(e){const note=e.status===429?"Limite/quota da API OpenAI atingido — não é erro do filtro." : e.message||"Erro ao consultar a IA";set("🧠 IA: indisponível",false,note)}}
  window.addEventListener("load",()=>{setTimeout(run,2500);setInterval(run,60000)});
})();
