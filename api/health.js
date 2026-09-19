const market=require("./market");
module.exports=async function handler(req,res){
  res.setHeader("Cache-Control","no-store, max-age=0");
  try{
    const m=await market.getMarket("XAUUSD","1m");
    const live=Boolean(m.marketState==="open"&&m.realOpenBar===true&&Number.isFinite(m.quoteAgeSec)&&m.quoteAgeSec<=15&&m.stale!==true);
    res.status(200).json({status:"OK",marketConnected:true,liveM1:live,source:m.source,symbol:m.symbol,history:"localStorage",aiEnabled:false,mode:"ALERTAS",timestamp:new Date().toISOString()});
  }catch(e){
    res.status(503).json({status:"DEGRADED",marketConnected:false,liveM1:false,history:"localStorage",aiEnabled:false,mode:"ALERTAS",error:e.message,timestamp:new Date().toISOString()});
  }
};
