(()=>{const KEY="rb_gold_sniper_ai_v1",MIN_TRAIN=30,MIN_DIR=10,FILTER_PWIN=.57,FILTER_SCORE=62;
const safe=(v,d=0)=>Number.isFinite(+v)?+v:d;
function bucket(v,steps){for(let i=0;i<steps.length;i++)if(v<steps[i])return i;return steps.length}
function features(a){const f=a?.filters||{},t=a?.tactical||{},dir=a?.type;return{
dir:dir==='SELL'?'S':'B',score:Math.round(safe(a?.score,50)/5)*5,
rsi:bucket(safe(a?.rsi,50),[40,45,50,55,60,65,70]),
atrRel:bucket(safe(a?.atr,0)/Math.max(safe(a?.price,1),1),[.0005,.001,.002,.004,.008]),
align:(f.m5Buy||f.m5Sell?1:0)+(f.m15Buy||f.m15Sell?1:0)+(f.h1Buy||f.h1Sell?1:0),
body:f.bodyIsDecisive?1:0,struct:(f.structuralConfirmBuy||f.structuralConfirmSell)?1:0,
tactical:t.buy?'BUY':t.sell?'SELL':'NONE',tp2:a?.tp2Eligible?1:0
}}
function read(){try{const x=JSON.parse(localStorage.getItem(KEY)||"[]");return Array.isArray(x)?x:[]}catch{return[]}}
function resolvedHistory(){try{const x=JSON.parse(localStorage.getItem("rb_gold_sniper_signals_v1")||"[]");return Array.isArray(x)?x.filter(t=>['WIN','LOSS','BE'].includes(t?.status)):[]}catch{return[]}}
function key(v){return JSON.stringify(v)}
function model(hist){const rows=hist.map(t=>({f:t.aiFeatures||features(t),s:t.status}));const wins=rows.filter(x=>x.s==='WIN').length,loss=rows.filter(x=>x.s==='LOSS').length,known=wins+loss;const base=(wins+1)/(known+2);const stats={};for(const r of rows){const y=r.s==='WIN'?1:r.s==='LOSS'?0:null;if(y===null)continue;for(const [k,v] of Object.entries(r.f)){if(k==='score'||k==='rsi'||k==='atrRel')continue;const id=k+':'+v;stats[id]??={w:1,l:1};stats[id][y?'w':'l']++}}return{rows,wins,loss,known,base,stats}}
function evaluate(a){if(!a||!['BUY','SELL'].includes(a.type))return{mode:'WAIT',score:0,pWin:null,samples:0,approved:false,reasons:['sem sinal base']};const hist=resolvedHistory(),m=model(hist),f=features(a),same=m.rows.filter(r=>r.f.dir===f.dir),dirKnown=same.length;let log=Math.log(m.base/(1-m.base));const used=[];for(const [k,v] of Object.entries(f)){if(k==='score'||k==='rsi'||k==='atrRel')continue;const st=m.stats[k+':'+v];if(st&&st.w+st.l>=4){log+=.35*Math.log(st.w/st.l);used.push(k)}}const p=1/(1+Math.exp(-log));const technical=40+(safe(a.score,50)*.35)+(f.align*4)+(f.struct*4)+(f.body*3);const aiScore=Math.max(0,Math.min(100,Math.round(.55*technical+.45*p*100)));const ready=m.known>=MIN_TRAIN&&dirKnown>=MIN_DIR;const approved=!ready||((p>=FILTER_PWIN)&&(aiScore>=FILTER_SCORE));const reasons=[];if(!ready)reasons.push('aprendizagem em curso');else{if(p<FILTER_PWIN)reasons.push('histórico IA abaixo do limiar');if(aiScore<FILTER_SCORE)reasons.push('qualidade IA abaixo do limiar')}return{mode:ready?'FILTRO ADAPTATIVO':'OBSERVAÇÃO',score:aiScore,pWin:Math.round(p*100),samples:m.known,directionSamples:dirKnown,approved,reasons:reasons.length?reasons:['IA aprovou o setup'],aiFeatures:f,baseWinRate:m.known?Math.round(m.base*100):null,featuresUsed:used.length}} 
function attach(a){if(!a||!['BUY','SELL'].includes(a.type))return a;const x=evaluate(a);return{...a,ai:x,aiScore:x.score,aiWinRate:x.pWin,aiFeatures:x.aiFeatures}}
function learn(){const hist=resolvedHistory(),rows=hist.map(t=>t.aiFeatures?{...t.aiFeatures,status:t.status}:null).filter(Boolean);try{localStorage.setItem(KEY,JSON.stringify(rows.slice(-1000)))}catch{}return model(hist)}
window.RBTraderProAI={evaluate,attach,learn,features,constants:{MIN_TRAIN,MIN_DIR,FILTER_PWIN,FILTER_SCORE}};learn()})();