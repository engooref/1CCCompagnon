/**
 * build-native.js
 *
 * Compile l'addon natif sc_overlay_tracker avec les headers Electron corrects.
 * Utilisation : node scripts/build-native.js
 */

'use strict'

const { execSync } = require('child_process')
const path         = require('path')
const fs           = require('fs')

const ROOT = path.resolve(__dirname, '..')

// Récupère la version exacte d'Electron installée
const electronPkgPath = path.join(ROOT, 'node_modules', 'electron', 'package.json')
if (!fs.existsSync(electronPkgPath)) {
  console.error('[build-native] Electron non trouvé dans node_modules. Lance npm install d\'abord.')
  process.exit(1)
}
const electronVersion = require(electronPkgPath).version
console.log(`[build-native] Electron ${electronVersion} détecté`)

const cmd = [
  'node-gyp', 'rebuild',
  '--directory', 'native',
  `--target=${electronVersion}`,
  '--arch=x64',
  '--dist-url=https://electronjs.org/headers',
  '--python=python3',
].join(' ')

console.log(`[build-native] ${cmd}\n`)

try {
  execSync(cmd, { cwd: ROOT, stdio: 'inherit' })
  console.log('\n[build-native] Addon compilé avec succès → native/build/Release/sc_overlay_tracker.node')
} catch (e) {
  console.error('\n[build-native] Échec de compilation.')
  console.error('  Prérequis : Visual Studio Build Tools + Python 3 + node-gyp installé globalement')
  console.error('  npm install -g node-gyp')
  process.exit(1)
}
