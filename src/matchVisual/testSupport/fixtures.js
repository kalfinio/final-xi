import { FORMATIONS, getEligiblePlayers } from '../../data'
import { controlledM1Match } from '../../matchEngineM1Calibration'
import { deriveM1EventMetrics } from '../../matchEngineM1'
import { buildMatchDetail } from '../../matchEngine'
import { createCanonicalMatchView } from '../adapter.js'
import { compileVisualProgram } from '../compile.js'
import { VISUAL_V2_2 } from '../versions.js'

export function squadFor(formation = '4-3-3') {
  const used = []
  return FORMATIONS[formation].slots.map((slot) => {
    const player = getEligiblePlayers(slot, used, 'modern')[0]
    used.push(player.id)
    return { slot, player }
  })
}

// Boundary fixtures live only in test support. Production never constructs
// goals, shot outcomes, assists, metrics or MatchDetail through these helpers.
export function fixtureView(specs = [{}], { formation = '4-3-3', penalties = null } = {}) {
  const squad = squadFor(formation)
  const gk = squad[0].player
  const cb = squad.find(({ slot }) => slot === 'CB').player
  const midfielder = squad.find(({ slot }) => slot === 'CM' || slot === 'CDM').player
  const st = squad.find(({ slot }) => slot === 'ST').player
  const winger = squad.find(({ slot }) => ['RW', 'RM', 'RWB'].includes(slot))?.player || midfielder
  const byPosition = { GK: gk, CB: cb, CM: midfielder, ST: st, RW: winger }
  const match = structuredClone(controlledM1Match({ seed: 7, squad }))
  const score = { us: 0, opp: 0 }
  match.causalEvents = specs.map((spec, index) => {
    const side = spec.side || 'us', outcome = spec.outcome || 'goal', route = spec.route || 'central_buildup'
    const shot = ['goal', 'saved', 'off_target'].includes(outcome)
    const creator = byPosition[spec.creator || 'CM'], shooter = byPosition[spec.shooter || 'ST']
    const scoreBefore = { ...score }
    if (outcome === 'goal') score[side]++
    const minute = spec.minute ?? 10 + index
    const stoppage = spec.stoppage ?? null
    return {
      id: spec.id || `case-${index}`, side, route, minute, minuteLabel: stoppage ? `${minute}+${stoppage}` : String(minute), stoppage,
      window: minute <= 45 ? 3 : 6, phase: 'middle', progression: shot ? 'success' : 'failed',
      chanceQuality: shot ? 'high' : null, xg: shot ? 0.2 : 0,
      creatorId: side === 'us' ? creator.id : null,
      creatorName: side === 'us' ? creator.name : spec.creatorName || 'Opponent Winger',
      shooterId: side === 'us' && shot ? shooter.id : null,
      shooterName: !shot ? null : side === 'us' ? shooter.name : spec.shooterName || 'Opponent Centre-Back',
      defenderId: side === 'opp' ? cb.id : null, keeperId: gk.id,
      outcome, goal: outcome === 'goal', onTarget: outcome === 'goal' || outcome === 'saved',
      cornerWon: outcome === 'cross_blocked', foulWon: outcome === 'foul_won', createsTransition: false,
      dangerousTransition: route === 'counterattack', highTurnover: route === 'pressing_recovery', controlWeight: 1,
      scoreBefore, scoreAfter: { ...score }, causes: { plan: [], roles: [], signatures: [], opponent: [] },
    }
  })
  match.events = match.causalEvents.filter((event) => event.goal).map((event) => ({
    minute: event.minute, side: event.side, scorer: event.shooterName,
    assist: event.creatorName === event.shooterName ? null : event.creatorName,
    label: null, causalEventId: event.id, route: event.route, chanceQuality: event.chanceQuality,
  }))
  match.goals = match.events
  match.eventMetrics = deriveM1EventMetrics(match.causalEvents)
  match.gf = score.us; match.ga = score.opp
  match.result = penalties ? (penalties.won ? 'pens-win' : 'pens-loss') : score.us > score.opp ? 'win' : score.us < score.opp ? 'loss' : 'draw'
  match.pens = penalties
  match.score = `${score.us}-${score.opp}`
  match.detail = buildMatchDetail({ match, matchNumber: 1 })
  return createCanonicalMatchView({ match, squad, formation })
}

export const footballProgram = (view) => compileVisualProgram(view, { visualEngineVersion: VISUAL_V2_2 })
