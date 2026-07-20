#!/usr/bin/env node
// EL AGENTE QUE MANTIENE EL FLUJO DE CAJA AL DÍA, SOLO.
//
// "Regla de oro: todo debe actualizarse de manera automática, crear agentes para esto".
//
// Las pestañas del Flujo de Caja se calculan a partir de Compras, de Cobranzas y de los comprobantes
// de ARCA. Los datos ya se sincronizan solos (hay timers de compras, cobranzas, ARCA y avance), pero
// las pestañas DERIVADAS no se rehacían nunca: quedaban con la forma que tenían el día que las
// escribí. Cuando el dueño agregaba filas a Compras, los rangos se corrían y el cuadro mentía. Eso
// es exactamente lo que pasó hoy con Estructura ($33,2M en cero) y con la nómina duplicada.
//
// Este agente corre después de los syncs y rehace TODO en el orden en que depende:
//   1. rubro-caja-sheet   — la columna que define QUÉ es cada gasto. Todo lo demás cuelga de acá.
//   2. cash-flow-rehacer  — las dos pestañas de cash flow, con el mismo juego de líneas.
//   3. materiales-pestana — familias de material (y la columna de familia en Compras).
//   4. estructura-pestana — el cuadro de estructura con su proyección.
//   5. impuestos-pestana  — IVA real de ARCA con saldo arrastrado.
//   6. cargas-planes      — planes de pago de deuda previsional.
//   7. cobranzas-control  — el detector de cobros duplicados.
//
// POR QUÉ ES 0 API. No pasa por el modelo: son scripts determinísticos. Un agente que razona para
// rehacer la misma tabla todos los días es plata tirada y además puede improvisar distinto cada vez.
// El razonamiento ya está en el código y en los tests; acá sólo hay que ejecutarlo.
//
// SI UNO FALLA, SIGUEN LOS DEMÁS. Un error en impuestos no tiene por qué dejar el cash flow viejo.
// Al final informa qué se rehizo y qué no, y sale con código != 0 si algo falló — así el timer lo
// registra y no se pierde en silencio.
//
//   node orquestador/scripts/flujo-caja-rehacer-todo.mjs [--dry]

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const ejecutar = promisify(execFile)
const AQUI = path.dirname(fileURLToPath(import.meta.url))
const DRY = process.argv.includes('--dry')

// El orden NO es cosmético: cada uno lee lo que escribió el anterior.
const PASOS = [
  ['rubro-caja-sheet.mjs', 'la columna "Rubro de caja" de Compras — de acá cuelga todo lo demás'],
  ['cash-flow-rehacer.mjs', 'Cash Flow Semanal y Mensual'],
  ['materiales-pestana.mjs', 'pestaña Materiales + columna de familia en Compras'],
  ['estructura-pestana.mjs', 'pestaña Estructura con su proyección'],
  ['impuestos-pestana.mjs', 'Impuestos y Financieros — IVA real de ARCA'],
  ['cargas-planes.mjs', 'Cargas Sociales — planes de pago'],
  ['cobranzas-control.mjs', 'Cobranzas — detector de duplicados'],
]

async function main() {
  const t0 = Date.now()
  const ok = []
  const fallaron = []

  for (const [script, que] of PASOS) {
    const inicio = Date.now()
    if (DRY) { console.log(`(dry) ${script.padEnd(26)} ${que}`); continue }
    try {
      // process.execPath, NO 'node': bajo systemd el PATH no incluye el node de nvm y los hijos
      // fallaban con ENOENT. Así siempre usa el mismo intérprete que está corriendo este script.
      const { stdout } = await ejecutar(process.execPath, [path.join(AQUI, script)], {
        env: process.env,
        maxBuffer: 8 * 1024 * 1024,
        timeout: 5 * 60 * 1000,
      })
      // Se mira la salida, no sólo el código de salida: varios scripts avisan de celdas en error o de
      // un control que no cierra SIN fallar. Eso también hay que reportarlo.
      const alerta = /⚠/.test(stdout) ? stdout.split('\n').filter((l) => l.includes('⚠')).join(' · ') : null
      ok.push({ script, que, seg: ((Date.now() - inicio) / 1000).toFixed(1), alerta })
      console.log(`✓ ${script.padEnd(26)} ${((Date.now() - inicio) / 1000).toFixed(1)}s  ${que}`)
      if (alerta) console.log(`   ⚠ ${alerta.slice(0, 220)}`)
    } catch (e) {
      fallaron.push({ script, que, error: String(e.stderr || e.message).split('\n')[0].slice(0, 220) })
      console.error(`✗ ${script.padEnd(26)} ${que}\n   ${String(e.stderr || e.message).split('\n')[0].slice(0, 220)}`)
    }
  }

  if (DRY) return
  console.log(`\n${ok.length}/${PASOS.length} pestañas rehechas en ${((Date.now() - t0) / 1000).toFixed(1)}s`)
  const conAlerta = ok.filter((r) => r.alerta)
  if (conAlerta.length) {
    console.log(`\n${conAlerta.length} con avisos (la pestaña se rehizo, pero algo no cierra):`)
    for (const r of conAlerta) console.log(`  · ${r.script}: ${r.alerta.slice(0, 200)}`)
  }
  if (fallaron.length) {
    console.log(`\n${fallaron.length} FALLARON:`)
    for (const r of fallaron) console.log(`  · ${r.script}: ${r.error}`)
    process.exitCode = 1
  }
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
