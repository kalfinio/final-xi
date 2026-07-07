// Player Database V2 — leagues. `level` = domestic tier (1 = top flight).
// Factual reference data. Clubs reference these; players derive leagueId
// through their club.
export const LEAGUES = [
  { id: 'eng_pl', name: 'Premier League', nationId: 'england', level: 1, active: true },
  { id: 'esp_laliga', name: 'La Liga', nationId: 'spain', level: 1, active: true },
  { id: 'ger_bundesliga', name: 'Bundesliga', nationId: 'germany', level: 1, active: true },
  { id: 'ita_seriea', name: 'Serie A', nationId: 'italy', level: 1, active: true },
  { id: 'fra_ligue1', name: 'Ligue 1', nationId: 'france', level: 1, active: true },
  { id: 'por_primeira', name: 'Primeira Liga', nationId: 'portugal', level: 1, active: true },
  { id: 'ned_eredivisie', name: 'Eredivisie', nationId: 'netherlands', level: 1, active: true },
  { id: 'tur_superlig', name: 'Süper Lig', nationId: 'turkey', level: 1, active: true },
  { id: 'sco_prem', name: 'Scottish Premiership', nationId: 'scotland', level: 1, active: true },
  { id: 'bel_pro', name: 'Belgian Pro League', nationId: 'belgium', level: 1, active: true },
  { id: 'ksa_pro', name: 'Saudi Pro League', nationId: 'saudi_arabia', level: 1, active: true },
  { id: 'usa_mls', name: 'Major League Soccer', nationId: 'usa', level: 1, active: true },
  { id: 'bra_seriea', name: 'Brasileirão', nationId: 'brazil', level: 1, active: true },
  { id: 'arg_primera', name: 'Primera División', nationId: 'argentina', level: 1, active: true },
  { id: 'gre_superleague', name: 'Super League Greece', nationId: 'greece', level: 1, active: true },
  // A catch-all "league" for free agents so leagueId is always resolvable.
  { id: 'free', name: 'Free Agent', nationId: null, level: 0, active: true },
]
