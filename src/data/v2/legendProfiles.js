// ---------------------------------------------------------------------------
// Curated legend profiles (Phase A remediation, Tasks 5 + 6).
//
// Migrated legends previously received GENERIC, role-templated signatures (every
// centre-back got the same pair) and a hash-seeded character. That was the main
// source of the signature clustering the audit flagged. Here we hand-author a
// small, DISTINCTIVE signature set and a conservative character for each legend,
// based on well-known public playing identity — never gossip, never anything
// defamatory. Both are data only (no gameplay effect).
//
// Any signature must be in schema SIGNATURE_SET and any character in
// CHARACTER_SET; db:validate fails on a typo. Uncurated ids fall back to the
// role templates in index.js.
// ---------------------------------------------------------------------------

// id → 2–3 distinctive signatures
export const LEGEND_SIGNATURES = {
  // Goalkeepers
  casillas: ['Shot Blocker', 'Box Guardian'],
  buffon: ['Shot Blocker', 'Box Guardian'],
  schmeichel: ['Shot Blocker', 'Distribution Range', 'Box Guardian'],
  vandersar: ['Sweeper Instinct', 'Distribution Range', 'Box Guardian'],
  kahn: ['Shot Blocker', 'Box Guardian'],
  valdes: ['Sweeper Instinct', 'Distribution Range'],
  ricardo: ['Shot Blocker'],
  // Full-backs / wing-backs
  cafu: ['Overlap Instinct', 'Recovery Pace', 'Touchline Runner'],
  danialves: ['Overlap Instinct', 'Final Ball', 'Touchline Runner'],
  lahm: ['Lane Reader', 'Overlap Instinct', 'Tempo Setter'],
  zanetti: ['Recovery Pace', 'Duel Hunter', 'Overlap Instinct'],
  robertocarlos: ['Overlap Instinct', 'Distance Threat', 'Recovery Pace'],
  ashleycole: ['Recovery Pace', 'Duel Hunter', 'Lane Reader'],
  maldini: ['Lane Reader', 'Front-Foot Defender'],
  // Centre-backs
  cannavaro: ['Lane Reader', 'Recovery Pace', 'Duel Hunter'],
  ramos: ['Aerial Target', 'Duel Hunter', 'Line Breaker'],
  puyol: ['Duel Hunter', 'Aerial Target', 'Front-Foot Defender'],
  beckenbauer: ['Line Breaker', 'Tempo Setter', 'Lane Reader'],
  pepe: ['Duel Hunter', 'Front-Foot Defender', 'Aerial Target'],
  desailly: ['Duel Hunter', 'Front-Foot Defender'],
  costacurta: ['Lane Reader', 'Front-Foot Defender'],
  stam: ['Duel Hunter', 'Aerial Target', 'Front-Foot Defender'],
  vidic: ['Duel Hunter', 'Aerial Target', 'Front-Foot Defender'],
  ferdinand: ['Lane Reader', 'Line Breaker', 'Recovery Pace'],
  thuram: ['Recovery Pace', 'Lane Reader', 'Duel Hunter'],
  // Defensive / deep midfield
  makelele: ['Lane Reader', 'Duel Hunter', 'Recovery Pace'],
  pirlo: ['Tempo Setter', 'Final Ball', 'Switch Specialist'],
  gattuso: ['Duel Hunter', 'Front-Foot Defender'],
  deschamps: ['Lane Reader', 'Duel Hunter'],
  xabialonso: ['Switch Specialist', 'Tempo Setter', 'Line Breaker'],
  yaya: ['Line Breaker', 'Late Arrival', 'Duel Hunter'],
  vidal: ['Duel Hunter', 'Late Arrival', 'Recovery Pace'],
  khedira: ['Late Arrival', 'Duel Hunter', 'Lane Reader'],
  keane: ['Duel Hunter', 'Front-Foot Defender', 'Late Arrival'],
  vieira: ['Duel Hunter', 'Line Breaker', 'Recovery Pace'],
  // Central midfield
  xavi: ['Tempo Setter', 'Pocket Finder', 'Final Ball'],
  iniesta: ['Pocket Finder', 'Line Breaker', 'Composed Finisher'],
  modric: ['Tempo Setter', 'Switch Specialist', 'Line Breaker'],
  kroos: ['Switch Specialist', 'Tempo Setter', 'Final Ball'],
  gerrard: ['Distance Threat', 'Late Arrival', 'Line Breaker'],
  lampard: ['Late Arrival', 'Distance Threat', 'Composed Finisher'],
  ballack: ['Late Arrival', 'Aerial Target', 'Distance Threat'],
  seedorf: ['Distance Threat', 'Switch Specialist', 'Line Breaker'],
  scholes: ['Final Ball', 'Distance Threat', 'Switch Specialist'],
  davids: ['Duel Hunter', 'Recovery Pace', 'Line Breaker'],
  deco: ['Pocket Finder', 'Final Ball', 'Tempo Setter'],
  // Attacking midfield / playmakers
  ozil: ['Final Ball', 'Pocket Finder', 'Switch Specialist'],
  kaka: ['Recovery Pace', 'Line Breaker', 'Composed Finisher'],
  zidane: ['Pocket Finder', 'Final Ball', 'One-Touch Threat'],
  ronaldinho: ['Pocket Finder', 'Inside Threat', 'Final Ball'],
  rivaldo: ['Distance Threat', 'Inside Threat', 'Composed Finisher'],
  fabregas: ['Final Ball', 'Pocket Finder', 'Late Arrival'],
  cruyff: ['Pocket Finder', 'Line Breaker', 'Composed Finisher'],
  delpiero: ['Composed Finisher', 'Distance Threat', 'Pocket Finder'],
  platini: ['Late Arrival', 'Final Ball', 'Aerial Target'],
  // Wide forwards
  robben: ['Inside Threat', 'Recovery Pace', 'Composed Finisher'],
  ribery: ['Touchline Runner', 'Pocket Finder', 'Inside Threat'],
  bale: ['Recovery Pace', 'Distance Threat', 'Inside Threat'],
  ronaldo: ['Aerial Target', 'Composed Finisher', 'Distance Threat'],
  messi: ['Pocket Finder', 'Inside Threat', 'Final Ball'],
  neymar: ['Pocket Finder', 'Inside Threat', 'Touchline Runner'],
  eusebio: ['Distance Threat', 'Composed Finisher', 'Recovery Pace'],
  // Centre-forwards
  henry: ['Recovery Pace', 'Composed Finisher', 'Inside Threat'],
  etoo: ['Recovery Pace', 'Composed Finisher', 'Duel Hunter'],
  ibra: ['Aerial Target', 'One-Touch Threat', 'Composed Finisher'],
  inzaghi: ['Early Finisher', 'Composed Finisher'],
  shevchenko: ['Recovery Pace', 'Composed Finisher', 'One-Touch Threat'],
  benzema: ['One-Touch Threat', 'Pocket Finder', 'Composed Finisher'],
  torres: ['Recovery Pace', 'Composed Finisher', 'Early Finisher'],
  owen: ['Recovery Pace', 'Early Finisher', 'Composed Finisher'],
  drogba: ['Aerial Target', 'Duel Hunter', 'One-Touch Threat'],
  gerdmuller: ['Early Finisher', 'One-Touch Threat', 'Aerial Target'],
  vanbasten: ['Aerial Target', 'Composed Finisher', 'One-Touch Threat'],
  romario: ['Early Finisher', 'Composed Finisher', 'Pocket Finder'],
  suarez: ['Composed Finisher', 'Duel Hunter', 'One-Touch Threat'],
  weah: ['Recovery Pace', 'Composed Finisher', 'Duel Hunter'],
  vannistelrooy: ['Early Finisher', 'Composed Finisher', 'Aerial Target'],
  crespo: ['Composed Finisher', 'Aerial Target', 'Early Finisher'],
  raul: ['Composed Finisher', 'Pocket Finder', 'Early Finisher'],
  pele: ['Composed Finisher', 'Aerial Target', 'One-Touch Threat'],
  nazario: ['Recovery Pace', 'Composed Finisher', 'One-Touch Threat'],
  distefano: ['Line Breaker', 'Composed Finisher', 'Late Arrival'],
  maradona: ['Pocket Finder', 'Inside Threat', 'Final Ball'],
}

// id → conservative character (well-known public identity; never gossip).
export const LEGEND_CHARACTERS = {
  casillas: 'Standard Bearer', buffon: 'Standard Bearer', schmeichel: 'Firebrand',
  vandersar: 'Mentor', kahn: 'Competitor', valdes: 'Competitor', ricardo: 'Confidence Player',
  cafu: 'Big Stage', danialves: 'Free Spirit', lahm: 'Quiet Pro', zanetti: 'Club Heart',
  cannavaro: 'Standard Bearer', robertocarlos: 'Big Stage', ashleycole: 'Competitor',
  maldini: 'Standard Bearer', ramos: 'Firebrand', puyol: 'Club Heart', beckenbauer: 'Standard Bearer',
  pepe: 'Firebrand', desailly: 'Competitor', costacurta: 'Quiet Pro', stam: 'Competitor',
  vidic: 'Competitor', ferdinand: 'Confidence Player', thuram: 'Mentor',
  makelele: 'Quiet Pro', pirlo: 'Free Spirit', gattuso: 'Firebrand', deschamps: 'Standard Bearer',
  xabialonso: 'Quiet Pro', yaya: 'Big Stage', vidal: 'Firebrand', khedira: 'Quiet Pro',
  keane: 'Firebrand', vieira: 'Standard Bearer',
  xavi: 'Standard Bearer', iniesta: 'Quiet Pro', modric: 'Relentless', kroos: 'Quiet Pro',
  gerrard: 'Club Heart', lampard: 'Relentless', ballack: 'Competitor', seedorf: 'Confidence Player',
  scholes: 'Quiet Pro', davids: 'Firebrand', deco: 'Confidence Player',
  ozil: 'Free Spirit', kaka: 'Standard Bearer', zidane: 'Big Stage', ronaldinho: 'Free Spirit',
  rivaldo: 'Confidence Player', fabregas: 'Competitor', cruyff: 'Maverick', delpiero: 'Club Heart',
  platini: 'Standard Bearer',
  robben: 'Relentless', ribery: 'Free Spirit', bale: 'Big Stage', ronaldo: 'Big Stage',
  messi: 'Quiet Pro', neymar: 'Free Spirit', eusebio: 'Standard Bearer',
  henry: 'Confidence Player', etoo: 'Relentless', ibra: 'Maverick', inzaghi: 'Competitor',
  shevchenko: 'Competitor', benzema: 'Confidence Player', torres: 'Confidence Player',
  owen: 'Confidence Player', drogba: 'Big Stage', gerdmuller: 'Quiet Pro', vanbasten: 'Standard Bearer',
  romario: 'Maverick', suarez: 'Competitor', weah: 'Standard Bearer', vannistelrooy: 'Competitor',
  crespo: 'Quiet Pro', raul: 'Club Heart', pele: 'Big Stage', nazario: 'Big Stage',
  distefano: 'Standard Bearer', maradona: 'Maverick',
}
