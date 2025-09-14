<template>
  <div class="canva-container" ref="container"></div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { Deck, OrthographicView } from '@deck.gl/core'
import { ScatterplotLayer, LineLayer, TextLayer } from '@deck.gl/layers'

const props = defineProps({
  points: { type: Array, default: () => [] },
  domain: { type: Object, required: true },  // {x0,x1,y0,y1,t0}
  selectedArtist: { type: String, default: null },
  selectedTrack:  { type: String, default: null },
  xScale: { type: Number, default: 1 },
  yScale: { type: Number, default: 1 }
})

const container = ref(null)
let deck = null
let viewState = { target: [0,0,0], zoom: 0 }
let w = 1, h = 1
let didFit = false

// ---- colors / radius
const CYAN = [0,187,255,179]
const GREY = [100,100,100,90]
const dayMs = 86400000

function dotSizeForZoom(z) {
  return Math.max(2, Math.min(24, 2 + Math.max(0, z - 6) * 3))
}
function radiusFor(d) {
  const base = dotSizeForZoom(viewState.zoom)
  if (props.selectedTrack)  return d.track  === props.selectedTrack  ? base * 2.0 : base
  if (props.selectedArtist) return d.artist === props.selectedArtist ? base * 1.5 : base
  return base
}
function colorFor(d) {
  if (props.selectedTrack)  return d.track  === props.selectedTrack  ? CYAN : GREY
  if (props.selectedArtist) return d.artist === props.selectedArtist ? CYAN : GREY
  return CYAN
}

// ---- axis builders (based on FIRST/LAST play, not camera)
function buildXAxisTicks() {
  const firstTs = props.domain.t0
  const lastTs  = firstTs + props.domain.x1 * dayMs
  const spanDays = Math.max(1, Math.round((lastTs - firstTs) / dayMs))
  const spanYears = spanDays / 365

  // choose step
  let step = 'year'
  if (spanYears < 1.5 && spanDays > 120) step = 'month'
  if (spanDays <= 120 && spanDays > 14)  step = 'week'
  if (spanDays <= 14)                    step = 'day'

  const ticks = []
  const date = new Date(firstTs)

  function pushTick(ts) {
    const xDay = Math.floor((ts - firstTs) / dayMs)   // day index from t0
    const x = xDay * props.xScale
    let label
    if (step === 'year')  label = new Intl.DateTimeFormat(undefined,{year:'numeric'}).format(ts)
    if (step === 'month') label = new Intl.DateTimeFormat(undefined,{year:'2-digit', month:'short'}).format(ts)
    if (step === 'week')  label = new Intl.DateTimeFormat(undefined,{month:'short', day:'2-digit'}).format(ts)
    if (step === 'day')   label = new Intl.DateTimeFormat(undefined,{month:'short', day:'2-digit'}).format(ts)
    ticks.push({ x, label })
  }

  // align the first tick to a nice boundary
  let cur
  if (step === 'year') {
    cur = new Date(date.getFullYear(), 0, 1).getTime()
    while (cur <= lastTs) { pushTick(cur); cur = new Date(new Date(cur).getFullYear()+1,0,1).getTime() }
  } else if (step === 'month') {
    cur = new Date(date.getFullYear(), date.getMonth(), 1).getTime()
    while (cur <= lastTs) { pushTick(cur); const d=new Date(cur); cur=new Date(d.getFullYear(), d.getMonth()+1, 1).getTime() }
  } else if (step === 'week') {
    // start at next Monday
    const d0 = new Date(firstTs)
    const day = (d0.getDay()+6)%7 // 0=Mon
    cur = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() - day + 7).getTime()
    while (cur <= lastTs) { pushTick(cur); cur += 7*dayMs }
  } else {
    cur = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
    while (cur <= lastTs) { pushTick(cur); cur += dayMs }
  }

  return ticks
}

function buildYAxisTicks() {
  const ticks = []
  const hours = [0, 6, 12, 18, 24]  // simple, readable set
  for (const hval of hours) {
    const y = (hval) * props.yScale
    const label = `${hval}` // 0…24
    ticks.push({ y, label })
  }
  return ticks
}

// ---- deck.gl layers
function scatterLayer() {
  return new ScatterplotLayer({
    id: 'plays',
    data: props.points,
    pickable: true,
    getPosition: d => [d.x * props.xScale, d.y * props.yScale],
    radiusUnits: 'pixels',
    getRadius: radiusFor,
    getFillColor: colorFor,
    updateTriggers: {
      getPosition: [props.xScale, props.yScale],
      getFillColor: [props.selectedArtist, props.selectedTrack],
      getRadius: [viewState.zoom, props.selectedArtist, props.selectedTrack]
    },
    transitions: { getFillColor: 120, getRadius: 120 }
  })
}

function xAxisLayers() {
  const ticks = buildXAxisTicks()
  const baselineY = (props.domain.y0 - 0.8) * props.yScale

  const lines = new LineLayer({
    id: 'x-ticks',
    data: ticks.map(t => ({ sourcePosition: [t.x, baselineY], targetPosition: [t.x, baselineY + 0.5*props.yScale] })),
    getSourcePosition: d => d.sourcePosition,
    getTargetPosition: d => d.targetPosition,
    getWidth: 1,
    widthUnits: 'pixels',
    getColor: [200, 220, 235, 40]
  })

  const labels = new TextLayer({
    id: 'x-labels',
    data: ticks.map(t => ({ position:[t.x, baselineY - 0.3*props.yScale], label: t.label })),
    getPosition: d => d.position,
    getText: d => d.label,
    getSize: 12,
    sizeUnits: 'pixels',
    getColor: [190, 205, 215, 230],
    fontFamily: 'Inter, system-ui, sans-serif',
    getTextAnchor: () => 'middle',
    getAlignmentBaseline: () => 'bottom'
  })
  return [lines, labels]
}

function yAxisLayers() {
  const ticks = buildYAxisTicks()
  const baselineX = (props.domain.x0 - 1.0) * props.xScale

  const lines = new LineLayer({
    id: 'y-ticks',
    data: ticks.map(t => ({ sourcePosition: [baselineX, t.y], targetPosition: [baselineX + 0.6*props.xScale, t.y] })),
    getSourcePosition: d => d.sourcePosition,
    getTargetPosition: d => d.targetPosition,
    getWidth: 1,
    widthUnits: 'pixels',
    getColor: [200, 220, 235, 40]
  })

  const labels = new TextLayer({
    id: 'y-labels',
    data: ticks.map(t => ({ position:[baselineX - 0.4*props.xScale, t.y], label: t.label })),
    getPosition: d => d.position,
    getText: d => d.label,
    getSize: 12,
    sizeUnits: 'pixels',
    getColor: [190, 205, 215, 230],
    fontFamily: 'Inter, system-ui, sans-serif',
    getTextAnchor: () => 'end',
    getAlignmentBaseline: () => 'middle'
  })
  return [lines, labels]
}

function layers() {
  return [
    ...xAxisLayers(),
    ...yAxisLayers(),
    scatterLayer()
  ]
}

function refresh() { deck && deck.setProps({ layers: layers() }) }

// ---- fit-to-bounds once (so April doesn’t start at world 0/0)
function fitToData(pad = 0.06) {
  const worldW = (props.domain.x1 - props.domain.x0) * props.xScale
  const worldH = (props.domain.y1 - props.domain.y0) * props.yScale
  const usableW = w * (1 - pad * 2)
  const usableH = h * (1 - pad * 2)
  const scaleX = usableW / worldW
  const scaleY = usableH / worldH
  const s = Math.max(1e-6, Math.min(scaleX, scaleY))
  const zoom = Math.log2(s)

  const cx = ((props.domain.x0 + props.domain.x1) / 2) * props.xScale
  const cy = ((props.domain.y0 + props.domain.y1) / 2) * props.yScale

  viewState = { target: [cx, cy, 0], zoom }
  deck.setProps({ viewState })
  didFit = true
}

// ---- mount
onMounted(() => {
  // start centered on data; zoom is set after we know size
  viewState = { target: [((props.domain.x0 + props.domain.x1)/2)*props.xScale,
                         ((props.domain.y0 + props.domain.y1)/2)*props.yScale, 0],
                zoom: 0 }

  deck = new Deck({
    parent: container.value,
    views: [new OrthographicView()],
    controller: { doubleClickZoom: false, minZoom: -3, maxZoom: 15 },
    width: '100%',
    height: '100%',
    onResize: () => {
      w = container.value.clientWidth
      h = container.value.clientHeight
      if (!didFit && w && h) fitToData()
      return { width: w, height: h }
    },
    onViewStateChange: ({ viewState: vs }) => {
        viewState = vs;
        deck.setProps({ viewState: vs});
        refresh()
    },
    initialViewState: viewState,
    layers: layers(),
    getTooltip: ({ object }) => object && {
      text: new Date(object.ts).toLocaleString() + `\n${object.artist} — ${object.track}`
    }
  })
})

watch(() => props.points, () => { didFit = false; refresh(); if (w && h) fitToData() })
watch(() => [props.xScale, props.yScale], () => { didFit = false; refresh(); if (w && h) fitToData() })
watch(() => props.selectedArtist, refresh)
watch(() => props.selectedTrack,  refresh)

onBeforeUnmount(() => { deck?.finalize(); deck = null })
</script>


<style>
.canva-container {
  position: relative;
  background-color: #1f1f1f;
  width: 100%;
  height: 68vh;
  border-radius: 16px;
  overflow: hidden;
}
</style>


// getFillColor: d => (d.ms >= 120000 ? [39,227,139,170] : [255,255,255,90])