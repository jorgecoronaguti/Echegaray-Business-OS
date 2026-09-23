// EL SYNC DEL SHEET NO PISA NI BORRA LO QUE SE PIDIÓ DESDE LA APP (23/09/2026).
//
// El defecto que esto atrapa: alguien «mejora» el sync para que refleje el Sheet entero (borrar lo que
// no está, o actualizar todo lo que coincide) y los pedidos cargados en `/campo/material` desaparecen
// o vuelven a «PEDIDO» en la siguiente corrida. Se afirma sobre el SQL declarado y sobre el script.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ORIGEN_DEL_SHEET, PREFIJO_ID_APP, SQL_UPSERT_PEDIDO, esIdDelSheet } from './pedidos-materiales-sync.mjs'

const DIR = dirname(fileURLToPath(import.meta.url))
const script = readFileSync(join(DIR, '..', 'scripts', 'sync-pedidos-materiales.mjs'), 'utf8')
const sinComentarios = (s) => s.replace(/^\s*\/\/.*$/gm, '')

test('el upsert sólo actualiza filas cuyo origen es el del Sheet', () => {
  assert.match(SQL_UPSERT_PEDIDO, /on conflict \(id_pedido\) do update/)
  assert.match(SQL_UPSERT_PEDIDO, new RegExp(`where public\\.pedidos_materiales\\.origen = '${ORIGEN_DEL_SHEET}'`))
  // El set no toca `origen`: una fila del Sheet decidida en el OS (`os`) tampoco vuelve atrás.
  const set = SQL_UPSERT_PEDIDO.split('do update set')[1].split(/\bwhere\b/)[0]
  assert.doesNotMatch(set, /\borigen\s*=/)
})

test('el sync inserta con origen del Sheet y nunca borra ni vacía la tabla', () => {
  assert.match(SQL_UPSERT_PEDIDO, new RegExp(`'${ORIGEN_DEL_SHEET}', now\\(\\)`))
  const s = sinComentarios(script)
  assert.doesNotMatch(s, /\b(delete\s+from|truncate)\b/i)
  assert.match(s, /SQL_UPSERT_PEDIDO/, 'el script usa el SQL declarado, no una copia')
})

test('un id de la app nunca coincide con uno del Sheet', () => {
  assert.equal(PREFIJO_ID_APP, 'APP-')
  assert.equal(esIdDelSheet('APP-3f2a1b-1'), false)
  assert.equal(esIdDelSheet('79ca0fda'), true)
  assert.equal(esIdDelSheet('5'), true)
})
