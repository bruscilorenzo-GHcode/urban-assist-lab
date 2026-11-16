/** Additive fabric layer: a canvas painted ABOVE the base map, below the
 *  story pins. It never replaces the map, it is off by default, and it can be
 *  inspected (node / edge / field zone) with a template justification.
 *
 *  `weave` is not implemented; only `filaments` and `field` exist. No
 *  automatic pulsing: with prefers-reduced-motion the layer is fully static. */

import * as L from 'leaflet'
import { RELATION_TYPES, type FabricConfig, type State } from '../core/state/types.js'

export interface FabricPick {
  kind: 'node' | 'edge' | 'zone'
  id: string
  title: string
  body: string
  storyId?: string
}

interface HoverState {
  kind: 'node' | 'edge'
  id: string
  x: number
  y: number
  label: string
}

const EDGE_LABELS: Record<string, string> = {
  proximity: 'proximity',
  place: 'place',
  cooccurrence: 'cooccurrence',
  topic: 'topic',
  semantic: 'semantic',
  author_community: 'author community',
}

function toRgba(hex: string, alpha: number): string {
  const value = hex.replace('#', '')
  if (value.length !== 6) return `rgba(0,0,0,${alpha})`
  const r = Number.parseInt(value.slice(0, 2), 16)
  const g = Number.parseInt(value.slice(2, 4), 16)
  const b = Number.parseInt(value.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

function metersToPixels(map: L.Map, meters: number, lat: number): number {
  const metersPerPixel = 156543.03392 * Math.cos((lat * Math.PI) / 180) / Math.pow(2, map.getZoom())
  return meters / Math.max(0.01, metersPerPixel)
}

function distanceToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1
  const dy = y2 - y1
  const lengthSq = dx * dx + dy * dy
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSq))
  const cx = x1 + t * dx
  const cy = y1 + t * dy
  return Math.hypot(px - cx, py - cy)
}

export class FabricOverlay {
  private readonly map: L.Map
  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D | null
  private readonly onPick: (pick: FabricPick) => void
  private state: State | null = null
  private config: FabricConfig | null = null
  private hover: HoverState | null = null
  private frame: number | null = null
  private destroyed = false

  private readonly schedule = () => {
    if (this.destroyed) return
    if (this.frame !== null) cancelAnimationFrame(this.frame)
    this.frame = requestAnimationFrame(() => {
      this.frame = null
      this.draw()
    })
  }

  private readonly onMove = (event: L.LeafletMouseEvent) => {
    if (!this.config?.enabled || this.config.opacity <= 0) return
    const pick = this.pickAt(event.containerPoint.x, event.containerPoint.y)
    const next = pick && pick.kind !== 'zone'
      ? { kind: pick.kind, id: pick.id, x: event.containerPoint.x, y: event.containerPoint.y, label: pick.title }
      : null
    const changed = (next?.id ?? null) !== (this.hover?.id ?? null)
    this.hover = next
    if (changed) this.schedule()
  }

  private readonly onLeave = () => {
    if (!this.hover) return
    this.hover = null
    this.schedule()
  }

  private readonly onClick = (event: MouseEvent) => {
    if (!this.config?.enabled || this.config.opacity <= 0) return
    const target = event.target as Element | null
    if (target?.closest('.leaflet-marker-icon, .leaflet-control, .au-fabric-label')) return
    const rect = this.canvas.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    const pick = this.pickAt(x, y)
    if (!pick) return
    event.preventDefault()
    event.stopPropagation()
    this.onPick(pick)
  }

  constructor(map: L.Map, onPick: (pick: FabricPick) => void) {
    this.map = map
    this.onPick = onPick
    this.canvas = document.createElement('canvas')
    this.canvas.className = 'au-fabric-canvas'
    this.canvas.setAttribute('aria-hidden', 'true')
    this.ctx = this.canvas.getContext('2d')
    const container = map.getContainer()
    container.appendChild(this.canvas)

    map.on('move zoom zoomend viewreset resize', this.schedule)
    map.on('mousemove', this.onMove)
    map.on('mouseout', this.onLeave)
    container.addEventListener('click', this.onClick, true)
    this.schedule()
  }

  setState(state: State | null): void {
    this.state = state
    this.schedule()
  }

  setConfig(config: FabricConfig): void {
    this.config = config
    this.canvas.style.visibility = config.enabled ? 'visible' : 'hidden'
    this.schedule()
  }

  destroy(): void {
    this.destroyed = true
    if (this.frame !== null) cancelAnimationFrame(this.frame)
    this.map.off('move zoom zoomend viewreset resize', this.schedule)
    this.map.off('mousemove', this.onMove)
    this.map.off('mouseout', this.onLeave)
    this.map.getContainer().removeEventListener('click', this.onClick, true)
    this.canvas.remove()
  }

  private enabledEdges(config: FabricConfig): State['fabric']['edges'] {
    if (!this.state) return []
    return this.state.fabric.edges.filter((edge) => config.relations[edge.type] !== false)
  }

  private draw(): void {
    const { canvas, ctx, map, config, state } = this
    if (!ctx) return
    const size = map.getSize()
    const dpr = typeof window === 'undefined' ? 1 : Math.max(1, window.devicePixelRatio || 1)
    if (canvas.width !== Math.round(size.x * dpr) || canvas.height !== Math.round(size.y * dpr)) {
      canvas.width = Math.round(size.x * dpr)
      canvas.height = Math.round(size.y * dpr)
      canvas.style.width = `${size.x}px`
      canvas.style.height = `${size.y}px`
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, size.x, size.y)
    if (!config || !state || !config.enabled || config.opacity <= 0) return

    canvas.dataset.reducedMotion = config.reducedMotion ? '1' : '0'
    const palette = config.palette.length ? config.palette : ['#000000']
    const nodePoint = new Map<string, L.Point>()
    for (const node of state.fabric.nodes) {
      if (!node.point) continue
      nodePoint.set(node.storyId, map.latLngToContainerPoint(node.point))
    }

    if (config.mode === 'field') {
      for (const zone of state.fabric.zones) {
        const point = map.latLngToContainerPoint(zone.center)
        const radius = Math.max(8, metersToPixels(map, config.fieldBandMeters, zone.center[0]))
        const color = palette[Math.min(palette.length - 1, 1)] ?? palette[0]!
        const alpha = config.opacity * (0.18 + 0.22 * zone.weight)
        const gradient = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius)
        gradient.addColorStop(0, toRgba(color, alpha))
        gradient.addColorStop(1, toRgba(color, 0))
        ctx.fillStyle = gradient
        ctx.beginPath()
        ctx.arc(point.x, point.y, radius, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    const edges = this.enabledEdges(config)
    for (const edge of edges) {
      const from = nodePoint.get(edge.from)
      const to = nodePoint.get(edge.to)
      if (!from || !to) continue
      const typeIndex = Math.max(0, RELATION_TYPES.indexOf(edge.type))
      const color = palette[typeIndex % palette.length] ?? palette[0]!
      const dim = edge.band === 'context' ? 0.28 : 1
      const alpha = config.opacity * dim * (0.18 + 0.62 * edge.weight)
      const width = 0.6 + 2.4 * edge.weight * config.thickness
      const dx = to.x - from.x
      const dy = to.y - from.y
      const length = Math.hypot(dx, dy) || 1
      const curve = length * 0.18 * config.curvature
      const cx = (from.x + to.x) / 2 - (dy / length) * curve
      const cy = (from.y + to.y) / 2 + (dx / length) * curve
      const hovered = this.hover?.kind === 'edge' && this.hover.id === edge.id

      if (config.halo > 0 || hovered) {
        ctx.strokeStyle = toRgba(color, Math.min(1, alpha * (hovered ? 0.5 : 0.22)))
        ctx.lineWidth = width + (hovered ? 6 : 3) * Math.max(0.2, config.halo)
        ctx.beginPath()
        ctx.moveTo(from.x, from.y)
        ctx.quadraticCurveTo(cx, cy, to.x, to.y)
        ctx.stroke()
      }
      ctx.strokeStyle = toRgba(color, hovered ? Math.min(1, alpha + 0.35) : alpha)
      ctx.lineWidth = width + (hovered ? 1.5 : 0)
      ctx.beginPath()
      ctx.moveTo(from.x, from.y)
      ctx.quadraticCurveTo(cx, cy, to.x, to.y)
      ctx.stroke()
    }

    for (const node of state.fabric.nodes) {
      const point = nodePoint.get(node.storyId)
      if (!point) continue
      const foreground = node.band === 'foreground'
      const color = foreground ? palette[0]! : palette[palette.length - 1] ?? palette[0]!
      const radius = foreground
        ? 3.5 + 5.5 * node.weight * config.nodeScale
        : 2 + 2.5 * node.weight * config.nodeScale
      const alpha = config.opacity * (foreground ? 0.55 + 0.35 * node.weight : 0.22)
      const hovered = this.hover?.kind === 'node' && this.hover.id === node.storyId
      ctx.fillStyle = toRgba(color, hovered ? Math.min(1, alpha + 0.3) : alpha)
      ctx.beginPath()
      ctx.arc(point.x, point.y, radius + (hovered ? 2 : 0), 0, Math.PI * 2)
      ctx.fill()
      if (hovered) {
        ctx.strokeStyle = toRgba(color, 0.9)
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.arc(point.x, point.y, radius + 5, 0, Math.PI * 2)
        ctx.stroke()
      }
    }

    const showZoomLabels = map.getZoom() >= config.labelZoom
    if (this.hover) {
      ctx.font = '10px "IBM Plex Mono", ui-monospace, monospace'
      ctx.fillStyle = 'rgba(28,27,24,0.92)'
      const label = this.hover.label
      const width = ctx.measureText(label).width + 10
      ctx.fillStyle = 'rgba(251,250,246,0.94)'
      ctx.fillRect(this.hover.x + 10, this.hover.y - 20, width, 16)
      ctx.fillStyle = '#1c1b18'
      ctx.fillText(label, this.hover.x + 15, this.hover.y - 8)
    } else if (showZoomLabels) {
      ctx.font = '9px "IBM Plex Mono", ui-monospace, monospace'
      ctx.fillStyle = 'rgba(28,27,24,0.7)'
      for (const node of state.fabric.nodes.slice(0, 10)) {
        if (node.band !== 'foreground') continue
        const point = nodePoint.get(node.storyId)
        const label = node.matchedTerms[0]
        if (!point || !label) continue
        ctx.fillText(label, point.x + 7, point.y - 6)
      }
    }
  }

  private pickAt(px: number, py: number): FabricPick | null {
    const { state, config, map } = this
    if (!state || !config) return null

    for (const node of state.fabric.nodes) {
      if (!node.point) continue
      const point = map.latLngToContainerPoint(node.point)
      const radius = 8 + 5 * config.nodeScale
      if (Math.hypot(px - point.x, py - point.y) <= radius) {
        return {
          kind: 'node',
          id: node.storyId,
          title: node.band === 'foreground' ? node.storyId : `${node.storyId} · context`,
          body: `${langLabel(node.band)} · ${node.matchedTerms.length ? node.matchedTerms.join(', ') : 'weight ' + node.weight.toFixed(2)}`,
          storyId: node.storyId,
        }
      }
    }

    for (const edge of this.enabledEdges(config)) {
      const from = state.fabric.nodes.find((node) => node.storyId === edge.from)?.point
      const to = state.fabric.nodes.find((node) => node.storyId === edge.to)?.point
      if (!from || !to) continue
      const a = map.latLngToContainerPoint(from)
      const b = map.latLngToContainerPoint(to)
      const dx = b.x - a.x
      const dy = b.y - a.y
      const length = Math.hypot(dx, dy) || 1
      const curve = length * 0.18 * config.curvature
      const cx = (a.x + b.x) / 2 - (dy / length) * curve
      const cy = (a.y + b.y) / 2 + (dx / length) * curve
      let closest = Number.POSITIVE_INFINITY
      let previous = a
      for (let step = 1; step <= 18; step += 1) {
        const t = step / 18
        const x = (1 - t) ** 2 * a.x + 2 * (1 - t) * t * cx + t ** 2 * b.x
        const y = (1 - t) ** 2 * a.y + 2 * (1 - t) * t * cy + t ** 2 * b.y
        closest = Math.min(closest, distanceToSegment(px, py, previous.x, previous.y, x, y))
        previous = L.point(x, y)
      }
      if (closest <= 7) {
        return {
          kind: 'edge',
          id: edge.id,
          title: EDGE_LABELS[edge.type] ?? edge.type,
          body: edge.explanation,
        }
      }
    }

    for (const zone of state.fabric.zones) {
      const point = map.latLngToContainerPoint(zone.center)
      const radius = Math.max(8, metersToPixels(map, config.fieldBandMeters, zone.center[0]))
      if (Math.hypot(px - point.x, py - point.y) <= radius) {
        return {
          kind: 'zone',
          id: zone.cell,
          title: zone.cell,
          body: zone.explanation,
        }
      }
    }
    return null
  }
}

function langLabel(band: string): string {
  return band === 'foreground' ? 'foreground' : 'context'
}
