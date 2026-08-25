import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lineasPlanVsReal } from './planVsReal.ts'
import type { EconomiaObra, PlanVsReal } from '../types/index.ts'

// LA AUSENCIA SE PUBLICA COMO AUSENCIA — probado con datos armados, no con los del día.
//
// Estas dos ramas las vigilaba un test de navegador contra la base real. El 19/08 se sellaron las
// líneas base de las ocho obras y el test se puso rojo sin que cambiara una línea de código: estaba
// midiendo el estado del mundo, no la regla. Acá las dos ramas conviven en la misma corrida.

const VACIA = {
  obra_id: 'o1', nombre: 'Prueba', cliente_id: null, cliente_nombre: null, estado: null, etapa: null,
  inicio_plan: null, fin_plan: null, inicio_base: null, fin_base: null, desvio_plazo_dias: null,
  actividades_atrasadas: 0, actividades_con_baseline: 0,
  avance_pct: null, n_actividades_medidas: 0, n_actividades: 0,
  hh_plan: null, hh_estimada: null, hh_real: null, desvio_hh_pct: null,
  presupuesto_id: null, monto_presupuestado: null, costo_presupuestado: null,
  costo_real: null, desvio_costo_pct: null, monto_contratado: null,
} as unknown as PlanVsReal

/** El caso real de quattropani: contrato cargado, tres facturas de materiales, nada más. */
const ECO_SIN_BASE = {
  obra_id: 'o1', obra: 'Prueba',
  venta_contratada: 97650000, adicionales_aprobados: null, n_adicionales_aprobados: 0,
  venta_total: 97650000,
  costo_objetivo: null,
  costo_objetivo_origen: 'sin presupuesto congelado convertido y sin presupuesto cargado para esta obra',
  costo_real: 32937000, costo_real_n_comprobantes: 3, costo_real_mano_de_obra: 0,
  costo_comprometido: null, costo_comprometido_estado: 'no hay fuente',
  costo_restante_proyectado: null, costo_final_proyectado: null,
  base_del_forecast: 'sin presupuesto congelado convertido a esta obra',
  margen_cotizado: null, margen_final_proyectado: null,
  certificado: null, facturado: null, cobrado: null, cobrado_neto: null,
  por_cobrar_proyectado: null, n_cobranzas: 0,
} as EconomiaObra

const linea = (p: PlanVsReal, clave: string) =>
  lineasPlanVsReal(p).find((l) => l.clave === clave)!

test('sin línea base sellada, el plazo NO dice «en fecha»: dice que falta sellarla', () => {
  const l = linea(VACIA, 'plazo')
  assert.equal(l.tono, 'falta')
  assert.match(l.titulo, /línea base no está sellada/i)
  assert.doesNotMatch(l.titulo, /en fecha|coincide/i)
  assert.ok(l.origen.length > 0, 'una línea sin origen no se publica')
})

test('con línea base sellada e igual al plan, el desvío es cero y se dice que coincide', () => {
  const l = linea({ ...VACIA, desvio_plazo_dias: 0, fin_plan: '2026-08-29', fin_base: '2026-08-29' }, 'plazo')
  assert.equal(l.tono, 'ok')
  assert.match(l.titulo, /coincide con la línea base/i)
})

test('el fin corrido contra la línea base sale en alerta y con los días', () => {
  const l = linea({ ...VACIA, desvio_plazo_dias: 12, fin_plan: '2026-09-10', fin_base: '2026-08-29' }, 'plazo')
  assert.equal(l.tono, 'alerta')
  assert.match(l.titulo, /se corrió 12 día/i)
})

test('ninguna línea se publica sin origen ni sin a dónde ir a mirarla', () => {
  for (const l of lineasPlanVsReal(VACIA)) {
    assert.ok(l.origen.trim(), `la línea «${l.clave}» no dice de qué dato sale`)
    assert.ok(l.vista.trim(), `la línea «${l.clave}» no dice a dónde ir`)
  }
})

test('el nivel Obras no arma la línea de margen: el número no existe de ese lado', () => {
  assert.equal(lineasPlanVsReal(VACIA, false).some((l) => l.clave === 'margen'), false)
  assert.equal(lineasPlanVsReal(VACIA, true).some((l) => l.clave === 'margen'), true)
})

// ═══ EL FALSO MARGEN — el defecto 4.5, probado sin base y sin navegador ═══

test('con contrato y costo real pero sin forecast NO se publica margen: se dice que no hay', () => {
  const l = lineasPlanVsReal(VACIA, true, ECO_SIN_BASE).find((x) => x.clave === 'margen')!
  assert.equal(l.tono, 'falta')
  assert.match(l.titulo, /no disponible/i)
  // LA REGRESIÓN QUE ATRAPA: la línea vieja decía «Margen a hoy $64.713.000». Ni ese número ni la
  // palabra «margen a hoy» pueden volver a aparecer con este dato.
  assert.doesNotMatch(l.titulo, /64\.?713\.?000/)
  assert.doesNotMatch(l.titulo, /margen a hoy/i)
  assert.match(l.origen, /costo objetivo|presupuesto/i, 'no dice qué falta para poder calcularlo')
})

test('con costo objetivo aparece el margen COTIZADO, y avisa que el proyectado todavía no', () => {
  const l = lineasPlanVsReal(VACIA, true, {
    ...ECO_SIN_BASE, costo_objetivo: 70000000, margen_cotizado: 27650000,
  }).find((x) => x.clave === 'margen')!
  assert.equal(l.tono, 'ok')
  assert.match(l.titulo, /margen cotizado/i)
  assert.match(l.titulo, /no se puede calcular/i)
})

test('con forecast, el margen es venta − costo final proyectado y lo dice', () => {
  const l = lineasPlanVsReal(VACIA, true, {
    ...ECO_SIN_BASE, costo_final_proyectado: 110000000, margen_final_proyectado: -12350000,
    base_del_forecast: 'INFERENCIA: el costo se proyecta con el factor de HH',
  }).find((x) => x.clave === 'margen')!
  assert.equal(l.tono, 'alerta', 'un margen proyectado negativo no se pintó como alerta')
  assert.match(l.titulo, /margen final proyectado/i)
  assert.match(l.origen, /factor de HH/i, 'el margen proyectado no declara con qué base se calculó')
})
