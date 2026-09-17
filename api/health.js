const axios=require("axios");
module.exports=async function handler(req,res){
  res.setHeader("Cache-Control","no-store, max-age=0");
  let spot=null,marketConnected=false;
  try{const r=await axios.get("https://api.gold-api.com/price/XAU",{timeout:6000,headers:{"User-Agent":"RB-Gold-Sniper/4.0"}});spot=Number(r.data?.price);marketConnected=Number.isFinite(spot)}catch{}
  res.status(marketConnected?200:503).json({status:marketConnected?"OK":"DEGRADED",marketConnected,source:marketConnected?"Gold API — XAU spot + market.js candles":"XAU spot indisponível",symbol:"XAUUSD",aiEnabled:Boolean(process.env.OPENAI_API_KEY),mode:"ALERTAS",timestamp:new Date().toISOString()});
};
