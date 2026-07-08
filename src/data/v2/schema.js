// ---------------------------------------------------------------------------
// Player Database V2 — controlled vocabularies (Phase A).
//
// This module is the single source of truth for every enum the V2 data uses.
// Validators import from here so content can never drift from the schema.
// Nothing here touches gameplay/determinism — it is data-definition only.
// ---------------------------------------------------------------------------

// Position vocabulary — identical to the game's existing slot labels so the
// adapter never has to translate between two position systems.
export const POSITIONS = ['GK', 'RB', 'LB', 'CB', 'RWB', 'LWB', 'CDM', 'CM', 'CAM', 'RM', 'LM', 'RW', 'LW', 'ST']

// Position → coarse type (mirrors POS_TYPE in data.js).
export const POS_TYPE = {
  GK: 'GK',
  RB: 'DEF', LB: 'DEF', CB: 'DEF', RWB: 'MID', LWB: 'MID',
  CDM: 'MID', CM: 'MID', CAM: 'MID', RM: 'MID', LM: 'MID',
  RW: 'ATT', LW: 'ATT', ST: 'ATT',
}
export const posTypeOf = (pos) => POS_TYPE[pos]

// Tactical role keys — exactly the game's approved Final XI role names, so the
// adapter can map a V2 player's primaryRole straight onto the legacy `role`.
//
// Each key must describe a distinct TACTICAL FUNCTION (how a player operates on
// the pitch). "Big Game Scorer" was removed from this taxonomy in the Phase A
// remediation: it describes clutch/pressure BEHAVIOUR (when a player delivers),
// not a tactical function, and is already represented in V2 by the Character
// "Big Stage" + the derived `big_game_player` tag. It survives ONLY inside the
// frozen legacy engine (data.js et al.), where it is a V1 role with real
// scoring dependencies; it is intentionally not a V2 role surface. See
// LEGACY_PRESSURE_DESCRIPTORS + PHASE_A_REMEDIATION_REPORT.md §14.
export const ROLE_KEYS = [
  // GK
  'Shot Stopper', 'Sweeper Keeper', 'Big Match Keeper',
  // Defence
  'Defensive Leader', 'Ball-Playing Defender',
  'Attacking Fullback', 'Balanced Fullback', 'Defensive Fullback',
  'Attacking Wingback', 'Balanced Wingback', 'Defensive Wingback',
  // Midfield
  'Defensive Shield', 'Ball Winner', 'Tempo Controller', 'Box-to-Box Engine', 'Final Passer',
  // Wide / Attacking Mid
  'Creative Magician', 'Inside Forward', 'Touchline Winger', 'Direct Runner',
  // Strikers
  'Complete Striker', 'Box Finisher', 'Link-Up Striker',
]
export const ROLE_KEY_SET = new Set(ROLE_KEYS)

// Legacy-only descriptors deliberately excluded from the V2 tactical role
// taxonomy (they encode pressure/clutch behaviour, not tactical function).
export const LEGACY_PRESSURE_DESCRIPTORS = ['Big Game Scorer']

// Role suitability levels (future Tactical HQ; stored sparsely per player).
// 3 = natural, 2 = accomplished, 1 = unconvincing.
export const ROLE_SUITABILITY_VALUES = [1, 2, 3]
export const ROLE_SUITABILITY_SET = new Set(ROLE_SUITABILITY_VALUES)

// Signatures — a controlled behavioural vocabulary. Deliberately small so
// players are differentiated rather than every star owning every good trait.
export const SIGNATURES = [
  // Passing
  'Line Breaker', 'Final Ball', 'Tempo Setter', 'Switch Specialist',
  // Movement
  'Inside Threat', 'Touchline Runner', 'Late Arrival', 'Pocket Finder', 'Overlap Instinct',
  // Finishing
  'Early Finisher', 'Distance Threat', 'Composed Finisher', 'Aerial Target', 'One-Touch Threat',
  // Defending
  'Front-Foot Defender', 'Duel Hunter', 'Lane Reader', 'Recovery Pace', 'Box Guardian',
  // Goalkeeping
  'Shot Blocker', 'Sweeper Instinct', 'Distribution Range',
]
export const SIGNATURE_SET = new Set(SIGNATURES)

// Character — career-behaviour archetypes (future morale/events; data only).
export const CHARACTERS = [
  'Standard Bearer', 'Relentless', 'Career Climber', 'Club Heart', 'Big Stage',
  'Quiet Pro', 'Firebrand', 'Free Spirit', 'Competitor', 'Mentor', 'Confidence Player', 'Maverick',
]
export const CHARACTER_SET = new Set(CHARACTERS)

// Development profile — future Player Evolutions (data only).
export const DEV_PROFILES = ['high_growth', 'developing', 'prime', 'late_bloomer', 'veteran', 'decline_risk']
export const DEV_PROFILE_SET = new Set(DEV_PROFILES)

export const ERAS = ['modern', 'legend']
export const ERA_SET = new Set(ERAS)

// Game tier — a coarse quality band for catalogue weighting / squad diversity.
// This is a Final XI design judgement, NOT market value or transfer fee.
export const TIERS = ['goat', 'goat_candidate', 'elite', 'star', 'quality', 'squad', 'prospect']
export const TIER_SET = new Set(TIERS)

// Transfer-intel statuses + confidence bands (research metadata, not gameplay).
export const TRANSFER_STATUSES = ['confirmed', 'here_we_go', 'advanced', 'high_confidence_rumour']
export const CONFIDENCE_BANDS = ['near_certain', 'high']
export const SOURCE_TYPES = [
  'official_club', 'official_league', 'transfermarkt_completed',
  'fabrizio_here_we_go', 'fabrizio_advanced', 'transfermarkt_rumour', 'tier_one_reporter',
]

// The GOAT set is a hard product invariant — exactly these four, no fifth.
export const GOAT_REQUIRED = ['messi', 'ronaldo', 'maradona', 'pele']

// Sentinel for a player with no club (free agent / retired-in-fiction).
export const FREE_AGENT_CLUB_ID = 'free_agent'
