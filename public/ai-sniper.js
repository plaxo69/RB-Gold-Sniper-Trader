(()=>{const KEY="rb_gold_sniper_ai_v5",MAX_HISTORY=1000,FILTER_PWIN=.57,FILTER_SCORE=62,MODEL_VERSION="RB-TRADER-PRO-HYBRID-v5";
const n=(v,d=0)=>Number.isFinite(+v)?+v:d,up=v=>String(v||"").toUpperCase(),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function resolved(){try{const x=JSON.parse(localStorage.getItem("rb_gold_sniper_signals_v1")||"[]");return Array.isArray(x)?x.filter(t=>["WIN","LOSS","BE"].includes(up(t?.status))).slice(0,MAX_HISTORY):[]}catch{return[]}}
function outcome(s){return up(s)==="WIN"?1:up(s)==="LOSS"?0:.5}
function direction(a){return up(a?.type)==="SELL"?"SELL":"BUY"}
function features(a){
 const f=a?.filters||{},t=a?.tactical||{},d=direction(a),r=n(a?.rsi,50),atr=n(a?.atr,0),price=Math.max(n(a?.price,1),1),rr=n(a?.rr1,n(a?.rr,0)),align=[up(a?.trend5),up(a?.trend15),up(a?.trend1)].filter(x=>x===("BUY"===d?"ALTA":"BAIXA")).length;
 return{dir:d==="SELL"?"S":"B",score:Math.round(n(a?.score,50)/5)*5,rsiBand:r<30?"EXTREME":r<40?"LOW":r<50?"MIDLOW":r<60?"MID":r<70?"GOOD":"HIGH",atrBand:atr/price<.0005?"LOW":atr/price<.001?"NORMAL":atr/price<.002?"HIGH":"VERY_HIGH",align,h1Aligned:up(a?.trend1)===(d==="BUY"?"ALTA":"BAIXA")?1:0,ema:(d==="BUY"?!!f.emaBuy:!!f.emaSell)?1:0,structure:(d==="BUY"?!!f.structuralConfirmBuy:!!f.structuralConfirmSell)?1:0,bos:(d==="BUY"?!!(t.bosBuy||t.chochBuy):!!(t.bosSell||t.chochSell))?1:0,tactical:t.buy?'BUY':t.sell?'SELL':'NONE',retest:(d==="BUY"?!!f.pullbackRetestBuy:!!f.pullbackRetestSell)?1:0,rejection:(d==="BUY"?!!f.rejectionBuy:!!f.rejectionSell)?1:0,continuation:(d==="BUY"?!!f.continuationBuy:!!f.continuationSell)?1:0,body:f.bodyIsDecisive?1:0,close:d==="BUY"?(n(a?.closeLocation,.5)>=.55?1:0):(n(a?.closeLocation,.5)<=.45?1:0),extension:(d==="BUY"?!!f.extensionBuy:!!f.extensionSell)?1:0,rr:rr>=1.5?"GOOD":rr>=1?"OK":"LOW",tp2:a?.tp2Eligible?1:0}
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
 const d=direction(a),r=n(a?.rsi,50),rr=n(a?.rr1,n(a?.rr,0)),score=n(a?.score,50);
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
 const d=direction(a),r=n(a?.rsi,50),rr=n(a?.rr1,n(a?.rr,0)),trend=f.align===3?"M5/M15/H1 alinhados":f.align===2?"2 timeframes alinhados":"alinhamento parcial";
 const positives=[],warnings=[];
 if(f.align>=2)positives.push(trend);
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
function rrSafe(a){return n(a?.rr1,n(a?.rr,0))}
function attach(a){if(!a||!["BUY","SELL"].includes(up(a.type)))return a;const x=evaluate(a);return{...a,ai:x,aiScore:x.score,aiWinRate:x.pWin,aiOpinion:x.opinion,aiRecommendation:x.recommendation,aiFeatures:x.aiFeatures,aiModelVersion:MODEL_VERSION}}
function learn(){const rs=rows();return{samples:rs.length,baseWinRate:rs.length?Math.round(rs.reduce((s,r)=>s+r.y,0)/rs.length*100):50,trained:rs.length>0,modelVersion:MODEL_VERSION}}
window.RBTraderProAI={evaluate,attach,learn,features,constants:{FILTER_PWIN,FILTER_SCORE,MAX_HISTORY,KEY,MODEL:MODEL_VERSION}};learn()})();