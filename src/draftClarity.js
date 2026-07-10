import { getV2PlayerById } from './data/v2'
import { auraLabel } from './data'

export const DRAFT_GUIDANCE_KEY = 'finalxi.draftClaritySeen.v1'

export const CLUB_IDENTITIES = [
  {
    key: 'control',
    name: 'CONTROL',
    slogan: 'Own the ball.',
    description: 'Keep possession, control midfield, and create patiently.',
    values: ['Technical security', 'Press resistance', 'Passing quality', 'Midfield control', 'Intelligent positioning'],
    tradeoff: 'Can lack direct threat without enough pace or penetration.',
    inspiredBy: 'Guardiola-style positional football',
  },
  {
    key: 'press',
    name: 'PRESS',
    slogan: 'Win it back fast.',
    description: 'Pressure the opponent aggressively and attack before they can reset.',
    values: ['Work rate', 'Ball recovery', 'Pressing activity', 'Recovery speed', 'Transition ability'],
    tradeoff: 'Can leave space when the press is beaten.',
    inspiredBy: 'Klopp-era Liverpool-style intensity',
  },
  {
    key: 'transition',
    name: 'TRANSITION',
    slogan: 'Attack the space.',
    description: 'Win the ball and move forward before the defence is organized.',
    values: ['Pace', 'Direct progression', 'Ball carrying', 'Vertical passing', 'Runs behind'],
    tradeoff: 'Can struggle against deep, compact opponents.',
    inspiredBy: 'Fast counterattacking football',
  },
  {
    key: 'fortress',
    name: 'FORTRESS',
    slogan: 'Protect first. Punish mistakes.',
    description: 'Stay compact, defend dangerous areas, and attack efficiently.',
    values: ['Defensive structure', 'Duel strength', 'Aerial quality', 'Goalkeeper quality', 'Discipline'],
    tradeoff: 'Can have a lower attacking ceiling.',
    inspiredBy: 'Simeone-style compact football',
  },
]

export const CLUB_IDENTITY_KEYS = CLUB_IDENTITIES.map((identity) => identity.key)
export const clubIdentity = (key) => CLUB_IDENTITIES.find((identity) => identity.key === key) || null

const ROLE_ARCHETYPE = {
  'Shot Stopper': 'SHOT STOPPER',
  'Sweeper Keeper': 'SWEEPER KEEPER',
  'Big Match Keeper': 'BIG-MATCH KEEPER',
  'Defensive Leader': 'DEFENSIVE LEADER',
  'Ball-Playing Defender': 'BALL-PLAYING DEFENDER',
  'Attacking Fullback': 'ATTACKING FULLBACK',
  'Balanced Fullback': 'TWO-WAY FULLBACK',
  'Defensive Fullback': 'DEFENSIVE FULLBACK',
  'Attacking Wingback': 'ATTACKING WINGBACK',
  'Balanced Wingback': 'TWO-WAY WINGBACK',
  'Defensive Wingback': 'DEFENSIVE WINGBACK',
  'Defensive Shield': 'MIDFIELD ANCHOR',
  'Ball Winner': 'BALL-WINNING MIDFIELDER',
  'Tempo Controller': 'CREATIVE CONTROLLER',
  'Box-to-Box Engine': 'TRANSITION ENGINE',
  'Final Passer': 'CENTRAL CREATOR',
  'Creative Magician': 'CREATIVE ATTACKER',
  'Inside Forward': 'INSIDE FORWARD',
  'Touchline Winger': 'DIRECT WINGER',
  'Direct Runner': 'TRANSITION RUNNER',
  'Complete Striker': 'COMPLETE STRIKER',
  'Box Finisher': 'BOX FINISHER',
  'Link-Up Striker': 'LINK-UP STRIKER',
  'Big Game Scorer': 'BOX FINISHER',
}

const POSITION_ARCHETYPE = {
  GK: 'GOALKEEPER', CB: 'CENTRAL DEFENDER', RB: 'FULLBACK', LB: 'FULLBACK',
  RWB: 'WINGBACK', LWB: 'WINGBACK', CDM: 'MIDFIELD ANCHOR', CM: 'CENTRAL MIDFIELDER',
  CAM: 'CENTRAL CREATOR', RM: 'WIDE MIDFIELDER', LM: 'WIDE MIDFIELDER',
  RW: 'WINGER', LW: 'WINGER', ST: 'STRIKER',
}

const ROLE_STRENGTHS = {
  'Shot Stopper': ['Stops difficult shots', 'Protects the goal'],
  'Sweeper Keeper': ['Sweeps behind the defence', 'Starts attacks from goal'],
  'Big Match Keeper': ['Handles pressure well', 'Makes decisive saves'],
  'Defensive Leader': ['Organizes the defence', 'Dominates dangerous areas'],
  'Ball-Playing Defender': ['Builds from the back', 'Breaks lines with passes'],
  'Attacking Fullback': ['Overlaps into attack', 'Provides attacking width'],
  'Balanced Fullback': ['Supports both phases', 'Protects the flank'],
  'Defensive Fullback': ['Shuts down the flank', 'Maintains defensive shape'],
  'Attacking Wingback': ['Drives forward wide', 'Creates from the flank'],
  'Balanced Wingback': ['Provides width', 'Recovers into defence'],
  'Defensive Wingback': ['Protects wide areas', 'Maintains defensive shape'],
  'Defensive Shield': ['Protects the defence', 'Reads danger early'],
  'Ball Winner': ['Wins the ball back', 'Disrupts opposition attacks'],
  'Tempo Controller': ['Controls possession', 'Sets the passing rhythm'],
  'Box-to-Box Engine': ['Covers large spaces', 'Supports both boxes'],
  'Final Passer': ['Creates decisive chances', 'Unlocks central spaces'],
  'Creative Magician': ['Creates from tight spaces', 'Beats defenders on the ball'],
  'Inside Forward': ['Attacks inside spaces', 'Carries a goal threat'],
  'Touchline Winger': ['Stretches the pitch', 'Creates from wide areas'],
  'Direct Runner': ['Attacks space behind', 'Dangerous in transition'],
  'Complete Striker': ['Links attacking play', 'Finishes chances'],
  'Box Finisher': ['Finds space in the box', 'Finishes quickly'],
  'Link-Up Striker': ['Connects the attack', 'Creates space for runners'],
  'Big Game Scorer': ['Finds decisive goals', 'Handles big moments'],
}

const SIGNATURE_STRENGTH = {
  'Line Breaker': 'Breaks defensive lines',
  'Final Ball': 'Creates decisive chances',
  'Tempo Setter': 'Controls possession',
  'Switch Specialist': 'Switches play accurately',
  'Inside Threat': 'Attacks inside spaces',
  'Touchline Runner': 'Stretches the pitch',
  'Late Arrival': 'Times runs into the box',
  'Pocket Finder': 'Finds space between lines',
  'Overlap Instinct': 'Overlaps into attack',
  'Early Finisher': 'Finishes before pressure arrives',
  'Distance Threat': 'Threatens from distance',
  'Composed Finisher': 'Finishes calmly',
  'Aerial Target': 'Provides an aerial threat',
  'One-Touch Threat': 'Finishes quickly',
  'Front-Foot Defender': 'Defends proactively',
  'Duel Hunter': 'Wins physical duels',
  'Lane Reader': 'Reads danger early',
  'Recovery Pace': 'Recovers ground quickly',
  'Box Guardian': 'Protects the penalty area',
  'Shot Blocker': 'Stops difficult shots',
  'Sweeper Instinct': 'Sweeps behind the defence',
  'Distribution Range': 'Starts attacks from goal',
}

const POSITION_STRENGTHS = {
  GK: ['Protects the goal', 'Handles the penalty area'],
  DEF: ['Protects defensive areas', 'Competes in duels'],
  MID: ['Supports midfield play', 'Connects the team'],
  ATT: ['Threatens the defence', 'Supports the attack'],
}

function sourceProfile(player) {
  return getV2PlayerById(player?.id) || null
}

const QUALITY_BY_TIER = {
  goat: 'ALL-TIME GREAT',
  goat_candidate: 'WORLD CLASS',
  elite: 'ELITE',
  star: 'STAR',
  quality: 'PROVEN',
  squad: 'SQUAD PLAYER',
  prospect: 'PROSPECT',
}

const LEGACY_QUALITY_BY_TAG = {
  current_superstar: 'STAR',
  modern_icon: 'STAR',
  premier_league_star: 'STAR',
  future_legend: 'RISING STAR',
  euro_legend: 'PROVEN',
  european_winner: 'PROVEN',
  world_cup_winner: 'PROVEN',
  serial_winner: 'PROVEN',
  final_scorer: 'PROVEN',
  euro_final_scorer: 'PROVEN',
}

export function playerQualityTier(player) {
  const aura = auraLabel(player)
  if (aura === 'GOAT') return { label: 'ALL-TIME GREAT', source: 'aura', sourceValue: aura }
  if (aura === 'GOAT Candidate') return { label: 'WORLD CLASS', source: 'aura', sourceValue: aura }
  const tier = sourceProfile(player)?.tier || null
  if (!tier) {
    const tag = (player.tags || []).find((key) => LEGACY_QUALITY_BY_TAG[key]) || null
    if (tag) return { label: LEGACY_QUALITY_BY_TAG[tag], source: 'legacy-tag', sourceValue: tag }
    if (player.era === 'legend') return { label: 'LEGEND', source: 'era', sourceValue: player.era }
  }
  return {
    label: QUALITY_BY_TIER[tier] || 'PROFILE UNAVAILABLE',
    source: tier ? 'tier' : 'missing',
    sourceValue: tier,
  }
}

export function playerSignatures(player) {
  const profile = sourceProfile(player)
  // Keep frozen legacy cards authoritative when the same id was re-authored
  // with a different V2 primary Role. Mismatched Signatures would otherwise
  // describe the V2 profile while Daily/Legends display the legacy Role.
  if (!profile || profile.primaryRole !== player.role) return []
  return [...(profile.signatures || [])]
}

export function playerRoleSuitability(player) {
  const profile = sourceProfile(player)
  // A legacy catalogue record can share an id with a re-authored V2 profile
  // whose primary role changed. In that case the visible legacy role remains
  // authoritative so Daily/Legends explanations never contradict the card.
  if (!profile || profile.primaryRole !== player.role) return { [player.role]: 3 }
  return { ...profile.roleSuitability }
}

export function playerArchetype(player) {
  return ROLE_ARCHETYPE[player?.role] || POSITION_ARCHETYPE[player?.primaryPos] || 'VERSATILE PLAYER'
}

export function playerKeyStrengths(player) {
  const candidates = [
    ...playerSignatures(player).map((signature) => SIGNATURE_STRENGTH[signature]).filter(Boolean),
    ...(ROLE_STRENGTHS[player?.role] || []),
    ...(POSITION_STRENGTHS[player?.posType] || []),
  ]
  const strengths = []
  for (const strength of candidates) {
    if (!strengths.includes(strength)) strengths.push(strength)
    if (strengths.length === 2) break
  }
  return strengths
}

const ROLE_AFFINITY = {
  control: {
    'Shot Stopper': 1, 'Sweeper Keeper': 3, 'Big Match Keeper': 1.5,
    'Defensive Leader': 1.5, 'Ball-Playing Defender': 3,
    'Attacking Fullback': 2, 'Balanced Fullback': 2.5, 'Defensive Fullback': 1.5,
    'Attacking Wingback': 2, 'Balanced Wingback': 2.5, 'Defensive Wingback': 1.5,
    'Defensive Shield': 2.5, 'Ball Winner': 1.5, 'Tempo Controller': 3,
    'Box-to-Box Engine': 2, 'Final Passer': 3, 'Creative Magician': 2.5,
    'Inside Forward': 2, 'Touchline Winger': 2, 'Direct Runner': 1,
    'Complete Striker': 2.5, 'Box Finisher': 1.5, 'Link-Up Striker': 3, 'Big Game Scorer': 1.5,
  },
  press: {
    'Shot Stopper': 1, 'Sweeper Keeper': 2.5, 'Big Match Keeper': 1,
    'Defensive Leader': 1.5, 'Ball-Playing Defender': 1.5,
    'Attacking Fullback': 2.5, 'Balanced Fullback': 2.5, 'Defensive Fullback': 1,
    'Attacking Wingback': 2.5, 'Balanced Wingback': 2.5, 'Defensive Wingback': 1,
    'Defensive Shield': 2, 'Ball Winner': 3, 'Tempo Controller': 1,
    'Box-to-Box Engine': 3, 'Final Passer': 1.5, 'Creative Magician': 1.5,
    'Inside Forward': 2.5, 'Touchline Winger': 2.5, 'Direct Runner': 3,
    'Complete Striker': 2, 'Box Finisher': 1.5, 'Link-Up Striker': 2.5, 'Big Game Scorer': 1.5,
  },
  transition: {
    'Shot Stopper': 1, 'Sweeper Keeper': 2, 'Big Match Keeper': 1,
    'Defensive Leader': 1.5, 'Ball-Playing Defender': 2,
    'Attacking Fullback': 2.5, 'Balanced Fullback': 1.5, 'Defensive Fullback': 1,
    'Attacking Wingback': 2.5, 'Balanced Wingback': 1.5, 'Defensive Wingback': 1,
    'Defensive Shield': 1.5, 'Ball Winner': 2, 'Tempo Controller': 0.5,
    'Box-to-Box Engine': 3, 'Final Passer': 2.5, 'Creative Magician': 1.5,
    'Inside Forward': 3, 'Touchline Winger': 2.5, 'Direct Runner': 3,
    'Complete Striker': 2.5, 'Box Finisher': 3, 'Link-Up Striker': 1, 'Big Game Scorer': 3,
  },
  fortress: {
    'Shot Stopper': 3, 'Sweeper Keeper': 1.5, 'Big Match Keeper': 3,
    'Defensive Leader': 3, 'Ball-Playing Defender': 2,
    'Attacking Fullback': 1, 'Balanced Fullback': 2.5, 'Defensive Fullback': 3,
    'Attacking Wingback': 1, 'Balanced Wingback': 2.5, 'Defensive Wingback': 3,
    'Defensive Shield': 3, 'Ball Winner': 2.5, 'Tempo Controller': 1.5,
    'Box-to-Box Engine': 2, 'Final Passer': 1.5, 'Creative Magician': 1,
    'Inside Forward': 1.5, 'Touchline Winger': 2, 'Direct Runner': 2,
    'Complete Striker': 2, 'Box Finisher': 2.5, 'Link-Up Striker': 1.5, 'Big Game Scorer': 2.5,
  },
}

const IDENTITY_SIGNATURES = {
  control: new Set(['Line Breaker', 'Final Ball', 'Tempo Setter', 'Switch Specialist', 'Pocket Finder', 'Distribution Range']),
  press: new Set(['Duel Hunter', 'Recovery Pace', 'Front-Foot Defender', 'Lane Reader', 'Late Arrival', 'Sweeper Instinct']),
  transition: new Set(['Line Breaker', 'Inside Threat', 'Touchline Runner', 'Late Arrival', 'Recovery Pace', 'Early Finisher']),
  fortress: new Set(['Duel Hunter', 'Lane Reader', 'Box Guardian', 'Aerial Target', 'Shot Blocker', 'Front-Foot Defender']),
}

export const IDENTITY_FIT_LABELS = ['EXCELLENT', 'GOOD', 'MODERATE', 'WEAK']

function suitabilityWord(level) {
  if (level >= 3) return 'Natural'
  if (level >= 2) return 'Accomplished'
  return 'Alternative'
}

function fitLabel(score) {
  if (score >= 6.35) return 'EXCELLENT'
  if (score >= 4.75) return 'GOOD'
  if (score >= 3) return 'MODERATE'
  return 'WEAK'
}

export function calculateIdentityFit(player, identityKey) {
  const identity = clubIdentity(identityKey)
  if (!identity) return null
  const suitability = playerRoleSuitability(player)
  const primaryAffinity = ROLE_AFFINITY[identityKey][player.role] || 0
  const primaryRole = { source: 'primary-role', key: player.role, level: 3, value: primaryAffinity * 2 }
  const supportingRole = Object.entries(suitability)
    .filter(([role, level]) => role !== player.role && level === 2)
    .map(([role, level]) => {
      const affinity = ROLE_AFFINITY[identityKey][role] || 0
      const value = Math.min(0.75, Math.max(0, affinity - primaryAffinity) * 0.5)
      return { source: 'supporting-role', key: role, level, value }
    })
    .sort((a, b) => b.value - a.value || a.key.localeCompare(b.key))[0] || null
  const signatureContributions = playerSignatures(player)
    .filter((signature) => IDENTITY_SIGNATURES[identityKey].has(signature))
    .slice(0, 3)
    .map((signature) => ({ source: 'signature', key: signature, value: 0.35 }))
  const contributors = [primaryRole, supportingRole, ...signatureContributions].filter((item) => item?.value > 0)
  const score = Number(contributors.reduce((sum, item) => sum + item.value, 0).toFixed(2))
  const why = contributors.slice(0, 3).map((item) => {
    if (item.source === 'primary-role') return `Natural ${item.key} profile`
    if (item.source === 'supporting-role') return `${suitabilityWord(item.level)} ${item.key} option`
    return `${item.key} tendency`
  })
  return {
    identityKey,
    identityName: identity.name,
    label: fitLabel(score),
    score,
    contributors,
    why,
  }
}

const ROLE_TRADEOFF = {
  'Shot Stopper': 'Offers less build-up range',
  'Attacking Fullback': 'Leaves more space behind',
  'Attacking Wingback': 'Leaves more space behind',
  'Defensive Fullback': 'Offers less attacking width',
  'Defensive Wingback': 'Offers less attacking width',
  'Defensive Shield': 'Offers less attacking threat',
  'Ball Winner': 'Can leave position to chase the ball',
  'Tempo Controller': 'Offers less direct running',
  'Final Passer': 'Adds less defensive protection',
  'Creative Magician': 'Adds less defensive protection',
  'Inside Forward': 'Offers less touchline width',
  'Touchline Winger': 'Offers less central threat',
  'Direct Runner': 'Less suited to slow possession',
  'Box Finisher': 'Offers less build-up link',
  'Link-Up Striker': 'Offers less penalty-box threat',
}

const ROLE_FUNCTIONS = {
  'Shot Stopper': ['goalkeeping'], 'Sweeper Keeper': ['goalkeeping', 'build-up'], 'Big Match Keeper': ['goalkeeping'],
  'Defensive Leader': ['defensive-structure'], 'Ball-Playing Defender': ['defensive-structure', 'build-up'],
  'Attacking Fullback': ['width', 'progression'], 'Balanced Fullback': ['width', 'defensive-structure'], 'Defensive Fullback': ['defensive-structure'],
  'Attacking Wingback': ['width', 'progression'], 'Balanced Wingback': ['width', 'defensive-structure'], 'Defensive Wingback': ['width', 'defensive-structure'],
  'Defensive Shield': ['midfield-protection'], 'Ball Winner': ['midfield-protection', 'recovery'], 'Tempo Controller': ['build-up', 'control'],
  'Box-to-Box Engine': ['progression', 'recovery'], 'Final Passer': ['creation'], 'Creative Magician': ['creation'],
  'Inside Forward': ['penetration', 'finishing'], 'Touchline Winger': ['width', 'creation'], 'Direct Runner': ['penetration', 'progression'],
  'Complete Striker': ['finishing', 'creation'], 'Box Finisher': ['finishing'], 'Link-Up Striker': ['creation'], 'Big Game Scorer': ['finishing'],
}

const FUNCTION_LABEL = {
  goalkeeping: 'GOALKEEPER SECURITY',
  'defensive-structure': 'DEFENSIVE STRUCTURE',
  'midfield-protection': 'DEFENSIVE PROTECTION',
  'build-up': 'BUILD-UP QUALITY',
  recovery: 'BALL RECOVERY',
  width: 'WIDTH',
  progression: 'FORWARD PROGRESSION',
  control: 'MIDFIELD CONTROL',
  creation: 'CENTRAL CREATION',
  penetration: 'RUNS IN BEHIND',
  finishing: 'PENALTY-BOX THREAT',
}

const LATE_NEED_PRIORITY = ['midfield-protection', 'creation', 'width', 'progression']

export function playerFunctions(player) {
  return [...(ROLE_FUNCTIONS[player?.role] || [])]
}

export function analyzeSquadNeed({ squad, candidate, pickIndex, formationSlots = [] }) {
  const selected = (squad || []).filter((selection) => selection?.player).map((selection) => selection.player)
  const phaseIndex = Number.isInteger(pickIndex) ? pickIndex : selected.length
  if (phaseIndex < 4 || selected.length < 4) return null

  const candidateArchetype = playerArchetype(candidate)
  const sameArchetypeCount = selected.filter((player) => playerArchetype(player) === candidateArchetype).length
  const coveredFunctions = new Set(selected.flatMap(playerFunctions))
  const candidateFunctions = playerFunctions(candidate)
  const formationNeedsWidth = formationSlots.some((slot) => ['RB', 'LB', 'RWB', 'LWB', 'RM', 'LM', 'RW', 'LW'].includes(slot))
  const latePriority = LATE_NEED_PRIORITY.filter((fn) => fn !== 'width' || formationNeedsWidth)

  if (phaseIndex >= 8) {
    const missing = latePriority.find((fn) => !coveredFunctions.has(fn) && candidateFunctions.includes(fn))
    if (missing) return { kind: 'weakness', label: 'FILLS A WEAKNESS', detail: FUNCTION_LABEL[missing], source: missing }
  }
  if (sameArchetypeCount >= 2) {
    return { kind: 'covered', label: 'ROLE ALREADY COVERED', detail: candidateArchetype, source: candidateArchetype }
  }
  const added = candidateFunctions.find((fn) => !coveredFunctions.has(fn))
  if (added) return { kind: 'adds', label: 'ADDS TO THE SQUAD', detail: FUNCTION_LABEL[added], source: added }
  return null
}

export function playerTradeoff(player, { fit = null, squadNeed = null } = {}) {
  if (squadNeed?.kind === 'covered') return 'Similar profile already covered'
  if (fit?.label === 'WEAK') return `Less suited to the ${fit.identityName} identity`
  return ROLE_TRADEOFF[player?.role] || null
}

export function buildPickFeedback({ player, identityKey, squad, pickIndex, formationSlots }) {
  const fit = calculateIdentityFit(player, identityKey)
  const squadNeed = analyzeSquadNeed({ squad, candidate: player, pickIndex, formationSlots })
  const strengths = playerKeyStrengths(player)
  const positives = []
  if (squadNeed?.kind === 'weakness' || squadNeed?.kind === 'adds') positives.push(`Adds ${squadNeed.detail.toLowerCase()}`)
  if (fit && (fit.label === 'EXCELLENT' || fit.label === 'GOOD')) positives.push(`${fit.label === 'EXCELLENT' ? 'Strong' : 'Good'} fit for ${fit.identityName}`)
  if (positives.length < 2 && strengths[0]) positives.push(strengths[0])
  return {
    title: `${player.name} added`,
    positives: [...new Set(positives)].slice(0, 2),
    warning: playerTradeoff(player, { fit, squadNeed }),
  }
}

export function hasSeenDraftGuidance(storage = globalThis.localStorage) {
  try { return storage?.getItem(DRAFT_GUIDANCE_KEY) === '1' } catch { return false }
}

export function acknowledgeDraftGuidance(storage = globalThis.localStorage) {
  try { storage?.setItem(DRAFT_GUIDANCE_KEY, '1'); return true } catch { return false }
}
