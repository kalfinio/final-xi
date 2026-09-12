// ---------------------------------------------------------------------------
// Position-correction scope for the R2 release.
//
// These named groups are product/catalogue decisions, not claims that every
// excluded position is factually impossible. In particular, the borderline
// group records conservative, uncertain eligibility calls that should be
// revisited when stronger recent senior-usage evidence is available.
// ---------------------------------------------------------------------------

export const LIVE_R2_POSITION_RESTORATIONS = Object.freeze({
  tchouameni: 'CB',
  vinicius: 'ST',
  leao: 'ST',
  merino: 'ST',
})

export const MASTER_ONLY_POSITION_CORRECTIONS = Object.freeze({
  collins: 'RB',
  mosquera: 'RB',
  gnabry: 'ST',
  martinelli: 'ST',
})

export const CONFIRMED_POSITION_REMOVALS = Object.freeze({
  cucurella: 'CB',
  theo: 'CB',
  walker: 'CB',
  bastoni: 'LB',
  schlotterbeck: 'LB',
  murillo: 'LB',
  ndicka: 'LB',
  pautorres: 'LB',
  inacio: 'LB',
  yoro: 'RB',
  bisseck: 'RB',
  marquinhos: 'CDM',
  joelinton: 'ST',
  salah: 'ST',
  yildiz: 'ST',
  thuram_m: 'LW',
  julianalvarez: 'LW',
  embolo: 'RW',
  kane: 'CAM',
  yamal: 'CAM',
  kvara: 'CAM',
  estevao: 'CAM',
})

export const BORDERLINE_POSITION_EXCLUSIONS = Object.freeze({
  endo: 'CB',
  schouten: 'CB',
  lisandro: 'LB',
  vandeven: 'LB',
  camavinga: 'LB',
  militao: 'RB',
  trent: 'CM',
  lewisskelly: 'CM',
  rodrygo: 'ST',
  gordon: 'ST',
  richarlison: 'LW',
})

export const POSITION_DECISION_NOTE = Object.freeze({
  live: 'Current 341-member R2 catalogue restorations.',
  masterOnly: 'Corrected in the master database for a future catalogue; not live R2 members.',
  confirmed: 'Confirmed removals under the regular senior-position eligibility rule.',
  borderline: 'Conservative, uncertain catalogue exclusions; not definitively disproven positions.',
})
