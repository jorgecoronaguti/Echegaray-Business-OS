// EL CAMINO `updateCells` NO TENÍA NINGUNA GUARDA DE CONTENIDO — de punta a punta, contra la base.
//
// Lo usan los dos tableros de cheques, el libro de movimientos y el relleno de cola de CAJA. Al no
// pasar por `batchUpdateValues` se saltea `no-borrar.mjs` Y la huella: una celda que el dueño vaciaba
// en "Cheques Emitidos" volvía a la corrida siguiente y no había ni un mensaje sobre eso.
//
// Los tests puros de `no-reponer.test.mjs` no pueden ver esto porque la marca vive en SQL y la lectura
// del destino la hace el cliente de Google. Acá se usa un cliente falso y un file_id sintético.
//
// ═══ TODO ADENTRO DE UNA TRANSACCIÓN QUE TERMINA EN ROLLBACK (25/09/2026) ═══
//
// Escribía COMMITEADO sobre la base productiva (`declararEscrituraEnPrueba`), con el mismo patrón
// optimista —`file_id` sintético + `t.after`— que dejó basura de prueba en producción en otros dos
// archivos. La marca de vaciado y la lectura que la consume (`marcasDeVaciado`, en `no-reponer.mjs`)
// ahora comparten la conexión prestable de `huella-celda-db.mjs`, así que las dos ven la MISMA
// transacción: «la corrida siguiente no repone la celda» se prueba igual, sin dejar nada commiteado.
import test from 'node:test'
import assert from 'node:assert/strict'
import { marcasDeVaciado, noReponerPorCeldas, olvidarMarcas } from './no-reponer.mjs'
import { guardarHuellas, conConexion } from './huella-celda.mjs'
import { getPool, query } from './db.mjs'

const FILE = `TEST_NOREPONER_${process.pid}`
const TAB = 'Cheques Emitidos'
const SHEET_ID = 42

const hayBase = await query('select 1').then(() => true).catch(() => false)

/** El cuerpo corre con TODAS las lecturas/escrituras de `sheet_huella_celda` por una conexión en
 *  transacción, y se deshace. `olvidarMarcas` es en memoria (el caché de `no-reponer.mjs`): no
 *  necesita transacción, pero sí limpiarse entre tests para no arrastrar la marca del anterior. */
async function enRollback(fn) {
  olvidarMarcas(FILE, TAB)
  const c = await getPool().connect()
  try {
    await c.query('begin')
    return await conConexion(c, fn)
  } finally {
    await c.query('rollback').catch(() => {})
    c.release()
  }
}

/** Un cliente de Google mínimo: resuelve el sheetId a su título y relee el rectángulo pedido. */
const cliente = (destino) => ({
  async getSheetMeta() { return [{ sheetId: SHEET_ID, title: TAB }] },
  async readSheetValues() { return destino },
})

/** Deja marcada como vaciada por el dueño la celda (fila, col) — 1-based / 0-based. */
const marcarVaciada = async (fila, col, forma) => {
  await guardarHuellas(FILE, TAB, [[forma]], { fila0: fila, col0: col })
  await guardarHuellas(FILE, TAB, [['']], {
    fila0: fila, col0: col, suprimidas: [{ fila, col, filaHoy: fila, colHoy: col, forma, huella: 'x' }],
  })
  olvidarMarcas(FILE, TAB)
}

test('updateCells NO repone la celda que el dueño vació', { skip: !hayBase && 'sin base' }, () => enRollback(async () => {
  await marcarVaciada(3, 1, 'cheques firmados y no debitados')

  // El generador arranca en A1 (0-based) y quiere reponer ese rótulo en B3, que hoy está vacía.
  const values = [['a', 'b'], ['c', 'd'], ['e', 'CHEQUES FIRMADOS Y NO DEBITADOS']]
  const out = await noReponerPorCeldas(cliente([['a', 'b'], ['c', 'd'], ['e', '']]), FILE, SHEET_ID, values, { fila0: 0, col0: 0 })
  assert.equal(out[2][1], '', 'la celda que vaciaste NO vuelve por el camino de updateCells')
  assert.equal(out[2][0], 'e', 'el resto del bloque se escribe igual')
}))

test('sin marca no pasa nada: una pestaña sin historia se escribe entera', { skip: !hayBase && 'sin base' }, () => enRollback(async () => {
  const values = [['A', 'B']]
  const out = await noReponerPorCeldas(cliente([['', '']]), FILE, SHEET_ID, values, { fila0: 0, col0: 0 })
  assert.deepEqual(out, values, 'la guarda no puede congelar una pestaña que nunca selló nada')
}))

test('la marca se lee con la fila 1-based aunque updateCells hable en 0-based', { skip: !hayBase && 'sin base' }, () => enRollback(async () => {
  await marcarVaciada(10, 0, 'un rótulo largo del tablero de cheques')
  // El bloque arranca en la fila 8 del Sheet (fila0 = 7 en 0-based): la marca de la 10 cae en el índice 2.
  const values = [['x'], ['y'], ['UN RÓTULO LARGO DEL TABLERO DE CHEQUES']]
  const out = await noReponerPorCeldas(cliente([['x'], ['y'], ['']]), FILE, SHEET_ID, values, { fila0: 7, col0: 0 })
  assert.equal(out[2][0], '', 'la conversión de base pasa por un solo lugar y acierta')
}))

test('un espejo _* queda afuera: una réplica no tiene decisiones del dueño adentro', { skip: !hayBase && 'sin base' }, () => enRollback(async () => {
  const espejo = { async getSheetMeta() { return [{ sheetId: SHEET_ID, title: '_MOVIMIENTOS' }] }, async readSheetValues() { return [['']] } }
  const values = [['lo que dice la fuente']]
  assert.deepEqual(await noReponerPorCeldas(espejo, FILE, SHEET_ID, values, { fila0: 0, col0: 0 }), values)
}))

test('sin base la escritura NO se cae: no decidir es el único lado seguro acá', async () => {
  const roto = { async getSheetMeta() { throw new Error('sin red') } }
  const values = [['A']]
  assert.deepEqual(await noReponerPorCeldas(roto, 'ID', SHEET_ID, values, {}), values)
})

test('marcasDeVaciado devuelve sólo lo marcado, no toda la huella', { skip: !hayBase && 'sin base' }, () => enRollback(async () => {
  await guardarHuellas(FILE, TAB, [['viva uno', 'viva dos']], { fila0: 1, col0: 0 })
  await marcarVaciada(5, 3, 'la que el dueño vació')
  const marcas = await marcasDeVaciado(FILE, TAB)
  assert.deepEqual([...marcas], ['5:3'])
}))

test('NO QUEDA NADA: después de las pruebas, cero filas de prueba en la tabla real', { skip: !hayBase && 'sin base' }, async () => {
  const n = await query(`select count(*)::int n from public.sheet_huella_celda where file_id like 'TEST_NOREPONER_%'`)
  assert.equal(n.rows[0].n, 0, 'una fila TEST_NOREPONER_* en producción es un test que escribió fuera de su transacción')
})
