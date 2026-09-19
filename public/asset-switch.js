(function(){
  const KEY='rb_selected_asset';
  const ASSETS={
    XAUUSD:{label:'Ouro',symbol:'OANDA:XAUUSD',title:'XAU/USD',icon:'🟡'},
    BTCUSD:{label:'Bitcoin',symbol:'BITSTAMP:BTCUSD',title:'BTC/USD',icon:'₿'}
  };
  const getAsset=()=>localStorage.getItem(KEY)==='BTCUSD'?'BTCUSD':'XAUUSD';
  const asset=()=>ASSETS[getAsset()];

  // Add the selected asset to every market request without changing the Sniper engine.
  const nativeFetch=window.fetch.bind(window);
  window.fetch=function(input,init){
    try{
      const raw=typeof input==='string'?input:input.url;
      if(raw && raw.includes('/api/market?')){
        const u=new URL(raw,window.location.origin);
        u.searchParams.set('symbol',getAsset());
        input=u.toString();
      }
    }catch{}
    return nativeFetch(input,init);
  };

  // Keep TradingView identical except for the selected instrument.
  if(window.TradingView&&window.TradingView.widget){
    const OriginalWidget=window.TradingView.widget;
    window.TradingView.widget=function(opts){
      opts=Object.assign({},opts,{symbol:asset().symbol});
      return new OriginalWidget(opts);
    };
  }

  // BTC trades continuously; preserve the existing session logic for gold.
  const originalSession=window.marketSessionStatus;
  window.marketSessionStatus=function(data){
    if(getAsset()==='BTCUSD'){
      const lastTs=Number(data?.timestamp||data?.candles?.at?.(-1)?.timestamp||0);
      const age=lastTs?Math.max(0,Date.now()-new Date(lastTs).getTime()):Infinity;
      const stale=age>4*60*1000;
      return {open:true,label:stale?'Bitcoin aberto — feed atrasado':'Bitcoin aberto — mercado 24/7',stale,age,key:`BTC-${stale?'stale':'live'}`};
    }
    return originalSession?originalSession(data):{open:true,label:'Mercado aberto',stale:false,age:0,key:'open'};
  };

  function updateLabels(){
    const a=asset();
    document.title=`RB Gold Sniper — ${a.title}`;
    const h=document.querySelector('header p');
    if(h)h.textContent=`Análise automática • ${a.label} • TradingView ${a.symbol} • sem execução de ordens • sem IA`;
    const chartTitle=document.querySelector('.chart-header h2');
    if(chartTitle)chartTitle.textContent=`📈 ${a.title} — gráfico no TradingView`;
    const priceTitle=document.querySelector('.market-box h3');
    if(priceTitle)priceTitle.textContent=`💹 Preço ${a.title}`;
    const footer=document.querySelector('footer p');
    if(footer)footer.textContent=`RB Gold Sniper • ${a.title} • TradingView ${a.symbol} • Feed automático ${getAsset()} • Sem execução automática • Sem IA`;
  }

  function buildSelector(){
    if(document.getElementById('asset-selector'))return;
    const box=document.createElement('div');
    box.id='asset-selector';
    box.style.cssText='display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:0 0 12px 0;';
    box.innerHTML=`<span style="font-weight:700;margin-right:2px;">Ativo:</span><button type="button" id="asset-xau" class="btn btn-primary" style="min-width:105px;">🟡 OURO</button><button type="button" id="asset-btc" class="btn btn-primary" style="min-width:105px;">₿ BITCOIN</button>`;
    const target=document.querySelector('.control-section');
    if(target)target.insertBefore(box,target.firstChild);
    const paint=()=>{
      const x=document.getElementById('asset-xau'),b=document.getElementById('asset-btc');
      const current=getAsset();
      if(x)x.style.opacity=current==='XAUUSD'?'1':'.55';
      if(b)b.style.opacity=current==='BTCUSD'?'1':'.55';
    };
    const select=symbol=>{
      if(symbol===getAsset())return;
      localStorage.setItem(KEY,symbol);
      location.reload();
    };
    document.getElementById('asset-xau').onclick=()=>select('XAUUSD');
    document.getElementById('asset-btc').onclick=()=>select('BTCUSD');
    paint();
  }

  window.addEventListener('DOMContentLoaded',()=>{updateLabels();buildSelector();});
})();
