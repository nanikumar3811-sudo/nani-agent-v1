import "dotenv/config";
import { premarketPacket } from "./analysis.js";
import { saveSnapshot } from "./db.js";

const list = (process.env.WATCHLIST || "SPY,QQQ,NVDA,MSFT,GOOG,AVGO,QCOM,META,CRCL,SNAP,IREN,PL,SMCI,IBM,BABA,KWEB,ZIM")
  .split(",").map(x=>x.trim().toUpperCase()).filter(Boolean);

const packet = await premarketPacket(list);
saveSnapshot("PREMARKET", packet);
console.log(JSON.stringify(packet, null, 2));
