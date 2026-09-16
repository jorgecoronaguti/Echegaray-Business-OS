// EL COSTO POR OBRA DE LA APP CUADRA CON LA PESTAÑA — contra la base real, de sólo lectura.
//
// «No puede fallar nunca eso» (dueño, 15/09/2026). Esta prueba es la forma ejecutable de esa frase:
// corre la auditoría entera y se pone ROJA si alguna obra tiene más de $1 de diferencia entre lo que
// `costo_de_obras_a_la_fecha` publica y lo que sale de contar `compra_sheet` con la regla declarada.
//
// ═══ QUÉ SE AFIRMA Y QUÉ NO ═══
//
// NO se clava ningún importe: los números de Compras cambian todos los días y un test que fija
// $37.188.800 se pone rojo mañana sin que nada se haya roto. Lo que se afirma son INVARIANTES:
//
//   1. la RPC y el recuento independiente sobre el espejo dan lo mismo, obra por obra;
//   2. cada peso que la columna «Obra» manda a una obra o entra al costo o tiene un motivo con
//      nombre — un residuo sin explicar es el peor hallazgo posible;
//   3. lo «por vencer» calculado en SQL sobre `costos_obra` y en JS sobre la pestaña coincide;
//   4. la cláusula de estructura de la RPC puede excluir algo de verdad (no es letra muerta).
//
// Los hallazgos de DATO —una fila mal imputada, un duplicado, un subcontrato colgado de otra obra—
// NO ponen roja esta prueba: son trabajo del dueño sobre su pestaña, no una regresión del código.
// Los cuenta el informe y el script sale con código 1; acá se afirma la CAÑERÍA.
//
// Sin base se salta, no se inventa un verde. Se corre con `--sin-sheet` para no pegarle a Google en
// cada corrida de la suite.

import test from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join } from 'node:path'
import { getPool, closePool } from '../lib/db.mjs'

const correr = promisify(execFile)
const SCRIPT = join(import.meta.dirname, 'auditar-costo-por-obra.mjs')
const hayBase = await getPool().query('select 1').then(() => true).catch(() => false)

/** El script sale con 1 cuando hay hallazgos: eso NO es un fallo de ejecución, es su contrato. */
async function informe() {
  try {
    const { stdout } = await correr(process.execPath, [SCRIPT, '--json', '--sin-sheet'], { maxBuffer: 64 * 1024 * 1024 })
    return JSON.parse(stdout)
  } catch (e) {
    if (e.code === 1 && e.stdout) return JSON.parse(e.stdout)
    throw e
  }
}

const de = (j, tipo) => j.hallazgos.filter((x) => x.tipo === tipo)
const listar = (hs) => hs.map((x) => `${x.obra}: ${x.detalle}`).join('\n  ')

test('el costo por obra de la app cuadra con la pestaña', { skip: !hayBase && 'sin base' }, async (t) => {
  const j = await informe()
  t.after(() => closePool())

  await t.test('la sesión que audita ve la mano de obra (si no, todo da null y el verde es falso)', () => {
    assert.equal(j.sesion.rol, 'direccion', `la auditoría corrió como «${j.sesion.rol}»`)
    assert.ok(j.tabla.some((r) => r.mo_app != null), 'ninguna obra publicó mano de obra: la guarda de rol la tapó')
  })

  await t.test('hay obras que auditar', () => {
    assert.ok(j.tabla.length >= 20, `sólo ${j.tabla.length} obras: el catálogo se vació`)
    assert.ok(j.tabla.some((r) => r.ma_app > 0), 'ninguna obra tiene materiales: la cañería está cortada')
  })

  await t.test('1 · la RPC y el recuento independiente sobre `compra_sheet` no difieren en más de $1', () => {
    const d = de(j, 'rpc_vs_recuento')
    assert.deepEqual(d, [], `${d.length} obra(s) con el costo distinto según de dónde se lo cuente:\n  ${listar(d)}`)
  })

  await t.test('2 · cada peso de la columna «Obra» entra al costo o tiene un motivo con nombre', () => {
    const d = de(j, 'conciliacion_incompleta')
    assert.deepEqual(d, [], `${d.length} obra(s) con plata que se fue por un camino desconocido:\n  ${listar(d)}`)
  })

  await t.test('3 · lo «por vencer» da igual calculado en SQL y calculado sobre la pestaña', () => {
    const d = de(j, 'por_vencer_discrepa')
    assert.deepEqual(d, [], `la regla «a la fecha» está implementada de dos maneras:\n  ${listar(d)}`)
  })

  await t.test('4 · la cláusula de estructura de la RPC puede excluir algo de verdad', () => {
    const d = de(j, 'regla_muerta')
    assert.deepEqual(d, [], listar(d))
  })

  await t.test('5 · el espejo no perdió filas: la asignación dice la misma obra que la columna L', () => {
    const d = de(j, 'asignacion_distinta_de_la_columna')
    assert.deepEqual(d, [], `${d.length} fila(s) imputadas a una obra distinta de la que eligió el dueño:\n  ${listar(d)}`)
  })
})
