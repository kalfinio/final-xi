// ---------------------------------------------------------------------------
// Position type mapping
// ---------------------------------------------------------------------------
const POS_TYPE = {
  GK: 'GK',
  RB: 'DEF', LB: 'DEF', CB: 'DEF', RWB: 'DEF', LWB: 'DEF',
  CDM: 'MID', CM: 'MID', CAM: 'MID', RM: 'MID', LM: 'MID',
  RW: 'ATT', LW: 'ATT', ST: 'ATT',
}

export const ALL_SLOT_LABELS = Object.keys(POS_TYPE)

export function posTypeOf(primaryPos) {
  return POS_TYPE[primaryPos]
}

// ---------------------------------------------------------------------------
// Seeded randomness
// ---------------------------------------------------------------------------
export function makeRng(seed) {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function hashString(s) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function combineSeed(base, ...nums) {
  let h = base >>> 0
  for (const n of nums) {
    h ^= n | 0
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function dateSeed(d = new Date()) {
  return hashString(todayKey(d))
}

export function todayKey(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Deterministic seed for a daily run's simulation. Includes the full finalized
// arrangement so the same XI always produces the same match reports.
export function buildSimSeed({ dateKey, formation, ids, slots, difficulty, pool, rerollsUsed }) {
  return hashString(
    [dateKey, formation, difficulty, pool, rerollsUsed, slots.join(','), ids.join(',')].join('|'),
  )
}

// ---------------------------------------------------------------------------
// Formations
// ---------------------------------------------------------------------------
export const FORMATIONS = {
  '4-3-3': {
    name: '4-3-3',
    slots: ['GK', 'RB', 'CB', 'CB', 'LB', 'CM', 'CM', 'CM', 'RW', 'ST', 'LW'],
  },
  '4-4-2': {
    name: '4-4-2',
    slots: ['GK', 'RB', 'CB', 'CB', 'LB', 'RM', 'CM', 'CM', 'LM', 'ST', 'ST'],
  },
  '4-2-3-1': {
    name: '4-2-3-1',
    slots: ['GK', 'RB', 'CB', 'CB', 'LB', 'CDM', 'CDM', 'RW', 'CAM', 'LW', 'ST'],
  },
  '3-5-2': {
    name: '3-5-2',
    slots: ['GK', 'CB', 'CB', 'CB', 'RWB', 'CM', 'CM', 'LWB', 'CDM', 'ST', 'ST'],
  },
  '5-3-2': {
    name: '5-3-2',
    slots: ['GK', 'RB', 'CB', 'CB', 'CB', 'LB', 'CM', 'CM', 'CDM', 'ST', 'ST'],
  },
}

export const SLOT_NAMES = {
  GK: 'Goalkeeper',
  RB: 'Right Back', LB: 'Left Back', CB: 'Centre Back',
  RWB: 'Right Wing Back', LWB: 'Left Wing Back',
  CDM: 'Defensive Midfielder', CM: 'Central Midfielder', CAM: 'Attacking Midfielder',
  RM: 'Right Midfielder', LM: 'Left Midfielder',
  RW: 'Right Winger', LW: 'Left Winger', ST: 'Striker',
}

// ---------------------------------------------------------------------------
// Final XI roles (Phase 2 — exact approved role names)
// ---------------------------------------------------------------------------
// These are the ONLY valid public role names. ROLE_GUIDE is the single source
// of truth; both `role` and `secondaryRole` must be one of these, and
// validation fails otherwise.
export const ROLE_GUIDE = [
  // Goalkeeper
  { role: 'Shot Stopper', group: 'Goalkeeper', line: 'Pure reflexes — commands the box and makes the saves that win ties.' },
  { role: 'Sweeper Keeper', group: 'Goalkeeper', line: 'A keeper who races off his line and starts attacks with the ball at his feet.' },
  { role: 'Big Match Keeper', group: 'Goalkeeper', line: 'The keeper you want on the biggest nights — calm and decisive under pressure.' },
  // Defence
  { role: 'Defensive Leader', group: 'Defence', line: 'Marshals the back line — wins headers, blocks shots and organises everyone.' },
  { role: 'Ball-Playing Defender', group: 'Defence', line: 'A defender comfortable stepping out and building play from the back.' },
  { role: 'Attacking Fullback', group: 'Defence', line: 'A flying wide defender who overlaps and delivers from the byline.' },
  { role: 'Defensive Fullback', group: 'Defence', line: 'A disciplined wide defender who shuts down the flank first.' },
  // Midfield
  { role: 'Defensive Shield', group: 'Midfield', line: 'The screen in front of the defence — protects the back line and recycles the ball.' },
  { role: 'Ball Winner', group: 'Midfield', line: 'A relentless tackler who hunts the ball and breaks up play.' },
  { role: 'Tempo Controller', group: 'Midfield', line: 'Dictates the rhythm from deep with passing range and vision.' },
  { role: 'Box-to-Box Engine', group: 'Midfield', line: 'Covers every blade of grass — defends and arrives in the box.' },
  { role: 'Final Passer', group: 'Midfield', line: 'Threads the killer pass and unlocks defences from midfield.' },
  // Wide / Attacking Mid
  { role: 'Creative Magician', group: 'Wide & Attacking Mid', line: 'The flair player — beats defenders and conjures chances from nothing.' },
  { role: 'Inside Forward', group: 'Wide & Attacking Mid', line: 'Starts wide, cuts inside onto his stronger foot and shoots.' },
  { role: 'Touchline Winger', group: 'Wide & Attacking Mid', line: 'Hugs the touchline, beats his man and whips in the cross.' },
  { role: 'Direct Runner', group: 'Wide & Attacking Mid', line: 'Frightening pace — runs in behind and attacks the space.' },
  // Strikers
  { role: 'Complete Striker', group: 'Strikers', line: 'Does it all up top — holds the ball, links play and scores.' },
  { role: 'Box Finisher', group: 'Strikers', line: 'Lives in the box — the poacher who puts the chances away.' },
  { role: 'Link-Up Striker', group: 'Strikers', line: 'Drops in to link play and bring others into the attack.' },
  { role: 'Big Game Scorer', group: 'Strikers', line: 'Turns up on the biggest European nights — scores the goals that decide finals.' },
]

// Maps the old detailed tactical roles onto the approved Final XI roles (bulk
// default). Per-player exceptions live in ROLE_OVERRIDES.
const ROLE_MAP = {
  'Goalkeeper': 'Shot Stopper',
  'Sweeper Keeper': 'Sweeper Keeper',
  'Wing-Back': 'Attacking Fullback',
  'Complete Wing-Back': 'Attacking Fullback',
  'Inverted Wing-Back': 'Attacking Fullback',
  'Full-Back': 'Defensive Fullback',
  'Central Defender': 'Defensive Leader',
  'No-Nonsense Centre-Back': 'Defensive Leader',
  'Ball-Playing Defender': 'Ball-Playing Defender',
  'Libero': 'Ball-Playing Defender',
  'Anchor': 'Defensive Shield',
  'Defensive Midfielder': 'Defensive Shield',
  'Ball-Winning Midfielder': 'Ball Winner',
  'Regista': 'Tempo Controller',
  'Deep-Lying Playmaker': 'Tempo Controller',
  'Box-to-Box Midfielder': 'Box-to-Box Engine',
  'Mezzala': 'Box-to-Box Engine',
  'Advanced Playmaker': 'Final Passer',
  'Roaming Playmaker': 'Tempo Controller',
  'Trequartista': 'Creative Magician',
  'Shadow Striker': 'Link-Up Striker',
  'Inverted Winger': 'Inside Forward',
  'Winger': 'Touchline Winger',
  'Inside Forward': 'Inside Forward',
  'False Nine': 'Creative Magician',
  'Complete Forward': 'Complete Striker',
  'Advanced Forward': 'Box Finisher',
  'Target Forward': 'Link-Up Striker',
  'Poacher': 'Box Finisher',
  'Deep-Lying Forward': 'Link-Up Striker',
}

// Per-player role corrections (and secondary roles) keyed by id. Overrides the
// bulk ROLE_MAP. All values must be approved roles.
const ROLE_OVERRIDES = {
  // Big Match Keepers
  casillas: { role: 'Big Match Keeper' },
  buffon: { role: 'Big Match Keeper' },
  neuer: { role: 'Sweeper Keeper', secondaryRole: 'Big Match Keeper' },
  courtois: { role: 'Big Match Keeper' },
  // GOAT Tier
  messi: { role: 'Creative Magician', secondaryRole: 'Inside Forward' },
  ronaldo: { role: 'Inside Forward', secondaryRole: 'Big Game Scorer' },
  maradona: { role: 'Creative Magician', secondaryRole: 'Direct Runner' },
  pele: { role: 'Complete Striker', secondaryRole: 'Creative Magician' },
  // GOAT Candidates + corrected examples
  cruyff: { role: 'Creative Magician', secondaryRole: 'Link-Up Striker' },
  nazario: { role: 'Complete Striker', secondaryRole: 'Direct Runner' },
  zidane: { role: 'Creative Magician', secondaryRole: 'Big Game Scorer' },
  beckenbauer: { role: 'Ball-Playing Defender', secondaryRole: 'Defensive Leader' },
  // Midfield corrections
  pirlo: { role: 'Tempo Controller' },
  xavi: { role: 'Tempo Controller' },
  kroos: { role: 'Tempo Controller' },
  modric: { role: 'Tempo Controller', secondaryRole: 'Box-to-Box Engine' },
  makelele: { role: 'Defensive Shield' },
  busquets: { role: 'Defensive Shield' },
  casemiro: { role: 'Defensive Shield' },
  rodri: { role: 'Defensive Shield' },
  kante: { role: 'Ball Winner' },
  // Defence / attack corrections
  cafu: { role: 'Attacking Fullback' },
  lahm: { role: 'Defensive Fullback' },
  vanbasten: { role: 'Complete Striker' },
  ibra: { role: 'Complete Striker', secondaryRole: 'Box Finisher' },
}

// ---------------------------------------------------------------------------
// Player database — strict eligibility + approved Final XI roles
// ---------------------------------------------------------------------------
// `role` (and optional `secondaryRole`) are normalised to the approved set;
// `sourceRole` keeps the original descriptor for reference (not shown in the UI).
function P(id, name, primaryPos, country, club, eligibleSlots, tags, rarity, role, era = 'legend') {
  const override = ROLE_OVERRIDES[id] || {}
  const finalRole = override.role || ROLE_MAP[role] || role
  return {
    id, name, primaryPos, eligibleSlots, posType: posTypeOf(primaryPos),
    country, club, tags, rarity,
    role: finalRole, secondaryRole: override.secondaryRole || null, sourceRole: role, era,
  }
}

export const PLAYERS = [
  // ================= LEGENDS =================
  // --- GK ---
  P('casillas', 'Iker Casillas', 'GK', 'Spain', 'Real Madrid', ['GK'], ['real_madrid_dna', 'world_cup_winner', 'euro_legend'], 62, 'Goalkeeper'),
  P('buffon', 'Gianluigi Buffon', 'GK', 'Italy', 'Juventus', ['GK'], ['euro_legend', 'serial_winner'], 58, 'Goalkeeper'),
  P('schmeichel', 'Peter Schmeichel', 'GK', 'Denmark', 'Man United', ['GK'], ['euro_legend'], 31, 'Goalkeeper'),
  P('vandersar', 'Edwin van der Sar', 'GK', 'Netherlands', 'Man United', ['GK'], ['euro_legend'], 28, 'Sweeper Keeper'),
  P('kahn', 'Oliver Kahn', 'GK', 'Germany', 'Bayern', ['GK'], ['euro_legend'], 40, 'Goalkeeper'),
  P('valdes', 'Víctor Valdés', 'GK', 'Spain', 'Barcelona', ['GK'], ['barca_dna', 'world_cup_winner'], 22, 'Sweeper Keeper'),
  P('ricardo', 'Ricardo', 'GK', 'Portugal', 'Porto', ['GK'], ['euro_legend'], 12, 'Goalkeeper'),

  // --- DEF ---
  P('cafu', 'Cafu', 'RB', 'Brazil', 'Milan', ['RB', 'RWB'], ['euro_legend'], 44, 'Wing-Back'),
  P('danialves', 'Dani Alves', 'RB', 'Brazil', 'Barcelona', ['RB', 'RWB'], ['barca_dna', 'serial_winner'], 49, 'Complete Wing-Back'),
  P('lahm', 'Philipp Lahm', 'RB', 'Germany', 'Bayern', ['RB'], ['euro_legend', 'world_cup_winner'], 47, 'Full-Back'),
  P('zanetti', 'Javier Zanetti', 'RB', 'Argentina', 'Inter', ['RB', 'RWB'], ['euro_legend', 'serial_winner'], 33, 'Full-Back'),
  P('cannavaro', 'Fabio Cannavaro', 'CB', 'Italy', 'Real Madrid', ['CB'], ['real_madrid_dna', 'world_cup_winner'], 55, 'Central Defender'),
  P('robertocarlos', 'Roberto Carlos', 'LB', 'Brazil', 'Real Madrid', ['LB', 'LWB'], ['real_madrid_dna', 'euro_legend'], 66, 'Complete Wing-Back'),
  P('ashleycole', 'Ashley Cole', 'LB', 'England', 'Chelsea', ['LB', 'LWB'], ['euro_legend'], 24, 'Full-Back'),
  P('maldini', 'Paolo Maldini', 'CB', 'Italy', 'Milan', ['CB', 'LB', 'LWB'], ['euro_legend', 'serial_winner'], 71, 'Central Defender'),
  P('ramos', 'Sergio Ramos', 'CB', 'Spain', 'Real Madrid', ['CB'], ['real_madrid_dna', 'world_cup_winner', 'euro_final_scorer'], 68, 'Ball-Playing Defender'),
  P('puyol', 'Carles Puyol', 'CB', 'Spain', 'Barcelona', ['CB'], ['barca_dna', 'world_cup_winner'], 52, 'No-Nonsense Centre-Back'),
  P('beckenbauer', 'Franz Beckenbauer', 'CB', 'Germany', 'Bayern', ['CB'], ['euro_legend', 'world_cup_winner'], 57, 'Libero'),
  P('vandijk', 'Virgil van Dijk', 'CB', 'Netherlands', 'Liverpool', ['CB'], ['euro_legend'], 64, 'Ball-Playing Defender'),
  P('pepe', 'Pepe', 'CB', 'Portugal', 'Real Madrid', ['CB'], ['real_madrid_dna', 'euro_legend'], 35, 'No-Nonsense Centre-Back'),
  P('desailly', 'Marcel Desailly', 'CB', 'France', 'Milan', ['CB'], ['euro_legend'], 26, 'No-Nonsense Centre-Back'),
  P('costacurta', 'Alessandro Costacurta', 'CB', 'Italy', 'Milan', ['CB'], ['euro_legend', 'serial_winner'], 18, 'Central Defender'),
  P('stam', 'Jaap Stam', 'CB', 'Netherlands', 'Man United', ['CB'], ['euro_legend'], 23, 'No-Nonsense Centre-Back'),
  P('vidic', 'Nemanja Vidić', 'CB', 'Serbia', 'Man United', ['CB'], ['euro_legend'], 38, 'No-Nonsense Centre-Back'),
  P('ferdinand', 'Rio Ferdinand', 'CB', 'England', 'Man United', ['CB'], ['euro_legend'], 34, 'Ball-Playing Defender'),
  P('thuram', 'Lilian Thuram', 'CB', 'France', 'Juventus', ['CB', 'RB'], ['euro_legend', 'serial_winner'], 21, 'Central Defender'),

  // --- MID ---
  P('makelele', 'Claude Makélélé', 'CDM', 'France', 'Real Madrid', ['CDM'], ['real_madrid_dna', 'euro_legend'], 46, 'Anchor'),
  P('pirlo', 'Andrea Pirlo', 'CDM', 'Italy', 'Milan', ['CDM', 'CM'], ['euro_legend', 'serial_winner', 'world_cup_winner'], 69, 'Regista'),
  P('gattuso', 'Gennaro Gattuso', 'CDM', 'Italy', 'Milan', ['CDM', 'CM'], ['euro_legend'], 41, 'Ball-Winning Midfielder'),
  P('deschamps', 'Didier Deschamps', 'CDM', 'France', 'Juventus', ['CDM', 'CM'], ['euro_legend', 'serial_winner'], 19, 'Defensive Midfielder'),
  P('xabialonso', 'Xabi Alonso', 'CDM', 'Spain', 'Real Madrid', ['CDM', 'CM'], ['real_madrid_dna', 'world_cup_winner', 'serial_winner'], 54, 'Deep-Lying Playmaker'),
  P('yaya', 'Yaya Touré', 'CDM', 'Ivory Coast', 'Barcelona', ['CDM', 'CM'], ['barca_dna', 'played_with_messi'], 37, 'Box-to-Box Midfielder'),
  P('vidal', 'Arturo Vidal', 'CDM', 'Chile', 'Bayern', ['CDM', 'CM'], ['euro_legend'], 27, 'Box-to-Box Midfielder'),
  P('khedira', 'Sami Khedira', 'CDM', 'Germany', 'Juventus', ['CDM', 'CM'], ['world_cup_winner'], 16, 'Box-to-Box Midfielder'),
  P('keane', 'Roy Keane', 'CDM', 'Ireland', 'Man United', ['CDM', 'CM'], ['euro_legend'], 43, 'Ball-Winning Midfielder'),
  P('vieira', 'Patrick Vieira', 'CDM', 'France', 'Juventus', ['CDM', 'CM'], ['serial_winner'], 39, 'Box-to-Box Midfielder'),
  P('xavi', 'Xavi Hernández', 'CM', 'Spain', 'Barcelona', ['CM'], ['barca_dna', 'world_cup_winner', 'serial_winner'], 73, 'Deep-Lying Playmaker'),
  P('iniesta', 'Andrés Iniesta', 'CM', 'Spain', 'Barcelona', ['CM', 'CAM'], ['barca_dna', 'world_cup_winner', 'played_with_messi'], 72, 'Advanced Playmaker'),
  P('modric', 'Luka Modrić', 'CM', 'Croatia', 'Real Madrid', ['CM'], ['real_madrid_dna', 'euro_legend', 'serial_winner'], 70, 'Roaming Playmaker'),
  P('kroos', 'Toni Kroos', 'CM', 'Germany', 'Real Madrid', ['CM', 'CDM'], ['real_madrid_dna', 'world_cup_winner', 'serial_winner'], 67, 'Deep-Lying Playmaker'),
  P('gerrard', 'Steven Gerrard', 'CM', 'England', 'Liverpool', ['CM', 'CAM'], ['euro_legend', 'euro_final_scorer'], 61, 'Box-to-Box Midfielder'),
  P('lampard', 'Frank Lampard', 'CM', 'England', 'Chelsea', ['CM', 'CAM'], ['euro_legend', 'euro_final_scorer'], 59, 'Box-to-Box Midfielder'),
  P('ballack', 'Michael Ballack', 'CM', 'Germany', 'Bayern', ['CM', 'CAM'], ['euro_legend'], 36, 'Box-to-Box Midfielder'),
  P('seedorf', 'Clarence Seedorf', 'CM', 'Netherlands', 'Milan', ['CM', 'CAM'], ['euro_legend', 'serial_winner'], 18, 'Advanced Playmaker'),
  P('scholes', 'Paul Scholes', 'CM', 'England', 'Man United', ['CM', 'CAM'], ['euro_legend'], 48, 'Deep-Lying Playmaker'),
  P('davids', 'Edgar Davids', 'CM', 'Netherlands', 'Juventus', ['CM'], ['euro_legend'], 20, 'Ball-Winning Midfielder'),
  P('deco', 'Deco', 'CM', 'Portugal', 'Porto', ['CM', 'CAM'], ['euro_legend'], 25, 'Advanced Playmaker'),
  P('ozil', 'Mesut Özil', 'CAM', 'Germany', 'Real Madrid', ['CAM'], ['real_madrid_dna', 'world_cup_winner'], 45, 'Advanced Playmaker'),
  P('kaka', 'Kaká', 'CAM', 'Brazil', 'Milan', ['CAM'], ['euro_legend', 'euro_final_scorer'], 63, 'Shadow Striker'),
  P('zidane', 'Zinédine Zidane', 'CAM', 'France', 'Real Madrid', ['CAM'], ['real_madrid_dna', 'euro_final_scorer', 'world_cup_winner'], 78, 'Advanced Playmaker'),
  P('ronaldinho', 'Ronaldinho', 'CAM', 'Brazil', 'Barcelona', ['LW', 'CAM', 'LM'], ['barca_dna', 'euro_final_scorer', 'played_with_messi'], 77, 'Trequartista'),
  P('rivaldo', 'Rivaldo', 'CAM', 'Brazil', 'Barcelona', ['LW', 'CAM'], ['barca_dna', 'euro_final_scorer'], 42, 'Trequartista'),
  P('fabregas', 'Cesc Fàbregas', 'CAM', 'Spain', 'Barcelona', ['CM', 'CAM'], ['barca_dna', 'world_cup_winner', 'played_with_messi'], 32, 'Advanced Playmaker'),

  // --- Wide / ATT ---
  P('robben', 'Arjen Robben', 'RW', 'Netherlands', 'Bayern', ['RW', 'RM'], ['euro_legend', 'euro_final_scorer'], 60, 'Inverted Winger'),
  P('ribery', 'Franck Ribéry', 'LW', 'France', 'Bayern', ['LW', 'LM'], ['euro_legend', 'serial_winner'], 53, 'Winger'),
  P('bale', 'Gareth Bale', 'RW', 'Wales', 'Real Madrid', ['RW', 'LW', 'RM', 'LM'], ['real_madrid_dna', 'euro_final_scorer'], 58, 'Inside Forward'),
  P('ronaldo', 'Cristiano Ronaldo', 'ST', 'Portugal', 'Real Madrid', ['LW', 'ST'], ['real_madrid_dna', 'euro_legend', 'euro_final_scorer', 'serial_winner'], 92, 'Inside Forward'),
  P('messi', 'Lionel Messi', 'RW', 'Argentina', 'Barcelona', ['RW', 'CAM'], ['barca_dna', 'euro_legend', 'euro_final_scorer', 'serial_winner', 'is_messi'], 95, 'False Nine'),
  P('henry', 'Thierry Henry', 'ST', 'France', 'Barcelona', ['ST', 'LW'], ['barca_dna', 'euro_legend', 'played_with_messi'], 74, 'Complete Forward'),
  P('etoo', "Samuel Eto'o", 'ST', 'Cameroon', 'Barcelona', ['ST'], ['barca_dna', 'euro_final_scorer', 'played_with_messi'], 50, 'Advanced Forward'),
  P('ibra', 'Zlatan Ibrahimović', 'ST', 'Sweden', 'Barcelona', ['ST'], ['barca_dna', 'serial_winner', 'played_with_messi'], 65, 'Target Forward'),
  P('inzaghi', 'Filippo Inzaghi', 'ST', 'Italy', 'Milan', ['ST'], ['euro_legend', 'euro_final_scorer'], 33, 'Poacher'),
  P('shevchenko', 'Andriy Shevchenko', 'ST', 'Ukraine', 'Milan', ['ST'], ['euro_legend', 'euro_final_scorer'], 51, 'Complete Forward'),
  P('benzema', 'Karim Benzema', 'ST', 'France', 'Real Madrid', ['ST'], ['real_madrid_dna', 'euro_legend', 'serial_winner'], 62, 'Complete Forward'),
  P('torres', 'Fernando Torres', 'ST', 'Spain', 'Liverpool', ['ST'], ['euro_legend', 'world_cup_winner'], 44, 'Advanced Forward'),
  P('owen', 'Michael Owen', 'ST', 'England', 'Liverpool', ['ST'], ['euro_legend'], 29, 'Poacher'),
  P('drogba', 'Didier Drogba', 'ST', 'Ivory Coast', 'Chelsea', ['ST'], ['euro_legend', 'euro_final_scorer'], 56, 'Target Forward'),
  P('gerdmuller', 'Gerd Müller', 'ST', 'Germany', 'Bayern', ['ST'], ['euro_legend', 'world_cup_winner', 'serial_winner'], 49, 'Poacher'),
  P('vanbasten', 'Marco van Basten', 'ST', 'Netherlands', 'Milan', ['ST'], ['euro_legend', 'euro_final_scorer', 'serial_winner'], 64, 'Complete Forward'),
  P('romario', 'Romário', 'ST', 'Brazil', 'Barcelona', ['ST'], ['barca_dna', 'serial_winner'], 47, 'Poacher'),
  P('suarez', 'Luis Suárez', 'ST', 'Uruguay', 'Barcelona', ['ST'], ['barca_dna', 'played_with_messi'], 60, 'Complete Forward'),
  P('neymar', 'Neymar Jr', 'LW', 'Brazil', 'Barcelona', ['LW'], ['barca_dna', 'euro_final_scorer', 'played_with_messi'], 75, 'Inside Forward'),
  P('weah', 'George Weah', 'ST', 'Liberia', 'Milan', ['ST'], ['euro_legend'], 30, 'Complete Forward'),
  P('vannistelrooy', 'Ruud van Nistelrooy', 'ST', 'Netherlands', 'Real Madrid', ['ST'], ['real_madrid_dna', 'euro_legend'], 52, 'Poacher'),
  P('crespo', 'Hernan Crespo', 'ST', 'Argentina', 'Milan', ['ST'], ['euro_final_scorer'], 28, 'Poacher'),
  P('eusebio', 'Eusébio', 'ST', 'Portugal', 'Benfica', ['ST', 'RW', 'RM'], ['euro_legend', 'serial_winner'], 55, 'Advanced Forward'),
  P('cruyff', 'Johan Cruyff', 'CAM', 'Netherlands', 'Barcelona', ['CAM'], ['barca_dna', 'euro_legend', 'serial_winner'], 69, 'False Nine'),
  P('delpiero', 'Alessandro Del Piero', 'CAM', 'Italy', 'Juventus', ['CAM', 'ST'], ['euro_legend', 'euro_final_scorer', 'serial_winner'], 57, 'Shadow Striker'),
  P('raul', 'Raúl', 'ST', 'Spain', 'Real Madrid', ['ST'], ['real_madrid_dna', 'euro_legend', 'serial_winner'], 58, 'Advanced Forward'),

  // --- GOAT / GOAT Candidate additions (Phase 2) ---
  P('maradona', 'Diego Maradona', 'CAM', 'Argentina', 'Napoli', ['CAM', 'ST'], ['world_cup_winner', 'euro_legend'], 86, 'Trequartista'),
  P('pele', 'Pelé', 'ST', 'Brazil', 'Santos', ['ST', 'CAM'], ['world_cup_winner'], 84, 'Complete Forward'),
  P('nazario', 'Ronaldo Nazário', 'ST', 'Brazil', 'Real Madrid', ['ST'], ['real_madrid_dna', 'euro_legend', 'world_cup_winner'], 80, 'Advanced Forward'),
  P('distefano', 'Alfredo Di Stéfano', 'ST', 'Argentina', 'Real Madrid', ['ST', 'CAM'], ['real_madrid_dna', 'euro_legend', 'euro_final_scorer'], 76, 'Complete Forward'),
  P('platini', 'Michel Platini', 'CAM', 'France', 'Juventus', ['CAM', 'CM'], ['euro_legend', 'euro_final_scorer'], 74, 'Advanced Playmaker'),

  // ================= MODERN =================
  // --- GK ---
  P('neuer', 'Manuel Neuer', 'GK', 'Germany', 'Bayern', ['GK'], ['bayern_core', 'world_cup_winner', 'european_winner', 'big_game_player'], 64, 'Sweeper Keeper', 'modern'),
  P('courtois', 'Thibaut Courtois', 'GK', 'Belgium', 'Real Madrid', ['GK'], ['madrid_modern', 'european_winner', 'big_game_player'], 56, 'Goalkeeper', 'modern'),
  P('alisson', 'Alisson Becker', 'GK', 'Brazil', 'Liverpool', ['GK'], ['liverpool_core', 'european_winner', 'big_game_player'], 52, 'Sweeper Keeper', 'modern'),
  P('ederson', 'Ederson', 'GK', 'Brazil', 'Man City', ['GK'], ['city_core', 'premier_league_star'], 44, 'Sweeper Keeper', 'modern'),
  P('oblak', 'Jan Oblak', 'GK', 'Slovenia', 'Atlético Madrid', ['GK'], ['modern_icon'], 40, 'Goalkeeper', 'modern'),
  P('terstegen', 'Marc-André ter Stegen', 'GK', 'Germany', 'Barcelona', ['GK'], ['barca_modern'], 38, 'Sweeper Keeper', 'modern'),

  // --- DEF ---
  P('carvajal', 'Dani Carvajal', 'RB', 'Spain', 'Real Madrid', ['RB', 'RWB'], ['madrid_modern', 'european_winner', 'final_scorer'], 44, 'Wing-Back', 'modern'),
  P('trent', 'Trent Alexander-Arnold', 'RB', 'England', 'Liverpool', ['RB', 'RWB'], ['liverpool_core', 'premier_league_star', 'european_winner'], 56, 'Inverted Wing-Back', 'modern'),
  P('walker', 'Kyle Walker', 'RB', 'England', 'Man City', ['RB', 'RWB'], ['city_core', 'premier_league_star', 'european_winner'], 40, 'Full-Back', 'modern'),
  P('hakimi', 'Achraf Hakimi', 'RB', 'Morocco', 'PSG', ['RB', 'RWB'], ['psg_star', 'modern_icon'], 48, 'Complete Wing-Back', 'modern'),
  P('marcelo', 'Marcelo', 'LB', 'Brazil', 'Real Madrid', ['LB', 'LWB'], ['madrid_modern', 'european_winner', 'serial_winner'], 60, 'Complete Wing-Back', 'modern'),
  P('alba', 'Jordi Alba', 'LB', 'Spain', 'Barcelona', ['LB', 'LWB'], ['barca_modern', 'european_winner', 'world_cup_winner'], 50, 'Wing-Back', 'modern'),
  P('robertson', 'Andrew Robertson', 'LB', 'Scotland', 'Liverpool', ['LB', 'LWB'], ['liverpool_core', 'premier_league_star', 'european_winner'], 50, 'Wing-Back', 'modern'),
  P('alaba', 'David Alaba', 'CB', 'Austria', 'Real Madrid', ['CB', 'LB'], ['madrid_modern', 'european_winner', 'serial_winner'], 46, 'Ball-Playing Defender', 'modern'),
  P('rudiger', 'Antonio Rüdiger', 'CB', 'Germany', 'Real Madrid', ['CB'], ['madrid_modern', 'european_winner'], 38, 'No-Nonsense Centre-Back', 'modern'),
  P('varane', 'Raphaël Varane', 'CB', 'France', 'Real Madrid', ['CB'], ['madrid_modern', 'world_cup_winner', 'european_winner', 'serial_winner'], 56, 'Central Defender', 'modern'),
  P('pique', 'Gerard Piqué', 'CB', 'Spain', 'Barcelona', ['CB'], ['barca_modern', 'world_cup_winner', 'european_winner'], 56, 'Ball-Playing Defender', 'modern'),
  P('thiagosilva', 'Thiago Silva', 'CB', 'Brazil', 'PSG', ['CB'], ['psg_star', 'big_game_player', 'european_winner'], 50, 'Ball-Playing Defender', 'modern'),
  P('chiellini', 'Giorgio Chiellini', 'CB', 'Italy', 'Juventus', ['CB'], ['serial_winner', 'big_game_player'], 50, 'No-Nonsense Centre-Back', 'modern'),
  P('bonucci', 'Leonardo Bonucci', 'CB', 'Italy', 'Juventus', ['CB'], ['serial_winner', 'big_game_player'], 40, 'Ball-Playing Defender', 'modern'),
  P('marquinhos', 'Marquinhos', 'CB', 'Brazil', 'PSG', ['CB', 'CDM'], ['psg_star', 'modern_icon'], 44, 'Ball-Playing Defender', 'modern'),

  // --- MID ---
  P('debruyne', 'Kevin De Bruyne', 'CM', 'Belgium', 'Man City', ['CM', 'CAM'], ['city_core', 'current_superstar', 'premier_league_star', 'big_game_player'], 78, 'Advanced Playmaker', 'modern'),
  P('casemiro', 'Casemiro', 'CDM', 'Brazil', 'Real Madrid', ['CDM', 'CM'], ['madrid_modern', 'european_winner', 'serial_winner', 'big_game_player'], 58, 'Defensive Midfielder', 'modern'),
  P('busquets', 'Sergio Busquets', 'CDM', 'Spain', 'Barcelona', ['CDM', 'CM'], ['barca_modern', 'world_cup_winner', 'european_winner'], 56, 'Anchor', 'modern'),
  P('kante', "N'Golo Kanté", 'CDM', 'France', 'Chelsea', ['CDM', 'CM'], ['premier_league_star', 'world_cup_winner', 'european_winner', 'big_game_player'], 60, 'Ball-Winning Midfielder', 'modern'),
  P('rodri', 'Rodri', 'CDM', 'Spain', 'Man City', ['CDM', 'CM'], ['city_core', 'current_superstar', 'european_winner', 'final_scorer'], 62, 'Deep-Lying Playmaker', 'modern'),
  P('verratti', 'Marco Verratti', 'CDM', 'Italy', 'PSG', ['CDM', 'CM'], ['psg_star', 'modern_icon'], 40, 'Deep-Lying Playmaker', 'modern'),
  P('bellingham', 'Jude Bellingham', 'CM', 'England', 'Real Madrid', ['CM', 'CAM'], ['madrid_modern', 'current_superstar', 'future_legend', 'european_winner'], 80, 'Mezzala', 'modern'),
  P('pedri', 'Pedri', 'CM', 'Spain', 'Barcelona', ['CM', 'CAM'], ['barca_modern', 'future_legend', 'current_superstar'], 58, 'Advanced Playmaker', 'modern'),
  P('frenkie', 'Frenkie de Jong', 'CM', 'Netherlands', 'Barcelona', ['CM', 'CDM'], ['barca_modern', 'modern_icon'], 46, 'Roaming Playmaker', 'modern'),
  P('bruno', 'Bruno Fernandes', 'CAM', 'Portugal', 'Man United', ['CAM', 'CM'], ['premier_league_star', 'current_superstar', 'big_game_player'], 60, 'Advanced Playmaker', 'modern'),
  P('bernardo', 'Bernardo Silva', 'CM', 'Portugal', 'Man City', ['CM', 'RM', 'RW'], ['city_core', 'european_winner', 'premier_league_star'], 52, 'Roaming Playmaker', 'modern'),
  P('gundogan', 'İlkay Gündoğan', 'CM', 'Germany', 'Man City', ['CM', 'CAM'], ['city_core', 'european_winner', 'final_scorer'], 44, 'Mezzala', 'modern'),
  P('thiago', 'Thiago Alcântara', 'CM', 'Spain', 'Liverpool', ['CM', 'CDM'], ['liverpool_core', 'bayern_core', 'european_winner'], 42, 'Deep-Lying Playmaker', 'modern'),
  P('valverde', 'Federico Valverde', 'CM', 'Uruguay', 'Real Madrid', ['CM', 'RM'], ['madrid_modern', 'current_superstar', 'european_winner'], 50, 'Box-to-Box Midfielder', 'modern'),

  // --- ATT ---
  P('mbappe', 'Kylian Mbappé', 'ST', 'France', 'PSG', ['LW', 'ST'], ['psg_star', 'current_superstar', 'world_cup_winner', 'modern_icon'], 90, 'Inside Forward', 'modern'),
  P('haaland', 'Erling Haaland', 'ST', 'Norway', 'Man City', ['ST'], ['city_core', 'current_superstar', 'premier_league_star', 'european_winner'], 88, 'Advanced Forward', 'modern'),
  P('vinicius', 'Vinícius Jr', 'LW', 'Brazil', 'Real Madrid', ['LW'], ['madrid_modern', 'current_superstar', 'final_scorer'], 76, 'Inside Forward', 'modern'),
  P('salah', 'Mohamed Salah', 'RW', 'Egypt', 'Liverpool', ['RW'], ['liverpool_core', 'current_superstar', 'premier_league_star', 'final_scorer'], 82, 'Inside Forward', 'modern'),
  P('lewandowski', 'Robert Lewandowski', 'ST', 'Poland', 'Barcelona', ['ST'], ['bayern_core', 'current_superstar', 'modern_icon', 'european_winner'], 74, 'Complete Forward', 'modern'),
  P('kane', 'Harry Kane', 'ST', 'England', 'Bayern', ['ST'], ['bayern_core', 'premier_league_star', 'current_superstar'], 64, 'Deep-Lying Forward', 'modern'),
  P('griezmann', 'Antoine Griezmann', 'ST', 'France', 'Atlético Madrid', ['ST', 'CAM'], ['world_cup_winner', 'modern_icon', 'big_game_player'], 58, 'Deep-Lying Forward', 'modern'),
  P('mane', 'Sadio Mané', 'LW', 'Senegal', 'Liverpool', ['LW'], ['liverpool_core', 'premier_league_star', 'european_winner'], 56, 'Inside Forward', 'modern'),
  P('hazard', 'Eden Hazard', 'LW', 'Belgium', 'Chelsea', ['LW'], ['premier_league_star', 'big_game_player'], 58, 'Inside Forward', 'modern'),
  P('luisdiaz', 'Luis Díaz', 'LW', 'Colombia', 'Liverpool', ['LW'], ['liverpool_core', 'modern_icon'], 40, 'Winger', 'modern'),
  P('rodrygo', 'Rodrygo', 'RW', 'Brazil', 'Real Madrid', ['RW'], ['madrid_modern', 'european_winner', 'big_game_player'], 48, 'Inside Forward', 'modern'),
  P('lautaro', 'Lautaro Martínez', 'ST', 'Argentina', 'Inter', ['ST'], ['current_superstar', 'world_cup_winner', 'modern_icon'], 52, 'Advanced Forward', 'modern'),
  P('son', 'Son Heung-min', 'LW', 'South Korea', 'Tottenham', ['LW', 'ST'], ['premier_league_star', 'modern_icon'], 54, 'Inside Forward', 'modern'),
  P('mahrez', 'Riyad Mahrez', 'RW', 'Algeria', 'Man City', ['RW'], ['city_core', 'premier_league_star', 'european_winner'], 44, 'Inverted Winger', 'modern'),
  P('foden', 'Phil Foden', 'LW', 'England', 'Man City', ['LW', 'CAM', 'LM'], ['city_core', 'future_legend', 'premier_league_star', 'european_winner'], 56, 'Inside Forward', 'modern'),
]

// ---------------------------------------------------------------------------
// Aura tiers + verified Big Game Scorer set (Phase 2)
// ---------------------------------------------------------------------------
// VERIFIED STATS SOURCE POLICY
// Evidence strings below are limited to widely-documented, uncontested career
// facts — major honours and famous late-stage European final goals. We do not
// cite precise per-match statistics, disputed records, or anything that cannot
// be verified from mainstream football history. "European Cup final" is used as
// the neutral, historical name for the top continental final (no competition
// branding is referenced anywhere).

// Three SEPARATE categories — never merged into one list.
//  • GOAT Tier:        Messi, CR7, Maradona, Pelé           (+6 individual value)
//  • GOAT Candidate:   Cruyff, Nazário, Zidane, ...         (+4 individual value)
//  • Aura Icon:        Zlatan only, for now                 (cosmetic Infinity Aura)
export const GOAT_IDS = new Set(['messi', 'ronaldo', 'maradona', 'pele'])
export const GOAT_CANDIDATE_IDS = new Set(['cruyff', 'nazario', 'zidane', 'beckenbauer', 'distefano', 'ronaldinho', 'platini'])
export const AURA_ICON_IDS = new Set(['ibra'])

export function isGoat(p) { return GOAT_IDS.has(p.id) }
export function isGoatCandidate(p) { return GOAT_CANDIDATE_IDS.has(p.id) }
// Aura Icon is its own narrow category — Zlatan only. It is NOT the union of the
// GOAT tiers.
export function isAuraIcon(p) { return AURA_ICON_IDS.has(p.id) }

// STRICT Big Game Scorer rule: a verified goal scored DURING a top-tier European
// Cup final or semi-final (open play or in-match). Deliberately rare. Excluded:
//  • second-tier European finals (e.g. Nazário 1998) — not the top competition
//  • penalty-shootout conversions (e.g. Shevchenko 2003) — not a match goal
//  • domestic-cup final goals (e.g. Gündoğan 2023 was an FA Cup, not the European final)
//  • GOAT status / Ballon d'Or / league goals alone
// Maradona and Pelé are GOAT Tier but never scored in a top European final, so
// they are NOT Big Game Scorers.
export const BIG_GAME_SCORERS = {
  ronaldo: 'Scored in the 2008 and 2014 European Cup finals.',
  messi: 'Scored in the 2009 and 2011 European Cup finals.',
  zidane: 'Scored the winning volley in the 2002 European Cup final.',
  ramos: 'Scored the 92nd-minute equaliser in the 2014 European Cup final.',
  raul: 'Scored in the 2000 European Cup final.',
  maldini: 'Scored the opening goal of the 2005 European Cup final.',
  bale: 'Scored twice in the 2018 European Cup final.',
  gerrard: 'Scored in the 2005 European Cup final comeback.',
  etoo: 'Scored in the 2006 and 2009 European Cup finals.',
  drogba: 'Scored the late equaliser in the 2012 European Cup final.',
  inzaghi: 'Scored twice in the 2007 European Cup final.',
  crespo: 'Scored twice in the 2005 European Cup final.',
  neymar: 'Scored in the 2015 European Cup final.',
  distefano: 'Scored in five consecutive European Cup finals (1956–1960).',
  platini: 'Scored the winning goal in the 1985 European Cup final.',
  vinicius: 'Scored the winning goal in the 2022 European Cup final.',
  salah: 'Scored in the 2019 European Cup final.',
  rodri: 'Scored the winning goal in the 2023 European Cup final.',
  carvajal: 'Scored in the 2024 European Cup final.',
}
export function isBigGameScorer(p) {
  return Object.prototype.hasOwnProperty.call(BIG_GAME_SCORERS, p.id)
}

// Special display badges. Infinity Aura is cosmetic (no gameplay bonus); Football
// Icon is a status that grants Zlatan +2 individual value (see auraIndividual).
export const SPECIAL_BADGES = {
  pele: ['3× World Champion'],
  ibra: ['Infinity Aura', 'Football Icon'],
}

// Individual aura value added to a player's own value (NOT a team synergy):
//   GOAT Tier +6 · GOAT Candidate +4 · Football Icon status badge +2.
// Infinity Aura is cosmetic and adds nothing.
export function auraIndividual(p) {
  let pts = 0
  if (isGoat(p)) pts += 6
  else if (isGoatCandidate(p)) pts += 4
  if ((SPECIAL_BADGES[p.id] || []).includes('Football Icon')) pts += 2
  return pts
}

export function auraLabel(p) {
  if (isGoat(p)) return 'GOAT'
  if (isGoatCandidate(p)) return 'GOAT Candidate'
  return null
}

// All badges shown on a player card: aura tier, special badges, big-game scorer.
export function playerBadges(p) {
  const badges = []
  const aura = auraLabel(p)
  if (aura) badges.push(aura)
  if (SPECIAL_BADGES[p.id]) badges.push(...SPECIAL_BADGES[p.id])
  if (isBigGameScorer(p)) badges.push('Big Game Scorer')
  return badges
}

// Player Guide text: why this role, and the verified evidence behind it.
export function roleReasonText(p) {
  const g = ROLE_GUIDE.find((r) => r.role === p.role)
  return g ? g.line : ''
}
export function roleEvidenceText(p) {
  if (BIG_GAME_SCORERS[p.id]) return BIG_GAME_SCORERS[p.id]
  const honours = p.tags.map((t) => TAG_LABELS[t]).filter(Boolean)
  return honours.length ? honours.join(' · ') : 'Recognised top-level performer.'
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------
export const BASE_POINTS = { GK: 8, DEF: 6, MID: 7, ATT: 8 }

export const TAG_POINTS = {
  real_madrid_dna: 4,
  barca_dna: 3,
  euro_final_scorer: 4,
  world_cup_winner: 3,
  serial_winner: 2,
  euro_legend: 2,
  played_with_messi: 2,
  is_messi: 15,
  modern_icon: 3,
  current_superstar: 4,
  european_winner: 2,
  final_scorer: 4,
  big_game_player: 3,
  future_legend: 3,
  premier_league_star: 2,
  madrid_modern: 3,
  barca_modern: 3,
  city_core: 2,
  bayern_core: 2,
  liverpool_core: 2,
  psg_star: 2,
}

// Clean public-facing trait labels — never show raw snake_case tags in the UI.
export const TAG_LABELS = {
  real_madrid_dna: 'Madrid DNA',
  barca_dna: 'Barça DNA',
  euro_final_scorer: 'Final Scorer',
  world_cup_winner: 'World Champion',
  serial_winner: 'Serial Winner',
  euro_legend: 'European Legend',
  played_with_messi: 'Messi Connection',
  is_messi: 'Messi Factor',
  modern_icon: 'Modern Icon',
  current_superstar: 'Current Superstar',
  european_winner: 'European Winner',
  final_scorer: 'Final Scorer',
  big_game_player: 'Big Game Player',
  future_legend: 'Future Legend',
  premier_league_star: 'Premier League Star',
  madrid_modern: 'Real Madrid Core',
  barca_modern: 'Barça Core',
  city_core: 'City Core',
  bayern_core: 'Bayern Core',
  liverpool_core: 'Liverpool Core',
  psg_star: 'PSG Star',
}

const POS_TYPE_NAME = { GK: 'GK', DEF: 'DEF', MID: 'MID', ATT: 'ATT' }

export function playerPoints(player) {
  const base = BASE_POINTS[player.posType]
  const tagSum = player.tags.reduce((acc, t) => acc + (TAG_POINTS[t] || 0), 0)
  return base + tagSum + auraIndividual(player)
}

// Transparent breakdown for the "Why these points?" card.
export function playerBreakdown(player) {
  const base = BASE_POINTS[player.posType]
  const traits = player.tags.map((t) => ({ label: TAG_LABELS[t] || t, pts: TAG_POINTS[t] || 0 }))
  const extras = []
  if (isGoat(player)) extras.push({ label: 'GOAT Tier', pts: 6 })
  else if (isGoatCandidate(player)) extras.push({ label: 'GOAT Candidate', pts: 4 })
  if ((SPECIAL_BADGES[player.id] || []).includes('Football Icon')) extras.push({ label: 'Football Icon', pts: 2 })
  return {
    basePos: POS_TYPE_NAME[player.posType],
    base,
    traits,
    extras,
    role: player.role,
    secondaryRole: player.secondaryRole,
    total: base + traits.reduce((a, x) => a + x.pts, 0) + extras.reduce((a, x) => a + x.pts, 0),
  }
}

// ---------------------------------------------------------------------------
// Eligibility + draft helpers (strict: eligibleSlots.includes(slotLabel))
// ---------------------------------------------------------------------------
export function getEligiblePlayers(slotLabel, usedIds, pool = 'modern') {
  return PLAYERS.filter(
    (p) =>
      p.eligibleSlots.includes(slotLabel) &&
      !usedIds.includes(p.id) &&
      (pool === 'modern' || p.era === 'legend'),
  )
}

export function shuffle(arr, rng = Math.random) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function pickThree(slotLabel, usedIds, rng = Math.random, pool = 'modern') {
  return shuffle(getEligiblePlayers(slotLabel, usedIds, pool), rng).slice(0, 3)
}

export function slotOptions({ mode, slotLabel, slotIndex, rerollCount, usedIds, pool = 'modern' }) {
  if (mode === 'daily') {
    const poolCode = pool === 'modern' ? 1 : 0
    const rng = makeRng(combineSeed(dateSeed(), slotIndex, rerollCount, poolCode))
    return pickThree(slotLabel, usedIds, rng, pool)
  }
  return pickThree(slotLabel, usedIds, Math.random, pool)
}

// Can a player legally occupy a slot label?
export function canPlay(player, slotLabel) {
  return !!player && player.eligibleSlots.includes(slotLabel)
}

// ---------------------------------------------------------------------------
// Role groups (tactical-role classification used by synergies + simulation)
// ---------------------------------------------------------------------------
// Final XI role groups (approved role names) used by synergies + simulation.
const FINISHER_ROLES = ['Complete Striker', 'Box Finisher', 'Link-Up Striker', 'Big Game Scorer']
const WIDE_ATT_ROLES = ['Inside Forward', 'Touchline Winger', 'Direct Runner']
const ATT_CREATOR_ROLES = ['Creative Magician', 'Final Passer']
const DEEP_PLAYMAKER_ROLES = ['Tempo Controller']
const BALLWINNER_ROLES = ['Defensive Shield', 'Ball Winner'] // the Defensive Shield group
const BOX_TO_BOX_ROLES = ['Box-to-Box Engine']
const COMMANDING_CB_ROLES = ['Defensive Leader', 'Ball-Playing Defender']
const BALLPLAYING_DEF_ROLES = ['Ball-Playing Defender']
const FULLBACK_ROLES = ['Attacking Fullback', 'Defensive Fullback']

function inRoles(p, list) {
  return list.includes(p.role)
}

function roleCounter(players) {
  return (role) => players.filter((p) => p.role === role).length
}

// ---------------------------------------------------------------------------
// Chemistry + role + era bonuses (positive). kind: 'chem' | 'role' | 'era'
// ---------------------------------------------------------------------------
export function computeBonuses(squad) {
  const players = squad.map((s) => s.player).filter(Boolean)
  const bonuses = []
  const countTag = (tag) => players.filter((p) => p.tags.includes(tag)).length
  const someRole = (list) => players.some((p) => inRoles(p, list))
  const hasBigGame = players.some(isBigGameScorer)

  // chemistry (tag) bonuses
  if (countTag('real_madrid_dna') >= 3) bonuses.push({ name: 'Madrid DNA', pts: 10, kind: 'chem' })
  if (countTag('barca_dna') >= 3) bonuses.push({ name: 'Barça DNA', pts: 9, kind: 'chem' })
  if (countTag('euro_final_scorer') >= 2) bonuses.push({ name: 'Final Scorers', pts: 8, kind: 'chem' })
  if (countTag('world_cup_winner') >= 3) bonuses.push({ name: 'World Champions', pts: 6, kind: 'chem' })
  if (countTag('played_with_messi') >= 2) bonuses.push({ name: 'Messi Connection', pts: 5, kind: 'chem' })
  if (countTag('serial_winner') >= 4) bonuses.push({ name: 'Serial Winners', pts: 7, kind: 'chem' })
  if (countTag('euro_legend') >= 5) bonuses.push({ name: 'European Legacy', pts: 5, kind: 'chem' })

  const countryCounts = {}
  players.forEach((p) => { countryCounts[p.country] = (countryCounts[p.country] || 0) + 1 })
  const topCountry = Object.entries(countryCounts).find(([, n]) => n >= 3)
  if (topCountry) bonuses.push({ name: `National Core (${topCountry[0]})`, pts: 4, kind: 'chem' })

  const clubCounts = {}
  players.forEach((p) => { clubCounts[p.club] = (clubCounts[p.club] || 0) + 1 })
  const topClub = Object.entries(clubCounts).find(([, n]) => n >= 4)
  if (topClub) bonuses.push({ name: `Club Spine (${topClub[0]})`, pts: 6, kind: 'chem' })

  // role synergies (Final XI language)
  if (someRole(BALLWINNER_ROLES)) bonuses.push({ name: 'Defensive Shield', pts: 4, kind: 'role' })
  if (someRole(DEEP_PLAYMAKER_ROLES) && someRole(BALLWINNER_ROLES)) bonuses.push({ name: 'Brain & Engine', pts: 6, kind: 'role' })
  if (someRole(COMMANDING_CB_ROLES)) bonuses.push({ name: 'Back-Line General', pts: 4, kind: 'role' })
  if (hasBigGame) bonuses.push({ name: 'Big Game Threat', pts: 5, kind: 'role' })
  if (someRole(ATT_CREATOR_ROLES)) bonuses.push({ name: 'Creative Spark', pts: 4, kind: 'role' })
  if (someRole(['Sweeper Keeper']) && someRole(BALLPLAYING_DEF_ROLES)) bonuses.push({ name: 'Modern Build-Up', pts: 4, kind: 'role' })
  if (someRole(FINISHER_ROLES) && someRole(WIDE_ATT_ROLES)) bonuses.push({ name: 'Complete Attack', pts: 5, kind: 'role' })

  // aura team synergies — tightly capped so icons cannot run away with the rating.
  // GOAT Aura: +3 for one GOAT, +4 for two or more (never above +4).
  const goatCount = players.filter(isGoat).length
  if (goatCount >= 2) bonuses.push({ name: 'GOAT Aura', pts: 4, kind: 'aura' })
  else if (goatCount === 1) bonuses.push({ name: 'GOAT Aura', pts: 3, kind: 'aura' })
  // Football Icon: +2 if at least one GOAT Candidate (never above +2). GOAT
  // Candidates do NOT trigger GOAT Aura.
  if (players.some(isGoatCandidate)) bonuses.push({ name: 'Football Icon', pts: 2, kind: 'aura' })
  // Infinity Aura (Zlatan) is cosmetic — no team bonus.

  // modern-era bonuses
  const modernCount = players.filter((p) => p.era === 'modern').length
  const legendCount = players.filter((p) => p.era === 'legend').length
  if (modernCount >= 4) bonuses.push({ name: 'Modern Era Core', pts: 6, kind: 'era' })
  if (countTag('future_legend') >= 2) bonuses.push({ name: 'Future Legends', pts: 5, kind: 'era' })
  if (countTag('city_core') >= 3) bonuses.push({ name: 'City Core', pts: 6, kind: 'era' })
  if (countTag('liverpool_core') >= 3) bonuses.push({ name: 'Liverpool Core', pts: 6, kind: 'era' })
  if (countTag('madrid_modern') >= 3) bonuses.push({ name: 'Madrid Modern', pts: 7, kind: 'era' })
  if (countTag('bayern_core') >= 3) bonuses.push({ name: 'Bayern Core', pts: 6, kind: 'era' })
  if (countTag('current_superstar') >= 3) bonuses.push({ name: 'Current Superstars', pts: 6, kind: 'era' })
  if (legendCount >= 5 && modernCount >= 4) bonuses.push({ name: 'Old Meets New', pts: 8, kind: 'era' })

  return bonuses
}

// ---------------------------------------------------------------------------
// Squad weaknesses
// ---------------------------------------------------------------------------
export function computeWeaknesses(squad) {
  const players = squad.map((s) => s.player).filter(Boolean)
  const weaknesses = []
  if (players.length === 0) return weaknesses

  const someRole = (list) => players.some((p) => inRoles(p, list))
  const countRole = (list) => players.filter((p) => inRoles(p, list)).length
  const hasTrueST = players.some((p) => p.primaryPos === 'ST')
  const hasBigGame = players.some(isBigGameScorer)

  // squad-shape weaknesses
  if (!hasTrueST) weaknesses.push({ name: 'No True Striker', desc: 'No natural No.9 to lead the line.', pts: -8, kind: 'squad' })

  // Defensive Shield is defined by the role system: a Defensive Shield or Ball
  // Winner in the XI, not merely a CDM slot being filled.
  const hasShield = players.some((p) => BALLWINNER_ROLES.includes(p.role))
  if (!hasShield) weaknesses.push({ name: 'No Defensive Shield', desc: 'No holding midfielder screening the defence.', pts: -8, kind: 'squad' })

  const gk = players.find((p) => p.posType === 'GK')
  if (gk && !gk.tags.includes('euro_legend') && !gk.tags.includes('serial_winner') && !gk.tags.includes('big_game_player')) {
    weaknesses.push({ name: 'Weak Goalkeeper', desc: 'Keeper lacks big-night pedigree.', pts: -10, kind: 'squad' })
  }

  const defenders = players.filter((p) => p.posType === 'DEF')
  const eliteDef = defenders.filter((p) => p.tags.some((t) => ['world_cup_winner', 'serial_winner', 'real_madrid_dna', 'barca_dna', 'european_winner'].includes(t)))
  if (defenders.length > 0 && eliteDef.length < 2) weaknesses.push({ name: 'Weak Defense', desc: 'Back line short on elite, proven defenders.', pts: -7, kind: 'squad' })

  // role-based weaknesses
  if (!someRole(BALLWINNER_ROLES)) weaknesses.push({ name: 'No Ball Winner', desc: 'Nobody to break up play in midfield.', pts: -6, kind: 'role' })
  if (!someRole(ATT_CREATOR_ROLES) && !someRole(DEEP_PLAYMAKER_ROLES)) weaknesses.push({ name: 'No Creator', desc: 'Lacks a pure chance-creator.', pts: -5, kind: 'role' })
  if (!someRole(COMMANDING_CB_ROLES)) weaknesses.push({ name: 'No Defensive Leader', desc: 'No commanding organiser at the back.', pts: -4, kind: 'role' })
  if (countRole(WIDE_ATT_ROLES) >= 2 && !hasTrueST) weaknesses.push({ name: 'Inside Forwards, No Striker', desc: 'Wide forwards but nobody up top.', pts: -6, kind: 'role' })
  if (!hasBigGame) weaknesses.push({ name: 'No Big-Game Threat', desc: 'Nobody who turns up on the biggest nights.', pts: -4, kind: 'role' })

  // modern-era weakness
  const modernCount = players.filter((p) => p.era === 'modern').length
  const provenTags = ['euro_legend', 'european_winner', 'final_scorer', 'big_game_player']
  const provenCount = players.filter((p) => p.tags.some((t) => provenTags.includes(t))).length
  if (modernCount >= 7 && provenCount < 3) weaknesses.push({ name: 'Too Modern, Not Proven', desc: 'Young and shiny, but short on proven winners.', pts: -6, kind: 'era' })

  return weaknesses
}

export function computeRating(squad) {
  const players = squad.map((s) => s.player).filter(Boolean)
  const base = players.reduce((acc, p) => acc + playerPoints(p), 0)
  const bonuses = computeBonuses(squad)
  const weaknesses = computeWeaknesses(squad)
  const bonusTotal = bonuses.reduce((a, b) => a + b.pts, 0) + weaknesses.reduce((a, w) => a + w.pts, 0)
  return { base, bonusTotal, total: base + bonusTotal, bonuses, weaknesses }
}

export function squadMVP(squad) {
  const players = squad.map((s) => s.player).filter(Boolean)
  if (players.length === 0) return null
  return players.reduce((best, p) => (playerPoints(p) > playerPoints(best) ? p : best))
}

export function smartestPick(squad) {
  const players = squad.map((s) => s.player).filter(Boolean)
  if (players.length === 0) return null
  return players.reduce((best, p) => (p.rarity < best.rarity ? p : best))
}

export function topBonus(squad) {
  const { bonuses } = computeRating(squad)
  return [...bonuses].filter((b) => b.pts > 0).sort((a, b) => b.pts - a.pts)[0] || null
}

export function keyWeakness(squad) {
  const { weaknesses } = computeRating(squad)
  return [...weaknesses].sort((a, b) => a.pts - b.pts)[0] || null
}

export function bestRoleSynergy(squad) {
  const { bonuses } = computeRating(squad)
  return [...bonuses].filter((b) => b.kind === 'role').sort((a, b) => b.pts - a.pts)[0] || null
}

export function biggestRoleWeakness(squad) {
  const { weaknesses } = computeRating(squad)
  return [...weaknesses].filter((w) => w.kind === 'role').sort((a, b) => a.pts - b.pts)[0] || null
}

export function eraCounts(squad) {
  const players = squad.map((s) => s.player).filter(Boolean)
  return { legends: players.filter((p) => p.era === 'legend').length, modern: players.filter((p) => p.era === 'modern').length }
}

export function bestEraPick(squad, era) {
  const players = squad.map((s) => s.player).filter(Boolean).filter((p) => p.era === era)
  if (players.length === 0) return null
  return players.reduce((best, p) => (playerPoints(p) > playerPoints(best) ? p : best))
}

// ---------------------------------------------------------------------------
// Tactical identity — role + era aware
// ---------------------------------------------------------------------------
export function tacticalIdentity(squad) {
  const players = squad.map((s) => s.player).filter(Boolean)
  if (players.length === 0) return null

  const tag = (t) => players.filter((p) => p.tags.includes(t)).length
  const inList = (list) => players.filter((p) => inRoles(p, list)).length

  const rm = tag('real_madrid_dna')
  const barca = tag('barca_dna')
  const legend = tag('euro_legend')
  const finalSc = tag('euro_final_scorer')

  const playmakers = inList(ATT_CREATOR_ROLES) + inList(DEEP_PLAYMAKER_ROLES)
  const wideThreats = inList(WIDE_ATT_ROLES)
  const bigGame = players.filter(isBigGameScorer).length
  const defLeaders = inList(COMMANDING_CB_ROLES)
  const stoppers = inList(['Defensive Leader'])
  const strongGK = players.some((p) => p.posType === 'GK' && (p.tags.includes('euro_legend') || p.tags.includes('serial_winner') || p.tags.includes('big_game_player')))
  const stars = players.filter((p) => playerPoints(p) >= 14).length
  const trueST = players.some((p) => p.primaryPos === 'ST')

  const modernCount = players.filter((p) => p.era === 'modern').length
  const legendCount = players.filter((p) => p.era === 'legend').length
  const cityCore = tag('city_core')
  const madridModern = tag('madrid_modern')
  const liverpoolCore = tag('liverpool_core')
  const currentSuperstar = tag('current_superstar')
  const futureLegend = tag('future_legend')

  const { total, weaknesses } = computeRating(squad)
  const weakDefense = weaknesses.some((w) => w.name === 'Weak Defense' || w.name === 'No Defensive Shield')

  const candidates = [
    { name: 'Barça Superteam', score: barca * 3 + (barca >= 4 ? 6 : 0) },
    { name: 'Madrid DNA', score: rm * 3 + (rm >= 4 ? 6 : 0) },
    { name: 'Tiki-Taka Core', score: playmakers * 2.2 + barca * 1.2 + (playmakers >= 4 ? 5 : 0) },
    { name: 'Italian Wall', score: defLeaders * 2.5 + stoppers * 2 + (strongGK ? 3 : 0) },
    { name: 'Counterattack Machine', score: wideThreats * 2.4 + bigGame * 1.6 + (trueST ? 1 : 0) },
    { name: 'Galáctico Chaos', score: stars * 2.2 + inList(ATT_CREATOR_ROLES) * 1.0 + (weakDefense ? 6 : 0) },
    { name: 'Final Mentality XI', score: bigGame * 2.4 + finalSc * 1.5 + (total >= 150 ? 5 : 0) },
    { name: 'European Legacy XI', score: legend * 2 },
    { name: 'Modern Superteam', score: (modernCount >= 6 ? modernCount * 1.6 : 0) + currentSuperstar * 1.6 },
    { name: 'City Machine', score: cityCore * 3 + (cityCore >= 3 ? 5 : 0) },
    { name: 'Madrid Modern', score: madridModern * 3 + (madridModern >= 3 ? 5 : 0) },
    { name: 'Liverpool Intensity', score: liverpoolCore * 3 + (liverpoolCore >= 3 ? 5 : 0) },
    { name: 'Future Legends XI', score: futureLegend * 4 + (futureLegend >= 2 ? 4 : 0) },
    { name: 'Old Meets New', score: legendCount >= 5 && modernCount >= 4 ? 14 + Math.min(legendCount, modernCount) : 0 },
  ]

  return candidates.reduce((best, c) => (c.score > best.score ? c : best)).name
}

// ---------------------------------------------------------------------------
// Win probability
// ---------------------------------------------------------------------------
export const OPPONENTS = [
  'Bayern Munich', 'Real Madrid', 'Liverpool', 'PSG', 'Manchester City',
  'Chelsea', 'Barcelona', 'Inter Milan', 'Juventus', 'Atlético Madrid',
  'Ajax', 'Borussia Dortmund', 'Porto', 'Roma', 'Napoli', 'AC Milan',
]

export const DIFFICULTIES = {
  casual: { name: 'Casual', offset: 0.12, desc: 'Forgiving odds' },
  classic: { name: 'Classic', offset: 0, desc: 'Balanced' },
  legendary: { name: 'Legendary', offset: -0.12, desc: 'Brutal odds' },
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

export function winProbability(rating, difficulty = 'classic') {
  const base = 0.4 + clamp((rating - 100) / 200, -0.3, 0.45)
  const offset = DIFFICULTIES[difficulty]?.offset ?? 0
  return clamp(base + offset, 0.05, 0.95)
}

// ---------------------------------------------------------------------------
// Cinematic simulation with match reports
// ---------------------------------------------------------------------------
// lateStage = a European Semi-final or Final; only then does the strict Big Game
// Scorer boost apply, per the verified late-stage rule.
function scorerWeight(p, lateStage = false) {
  let w
  if (inRoles(p, FINISHER_ROLES)) w = 12
  else if (p.role === 'Creative Magician') w = 8
  else if (inRoles(p, WIDE_ATT_ROLES)) w = 9
  else if (p.role === 'Final Passer') w = 5
  else if (inRoles(p, BOX_TO_BOX_ROLES)) w = 3.5
  else if (p.posType === 'MID') w = 2.5
  else if (p.posType === 'DEF') w = 0.8
  else if (p.posType === 'GK') w = 0.02
  else w = 4
  if (isBigGameScorer(p)) { w += 4; if (lateStage) w += 5 } // strict, verified set
  if (p.tags.includes('big_game_player')) w += 2
  if (p.tags.includes('is_messi')) w += 8
  if (p.tags.includes('current_superstar')) w += 2
  return Math.max(0.02, w + playerPoints(p) / 12)
}

function assistWeight(p) {
  let w
  if (inRoles(p, ATT_CREATOR_ROLES) || inRoles(p, DEEP_PLAYMAKER_ROLES)) w = 10
  else if (inRoles(p, WIDE_ATT_ROLES)) w = 6
  else if (inRoles(p, BOX_TO_BOX_ROLES)) w = 5
  else if (inRoles(p, FULLBACK_ROLES)) w = 4
  else if (inRoles(p, FINISHER_ROLES)) w = 3
  else if (p.posType === 'DEF') w = 1.2
  else if (p.posType === 'GK') w = 0.02
  else w = 2
  if (p.tags.includes('played_with_messi')) w += 1
  return Math.max(0.02, w + playerPoints(p) / 16)
}

function weightedPick(rng, players, weightFn, excludeId) {
  const pool = players.filter((p) => p.id !== excludeId)
  if (pool.length === 0) return null
  const weights = pool.map(weightFn)
  const total = weights.reduce((a, b) => a + b, 0)
  let r = rng() * total
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i]
    if (r <= 0) return pool[i]
  }
  return pool[pool.length - 1]
}

const OPP_GOAL_LABELS = ['Opponent Striker', 'Opponent Winger', 'Opponent Midfielder', 'Set-piece header', 'Long-range strike', 'Counterattack finish']

// Explicit overrides for names where the algorithm can't produce the right
// short form — e.g. "Cristiano Ronaldo" must be "CR7", not "Ronaldo".
const SHORT_NAME_OVERRIDES = {
  'Cristiano Ronaldo': 'CR7',
}

// Prefix-aware short display name: "Marco van Basten" → "van Basten",
// "Kevin De Bruyne" → "De Bruyne", "Ángel Di María" → "Di María".
// Works by walking backwards through name parts and collecting consecutive
// lowercase-prefix words (van / de / del / di / der / den / le / la).
export function shortDisplayName(name) {
  if (SHORT_NAME_OVERRIDES[name]) return SHORT_NAME_OVERRIDES[name]
  const PREFIXES = new Set(['van', 'de', 'del', 'di', 'der', 'den', 'le', 'la'])
  const parts = name.split(' ')
  if (parts.length <= 1) return name
  let start = parts.length - 1
  while (start > 0 && PREFIXES.has(parts[start - 1].toLowerCase())) start--
  return parts.slice(start).join(' ')
}

export function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

// Build the goal timeline for a single match. `tallies` is a list of tally
// objects (run-wide + phase-specific) that all get incremented.
function buildGoals(rng, players, gf, ga, tallies, lateStage = false) {
  const sides = [...Array(gf).fill('us'), ...Array(ga).fill('opp')]
  const minutes = sides.map(() => 1 + Math.floor(rng() * 90)).sort((a, b) => a - b)
  const shuffledSides = shuffle(sides, rng)
  const events = []
  for (let i = 0; i < minutes.length; i++) {
    const minute = minutes[i]
    if (shuffledSides[i] === 'us') {
      const scorer = weightedPick(rng, players, (pp) => scorerWeight(pp, lateStage))
      const assistMaybe = rng() < 0.78 ? weightedPick(rng, players.filter((p) => p.posType !== 'GK'), assistWeight, scorer ? scorer.id : null) : null
      if (scorer) tallies.forEach((t) => { t.goals[scorer.id] = (t.goals[scorer.id] || 0) + 1 })
      if (assistMaybe) tallies.forEach((t) => { t.assists[assistMaybe.id] = (t.assists[assistMaybe.id] || 0) + 1 })
      events.push({ minute, side: 'us', scorer: scorer ? scorer.name : 'Final XI', assist: assistMaybe ? assistMaybe.name : null })
    } else {
      events.push({ minute, side: 'opp', scorer: OPP_GOAL_LABELS[Math.floor(rng() * OPP_GOAL_LABELS.length)], assist: null })
    }
  }
  return events
}

function matchStats(rng, rating, gf, players, events) {
  const poss = clamp(Math.round(50 + clamp((rating - 100) / 4, -16, 20) + (rng() - 0.5) * 12), 28, 74)
  const shots = Math.max(gf, Math.round(7 + poss / 7 + rng() * 7))
  const sot = Math.max(gf, Math.round(shots * (0.32 + rng() * 0.22)))
  const xg = (gf * 0.7 + sot * 0.2 + rng() * 0.5).toFixed(1)
  const saves = Math.round(1 + rng() * 5)
  const fouls = Math.round(6 + rng() * 8)
  let potm
  const usScorers = events.filter((e) => e.side === 'us').map((e) => e.scorer)
  if (usScorers.length > 0) potm = usScorers[0]
  else {
    const outfield = players.filter((p) => p.posType !== 'GK')
    potm = outfield.reduce((b, p) => (playerPoints(p) > playerPoints(b) ? p : b), outfield[0]).name
  }
  return { possession: poss, shots, shotsOnTarget: sot, xg, saves, fouls, potm }
}

function topEntry(map, byId, key) {
  const e = Object.entries(map).sort((a, b) => b[1] - a[1])[0]
  return e ? { name: byId[e[0]].name, [key]: e[1] } : null
}

// A single decisive match (used for the Knockout Play-Off + every knockout
// round). Returns the match object with an `eliminated` flag.
// usedOpponents (Set) ensures no team appears in two different KO rounds.
function decisiveMatch(rng, p, rating, players, tallies, round, usedOpponents) {
  const available = OPPONENTS.filter(o => !usedOpponents.has(o))
  const pool = available.length > 0 ? available : OPPONENTS
  const opponent = pool[Math.floor(rng() * pool.length)]
  usedOpponents.add(opponent)
  const roll = rng()
  let result, mgf, mga, pens = null, eliminated = false

  if (roll < p) {
    result = 'win'
    mgf = 1 + Math.floor(rng() * 3); mga = Math.floor(rng() * mgf)
  } else if (roll < p + 0.22) {
    mgf = Math.floor(rng() * 2); mga = mgf
    const wonPens = rng() < 0.5
    const a = 3 + Math.floor(rng() * 3)
    const b = wonPens ? a - 1 - Math.floor(rng() * 2) : a + 1
    pens = { won: wonPens, score: wonPens ? `${a}-${Math.max(0, b)}` : `${Math.max(0, b)}-${a}`, hero: wonPens ? (rng() < 0.5 ? 'GK save in the shootout' : 'Ice-cold winning penalty') : null }
    result = wonPens ? 'pens-win' : 'pens-loss'
    if (!wonPens) eliminated = true
  } else {
    result = 'loss'
    mga = 1 + Math.floor(rng() * 2); mgf = Math.floor(rng() * mga)
    eliminated = true
  }

  const lateStage = round === 'Semi-final' || round === 'Final'
  const events = buildGoals(rng, players, mgf, mga, tallies, lateStage)
  const stats = matchStats(rng, rating, mgf, players, events)
  const normalScore = `${mgf}-${mga}`
  const score = pens ? `${normalScore} (pens ${pens.score})` : normalScore
  return { type: 'ko', round, opponent, result, score, normalScore, pens, stats, events, gf: mgf, ga: mga, eliminated }
}

// Map an internal exit stage to a public outcome label.
export function outcomeLabel(result) {
  if (result.champion) return 'Won Europe'
  if (result.exitStage === 'Final') return 'Lost Final'
  if (result.exitStage === 'League Phase') return 'Eliminated in League Phase'
  if (result.exitStage === 'Knockout Play-Off') return 'Eliminated in Knockout Play-Off'
  return `Eliminated in ${result.exitStage}`
}

export function simulate({ rating, difficulty = 'classic', squad, rng = Math.random }) {
  const p = winProbability(rating, difficulty)
  const players = squad.map((s) => s.player).filter(Boolean)
  const byId = Object.fromEntries(players.map((pl) => [pl.id, pl]))
  const tally = { goals: {}, assists: {} }        // whole-run tally
  const leagueTally = { goals: {}, assists: {} }    // league-phase only
  const allMatches = []                             // for run-wide best/toughest

  // ---- League Phase: 8 matches ----
  const leagueMatches = []
  let lw = 0, ld = 0, ll = 0, lgf = 0, lga = 0
  for (let i = 0; i < 8; i++) {
    const opponent = OPPONENTS[Math.floor(rng() * OPPONENTS.length)]
    const home = rng() < 0.5
    const roll = rng()
    let result, mgf, mga, points
    if (roll < p) { result = 'win'; mgf = 1 + Math.floor(rng() * 3); mga = Math.floor(rng() * mgf); points = 3; lw++ }
    else if (roll < p + 0.25) { result = 'draw'; mgf = Math.floor(rng() * 2); mga = mgf; points = 1; ld++ }
    else { result = 'loss'; mga = 1 + Math.floor(rng() * 2); mgf = Math.floor(rng() * mga); points = 0; ll++ }
    lgf += mgf; lga += mga
    const events = buildGoals(rng, players, mgf, mga, [tally, leagueTally])
    const stats = matchStats(rng, rating, mgf, players, events)
    const match = { type: 'league', matchNo: i + 1, opponent, home, score: `${mgf}-${mga}`, result, points, events, stats, gf: mgf, ga: mga }
    leagueMatches.push(match)
    allMatches.push(match)
  }

  const points = lw * 3 + ld
  const gd = lgf - lga

  // Position estimate: driven by points + goal difference + rating, with a small
  // seeded jitter. Lower number = higher finish. Clamped to 1..36.
  const ratingNudge = clamp((rating - 110) / 12, -4, 6)
  const strength = points * 1.35 + gd * 0.4 + ratingNudge + (rng() - 0.5) * 5
  const position = clamp(Math.round(37 - strength), 1, 36)
  const qualification = position <= 8 ? 'direct' : position <= 24 ? 'playoff' : 'eliminated'
  const qualLabel = qualification === 'direct' ? 'Direct to Round of 16' : qualification === 'playoff' ? 'Knockout Play-Off' : 'Eliminated in League Phase'

  const leaguePhase = {
    matches: leagueMatches,
    record: { w: lw, d: ld, l: ll },
    points, gf: lgf, ga: lga, gd, position, qualification, qualLabel,
    topScorer: topEntry(leagueTally.goals, byId, 'goals'),
    topAssister: topEntry(leagueTally.assists, byId, 'assists'),
    bestMatch: bestWin(leagueMatches),
  }

  // ---- Knockout Play-Off + knockout rounds ----
  let playoff = null
  let eliminated = qualification === 'eliminated'
  let exitStage = 'League Phase'
  const knockouts = []

  // One Set for the entire run — guarantees every KO-round opponent is unique.
  const usedKOOpponents = new Set()

  if (qualification === 'playoff') {
    playoff = decisiveMatch(rng, p, rating, players, [tally], 'Knockout Play-Off', usedKOOpponents)
    allMatches.push(playoff)
    if (playoff.eliminated) { eliminated = true; exitStage = 'Knockout Play-Off' }
  }

  const advancedToKO = qualification === 'direct' || (playoff && !playoff.eliminated)
  if (advancedToKO) {
    for (const round of ['Round of 16', 'Quarter-final', 'Semi-final', 'Final']) {
      if (eliminated) break
      const m = decisiveMatch(rng, p, rating, players, [tally], round, usedKOOpponents)
      knockouts.push(m)
      allMatches.push(m)
      if (m.eliminated) { eliminated = true; exitStage = round }
    }
  }

  const champion = advancedToKO && !eliminated
  if (champion) exitStage = 'Final'

  const lastWithOpp = [...allMatches].reverse().find((m) => m.opponent)
  const knockoutWins = [playoff, ...knockouts].filter((m) => m && (m.result === 'win' || m.result === 'pens-win')).length

  // run-wide top scorer / assister / best match / toughest opponent
  const topScorer = topEntry(tally.goals, byId, 'goals')
  const topAssister = topEntry(tally.assists, byId, 'assists')
  let best = null, toughest = null
  allMatches.forEach((m) => {
    const margin = m.gf - m.ga
    if (margin > 0 && (!best || margin > best.margin)) best = { round: m.type === 'league' ? 'League Phase' : m.round, opponent: m.opponent, score: m.score, margin }
    if (!toughest || m.ga >= toughest.ga) toughest = { opponent: m.opponent, ga: m.ga }
  })

  return {
    leaguePhase, playoff, knockouts,
    champion, exitStage, knockoutWins,
    lastOpponent: lastWithOpp ? lastWithOpp.opponent : null,
    lastScore: lastWithOpp ? lastWithOpp.score : null,
    topScorer, topAssister,
    bestMatch: best ? { round: best.round, opponent: best.opponent, score: best.score } : null,
    toughestOpponent: toughest ? toughest.opponent : null,
  }
}

function bestWin(matches) {
  let best = null
  matches.forEach((m) => {
    const margin = m.gf - m.ga
    if (margin > 0 && (!best || margin > best.margin)) best = { opponent: m.opponent, score: m.score, margin }
  })
  return best ? { opponent: best.opponent, score: best.score } : null
}

// ---------------------------------------------------------------------------
// Validation (PHASE 8)
// ---------------------------------------------------------------------------
export function validatePlayerDB() {
  const problems = []
  const seen = new Set()
  const ROLE_SET = new Set(ROLE_GUIDE.map((g) => g.role))
  for (const p of PLAYERS) {
    if (seen.has(p.id)) problems.push(`Duplicate id: ${p.id}`)
    seen.add(p.id)
    // role + secondaryRole must be exactly approved Final XI roles
    if (!p.role) problems.push(`${p.id} missing role`)
    else if (!ROLE_SET.has(p.role)) problems.push(`${p.id} role "${p.role}" not in approved list`)
    if (p.secondaryRole && !ROLE_SET.has(p.secondaryRole)) problems.push(`${p.id} secondaryRole "${p.secondaryRole}" not in approved list`)
    // a player labelled Big Game Scorer must actually be in the verified set
    if ((p.role === 'Big Game Scorer' || p.secondaryRole === 'Big Game Scorer') && !isBigGameScorer(p)) {
      problems.push(`${p.id} tagged Big Game Scorer without verified evidence`)
    }
    if (!Array.isArray(p.eligibleSlots) || p.eligibleSlots.length === 0) problems.push(`${p.id} has no eligibleSlots`)
    if (!p.eligibleSlots.includes(p.primaryPos)) problems.push(`${p.id} primaryPos ${p.primaryPos} not in eligibleSlots`)
    for (const s of p.eligibleSlots) if (!ALL_SLOT_LABELS.includes(s)) problems.push(`${p.id} invalid slot ${s}`)
    if (!posTypeOf(p.primaryPos)) problems.push(`${p.id} bad primaryPos`)
  }

  // ensure every formation slot has >=3 eligible players in both pools
  for (const f of Object.values(FORMATIONS)) {
    for (const pool of ['legends', 'modern']) {
      for (const slot of new Set(f.slots)) {
        const n = getEligiblePlayers(slot, [], pool).length
        if (n < 3) problems.push(`${f.name} ${slot} (${pool}) only ${n} eligible`)
      }
    }
  }

  // --- aura / GOAT-tier rules ---------------------------------------------
  const byId = Object.fromEntries(PLAYERS.map((p) => [p.id, p]))
  const mk = (ids) => ids.map((id) => ({ slot: byId[id]?.primaryPos, player: byId[id] })).filter((s) => s.player)
  const auraPts = (squad, name) => (computeBonuses(squad).find((b) => b.name === name)?.pts || 0)

  // Only Messi/CR7/Maradona/Pelé are GOAT Tier
  const expectedGoats = ['messi', 'ronaldo', 'maradona', 'pele']
  if (GOAT_IDS.size !== expectedGoats.length || !expectedGoats.every((id) => GOAT_IDS.has(id))) {
    problems.push('GOAT_IDS must be exactly Messi, CR7, Maradona, Pelé')
  }
  // Zlatan must be neither GOAT Tier nor GOAT Candidate
  if (isGoat(byId.ibra) || isGoatCandidate(byId.ibra)) problems.push('Zlatan must not be GOAT Tier or GOAT Candidate')
  // Aura Icon list must be Zlatan only
  if (AURA_ICON_IDS.size !== 1 || !AURA_ICON_IDS.has('ibra')) problems.push('Aura Icon list must be Zlatan only for now')
  // GOAT Aura must never exceed +4 (test with all four GOATs)
  if (auraPts(mk(expectedGoats), 'GOAT Aura') > 4) problems.push('GOAT Aura exceeds +4')
  // GOAT Candidates must NOT trigger GOAT Aura
  if (auraPts(mk([...GOAT_CANDIDATE_IDS]), 'GOAT Aura') > 0) problems.push('GOAT Candidates must not trigger GOAT Aura')
  // Football Icon team synergy must never exceed +2
  if (auraPts(mk([...GOAT_CANDIDATE_IDS]), 'Football Icon') > 2) problems.push('Football Icon synergy exceeds +2')
  // Infinity Aura must give no gameplay team bonus (or at most +1)
  if (auraPts(mk(['ibra']), 'Infinity Aura') > 1) problems.push('Infinity Aura must not give a gameplay bonus above +1')

  // --- Big Game Scorer evidence quality -----------------------------------
  for (const [id, ev] of Object.entries(BIG_GAME_SCORERS)) {
    const low = ev.toLowerCase()
    if (low.includes('shootout')) problems.push(`Big Game Scorer ${id} evidence references a penalty shootout`)
    if (low.includes('second-tier') || low.includes('uefa cup')) problems.push(`Big Game Scorer ${id} evidence references a second-tier final`)
  }

  return problems
}

// Validate a finalized XI before simulation.
export function validateXI(squad, formation) {
  const problems = []
  const slots = FORMATIONS[formation].slots
  if (squad.length !== slots.length) problems.push('XI does not have 11 players')
  const ids = new Set()
  squad.forEach((s, i) => {
    if (!s.player) problems.push(`Slot ${s.slot} empty`)
    else {
      if (ids.has(s.player.id)) problems.push(`Duplicate player ${s.player.id}`)
      ids.add(s.player.id)
      if (!canPlay(s.player, s.slot)) problems.push(`${s.player.name} cannot play ${s.slot}`)
    }
    if (s.slot !== slots[i]) problems.push(`Slot mismatch at ${i}`)
  })
  return problems
}

// ---------------------------------------------------------------------------
// localStorage stats
// ---------------------------------------------------------------------------
const STATS_KEY = 'finalxi.stats.v1'

const DEFAULT_STATS = {
  gamesPlayed: 0, trophies: 0, finalsReached: 0, bestRating: 0,
  formationCounts: {}, bestMVP: null, bestSmartestPick: null,
}

export function loadStats() {
  try {
    const raw = localStorage.getItem(STATS_KEY)
    if (!raw) return { ...DEFAULT_STATS }
    return { ...DEFAULT_STATS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULT_STATS }
  }
}

export function favoriteFormation(stats) {
  const entries = Object.entries(stats.formationCounts || {})
  if (entries.length === 0) return null
  return entries.sort((a, b) => b[1] - a[1])[0][0]
}

export function recordGame({ result, squad, formation }) {
  const stats = loadStats()
  const { total } = computeRating(squad)
  const mvp = squadMVP(squad)
  const smart = smartestPick(squad)

  stats.gamesPlayed += 1
  if (result.champion) stats.trophies += 1
  if (result.champion || result.exitRound === 'Final') stats.finalsReached += 1
  if (total > stats.bestRating) stats.bestRating = total

  stats.formationCounts = { ...stats.formationCounts }
  stats.formationCounts[formation] = (stats.formationCounts[formation] || 0) + 1

  const mvpPts = mvp ? playerPoints(mvp) : 0
  if (mvp && (!stats.bestMVP || mvpPts > stats.bestMVP.pts)) stats.bestMVP = { name: mvp.name, pts: mvpPts }
  if (smart && (!stats.bestSmartestPick || smart.rarity < stats.bestSmartestPick.rarity)) stats.bestSmartestPick = { name: smart.name, rarity: smart.rarity }

  try { localStorage.setItem(STATS_KEY, JSON.stringify(stats)) } catch { /* ignore */ }
  return stats
}
