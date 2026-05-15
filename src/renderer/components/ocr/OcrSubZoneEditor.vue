<script setup lang="ts">
/**
 * OcrSubZoneEditor — édition inline d'une sous-zone dans un zone-group.
 */
import { ref, reactive } from 'vue'
import type { OcrSubZone, OcrZoneMode } from '@renderer/ocr/OcrTypes'
import { useOcrStore } from '@renderer/stores/ocrStore'
import { DEFAULT_MINING_SUBZONES } from '@renderer/ocr/OcrShipPresets'

const props = defineProps<{ zoneId: string }>()

const ocr = useOcrStore()

const MODES: Exclude<OcrZoneMode, 'zone-group'>[] = [
  'text', 'number', 'percent', 'material', 'coordinate', 'quality', 'composition',
]

const PRESETS = ['scScanBlock', 'scScanNumber', 'scScanMaterial', 'scScanHud', 'scScanComposition']

// ── Formulaire ajout ──────────────────────────────────────────────────────────
const adding = ref(false)
const editingId = ref<string | null>(null)

function emptyForm(): Omit<OcrSubZone, 'id'> {
  return {
    label: '',
    fieldKey: '',
    rect: { x: 0.0, y: 0.0, w: 0.5, h: 0.1 },
    mode: 'number',
    whitelist: '',
    preprocessingPreset: undefined,
    preprocessingOverride: undefined,
    stabilize: { samples: 2 },
  }
}

const form = reactive<Omit<OcrSubZone, 'id'>>(emptyForm())

function startAdd() {
  Object.assign(form, emptyForm())
  adding.value = true
  editingId.value = null
}

function startEdit(sub: OcrSubZone) {
  Object.assign(form, {
    label: sub.label,
    fieldKey: sub.fieldKey,
    rect: { ...sub.rect },
    mode: sub.mode,
    whitelist: sub.whitelist ?? '',
    preprocessingPreset: sub.preprocessingPreset,
    preprocessingOverride: undefined,
    stabilize: { ...sub.stabilize },
  })
  editingId.value = sub.id
  adding.value = false
}

function confirmAdd() {
  if (!form.label.trim() || !form.fieldKey.trim()) return
  ocr.addSubZone(props.zoneId, {
    ...JSON.parse(JSON.stringify(form)),
    whitelist: form.whitelist || undefined,
    id: crypto.randomUUID(),
  })
  adding.value = false
}

function confirmEdit() {
  if (!editingId.value || !form.label.trim() || !form.fieldKey.trim()) return
  ocr.updateSubZone(props.zoneId, editingId.value, {
    label: form.label,
    fieldKey: form.fieldKey,
    rect: { ...form.rect },
    mode: form.mode,
    whitelist: form.whitelist || undefined,
    preprocessingPreset: form.preprocessingPreset,
    stabilize: { ...form.stabilize },
  })
  editingId.value = null
}

function cancel() {
  adding.value = false
  editingId.value = null
}

function remove(subId: string) {
  ocr.removeSubZone(props.zoneId, subId)
  if (editingId.value === subId) editingId.value = null
}

function addDefaults() {
  for (const s of DEFAULT_MINING_SUBZONES) {
    ocr.addSubZone(props.zoneId, { ...s, id: crypto.randomUUID() })
  }
}

const zone = () => ocr.activeProfile?.zones.find(z => z.id === props.zoneId)
</script>

<template>
  <div class="sub-editor">
    <div class="sub-header">
      <span class="sub-title">Sous-zones ({{ zone()?.subZones?.length ?? 0 }})</span>
      <button class="btn btn--sm" @click="startAdd" :disabled="adding || !!editingId">+ Ajouter</button>
      <button
        v-if="!zone()?.subZones?.length"
        class="btn btn--sm btn--ghost"
        @click="addDefaults"
        title="Pré-remplir avec les champs mining par défaut"
      >Mining par défaut</button>
    </div>

    <!-- Liste des sous-zones -->
    <div class="sub-list">
      <div
        v-for="sub in zone()?.subZones ?? []"
        :key="sub.id"
        class="sub-row"
        :class="{ 'sub-row--editing': editingId === sub.id }"
      >
        <span class="sub-label">{{ sub.label }}</span>
        <span class="sub-fk">{{ sub.fieldKey }}</span>
        <span class="sub-mode">{{ sub.mode }}</span>
        <button class="btn-icon" @click="startEdit(sub)" title="Éditer">✎</button>
        <button class="btn-icon btn-icon--danger" @click="remove(sub.id)" title="Supprimer">×</button>
      </div>
      <div v-if="!zone()?.subZones?.length" class="sub-empty">Aucune sous-zone</div>
    </div>

    <!-- Formulaire édition / ajout -->
    <div v-if="adding || editingId" class="sub-form">
      <div class="form-title">{{ adding ? 'Nouvelle sous-zone' : 'Éditer sous-zone' }}</div>

      <div class="form-row">
        <label>Label</label>
        <input class="inp" v-model="form.label" placeholder="ex: Masse" />
      </div>
      <div class="form-row">
        <label>fieldKey</label>
        <input class="inp" v-model="form.fieldKey" placeholder="ex: rockMass" />
      </div>
      <div class="form-row">
        <label>Mode</label>
        <select class="inp" v-model="form.mode">
          <option v-for="m in MODES" :key="m" :value="m">{{ m }}</option>
        </select>
      </div>
      <div class="form-row">
        <label>Whitelist</label>
        <input class="inp" v-model="form.whitelist" placeholder="0123456789.," />
      </div>
      <div class="form-row">
        <label>Preset</label>
        <select class="inp" v-model="form.preprocessingPreset">
          <option value="">— hérite parent —</option>
          <option v-for="p in PRESETS" :key="p" :value="p">{{ p }}</option>
        </select>
      </div>
      <div class="form-title form-title--sub">Rect (relatif au parent, 0→1)</div>
      <div class="form-row4">
        <div class="form-row">
          <label>X</label>
          <input class="inp inp--num" type="number" step="0.01" min="0" max="1" v-model.number="form.rect.x" />
        </div>
        <div class="form-row">
          <label>Y</label>
          <input class="inp inp--num" type="number" step="0.01" min="0" max="1" v-model.number="form.rect.y" />
        </div>
        <div class="form-row">
          <label>W</label>
          <input class="inp inp--num" type="number" step="0.01" min="0.01" max="1" v-model.number="form.rect.w" />
        </div>
        <div class="form-row">
          <label>H</label>
          <input class="inp inp--num" type="number" step="0.01" min="0.005" max="1" v-model.number="form.rect.h" />
        </div>
      </div>
      <div class="form-row">
        <label>Samples</label>
        <input class="inp inp--num" type="number" step="1" min="1" max="10" v-model.number="form.stabilize.samples" />
      </div>

      <div class="form-actions">
        <button class="btn btn--primary btn--sm" @click="adding ? confirmAdd() : confirmEdit()">
          {{ adding ? 'Créer' : 'Enregistrer' }}
        </button>
        <button class="btn btn--sm" @click="cancel">Annuler</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sub-editor {
  margin-top: 6px;
  border-top: 1px solid rgba(255,255,255,0.08);
  padding-top: 6px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.sub-header {
  display: flex;
  align-items: center;
  gap: 6px;
}
.sub-title {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  opacity: 0.5;
  letter-spacing: 0.04em;
  flex: 1;
}
.sub-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.sub-row {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  padding: 2px 4px;
  border-radius: 3px;
  background: rgba(255,255,255,0.03);
}
.sub-row--editing {
  background: rgba(34,211,238,0.08);
  outline: 1px solid rgba(34,211,238,0.3);
}
.sub-label { flex: 1; font-weight: 500; }
.sub-fk { font-size: 9px; opacity: 0.5; font-family: monospace; }
.sub-mode {
  font-size: 9px;
  padding: 1px 4px;
  background: rgba(255,255,255,0.08);
  border-radius: 3px;
}
.sub-empty { font-size: 10px; opacity: 0.35; padding: 2px 4px; }
.btn-icon {
  background: none;
  border: none;
  color: rgba(255,255,255,0.5);
  cursor: pointer;
  font-size: 13px;
  padding: 0 2px;
  line-height: 1;
}
.btn-icon:hover { color: var(--primary-color, #22d3ee); }
.btn-icon--danger:hover { color: #f87171; }

/* Formulaire */
.sub-form {
  background: rgba(0,0,0,0.3);
  border: 1px solid rgba(34,211,238,0.2);
  border-radius: 5px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.form-title {
  font-size: 10px;
  font-weight: 600;
  opacity: 0.6;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.form-title--sub { margin-top: 4px; }
.form-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.form-row label { font-size: 10px; opacity: 0.55; width: 52px; flex-shrink: 0; }
.form-row4 {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr 1fr;
  gap: 4px;
}
.form-row4 .form-row label { width: 14px; }
.inp {
  flex: 1;
  background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 3px;
  color: #f1f5f9;
  font-size: 11px;
  padding: 2px 5px;
  min-width: 0;
}
.inp--num { width: 52px; flex: none; }
.inp:focus { outline: none; border-color: var(--primary-color, #22d3ee); }
.form-actions { display: flex; gap: 6px; margin-top: 2px; }

.btn {
  background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.15);
  color: #f1f5f9;
  border-radius: 3px;
  padding: 3px 8px;
  font-size: 11px;
  cursor: pointer;
}
.btn:hover { background: rgba(255,255,255,0.14); }
.btn--primary {
  background: rgba(34,211,238,0.15);
  border-color: var(--primary-color, #22d3ee);
  color: var(--primary-color, #22d3ee);
}
.btn--primary:hover { background: rgba(34,211,238,0.25); }
.btn--sm { padding: 2px 6px; font-size: 10px; }
.btn--ghost { opacity: 0.55; }
.btn--ghost:hover { opacity: 1; }
.btn:disabled { opacity: 0.35; cursor: default; }
</style>
