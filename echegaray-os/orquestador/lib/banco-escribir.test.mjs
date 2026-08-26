// EL EXTRACTO MANDA SOBRE LO PROVISORIO.
//
// Un cobro probado por comprobante entra a la réplica del banco antes que el extracto (26/08: si no,
// CAJA publicaba $12,1M menos de los que había). El día que el extracto lo trae, la fila provisoria
// tiene que DESAPARECER: su referencia es inventada por nosotros y el índice único no la junta con la
// del banco, así que sobrevivir sería contar el mismo peso dos veces. Un duplicado no da error —
// infla la caja en silencio— y por eso esto se prueba, no se confía.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { insertarMovimientos, purgarProvisorios, PROVISORIO } from './banco-escribir.mjs'

/** Puerto de base falso: guarda lo que le mandan y responde lo justo. */
function puerto() {
  const sql = []
  return {
    sql,
    async query(texto, params) {
      sql.push({ texto: texto.replace(/\s+/g, ' ').trim(), params })
      if (/^delete/i.test(texto.trim())) return { rowCount: 2 }
      return { rows: [{ id: sql.length }], rowCount: 1 }
    },
  }
}

test('el extracto borra las provisorias de SU ventana antes de insertar', async () => {
  const p = puerto()
  const r = await insertarMovimientos({ query: p.query }, [
    { fecha: '2026-08-24', concepto: 'a', importe: -1 },
    { fecha: '2026-08-26', concepto: 'b', importe: -2 },
  ], 'archivo extracto.csv')

  const borrado = p.sql[0]
  assert.match(borrado.texto, /^delete from public\.banco_movimientos/)
  assert.equal(borrado.params[2], '2026-08-24', 'la ventana arranca en la fecha más vieja del lote')
  assert.equal(borrado.params[3], '2026-08-26', 'y termina en la más nueva')
  assert.match(String(borrado.params[1]), /^PROVISORIO/, 'sólo borra provisorias, nunca una fila del extracto')
  assert.equal(r.provisoriosDadosDeBaja, 2)
})

test('cargar una provisoria NO borra las provisorias que ya estaban', async () => {
  // Si se purgara a sí misma, dos comprobantes del mismo día se pisarían y el segundo dejaría afuera
  // al primero: la caja quedaría corta justo el día que entraron dos cobros.
  const p = puerto()
  const r = await insertarMovimientos({ query: p.query },
    [{ fecha: '2026-08-26', concepto: 'cobro', importe: 12100000, referencia: 'MP-1' }],
    `${PROVISORIO} · comprobante del dueño`)

  assert.equal(p.sql.filter((s) => /^delete/.test(s.texto)).length, 0)
  assert.equal(r.provisoriosDadosDeBaja, 0)
})

test('sin movimientos no se borra nada — un lote vacío no puede vaciar la ventana', async () => {
  const p = puerto()
  assert.equal(await purgarProvisorios({ query: p.query }, []), 0)
  assert.equal(p.sql.length, 0)
})

test('la referencia se escribe: sin ella el índice único vive sobre NULLs', async () => {
  const p = puerto()
  await insertarMovimientos({ query: p.query },
    [{ fecha: '2026-08-26', concepto: 'cobro', importe: 1, saldo: 10, referencia: 'MP-174750988287' }], 'x')
  const insert = p.sql.find((s) => /^insert/i.test(s.texto))
  assert.equal(insert.params[6], 'MP-174750988287')
  assert.equal(insert.params[4], 10, 'y el saldo corrido también, que es lo que CAJA publica')
})
