// Player Database V2 — clubs. `nationId` is the club's country (usually its
// league's nation). `aliases` lets the legacy-legend migration map old V1 club
// name strings (e.g. "Milan", "Bayern", "Man United") onto stable club IDs.
// Factual reference data.
const C = (id, name, leagueId, nationId, aliases = []) => ({ id, name, leagueId, nationId, aliases, active: true })

export const CLUBS = [
  // --- Premier League ---
  C('man_city', 'Manchester City', 'eng_pl', 'england', ['Man City']),
  C('liverpool', 'Liverpool', 'eng_pl', 'england', ['Liverpool']),
  C('arsenal', 'Arsenal', 'eng_pl', 'england', ['Arsenal']),
  C('chelsea', 'Chelsea', 'eng_pl', 'england', ['Chelsea']),
  C('man_united', 'Manchester United', 'eng_pl', 'england', ['Man United', 'Man Utd']),
  C('tottenham', 'Tottenham Hotspur', 'eng_pl', 'england', ['Tottenham', 'Spurs']),
  C('newcastle', 'Newcastle United', 'eng_pl', 'england', ['Newcastle']),
  C('aston_villa', 'Aston Villa', 'eng_pl', 'england'),
  C('west_ham', 'West Ham United', 'eng_pl', 'england', ['West Ham']),
  C('brighton', 'Brighton & Hove Albion', 'eng_pl', 'england', ['Brighton']),
  C('nottm_forest', 'Nottingham Forest', 'eng_pl', 'england', ['Nottingham Forest']),
  C('crystal_palace', 'Crystal Palace', 'eng_pl', 'england'),
  C('everton', 'Everton', 'eng_pl', 'england'),
  C('brentford', 'Brentford', 'eng_pl', 'england'),
  C('bournemouth', 'AFC Bournemouth', 'eng_pl', 'england', ['Bournemouth']),
  C('fulham', 'Fulham', 'eng_pl', 'england'),
  C('wolves', 'Wolverhampton', 'eng_pl', 'england', ['Wolves']),
  C('leeds', 'Leeds United', 'eng_pl', 'england', ['Leeds']),
  // --- La Liga ---
  C('real_madrid', 'Real Madrid', 'esp_laliga', 'spain', ['Real Madrid']),
  C('barcelona', 'Barcelona', 'esp_laliga', 'spain', ['Barcelona', 'FC Barcelona']),
  C('atletico', 'Atlético Madrid', 'esp_laliga', 'spain', ['Atlético Madrid', 'Atletico Madrid']),
  C('athletic', 'Athletic Bilbao', 'esp_laliga', 'spain'),
  C('real_sociedad', 'Real Sociedad', 'esp_laliga', 'spain'),
  C('villarreal', 'Villarreal', 'esp_laliga', 'spain'),
  C('betis', 'Real Betis', 'esp_laliga', 'spain'),
  C('sevilla', 'Sevilla', 'esp_laliga', 'spain'),
  C('valencia', 'Valencia', 'esp_laliga', 'spain'),
  C('girona', 'Girona', 'esp_laliga', 'spain'),
  // --- Bundesliga ---
  C('bayern', 'Bayern Munich', 'ger_bundesliga', 'germany', ['Bayern', 'Bayern München']),
  C('dortmund', 'Borussia Dortmund', 'ger_bundesliga', 'germany', ['Dortmund']),
  C('leipzig', 'RB Leipzig', 'ger_bundesliga', 'germany', ['Leipzig']),
  C('leverkusen', 'Bayer Leverkusen', 'ger_bundesliga', 'germany', ['Leverkusen']),
  C('frankfurt', 'Eintracht Frankfurt', 'ger_bundesliga', 'germany', ['Frankfurt']),
  C('stuttgart', 'VfB Stuttgart', 'ger_bundesliga', 'germany', ['Stuttgart']),
  C('wolfsburg', 'VfL Wolfsburg', 'ger_bundesliga', 'germany'),
  C('gladbach', 'Borussia Mönchengladbach', 'ger_bundesliga', 'germany'),
  // --- Serie A ---
  C('inter', 'Inter Milan', 'ita_seriea', 'italy', ['Inter']),
  C('milan', 'AC Milan', 'ita_seriea', 'italy', ['Milan', 'AC Milan']),
  C('juventus', 'Juventus', 'ita_seriea', 'italy', ['Juventus', 'Juve']),
  C('napoli', 'Napoli', 'ita_seriea', 'italy', ['Napoli']),
  C('roma', 'AS Roma', 'ita_seriea', 'italy', ['Roma']),
  C('lazio', 'Lazio', 'ita_seriea', 'italy'),
  C('atalanta', 'Atalanta', 'ita_seriea', 'italy'),
  C('fiorentina', 'Fiorentina', 'ita_seriea', 'italy'),
  C('bologna', 'Bologna', 'ita_seriea', 'italy'),
  // --- Ligue 1 ---
  C('psg', 'Paris Saint-Germain', 'fra_ligue1', 'france', ['PSG']),
  C('marseille', 'Olympique Marseille', 'fra_ligue1', 'france', ['Marseille']),
  C('monaco', 'AS Monaco', 'fra_ligue1', 'france', ['Monaco']),
  C('lyon', 'Olympique Lyonnais', 'fra_ligue1', 'france', ['Lyon']),
  C('lille', 'Lille', 'fra_ligue1', 'france'),
  C('nice', 'OGC Nice', 'fra_ligue1', 'france', ['Nice']),
  // --- Primeira Liga ---
  C('benfica', 'Benfica', 'por_primeira', 'portugal', ['Benfica']),
  C('porto', 'FC Porto', 'por_primeira', 'portugal', ['Porto']),
  C('sporting', 'Sporting CP', 'por_primeira', 'portugal', ['Sporting']),
  C('braga', 'SC Braga', 'por_primeira', 'portugal'),
  // --- Eredivisie ---
  C('ajax', 'Ajax', 'ned_eredivisie', 'netherlands'),
  C('psv', 'PSV Eindhoven', 'ned_eredivisie', 'netherlands', ['PSV']),
  C('feyenoord', 'Feyenoord', 'ned_eredivisie', 'netherlands'),
  // --- Süper Lig ---
  C('galatasaray', 'Galatasaray', 'tur_superlig', 'turkey'),
  C('fenerbahce', 'Fenerbahçe', 'tur_superlig', 'turkey'),
  // --- Scottish / Belgian / Greek ---
  C('celtic', 'Celtic', 'sco_prem', 'scotland'),
  C('rangers', 'Rangers', 'sco_prem', 'scotland'),
  C('club_brugge', 'Club Brugge', 'bel_pro', 'belgium'),
  C('olympiacos', 'Olympiacos', 'gre_superleague', 'greece'),
  // --- Saudi Pro League ---
  C('al_nassr', 'Al Nassr', 'ksa_pro', 'saudi_arabia'),
  C('al_hilal', 'Al Hilal', 'ksa_pro', 'saudi_arabia'),
  C('al_ittihad', 'Al Ittihad', 'ksa_pro', 'saudi_arabia'),
  C('al_ahli', 'Al Ahli', 'ksa_pro', 'saudi_arabia'),
  // --- MLS ---
  C('inter_miami', 'Inter Miami', 'usa_mls', 'usa'),
  C('la_galaxy', 'LA Galaxy', 'usa_mls', 'usa'),
  C('lafc', 'Los Angeles FC', 'usa_mls', 'usa'),
  C('chicago_fire', 'Chicago Fire', 'usa_mls', 'usa'),
  // --- Brasileirão / Argentina ---
  C('flamengo', 'Flamengo', 'bra_seriea', 'brazil'),
  C('palmeiras', 'Palmeiras', 'bra_seriea', 'brazil'),
  C('botafogo', 'Botafogo', 'bra_seriea', 'brazil'),
  C('river_plate', 'River Plate', 'arg_primera', 'argentina'),
  C('boca', 'Boca Juniors', 'arg_primera', 'argentina'),
  // --- Premier League depth ---
  C('sunderland', 'Sunderland', 'eng_pl', 'england'),
  C('burnley', 'Burnley', 'eng_pl', 'england'),
  // --- La Liga depth ---
  C('celta', 'Celta Vigo', 'esp_laliga', 'spain'),
  C('osasuna', 'Osasuna', 'esp_laliga', 'spain'),
  C('rayo', 'Rayo Vallecano', 'esp_laliga', 'spain'),
  C('mallorca', 'RCD Mallorca', 'esp_laliga', 'spain'),
  C('getafe', 'Getafe', 'esp_laliga', 'spain'),
  C('espanyol', 'Espanyol', 'esp_laliga', 'spain'),
  // --- Serie A depth ---
  C('torino', 'Torino', 'ita_seriea', 'italy'),
  C('genoa', 'Genoa', 'ita_seriea', 'italy'),
  C('udinese', 'Udinese', 'ita_seriea', 'italy'),
  C('como', 'Como', 'ita_seriea', 'italy'),
  C('cagliari', 'Cagliari', 'ita_seriea', 'italy'),
  C('parma', 'Parma', 'ita_seriea', 'italy'),
  // --- Bundesliga depth ---
  C('werder', 'Werder Bremen', 'ger_bundesliga', 'germany'),
  C('freiburg', 'SC Freiburg', 'ger_bundesliga', 'germany'),
  C('mainz', 'Mainz 05', 'ger_bundesliga', 'germany'),
  C('hoffenheim', 'TSG Hoffenheim', 'ger_bundesliga', 'germany'),
  C('union_berlin', 'Union Berlin', 'ger_bundesliga', 'germany'),
  // --- Ligue 1 depth ---
  C('rennes', 'Stade Rennais', 'fra_ligue1', 'france', ['Rennes']),
  C('lens', 'RC Lens', 'fra_ligue1', 'france'),
  C('strasbourg', 'RC Strasbourg', 'fra_ligue1', 'france'),
  C('toulouse', 'Toulouse', 'fra_ligue1', 'france'),
  C('brest', 'Stade Brestois', 'fra_ligue1', 'france'),
  // --- Netherlands / Turkey / Portugal depth ---
  C('az', 'AZ Alkmaar', 'ned_eredivisie', 'netherlands'),
  C('besiktas', 'Beşiktaş', 'tur_superlig', 'turkey'),
  C('trabzonspor', 'Trabzonspor', 'tur_superlig', 'turkey'),
  // --- Saudi Pro League depth ---
  C('al_qadsiah', 'Al Qadsiah', 'ksa_pro', 'saudi_arabia'),
  C('al_ettifaq', 'Al Ettifaq', 'ksa_pro', 'saudi_arabia'),
  // --- MLS depth ---
  C('nycfc', 'New York City FC', 'usa_mls', 'usa'),
  C('atlanta', 'Atlanta United', 'usa_mls', 'usa'),
  // --- Brazil / Argentina depth ---
  C('fluminense', 'Fluminense', 'bra_seriea', 'brazil'),
  C('corinthians', 'Corinthians', 'bra_seriea', 'brazil'),
  C('atletico_mg', 'Atlético Mineiro', 'bra_seriea', 'brazil'),
  C('racing', 'Racing Club', 'arg_primera', 'argentina'),
  // --- Legacy-only clubs referenced by legends ---
  C('santos', 'Santos', 'bra_seriea', 'brazil', ['Santos']),
  // --- Free agent sentinel: keeps clubId always resolvable for unattached players ---
  { id: 'free_agent', name: 'Free Agent', leagueId: 'free', nationId: null, aliases: [], active: true },
]
