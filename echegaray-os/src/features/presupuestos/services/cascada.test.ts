// LA CASCADA DE PRECIO — QUÉ SE PUBLICA Y QUÉ NO.
//
// ═══ EL DEFECTO QUE ATRAPA ═══
//
// `cotizacion_cascada` hace `coalesce(sum(v.subtotal), 0)` para poder agrupar. Un presupuesto
// recién creado, sin una sola partida, devuelve costo directo 0 y —arrastrado por la cascada—
// VENTA 0. Si la pantalla lo dibujara tal cual, la cartera mostraría una oferta de $ 0 junto a las
// reales y el KPI «cotizado abierto» sumaría ceros como si fueran decisiones.
//
// El test contrario importa igual: un presupuesto CON partidas cuyo costo da 0 sí publica 0. Ahí
// el cero es un hecho —recursos sin precio en la base maestra— y taparlo escondería la deuda de
// carga que `n_sin_analisis` está denunciando en la misma fila.
//
// LOS NÚMEROS DEL FIXTURE SON LOS REALES de la obra ORICA con los parámetros vigentes: costo
// directo $92.087.947,11 → venta sin IVA $154.888.969,47 → venta final $187.415.653,06. Salen de
// `cotizacion_cascada`, no se recalculan acá, y así el fixture no puede quedar internamente
// inconsistente sin que alguien lo note.

import test from 'node:test'
import assert from 'node:assert/strict'
import { escalonesDe, incidencia, tieneCifras, estaCongelado } from './cascada.ts'
import type { PresupuestoCascada } from '../types/index.ts'

function cascada(over: Partial<PresupuestoCascada> = {}): PresupuestoCascada {
  return {
    id: 'p1', numero: 'COT-2026-018', version: 1, vigente: true, estado: 'borrador',
    cliente: 'Orica', cliente_id: null, obra_nombre: 'Demolición y mortero', obra_canonica_id: null,
    fecha_cotizacion: '2026-02-28', congelada_en: null, convertida_obra_id: null,
    parametro_comercial_id: 'pc1',
    pct_gastos_generales: 0.27, pct_beneficio: 0.22, pct_financiero: 0.07, factor_financiero: 0.5,
    pct_iibb: 0.024, pct_ganancias: 0.02, pct_cheque: 0.012, pct_iva: 0.21,
    costo_directo: 92087947.11, hh_previstas: 1496, n_partidas: 24,
    n_sin_analisis: 0, n_sin_computo: 0, n_sin_precio_subcontrato: 0,
    gastos_generales: 24863745.72, costo_industrial: 116951692.83,
    beneficio: 25729372.42, financiero: 4093309.25,
    iibb: 3424345.57, ganancias: 2853621.31, subtotal: 153052341.37,
    impuesto_cheque: 1836628.10, venta_sin_iva: 154888969.47,
    iva: 32526683.59, venta_final: 187415653.06,
    coeficiente_sin_iva: 1.681968, coeficiente_con_iva: 2.035181,
    precio_venta: 154888969.47, margen_sobre_precio_pct: 16.61,
    ...over,
  }
}

/** Todos los importes de la cascada en cero, que es lo que devuelve la vista sin partidas. */
const EN_CERO: Partial<PresupuestoCascada> = {
  costo_directo: 0, gastos_generales: 0, costo_industrial: 0, beneficio: 0, financiero: 0,
  iibb: 0, ganancias: 0, subtotal: 0, impuesto_cheque: 0, venta_sin_iva: 0, iva: 0,
  venta_final: 0, precio_venta: 0,
}

test('un presupuesto SIN partidas no publica una venta de cero', () => {
  const vacio = cascada({ n_partidas: 0, hh_previstas: 0, ...EN_CERO })
  assert.equal(tieneCifras(vacio), false)
  for (const e of escalonesDe(vacio)) assert.equal(e.monto, null, `${e.clave} publicó un cero fabricado`)
})

test('un presupuesto CON partidas y costo cero SÍ publica el cero: ahí el cero es un hecho', () => {
  const sinPrecios = cascada({ n_partidas: 3, n_sin_analisis: 3, hh_previstas: null, ...EN_CERO })
  assert.equal(tieneCifras(sinPrecios), true)
  const venta = escalonesDe(sinPrecios).find((e) => e.clave === 'venta_sin_iva')
  assert.equal(venta?.monto, 0)
})

test('los escalones salen en el ORDEN DEL LIBRO, con el industrial y el subtotal como cortes', () => {
  const claves = escalonesDe(cascada()).map((e) => e.clave)
  assert.deepEqual(claves, [
    'costo_directo', 'gastos_generales', 'costo_industrial', 'beneficio', 'financiero',
    'iibb', 'ganancias', 'subtotal', 'impuesto_cheque', 'venta_sin_iva', 'iva', 'venta_final',
  ])
  // La VENTA SIN IVA cierra el precio de la empresa: el IVA es plata de terceros que pasa.
  assert.equal(escalonesDe(cascada()).find((e) => e.clave === 'venta_sin_iva')?.final, true)
})

test('cada escalón declara SOBRE QUÉ BASE se aplica: ahí está lo que cuesta plata entender mal', () => {
  const porClave = Object.fromEntries(escalonesDe(cascada()).map((e) => [e.clave, e]))
  assert.match(porClave.gastos_generales.subtitulo, /sobre el costo directo/)
  // El beneficio es MARKUP sobre el costo, no margen sobre el precio: el error más caro.
  assert.match(porClave.beneficio.subtitulo, /sobre el costo industrial/)
  assert.match(porClave.beneficio.subtitulo, /markup, no margen/)
  // El financiero NO incluye el beneficio en su base, y financia medio período.
  assert.match(porClave.financiero.subtitulo, /sobre el costo industrial · medio del período/)
  assert.match(porClave.iibb.subtitulo, /sobre industrial \+ beneficio/)
  assert.match(porClave.ganancias.subtitulo, /sobre industrial \+ beneficio/)
  assert.match(porClave.impuesto_cheque.subtitulo, /sobre el subtotal/)
})

test('el coeficiente que publica la venta es el de la BASE, no uno recalculado acá', () => {
  const sub = escalonesDe(cascada()).find((e) => e.clave === 'venta_sin_iva')!.subtitulo
  assert.match(sub, /coeficiente 1,6820/)
  // Sin coeficiente no se inventa uno dividiendo: se dice qué es el renglón y ya.
  const sinCoef = escalonesDe(cascada({ coeficiente_sin_iva: null })).find((e) => e.clave === 'venta_sin_iva')!
  assert.equal(sinCoef.subtitulo, 'el precio que se oferta')
})

test('el escalón financiero aparece SÓLO si el presupuesto lo cargó', () => {
  const sinFinanciero = escalonesDe(cascada({ pct_financiero: 0, financiero: 0 }))
  assert.ok(!sinFinanciero.some((e) => e.clave === 'financiero'))
  assert.ok(escalonesDe(cascada()).some((e) => e.clave === 'financiero'))
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
