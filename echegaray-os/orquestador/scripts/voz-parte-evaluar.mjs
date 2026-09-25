#!/usr/bin/env node
// ¿CUÁNTO ACIERTA «DICTAR PARTE»? Campo por campo, sobre los fixtures del parser y, si se le da una
// carpeta, sobre audios transcriptos EN ESTA VM con el modelo instalado.
//
//   node orquestador/scripts/voz-parte-evaluar.mjs                    # sólo texto (sin modelo, sin red)
//   node orquestador/scripts/voz-parte-evaluar.mjs --audios <dir>     # + <dir>/<prefijo>-<n>.wav, n = índice del caso
//
// Un «campo» es un dato que el jefe tendría que corregir si saliera mal: estado, horas y tarea de
// cada persona; tarea y producción de cada avance; cantidad, unidad y material de cada pedido; cada
// novedad esperada y cada duda que debía marcarse (`compararCaso`). Para audios reales hace falta su
// propio contexto y lo esperado escrito por quien dictó: el formato es el de `voz-parte.fixtures.mjs`.
//
// No escribe nada en ningún lado. No llama a ninguna API.

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { proponerParte } from '../lib/ml/voz-parte.mjs'
import { CASOS, CONTEXTO, compararCaso } from '../lib/ml/voz-parte.fixtures.mjs'

const args = process.argv.slice(2)
const dir = args.includes('--audios') ? args[args.indexOf('--audios') + 1] : null

function medir(nombre, textos) {
  let ok = 0, total = 0
  const fallas = []
  CASOS.forEach((c, i) => {
    if (textos[i] == null) return
    const campos = compararCaso(c, proponerParte(textos[i], CONTEXTO))
    total += campos.length; ok += campos.filter((x) => x.ok).length
    for (const x of campos.filter((y) => !y.ok)) fallas.push(`  caso ${i} «${c.nombre}» · ${x.nombre}: esperaba ${JSON.stringify(x.esperado)}, salió ${JSON.stringify(x.obtenido)}`)
  })
  process.stdout.write(`${nombre}: ${ok}/${total} campos (${(100 * ok / Math.max(1, total)).toFixed(1)} %)\n${fallas.join('\n')}${fallas.length ? '\n' : ''}`)
}

medir('texto escrito', CASOS.map((c) => c.texto))

if (dir) {
  const { cargarDictado, transcribirWav } = await import('../lib/ml/voz.mjs')
  const motor = cargarDictado()
  process.stdout.write(`modelo cargado en ${motor.msCarga} ms\n`)
  const prefijos = [...new Set(readdirSync(dir).filter((f) => /-\d+\.wav$/.test(f)).map((f) => f.replace(/-\d+\.wav$/, '')))]
  for (const pre of prefijos) {
    const textos = []
    let seg = 0, ms = 0
    for (let i = 0; i < CASOS.length; i++) {
      let buf
      try { buf = readFileSync(join(dir, `${pre}-${i}.wav`)) } catch { continue }
      const r = transcribirWav(motor, buf)
      if (!r.ok) { process.stdout.write(`  ${pre}-${i}: ${r.error}\n`); continue }
      textos[i] = r.texto; seg += r.segundos; ms += r.ms
      if (args.includes('--ver')) process.stdout.write(`  ${pre}-${i}: ${r.texto}\n`)
    }
    medir(`audio «${pre}» (${seg.toFixed(1)} s en ${ms} ms, RTF ${(ms / 1000 / Math.max(seg, 0.001)).toFixed(3)})`, textos)
  }
  for (const f of readdirSync(dir).filter((x) => /^largo.*\.wav$/.test(x))) {
    const r = transcribirWav(motor, readFileSync(join(dir, f)))
    process.stdout.write(`${f}: ${r.segundos?.toFixed(1)} s de audio en ${r.ms} ms (RTF ${(r.ms / 1000 / r.segundos).toFixed(3)})\n`)
  }
  process.stdout.write(`RSS ${Math.round(process.memoryUsage().rss / 1e6)} MB · pico ${Math.round(process.resourceUsage().maxRSS / 1024)} MB\n`)
}
