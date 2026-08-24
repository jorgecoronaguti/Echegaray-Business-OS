// LA CARTERA: EL FILTRO Y LOS CUATRO KPI.
//
// ═══ LOS DEFECTOS QUE ATRAPA ═══
//
// 1. LA CONVERSIÓN CONTADA CONTRA TODO. Si el denominador incluyera los presupuestos todavía
//    abiertos, la conversión BAJARÍA cada vez que se manda una oferta nueva — el sistema le diría
//    a la empresa que cotizar es malo. Se cuenta sólo contra los que tuvieron respuesta.
// 2. EL MARGEN PROMEDIO SIMPLE. Un presupuesto de $ 8 M al 13 % pesa lo mismo que uno de $ 186 M
//    al 18,4 %, y el número publicado no es el margen de ninguna obra ni el de la empresa.
// 3. EL PRESUPUESTO VACÍO QUE SUMA. Su precio de venta es el `coalesce(...,0)` de la vista: entra
//    en el conteo del KPI sin aportar un peso y baja el promedio al dividir.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  filtrarCartera, kpisDeCartera, ordenarCartera, esFiltro, problemasDe, cuentasPorFiltro,
} from './cartera.ts'
import type { EstadoPresupuesto, PresupuestoCascada } from '../types/index.ts'

let n = 0
function p(estado: EstadoPresupuesto, precio: number | null, margen: number | null,
           over: Partial<PresupuestoCascada> = {}): PresupuestoCascada {
  n += 1
  return {
    id: `p${n}`, numero: `COT-${String(n).padStart(3, '0')}`, version: 1, vigente: true, estado,
    cliente: 'Orica', cliente_id: null, obra_nombre: `Obra ${n}`, obra_canonica_id: null,
    fecha_cotizacion: `2026-0${(n % 9) + 1}-01`, congelada_en: null, convertida_obra_id: null,
    parametro_comercial_id: null,
    pct_gastos_generales: 0, pct_beneficio: 0, pct_financiero: 0, factor_financiero: 0,
    pct_iibb: 0, pct_ganancias: 0, pct_cheque: 0, pct_iva: 0,
    costo_directo: 1, hh_previstas: 1, n_partidas: 1, n_sin_analisis: 0, n_sin_computo: 0,
    n_sin_precio_subcontrato: 0,
    gastos_generales: 0, costo_industrial: 1, beneficio: 0, financiero: 0, iibb: 0, ganancias: 0,
    subtotal: 1, impuesto_cheque: 0, venta_sin_iva: precio, iva: 0, venta_final: precio,
    coeficiente_sin_iva: 1, coeficiente_con_iva: 1,
    precio_venta: precio, margen_sobre_precio_pct: margen,
    ...over,
  }
}

test('la conversión NO cuenta los abiertos en el denominador', () => {
  const k = kpisDeCartera([
    p('adjudicada', 100, 17), p('perdida', 50, 12),
    p('borrador', 30, null), p('enviada', 40, 15), p('enviada', 40, 15),
  ])
  assert.equal(k.nConRespuesta, 2)
  assert.equal(k.conversionPct, 50)
})

test('sin ningún presupuesto con respuesta la conversión es «sin dato», nunca 0 %', () => {
  const k = kpisDeCartera([p('borrador', 30, null), p('enviada', 40, 15)])
  assert.equal(k.conversionPct, null)
  assert.equal(k.nConRespuesta, 0)
})

test('el margen se pondera por precio: el presupuesto chico no mueve el número como el grande', () => {
  const k = kpisDeCartera([p('adjudicada', 8_000_000, 13), p('adjudicada', 186_000_000, 18.4)])
  const simple = (13 + 18.4) / 2
  assert.notEqual(Math.round(k.margenPonderadoPct! * 100), Math.round(simple * 100))
  // 8·13 + 186·18,4 sobre 194 = 18,177…
  assert.equal(k.margenPonderadoPct!.toFixed(2), '18.18')
})

test('el margen se mide sobre los ADJUDICADOS: lo que no se ganó no es plata de nadie', () => {
  const k = kpisDeCartera([p('adjudicada', 100, 20), p('perdida', 100, 5), p('enviada', 100, 5)])
  assert.equal(k.margenPonderadoPct, 20)
  assert.equal(k.nConMargen, 1)
})

test('un presupuesto SIN partidas no entra en ningún KPI: su precio lo puso un coalesce', () => {
  const k = kpisDeCartera([
    p('enviada', 100, 15),
    p('enviada', 0, null, { n_partidas: 0, costo_directo: 0 }),
  ])
  assert.equal(k.cotizadoAbierto, 100)
  assert.equal(k.nAbiertos, 1)
})

test('sin nada abierto el cotizado es «sin dato», no $ 0', () => {
  assert.equal(kpisDeCartera([p('adjudicada', 100, 17)]).cotizadoAbierto, null)
  assert.equal(kpisDeCartera([]).adjudicado, null)
})

test('los filtros agrupan por el estado, y anulada no cae en adjudicados', () => {
  const lista = [p('borrador', 1, null), p('enviada', 1, 10), p('adjudicada', 1, 10),
    p('perdida', 1, 10), p('anulada', 1, 10)]
  assert.equal(filtrarCartera(lista, 'abiertos', '').length, 2)
  assert.equal(filtrarCartera(lista, 'adjudicados', '').length, 1)
  assert.equal(filtrarCartera(lista, 'cerrados', '').length, 2)
  assert.equal(filtrarCartera(lista, 'todos', '').length, 5)
})

test('«Con problema» busca el margen NULL, no el cero: un margen de 0 % es una decisión', () => {
  const lista = [p('adjudicada', 1, null), p('adjudicada', 1, 0)]
  const r = filtrarCartera(lista, 'con_problema', '')
  assert.equal(r.length, 1)
  assert.equal(r[0].margen_sobre_precio_pct, null)
})

test('«Con problema» ve las tres deudas de carga, no sólo el margen', () => {
  // Sin esto el chip encontraba el margen NULL y dejaba pasar el presupuesto que publica un precio
  // incompleto —el caso caro—: tres partidas sin análisis de precio y un total que igual se manda.
  const sinAnalisis = p('enviada', 1, 12, { n_sin_analisis: 3 })
  const sinComputo = p('enviada', 1, 12, { n_sin_computo: 2 })
  const sinSubcontrato = p('enviada', 1, 12, { n_sin_precio_subcontrato: 1 })
  const sano = p('enviada', 1, 12)
  const r = filtrarCartera([sinAnalisis, sinComputo, sinSubcontrato, sano], 'con_problema', '')
  assert.deepEqual(r.map((x) => x.id), [sinAnalisis.id, sinComputo.id, sinSubcontrato.id])
  assert.deepEqual(problemasDe(sano), [])
})

test('un presupuesto SIN partidas no está «sin margen»: le falta empezar, no el costo', () => {
  // `coalesce(...,0)` de la vista deja el borrador vacío con margen NULL. Contarlo como problema
  // llenaba el chip de presupuestos recién creados y tapaba los que de verdad hay que corregir.
  assert.deepEqual(problemasDe(p('borrador', null, null, { n_partidas: 0 })), [])
})

test('un presupuesto CERRADO no aparece «con problema»: ya no se puede corregir', () => {
  assert.deepEqual(problemasDe(p('perdida', 1, null, { n_sin_analisis: 4 })), [])
  assert.deepEqual(problemasDe(p('anulada', 1, null, { n_sin_analisis: 4 })), [])
})

test('el contador de cada chip respeta la búsqueda de la caja', () => {
  // El defecto: contar sobre la cartera entera mientras la tabla muestra lo buscado. El chip decía
  // 2 y abajo había 1 — dos números distintos de la misma cosa, en la misma barra.
  const lista = [
    p('enviada', 1, 12, { obra_nombre: 'Escuela San Juan' }),
    p('adjudicada', 1, 12, { obra_nombre: 'Galpón Pocito' }),
  ]
  const c = cuentasPorFiltro(lista, 'escuela')
  assert.equal(c.todos, 1)
  assert.equal(c.abiertos, 1)
  assert.equal(c.adjudicados, 0)
})

test('un link viejo con ?filtro=sin_margen sigue abriendo «Con problema»', () => {
  assert.equal(esFiltro('sin_margen'), 'con_problema')
  assert.equal(esFiltro('con_problema'), 'con_problema')
  assert.equal(esFiltro('cualquiera'), 'todos')
})

test('el buscador filtra por número, obra y cliente, sin distinguir mayúsculas', () => {
  const lista = [p('enviada', 1, 10, { numero: 'COT-2026-018', obra_nombre: 'Escuela San Juan', cliente: 'Orica' })]
  assert.equal(filtrarCartera(lista, 'todos', 'escuela').length, 1)
  assert.equal(filtrarCartera(lista, 'todos', 'ORICA').length, 1)
  assert.equal(filtrarCartera(lista, 'todos', '2026-018').length, 1)
  assert.equal(filtrarCartera(lista, 'todos', 'galpón').length, 0)
})

test('el presupuesto sin fecha va al FINAL, no al principio', () => {
  const lista = [p('enviada', 1, 10, { fecha_cotizacion: null, numero: 'SIN' }),
    p('enviada', 1, 10, { fecha_cotizacion: '2026-01-01', numero: 'VIEJO' }),
    p('enviada', 1, 10, { fecha_cotizacion: '2026-08-01', numero: 'NUEVO' })]
  assert.deepEqual(ordenarCartera(lista).map((x) => x.numero), ['NUEVO', 'VIEJO', 'SIN'])
})

test('un filtro inventado en la URL cae en «todos» en vez de vaciar la lista', () => {
  assert.equal(esFiltro('inventado'), 'todos')
  assert.equal(esFiltro(null), 'todos')
  assert.equal(esFiltro('cerrados'), 'cerrados')
})

test('el buscador ignora las tildes: nadie las escribe cuando busca', () => {
  const lista = [p('enviada', 1, 10, { obra_nombre: 'Albañilería del pañol', cliente: 'Orica' })]
  assert.equal(filtrarCartera(lista, 'todos', 'albanileria').length, 1)
  assert.equal(filtrarCartera(lista, 'todos', 'PAÑOL').length, 1)
})
