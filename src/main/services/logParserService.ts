import fs from 'node:fs'
import path from 'node:path'
import { parseLine } from './logPatterns'

export interface GameState {
  player: string | null
  ship: string | null
  location: string | null
  destination: string | null
  activity: 'hangar' | 'space' | 'quantum' | 'menu' | 'unknown'
  zone: string | null
  shard: string | null
  sessionAt: string | null
  updatedAt: string | null
  isConnected: boolean
}

export interface GameEvent {
  type: string
  label: string
  payload: Record<string, string | null>
  at: string
}

type Listener = (state: GameState, event: GameEvent) => void

class LogParser {
  private state: GameState = {
    player: null,
    ship: null,
    location: null,
    destination: null,
    activity: 'unknown',
    zone: null,
    shard: null,
    sessionAt: null,
    updatedAt: null,
    isConnected: false,
  }

  private listeners: Listener[] = []
  private watcher: fs.FSWatcher | null = null
  private polling = false
  private fileSize = 0
  private filePath = ''
  private partial = ''
  private replaying = false
  private readChunks = 0
  private lastDeltaSize = 0
  private emittedEvents = 0
  private totalLines = 0
  private startGen = 0

  on(fn: Listener) {
    this.listeners.push(fn)
  }

  off(fn: Listener) {
    this.listeners = this.listeners.filter(l => l !== fn)
  }

  private emit(type: string, label: string, payload: Record<string, string | null>, at: string) {
    this.state.updatedAt = at
    if (this.replaying) return
    const event: GameEvent = { type, label, payload, at }
    for (const fn of this.listeners) fn({ ...this.state }, event)
    this.emittedEvents += 1
  }

  private getEventTime(parsedData?: Record<string, string>) {
    return parsedData?.timestamp ?? new Date().toISOString()
  }

  private processLine(line: string) {
    const parsed = parseLine(line)
    if (!parsed) return

    const d = parsed.data
    const at = this.getEventTime(d)

    switch (parsed.type) {
      case 'player':
        if (d.player && d.player !== 'INVALID' && d.player !== 'unknown' && this.state.player !== d.player) {
          this.state.player = d.player
          this.emit('player', `Joueur : ${d.player}`, { player: d.player }, at)
        }
        break

      case 'connect_started':
        this.state.isConnected = false
        if (!this.state.sessionAt) this.state.sessionAt = at
        this.emit('connect_started', 'Connexion démarrée', {}, at)
        break

      case 'client_connected':
        this.state.isConnected = true
        if (!this.state.sessionAt) this.state.sessionAt = at
        this.emit('client_connected', 'Client connecté', {}, at)
        break

      case 'client_spawned':
        this.state.isConnected = true
        this.state.activity = 'space'
        if (!this.state.sessionAt) this.state.sessionAt = at
        this.emit('client_spawned', 'Joueur spawn', {}, at)
        break

      case 'shard':
        if (d.shard && this.state.shard !== d.shard) {
          this.state.shard = d.shard
          this.state.activity = 'space'
          this.state.isConnected = true
          if (!this.state.sessionAt) this.state.sessionAt = at
          this.emit('shard', `Serveur : ${d.shard}`, { shard: d.shard }, at)
        }
        break

      case 'hangar_enter':
        this.state.activity = 'hangar'
        this.state.destination = null
        this.state.ship = null
        this.emit('activity', 'Dans le hangar', { activity: 'hangar' }, at)
        break

      case 'quantum_selected':
        this.state.destination = d.destination ?? null
        this.state.activity = 'quantum'
        if (d.ship) this.state.ship = d.ship
        this.emit('quantum_start', `Quantum vers ${d.destination}`, {
          destination: d.destination ?? null,
          rawDestination: d.rawDestination ?? null,
          ship: this.state.ship,
        }, at)
        break

      case 'quantum_route':
        this.state.location = d.location ?? null
        this.state.destination = d.destination ?? null
        if (d.ship) this.state.ship = d.ship
        this.emit('quantum_route', `Route : ${d.location} → ${d.destination}`, {
          location: d.location ?? null,
          destination: d.destination ?? null,
          rawDestination: d.rawDestination ?? null,
          ship: this.state.ship,
        }, at)
        break

      case 'quantum_route_ready':
        this.state.destination = d.destination ?? null
        if (d.ship) this.state.ship = d.ship
        this.emit('quantum_ready', `Quantum prêt vers ${d.destination} (${d.fuel} fuel)`, {
          destination: d.destination ?? null,
          rawDestination: d.rawDestination ?? null,
          fuel: d.fuel ?? null,
          ship: this.state.ship,
        }, at)
        break

      case 'quantum_preparing':
        if (d.ship) this.state.ship = d.ship
        this.emit('quantum_preparing', `Préparation quantum vers ${d.destination}`, {
          destination: d.destination ?? null,
          ship: this.state.ship,
        }, at)
        break

      case 'zone_transition':
        this.state.location = d.toZone ?? this.state.location
        this.emit('zone_transition', `${d.fromZone} → ${d.toZone}`, {
          fromZone: d.fromZone ?? null,
          toZone: d.toZone ?? null,
        }, at)
        break

      case 'location': {
        const loc = d.location ?? null
        if (loc && this.state.location !== loc) {
          this.state.location = loc
          this.state.destination = null
          if (this.state.activity === 'quantum') this.state.activity = 'space'
          this.emit('location', `Localisation : ${loc}`, {
            location: loc,
            rawLocation: d.rawLocation ?? null,
          }, at)
        }
        break
      }

      case 'atc_request':
        this.emit('atc_request', `Demande d'apontage ATC`, {
          player: d.player ?? null,
        }, at)
        break

      case 'notification': {
        const text = d.notification ?? ''
        if (!text || text.includes('unavailable')) break

        // Hangar assigné (apontage confirmé)
        if (/Hangar Request Completed/i.test(text)) {
          this.state.activity = 'hangar'
          this.emit('hangar_assigned', 'Hangar assigné', { notification: text }, at)
          break
        }

        // Calibration quantum (par le joueur local ou un coéquipier)
        if (/Quantum Travel Calibration Started/i.test(text)) {
          const pilot = text.match(/Quantum Travel Calibration Started By (\S+)/)?.[1] ?? null
          this.state.activity = 'quantum'
          this.emit('quantum_calibrating', `Calibration quantum${pilot ? ` par ${pilot}` : ''}`, {
            pilot,
            notification: text,
          }, at)
          break
        }

        // Quantum obstrué
        if (/Quantum Travel:.*obstructed/i.test(text)) {
          this.state.activity = 'space'
          this.emit('quantum_obstructed', 'Quantum obstrué', { notification: text }, at)
          break
        }

        let zone: string | null = this.state.zone

        if (/Armistice/i.test(text)) {
          zone = /Entering|Entered/i.test(text) ? 'Armistice' : null
        } else if (/Jurisdiction/i.test(text)) {
          zone = text.replace(/^Entered /i, '').replace(/ Jurisdiction$/i, '')
        } else if (/Monitored/i.test(text)) {
          zone = /Entering|Entered/i.test(text) ? 'Monitored Space' : null
        }

        if (this.state.zone !== zone) {
          this.state.zone = zone
          this.emit('zone', text, { zone, notification: text }, at)
        } else {
          this.emit('notification', text, { notification: text }, at)
        }
        break
      }

      case 'disconnect':
        this.state.isConnected = false
        this.emit('disconnect', `Déconnecté : ${d.reason ?? 'inconnu'}`, {
          cause: d.cause ?? null,
          reason: d.reason ?? null,
        }, at)
        break
    }
  }

  private processChunk(chunk: string): number {
    const text = this.partial + chunk
    const lines = text.split(/\r?\n/)
    this.partial = lines.pop() ?? ''

    let processed = 0
    for (const line of lines) {
      if (line.trim()) {
        this.totalLines += 1
        this.processLine(line)
        processed += 1
      }
    }
    return processed
  }

  private handleFileChange() {
    if (!fs.existsSync(this.filePath)) return
    const cur = fs.statSync(this.filePath)
    if (cur.size < this.fileSize) {
      this.fileSize = 0
      this.partial = ''
    }
    if (cur.size === this.fileSize) return
    const delta = cur.size - this.fileSize
    const fd2 = fs.openSync(this.filePath, 'r')
    const buf2 = Buffer.alloc(delta)
    fs.readSync(fd2, buf2, 0, delta, this.fileSize)
    fs.closeSync(fd2)
    this.fileSize = cur.size
    this.processChunk(buf2.toString('utf8'))
    this.readChunks += 1
    this.lastDeltaSize = delta
  }

  private startPollingFallback() {
    if (this.polling) return
    this.polling = true
    fs.watchFile(this.filePath, { interval: 2000 }, (curr, prev) => {
      if (curr.size !== prev.size) this.handleFileChange()
    })
  }

  private setupWatcher() {
    let watcherOk = false
    try {
      this.watcher = fs.watch(this.filePath, () => this.handleFileChange())
      this.watcher.on('error', () => {
        if (!this.polling) this.startPollingFallback()
      })
      watcherOk = true
    } catch {
      // fs.watch non disponible sur ce filesystem
    }
    if (!watcherOk) this.startPollingFallback()
  }

  async start(gameFolderOrLogPath: string) {
    this.stop()
    const gen = ++this.startGen

    this.filePath = gameFolderOrLogPath.endsWith('Game.log')
      ? gameFolderOrLogPath
      : path.join(gameFolderOrLogPath, 'Game.log')

    try {
      await fs.promises.access(this.filePath)
    } catch {
      return
    }

    const stat = await fs.promises.stat(this.filePath)
    if (gen !== this.startGen) return
    this.fileSize = stat.size

    // Scan backward asynchronously — yields to event loop between chunks
    const SCAN_CHUNK = 131_072
    const CONNECT_MARKER = '[CSessionManager::ConnectCmd] Connect started'
    let sessionByteOffset = -1

    const fh = await fs.promises.open(this.filePath, 'r')
    try {
      let carry = ''
      let pos = stat.size
      while (pos > 0 && sessionByteOffset === -1) {
        if (gen !== this.startGen) break
        const chunkStart = Math.max(0, pos - SCAN_CHUNK)
        const chunkLen = pos - chunkStart
        const cbuf = Buffer.alloc(chunkLen)
        await fh.read(cbuf, 0, chunkLen, chunkStart)
        const text = cbuf.toString('utf8') + carry
        const lines = text.split(/\r?\n/)
        carry = lines.shift() ?? ''
        for (let i = lines.length - 1; i >= 0; i--) {
          if (lines[i].includes(CONNECT_MARKER)) {
            const parts = [carry, ...lines.slice(0, i)]
            const prefix = parts.join('\n') + '\n'
            sessionByteOffset = chunkStart + Buffer.byteLength(prefix, 'utf8')
            break
          }
        }
        pos = chunkStart
        await new Promise<void>(r => setImmediate(r))
      }
    } finally {
      await fh.close()
    }

    if (gen !== this.startGen) return

    if (sessionByteOffset !== -1) {
      const replayLen = stat.size - sessionByteOffset
      const rbuf = Buffer.alloc(replayLen)
      const rfh = await fs.promises.open(this.filePath, 'r')
      try {
        await rfh.read(rbuf, 0, replayLen, sessionByteOffset)
      } finally {
        await rfh.close()
      }
      if (gen !== this.startGen) return
      this.partial = ''
      this.replaying = true
      this.processChunk(rbuf.toString('utf8'))
      this.readChunks += 1
      this.lastDeltaSize = replayLen
      this.replaying = false
    }

    if (gen !== this.startGen) return

    if (this.state.isConnected) {
      const at = this.state.updatedAt ?? new Date().toISOString()
      this.emit('restored', 'État restauré', {
        player: this.state.player,
        shard: this.state.shard,
        location: this.state.location,
        ship: this.state.ship,
        activity: this.state.activity,
      }, at)
    } else {
      this.state = {
        player: null,
        ship: null,
        location: null,
        destination: null,
        activity: 'unknown',
        zone: null,
        shard: null,
        sessionAt: null,
        updatedAt: null,
        isConnected: false,
      }
    }

    this.partial = ''
    this.setupWatcher()
  }

  stop() {
    this.startGen++
    this.watcher?.close()
    this.watcher = null
    if (this.polling) {
      try { fs.unwatchFile(this.filePath) } catch {}
      this.polling = false
    }
    this.partial = ''
  }

  getStats() {
    return {
      readChunks: this.readChunks,
      lastDeltaSize: this.lastDeltaSize,
      emittedEvents: this.emittedEvents,
    }
  }

  isRunning(): boolean {
    return this.watcher !== null || this.polling
  }

  getFilePath(): string {
    return this.filePath
  }

  getState(): GameState {
    return { ...this.state }
  }
}

export const logParser = new LogParser()