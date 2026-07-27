#!/usr/bin/env node
// REFRESCAR SOLO LOS ESPEJOS — la mitad SEGURA del pipeline del Flujo de Caja.
//
// POR QUÉ EXISTE (2026-07-27). El pipeline `flujo-caja-rehacer-todo.mjs` mezcla dos cosas de
// naturaleza opuesta:
//   1) REFRESCAR ESPEJOS `_RAW` (jornales, banco, ARCA, F931): copias byte-a-byte de fuentes externas
//      (Santander, ARCA, F931, el archivo JORNALES). NUNCA las edita el dueño → refrescarlas es 100%
//      seguro. Son las que mantienen VIVAS las fórmulas de CAJA y los Cash Flows.
//   2) REGENERAR PESTAÑAS DE CONTENIDO (CAJA, Cheques, Proveedores…): reescribe la pestaña entera. Es
//      lo que destruyó el trabajo del dueño una y otra vez. Esa mitad queda APAGADA por decisión suya.
//
// Deshabilitar TODO el pipeline (para proteger las pestañas) tenía un efecto colateral: los espejos
// dejaban de refrescarse → CAJA mostraba el saldo del banco viejo, fechas desactualizadas, y el Sheet
// "no se sentía vivo". Este script recupera la automatización SIN el riesgo: refresca sólo los espejos.
//
// Cada espejo escribe únicamente su pestaña `_RAW` con `espejo: true` (sin candado, sin firma, sin
// Regla 0). No toca ninguna pestaña de contenido. Por eso correrlo contra el Sheet real es seguro y
// NO viola la regla "nunca correr el pipeline para validar": esto NO es el pipeline destructivo.

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const ejecutar = promisify(execFile)
const AQUI = path.dirname(fileURLToPath(import.meta.url))

// SOLO espejos `_RAW`. Cualquier script que escriba una pestaña de contenido NO va acá.
const ESPEJOS = [
  ['espejar-jornales.mjs', 'espejo del archivo JORNALES (_J_OBREROS, _J_OFICINA)'],
  ['banco-raw-pestana.mjs', '_BANCO_RAW — el extracto del Santander'],
  ['arca-raw-pestana.mjs', '_ARCA_RAW — los comprobantes de ARCA'],
  ['f931-sheet.mjs', '_F931_RAW — las DDJJ F931'],
]

let fallas = 0
for (const [script, que] of ESPEJOS) {
  const t0 = Date.now()
  try {
    const { stdout } = await ejecutar(process.execPath, [path.join(AQUI, script)], {
      env: process.env,
      maxBuffer: 32 * 1024 * 1024,
      timeout: 180_000,
    })
    const ultima = String(stdout).trim().split('\n').filter(Boolean).pop() || 'ok'
    console.log(`✓ ${que} · ${((Date.now() - t0) / 1000).toFixed(1)}s · ${ultima}`)
  } catch (e) {
    fallas++
    console.error(`✗ ${que} — ${e.message.split('\n')[0]}`)
  }
}

console.log(fallas === 0
  ? '🟢 espejos frescos: CAJA y los Cash Flows recalculan con datos al día, sin tocar tus pestañas.'
  : `⚠ ${fallas}/${ESPEJOS.length} espejos fallaron — revisar arriba.`)
process.exit(fallas === 0 ? 0 : 1)
