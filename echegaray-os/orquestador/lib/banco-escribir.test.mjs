// EL EXTRACTO MANDA SOBRE LO PROVISORIO.
//
// Un cobro probado por comprobante entra a la réplica del banco antes que el extracto (26/08: si no,
// CAJA publicaba $12,1M menos de los que había). El día que el extracto lo trae, la fila provisoria
// tiene que DESAPARECER: su referencia es inventada por nosotros y el índice único no la junta con la
// del banco, así que sobrevivir sería contar el mismo peso dos veces. Un duplicado no da error —
// infla la caja en silencio— y por eso esto se prueba, no se confía.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  insertarMovimientos, purgarProvisorios, PROVISORIO,
  marcarAcreditacionPendiente, acreditarPendientes,
} from './banco-escribir.mjs'

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

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// LA MARCA DE RETENCIÓN TIENE QUE SER DE IDA Y DE VUELTA
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// Un depósito de eCheq retenido 48 hs se marca con el extracto que lo trae sin acreditar, y se
// DESMARCA con el extracto siguiente, que sí trae su saldo corrido. Si el camino de vuelta no corre,
// la plata queda fuera de CAJA para siempre: medido el 11/09/2026 con $38.572.526,23 retenidos.
//
// Ninguna de las dos necesita la línea «Saldo al DD/MM/AAAA» del pie del extracto: trabajan sobre el
// `saldo` que trae cada movimiento del propio CSV. Eso es lo que estos tests fijan.

test('marcar retiene: pone la marca y BORRA el saldo calculado, que era el número inflado', async () => {
  const p = puerto()
  const n = await marcarAcreditacionPendiente({ query: p.query }, [
    { fecha: '2026-09-10', concepto: 'Deposito echeq', importe: 38572526.23, referencia: 'R1', acreditacionPendiente: true },
    { fecha: '2026-09-10', concepto: 'Pago', importe: -1000, referencia: 'R2' },
  ])
  assert.equal(n, 1, 'sólo el depósito retenido')
  const u = p.sql.filter((x) => /^update/i.test(x.texto))
  assert.equal(u.length, 1)
  assert.match(u[0].texto, /acreditacion_pendiente = true/)
  assert.match(u[0].texto, /saldo_despues = null/, 'el saldo que teníamos era un cálculo nuestro, y era el error')
  assert.match(u[0].texto, /acreditacion_pendiente is not true/, 'idempotente: no re-marca lo ya marcado')
})

test('acreditar libera: apaga la marca y COPIA el saldo del banco, no lo recalcula', async () => {
  const p = puerto()
  const n = await acreditarPendientes({ query: p.query }, [
    { fecha: '2026-09-12', concepto: 'Deposito echeq', importe: 38572526.23, referencia: 'R1', saldo: 41561209.16 },
  ])
  assert.equal(n, 1)
  const u = p.sql.find((x) => /^update/i.test(x.texto))
  assert.match(u.texto, /acreditacion_pendiente = false/)
  assert.match(u.texto, /saldo_despues = \$4/)
  assert.equal(u.params[3], 41561209.16, 'el saldo es el que imprimió el banco')
  assert.match(u.texto, /and acreditacion_pendiente$/, 'sólo toca lo que estaba retenido')
})

test('un movimiento SIN saldo no acredita nada: el banco todavía no lo confirmó', async () => {
  const p = puerto()
  assert.equal(await acreditarPendientes({ query: p.query }, [
    { fecha: '2026-09-11', concepto: 'Deposito echeq', importe: 38572526.23, referencia: 'R1', saldo: null },
  ]), 0)
  assert.equal(p.sql.filter((x) => /^update/i.test(x.texto)).length, 0)
})

test('el que sigue retenido en el extracto nuevo tampoco acredita, aunque traiga saldo', async () => {
  const p = puerto()
  assert.equal(await acreditarPendientes({ query: p.query }, [
    { fecha: '2026-09-11', concepto: 'Dep', importe: 1, referencia: 'R1', saldo: 10, acreditacionPendiente: true },
  ]), 0, 'marcado y con saldo a la vez: manda la marca')
})

// EL CAMINO DE VUELTA EN EL IMPORTADOR, donde estaba roto. `cerrarElDia` no se puede importar (el
// script corre `main()` al importarse y reescribiría el Sheet real), así que se mide el FUENTE — el
// mismo método que ya usa `scripts/importar-banco.test.mjs` por la misma razón.
test('el importador actualiza las marcas TAMBIÉN cuando el extracto no trae el pie', async () => {
  const { readFileSync } = await import('node:fs')
  const src = readFileSync(new URL('../scripts/importar-banco.mjs', import.meta.url), 'utf8')
  const codigo = src.split(/\r?\n/).filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')
  // La rama del `if (!pie)`, desde la condición hasta su `return`.
  const rama = /if \(!pie\) \{([\s\S]*?)\n  \}/.exec(codigo)
  assert.ok(rama, 'no encontré la rama del extracto sin pie')
  assert.match(rama[1], /marcasDeRetencion\(movimientos\)/,
    'sin esto la marca es de ida y no de vuelta: la plata queda fuera de CAJA para siempre')
  assert.match(rama[1], /if \(DRY\)/, '--dry no puede escribir en la base por este camino')
  // Y la definición sigue llamando a las dos: una sola no alcanza.
  const fn = /async function marcasDeRetencion\([\s\S]*?\n\}/.exec(codigo)
  assert.ok(fn, 'no encontré marcasDeRetencion')
  assert.match(fn[0], /marcarAcreditacionPendiente/)
  assert.match(fn[0], /acreditarPendientes/)
})
