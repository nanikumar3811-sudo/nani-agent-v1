import "dotenv/config";
import { saveThesis, getTheses, recordReaction } from "./db.js";

const id = saveThesis("TEST", "Self-test thesis", "NEUTRAL", "test invalidation");
if (!id) throw new Error("thesis insert failed");
const rows = getTheses("TEST");
if (!rows.length) throw new Error("thesis retrieval failed");
recordReaction("TEST", "expected", "observed", "self-test");
console.log("NANI self-test passed");
