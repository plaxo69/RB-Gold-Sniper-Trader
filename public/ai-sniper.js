(()=>{const KEY="rb_gold_sniper_ai_v5",MAX_HISTORY=1000,FILTER_PWIN=.57,FILTER_SCORE=62,MODEL_VERSION="RB-TRADER-PRO-HYBRID-v5";
const n=(v,d=0)=>Number.isFinite(+v)?+v:d,up=v=>String(v||"").toUpperCase(),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function resolved(){try{const x=JSON.parse(localStorage.getItem("rb_gold_sniper_signals_v1")||"[]");return Array.isArray(x)?x.filter(t=>['WIN','LOSS'].includes(up(t?.status))).slice(0,MAX_HISTORY):[]}catch{return[]}}
function outcome(s){return up(s)==="WIN"?1:up(s)==="LOSS"?0:.5}
function direction(a){return up(a?.type)==="SELL"?"SELL":"BUY"}
function features(a){
 const f=a?.filters||{},t=a?.tactical||{},d=direction(a),r=n(a?.rsi,50),atr=n(a?.atr,0),price=Math.max(n(a?.price,1),1),rr=n(a?.rr1,n(a?.rr,0)),adx=n(a?.adx14,NaN),vol=n(a?.volume,NaN),volSma=n(a?.volumeSma20,NaN),align=[up(a?.trend5),up(a?.trend15),up(a?.trend1)].filter(x=>x===("BUY"===d?"ALTA":"BAIXA")).length;
 return{dir:d==="SELL"?"S":"B",adx14:Number.isFinite(adx)?Math.round(adx*100)/100:null,volume:Number.isFinite(vol)?vol:null,volumeSma20:Number.isFinite(volSma)?volSma:null,volumeAboveSma:Number.isFinite(vol)&&Number.isFinite(volSma)?vol>volSma:null,score:Math.round(n(a?.score,50)/5)*5,rsiBand:r<30?"EXTREME":r<40?"LOW":r<50?"MIDLOW":r<60?"MID":r<70?"GOOD":"HIGH",atrBand:atr/price<.0005?"LOW":atr/price<.001?"NORMAL":atr/price<.002?"HIGH":"VERY_HIGH",align,h1Aligned:up(a?.trendH1)===(d==="BUY"?"ALTA":"BAIXA")?1:0,ema:(d==="BUY"?!!f.emaBuy:!!f.emaSell)?1:0,structure:(d==="BUY"?!!f.structuralConfirmBuy:!!f.structuralConfirmSell)?1:0,bos:(d==="BUY"?!!(t.bosBuy||t.chochBuy):!!(t.bosSell||t.chochSell))?1:0,tactical:t.buy?'BUY':t.sell?'SELL':'NONE',retest:(d==="BUY"?!!f.pullbackRetestBuy:!!f.pullbackRetestSell)?1:0,rejection:(d==="BUY"?!!f.rejectionBuy:!!f.rejectionSell)?1:0,continuation:(d==="BUY"?!!f.continuationBuy:!!f.continuationSell)?1:0,body:f.bodyIsDecisive?1:0,close:d==="BUY"?(n(a?.closeLocation,.5)>=.55?1:0):(n(a?.closeLocation,.5)<=.45?1:0),extension:(d==="BUY"?!!f.extensionBuy:!!f.extensionSell)?1:0,rr:rr>=1.5?"GOOD":rr>=1?"OK":"LOW",tp2:a?.tp2Eligible?1:0}
}
function signature(f){return [f.dir,f.align,f.rsiBand,f.ema,f.structure,f.bos,f.tactical,f.retest,f.rejection,f.continuation,f.rr].join("|")}
function rows(){return resolved().map(t=>({f:t.aiFeatures&&t.aiModelVersion===MODEL_VERSION?t.aiFeatures:features(t),y:outcome(t.status),status:up(t.status)}))}
function historical(f,rs){
 const same=rs.filter(r=>signature(r.f)===signature(f)), dir=rs.filter(r=>r.f.dir===f.dir);
 const calc=(arr)=>{if(!arr.length)return .5;const sum=arr.reduce((s,r)=>s+r.y,0),wins=arr.filter(r=>r.y===1).length;return (sum+4)/(arr.length+8)};
 const pSame=calc(same),pDir=calc(dir),pBase=calc(rs);
 const p=.55*pSame+.30*pDir+.15*pBase;
 return{p,setupSamples:same.length,directionSamples:dir.length,totalSamples:rs.length}
}
function technical(a,f){
 const d=direction(a),r=n(a?.rsi,50),rr=n(a?.rr1,n(a?.rr,0)),score=n(a?.score,50),adx=n(a?.adx14,NaN),vol=n(a?.volume,NaN),volSma=n(a?.volumeSma20,NaN);
 let s=40;
 s+=f.align*9+f.ema*8+f.structure*10+f.bos*6+f.retest*7+f.rejection*5+f.continuation*5+f.body*4+f.close*4+f.tp2*3;
 if(d==="BUY")s+=r>=60&&r<72?8:r>=72&&r<75?3:r<30?-12:r<40?-7:0;
 else s+=r<=40&&r>28?8:r>20&&r<=28?3:r<=20?-14:r>60?-10:0;
 s+=rr>=1.5?7:rr>=1?3:-8;
 if(f.extension)s-=7;if(!f.h1Aligned)s-=10;if((d==="BUY"&&r<30)||(d==="SELL"&&r<=20))s-=8;
 if(score>=65)s+=5;else if(score<55)s-=5;
 return clamp(Math.round(s),0,100)
}
function opinion(a,ai,f){
 const d=direction(a),r=n(a?.rsi,50),rr=n(a?.rr1,n(a?.rr,0)),adx=n(a?.adx14,NaN),vol=n(a?.volume,NaN),volSma=n(a?.volumeSma20,NaN),trend=f.align===3?"M5/M15/H1 alinhados":f.align===2?"2 timeframes alinhados":"alinhamento parcial";
 const positives=[],warnings=[];
 if(f.align>=2)positives.push(trend);
 if(Number.isFinite(adx))positives.push(`ADX ${adx.toFixed(1)}`);
 if(Number.isFinite(vol)&&Number.isFinite(volSma))positives.push(vol>volSma?'volume > SMA20':'volume < SMA20');
 if(f.structure||f.bos)positives.push(f.bos?"estrutura BOS/CHOCH confirmada":"estrutura confirmada");
 if(f.retest||f.rejection)positives.push(f.retest?"reteste com confirmação":"rejeição de zona");
 if(f.continuation)positives.push("continuação");
 if(f.ema)positives.push("EMA favorável");
 if(f.body&&f.close)positives.push("vela com boa força");
 if(rr>=1.5)positives.push("RR favorável");
 if(f.align<2)warnings.push("alinhamento incompleto");
 if(f.extension)warnings.push("preço já estendido");
 if(d==="BUY"&&r>=72)warnings.push("RSI perto do limite superior");if(d==="BUY"&&r<30)warnings.push("RSI extremamente sobrevendido");
 if(d==="SELL"&&r<=28)warnings.push("RSI perto do limite inferior");if(d==="SELL"&&r<=20)warnings.push("RSI extremamente sobrevendido");
 if(rr<1)warnings.push("RR insuficiente");
 if(!f.structure&&!f.bos)warnings.push("estrutura sem confirmação forte");
 const label=ai.pWin>=70&&ai.score>=70&&!warnings.some(x=>x.includes("extremamente"))?"FORTE":ai.pWin>=57&&ai.score>=62?"FAVORÁVEL":ai.pWin>=48?"CAUTELOSA":"DESFAVORÁVEL";
 const text=positives.slice(0,3).join(", ")+(warnings.length?" | Atenção: "+warnings.slice(0,2).join(", "):"");
 return{label,text:text||"Sinal técnico válido; IA sem evidência adicional suficiente."}
}
function evaluate(a){
 if(!a||!["BUY","SELL"].includes(up(a.type)))return{mode:"WAIT",score:0,pWin:null,samples:0,approved:false,recommendation:"SEM OPINIÃO",opinion:"Sem sinal base.",reasons:["sem sinal base"]};
 const f=features(a),rs=rows(),h=historical(f,rs),tech=technical(a,f),pWin=clamp(Math.round((h.p*.55+(tech/100)*.45)*100),5,95),score=clamp(Math.round((h.pWin??pWin)*.55+tech*.45),0,100);
 const op=opinion(a,{pWin,score},f),reasons=[];
 if(h.setupSamples<3)reasons.push("poucos casos históricos do setup");
 if(f.align<2)reasons.push("alinhamento parcial");if(!f.h1Aligned)reasons.push("H1 contra a direção");if((direction(a)==="SELL"&&n(a?.rsi,50)<=20)||(direction(a)==="BUY"&&n(a?.rsi,50)<30))reasons.push("RSI extremo contra a entrada");
 if(f.extension)reasons.push("extensão elevada");
 if(!f.structure&&!f.bos)reasons.push("estrutura sem confirmação forte");
 if(rrSafe(a)<1)reasons.push("RR abaixo de 1");
 return{mode:"OPINIÃO",score,pWin,samples:rs.length,setupSamples:h.setupSamples,directionSamples:h.directionSamples,approved:pWin>=FILTER_PWIN&&score>=FILTER_SCORE,recommendation:op.label,opinion:op.text,reasons:reasons.length?reasons:["IA considera o setup tecnicamente coerente"],aiFeatures:f,baseWinRate:rs.length?Math.round(rs.reduce((s,r)=>s+r.y,0)/rs.length*100):50,featuresUsed:Object.keys(f).length,modelVersion:MODEL_VERSION};
}
function candleSeries(xs){return Array.isArray(xs)?xs.filter(c=>Number.isFinite(+c?.close)&&Number.isFinite(+c?.high)&&Number.isFinite(+c?.low)):[]}
function ema(xs,p){const a=candleSeries(xs);if(a.length<p)return NaN;let e=a.slice(0,p).reduce((s,c)=>s+Number(c.close),0)/p,k=2/(p+1);for(let i=p;i<a.length;i++)e=Number(a[i].close)*k+e*(1-k);return e}
function rsiSeries(xs,p=14){const a=candleSeries(xs);if(a.length<p+1)return NaN;let g=0,l=0;for(let i=1;i<=p;i++){const d=Number(a[i].close)-Number(a[i-1].close);if(d>0)g+=d;else l-=d}let ag=g/p,al=l/p;for(let i=p+1;i<a.length;i++){const d=Number(a[i].close)-Number(a[i-1].close);ag=(ag*(p-1)+Math.max(0,d))/p;al=(al*(p-1)+Math.max(0,-d))/p}return al===0?100:100-(100/(1+ag/al))}
function atrSeries(xs,p=14){const a=candleSeries(xs);if(a.length<p+1)return NaN;const tr=[];for(let i=1;i<a.length;i++){const h=Number(a[i].high),l=Number(a[i].low),pc=Number(a[i-1].close);tr.push(Math.max(h-l,Math.abs(h-pc),Math.abs(l-pc)))}if(tr.length<p)return NaN;let v=tr.slice(0,p).reduce((s,x)=>s+x,0)/p;for(let i=p;i<tr.length;i++)v=(v*(p-1)+tr[i])/p;return v}
function tfDir(xs){const a=candleSeries(xs);if(a.length<55)return null;const c=Number(a.at(-1).close),e20=ema(a,20),e50=ema(a,50);return c>e20&&e20>e50?'BUY':c<e20&&e20<e50?'SELL':null}
function independentOpportunity(ctx){
 const m1=candleSeries(ctx?.m1),m5=candleSeries(ctx?.m5),m15=candleSeries(ctx?.m15);if(m1.length<80||m5.length<55||m15.length<55)return null;
 const series=m1.slice(0,-1);if(series.length<80)return null;const a=series.at(-1),prev=series.at(-2),entry=Number(a.close),atr=atrSeries(series,14),r=rsiSeries(series,14),e20=ema(series,20),e50=ema(series,50);if(!Number.isFinite(entry)||!Number.isFinite(atr)||atr<=0||!Number.isFinite(r)||!Number.isFinite(e20)||!Number.isFinite(e50))return null;
 const dirs=[tfDir(m1),tfDir(m5),tfDir(m15)],hi=dirs.filter(x=>x==='BUY').length,lo=dirs.filter(x=>x==='SELL').length;
 const look=series.slice(-21,-1),recentHigh=look.length?Math.max(...look.map(c=>Number(c.high))):NaN,recentLow=look.length?Math.min(...look.map(c=>Number(c.low))):NaN;
 const body=Math.abs(Number(a.close)-Number(a.open||a.close)),range=Math.max(Number(a.high)-Number(a.low),0.0001),closePos=(entry-Number(a.low))/range;
 const upper=Number(a.high)-Math.max(entry,Number(a.open||entry)),lower=Math.min(entry,Number(a.open||entry))-Number(a.low);
 const bull=entry>Number(prev.close)&&entry>e20&&e20>=e50,bear=entry<Number(prev.close)&&entry<e20&&e20<=e50;
 const breakoutBuy=entry>recentHigh,breakoutSell=entry<recentLow,rejectBuy=lower>=body*.9&&closePos>=.60,rejectSell=upper>=body*.9&&closePos<=.40;
 const buyEvidence=(hi>=2?22:0)+(bull?16:0)+(r>55&&r<78?12:0)+(breakoutBuy?18:0)+(rejectBuy?14:0)+(body>=atr*.18?8:0)+(closePos>=.65?6:0);
 const sellEvidence=(lo>=2?22:0)+(bear?16:0)+(r<45&&r>22?12:0)+(breakoutSell?18:0)+(rejectSell?14:0)+(body>=atr*.18?8:0)+(closePos<=.35?6:0);
 const dir=buyEvidence>=sellEvidence?'BUY':'SELL',score=clamp(Math.max(buyEvidence,sellEvidence),0,100),tfCount=dir==='BUY'?hi:lo;
 const confirmations=dir==='BUY'?Number(bull)+Number(breakoutBuy||rejectBuy)+Number(r>55&&r<78)+Number(body>=atr*.18&&closePos>=.65):Number(bear)+Number(breakoutSell||rejectSell)+Number(r<45&&r>22)+Number(body>=atr*.18&&closePos<=.35);
 if(score<62||confirmations<2)return null;if((dir==='BUY'&&(r<60||r>=70))||(dir==='SELL'&&(r<=30||r>=45)))return null;
 const swing=dir==='BUY'?Math.min(...series.slice(-12).map(c=>Number(c.low))):Math.max(...series.slice(-12).map(c=>Number(c.high)));
 const risk=Math.max(atr*.80,Math.abs(entry-swing)+atr*.15),sl=dir==='BUY'?entry-risk:entry+risk,tp=dir==='BUY'?entry+risk*1.50:entry-risk*1.50;
 const hist=resolved(),base=hist.length?hist.reduce((s,t)=>s+outcome(t.status),0)/hist.length:.5,technical=score/100,pWin=clamp(Math.round((base*.35+technical*.65)*100),55,88);
 const ts=a.timestamp||new Date().toISOString(),reasons=[];reasons.push(tfCount>=3?'M1/M5/M15 alinhados':'2 de 3 timeframes M1/M5/M15 alinhados');
 if(dir==='BUY'&&(breakoutBuy||rejectBuy))reasons.push(breakoutBuy?'rompimento de resistência':'rejeição de suporte');
 if(dir==='SELL'&&(breakoutSell||rejectSell))reasons.push(breakoutSell?'rompimento de suporte':'rejeição de resistência');
 reasons.push(dir==='BUY'?'momentum BUY + EMA20/EMA50':'momentum SELL + EMA20/EMA50');
 return{type:dir,source:'IA',signalKind:'IA',signalTimestamp:new Date(ts).toISOString(),price:entry,tp,sl,rr:1.5,rr1:1.5,atr,rsi:r,trend1:dirs[0]==='BUY'?'ALTA':dirs[0]==='SELL'?'BAIXA':'NEUTRO',trend5:dirs[1]==='BUY'?'ALTA':dirs[1]==='SELL'?'BAIXA':'NEUTRO',trend15:dirs[2]==='BUY'?'ALTA':dirs[2]==='SELL'?'BAIXA':'NEUTRO',confidence:pWin,score,reasons,setupState:'IA_OPORTUNIDADE',ai:{mode:'OPORTUNIDADE IA',score,pWin,samples:hist.length,recommendation:pWin>=70?'FORTE':'FAVORÁVEL',opinion:'A IA detetou uma oportunidade Sniper forte, mesmo sem alinhamento completo dos filtros M1/M5/M15.',reasons,source:'IA'},aiOpportunity:true,aiModelVersion:MODEL_VERSION};
}
function rrSafe(a){return n(a?.rr1,n(a?.rr,0))}
function attach(a,ctx){if(!a)return a;if(["BUY","SELL"].includes(up(a.type))){const x=evaluate(a);return{...a,ai:x,aiScore:x.score,aiWinRate:x.pWin,aiOpinion:x.opinion,aiRecommendation:x.recommendation,aiFeatures:x.aiFeatures,aiModelVersion:MODEL_VERSION}}const opp=independentOpportunity(ctx);return{...a,aiOpportunity:opp,ai:opp?.ai||{mode:"OPINIÃO",score:0,pWin:null,samples:resolved().length,recommendation:"SEM OPORTUNIDADE",opinion:"A IA está a analisar o mercado independentemente dos filtros.",reasons:[]},aiModelVersion:MODEL_VERSION}}
function learn(){const rs=rows();return{samples:rs.length,baseWinRate:rs.length?Math.round(rs.reduce((s,r)=>s+r.y,0)/rs.length*100):50,trained:rs.length>0,modelVersion:MODEL_VERSION}}
window.RBTraderProAI={evaluate,attach,independentOpportunity,learn,features,constants:{FILTER_PWIN,FILTER_SCORE,MAX_HISTORY,KEY,MODEL:MODEL_VERSION}};learn()})();