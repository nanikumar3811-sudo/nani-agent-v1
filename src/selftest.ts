import "dotenv/config";

import {
  closeDb,
  dbHealth,
  dbMode,
  getTheses,
  initDb,
  latestSnapshot,
  recentReactions,
  recentSnapshots,
  recordReaction,
  saveSnapshot,
  saveThesis
} from "./db.js";

async function main() {
  console.log("NANI database self-test");
  console.log("-----------------------");

  console.log(
    `Database mode: ${dbMode()}`
  );

  await initDb();

  const health = await dbHealth();

  console.log(
    "Database health:",
    JSON.stringify(health, null, 2)
  );

  if (!health.ok) {
    throw new Error(
      "Database health check failed"
    );
  }

  const snapshotId = await saveSnapshot(
    "SELFTEST",
    {
      test: true,
      timestamp: new Date().toISOString()
    }
  );

  console.log(
    `Snapshot created: ${snapshotId}`
  );

  const latest = await latestSnapshot(
    "SELFTEST"
  );

  if (!latest) {
    throw new Error(
      "Latest snapshot was not returned"
    );
  }

  console.log(
    `Latest snapshot: ${latest.id}`
  );

  const snapshots =
    await recentSnapshots(5);

  console.log(
    `Recent snapshots: ${snapshots.length}`
  );

  const thesisId = await saveThesis(
    "NANI",
    "Self-test thesis",
    "NEUTRAL",
    "Self-test completed",
    "Generated automatically by database self-test"
  );

  console.log(
    `Thesis created: ${thesisId}`
  );

  const theses =
    await getTheses("NANI");

  console.log(
    `Active NANI theses: ${theses.length}`
  );

  const reactionId =
    await recordReaction(
      "NANI",
      "Expected database write to succeed",
      "Database write succeeded",
      "PostgreSQL persistence self-test",
      "PASS"
    );

  console.log(
    `Reaction created: ${reactionId}`
  );

  const reactions =
    await recentReactions(5);

  console.log(
    `Recent reactions: ${reactions.length}`
  );

  console.log("");
  console.log("NANI database self-test: PASS");
}

main()
  .catch((error: unknown) => {
    console.error(
      "NANI database self-test: FAIL"
    );

    console.error(
      error instanceof Error
        ? error.stack || error.message
        : String(error)
    );

    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await closeDb();
    } catch (error: unknown) {
      console.error(
        "Database shutdown error:",
        error instanceof Error
          ? error.message
          : String(error)
      );
    }
  });