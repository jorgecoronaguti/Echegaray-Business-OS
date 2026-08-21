// LA CASCADA DE PRECIO — QUÉ SE PUBLICA Y QUÉ NO.
//
// ═══ EL DEFECTO QUE ATRAPA ═══
//
// `cotizacion_cascada` hace `coalesce(sum(v.subtotal), 0)` para poder agrupar. Un presupuesto
// recién creado, sin una sola partida, devuelve costo directo 0 y —arrastrado por la cascada—
// PRECIO DE VENTA 0. Si la pantalla lo dibujara tal cual, la cartera mostraría una oferta de $ 0
// junto a las reales y el KPI «cotizado abierto» sumaría ceros como si fueran decisiones.
//
// El test contrario importa igual: un presupuesto CON partidas cuyo costo da 0 sí publica 0. Ahí
// el cero es un hecho —recursos sin precio en la base maestra— y taparlo escondería la deuda de
// carga que `n_sin_analisis` está denunciando en la misma fila.

import test from 'node:test'
import assert from 'node:assert/strict'
import { escalonesDe, incidencia, tieneCifras, estaCongelado } from './cascada.ts'
import type { PresupuestoCascada } from '../types/index.ts'

function cascada(over: Partial<PresupuestoCascada> = {}): PresupuestoCascada {
  return {
    id: 'p1', numero: 'COT-2026-018', version: 1, vigente: true, estado: 'borrador',
    cliente: 'Orica', cliente_id: null, obra_nombre: 'Escuela San Juan', obra_canonica_id: null,
    fecha_cotizacion: '2026-02-28', congelada_en: null, convertida_obra_id: null,
    pct_indirectos: 0.12, pct_gastos_generales: 0.06, pct_margen: 0.17, pct_financiero: 0,
    pct_impuestos: 0.035,
    costo_directo: 131082400, hh_previstas: 1496, n_partidas: 24, n_sin_analisis: 0, n_sin_computo: 0,
    indirectos: 15729888, gastos_generales: 7864944, costo_total: 154677232,
    margen: 26295129, financiero: 0, subtotal_antes_impuestos: 180972361,
    impuestos: 6334032, precio_venta: 187306393, margen_sobre_precio_pct: 14.53,
    ...over,
  }
}

test('un presupuesto SIN partidas no publica un precio de venta de cero', () => {
  const vacio = cascada({ n_partidas: 0, costo_directo: 0, indirectos: 0, gastos_generales: 0,
    costo_total: 0, margen: 0, financiero: 0, subtotal_antes_impuestos: 0, impuestos: 0,
    precio_venta: 0, hh_previstas: 0 })
  assert.equal(tieneCifras(vacio), false)
  for (const e of escalonesDe(vacio)) assert.equal(e.monto, null, `${e.clave} publicó un cero fabricado`)
})

test('un presupuesto CON partidas y costo cero SÍ publica el cero: ahí el cero es un hecho', () => {
  const sinPrecios = cascada({ n_partidas: 3, n_sin_analisis: 3, costo_directo: 0, indirectos: 0,
    gastos_generales: 0, costo_total: 0, margen: 0, financiero: 0, subtotal_antes_impuestos: 0,
    impuestos: 0, precio_venta: 0, hh_previstas: null })
  assert.equal(tieneCifras(sinPrecios), true)
  const precio = escalonesDe(sinPrecios).find((e) => e.clave === 'precio_venta')
  assert.equal(precio?.monto, 0)
})

test('los escalones salen en el orden de la cascada y el precio la cierra', () => {
  const claves = escalonesDe(cascada()).map((e) => e.clave)
  assert.deepEqual(claves, ['costo_directo', 'indirectos', 'gastos_generales', 'margen', 'impuestos', 'precio_venta'])
  assert.equal(escalonesDe(cascada()).at(-1)?.final, true)
})

test('el escalón financiero aparece SÓLO si el presupuesto lo cargó', () => {
  assert.ok(!escalonesDe(cascada()).some((e) => e.clave === 'financiero'))
  const conFinanciero = escalonesDe(cascada({ pct_financiero: 0.04, financiero: 6187089 }))
  assert.ok(conFinanciero.some((e) => e.clave === 'financiero'))
})

test('el subtítulo del costo directo NUNCA dice «0 HH»: sin análisis no hay horas que declarar', () => {
  const sub = escalonesDe(cascada({ hh_previstas: 0 }))[0].subtitulo
  assert.match(sub, /sin HH cargadas/)
  assert.ok(!sub.includes('0 HH'))
  assert.match(escalonesDe(cascada({ hh_previstas: null }))[0].subtitulo, /sin HH cargadas/)
  assert.match(escalonesDe(cascada())[0].subtitulo, /^1\.496 HH · 24 partidas$/)
})

test('la incidencia se mide contra el costo directo y sin base devuelve null, no cero', () => {
  assert.equal(incidencia(926763, 131082400)?.toFixed(2), '0.71')
  assert.equal(incidencia(926763, 0), null)
  assert.equal(incidencia(null, 131082400), null)
  assert.equal(incidencia(926763, null), null)
})

test('congelado se decide por congelada_en, no por el estado', () => {
  assert.equal(estaCongelado(cascada()), false)
  assert.equal(estaCongelado(cascada({ estado: 'adjudicada' })), false)
  assert.equal(estaCongelado(cascada({ congelada_en: '2026-02-28T10:00:00Z' })), true)
})
