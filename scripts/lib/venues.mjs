// Hand-maintained, not fetched from any API -- same pattern as the old data/franchise.json.
// ESPN's venue object has no lat/long and no indoor/outdoor flag, so this fills both. Keyed by
// team abbreviation (matches nextGame.opponent.abbr / ESPN's own abbreviations) rather than venue
// name, since that's what the fetch script already has on hand.
//
// `indoor: true` covers both permanent fixed domes AND retractable-roof stadiums -- deliberately
// simplified. A retractable roof CAN be open, but there's no live roof-status data source, and in
// practice most retractable-roof games are played roof-closed or climate-controlled; showing a
// weather forecast for Lucas Oil Stadium would be misleading far more often than it'd be useful.
// Only genuinely open-air stadiums get a weather forecast.
export const VENUES = {
  ARI: { lat: 33.5276, lon: -112.2626, indoor: true },  // State Farm Stadium (retractable)
  ATL: { lat: 33.7554, lon: -84.4008, indoor: true },   // Mercedes-Benz Stadium (retractable)
  BAL: { lat: 39.2780, lon: -76.6227, indoor: false },  // M&T Bank Stadium
  BUF: { lat: 42.7738, lon: -78.7870, indoor: false },  // Highmark Stadium
  CAR: { lat: 35.2258, lon: -80.8528, indoor: false },  // Bank of America Stadium
  CHI: { lat: 41.8623, lon: -87.6167, indoor: false },  // Soldier Field
  CIN: { lat: 39.0954, lon: -84.5160, indoor: false },  // Paycor Stadium
  CLE: { lat: 41.5061, lon: -81.6995, indoor: false },  // Huntington Bank Field
  DAL: { lat: 32.7473, lon: -97.0945, indoor: true },   // AT&T Stadium (retractable)
  DEN: { lat: 39.7439, lon: -105.0201, indoor: false }, // Empower Field at Mile High
  DET: { lat: 42.3400, lon: -83.0456, indoor: true },   // Ford Field (fixed dome)
  GB:  { lat: 44.5013, lon: -88.0622, indoor: false },  // Lambeau Field
  HOU: { lat: 29.6847, lon: -95.4107, indoor: true },   // NRG Stadium (retractable)
  IND: { lat: 39.7601, lon: -86.1639, indoor: true },   // Lucas Oil Stadium (retractable)
  JAX: { lat: 30.3239, lon: -81.6373, indoor: false },  // EverBank Stadium
  KC:  { lat: 39.0489, lon: -94.4839, indoor: false },  // Arrowhead Stadium
  LV:  { lat: 36.0909, lon: -115.1833, indoor: true },  // Allegiant Stadium (fixed dome)
  LAC: { lat: 33.9535, lon: -118.3392, indoor: true },  // SoFi Stadium (fixed roof)
  LAR: { lat: 33.9535, lon: -118.3392, indoor: true },  // SoFi Stadium (fixed roof)
  MIA: { lat: 25.9580, lon: -80.2389, indoor: false },  // Hard Rock Stadium (open-air, canopy only)
  MIN: { lat: 44.9737, lon: -93.2577, indoor: true },   // U.S. Bank Stadium (fixed roof)
  NE:  { lat: 42.0909, lon: -71.2643, indoor: false },  // Gillette Stadium
  NO:  { lat: 29.9511, lon: -90.0812, indoor: true },   // Caesars Superdome (fixed dome)
  NYG: { lat: 40.8135, lon: -74.0745, indoor: false },  // MetLife Stadium
  NYJ: { lat: 40.8135, lon: -74.0745, indoor: false },  // MetLife Stadium
  PHI: { lat: 39.9008, lon: -75.1675, indoor: false },  // Lincoln Financial Field
  PIT: { lat: 40.4468, lon: -80.0158, indoor: false },  // Acrisure Stadium
  SEA: { lat: 47.5952, lon: -122.3316, indoor: false }, // Lumen Field
  SF:  { lat: 37.4032, lon: -121.9698, indoor: false }, // Levi's Stadium
  TB:  { lat: 27.9759, lon: -82.5033, indoor: false },  // Raymond James Stadium
  TEN: { lat: 36.1665, lon: -86.7713, indoor: false },  // Nissan Stadium
  WSH: { lat: 38.9078, lon: -76.8645, indoor: false },  // Northwest Stadium
};
