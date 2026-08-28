// Scores fetch-news.mjs's items for relevance to the upcoming matchup before narrate.mjs hands
// the best few to Claude for the "matchup buzz" blurb. Adapted from the same pattern the Tour de
// France and F1 dashboards use (scripts/news_utils.py's score_article/select_for_stage in the
// tour-de-france repo) to keep off-topic and unimportant content out of an LLM summary: a hard
// clickbait veto, then additive scoring for opponent mentions and real preview/storyline
// language. Simpler than TdF's version on purpose -- TdF's feed covers the entire sport and needs
// to disambiguate "this stage" from "a different stage of the same race"; Seahawks HQ's two feeds
// are already Seahawks-only, so the only real question is "is this about the upcoming GAME, or
// just general team news" (a contract extension, a waiver claim) that doesn't belong in a
// matchup-hype blurb.

// Content categories a Seahawks-focused feed can still mix in that add nothing to a matchup
// preview -- mirrors CLICKBAIT_PATTERNS in tour-de-france/scripts/news_utils.py, adapted for NFL
// team-site/blog coverage instead of a cycling lifestyle magazine.
const CLICKBAIT_PATTERNS = [
  /\bmock draft\b/i, /\bpower rankings?\b/i, /\bfantasy\b/i, /\bquiz\b/i,
  /\bgiveaway\b/i, /\bmerchandise\b/i, /\bpodcast\b/i, /\bsurvey\b/i,
  /\bwatch:\s/i, /\bnewsletter\b/i, /\bmailbag\b/i,
];

// Genuine matchup/preview/storyline language, as opposed to a transaction or general team-news
// item that happens to be Seahawks-related but isn't actually about the upcoming game.
const STORYLINE_PATTERNS = [
  /\bpreview\b/i, /\bhow to watch\b/i, /\bwhat to watch\b/i, /\bwhat we learned\b/i,
  /\bkeys? to (the )?game\b/i, /\bmatchup\b/i, /\bstoryline/i, /\bthings to watch\b/i,
  /\bbubble\b/i, /\bdepth chart\b/i, /\binjury\b/i, /\bstarting lineup\b/i, /\bpractice report\b/i,
];

function isClickbait(item) {
  const text = `${item.title} ${item.description ?? ""}`;
  return CLICKBAIT_PATTERNS.some((p) => p.test(text));
}

function scoreItem(item, opponentTerms) {
  if (isClickbait(item)) return -10;
  const text = `${item.title} ${item.description ?? ""}`;
  const lower = text.toLowerCase();
  let score = STORYLINE_PATTERNS.filter((p) => p.test(text)).length * 2;
  score += opponentTerms.filter((t) => t && lower.includes(t.toLowerCase())).length * 5;
  return score;
}

// Returns up to `limit` items relevant to the upcoming matchup, highest score first (ties keep
// fetch-news.mjs's own newest-first order, since Array#sort is stable). Items scoring 0 or below
// are dropped entirely, not just deprioritized -- a matchup blurb should stay unwritten (see
// narrate.mjs) rather than force in a headline with no real connection to this specific game.
export function selectRelevant(items, opponent, limit = 5) {
  const opponentTerms = [opponent?.name, opponent?.abbr].filter(Boolean);
  return (items ?? [])
    .map((item) => ({ item, score: scoreItem(item, opponentTerms) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ item }) => item);
}
