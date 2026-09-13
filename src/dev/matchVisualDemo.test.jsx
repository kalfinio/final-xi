import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { getVisualDemo } from './matchVisualDemo.js'
import MatchVisualLab from './MatchVisualLab.jsx'

describe('isolated development entry', () => {
  it('caches resolved programs across repeated renders and provides inspection outcomes', () => {
    const outcomes = new Set(), routes = new Set()
    for (const seed of [1, 7, 42, 99]) {
      const example = getVisualDemo(seed)
      expect(getVisualDemo(seed)).toBe(example)
      for (const event of example.view.events) { outcomes.add(event.outcome); routes.add(event.route) }
    }
    for (const outcome of ['goal', 'saved', 'off_target']) expect(outcomes.has(outcome)).toBe(true)
    expect(routes.has('cross') || routes.has('wide_overlap')).toBe(true)
  })
  it('renders accessible score, clock, commentary, selection and labelled transport controls', () => {
    const html = renderToStaticMarkup(<MatchVisualLab />)
    for (const label of ['Score', 'Match time', 'Canonical commentary', 'Next Highlight', 'Full Time', 'Replay', 'Inspect actor', '1x speed', '2x speed', '4x speed']) expect(html).toContain(label)
    expect(html).toContain('Awaiting the first event.')
    expect(html).not.toContain('scores — assist')
  })
  it('gates the lazy entry with Vite DEV and leaves normal viewer sources untouched', () => {
    const entry = readFileSync(new URL('../main.jsx', import.meta.url), 'utf8')
    expect(entry).toContain("import.meta.env.DEV && new URLSearchParams(window.location.search).get('matchVisual') === 'v2'")
    expect(entry).toContain("import('./dev/MatchVisualLab.jsx')")
    for (const file of ['App.jsx', 'RunFlow.jsx', 'MatchCenter.jsx']) expect(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')).not.toContain('matchVisual')
  })
})
