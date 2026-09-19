import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { RANGOS_DE_CAJA } from '../scripts/caja-pestana.mjs'

// UN RANGO CON NOMBRE QUE NO SE REPUBLICA ES UNA FILA ESCRITA A MANO CON MEJOR LETRA.
//
// El 01/08, la primera vez que el generador rehízo CAJA (había estado candada), el bloque 4.10 bajó
// diez filas y los cuatro nombres del arqueo —creados una vez a mano y nunca reapuntados— quedaron
// sobre la fila del TIPO DE CAMBIO. "Caja en dólares" pasó a leerse a sí misma y dieron #REF! el
// total de disponibilidades, el piso de caja y la exposición en moneda extranjera.

const SRC = readFileSync(new URL('../scripts/caja-pestana.mjs', import.meta.url), 'utf8')

test('los cinco rangos de CAJA se publican desde la grilla, no desde un número fijo', () => {
  const nombres = RANGOS_DE_CAJA.map((r) => r.nombre)
  assert.deepEqual(nombres.sort(), [
    'CAJA_ARQUEO_ARS', 'CAJA_ARQUEO_ARS_FECHA', 'CAJA_ARQUEO_USD', 'CAJA_ARQUEO_USD_FECHA', 'TIPO_CAMBIO_USD',
  ])
  for (const r of RANGOS_DE_CAJA) assert.equal(typeof r.fila, 'function', `${r.nombre} tiene que resolver su fila contra la grilla`)
})

test('el arqueo publica importe (C) y fecha (F) de la MISMA fila', () => {
  // Si el importe y la fecha se publicaran de filas distintas, la ventana de "movimientos posteriores
  // al arqueo" se acotaría con la fecha de otro conteo: el error más caro y el más difícil de ver.
  const ars = RANGOS_DE_CAJA.filter((r) => /ARQUEO_ARS/.test(r.nombre))
  const usd = RANGOS_DE_CAJA.filter((r) => /ARQUEO_USD/.test(r.nombre))
  for (const par of [ars, usd]) {
    assert.equal(par.length, 2)
    assert.deepEqual(par.map((r) => r.col).sort(), [2, 5], 'importe en C y fecha en F')
    const g = { fArqArs: 151, fArqUsd: 152 }
    assert.equal(par[0].fila(g), par[1].fila(g), 'las dos tienen que salir de la misma fila')
  }
})

test('cada nombre que usan las fórmulas de la pestaña está en la lista que se publica', () => {
  // El agujero real: las constantes de arriba del archivo se usaban en las fórmulas y sólo UNA se
  // publicaba. Si mañana se agrega un ARQ_* nuevo y no entra en RANGOS_DE_CAJA, esto lo caza.
  const usados = new Set()
  for (const m of SRC.matchAll(/\bCAJA_ARQUEO_[A-Z_]+|\bTIPO_CAMBIO_USD\b/g)) usados.add(m[0])
  const publicados = new Set(RANGOS_DE_CAJA.map((r) => r.nombre))
  for (const n of usados) assert.ok(publicados.has(n), `"${n}" se usa en las fórmulas pero NO se republica`)
})

test('una fila que no existe NO publica el rango en vez de dejarlo apuntando a cualquier lado', () => {
  // Fail-closed: el rango viejo apuntando a una fila que ya no es la suya miente sin dar error.
  // Que no se publique deja un #NAME? o el valor anterior, que al menos se ve.
  const g = {}
  for (const r of RANGOS_DE_CAJA) {
    const f = r.fila(g)
    assert.ok(!Number.isFinite(f), 'sin grilla, ninguna fila resuelve a un número')
  }
})
