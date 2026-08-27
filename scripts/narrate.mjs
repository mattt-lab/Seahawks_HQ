// Stage 2 (narration only). Selection is always Stage 1's job (the facts below come straight out
// of data/current.json, already written by fetch-team-data.mjs/fetch-injuries.mjs) -- this script
// is barred from inventing stats or deciding what matters, same discipline as CFB HQ's narrate.mjs.
// If ANTHROPIC_API_KEY is unset, or the call fails for any reason, a plain deterministic sentence
// ships instead -- a bad API day never means blank text. blurbSource records which path ran.
import { readCurrent, writeCurrent } from "./lib/io.mjs";

function buildFacts(current) {
  const { nextGame, record } = current;
  if (!nextGame) return null;

  const gameInjuries = nextGame.injuries?.sea ?? [];
  const outCount = gameInjuries.filter((i) => /out|reserve/i.test(i.status)).length;
  const questionableCount = gameInjuries.filter((i) => /questionable|doubtful/i.test(i.status)).length;

  return {
    opponent: nextGame.opponent?.name ?? "the opponent",
    homeAway: nextGame.homeAway,
    record: `${record.overall.wins}-${record.overall.losses}${record.overall.ties ? `-${record.overall.ties}` : ""}`,
    streak: record.overall.streak,
    spread: nextGame.odds?.details ?? null,
    overUnder: nextGame.odds?.overUnder ?? null,
    outCount,
    questionableCount,
    topInjuryNames: gameInjuries.slice(0, 3).map((i) => i.name).filter(Boolean),
    isFinal: nextGame.live?.status === "final",
    finalScore: nextGame.live?.status === "final"
      ? `SEA ${nextGame.homeAway === "home" ? nextGame.live.homeScore : nextGame.live.awayScore}, ${nextGame.opponent?.abbr ?? "OPP"} ${nextGame.homeAway === "home" ? nextGame.live.awayScore : nextGame.live.homeScore}`
      : null,
  };
}

function deterministicWhatToWatch(facts) {
  const bullets = [];
  bullets.push(
    `Seahawks (${facts.record}) ${facts.homeAway === "home" ? "host" : "travel to"} the ${facts.opponent}.`
  );
  if (facts.spread) {
    bullets.push(
      `Vegas has this at ${facts.spread}${facts.overUnder ? `, total ${facts.overUnder}` : ""}.`
    );
  }
  if (facts.outCount > 0 || facts.questionableCount > 0) {
    bullets.push(
      `Seattle's injury report: ${facts.outCount} out, ${facts.questionableCount} questionable${facts.topInjuryNames.length ? ` (${facts.topInjuryNames.join(", ")})` : ""}.`
    );
  } else {
    bullets.push("Seattle's injury report is clean heading into this one.");
  }
  return bullets;
}

function deterministicRecap(facts) {
  return `Final: ${facts.finalScore}.`;
}

async function withClaude(prompt) {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const msg = await client.messages.create({
    model: "claude-opus-5",
    max_tokens: 300,
    messages: [{ role: "user", content: prompt }],
  });
  return msg.content.find((b) => b.type === "text")?.text?.trim() ?? null;
}

async function main() {
  const current = await readCurrent();
  if (!current) throw new Error("data/current.json doesn't exist yet -- run fetch-team-data.mjs first.");

  const facts = buildFacts(current);
  if (!facts) {
    console.log("No nextGame to narrate.");
    return;
  }

  const hasKey = Boolean(process.env.ANTHROPIC_API_KEY);

  if (facts.isFinal && !current.nextGame.recap?.text) {
    let text = deterministicRecap(facts);
    let source = "fallback";
    if (hasKey) {
      try {
        const llm = await withClaude(
          `Write one short, hyped sentence recapping this Seahawks game. Use ONLY these facts, ` +
            `don't invent stats: ${JSON.stringify(facts)}`
        );
        if (llm) { text = llm; source = "llm"; }
      } catch (err) {
        console.error("Claude recap call failed, using fallback:", err.message);
      }
    }
    current.nextGame.recap = { text, blurbSource: source };
  }

  if (!current.nextGame.recap?.text || !facts.isFinal) {
    let bullets = deterministicWhatToWatch(facts);
    let source = "fallback";
    if (hasKey && !facts.isFinal) {
      try {
        const llm = await withClaude(
          `Write exactly 3 short, hyped "what to watch" bullets for this upcoming Seahawks game. ` +
            `Use ONLY these facts, don't invent stats or injuries not listed: ${JSON.stringify(facts)}. ` +
            `Return each bullet on its own line, no numbering or bullet characters.`
        );
        if (llm) { bullets = llm.split("\n").map((l) => l.trim()).filter(Boolean); source = "llm"; }
      } catch (err) {
        console.error("Claude what-to-watch call failed, using fallback:", err.message);
      }
    }
    current.nextGame.whatToWatch = bullets.map((text) => ({ text, blurbSource: source }));
  }

  await writeCurrent(current);
  console.log(`Narrated nextGame (source: ${hasKey ? "llm-attempted" : "fallback, no ANTHROPIC_API_KEY"}).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
