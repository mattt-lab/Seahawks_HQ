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
import { selectRelevant, selectPostgameRelevant } from "./lib/newsRelevance.mjs";

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
    oppAbbr: nextGame.opponent?.abbr ?? null,
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
    // Week 1 pregame: both teams are legitimately 0-0-0 with avgPointsAgainst literally 0 --
    // real value, not a bug, but "allowing 0.0 pts/game" reads like an elite defense rather than
    // "no games played yet." Detected off SEA's own record (always 0 games in that exact spot,
    // regardless of opponent's own bye/schedule quirks) and used to suppress that framing below.
    gamesPlayedThisSeason: record.overall.wins + record.overall.losses + record.overall.ties,
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
  if (facts.gamesPlayedThisSeason > 0 && facts.seaSacksPerGame != null && facts.oppSacksPerGame != null) {
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

// Bare score plus verified, non-copyrighted structural facts (turnover counts from ESPN's own
// drive-result data) -- no LLM needed, no news article needed. This alone is a real improvement
// over deterministicRecap() above: "Final: SEA 13, NE 10. Seattle forced 3 turnovers from the
// New England Patriots." beats a bare score line even with zero API keys available.
function deterministicRecapFromStory(facts, gameStory) {
  const parts = [`Final: ${facts.finalScore}.`];
  const oppTurnovers = facts.oppAbbr ? gameStory.turnoversByTeam?.[facts.oppAbbr] : null;
  const seaTurnovers = gameStory.turnoversByTeam?.SEA;
  if (oppTurnovers) {
    parts.push(`Seattle forced ${oppTurnovers} turnover${oppTurnovers === 1 ? "" : "s"} from the ${facts.opponent}.`);
  }
  if (seaTurnovers) {
    parts.push(`Seattle turned it over ${seaTurnovers} time${seaTurnovers === 1 ? "" : "s"}.`);
  }
  return parts.join(" ");
}

// Confirmed live 2026-09-11 against the real SEA/NE game: ESPN's own summary?event= (already
// fetched for nextGame, no extra call) carries a full AP-sourced recap article plus play-by-play
// scoring data -- see buildGameStory() in fetch-team-data.mjs. This is the PRIMARY recap source;
// selectPostgameRelevant()'s RSS-based approach below is now the fallback for whenever ESPN
// hasn't published its own article yet (rare, but possible checking very soon after final).
//
// "Rephrase, don't quote" is explicit and repeated in the prompt on purpose -- articleStory is
// real AP wire content, licensed to ESPN, not to this site. The turnover counts and scoring plays
// are our own derived facts (not copyrightable) and are what should anchor the specific numbers;
// the article is reference material for narrative color only.
function buildGameStoryRecapPrompt(facts, gameStory) {
  const scoringSummary = (gameStory.scoringPlays ?? [])
    .map((p) => `Q${p.period} ${p.team}: ${p.text}`)
    .join("\n") || "(no scoring play detail available)";
  const turnoverSummary = Object.entries(gameStory.turnoversByTeam ?? {})
    .map(([team, n]) => `${team}: ${n} turnover${n === 1 ? "" : "s"}`)
    .join(", ") || "no turnovers recorded";
  return (
    `Write a punchy 3-4 sentence POSTGAME RECAP for Seahawks fans, in YOUR OWN WORDS. This is a ` +
    `summary, not a copy -- do not copy sentences or distinctive phrases verbatim from the ` +
    `reference article below; rephrase everything. The Seahawks ` +
    `${facts.homeAway === "home" ? "hosted" : "played at"} the ${facts.opponent}. Final score: ` +
    `${facts.finalScore}. Turnovers: ${turnoverSummary}. Use these exact counts if you mention ` +
    `turnovers -- they're verified, the article's own wording of them is not needed.\n\n` +
    `Scoring plays:\n${scoringSummary}\n\n` +
    `Reference article (context and color only -- rephrase, never quote):\n` +
    `${[gameStory.articleHeadline, gameStory.articleDescription, gameStory.articleStory].filter(Boolean).join("\n")}\n\n` +
    `Focus on the narrative arc -- turnovers, injuries, momentum swings, a comeback if there was ` +
    `one. Do NOT state or imply anything about the team's championship history, playoff record, ` +
    `awards, or standing unless that exact claim appears in the reference material -- confirmed ` +
    `live elsewhere in this file that Claude will otherwise invent a "title defense" storyline ` +
    `with zero basis in the source material. Sports-journalist tone: specific, active verbs, no ` +
    `cliches ("the stage is set", "all eyes on"). No throat-clearing openers. Output only the ` +
    `recap text, no preamble.`
  );
}

// Same "grounded in a real headline, not paraphrased" discipline as deterministicMatchupBlurb
// below, for whenever real recap coverage exists but there's no ANTHROPIC_API_KEY (or the call
// fails) to turn it into real prose. Fallback tier -- see buildGameStoryRecapPrompt() above,
// which is tried first.
function deterministicRecapWithNews(facts, relevantNews) {
  return `Final: ${facts.finalScore}. ${relevantNews[0].title}.`;
}

// Fallback tier, used only when ESPN's own gameStory (article + scoring plays) isn't available --
// see buildGameStoryRecapPrompt() above, which is tried first and is the normal path.
function buildRecapPrompt(facts, relevantNews) {
  const snippets = relevantNews
    .map((n) => `• ${n.title}${n.description ? `: ${n.description}` : ""} (${n.source})`)
    .join("\n");
  return (
    `Write a punchy 3-4 sentence POSTGAME RECAP for Seahawks fans. The Seahawks ` +
    `${facts.homeAway === "home" ? "hosted" : "played at"} the ${facts.opponent}. Final score: ` +
    `${facts.finalScore}. Use ONLY the news snippets below for any additional detail (standout ` +
    `performances, key plays, coach comments) -- don't invent stats, quotes, or plays that aren't ` +
    `in them, and ignore anything that isn't genuinely about this game (merchandise, unrelated ` +
    `transactions, fantasy content) even if it slipped through the filtering. Do NOT state or ` +
    `imply anything about the team's championship history, playoff record, awards, or standing ` +
    `unless that exact claim appears in a snippet below -- confirmed live elsewhere in this file ` +
    `that Claude will otherwise invent a "title defense" storyline with zero basis in the source ` +
    `material. Sports-journalist tone: specific, active verbs, no cliches ("the stage is set", ` +
    `"all eyes on"). No throat-clearing openers. Output only the recap text, no preamble.\n\n` +
    `News coverage:\n${snippets}`
  );
}

function possessive(name) {
  return name.endsWith("s") ? `${name}'` : `${name}'s`;
}

function deterministicPropInsight(edge, facts) {
  const hasDefenseSample = facts.gamesPlayedThisSeason > 0;
  // ESPN's avgPointsAgainst is a raw float (e.g. 23.666666...) -- .toFixed(1) here, same
  // round-at-display-time treatment sacksPerGame already gets in deterministicWhatToWatch below.
  const seaCtx = hasDefenseSample && facts.seaAvgPointsAgainst != null
    ? `Seattle's defense is allowing ${Number(facts.seaAvgPointsAgainst).toFixed(1)} pts/game`
    : null;
  const oppCtx = hasDefenseSample && facts.oppAvgPointsAgainst != null
    ? `${possessive(facts.opponent)} defense is allowing ${Number(facts.oppAvgPointsAgainst).toFixed(1)} pts/game`
    : null;
  const defenseLine = edge.side === "sea" ? oppCtx : seaCtx; // the OTHER team's defense is what matters for this player's prop
  const parts = [];
  if (defenseLine) parts.push(defenseLine);
  if (facts.isPreseason) {
    parts.push("no meaningful current-season game log to compare this line against yet, and backups this deep into preseason see uneven, unpredictable snap counts");
  } else if (!hasDefenseSample) {
    parts.push("season opener -- no games played yet this year to size up either defense");
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
    `the filtering. Do NOT state or imply anything about the team's championship history, playoff ` +
    `record, awards, or standing (e.g. "defending champs", "on a mission to repeat") unless that ` +
    `exact claim appears in a snippet below -- confirmed live this is a real failure mode, not a ` +
    `hypothetical one: an earlier run of this exact prompt invented a "title defense" storyline ` +
    `with zero basis in the source material. ${facts.isPreseason ? "This is a preseason game -- keep the hype honest: roster-battle energy, not manufactured playoff stakes. " : ""}` +
    `Sports-journalist tone: specific, active verbs, no cliches ("the stage is set", "all eyes on", ` +
    `"circle the calendar"). No throat-clearing openers like "As the Seahawks prepare...". Output ` +
    `only the blurb text, no preamble.\n\nNews coverage:\n${snippets}`
  );
}

// max_tokens: 300 (the original value) truncated real responses mid-sentence -- confirmed live,
// a newsBlurb regeneration cut off mid-word. Claude Opus 5 runs extended thinking by default (no
// `thinking` param needed to enable it, unlike Opus 4.8/4.7), and those thinking tokens draw from
// the same max_tokens budget as the visible text, so 300 left too little room once any real
// thinking happened. effort: "low" is the right level for this file's tasks (phrasing 2-4 given
// sentences from facts already selected elsewhere, not open-ended reasoning) -- keeps thinking
// spend down without needing to disable it outright (which has its own failure modes on Opus 5).
async function withClaude(prompt) {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const msg = await client.messages.create({
    model: "claude-opus-5",
    max_tokens: 2048,
    output_config: { effort: "low" },
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
    // Retries (doesn't lock in) until a real "llm" recap exists -- this run might not have an
    // ANTHROPIC_API_KEY (confirmed live: locally, never), and even the primary ESPN-data tier's
    // article can lag final by a bit. Later runs during the recap grace period (see
    // fetch-team-data.mjs) keep re-checking rather than permanently locking in whatever was
    // available on the first attempt.
    if (facts.isFinal && current.nextGame.recap?.blurbSource !== "llm") {
      const gameStory = current.nextGame.gameStory;
      const hasGameStory = gameStory && (
        gameStory.articleStory || gameStory.articleDescription
        || Object.keys(gameStory.turnoversByTeam ?? {}).length > 0
        || (gameStory.scoringPlays ?? []).length > 0
      );

      let text;
      let source = "fallback";
      if (hasGameStory) {
        // Primary tier: ESPN's own article + real scoring/turnover data (see
        // buildGameStoryRecapPrompt's comment for why this beats the RSS-based tier below).
        text = deterministicRecapFromStory(facts, gameStory);
        if (hasKey) {
          try {
            const llm = await withClaude(buildGameStoryRecapPrompt(facts, gameStory));
            if (llm) { text = llm; source = "llm"; }
          } catch (err) {
            console.error("Claude recap call failed, using fallback:", err.message);
          }
        }
      } else {
        // Fallback tier: ESPN hadn't published its own article/scoring data yet when this ran.
        const relevantNews = current.nextGame.date
          ? selectPostgameRelevant(current.news?.items, current.nextGame.opponent, current.nextGame.date, 5)
          : [];
        if (relevantNews.length === 0) {
          text = deterministicRecap(facts);
        } else {
          text = deterministicRecapWithNews(facts, relevantNews);
          if (hasKey) {
            try {
              const llm = await withClaude(buildRecapPrompt(facts, relevantNews));
              if (llm) { text = llm; source = "llm"; }
            } catch (err) {
              console.error("Claude recap call failed, using fallback:", err.message);
            }
          }
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
