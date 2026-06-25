import { useState, useMemo } from 'react'
import { buildMarkers, shapeLabel, buildTactics } from './tactics'

// View options for the tactical shape viewer.
const VIEWS = [
  { key: 'combined', label: 'Combined' },
  { key: 'inPossession', label: 'In Possession' },
  { key: 'outPossession', label: 'Out of Possession' },
  { key: 'both', label: 'Both' },
]

const POS_COLOR = {
  GK: '#c9a84c',
  DEF: '#f5f5f5',
  MID: '#f5f5f5',
  ATT: '#f5f5f5',
}

function Marker({ m, ghost }) {
  if (ghost) {
    return <circle cx={m.x} cy={m.y} r="2.6" fill="none" stroke="#64748b" strokeWidth="0.5" strokeDasharray="1.4 1.2" opacity="0.7" />
  }
  const fill = m.isGK ? '#c9a84c' : POS_COLOR[m.posType] || '#f5f5f5'
  return (
    <g>
      <circle cx={m.x} cy={m.y} r="3.1" fill={fill} stroke="#0c1a10" strokeWidth="0.5" />
      <text x={m.x} y={m.y + 1.1} textAnchor="middle" fontSize="2.7" fontWeight="700" fill="#0c1a10">{m.slot}</text>
      <text x={m.x} y={m.y - 4.2} textAnchor="middle" fontSize="3.1" fontWeight="700" fill="#f0f0f0" style={{ paintOrder: 'stroke' }} stroke="#0c1a10" strokeWidth="0.6">{m.label}</text>
      <text x={m.x} y={m.y + 6.4} textAnchor="middle" fontSize="2.5" fill="#c9a84c">{m.role}</text>
    </g>
  )
}

// Vertical top-down pitch (own goal at the bottom, attack toward the top).
function PitchSvg({ markers, ghostMarkers }) {
  return (
    <div className="rounded-lg overflow-hidden border border-border" style={{ background: '#0c1a10' }}>
      <svg viewBox="0 0 100 150" className="w-full block" style={{ aspectRatio: '100 / 150' }}>
        <defs>
          <linearGradient id="fxTac" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0e2417" />
            <stop offset="100%" stopColor="#0c1d12" />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="100" height="150" fill="url(#fxTac)" />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <rect key={i} x="0" y={i * 25} width="100" height="25" fill={i % 2 ? '#ffffff' : '#000000'} opacity={i % 2 ? 0.02 : 0.03} />
        ))}
        <g stroke="#9fe3bf" strokeOpacity="0.3" strokeWidth="0.35" fill="none">
          <rect x="3" y="3" width="94" height="144" />
          <line x1="3" y1="75" x2="97" y2="75" />
          <circle cx="50" cy="75" r="11" />
          <circle cx="50" cy="75" r="0.7" fill="#9fe3bf" fillOpacity="0.4" stroke="none" />
          {/* top goal (attacking) */}
          <rect x="30" y="3" width="40" height="16" />
          <rect x="41" y="3" width="18" height="6" />
          {/* bottom goal (own) */}
          <rect x="30" y="131" width="40" height="16" />
          <rect x="41" y="141" width="18" height="6" />
        </g>
        {ghostMarkers && ghostMarkers.map((m) => <Marker key={`g-${m.id}`} m={m} ghost />)}
        {markers.map((m) => <Marker key={m.id} m={m} />)}
      </svg>
    </div>
  )
}

function IdentityCard({ tactics }) {
  if (!tactics) return null
  return (
    <div className="mt-3 rounded-lg bg-card border border-border p-3">
      <div className="text-[10px] uppercase tracking-widest text-secondary mb-1">Tactical Identity</div>
      <div className="text-lg font-black text-gold tracking-tight mb-2">{tactics.identity}</div>
      <div className="grid grid-cols-2 gap-2 mb-2">
        <div className="rounded bg-surface border border-border px-2.5 py-1.5">
          <div className="text-[9px] uppercase tracking-wide text-secondary">In possession</div>
          <div className="font-bold text-primary tabular-nums">{tactics.inShape}</div>
        </div>
        <div className="rounded bg-surface border border-border px-2.5 py-1.5">
          <div className="text-[9px] uppercase tracking-wide text-secondary">Out of possession</div>
          <div className="font-bold text-primary tabular-nums">{tactics.outShape}</div>
        </div>
      </div>
      <div className="space-y-1 text-xs">
        <div className="flex gap-2"><span className="text-secondary shrink-0 w-20">Main strength</span><span className="text-success font-semibold">{tactics.strength}</span></div>
        <div className="flex gap-2"><span className="text-secondary shrink-0 w-20">Main weakness</span><span className="text-danger font-semibold">{tactics.weakness}</span></div>
      </div>
    </div>
  )
}

// Tactical Shape Viewer + Identity card. `formation` is the combined-view label.
export default function TacticalPitch({ squad, formation }) {
  const [view, setView] = useState('combined')
  const tactics = useMemo(() => buildTactics(squad, formation), [squad, formation])
  const compact = tactics?.flags?.exposed ? 0.4 : 1

  const { markers, ghostMarkers, shapeText } = useMemo(() => {
    if (view === 'both') {
      const inM = buildMarkers(squad, 'inPossession', compact)
      const outM = buildMarkers(squad, 'outPossession', compact)
      return { markers: inM, ghostMarkers: outM, shapeText: `${shapeLabel(inM)} / ${shapeLabel(outM)}` }
    }
    const m = buildMarkers(squad, view, compact)
    const text = view === 'combined' ? formation : shapeLabel(m)
    return { markers: m, ghostMarkers: null, shapeText: text }
  }, [view, squad, formation, compact])

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            onClick={() => setView(v.key)}
            className={`px-2 py-2 rounded-md text-xs font-bold border fx-press transition-colors ${view === v.key ? 'border-gold bg-gold/15 text-gold' : 'border-border bg-card text-secondary hover:text-primary'}`}
          >{v.label}</button>
        ))}
      </div>

      <div className="flex items-center justify-between mb-2 text-[11px]">
        <span className="text-secondary">{VIEWS.find((v) => v.key === view)?.label} shape</span>
        <span className="font-bold text-gold tabular-nums">{shapeText}</span>
      </div>

      <PitchSvg markers={markers} ghostMarkers={ghostMarkers} />

      {view === 'both' && (
        <div className="flex items-center justify-center gap-4 mt-2 text-[10px] text-secondary">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-primary inline-block" /> In possession</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full border border-slate-500 inline-block" /> Out of possession</span>
        </div>
      )}

      <IdentityCard tactics={tactics} />
    </div>
  )
}
