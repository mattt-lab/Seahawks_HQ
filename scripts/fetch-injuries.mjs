// Standalone current injury report (not tied to a specific opponent) -- see docs/data-schema.md
// for why this is Sleeper, not ESPN: ESPN's per-athlete `injuries` field came back empty even for
// players confirmed hurt elsewhere, and the core API's injuries endpoint is a noisy news/
// transaction log, not a clean table.
import { getTeamInjuryReport } from "./lib/sleeper.mjs";
import { readCurrent, writeCurrent } from "./lib/io.mjs";

async function main() {
  const report = await getTeamInjuryReport("SEA");
  const existing = await readCurrent();
  if (!existing) {
    throw new Error("data/current.json doesn't exist yet -- run fetch-team-data.mjs first.");
  }

  existing.injuries = {
    asOf: new Date().toISOString(),
    source: "sleeper",
    report,
  };

  await writeCurrent(existing);
  console.log(`Wrote ${report.length} current injury entries.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
