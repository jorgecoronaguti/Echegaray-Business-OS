// EL CANARIO DEL PODADOR: que ningún generador del contrato escriba por un camino sin podar.
//
// El podador se enchufó en los DOS cuellos que comparten los generadores —`escribirPreservando` y
// `conEdicionesRespetadas`—. Eso alcanza HOY. Este control es lo que hace que siga alcanzando: si
// alguien escribe una pestaña del contrato con `values.update` directo, el minimalismo deja de
// aplicarse en esa pestaña y nadie se entera hasta la próxima auditoría contra el archivo vivo.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { PESTANAS } from '../scripts/formato-pestanas.mjs'
import { enAlcance } from './diseno-unificado.mjs'
import { sePoda } from './podar-prosa.mjs'

const DIR = 'orquestador/scripts'
const PODADOS = /escribirPreservando\(|conEdicionesRespetadas\(/

/**
 * Los que escriben una pestaña del contrato por un rango suelto, DECLARADOS con su motivo. Un
 * escritor por rango no arma la pestaña: retoca una celda o un bloque que ya existe, y el podador no
 * puede razonar sobre filas que no ve.
 */
const POR_RANGO_DECLARADOS = new Set([])

test('el alcance del podador es exactamente el del contrato, ni una pestaña más', () => {
  for (const p of PESTANAS) assert.equal(sePoda(p.titulo), enAlcance(p.titulo), p.titulo)
  for (const t of ['_J_OBREROS', '_ARCA_RAW', '_MOVIMIENTOS', 'Parámetros ']) {
    assert.equal(sePoda(t), false, `${t} no es una pestaña de pantalla: el podador no la toca`)
  }
})

test('todo generador de una pestaña del contrato escribe por un camino podado', async () => {
  const enContrato = PESTANAS.filter((p) => enAlcance(p.titulo)).map((p) => p.titulo)
  const culpables = []
  for (const f of await readdir(DIR)) {
    if (!f.endsWith('.mjs') || f.includes('.test.') || POR_RANGO_DECLARADOS.has(f)) continue
    const src = await readFile(`${DIR}/${f}`, 'utf8')
    // Sólo mira a los que ESCRIBEN. Un `A1:BZ400` también aparece en los auditores, que LEEN la
    // pestaña entera: exigir una llamada de escritura los deja afuera sin tener que enumerarlos.
    if (!/writeSheetValues|values\.update|updateValues|batchUpdate/.test(src)) continue
    const escribeDesdeA1 = enContrato.some((t) => new RegExp(`['\`']\\$?\\{?[^'\`]*${t.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}[^'\`]*!A1:`, 'i').test(src))
    if (!escribeDesdeA1) continue
    if (!PODADOS.test(src)) culpables.push(f)
  }
  assert.deepEqual(culpables, [],
    `escriben una pestaña del contrato desde A1 sin pasar por el podador: ${culpables.join(', ')}`)
})
