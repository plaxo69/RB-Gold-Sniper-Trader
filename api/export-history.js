// Persists the complete RB TRADER PRO history in one GitHub file.
const REPO='plaxo69/RB-Gold-Sniper-Trader',BRANCH='main',PATH='historico-trades.json',API='https://api.github.com';
function json(res,status,body){return res.status(status).json(body)}
function allowedHost(host){
  host=String(host||'').split(':')[0].toLowerCase();
  return host==='rb-gold-sniper-trader.vercel.app'||
    (host.startsWith('rb-gold-sniper-trader-')&&host.endsWith('.vercel.app'))||
    host==='rb-gold-sniper-live-ai-sniper.vercel.app'||
    (host.startsWith('rb-gold-sniper-live-ai-sniper-')&&host.endsWith('.vercel.app'));
}
function keyOf(t){return t?.signalKey||t?.key||((t?.type||'')+'-'+(t?.signalTimestamp||t?.time||''))}
function ts(t){const v=t?.signalTimestamp??t?.time??0;const n=Date.parse(v);return Number.isFinite(n)?n:0}
module.exports=async function handler(req,res){
 if(req.method!=='POST'){res.setHeader('Allow','POST');return json(res,405,{ok:false,error:'Method not allowed'})}
 const origin=String(req.headers.origin||''),host=String(req.headers.host||'');
 let allowed=false;
 if(origin){try{const u=new URL(origin);allowed=u.protocol==='https:'&&allowedHost(u.hostname)}catch{}}
 else allowed=allowedHost(host);
 if(!allowed)return json(res,403,{ok:false,error:'Origin not allowed'});
 const token=process.env.GITHUB_TOKEN;
 if(!token)return json(res,500,{ok:false,error:'GITHUB_TOKEN não está configurado no Vercel.'});
 const body=req.body||{};
 if(!Array.isArray(body.trades))return json(res,400,{ok:false,error:'Formato inválido: trades[] em falta.'});
 const headers={Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json','User-Agent':'RB-TRADER-PRO'};
 try{
   let sha=null,remoteTrades=[];
   const existing=await fetch(`${API}/repos/${REPO}/contents/${PATH}?ref=${BRANCH}`,{headers});
   if(existing.ok){
     const e=await existing.json();
     sha=e.sha||null;
     if(e.content){
       try{
         const decoded=Buffer.from(String(e.content).replace(/\\s/g,''),'base64').toString('utf8');
         const parsed=JSON.parse(decoded);
         if(Array.isArray(parsed.trades))remoteTrades=parsed.trades;
       }catch{}
     }
   }else if(existing.status!==404){
     return json(res,existing.status,{ok:false,error:'Não foi possível consultar o histórico no GitHub.'});
   }
   const map=new Map();
   const put=(t)=>{
     const k=keyOf(t); if(!k)return;
     const prev=map.get(k);
     if(!prev){map.set(k,t);return}
     const ps=String(prev.status||'ALERTA'),ns=String(t.status||'ALERTA'),pr=ps==='ALERTA',nr=ns==='ALERTA';
     if(pr&&!nr){map.set(k,t);return}
     if(!pr&&nr)return;
     map.set(k,t);
   };
   for(const t of remoteTrades||[])put(t);
   for(const t of body.trades||[])put(t);
   const trades=[...map.values()].sort((a,b)=>ts(b)-ts(a)).slice(0,500);
   const payload={exportedAt:new Date().toISOString(),source:'RB TRADER PRO',formatVersion:2,total:trades.length,trades};
   const encoded=Buffer.from(JSON.stringify(payload,null,2),'utf8').toString('base64');
   const commit=await fetch(`${API}/repos/${REPO}/contents/${PATH}`,{
     method:'PUT',headers,
     body:JSON.stringify({message:`RB TRADER PRO — atualizar histórico de trades — ${new Date().toISOString()}`,content:encoded,branch:BRANCH,...(sha?{sha}:{})})
   });
   const result=await commit.json();
   if(!commit.ok)return json(res,commit.status,{ok:false,error:result?.message||'Falha ao gravar no GitHub.'});
   return json(res,200,{ok:true,branch:BRANCH,path:PATH,total:payload.total,commit:result.commit?.sha||null,url:result.content?.html_url||null});
 }catch(error){return json(res,500,{ok:false,error:error.message||'Erro interno.'})}
};