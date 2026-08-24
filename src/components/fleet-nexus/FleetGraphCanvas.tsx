'use client'

import { useEffect, useRef, useCallback } from 'react'
import type { FleetGraph, FleetHealth, FleetLens, FleetNode } from '@/types/fleet-nexus'

const HC: Record<FleetHealth, string> = {
  ok: '#22c55e',
  warn: '#f59e0b',
  error: '#ef4444',
  unknown: '#6b7280',
}

const KIND_RING: Record<string, string> = {
  platform: '#D4AF37',
  deployment: '#79c0ff',
  'chain-deployment': '#7ee787',
  hq: '#D4AF37',
  entity: '#79c0ff',
  client: '#a78bfa',
  edge: '#d2a8ff',
  service: '#7ee787',
  infra: '#ffa657',
  datastore: '#3aa6f0',
  external: '#8b98a9',
}

interface SimNode {
  id: string
  label: string
  r: number
  x: number
  y: number
  vx: number
  vy: number
  n: FleetNode
}

interface SimEdge {
  s: SimNode
  t: SimNode
  w: number
}

interface FleetGraphCanvasProps {
  graph: FleetGraph
  lens: FleetLens
  selectedId: string | null
  affected: Set<string>
  onSelect: (id: string | null) => void
}

export function healthGlyph(h: FleetHealth): string {
  if (h === 'ok') return '✓'
  if (h === 'warn') return '⚠'
  if (h === 'error') return '✕'
  return '?'
}

export function kindGlyph(kind: string): string {
  switch (kind) {
    case 'platform':
    case 'hq':
      return '◆'
    case 'client':
    case 'entity':
      return '●'
    case 'service':
    case 'deployment':
    case 'chain-deployment':
      return '■'
    case 'infra':
    case 'datastore':
      return '▲'
    case 'edge':
    case 'external':
      return '○'
    default:
      return '·'
  }
}

function shortLabel(label: string): string {
  const t = label.trim()
  return t.length > 16 ? `${t.slice(0, 15)}…` : t
}

function isBottleneck(n: FleetNode): boolean {
  return (
    n.p95 > 600 ||
    n.cpu > 85 ||
    (typeof n.meta.queueDepth === 'number' && n.meta.queueDepth > 50) ||
    (typeof n.meta.errorCount === 'number' && n.meta.errorCount > 10) ||
    n.health === 'error'
  )
}

function layout(graph: FleetGraph): { nodes: SimNode[]; edges: SimEdge[] } {
  const maxW = Math.max(...graph.nodes.map((n) => n.weight), 1)
  const N: SimNode[] = graph.nodes.map((n, i) => {
    const a = (i / Math.max(graph.nodes.length, 1)) * Math.PI * 2
    return {
      id: n.id,
      label: n.label,
      r: 10 + Math.sqrt(n.weight / maxW) * 36,
      x: Math.cos(a) * 280 + (Math.random() - 0.5) * 40,
      y: Math.sin(a) * 280 + (Math.random() - 0.5) * 40,
      vx: 0,
      vy: 0,
      n,
    }
  })
  const byId = new Map(N.map((d) => [d.id, d]))
  const maxEdge = Math.max(...graph.edges.map((e) => e.weight), 1)
  const E: SimEdge[] = graph.edges
    .map((e) => {
      const s = byId.get(e.source)
      const t = byId.get(e.target)
      if (!s || !t) return null
      return { s, t, w: 0.6 + Math.sqrt(e.weight / maxEdge) * 4 }
    })
    .filter((e): e is SimEdge => e !== null)

  for (let it = 0; it < 420; it++) {
    for (let i = 0; i < N.length; i++) {
      const A = N[i]
      for (let j = i + 1; j < N.length; j++) {
        const B = N[j]
        const dx = A.x - B.x
        const dy = A.y - B.y
        const d2 = dx * dx + dy * dy || 0.01
        const d = Math.sqrt(d2)
        const f = 2800 / d2
        A.vx += (dx / d) * f
        A.vy += (dy / d) * f
        B.vx -= (dx / d) * f
        B.vy -= (dy / d) * f
      }
    }
    for (const e of E) {
      const dx = e.t.x - e.s.x
      const dy = e.t.y - e.s.y
      const d = Math.sqrt(dx * dx + dy * dy) || 0.01
      const f = (d - 140) * 0.02
      e.s.vx += (dx / d) * f
      e.s.vy += (dy / d) * f
      e.t.vx -= (dx / d) * f
      e.t.vy -= (dy / d) * f
    }
    for (const n of N) {
      n.vx += -n.x * 0.002
      n.vy += -n.y * 0.002
      n.x += Math.max(-12, Math.min(12, n.vx))
      n.y += Math.max(-12, Math.min(12, n.vy))
      n.vx *= 0.86
      n.vy *= 0.86
    }
  }
  return { nodes: N, edges: E }
}

export function FleetGraphCanvas({
  graph,
  lens,
  selectedId,
  affected,
  onSelect,
}: FleetGraphCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const simRef = useRef<{ nodes: SimNode[]; edges: SimEdge[] }>({ nodes: [], edges: [] })
  const viewRef = useRef({ x: 0, y: 0, k: 1 })
  const dragRef = useRef<{
    node: SimNode | null
    pan: boolean
    last: { px: number; py: number } | null
    down: { px: number; py: number } | null
    moved: boolean
  }>({ node: null, pan: false, last: null, down: null, moved: false })

  const nodeFill = useCallback(
    (nd: SimNode): string => {
      const n = nd.n
      if (selectedId) {
        if (nd.id === selectedId) return '#D4AF37'
        if (affected.has(nd.id)) return HC.error
        return '#223'
      }
      if (lens === 'health') return HC[n.health]
      if (lens === 'bottle') return isBottleneck(n) ? HC.error : '#2a3340'
      if (lens === 'drift') {
        const fv = graph.fleetVersion
        return fv && n.version && n.version !== fv ? HC.warn : '#2a3340'
      }
      return '#79c0ff'
    },
    [selectedId, affected, lens, graph.fleetVersion]
  )

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    const w = canvas.width / dpr
    const h = canvas.height / dpr
    const view = viewRef.current
    const { nodes: N, edges: E } = simRef.current

    ctx.clearRect(0, 0, w, h)
    ctx.save()
    ctx.translate(view.x, view.y)
    ctx.scale(view.k, view.k)

    for (const e of E) {
      const hot =
        selectedId &&
        (e.t.id === selectedId ||
          (affected.has(e.s.id) && (affected.has(e.t.id) || e.t.id === selectedId)))
      ctx.beginPath()
      ctx.moveTo(e.s.x, e.s.y)
      ctx.lineTo(e.t.x, e.t.y)
      ctx.strokeStyle = selectedId
        ? hot
          ? 'rgba(239,68,68,0.85)'
          : 'rgba(120,130,150,0.05)'
        : 'rgba(120,130,150,0.18)'
      ctx.lineWidth = e.w
      ctx.stroke()
    }

    for (const nd of N) {
      const dim = Boolean(selectedId && nd.id !== selectedId && !affected.has(nd.id))
      ctx.globalAlpha = dim ? 0.18 : 1
      ctx.beginPath()
      ctx.arc(nd.x, nd.y, nd.r, 0, Math.PI * 2)
      ctx.fillStyle = nodeFill(nd)
      ctx.fill()
      ctx.lineWidth = 2
      ctx.strokeStyle = KIND_RING[nd.n.kind] || '#0a0a0f'
      ctx.stroke()

      // Colorblind-safe: every visible node has health glyph + kind glyph + short label.
      ctx.globalAlpha = dim ? 0.35 : 0.95
      ctx.fillStyle = '#0a0a0f'
      ctx.font = `bold ${nd.r >= 14 ? 11 : 8}px ui-sans-serif, system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(healthGlyph(nd.n.health), nd.x, nd.y)

      ctx.globalAlpha = dim ? 0.35 : 1
      ctx.fillStyle = '#ffffff'
      ctx.font = '10px ui-sans-serif, system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.lineWidth = 3
      ctx.strokeStyle = 'rgba(10,10,15,0.92)'
      const caption = `${kindGlyph(nd.n.kind)} ${shortLabel(nd.label)}`
      const labelY = nd.y + nd.r + 10
      ctx.strokeText(caption, nd.x, labelY)
      ctx.fillText(caption, nd.x, labelY)
      ctx.globalAlpha = 1
    }
    ctx.restore()
  }, [selectedId, affected, nodeFill])

  const fit = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    const N = simRef.current.nodes
    if (N.length === 0) {
      viewRef.current = { x: canvas.width / dpr / 2, y: canvas.height / dpr / 2, k: 1 }
      draw()
      return
    }
    let a = 1e9,
      b = 1e9,
      c = -1e9,
      d = -1e9
    for (const n of N) {
      a = Math.min(a, n.x - n.r)
      b = Math.min(b, n.y - n.r)
      c = Math.max(c, n.x + n.r)
      d = Math.max(d, n.y + n.r)
    }
    const w = canvas.width / dpr
    const h = canvas.height / dpr
    viewRef.current.k = Math.min(Math.min(w / (c - a + 100), h / (d - b + 100)), 1.5)
    viewRef.current.x = w / 2 - ((a + c) / 2) * viewRef.current.k
    viewRef.current.y = h / 2 - ((b + d) / 2) * viewRef.current.k
    draw()
  }, [draw])

  const resize = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    const r = canvas.getBoundingClientRect()
    canvas.width = r.width * dpr
    canvas.height = r.height * dpr
    const ctx = canvas.getContext('2d')
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    draw()
  }, [draw])

  useEffect(() => {
    simRef.current = layout(graph)
    resize()
    fit()
  }, [graph, resize, fit])

  useEffect(() => {
    draw()
  }, [draw, selectedId, affected, lens])

  useEffect(() => {
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [resize])

  function toWorld(px: number, py: number) {
    const v = viewRef.current
    return { x: (px - v.x) / v.k, y: (py - v.y) / v.k }
  }

  function hit(px: number, py: number): SimNode | null {
    const p = toWorld(px, py)
    const N = simRef.current.nodes
    for (let i = N.length - 1; i >= 0; i--) {
      const n = N[i]
      const dx = p.x - n.x
      const dy = p.y - n.y
      if (dx * dx + dy * dy <= n.r * n.r) return n
    }
    return null
  }

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 h-full w-full cursor-grab touch-none bg-[radial-gradient(circle_at_32%_22%,#121927_0,#0a0a0f_62%)]"
      aria-label="Fleet Nexus force graph"
      onPointerDown={(ev) => {
        const canvas = canvasRef.current
        if (!canvas) return
        canvas.setPointerCapture(ev.pointerId)
        const r = canvas.getBoundingClientRect()
        const px = ev.clientX - r.left
        const py = ev.clientY - r.top
        dragRef.current.down = { px, py }
        dragRef.current.moved = false
        const n = hit(px, py)
        if (n) {
          dragRef.current.node = n
        } else {
          dragRef.current.pan = true
          dragRef.current.last = { px, py }
        }
      }}
      onPointerMove={(ev) => {
        const canvas = canvasRef.current
        if (!canvas) return
        const r = canvas.getBoundingClientRect()
        const px = ev.clientX - r.left
        const py = ev.clientY - r.top
        const d = dragRef.current
        if (!d.node && !d.pan) return
        d.moved = true
        if (d.node) {
          const p = toWorld(px, py)
          d.node.x = p.x
          d.node.y = p.y
          draw()
        } else if (d.last) {
          viewRef.current.x += px - d.last.px
          viewRef.current.y += py - d.last.py
          d.last = { px, py }
          draw()
        }
      }}
      onPointerUp={(ev) => {
        const d = dragRef.current
        if (d.down && !d.moved) {
          const n = hit(d.down.px, d.down.py)
          onSelect(n ? n.id : null)
        }
        d.node = null
        d.pan = false
        d.last = null
        d.down = null
        try {
          canvasRef.current?.releasePointerCapture(ev.pointerId)
        } catch {
          /* ignore */
        }
      }}
      onWheel={(ev) => {
        ev.preventDefault()
        const canvas = canvasRef.current
        if (!canvas) return
        const r = canvas.getBoundingClientRect()
        const px = ev.clientX - r.left
        const py = ev.clientY - r.top
        const f = ev.deltaY < 0 ? 1.1 : 0.9
        const v = viewRef.current
        const wx = (px - v.x) / v.k
        const wy = (py - v.y) / v.k
        v.k = Math.max(0.15, Math.min(4, v.k * f))
        v.x = px - wx * v.k
        v.y = py - wy * v.k
        draw()
      }}
    />
  )
}

export { isBottleneck, HC }
