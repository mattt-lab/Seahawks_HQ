import { Link } from 'react-router-dom';
import { NEXT_GAME, RECORD, STANDINGS, NEWS, formatRecord, seasonTypeLabel, SEASON_TYPE, WEEK } from '../data/current.js';
import WeatherIcon from '../components/WeatherIcon.jsx';
import { useLiveGameScore } from '../hooks/useLiveGameScore.js';

function formatKickoff(iso) {
  try {
    return new Date(iso).toLocaleString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
    });
  } catch {
    return iso;
  }
}

function WinProbabilityMeter({ winProbability, opponentAbbr }) {
  if (winProbability == null) return null;
  return (
    <div style={{ margin: '10px 0' }}>
      <div className="tabnum" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
        <span>SEA {winProbability}%</span>
        <span className="muted">{opponentAbbr} {Math.round((100 - winProbability) * 10) / 10}%</span>
      </div>
      <div style={{ height: 8, borderRadius: 999, background: 'var(--panel-2)', overflow: 'hidden', display: 'flex' }}>
        <div style={{ width: `${winProbability}%`, background: 'var(--accent)' }} />
        <div style={{ width: `${100 - winProbability}%`, background: 'var(--muted)' }} />
      </div>
    </div>
  );
}

function StatusPill({ live }) {
  if (!live) return null;
  if (live.status === 'final') return <span className="pill final">FINAL</span>;
  if (live.status === 'in_progress') return <span className="pill live">LIVE</span>;
  return <span className="pill">SCHEDULED</span>;
}

// The one thing a fan glances at the page for once a game is underway or over -- boxed and
// noticeably larger than everything else on the card, so it reads before anything else does.
// Tinted green while live (usually catching the reader's eye mid-scroll), neutral once final
// (the news is settled, no need for the same urgency). Colors come from existing theme tokens
// via color-mix() rather than new hardcoded hex, so both stay correct in dark mode automatically.
function ScoreBanner({ isFinal, isLive, seaScore, oppScore, opponentAbbr, live }) {
  const hasScore = seaScore != null && oppScore != null;
  const tint = isLive ? 'color-mix(in srgb, var(--accent) 14%, var(--panel))' : 'var(--panel-2)';
  const borderTint = isLive ? 'color-mix(in srgb, var(--accent) 35%, var(--border))' : 'var(--border)';
  return (
    <div style={{ background: tint, border: `1px solid ${borderTint}`, borderRadius: 10, padding: '14px 16px', marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: hasScore ? 6 : 0 }}>
        {isFinal ? <span className="pill final">FINAL</span> : <span className="pill live">LIVE</span>}
        {isLive && (live.period || live.clock) && (
          <span className="muted tabnum" style={{ fontSize: 13, fontWeight: 600 }}>
            {live.period ? `Q${live.period}` : ''}{live.clock ? ` ${live.clock}` : ''}
          </span>
        )}
      </div>
      {hasScore && (
        <div className="tabnum" style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-0.01em' }}>
          SEA {seaScore} <span className="muted" style={{ fontWeight: 600, fontSize: 22 }}>&ndash;</span> {opponentAbbr} {oppScore}
        </div>
      )}
      {isLive && <WinProbabilityMeter winProbability={live.winProbability} opponentAbbr={opponentAbbr} />}
    </div>
  );
}

function formatNewsDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Independent beat/analysis coverage (Field Gulls) mixed with the team's own official feed --
// deliberately not just repeating what ESPN or the Seahawks app already surface. See
// scripts/fetch-news.mjs for the source list and why those two specifically.
function NewsRoundup() {
  const items = NEWS?.items ?? [];
  if (items.length === 0) return null;
  return (
    <div className="card">
      <h2>In the News</h2>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.map((item) => (
          <li key={item.link} className="news-item">
            <a href={item.link} target="_blank" rel="noopener noreferrer">{item.title}</a>
            <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
              {item.source}{item.publishedAt && <> · {formatNewsDate(item.publishedAt)}</>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function InjuryList({ title, injuries }) {
  if (!injuries || injuries.length === 0) {
    return <div><h3>{title}</h3><p className="muted">No injuries reported.</p></div>;
  }
  return (
    <div>
      <h3>{title}</h3>
      <div className="table-wrap">
        <table>
          <tbody>
            {injuries.map((i) => (
              <tr key={i.athleteId ?? i.name}>
                <td>{i.name}</td>
                <td className="muted">{i.position}</td>
                <td>{i.status}</td>
                <td className="muted">{i.bodyPart}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function Home() {
  // Called unconditionally, before the early return below, per the rules of hooks -- NEXT_GAME
  // is a frozen build-time constant, so this is stable across renders either way.
  const live = useLiveGameScore(NEXT_GAME);

  if (!NEXT_GAME) {
    return <div className="card"><p className="muted">No upcoming game found in the current data.</p></div>;
  }

  const { opponent, date, homeAway, venue, weather, broadcast, odds, whatToWatch, seriesHistory, recap, newsBlurb } = NEXT_GAME;
  const isFinal = live?.status === 'final';
  const isLive = live?.status === 'in_progress';
  const seaScore = homeAway === 'home' ? live?.homeScore : live?.awayScore;
  const oppScore = homeAway === 'home' ? live?.awayScore : live?.homeScore;

  return (
    <>
      <div className="card watermark-12">
        <h2>
          {seasonTypeLabel(SEASON_TYPE)}{WEEK ? ` · Week ${WEEK}` : ''}
          {!isFinal && !isLive && <> <StatusPill live={live} /></>}
        </h2>
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>
          {homeAway === 'home' ? `Seahawks vs. ${opponent?.name}` : `Seahawks @ ${opponent?.name}`}
        </div>
        <div className="muted" style={{ marginBottom: 2 }}>
          {formatKickoff(date)}
          {broadcast && broadcast.length > 0 && <> · {broadcast.join(', ')}</>}
        </div>
        <div className="muted" style={{ marginBottom: 12 }}>
          {venue && <>{venue.name}{venue.city ? `, ${venue.city}` : ''}</>}
          {weather && (
            <> · <WeatherIcon condition={weather.condition} />{weather.tempF}&deg;F, {weather.condition?.toLowerCase()}
              {weather.precipPercent > 20 ? `, ${weather.precipPercent}% precip` : ''}
              , wind {weather.windMph} mph</>
          )}
          {venue?.indoor && <> · indoors</>}
        </div>

        {(isFinal || isLive) ? (
          <ScoreBanner
            isFinal={isFinal} isLive={isLive} seaScore={seaScore} oppScore={oppScore}
            opponentAbbr={opponent?.abbr} live={live}
          />
        ) : (
          <>
            {odds && (
              <div className="muted" style={{ marginBottom: 8 }}>
                {odds.details}{odds.overUnder ? ` · O/U ${odds.overUnder}` : ''}
                {odds.provider ? ` (${odds.provider})` : ''}
              </div>
            )}
            {newsBlurb?.text && (
              <p style={{ marginTop: 4, marginBottom: 8, fontSize: 15, lineHeight: 1.5, borderLeft: '3px solid var(--accent)', paddingLeft: 12 }}>
                {newsBlurb.text}
              </p>
            )}
          </>
        )}

        {recap?.text && (
          <p style={{ marginTop: 8 }}>{recap.text}</p>
        )}

        {!isFinal && whatToWatch && whatToWatch.length > 0 && (
          <>
            <h3 style={{ marginTop: 16 }}>What to Watch</h3>
            <ul className="whattowatch">
              {whatToWatch.map((w, i) => <li key={i}>{w.text}</li>)}
            </ul>
          </>
        )}

        {seriesHistory?.playedEarlierThisSeason && (
          <p style={{ marginTop: 12, fontSize: 14 }}>
            Already met this season: Week {seriesHistory.week}, Seahawks {' '}
            {seriesHistory.result === 'W' ? 'won' : seriesHistory.result === 'T' ? 'tied' : 'lost'}{' '}
            {seriesHistory.seaScore}-{seriesHistory.oppScore}.
          </p>
        )}
      </div>

      <NewsRoundup />

      <div className="card">
        <h2>Injury Report — This Game</h2>
        <div className="injury-grid">
          <InjuryList title="Seahawks" injuries={NEXT_GAME.injuries?.sea} />
          <InjuryList title={opponent?.name ?? 'Opponent'} injuries={NEXT_GAME.injuries?.opponent} />
        </div>
      </div>

      <div className="card">
        <h2>Record &amp; Standings</h2>
        <p>
          <strong>{formatRecord(RECORD.overall)}</strong> overall
          {' · '}{formatRecord(RECORD.home)} home
          {' · '}{formatRecord(RECORD.road)} road
          {RECORD.overall.streak ? <> · streak {RECORD.overall.streak > 0 ? `W${RECORD.overall.streak}` : `L${Math.abs(RECORD.overall.streak)}`}</> : null}
        </p>
        <table>
          <thead>
            <tr><th>Team</th><th>W</th><th>L</th><th>T</th><th>PCT</th></tr>
          </thead>
          <tbody>
            {STANDINGS.entries.map((e) => (
              <tr key={e.teamId} style={e.abbr === 'SEA' ? { fontWeight: 700 } : undefined}>
                <td>{e.abbr}</td>
                <td className="tabnum">{e.wins}</td>
                <td className="tabnum">{e.losses}</td>
                <td className="tabnum">{e.ties}</td>
                <td className="tabnum">{e.winPercent?.toFixed(3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
          {STANDINGS.division} · <Link to="/schedule">Full schedule →</Link>
        </p>
      </div>
    </>
  );
}
