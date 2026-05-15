<script setup lang="ts">
import { ref } from 'vue'
import { useOcrStore } from '@renderer/stores/ocrStore'
import { SHIP_PRESETS } from '@renderer/ocr/OcrShipPresets'

const ocr = useOcrStore()

// ── Création ──────────────────────────────────────────────────────────────────
const creating   = ref(false)
const newLabel   = ref('')
const newShipKey = ref('generic')

function openCreate() {
  newLabel.value   = ''
  newShipKey.value = 'generic'
  creating.value   = true
}

async function confirmCreate() {
  const label = newLabel.value.trim() || 'Profil'
  await ocr.createProfile(label, newShipKey.value || undefined)
  creating.value = false
}

function cancelCreate() {
  creating.value = false
}

// ── Renommage ─────────────────────────────────────────────────────────────────
const renaming   = ref(false)
const renameLabel = ref('')

function openRename() {
  if (!ocr.selectedProfileId) return
  renameLabel.value = ocr.activeProfile?.label ?? ''
  renaming.value = true
}

function confirmRename() {
  const label = renameLabel.value.trim()
  if (label && ocr.selectedProfileId) {
    ocr.renameProfile(ocr.selectedProfileId, label)
  }
  renaming.value = false
}

function cancelRename() {
  renaming.value = false
}

// ── Duplication / Suppression ─────────────────────────────────────────────────
function onDuplicate() {
  if (ocr.selectedProfileId) ocr.duplicateProfile(ocr.selectedProfileId)
}

function onDelete() {
  if (!ocr.selectedProfileId) return
  if (ocr.profiles.length <= 1) return
  if (confirm('Supprimer ce profil ?')) ocr.deleteProfile(ocr.selectedProfileId)
}
</script>

<template>
  <div class="ocr-profile-selector">
    <!-- Sélecteur profil actif -->
    <select
      :value="ocr.selectedProfileId ?? ''"
      @change="ocr.selectProfile(($event.target as HTMLSelectElement).value)"
    >
      <option v-for="p in ocr.profiles" :key="p.id" :value="p.id">
        {{ p.label }}
      </option>
    </select>
    <button @click="openCreate"   title="Nouveau profil">+</button>
    <button @click="openRename"   title="Renommer" :disabled="!ocr.selectedProfileId">✎</button>
    <button @click="onDuplicate"  title="Dupliquer" :disabled="!ocr.selectedProfileId">⧉</button>
    <button @click="onDelete"     title="Supprimer" :disabled="ocr.profiles.length <= 1">🗑</button>

    <Teleport to="body">
      <!-- Modal création -->
      <div v-if="creating" class="modal-backdrop" @mousedown.self="cancelCreate">
        <div class="modal">
          <div class="modal-title">Nouveau profil OCR</div>
          <label class="field">
            <span>Vaisseau</span>
            <select v-model="newShipKey">
              <option v-for="s in SHIP_PRESETS" :key="s.key" :value="s.key">{{ s.label }}</option>
            </select>
          </label>
          <label class="field">
            <span>Nom du profil</span>
            <input
              v-model="newLabel"
              type="text"
              :placeholder="SHIP_PRESETS.find(s => s.key === newShipKey)?.label ?? 'Profil'"
              @keydown.enter="confirmCreate"
              @keydown.escape="cancelCreate"
            />
          </label>
          <div class="modal-actions">
            <button class="btn-cancel" @click="cancelCreate">Annuler</button>
            <button class="btn-confirm" @click="confirmCreate">Créer</button>
          </div>
        </div>
      </div>

      <!-- Modal renommage -->
      <div v-if="renaming" class="modal-backdrop" @mousedown.self="cancelRename">
        <div class="modal">
          <div class="modal-title">Renommer le profil</div>
          <label class="field">
            <span>Nouveau nom</span>
            <input
              v-model="renameLabel"
              type="text"
              placeholder="Nom"
              @keydown.enter="confirmRename"
              @keydown.escape="cancelRename"
            />
          </label>
          <div class="modal-actions">
            <button class="btn-cancel" @click="cancelRename">Annuler</button>
            <button class="btn-confirm" @click="confirmRename">Renommer</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.ocr-profile-selector {
  display: flex;
  gap: 4px;
  align-items: center;
}
select {
  flex: 1;
  background: rgba(0,0,0,0.6);
  color: var(--text-color, #f1f5f9);
  border: 1px solid rgba(255,255,255,0.15);
  border-radius: 4px;
  padding: 3px 6px;
  font-size: 12px;
}
button {
  background: rgba(255,255,255,0.08);
  color: var(--text-color, #f1f5f9);
  border: 1px solid rgba(255,255,255,0.15);
  border-radius: 4px;
  padding: 2px 7px;
  font-size: 12px;
  cursor: pointer;
}
button:hover:not(:disabled) { background: rgba(255,255,255,0.18); }
button:disabled { opacity: 0.35; cursor: default; }

/* Modal */
.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0,0,0,0.55);
  display: flex;
  align-items: center;
  justify-content: center;
}
.modal {
  background: #0f172a;
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 10px;
  padding: 20px;
  min-width: 300px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.6);
}
.modal-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--primary-color, #22d3ee);
}
.field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: 12px;
  color: rgba(255,255,255,0.7);
}
.field select,
.field input {
  background: rgba(0,0,0,0.5);
  color: #f1f5f9;
  border: 1px solid rgba(255,255,255,0.15);
  border-radius: 5px;
  padding: 5px 8px;
  font-size: 12px;
}
.modal-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
.btn-cancel {
  background: rgba(255,255,255,0.06);
  color: rgba(255,255,255,0.6);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 5px;
  padding: 5px 14px;
  font-size: 12px;
  cursor: pointer;
}
.btn-confirm {
  background: rgba(34,211,238,0.2);
  color: var(--primary-color, #22d3ee);
  border: 1px solid rgba(34,211,238,0.4);
  border-radius: 5px;
  padding: 5px 14px;
  font-size: 12px;
  cursor: pointer;
  font-weight: 600;
}
.btn-confirm:hover { background: rgba(34,211,238,0.3); }
</style>
