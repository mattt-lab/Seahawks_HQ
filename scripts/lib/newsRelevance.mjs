// Scores fetch-news.mjs's items for relevance before narrate.mjs hands the best few to Claude for
// a news-grounded blurb -- either the pregame "matchup buzz" blurb or the postgame recap. Adapted
// from the same pattern the Tour de France and F1 dashboards use (scripts/news_utils.py's
// score_article/select_for_stage in the tour-de-france repo) to keep off-topic and unimportant
// content out of an LLM summary: a hard clickbait veto, then additive scoring for opponent
// mentions and real preview/recap language. Simpler than TdF's version on purpose -- TdF's feed
// covers the entire sport and needs to disambiguate "this stage" from "a different stage of the
// same race"; Seahawks HQ's two feeds are already Seahawks-only, so the only real question is "is
// this about THIS specific game (upcoming or just-played), or just general team news" (a contract
// extension, a waiver claim) that doesn't belong in a matchup-specific blurb.

// Content categories a Seahawks-focused feed can still mix in that add nothing to a matchup
// preview or recap -- mirrors CLICKBAIT_PATTERNS in tour-de-france/scripts/news_utils.py, adapted
// for NFL team-site/blog coverage instead of a cycling lifestyle magazine.
const CLICKBAIT_PATTERNS = [
  /\bmock draft\b/i, /\bpower rankings?\b/i, /\bfantasy\b/i, /\bquiz\b/i,
  /\bgiveaway\b/i, /\bmerchandise\b/i, /\bpodcast\b/i, /\bsurvey\b/i,
  /\bwatch:\s/i, /\bnewsletter\b/i, /\bmailbag\b/i,
];

// Genuine matchup/preview/storyline language, as opposed to a transaction or general team-news
// item that happens to be Seahawks-related but isn't actually about the upcoming game.
const PREVIEW_PATTERNS = [
  /\bpreview\b/i, /\bhow to watch\b/i, /\bwhat to watch\b/i, /\bwhat we learned\b/i,
  /\bkeys? to (the )?game\b/i, /\bmatchup\b/i, /\bstoryline/i, /\bthings to watch\b/i,
  /\bbubble\b/i, /\bdepth chart\b/i, /\binjury\b/i, /\bstarting lineup\b/i, /\bpractice report\b/i,
];

// Genuine postgame recap/analysis language -- deliberately distinct from PREVIEW_PATTERNS above
// rather than one shared list, since "what we learned" (say) reads as a preview angle before
// kickoff and a recap angle after. The publishedAt >= kickoff filter in selectPostgameRelevant
// below is what actually keeps a preview article out of the recap set, though -- these patterns
// alone can't tell time.
const RECAP_PATTERNS = [
  /\brecap\b/i, /\btakeaways?\b/i, /\bgrades?\b/i, /\b3 things\b/i, /\bpostgame\b/i,
  /\bwhat we learned\b/i, /\bhow (the )?seahawks\b/i, /\bfinal score\b/i,
  /\b(beat|beats|defeat(ed)?|topple[ds]?|fall|falls|fell|lose[sd]?|lost) (the )?[a-z .]+\b/i,
];

function isClickbait(item) {
  const text = `${item.title} ${item.description ?? ""}`;
  return CLICKBAIT_PATTERNS.some((p) => p.test(text));
}

function scoreItem(item, opponentTerms, patterns) {
  if (isClickbait(item)) return -10;
  const text = `${item.title} ${item.description ?? ""}`;
  const lower = text.toLowerCase();
  let score = patterns.filter((p) => p.test(text)).length * 2;
  score += opponentTerms.filter((t) => t && lower.includes(t.toLowerCase())).length * 5;
  return score;
}

function rank(items, opponent, patterns, limit) {
  const opponentTerms = [opponent?.name, opponent?.abbr].filter(Boolean);
  return (items ?? [])
    .map((item) => ({ item, score: scoreItem(item, opponentTerms, patterns) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ item }) => item);
}

// Returns up to `limit` items relevant to the UPCOMING matchup, highest score first (ties keep
// fetch-news.mjs's own newest-first order, since Array#sort is stable). Items scoring 0 or below
// are dropped entirely, not just deprioritized -- a matchup blurb should stay unwritten (see
// narrate.mjs) rather than force in a headline with no real connection to this specific game.
export function selectRelevant(items, opponent, limit = 5) {
  return rank(items, opponent, PREVIEW_PATTERNS, limit);
}

// Same scoring discipline, for the game that JUST HAPPENED instead of the one coming up. Also
// requires publishedAt >= kickoff -- without that, a preview article published earlier in the
// week can score well on opponent mentions alone and get mistaken for recap coverage. Not
// spiked live against a real recap article yet (see narrate.mjs's own caveat on this) -- the
// pattern list is a reasonable first pass, not confirmed against real Field Gulls/Seahawks.com
// recap headlines.
export function selectPostgameRelevant(items, opponent, kickoffIso, limit = 5) {
  const kickoffMs = new Date(kickoffIso).getTime();
  const afterKickoff = (items ?? []).filter((item) => new Date(item.publishedAt).getTime() >= kickoffMs);
  return rank(afterKickoff, opponent, RECAP_PATTERNS, limit);
}
