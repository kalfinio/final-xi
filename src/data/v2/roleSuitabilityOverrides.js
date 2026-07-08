// ---------------------------------------------------------------------------
// Curated role suitability (Phase A remediation, Task 3).
//
// The deterministic derivation in index.js is a good scaffold, but the audit
// asked for HAND-CURATED role profiles for the high-impact players a future
// Tactical HQ will actually surface: all legends, the most recognisable modern
// players, and scarce-role tactical specialists.
//
// We author ONLY the accomplished (2) and plausible (1) SECONDARY roles here.
// The player's PRIMARY role is always natural (3) and is attached automatically
// by curatedRoleSuitability(), so the "sole level-3 == primaryRole" invariant
// is structurally guaranteed and a curated entry can never accidentally create
// a second natural role or an impossible one. Values are clamped to {1,2}.
//
// Design rules (from the brief):
//   • specialist stars stay narrow (few or no secondaries),
//   • versatile players earn breadth,
//   • elite tier does NOT imply versatility,
//   • this is data only — no gameplay effect, no penalties.
//
// Uncurated players fall back to deriveRoleSuitability(). Role-key / value
// validity is enforced downstream by validate.js (db:validate fails on typos).
// ---------------------------------------------------------------------------

// playerId → { <secondary role>: 1|2, ... }   (primary role added as 3 in code)
const OVERRIDE_SECONDARIES = {
  // ---- Legends: goalkeepers --------------------------------------------------
  casillas: { 'Shot Stopper': 2, 'Sweeper Keeper': 1 },
  buffon: { 'Shot Stopper': 2, 'Sweeper Keeper': 1 },
  schmeichel: { 'Big Match Keeper': 2, 'Sweeper Keeper': 1 },
  vandersar: { 'Shot Stopper': 2, 'Big Match Keeper': 2 },
  kahn: { 'Big Match Keeper': 2 },
  valdes: { 'Shot Stopper': 2 },
  ricardo: { 'Big Match Keeper': 1 },

  // ---- Legends: full-backs / wing-backs -------------------------------------
  cafu: { 'Attacking Wingback': 2, 'Balanced Fullback': 2, 'Touchline Winger': 1 },
  danialves: { 'Attacking Wingback': 2, 'Balanced Fullback': 1, 'Touchline Winger': 1 },
  lahm: { 'Attacking Fullback': 2, 'Defensive Fullback': 2, 'Balanced Wingback': 2, 'Tempo Controller': 1 },
  zanetti: { 'Defensive Fullback': 2, 'Balanced Wingback': 2, 'Defensive Wingback': 2, 'Ball Winner': 1 },
  robertocarlos: { 'Attacking Wingback': 2, 'Touchline Winger': 1, 'Balanced Fullback': 1 },
  ashleycole: { 'Balanced Fullback': 2, 'Balanced Wingback': 2, 'Defensive Wingback': 2, 'Attacking Fullback': 1 },

  // ---- Legends: centre-backs ------------------------------------------------
  cannavaro: { 'Ball-Playing Defender': 1 },
  maldini: { 'Ball-Playing Defender': 2, 'Defensive Fullback': 2, 'Balanced Fullback': 1 },
  ramos: { 'Defensive Leader': 2, 'Defensive Fullback': 1 },
  puyol: { 'Ball-Playing Defender': 1, 'Defensive Fullback': 1 },
  beckenbauer: { 'Defensive Leader': 2, 'Tempo Controller': 2, 'Defensive Shield': 1 },
  pepe: { 'Ball-Playing Defender': 1 },
  desailly: { 'Defensive Shield': 2, 'Ball-Playing Defender': 1 },
  costacurta: { 'Ball-Playing Defender': 1 },
  ferdinand: { 'Defensive Leader': 2 },
  thuram: { 'Defensive Fullback': 2, 'Balanced Fullback': 1 },

  // ---- Legends: defensive / deep midfield -----------------------------------
  makelele: { 'Ball Winner': 2 },
  pirlo: { 'Final Passer': 2, 'Defensive Shield': 1 },
  gattuso: { 'Defensive Shield': 2, 'Box-to-Box Engine': 1 },
  deschamps: { 'Ball Winner': 2, 'Tempo Controller': 1 },
  xabialonso: { 'Defensive Shield': 2, 'Final Passer': 2 },
  yaya: { 'Defensive Shield': 2, 'Ball Winner': 1, 'Tempo Controller': 1 },
  vidal: { 'Ball Winner': 2, 'Defensive Shield': 1 },
  khedira: { 'Ball Winner': 2, 'Defensive Shield': 1 },
  keane: { 'Box-to-Box Engine': 2, 'Defensive Shield': 2 },
  vieira: { 'Ball Winner': 2, 'Defensive Shield': 2 },

  // ---- Legends: central midfield --------------------------------------------
  xavi: { 'Final Passer': 2, 'Creative Magician': 1 },
  iniesta: { 'Creative Magician': 2, 'Tempo Controller': 2, 'Inside Forward': 1 },
  modric: { 'Box-to-Box Engine': 2, 'Final Passer': 2 },
  kroos: { 'Final Passer': 2, 'Defensive Shield': 1 },
  gerrard: { 'Final Passer': 2, 'Ball Winner': 1, 'Tempo Controller': 1 },
  lampard: { 'Final Passer': 2, 'Creative Magician': 1 },
  ballack: { 'Final Passer': 1, 'Ball Winner': 1 },
  seedorf: { 'Tempo Controller': 2, 'Box-to-Box Engine': 2, 'Creative Magician': 1 },
  scholes: { 'Final Passer': 2, 'Box-to-Box Engine': 1 },
  davids: { 'Box-to-Box Engine': 2, 'Defensive Shield': 1 },
  deco: { 'Creative Magician': 2, 'Tempo Controller': 1 },

  // ---- Legends: attacking midfield / playmakers -----------------------------
  ozil: { 'Creative Magician': 2, 'Inside Forward': 1 },
  kaka: { 'Creative Magician': 2, 'Inside Forward': 2, 'Final Passer': 1 },
  zidane: { 'Final Passer': 2, 'Link-Up Striker': 1 },
  ronaldinho: { 'Inside Forward': 2, 'Touchline Winger': 2, 'Final Passer': 1 },
  rivaldo: { 'Inside Forward': 2, 'Complete Striker': 1, 'Final Passer': 1 },
  fabregas: { 'Tempo Controller': 2, 'Creative Magician': 1 },
  cruyff: { 'Complete Striker': 2, 'Final Passer': 2, 'Inside Forward': 1 },
  delpiero: { 'Creative Magician': 2, 'Complete Striker': 2, 'Inside Forward': 1 },
  platini: { 'Creative Magician': 2, 'Box-to-Box Engine': 1 },

  // ---- Legends: wide forwards -----------------------------------------------
  robben: { 'Touchline Winger': 2, 'Direct Runner': 2 },
  ribery: { 'Inside Forward': 2, 'Direct Runner': 1 },
  bale: { 'Touchline Winger': 2, 'Direct Runner': 2, 'Complete Striker': 1 },
  ronaldo: { 'Complete Striker': 2, 'Box Finisher': 2, 'Touchline Winger': 1, 'Direct Runner': 1 },
  messi: { 'Inside Forward': 2, 'Final Passer': 2, 'Complete Striker': 1, 'Link-Up Striker': 1 },
  neymar: { 'Creative Magician': 2, 'Touchline Winger': 2, 'Direct Runner': 1 },
  eusebio: { 'Complete Striker': 2, 'Inside Forward': 1, 'Direct Runner': 1 },

  // ---- Legends: centre-forwards ---------------------------------------------
  henry: { 'Inside Forward': 2, 'Box Finisher': 2, 'Direct Runner': 1 },
  etoo: { 'Complete Striker': 2, 'Inside Forward': 1, 'Direct Runner': 1 },
  ibra: { 'Link-Up Striker': 2, 'Box Finisher': 2 },
  inzaghi: { 'Complete Striker': 1 },
  shevchenko: { 'Box Finisher': 2, 'Direct Runner': 1 },
  benzema: { 'Link-Up Striker': 2, 'Box Finisher': 2 },
  torres: { 'Complete Striker': 2, 'Direct Runner': 1 },
  owen: { 'Complete Striker': 1 },
  drogba: { 'Complete Striker': 2, 'Box Finisher': 2 },
  gerdmuller: {},
  vanbasten: { 'Box Finisher': 2 },
  romario: { 'Complete Striker': 2, 'Link-Up Striker': 1 },
  suarez: { 'Box Finisher': 2, 'Link-Up Striker': 2 },
  weah: { 'Box Finisher': 2, 'Direct Runner': 1 },
  vannistelrooy: { 'Complete Striker': 1 },
  crespo: { 'Complete Striker': 1 },
  raul: { 'Complete Striker': 2, 'Link-Up Striker': 1 },
  pele: { 'Box Finisher': 2, 'Creative Magician': 2, 'Link-Up Striker': 1 },
  nazario: { 'Box Finisher': 2, 'Direct Runner': 2 },
  distefano: { 'Box Finisher': 2, 'Creative Magician': 2, 'Link-Up Striker': 2 },
  stam: {},
  vidic: {},
  maradona: { 'Inside Forward': 2, 'Link-Up Striker': 2, 'Final Passer': 1 },

  // ---- Modern elite: goalkeepers --------------------------------------------
  alisson: { 'Shot Stopper': 2, 'Big Match Keeper': 2 },
  courtois: { 'Shot Stopper': 2 },
  donnarumma: { 'Shot Stopper': 2 },
  emimartinez: { 'Shot Stopper': 2, 'Sweeper Keeper': 1 },

  // ---- Modern elite: full-backs / wing-backs --------------------------------
  hakimi: { 'Attacking Wingback': 2, 'Touchline Winger': 2, 'Balanced Fullback': 1 },
  trent: { 'Attacking Wingback': 2, 'Final Passer': 2, 'Tempo Controller': 1, 'Balanced Fullback': 1 },
  kounde: { 'Defensive Fullback': 2, 'Defensive Leader': 2, 'Ball-Playing Defender': 1, 'Balanced Wingback': 1 },
  nunomendes: { 'Attacking Fullback': 2, 'Balanced Wingback': 2, 'Touchline Winger': 1 },

  // ---- Modern elite: centre-backs -------------------------------------------
  gvardiol: { 'Defensive Fullback': 2, 'Defensive Leader': 1, 'Balanced Fullback': 1 },
  vandijk: { 'Ball-Playing Defender': 2 },
  saliba: { 'Defensive Leader': 2 },
  bastoni: { 'Defensive Fullback': 2, 'Defensive Leader': 1 },
  marquinhos: { 'Defensive Leader': 2, 'Defensive Shield': 2, 'Ball Winner': 1 },
  dias: { 'Ball-Playing Defender': 1 },
  romero_c: { 'Ball-Playing Defender': 2 },

  // ---- Modern elite: defensive / central midfield ---------------------------
  rodri: { 'Defensive Shield': 2, 'Ball Winner': 1, 'Final Passer': 1 },
  caicedo: { 'Defensive Shield': 2, 'Box-to-Box Engine': 2 },
  rice: { 'Ball Winner': 2, 'Defensive Shield': 2 },
  vitinha: { 'Final Passer': 2, 'Box-to-Box Engine': 1, 'Defensive Shield': 1 },
  bellingham: { 'Creative Magician': 2, 'Final Passer': 1, 'Link-Up Striker': 1 },
  debruyne: { 'Creative Magician': 2, 'Tempo Controller': 1, 'Box-to-Box Engine': 1 },
  pedri: { 'Final Passer': 2, 'Creative Magician': 2 },
  valverde: { 'Ball Winner': 2, 'Touchline Winger': 1, 'Defensive Shield': 1 },
  tchouameni: { 'Ball Winner': 2, 'Defensive Leader': 2, 'Box-to-Box Engine': 1 },
  camavinga: { 'Ball Winner': 2, 'Defensive Shield': 1, 'Defensive Fullback': 1 },
  odegaard: { 'Creative Magician': 2, 'Tempo Controller': 1 },
  kimmich: { 'Final Passer': 2, 'Defensive Shield': 2, 'Balanced Fullback': 1 },
  mac_allister: { 'Tempo Controller': 2, 'Box-to-Box Engine': 1, 'Defensive Shield': 1 },
  barella: { 'Ball Winner': 2, 'Final Passer': 1 },
  bruno: { 'Creative Magician': 2, 'Box-to-Box Engine': 1 },
  enzo: { 'Tempo Controller': 2, 'Box-to-Box Engine': 2 },
  brunog: { 'Ball Winner': 2, 'Final Passer': 1, 'Tempo Controller': 1 },

  // ---- Modern elite: wide forwards / attacking mid --------------------------
  wirtz: { 'Final Passer': 2, 'Inside Forward': 2 },
  musiala: { 'Inside Forward': 2, 'Direct Runner': 1 },
  olise: { 'Creative Magician': 2, 'Touchline Winger': 2, 'Final Passer': 1 },
  salah: { 'Complete Striker': 2, 'Box Finisher': 1, 'Direct Runner': 1 },
  vinicius: { 'Direct Runner': 2, 'Touchline Winger': 2, 'Complete Striker': 1 },
  saka: { 'Touchline Winger': 2, 'Direct Runner': 1 },
  rodrygo: { 'Direct Runner': 2, 'Complete Striker': 1, 'Touchline Winger': 1 },
  yamal: { 'Creative Magician': 2, 'Touchline Winger': 1 },
  raphinha: { 'Touchline Winger': 2, 'Direct Runner': 1 },
  kvara: { 'Creative Magician': 2, 'Direct Runner': 2, 'Touchline Winger': 1 },
  foden: { 'Inside Forward': 2, 'Final Passer': 1 },
  palmer: { 'Creative Magician': 2, 'Inside Forward': 2 },
  dembele: { 'Direct Runner': 2, 'Touchline Winger': 2, 'Complete Striker': 1 },

  // ---- Modern elite: centre-forwards ----------------------------------------
  haaland: { 'Complete Striker': 2 },
  mbappe: { 'Inside Forward': 2, 'Box Finisher': 2, 'Direct Runner': 2 },
  kane: { 'Link-Up Striker': 2, 'Box Finisher': 2, 'Final Passer': 1 },
  lautaro: { 'Box Finisher': 2, 'Link-Up Striker': 1 },
  osimhen: { 'Complete Striker': 2, 'Direct Runner': 1 },
  isak: { 'Box Finisher': 2, 'Direct Runner': 1 },
  julianalvarez: { 'Link-Up Striker': 2, 'Box Finisher': 2, 'Inside Forward': 1 },
  gabrielmagalhaes: { 'Ball-Playing Defender': 1 },

  // ---- Modern stars & tactical specialists ----------------------------------
  // Goalkeepers
  oblak: { 'Big Match Keeper': 2 },
  terstegen: { 'Shot Stopper': 2 },
  maignan: { 'Shot Stopper': 2, 'Big Match Keeper': 1 },
  ederson: { 'Shot Stopper': 1 },
  neuer: { 'Shot Stopper': 2, 'Big Match Keeper': 2 },
  raya: { 'Shot Stopper': 2 },
  pickford: { 'Shot Stopper': 2, 'Big Match Keeper': 1 },
  // Full-backs / wing-backs (also populate the scarce Defensive Wingback role)
  dumfries: { 'Attacking Fullback': 2, 'Balanced Wingback': 2, 'Defensive Wingback': 1, 'Touchline Winger': 1 },
  frimpong: { 'Touchline Winger': 2, 'Attacking Fullback': 2, 'Balanced Wingback': 1 },
  theo: { 'Attacking Wingback': 2, 'Balanced Fullback': 1, 'Defensive Fullback': 1 },
  robertson: { 'Attacking Wingback': 2, 'Balanced Fullback': 1 },
  cucurella: { 'Defensive Fullback': 2, 'Balanced Wingback': 2, 'Defensive Wingback': 2, 'Defensive Leader': 1 },
  grimaldo: { 'Attacking Fullback': 2, 'Touchline Winger': 1, 'Balanced Wingback': 1 },
  davies: { 'Attacking Fullback': 2, 'Touchline Winger': 2, 'Direct Runner': 1 },
  dimarco: { 'Attacking Fullback': 2, 'Balanced Wingback': 2, 'Defensive Wingback': 1 },
  cambiaso: { 'Balanced Wingback': 2, 'Attacking Fullback': 2, 'Defensive Wingback': 1 },
  udogie: { 'Attacking Fullback': 2, 'Balanced Wingback': 1, 'Defensive Wingback': 1 },
  raum: { 'Attacking Fullback': 2, 'Balanced Wingback': 2, 'Defensive Wingback': 1 },
  timber: { 'Defensive Fullback': 2, 'Balanced Wingback': 2, 'Defensive Wingback': 2, 'Ball-Playing Defender': 1 },
  james_r: { 'Attacking Wingback': 2, 'Balanced Wingback': 1, 'Defensive Shield': 1 },
  // Centre-backs
  rudiger: { 'Ball-Playing Defender': 2, 'Defensive Fullback': 1 },
  konate: { 'Ball-Playing Defender': 1 },
  araujo: { 'Defensive Fullback': 2, 'Ball-Playing Defender': 1 },
  stones: { 'Defensive Shield': 2, 'Defensive Leader': 2, 'Tempo Controller': 1 },
  akanji: { 'Defensive Fullback': 2, 'Defensive Leader': 1 },
  // Deep / defensive midfield specialists
  locatelli: { 'Ball Winner': 2, 'Tempo Controller': 2 },
  rubenneves: { 'Tempo Controller': 2, 'Final Passer': 1 },
  hjulmand: { 'Ball Winner': 2 },
  zubimendi: { 'Defensive Shield': 2, 'Ball Winner': 1 },
  calhanoglu: { 'Final Passer': 2, 'Defensive Shield': 1 },
  kante: { 'Defensive Shield': 2, 'Box-to-Box Engine': 2 },
  zakaria: { 'Defensive Shield': 2, 'Box-to-Box Engine': 1 },
  joaoneves: { 'Box-to-Box Engine': 2, 'Defensive Shield': 1 },
  baleba: { 'Box-to-Box Engine': 2, 'Defensive Shield': 1 },
  gravenberch: { 'Ball Winner': 1, 'Defensive Shield': 1 },
  tonali: { 'Box-to-Box Engine': 2, 'Ball Winner': 1, 'Defensive Shield': 1 },
  brozovic: { 'Defensive Shield': 2, 'Ball Winner': 1 },
  // Central / attacking midfield
  gavi: { 'Ball Winner': 1, 'Creative Magician': 1 },
  frenkie: { 'Final Passer': 2, 'Box-to-Box Engine': 2, 'Defensive Shield': 1 },
  szoboszlai: { 'Inside Forward': 1, 'Final Passer': 1, 'Touchline Winger': 1 },
  mctominay: { 'Ball Winner': 1, 'Link-Up Striker': 1 },
  xavisimons: { 'Inside Forward': 2, 'Final Passer': 1 },
  olmo: { 'Final Passer': 2, 'Inside Forward': 2 },
  griezmann: { 'Creative Magician': 2, 'Complete Striker': 2, 'Inside Forward': 1 },
  dybala: { 'Inside Forward': 2, 'Link-Up Striker': 2, 'Final Passer': 1 },
  isco: { 'Final Passer': 2, 'Tempo Controller': 1 },
  // Wide forwards (incl. touchline specialists)
  son: { 'Direct Runner': 2, 'Complete Striker': 1, 'Touchline Winger': 1 },
  leao: { 'Inside Forward': 2, 'Touchline Winger': 2 },
  pulisic: { 'Touchline Winger': 2, 'Direct Runner': 1 },
  mahrez: { 'Creative Magician': 2, 'Touchline Winger': 1 },
  doku: { 'Direct Runner': 2, 'Inside Forward': 1 },
  nico: { 'Inside Forward': 2, 'Direct Runner': 1 },
  trincao: { 'Inside Forward': 2 },
  mitoma: { 'Touchline Winger': 2, 'Direct Runner': 1 },
  luisdiaz: { 'Direct Runner': 2, 'Touchline Winger': 1 },
  gordon: { 'Direct Runner': 2, 'Touchline Winger': 1 },
  // Forwards
  lewandowski: { 'Complete Striker': 2, 'Link-Up Striker': 1 },
  gyokeres: { 'Box Finisher': 2, 'Direct Runner': 1 },
  sesko: { 'Complete Striker': 2, 'Direct Runner': 1 },
  lukaku: { 'Box Finisher': 2, 'Link-Up Striker': 2 },
  watkins: { 'Box Finisher': 2, 'Direct Runner': 1 },
  havertz: { 'Complete Striker': 2, 'Box Finisher': 1 },
  kudus: { 'Creative Magician': 1, 'Direct Runner': 1 },
  mbeumo: { 'Direct Runner': 2, 'Complete Striker': 1 },
  cunha: { 'Complete Striker': 2, 'Inside Forward': 1 },
  guirassy: { 'Complete Striker': 2 },
}

export const CURATED_ROLE_IDS = new Set(Object.keys(OVERRIDE_SECONDARIES))

// Build the full sparse map for a curated player: primary role natural (3) plus
// the authored secondaries (clamped to ≤2). Returns null for uncurated players.
export function curatedRoleSuitability(p) {
  const sec = OVERRIDE_SECONDARIES[p.id]
  if (!sec) return null
  const map = { [p.primaryRole]: 3 }
  for (const [role, lvl] of Object.entries(sec)) {
    if (role === p.primaryRole) continue
    map[role] = Math.min(2, lvl)
  }
  return map
}
