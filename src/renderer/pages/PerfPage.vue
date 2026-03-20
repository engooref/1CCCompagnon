<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProcessMetric {
  pid: number
  type: string
  name?: string
  cpu: { percentCPUUsage: number; idleWakeupsPerSecond: number }
  memory: { workingSetSize: number; peakWorkingSetSize: number; privateBytes?: number }
  sandboxed?: boolean
  integrityLevel?: string
}

interface PerfSnapshot {
  processes: ProcessMetric[]
  mainMemory: { rss: number; heapTotal: number; heapUsed: number; external: number }
  systemMemory: { total: number; free: number; swapTotal?: number; swapFree?: number }
  uptime: number
}

// ─── State ────────────────────────────────────────────────────────────────────

const HISTORY_LEN = 60
const snapshot  = ref<PerfSnapshot | null>(null)
const cpuHistory  = ref<Record<number, number[]>>({})
const memHistory  = ref<Record<number, number[]>>({})
const error       = ref<string | null>(null)
let timer: ReturnType<typeof setInterval> | null = null

// ─── Helpers ─────────────────────────────────────────────────────────────────

function push(history: Record<number, number[]>, pid: number, val: number) {
  if (!history[pid]) history[pid] = []
  history[pid].push(val)
  if (history[pid].length > HISTORY_LEN) history[pid].shift()
}

function processLabel(p: ProcessMetric): string {
  const map: Record<string, string> = {
    Browser:  'Main Process',
    Tab:      'Renderer',
    Renderer: 'Renderer',
    GPU:      'GPU',
    Utility:  'Utility',
    Worker:   'Worker',
  }
  return map[p.type] ?? p.type
}

function kb(n: number) {
  if (n > 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + ' GB'
  if (n > 1024)        return (n / 1024).toFixed(0) + ' MB'
  return n + ' KB'
}

function bytes(n: number) {
  if (n > 1e9) return (n / 1e9).toFixed(1) + ' GB'
  if (n > 1e6) return (n / 1e6).toFixed(0) + ' MB'
  if (n > 1e3) return (n / 1e3).toFixed(0) + ' KB'
  return n + ' B'
}

function fmtUptime(s: number) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
  return [h > 0 ? `${h}h` : null, m > 0 ? `${m}m` : null, `${sec}s`]
    .filter(Boolean).join(' ')
}

function cpuColor(pct: number) {
  if (pct > 50) return 'bg-rose-500'
  if (pct > 20) return 'bg-amber-400'
  return 'bg-cyan-400'
}

function memPct(p: ProcessMetric, sysTotal: number): number {
  return Math.min(100, (p.memory.workingSetSize / sysTotal) * 100)
}

// ─── Sparkline (canvas) ───────────────────────────────────────────────────────

function drawSparkline(
  canvas: HTMLCanvasElement,
  data: number[],
  max: number,
  color: string,
) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const { width: w, height: h } = canvas
  ctx.clearRect(0, 0, w, h)
  if (data.length < 2) return

  const step = w / (HISTORY_LEN - 1)
  const peak = max > 0 ? max : 1

  ctx.beginPath()
  ctx.strokeStyle = color
  ctx.lineWidth = 1.5
  ctx.lineJoin = 'round'

  data.forEach((v, i) => {
    const x = i * step
    const y = h - (v / peak) * h
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  })
  ctx.stroke()

  // Fill under
  ctx.lineTo((data.length - 1) * step, h)
  ctx.lineTo(0, h)
  ctx.closePath()
  ctx.fillStyle = color.replace(')', ', 0.15)').replace('rgb', 'rgba')
  ctx.fill()
}

// ─── Fetch loop ───────────────────────────────────────────────────────────────

async function fetchMetrics() {
  try {
    const data: PerfSnapshot = await (window as any).oneCC.getPerfMetrics()
    snapshot.value = data

    for (const p of data.processes) {
      push(cpuHistory.value, p.pid, p.cpu.percentCPUUsage)
      push(memHistory.value, p.pid, p.memory.workingSetSize)
    }
  } catch (e) {
    error.value = String(e)
  }
}

onMounted(async () => {
  await fetchMetrics()
  timer = setInterval(fetchMetrics, 1000)
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
})

// ─── Computed ─────────────────────────────────────────────────────────────────

const systemMemPct = computed(() => {
  if (!snapshot.value) return 0
  const { total, free } = snapshot.value.systemMemory
  return Math.round(((total - free) / total) * 100)
})

const totalAppMem = computed(() => {
  if (!snapshot.value) return 0
  return snapshot.value.processes.reduce((s, p) => s + p.memory.workingSetSize, 0)
})

const heapPct = computed(() => {
  if (!snapshot.value) return 0
  const { heapUsed, heapTotal } = snapshot.value.mainMemory
  return Math.round((heapUsed / heapTotal) * 100)
})
</script>

<template>
  <section class="h-full overflow-y-auto rounded-lg border border-cyan-400/20 bg-black/20 p-6 space-y-6">

    <!-- Header -->
    <div class="flex items-center justify-between">
      <h2 class="text-xl font-semibold tracking-wide">Performances</h2>
      <span v-if="snapshot" class="text-xs text-slate-500 font-mono">
        uptime {{ fmtUptime(snapshot.uptime) }}
      </span>
    </div>

    <div v-if="error" class="text-rose-400 text-sm">{{ error }}</div>
    <div v-if="!snapshot && !error" class="text-slate-500 text-sm">Chargement…</div>

    <template v-if="snapshot">

      <!-- ── Résumé système ─────────────────────────────────────────── -->
      <div class="grid grid-cols-3 gap-4">

        <!-- RAM système -->
        <div class="rounded-lg border border-cyan-400/15 bg-slate-900/60 p-4 space-y-2">
          <p class="text-xs text-slate-400 font-semibold uppercase tracking-wider">RAM Système</p>
          <p class="text-2xl font-bold font-mono text-cyan-300">{{ systemMemPct }}%</p>
          <div class="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
            <div class="h-full rounded-full transition-all bg-cyan-400"
                 :style="{ width: systemMemPct + '%' }" />
          </div>
          <p class="text-xs text-slate-500 font-mono">
            {{ kb(snapshot.systemMemory.total - snapshot.systemMemory.free) }}
            / {{ kb(snapshot.systemMemory.total) }}
          </p>
        </div>

        <!-- RAM app totale -->
        <div class="rounded-lg border border-cyan-400/15 bg-slate-900/60 p-4 space-y-2">
          <p class="text-xs text-slate-400 font-semibold uppercase tracking-wider">RAM App totale</p>
          <p class="text-2xl font-bold font-mono text-violet-300">{{ kb(totalAppMem) }}</p>
          <div class="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
            <div class="h-full rounded-full bg-violet-400 transition-all"
                 :style="{ width: Math.min(100, (totalAppMem / snapshot.systemMemory.total) * 100) + '%' }" />
          </div>
          <p class="text-xs text-slate-500 font-mono">de {{ kb(snapshot.systemMemory.total) }}</p>
        </div>

        <!-- Heap V8 (main) -->
        <div class="rounded-lg border border-cyan-400/15 bg-slate-900/60 p-4 space-y-2">
          <p class="text-xs text-slate-400 font-semibold uppercase tracking-wider">Heap V8 (main)</p>
          <p class="text-2xl font-bold font-mono text-emerald-300">{{ heapPct }}%</p>
          <div class="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
            <div class="h-full rounded-full bg-emerald-400 transition-all"
                 :style="{ width: heapPct + '%' }" />
          </div>
          <p class="text-xs text-slate-500 font-mono">
            {{ bytes(snapshot.mainMemory.heapUsed) }}
            / {{ bytes(snapshot.mainMemory.heapTotal) }}
          </p>
        </div>

      </div>

      <!-- ── Processus ──────────────────────────────────────────────── -->
      <div>
        <p class="mb-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Processus Electron</p>
        <div class="space-y-3">
          <div
            v-for="p in snapshot.processes"
            :key="p.pid"
            class="rounded-lg border border-cyan-400/10 bg-slate-900/50 p-3 grid grid-cols-[1fr_2fr_2fr] gap-4 items-center"
          >
            <!-- Label -->
            <div>
              <p class="text-sm font-semibold text-slate-200">{{ processLabel(p) }}</p>
              <p class="text-[11px] text-slate-500 font-mono">PID {{ p.pid }}</p>
              <p v-if="p.sandboxed" class="text-[10px] text-amber-500/70 mt-0.5">sandboxed</p>
            </div>

            <!-- CPU -->
            <div class="space-y-1">
              <div class="flex justify-between text-[11px]">
                <span class="text-slate-400">CPU</span>
                <span class="font-mono text-slate-200">{{ p.cpu.percentCPUUsage.toFixed(1) }}%</span>
              </div>
              <div class="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                <div
                  class="h-full rounded-full transition-all"
                  :class="cpuColor(p.cpu.percentCPUUsage)"
                  :style="{ width: Math.min(100, p.cpu.percentCPUUsage) + '%' }"
                />
              </div>
              <!-- Sparkline CPU -->
              <canvas
                :ref="(el) => { if (el) drawSparkline(el as HTMLCanvasElement, cpuHistory[p.pid] ?? [], 100, '#22d3ee') }"
                width="160" height="24"
                class="w-full h-6"
              />
            </div>

            <!-- Mémoire -->
            <div class="space-y-1">
              <div class="flex justify-between text-[11px]">
                <span class="text-slate-400">Mémoire</span>
                <span class="font-mono text-slate-200">{{ kb(p.memory.workingSetSize) }}</span>
              </div>
              <div class="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                <div
                  class="h-full rounded-full bg-violet-400 transition-all"
                  :style="{ width: memPct(p, snapshot!.systemMemory.total) + '%' }"
                />
              </div>
              <!-- Sparkline Mémoire -->
              <canvas
                :ref="(el) => { if (el) drawSparkline(el as HTMLCanvasElement, memHistory[p.pid] ?? [], Math.max(...(Object.values(memHistory).flat())), '#a78bfa') }"
                width="160" height="24"
                class="w-full h-6"
              />
            </div>

          </div>
        </div>
      </div>

    </template>
  </section>
</template>
