// Stage 2 (narration only). Selection is always Stage 1's job (the facts below come straight out
// of data/current.json, already written by fetch-team-data.mjs/fetch-injuries.mjs/
// fetch-props.mjs) -- this script is barred from inventing stats or deciding what matters, same
// discipline as CFB HQ's narrate.mjs. If ANTHROPIC_API_KEY is unset, or the call fails for any
// reason, a plain deterministic sentence ships instead -- a bad API day never means blank text.
// blurbSource records which path ran.
//
// Deliberately NOT using ESPN's summary.news for "why this game matters" -- confirmed live it's
// mostly generic league news (a Packers RB arrest, an unrelated trade, fantasy tips), not
// matchup-specific; only 1 of 6 articles for a real fetched game even mentioned the Seahawks.
// Using it would mean presenting irrelevant headlines as if they explained this game. The "why it
// matters" angle below comes from meta.seasonType instead -- honest preseason framing (roster
// battles, not stakes) rather than fabricated importance.
import { readCurrent, writeCurrent } from "./lib/io.mjs";
import { selectRelevant } from "./lib/newsRelevance.mjs";

function buildFacts(current) {
  const { nextGame, record, meta } = current;
  if (!nextGame) return null;

  const gameInjuries = nextGame.injuries?.sea ?? [];
  const outCount = gameInjuries.filter((i) => /out|reserve/i.test(i.status)).length;
  const questionableCount = gameInjuries.filter((i) => /questionable|doubtful/i.test(i.status)).length;
  const oppInjuries = nextGame.injuries?.opponent ?? [];
  const oppOutCount = oppInjuries.filter((i) => /out|reserve/i.test(i.status)).length;

  const def = nextGame.defense ?? {};

  return {
    opponent: nextGame.opponent?.name ?? "the opponent",
    homeAway: nextGame.homeAway,
    isPreseason: meta?.seasonType === "PRE" || nextGame.seasonType === "PRE",
    record: `${record.overall.wins}-${record.overall.losses}${record.overall.ties ? `-${record.overall.ties}` : ""}`,
    streak: record.overall.streak,
    spread: nextGame.odds?.details ?? null,
    overUnder: nextGame.odds?.overUnder ?? null,
    outCount,
    questionableCount,
    topInjuryNames: gameInjuries.slice(0, 3).map((i) => i.name).filter(Boolean),
    oppOutCount,
    topOppInjuryNames: oppInjuries.slice(0, 2).map((i) => i.name).filter(Boolean),
    seaAvgPointsAgainst: def.sea?.avgPointsAgainst ?? null,
    seaSacksPerGame: def.sea?.sacksPerGame ?? null,
    oppAvgPointsAgainst: def.opponent?.avgPointsAgainst ?? null,
    oppSacksPerGame: def.opponent?.sacksPerGame ?? null,
    isFinal: nextGame.live?.status === "final",
    finalScore: nextGame.live?.status === "final"
      ? `SEA ${nextGame.homeAway === "home" ? nextGame.live.homeScore : nextGame.live.awayScore}, ${nextGame.opponent?.abbr ?? "OPP"} ${nextGame.homeAway === "home" ? nextGame.live.awayScore : nextGame.live.homeScore}`
      : null,
  };
}

function deterministicWhatToWatch(facts) {
  const bullets = [];
  bullets.push(
    `Seahawks (${facts.record}) ${facts.homeAway === "home" ? "host" : "travel to"} the ${facts.opponent}${facts.isPreseason ? " in their preseason finale" : ""}.`
  );
  if (facts.isPreseason) {
    bullets.push(
      "Doesn't count in the standings -- this one's about the last roster battles before final cuts, not stakes."
    );
  } else if (facts.spread) {
    bullets.push(
      `Vegas has this at ${facts.spread}${facts.overUnder ? `, total ${facts.overUnder}` : ""}.`
    );
  }
  if (facts.seaSacksPerGame != null && facts.oppSacksPerGame != null) {
    bullets.push(
      `Both defenses are getting after it early: Seattle's averaging ${Number(facts.seaSacksPerGame).toFixed(1)} sacks/game, ${facts.opponent} ${Number(facts.oppSacksPerGame).toFixed(1)}.`
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

function possessive(name) {
  return name.endsWith("s") ? `${name}'` : `${name}'s`;
}

function deterministicPropInsight(edge, facts) {
  const seaCtx = facts.seaAvgPointsAgainst != null
    ? `Seattle's defense is allowing ${facts.seaAvgPointsAgainst} pts/game`
    : null;
  const oppCtx = facts.oppAvgPointsAgainst != null
    ? `${possessive(facts.opponent)} defense is allowing ${facts.oppAvgPointsAgainst} pts/game`
    : null;
  const defenseLine = edge.side === "sea" ? oppCtx : seaCtx; // the OTHER team's defense is what matters for this player's prop
  const parts = [];
  if (defenseLine) parts.push(defenseLine);
  if (facts.isPreseason) {
    parts.push("no meaningful current-season game log to compare this line against yet, and backups this deep into preseason see uneven, unpredictable snap counts");
  }
  return parts.length > 0
    ? `${parts.join(" -- ")}.`
    : "Not enough data yet to size this line up against anything real.";
}

// Deliberately grounded in a real headline (attributed, not paraphrased) rather than a generic
// template sentence -- same "a bad API day never means blank text, but never fabricated either"
// discipline as the rest of this file's fallbacks.
function deterministicMatchupBlurb(facts, relevantNews) {
  const top = relevantNews[0];
  return `Seattle (${facts.record}) ${facts.homeAway === "home" ? "hosts" : "travels to"} the ${facts.opponent} -- ${top.title}.`;
}

function buildMatchupBlurbPrompt(facts, relevantNews) {
  const snippets = relevantNews
    .map((n) => `• ${n.title}${n.description ? `: ${n.description}` : ""} (${n.source})`)
    .join("\n");
  return (
    `Write a punchy 2-3 sentence "matchup buzz" blurb for Seahawks fans previewing the upcoming ` +
    `game against the ${facts.opponent}, ${facts.homeAway === "home" ? "at home" : "on the road"}. ` +
    `The reader already sees the record, betting line, and injury counts elsewhere on this page -- ` +
    `do not restate those numbers. Focus on storylines, roster intrigue, and matchup context ` +
    `instead. Use ONLY the news snippets below -- don't invent quotes, stats, or storylines that ` +
    `aren't in them, and ignore anything that isn't genuinely about this matchup or team ` +
    `storylines (merchandise, unrelated transactions, fantasy content) even if it slipped through ` +
    `the filtering. ${facts.isPreseason ? "This is a preseason game -- keep the hype honest: roster-battle energy, not manufactured playoff stakes. " : ""}` +
    `Sports-journalist tone: specific, active verbs, no cliches ("the stage is set", "all eyes on", ` +
    `"circle the calendar"). No throat-clearing openers like "As the Seahawks prepare...". Output ` +
    `only the blurb text, no preamble.\n\nNews coverage:\n${snippets}`
  );
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
  const hasKey = Boolean(process.env.ANTHROPIC_API_KEY);

  if (facts) {
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
            `Write exactly 3 short "what to watch" bullets for this upcoming Seahawks game, with real ` +
              `hype energy for the fans -- but honest hype. Use ONLY these facts, don't invent stats or ` +
              `injuries not listed: ${JSON.stringify(facts)}. If isPreseason is true, do NOT manufacture ` +
              `playoff-race or statement-game stakes that don't exist -- the honest, still-exciting angle ` +
              `for a preseason finale is roster battles, players fighting for a 53-man spot, and depth ` +
              `guys getting a real shot, not the standings. Return each bullet on its own line, no ` +
              `numbering or bullet characters.`
          );
          if (llm) { bullets = llm.split("\n").map((l) => l.trim()).filter(Boolean); source = "llm"; }
        } catch (err) {
          console.error("Claude what-to-watch call failed, using fallback:", err.message);
        }
      }
      current.nextGame.whatToWatch = bullets.map((text) => ({ text, blurbSource: source }));
    }

    // Matchup "buzz" blurb -- storyline/roster-intrigue color from actual news coverage,
    // deliberately separate from whatToWatch above (which stays strictly fact-grounded: record,
    // spread, injury counts -- see that block's own prompt). Generated once per matchup: only
    // when nextGame.newsBlurb is still empty for THIS eventId (fetch-team-data.mjs resets it to
    // null on a new opponent, same carry-forward/reset treatment as whatToWatch/recap above) --
    // keeps this stable through the week instead of subtly rephrasing itself every daily run, and
    // stops burning a Claude call once a real blurb already exists for this game.
    if (!facts.isFinal && !current.nextGame.newsBlurb?.text) {
      const relevantNews = selectRelevant(current.news?.items, current.nextGame.opponent, 5);
      if (relevantNews.length === 0) {
        console.log("No matchup-relevant news yet -- leaving newsBlurb unset, will retry next run.");
      } else {
        let text = deterministicMatchupBlurb(facts, relevantNews);
        let source = "fallback";
        if (hasKey) {
          try {
            const llm = await withClaude(buildMatchupBlurbPrompt(facts, relevantNews));
            if (llm) { text = llm; source = "llm"; }
          } catch (err) {
            console.error("Claude matchup-blurb call failed, using fallback:", err.message);
          }
        }
        current.nextGame.newsBlurb = { text, blurbSource: source };
      }
    }
  } else {
    console.log("No nextGame to narrate.");
  }

  // Predictor edges: only narrate ones missing an insight (fetch-props.mjs already carries
  // forward any prior insight for a market it's seen before, so this only does new work on
  // markets that just appeared).
  const edges = current.predictor?.edges ?? [];
  const pending = edges.filter((e) => !e.insight);
  if (facts && pending.length > 0) {
    for (const edge of pending) {
      let text = deterministicPropInsight(edge, facts);
      let source = "fallback";
      if (hasKey) {
        try {
          const llm = await withClaude(
            `One short, honest sentence sizing up this player prop line for a fan. Use ONLY these facts, ` +
              `don't invent a player trend that isn't given: edge=${JSON.stringify(edge)}, ` +
              `gameContext=${JSON.stringify(facts)}. If there's no real trend data available, say so ` +
              `plainly rather than pretending there's an edge -- don't give betting advice either way.`
          );
          if (llm) { text = llm; source = "llm"; }
        } catch (err) {
          console.error(`Claude prop-insight call failed for ${edge.oddID}, using fallback:`, err.message);
        }
      }
      edge.insight = text;
      edge.blurbSource = source;
    }
  }

  await writeCurrent(current);
  console.log(
    `Narrated nextGame + ${pending.length} predictor edge(s) (source: ${hasKey ? "llm-attempted" : "fallback, no ANTHROPIC_API_KEY"}).`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
