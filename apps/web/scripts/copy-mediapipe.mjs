// Serves the MediaPipe WebAssembly files from our own site (no third-party CDN at interview time).
import fs from 'node:fs'
import path from 'node:path'

// Works with npm workspaces (package hoisted to the repo root) and plain installs
const candidates = ['node_modules', '../../node_modules'].map((d) => path.resolve(d, '@mediapipe/tasks-vision/wasm'))
const src = candidates.find((d) => fs.existsSync(d))
if (!src) throw new Error('Run npm install first: @mediapipe/tasks-vision not found')
const dest = path.resolve('public/mediapipe')
fs.mkdirSync(dest, { recursive: true })
for (const f of fs.readdirSync(src)) fs.copyFileSync(path.join(src, f), path.join(dest, f))
console.log(`MediaPipe wasm copied to ${dest}`)
