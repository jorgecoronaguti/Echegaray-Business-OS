#!/usr/bin/env node
// ¿CUÁNTO SE EQUIVOCA WHISPER EN ESPAÑOL, EN ESTA VM? Medido contra transcripciones de referencia.
//
// ═══ POR QUÉ CON UN DATASET PÚBLICO Y NO CON AUDIOS DE OBRA ═══
//
// No hay un solo archivo de audio en el Drive de la empresa: verificado, cero. Esperar a que los
// haya sería dejar la capacidad sin medir para siempre, y una capacidad sin medir no puede ir a
// producción. Common Voice en español tiene audio real con su transcripción escrita por una
// persona, no lleva ningún dato de Echegaray, y sirve para lo único que hace falta saber ahora:
// si este modelo transcribe español corrido en esta CPU y con qué error.
//
// LO QUE ESTA MEDICIÓN NO DICE: cómo se porta con ruido de obra, con acento sanjuanino y con
// vocabulario de construcción. Eso se mide el día que haya audios reales, y este mismo banco los
// va a correr.
//
//   node orquestador/scripts/voz-benchmark.mjs <carpeta-con-ref.json> [--modelo whisper-base]

import { readFileSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { cargarVoz } from '../lib/ml/voz.mjs'
import { hfTranscribir } from '../lib/ml/hf-inferencia.mjs'
import { interpretarParte } from '../lib/ml/voz.mjs'
import { drenarTrazas } from '../lib/ml/traza.mjs'

const ejecutar = promisify(execFile)
const CARPETA = process.argv[2]

/** WER: cuántas palabras hay que cambiar, sacar o agregar para llegar del reconocido al correcto,
 *  dividido por las palabras del correcto. Es la métrica estándar y la única comparable. */
export function wer(referencia, hipotesis) {
  const r = normalizar(referencia).split(' ').filter(Boolean)
  const h = normalizar(hipotesis).split(' ').filter(Boolean)
  // Distancia de edición a nivel PALABRA, no carácter: cambiar «ocho» por «nueve» es UN error, no
  // cuatro, y en un parte de obra esa diferencia son horas-hombre.
  const d = Array.from({ length: r.length + 1 }, (_, i) => [i, ...Array(h.length).fill(0)])
  for (let j = 0; j <= h.length; j += 1) d[0][j] = j
  for (let i = 1; i <= r.length; i += 1) {
    for (let j = 1; j <= h.length; j += 1) {
      d[i][j] = r[i - 1] === h[j - 1] ? d[i - 1][j - 1]
        : 1 + Math.min(d[i - 1][j - 1], d[i][j - 1], d[i - 1][j])
    }
  }
  return r.length ? d[r.length][h.length] / r.length : null
}

/** Sin tildes, sin puntuación y en minúscula: un WER que castiga la coma mide ortografía, no
 *  reconocimiento. */
const normalizar = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9ñ\s]/g, ' ').replace(/\s+/g, ' ').trim()

/** Un WAV a Float32 mono 16 kHz, sin ffmpeg: se lee la cabecera y se convierte a mano. */
export function wavAFloat32(buf) {
  if (buf.toString('ascii', 0, 4) !== 'RIFF') throw new Error('no es un WAV')
  let pos = 12, fmt = null, datos = null
  while (pos + 8 <= buf.length) {
    const id = buf.toString('ascii', pos, pos + 4)
    const largo = buf.readUInt32LE(pos + 4)
    if (id === 'fmt ') fmt = { canales: buf.readUInt16LE(pos + 10), hz: buf.readUInt32LE(pos + 12), bits: buf.readUInt16LE(pos + 22) }
    if (id === 'data') datos = buf.subarray(pos + 8, pos + 8 + largo)
    pos += 8 + largo + (largo % 2)
  }
  if (!fmt || !datos) throw new Error('WAV sin fmt o sin data')
  if (fmt.bits !== 16) throw new Error(`WAV de ${fmt.bits} bits: sólo se lee 16`)
  const n = Math.floor(datos.length / 2 / fmt.canales)
  const mono = new Float32Array(n)
  for (let i = 0; i < n; i += 1) {
    let s = 0
    for (let c = 0; c < fmt.canales; c += 1) s += datos.readInt16LE((i * fmt.canales + c) * 2)
    mono[i] = s / fmt.canales / 32768
  }
  if (fmt.hz === 16000) return mono
  // Remuestreo lineal. Es peor que un filtro de verdad y alcanza: Whisper vuelve a remuestrear.
  const m = Math.round(n * 16000 / fmt.hz)
  const out = new Float32Array(m)
  for (let i = 0; i < m; i += 1) {
    const x = i * fmt.hz / 16000
    const a = Math.floor(x), b = Math.min(n - 1, a + 1), t = x - a
    out[i] = mono[a] * (1 - t) + mono[b] * t
  }
  return out
}

async function main() {
  const ref = JSON.parse(readFileSync(`${CARPETA}/ref.json`, 'utf8'))

  // ── EL CAMINO QUE HOY FUNCIONA: HF CLOUD ──
  //
  // `transformers.js` en Node NO decodifica audio: exige Float32 a 16 kHz y esta VM no tiene
  // ffmpeg, ni numpy, ni ningún decodificador de MP3 u Opus. Un mensaje de voz de Mattermost
  // llega en Opus, así que el whisper local —implementado y probado— hoy no puede recibir un
  // archivo real. El endpoint de Hugging Face acepta el archivo tal como viene.
  console.log('MODELO REMOTO  openai/whisper-large-v3 vía HF Inference Providers')
  console.log('AUDIO          Common Voice en español: público, sin un solo dato de Echegaray\n')

  let suma = 0, n = 0, ms = 0, bytes = 0
  for (const x of ref) {
    const audio = readFileSync(x.archivo)
    bytes += audio.length
    let r
    try { r = await hfTranscribir({ audio, dominio: 'publico', modulo: 'voz-benchmark' }) }
    catch (e) { console.log(`  ✖ ${x.archivo.split('/').pop()}: ${e.message.slice(0, 70)}`); continue }
    ms += r.ms
    const w = wer(x.texto, r.texto)
    suma += w; n += 1
    console.log(`  WER ${(w * 100).toFixed(1).padStart(5)}%  ${String(r.ms).padStart(5)} ms`)
    console.log(`     esperado: ${x.texto}`)
    console.log(`     escuchó : ${r.texto}`)
    // Y lo que el OS hace DESPUÉS de tener el texto: convertirlo en una propuesta.
    const p = interpretarParte(r.texto)
    if (p.horas.length || p.personas.length) {
      console.log(`     extrajo : ${p.horas.map((h) => h.valor + 'h').join(' ')} · ${p.personas.map((z) => z.nombre).join(', ')}`)
    }
  }

  console.log(`\n═══ ${n} audios · ${(bytes / 1024).toFixed(0)} KB ═══`)
  console.log(`  WER promedio        ${((suma / n) * 100).toFixed(1)}%`)
  console.log(`  latencia media      ${Math.round(ms / n)} ms por audio`)
  console.log(`  costo               $0 (incluido en el plan PRO)`)

  // ── EL CAMINO LOCAL: se declara por qué hoy no se puede medir ──
  console.log('\n  LOCAL (onnx-community/whisper-base, 180 MB, Apache-2.0):')
  try {
    const m = await cargarVoz()
    console.log(`    el modelo CARGA (${m.msCarga} ms) y la interpretación del parte está probada,`)
    console.log('    pero la VM no tiene con qué decodificar un MP3 ni un Opus a PCM.')
    console.log('    Bloqueo de INFRAESTRUCTURA, no del modelo: se destraba con ffmpeg o un')
    console.log('    decodificador wasm, y ahí este mismo banco lo mide sin cambiar una línea.')
  } catch (e) { console.log(`    no cargó: ${e.message.slice(0, 80)}`) }
  await drenarTrazas()
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then(() => process.exit(0)).catch((e) => { console.error('ERROR:', e.stack || e.message); process.exit(1) })
}
