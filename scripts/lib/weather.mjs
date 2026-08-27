// Open-Meteo (open-meteo.com) -- free, no API key, confirmed live 2026-08-27. ESPN's summary
// endpoint has no weather field and no venue lat/long, hence lib/venues.mjs's hand-maintained
// coordinates.
//
// Real bug caught while spiking this: Open-Meteo's hourly.time values are LOCAL wall-clock time
// at the venue (per timezone=auto), not UTC. Naively appending "Z" and comparing against a UTC
// kickoff timestamp silently matched the wrong hour by exactly the venue's UTC offset (5 hours,
// for Kansas City) -- confirmed live: it picked local midnight instead of the actual 7pm local
// kickoff, and returned a materially different forecast (76.5F vs the correct 87.8F). Fixed by
// converting through `utc_offset_seconds` before comparing.
const WEATHER_CODE_LABELS = {
  0: "Clear", 1: "Mostly clear", 2: "Partly cloudy", 3: "Overcast",
  45: "Fog", 48: "Fog",
  51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle",
  61: "Light rain", 63: "Rain", 65: "Heavy rain",
  71: "Light snow", 73: "Snow", 75: "Heavy snow",
  80: "Rain showers", 81: "Rain showers", 82: "Heavy rain showers",
  95: "Thunderstorms", 96: "Thunderstorms", 99: "Thunderstorms",
};

export async function getKickoffWeather({ lat, lon, kickoffIso }) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,precipitation_probability,wind_speed_10m,weather_code&temperature_unit=fahrenheit&wind_speed_unit=mph&forecast_days=16&timezone=auto`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo request failed: ${res.status}`);
  const body = await res.json();

  const kickoffMs = new Date(kickoffIso).getTime();
  const offsetMs = body.utc_offset_seconds * 1000;
  let bestIdx = -1;
  let bestDiffMs = Infinity;
  body.hourly.time.forEach((t, i) => {
    const trueUtcMs = Date.parse(`${t}Z`) - offsetMs;
    const diff = Math.abs(trueUtcMs - kickoffMs);
    if (diff < bestDiffMs) { bestDiffMs = diff; bestIdx = i; }
  });

  // Open-Meteo's free forecast only covers ~16 days out -- a game further out than that has no
  // forecast yet, same "not posted yet" honesty as odds. 3h tolerance catches a genuinely
  // out-of-range match (the closest hour in the whole 16-day window still being way off).
  if (bestIdx === -1 || bestDiffMs > 3 * 60 * 60_000) return null;

  return {
    tempF: Math.round(body.hourly.temperature_2m[bestIdx]),
    precipPercent: body.hourly.precipitation_probability[bestIdx],
    windMph: Math.round(body.hourly.wind_speed_10m[bestIdx]),
    condition: WEATHER_CODE_LABELS[body.hourly.weather_code[bestIdx]] ?? null,
    forecastFor: body.hourly.time[bestIdx],
  };
}
