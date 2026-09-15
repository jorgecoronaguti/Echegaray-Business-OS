// EL COSTO DE MANO DE OBRA DE UNA QUINCENA, POR OBRA Y PERSONA — el modelo del dueño (14/09/2026).
//
// ═══ QUÉ DEFECTOS ATRAPA ═══
//
// Cada caso es uno de los errores medidos en Quattropani 01–14/09 (el OS cargaba $6,15 M; el modelo
// del dueño da ≈ $3,86 M). Si se revierte la regla, el caso se pone rojo:
//
//   · MULTIPLICADOR SOBRE EL TOTAL: 94 h × $/h × 1,671 da $922.650; el costo es el costo total
//     empleador del recibo + el negro sin cargas = $885.244.
//   · MES ENTERO DEL JEFE: el jefe cuesta MEDIO sueldo por quincena (900.000 − neto + costo empleador),
//     y no depende de cuántas horas cargó en el mes hasta hoy.
//   · LICENCIA A ESTRUCTURA: la licencia paga va a la obra asignada ese día.
//   · SIN TARIFA EN «PARCIAL»: la persona queda FALTA_DATO con sus horas, nunca suma $0.
//
// Los números esperados están escritos a mano desde la regla del dueño, no leídos del módulo.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { costoManoDeObraDeLaQuincena, MOTIVOS_QUE_PAGAN, periodoDeQuincena } from './costo-mo-quincena.mjs'
import { MOTIVO } from './asistencia-motivos.mjs'

const DIR = dirname(fileURLToPath(import.meta.url))
const Q2_08 = { desde: '2026-08-16', hasta: '2026-08-31' }
const Q1_09 = { desde: '2026-09-01', hasta: '2026-09-15' }
const CONVENIO = 'UOCRA — Ley 22.250 (construcción)'
const ESCALAS = [
  { convenio: CONVENIO, categoria: 'Oficial', desde: '2026-07-01', valor_hora: 5817 },
  { convenio: CONVENIO, categoria: 'Oficial', desde: '2026-08-01', valor_hora: 6348 },
  { convenio: CONVENIO, categoria: 'Oficial Especializado', desde: '2026-08-01', valor_hora: 7420 },
]

const persona = (id, extra = {}) => ({
  id, cuil: null, puesto: 'OFICIAL', categoria: 'oficial', convenio: CONVENIO,
  fecha_ingreso: '2025-01-01', fecha_egreso: null, es_prueba: false, ...extra,
})
const dia = (persona_id, fecha, obra, horas, tipo_hora = 'normal', notas = null) =>
  ({ persona_id, fecha, obra_canonica_id: obra, horas, tipo_hora, notas })
/** `n` días seguidos de `horas` desde el día `d` de agosto. */
const dias = (persona_id, obra, n, horas, d = 17) =>
  Array.from({ length: n }, (_, i) => dia(persona_id, `2026-08-${String(d + i).padStart(2, '0')}`, obra, horas))
const tarifa = (persona_id, valor_hora, desde = '2026-08-01', neto_mensual = null) =>
  ({ persona_id, desde, valor_hora, neto_mensual })
const recibo = (persona_id, periodo, horas_blanco, bruto, neto, costo_total_empleador) =>
  ({ persona_id, cuil: null, periodo, horas_blanco, bruto, neto, costo_total_empleador })

const calcular = (e) => costoManoDeObraDeLaQuincena({
  quincena: Q2_08, personas: [], registros: [], tarifas: [], recibos: [], lineas: [], asignaciones: [],
  escalas: ESCALAS, corte: '2026-12-31', ...e,
})
const cerca = (real, esperado, msg) =>
  assert.ok(real != null && Math.abs(real - esperado) < 0.01, `${msg}: ${real} ≠ ${esperado}`)
const filasDe = (r, id) => r.filas.filter((f) => f.persona_id === id)
const deObra = (r, id, obra) => filasDe(r, id).find((f) => f.obra_canonica_id === obra)

test('el período del recibo sale de la quincena', () => {
  assert.equal(periodoDeQuincena(Q2_08), 'Q2-08/2026')
  assert.equal(periodoDeQuincena(Q1_09), 'Q1-09/2026')
})

test('obrero CON recibo: costo total empleador + negro sin cargas, sin multiplicador', () => {
  const r = calcular({
    personas: [persona('reta')],
    registros: [...dias('reta', 'quattropani', 10, 9), dia('reta', '2026-08-27', 'quattropani', 4)],
    tarifas: [tarifa('reta', 5874)],
    recibos: [recibo('reta', 'Q2-08/2026', 88, 558624, 460000, 850000)],
  })
  const [f] = filasDe(r, 'reta')
  assert.equal(filasDe(r, 'reta').length, 1)
  assert.equal(f.obra_canonica_id, 'quattropani')
  assert.equal(f.horas, 94)
  cerca(f.costo_blanco, 850000, 'blanco = costo_total_empleador del recibo')
  cerca(f.costo_negro, 6 * 5874, 'negro = (94 − 88) × $/h negro')
  cerca(f.costo_total, 885244, 'total')
  // LA QUINCENA ABIERTA ES MODELO: estimado aunque haya recibo (dueño, 14/09/2026: cerradas = lo pagado).
  assert.equal(f.estado, 'estimado')
  // EL DEFECTO VIEJO: bolsillo × multiplicador promedio sobre TODO el $/h.
  assert.ok(Math.abs(f.costo_total - 94 * 5874 * 1.671273) > 1000, 'volvió el multiplicador sobre el total')
})

test('obrero SIN recibo del período: mitad × piso × factor de SUS recibos, marcado estimado', () => {
  const r = calcular({
    personas: [persona('rosales')],
    registros: dias('rosales', 'quattropani', 8, 10),
    tarifas: [tarifa('rosales', 5874)],
    recibos: [
      recibo('rosales', 'Q1-08/2026', 80, 400000, 320000, 600000), // 1,50
      recibo('rosales', 'Q2-07/2026', 80, 400000, 316000, 608000), // 1,52
    ],
  })
  const [f] = filasDe(r, 'rosales')
  cerca(f.costo_blanco, 40 * 6348 * 1.51, 'blanco estimado con la mediana de sus recibos')
  cerca(f.costo_negro, 40 * 5874, 'negro = la otra mitad × $/h negro')
  cerca(f.costo_total, 40 * 6348 * 1.51 + 40 * 5874, 'total')
  assert.equal(f.estado, 'estimado')
  assert.match(f.origen, /persona/)
})

test('sin recibos propios con costo empleador: la mediana del plantel', () => {
  const r = calcular({
    personas: [persona('nuevo'), persona('reta'), persona('rosales')],
    registros: dias('nuevo', 'messina', 2, 10),
    tarifas: [tarifa('nuevo', 5874), tarifa('reta', 5874), tarifa('rosales', 5874)],
    recibos: [
      recibo('reta', 'Q2-08/2026', 88, 558624, 460000, 850000), // 1,5216
      recibo('rosales', 'Q1-08/2026', 80, 400000, 320000, 600000), // 1,50
      recibo('rosales', 'Q2-07/2026', 80, 400000, 316000, 608000), // 1,52
    ],
  })
  const [f] = filasDe(r, 'nuevo')
  cerca(f.costo_blanco, 10 * 6348 * 1.52, 'factor = mediana del plantel (1,52)')
  assert.equal(f.estado, 'estimado')
  assert.match(f.origen, /plantel/)
})

const JEFE = persona('maldonado', { puesto: 'JEFE DE OBRA', categoria: 'oficial_especializado' })
const TARIFA_JEFE = tarifa('maldonado', null, '2026-08-01', 1800000)
const RECIBO_JEFE = recibo('maldonado', 'Q2-08/2026', 96, 842912, 663141.56, 1246545.43)

// EL JEFE DE OBRA NO SE REPARTE (dueño, 14/09/2026 18:10): «quitar los jefes de obra de la consideración de horas
// de cualquiera de las horas». Con horas cargadas en dos obras, ninguna recibe un peso: todo va a Administración.
test('jefe mensual CON recibo y horas en DOS obras: costo empleador + (900.000 − neto), ENTERO a Estructura – Administración', () => {
  const r = calcular({
    personas: [JEFE],
    registros: [
      ...dias('maldonado', 'la-estrella', 4, 11),
      ...dias('maldonado', 'san-francisco', 4, 9, 21), dia('maldonado', '2026-08-25', 'san-francisco', 10),
    ],
    tarifas: [TARIFA_JEFE],
    recibos: [RECIBO_JEFE],
  })
  const total = 1246545.43 + (900000 - 663141.56)
  assert.equal(deObra(r, 'maldonado', 'la-estrella'), undefined, 'La Estrella no recibe costo del jefe')
  assert.equal(deObra(r, 'maldonado', 'san-francisco'), undefined, 'San Francisco no recibe costo del jefe')
  assert.deepEqual(filasDe(r, 'maldonado').map((f) => [f.obra_canonica_id, f.destino, f.horas]), [[null, 'ES-ADM', 90]],
    'una sola fila: Administración, con sus 90 h')
  cerca(filasDe(r, 'maldonado')[0].costo_total, total, 'medio sueldo por quincena, entero')
  assert.ok(filasDe(r, 'maldonado').every((f) => f.estado === 'estimado'), 'la quincena abierta es modelo')
})

test('el costo del jefe NO depende de cuántas horas cargó: no es el mes entero a la fecha', () => {
  const con = (registros) => calcular({ personas: [JEFE], registros, tarifas: [TARIFA_JEFE], recibos: [RECIBO_JEFE] })
    .filas.reduce((s, f) => s + f.costo_total, 0)
  const pocas = con([dia('maldonado', '2026-08-17', 'quattropani', 10)])
  const muchas = con(dias('maldonado', 'quattropani', 10, 9))
  cerca(pocas, 1483403.87, '10 h')
  cerca(muchas, 1483403.87, '90 h')
})

test('jefe mensual SIN recibo: estimado con su factor y su cociente neto/bruto', () => {
  const r = costoManoDeObraDeLaQuincena({
    quincena: Q1_09, corte: '2026-09-14', escalas: ESCALAS, lineas: [], asignaciones: [],
    personas: [JEFE],
    registros: Array.from({ length: 9 }, (_, i) =>
      dia('maldonado', `2026-09-${String(1 + i).padStart(2, '0')}`, 'quattropani', i === 8 ? 17 : 9)),
    tarifas: [tarifa('maldonado', null, '2026-09-01', 1800000)],
    recibos: [recibo('maldonado', 'Q1-08/2026', 92, 819168, 663526.08, 1211316.22), RECIBO_JEFE],
  })
  const [f] = r.filas
  const bruto = (89 / 2) * 7420
  const factor = (1211316.22 / 819168 + 1246545.43 / 842912) / 2
  const cociente = (663526.08 / 819168 + 663141.56 / 842912) / 2
  cerca(f.costo_blanco, bruto * factor, 'blanco estimado')
  cerca(f.costo_negro, 900000 - bruto * cociente, 'negro = medio sueldo − neto estimado')
  assert.equal(f.estado, 'estimado')
})

test('licencia paga a la obra ASIGNADA ese día (la asignación corta gana); sin asignación, a Estructura', () => {
  const r = calcular({
    personas: [persona('zogbe')],
    registros: [
      ...dias('zogbe', 'galpon-9', 3, 9),
      dia('zogbe', '2026-08-19', null, 9, 'licencia', 'enfermedad'), // día trabajado: la licencia no suma
      dia('zogbe', '2026-08-21', null, 9, 'licencia', 'enfermedad'), // → messina (tramo corto)
      dia('zogbe', '2026-08-24', null, 9, 'ausencia', 'falta'), // no paga: 0 h
      dia('zogbe', '2026-08-25', null, 9, 'licencia', 'vacaciones'), // sin tramo → Estructura
    ],
    asignaciones: [
      { persona_id: 'zogbe', obra_id: 'galpon-9', desde: '2026-08-01', hasta: '2026-08-23' },
      { persona_id: 'zogbe', obra_id: 'messina', desde: '2026-08-20', hasta: '2026-08-22' },
    ],
    tarifas: [tarifa('zogbe', 5000)],
    recibos: [recibo('zogbe', 'Q2-08/2026', 40, 300000, 240000, 700000)],
  })
  const total = 700000 + 5 * 5000
  assert.equal(deObra(r, 'zogbe', 'galpon-9').horas, 27)
  assert.equal(deObra(r, 'zogbe', 'messina')?.horas, 9, 'la licencia del 21/08 va a la obra asignada')
  assert.equal(deObra(r, 'zogbe', null)?.horas, 9, 'la del 25/08 no tiene obra: Estructura, no se pierde')
  cerca(deObra(r, 'zogbe', 'messina').costo_total, total * 9 / 45, 'messina')
  cerca(filasDe(r, 'zogbe').reduce((s, f) => s + f.costo_total, 0), total, 'el reparto no pierde plata')
})

test('la licencia con obra en la fila va a esa obra', () => {
  const r = calcular({
    personas: [persona('rios')],
    registros: [dia('rios', '2026-08-17', 'messina', 9), dia('rios', '2026-08-18', 'quattropani', 9, 'licencia', 'lluvia')],
    tarifas: [tarifa('rios', 5000)],
    recibos: [recibo('rios', 'Q2-08/2026', 18, 100000, 80000, 150000)],
  })
  assert.equal(deObra(r, 'rios', 'quattropani')?.horas, 9)
})

test('persona en dos obras el mismo día: se suman y se reparte por horas', () => {
  const r = calcular({
    personas: [persona('petina')],
    registros: [dia('petina', '2026-08-17', 'a', 5), dia('petina', '2026-08-17', 'b', 4), dia('petina', '2026-08-18', 'a', 9)],
    tarifas: [tarifa('petina', 5000)],
    recibos: [recibo('petina', 'Q2-08/2026', 18, 200000, 160000, 300000)],
  })
  cerca(deObra(r, 'petina', 'a').costo_total, 300000 * 14 / 18, 'a')
  cerca(deObra(r, 'petina', 'b').costo_total, 300000 * 4 / 18, 'b')
})

test('sin tarifa: FALTA_DATO con sus horas; el total queda vacío, nunca $0', () => {
  const r = calcular({
    personas: [persona('aguero')],
    registros: dias('aguero', 'quattropani', 6, 10),
    recibos: [recibo('aguero', 'Q2-08/2026', 40, 250000, 200000, 400000)],
  })
  const [f] = filasDe(r, 'aguero')
  assert.equal(f.estado, 'falta_dato')
  assert.equal(f.horas, 60)
  assert.equal(f.costo_total, null)
  assert.equal(f.costo_negro, null)
  cerca(f.costo_blanco, 400000, 'lo que sí se sabe se publica')
})

test('extras: el recargo de la planilla se paga en el negro', () => {
  const r = calcular({
    personas: [persona('gonzalez')],
    registros: [dia('gonzalez', '2026-08-17', 'a', 9), dia('gonzalez', '2026-08-17', 'a', 3, 'extra_50', 'extras =9+3*1,5')],
    tarifas: [tarifa('gonzalez', 5000)],
    recibos: [recibo('gonzalez', 'Q2-08/2026', 9, 60000, 48000, 90000)],
  })
  cerca(r.filas[0].costo_negro, (3 + 1.5) * 5000, '3 h que el recibo no paga + 1,5 h de recargo')
})

test('recibo sin horas en la quincena: el costo va a Estructura, no desaparece', () => {
  const r = calcular({
    personas: [persona('avila')],
    tarifas: [tarifa('avila', 5000)],
    recibos: [recibo('avila', 'Q2-08/2026', 80, 160000, 130000, 225000)],
  })
  assert.deepEqual(r.filas.map((f) => [f.obra_canonica_id, f.horas, f.costo_total]), [[null, 0, 225000]])
})

test('las horas posteriores al corte no entran', () => {
  const r = calcular({
    corte: '2026-08-20',
    personas: [persona('reta')],
    registros: dias('reta', 'quattropani', 10, 9),
    tarifas: [tarifa('reta', 5874)],
    recibos: [recibo('reta', 'Q2-08/2026', 18, 100000, 80000, 150000)],
  })
  assert.equal(r.filas[0].horas, 36)
})

test('las personas de prueba no son plantel', () => {
  const r = calcular({ personas: [persona('qa', { es_prueba: true })], registros: dias('qa', 'a', 2, 9), tarifas: [tarifa('qa', 1)] })
  assert.equal(r.filas.length, 0)
})

// ═══ ESTRUCTURA — ADMINISTRACIÓN Y TALLER (dueño, 14/09/2026) ═══
//
// «tenemos q considerar la unidad de negocio estructura taller admin, al momento de asignar un gasto».
// Lo que no es de una obra va a Estructura con su destino: nunca a una obra, nunca perdido.

test('toda fila de obra lleva destino «obra»; lo sin obra va a Estructura – Administración', () => {
  const r = calcular({
    personas: [persona('zogbe'), JEFE],
    registros: [...dias('zogbe', 'galpon-9', 3, 9), dia('zogbe', '2026-08-25', null, 9, 'licencia', 'vacaciones')],
    tarifas: [tarifa('zogbe', 5000), TARIFA_JEFE],
    recibos: [recibo('zogbe', 'Q2-08/2026', 18, 100000, 80000, 150000), RECIBO_JEFE],
  })
  assert.equal(deObra(r, 'zogbe', 'galpon-9').destino, 'obra')
  assert.equal(deObra(r, 'zogbe', null)?.destino, 'ES-ADM', 'la licencia sin asignación es Estructura – Administración')
  assert.equal(deObra(r, 'maldonado', null)?.destino, 'ES-ADM', 'el jefe sin horas en obra va a Administración')
})

test('las horas en una obra de TALLER van a Estructura – Taller, no a una obra', () => {
  const r = calcular({
    obras: [{ id: 'taller-propio', tipo: 'taller' }, { id: 'oficina-central', tipo: 'estructura' }],
    personas: [persona('mecanico', { puesto: 'MECÁNICO' }), persona('reta')],
    registros: [...dias('mecanico', 'taller-propio', 2, 9), ...dias('reta', 'oficina-central', 1, 9), ...dias('reta', 'quattropani', 1, 9, 20)],
    tarifas: [tarifa('mecanico', 5000), tarifa('reta', 5000)],
    recibos: [recibo('mecanico', 'Q2-08/2026', 18, 100000, 80000, 150000), recibo('reta', 'Q2-08/2026', 18, 100000, 80000, 150000)],
  })
  assert.deepEqual(filasDe(r, 'mecanico').map((f) => [f.obra_canonica_id, f.destino, f.horas]), [[null, 'ES-TAL', 18]])
  assert.equal(deObra(r, 'reta', null)?.destino, 'ES-ADM')
  assert.equal(deObra(r, 'reta', 'quattropani')?.horas, 9)
  assert.ok(!r.filas.some((f) => f.obra_canonica_id === 'taller-propio' || f.obra_canonica_id === 'oficina-central'))
})

test('una persona de taller con recibo y sin horas va a Estructura – Taller', () => {
  const r = calcular({
    personas: [persona('quiroz', { puesto: 'Taller' })],
    tarifas: [tarifa('quiroz', 5000)],
    recibos: [recibo('quiroz', 'Q2-08/2026', 80, 300000, 240000, 422185)],
  })
  assert.deepEqual(r.filas.map((f) => [f.obra_canonica_id, f.destino]), [[null, 'ES-TAL']])
})

// ═══ LO ESCRITO A MANO EN LIQUIDACIÓN MANDA (20260915T0300 y T0510, en main) ═══
//
// El costo de la obra tiene que ser lo que Liquidación paga: si alguien escribió el importe negro, las
// horas negro o las horas de la quincena, esa cifra manda sobre el cálculo.

const BASE_MANUAL = {
  personas: [persona('reta')],
  registros: dias('reta', 'quattropani', 10, 9),
  tarifas: [tarifa('reta', 5000)],
  recibos: [recibo('reta', 'Q2-08/2026', 80, 400000, 320000, 600000)],
}
const negroCon = (lineas) => calcular({ ...BASE_MANUAL, lineas }).filas[0].costo_negro

test('negro a mano: importe, horas negro y horas de la quincena mandan sobre el cálculo', () => {
  cerca(negroCon([]), 10 * 5000, 'sin nada escrito: (90 − 80) × $/h')
  cerca(negroCon([{ persona_id: 'reta', negro_manual: 72000 }]), 72000, 'negro_manual')
  cerca(negroCon([{ persona_id: 'reta', horas_negro_manual: 4 }]), 4 * 5000, 'horas_negro_manual × $/h negro')
  cerca(negroCon([{ persona_id: 'reta', horas_manual: 100 }]), 20 * 5000, 'horas_manual: 100 − 80 que paga el recibo')
})

test('con el negro escrito a mano no hace falta la tarifa: deja de ser FALTA_DATO', () => {
  const r = calcular({
    personas: [persona('aguero')],
    registros: dias('aguero', 'quattropani', 6, 10),
    recibos: [recibo('aguero', 'Q2-08/2026', 40, 250000, 200000, 400000)],
    lineas: [{ persona_id: 'aguero', negro_manual: 90000 }],
  })
  assert.equal(r.filas[0].estado, 'estimado')
  cerca(r.filas[0].costo_total, 490000, 'costo empleador + negro escrito')
})

test('las horas a mano no mueven el reparto: las obras siguen repartiendo por sus horas cargadas', () => {
  const r = calcular({
    ...BASE_MANUAL,
    registros: [...dias('reta', 'quattropani', 5, 9), ...dias('reta', 'messina', 5, 9, 22)],
    lineas: [{ persona_id: 'reta', horas_manual: 100 }],
  })
  cerca(deObra(r, 'reta', 'quattropani').costo_total, (600000 + 20 * 5000) / 2, 'mitad y mitad, como las horas cargadas')
})

// ═══ JEFES Y RECIBOS SIN HORAS (auditor, 14/09/2026) ═══

test('MEDIO SUELDO POR QUINCENA, explícito: el negro del jefe es la mitad del mensual menos su neto', () => {
  const r = calcular({ personas: [JEFE], registros: dias('maldonado', 'quattropani', 2, 9), tarifas: [TARIFA_JEFE], recibos: [RECIBO_JEFE] })
  const negro = r.filas.reduce((s, f) => s + f.costo_negro, 0)
  cerca(negro, 1800000 / 2 - 663141.56, 'neto_mensual / 2 − neto del recibo')
  assert.ok(Math.abs(negro - (1800000 - 663141.56)) > 1, 'volvió el mes entero')
})

test('jefe en AGOSTO sin tramo vigente: el 1,8 M del dueño con su recibo, a Estructura – Administración, estimado', () => {
  // «el 1,8 M es el TOTAL que cobran» (dueño). El tramo de persona_tarifa arranca el 01/09 porque ese día se
  // cargó en el OS, no porque el sueldo empezara ahí: se aplica hacia atrás y se marca estimado.
  const r = calcular({ personas: [JEFE], tarifas: [tarifa('maldonado', null, '2026-09-01', 1800000)], recibos: [RECIBO_JEFE] })
  assert.deepEqual(r.filas.map((f) => [f.obra_canonica_id, f.destino]), [[null, 'ES-ADM']])
  cerca(r.filas[0].costo_total, 1483403.87, 'Maldonado Q2-08')
  assert.equal(r.filas[0].estado, 'estimado')
  assert.match(r.filas[0].origen, /primer tramo/)
})

// ═══ QUINCENAS CERRADAS = LO PAGADO REAL (dueño, 14/09/2026) ═══
//
// Costo = costo_total_empleador del recibo + (cobra − neto) de la línea de la liquidación cerrada. Los
// números de Reta son los de la base (Q2-08): 422.185,06 + (669.412 − 192.887,48) = 898.709,58.

const RETA_Q2_08 = recibo('reta', 'Q2-08/2026', 70, 269950, 192887.48, 422185.06)
const cerrada = (e) => calcular({ cerrada: true, ...e })

test('CERRADA con recibo y línea: costo empleador + lo pagado fuera del recibo, real (Reta Q2-08)', () => {
  const r = cerrada({
    personas: [persona('reta')], tarifas: [tarifa('reta', 5924)], recibos: [RETA_Q2_08],
    registros: [...dias('reta', 'quattropani', 12, 9), dia('reta', '2026-08-29', 'quattropani', 5)],
    lineas: [{ persona_id: 'reta', cobra: 669412 }],
  })
  const [f] = r.filas
  cerca(f.costo_total, 898709.58, 'Reta Q2-08: 669.412 pagado + (422.185,06 − 192.887,48)')
  cerca(f.costo_negro, 669412 - 192887.48, 'cobra − neto')
  assert.equal(f.estado, 'real')
  // EL MODELO NO VUELVE EN UNA CERRADA: (113 − 70) × $/h daría otro número.
  assert.ok(Math.abs(f.costo_negro - 43 * 5924) > 1000, 'una quincena cerrada volvió a usar el modelo')
})

test('CERRADA, jefe sin línea: costo empleador + (medio mensual − neto), marcado estimado, a Administración', () => {
  const r = cerrada({ personas: [JEFE], tarifas: [tarifa('maldonado', null, '2026-09-01', 1800000)], recibos: [RECIBO_JEFE] })
  assert.deepEqual(r.filas.map((f) => [f.obra_canonica_id, f.destino, f.estado]), [[null, 'ES-ADM', 'estimado']])
  cerca(r.filas[0].costo_total, 1483403.87, 'Maldonado Q2-08')
  assert.match(r.filas[0].origen, /sin línea/)
})

test('CERRADA, recibo sin línea: sólo el costo del recibo y el faltante marcado (Castro, Moreno, Quiroz)', () => {
  const r = cerrada({ personas: [persona('castro-jm')], recibos: [recibo('castro-jm', 'Q2-08/2026', 80, 269950, 192887.48, 422185.06)] })
  assert.deepEqual(r.filas.map((f) => [f.obra_canonica_id, f.destino, f.estado]), [[null, 'ES-ADM', 'estimado']])
  cerca(r.filas[0].costo_total, 422185.06, 'sólo el recibo')
  assert.match(r.filas[0].origen, /sólo el costo del recibo/)
})

test('CERRADA, línea sin recibo: lo pagado, marcado (Jofre y Sosa en Q2-08)', () => {
  const r = cerrada({ personas: [persona('sosa')], registros: dias('sosa', 'quattropani', 5, 9), lineas: [{ persona_id: 'sosa', cobra: 302100 }] })
  const [f] = r.filas
  cerca(f.costo_total, 302100, 'lo pagado')
  assert.equal(f.costo_blanco, null)
  assert.equal(f.estado, 'estimado')
})

test('los motivos que pagan son los de la tabla del dueño, en JS y en SQL', () => {
  const ts = readFileSync(join(DIR, '../../src/features/administracion/services/liquidacionDeAusencias.ts'), 'utf8')
  const pagan = [...ts.matchAll(/\[MOTIVO\.(\w+)\]:\s*\{\s*paga:\s*true/g)].map((m) => MOTIVO[m[1]]).sort()
  assert.ok(pagan.length >= 9)
  assert.deepEqual([...MOTIVOS_QUE_PAGAN].sort(), pagan)
  const sql = readFileSync(join(DIR, '../../supabase/migrations/20260915T0800_costo_mo_por_obra.sql'), 'utf8')
  const lista = /btrim\(coalesce\(f\.notas, ''\)\) in \(([^)]+)\)/.exec(sql)
  assert.ok(lista, 'la migración no lista los motivos que pagan')
  assert.deepEqual(lista[1].split(',').map((s) => s.trim().replace(/'/g, '')).sort(), pagan)
})

test('el obrero de la MISMA obra sigue repartiéndose: la regla del jefe no toca a nadie más', () => {
  const r = calcular({
    personas: [JEFE, persona('reta')],
    registros: [...dias('maldonado', 'quattropani', 5, 9), ...dias('reta', 'quattropani', 5, 9), ...dias('reta', 'la-estrella', 5, 9, 22)],
    tarifas: [TARIFA_JEFE, tarifa('reta', 5874)],
    recibos: [RECIBO_JEFE, recibo('reta', 'Q2-08/2026', 45, 300000, 250000, 450000)],
  })
  assert.deepEqual(r.filas.filter((f) => f.obra_canonica_id === 'quattropani').map((f) => f.persona_id), ['reta'])
  assert.equal(deObra(r, 'reta', 'quattropani').horas, 45)
  assert.equal(deObra(r, 'reta', 'la-estrella').horas, 45)
})

test('quién es jefe: el corte de esJefeDeObra, en JS y en la SQL de la definición', async () => {
  const { esJefeDeObra } = await import('./costo-mo-quincena.mjs')
  for (const p of ['JEFE DE OBRA', 'jefe_obra', ' Jefe-de  obra ']) assert.equal(esJefeDeObra(p), true, p)
  for (const p of [null, '', 'CAPATAZ', 'jefe de taller', 'OFICIAL']) assert.equal(esJefeDeObra(p), false, String(p))
  const sql = readFileSync(join(DIR, '../../supabase/migrations/20260915T0800_costo_mo_por_obra.sql'), 'utf8')
    .split('\n').map((l) => l.replace(/--.*$/, '')).join('\n')
  const calc = sql.slice(sql.indexOf('create or replace function public.costo_mo_quincena_calculo'), sql.indexOf('$function$;'))
  assert.match(calc, /coalesce\(regexp_replace\(lower\(trim\(p\.puesto\)\), '\[\[:space:\]_-\]\+', '_', 'g'\) in \('jefe_de_obra', 'jefe_obra'\), false\) as es_jefe/)
  // EL DEFECTO: que el jefe vuelva a entrar al reparto por horas o a una obra.
  assert.match(calc, /left join horas_obra ho on pc\.horas > 0 and not pc\.es_jefe and/)
  assert.match(calc, /case when pc\.es_jefe then 'ES-ADM'/)
  assert.match(calc, /case when pc\.horas > 0 and not pc\.es_jefe then ho\.horas \/ pc\.horas else 1 end as k/)
})

// ═══ SIN FECHA DE INGRESO NO ES «DESDE SIEMPRE» (dueño, 15/09/2026) ═══
// MUTACIÓN QUE LO PONE ROJO: volver a `!x.persona.fecha_ingreso ||` en esDelPlantel, o a `p.fecha_ingreso is null or`
// en la SQL de 20260915T0900 / 0910.
test('sin fecha de ingreso, un mensual sin actividad no es plantel; con la fecha cargada, sí', () => {
  const t = tarifa('m', null, '2026-08-01', 1800000)
  assert.deepEqual(calcular({ personas: [persona('m', { fecha_ingreso: null })], tarifas: [t] }).filas, [])
  assert.equal(calcular({ personas: [persona('m')], tarifas: [t] }).filas.length, 1)
  // Con horas en la quincena entra igual: la actividad lo ubica (Jofre).
  assert.equal(calcular({ personas: [persona('jofre', { fecha_ingreso: null })], registros: dias('jofre', 'la-estrella', 2, 9), tarifas: [tarifa('jofre', 5000)] }).filas.length, 1)
})

// ═══ LA CUADRILLA DE UN SUBCONTRATISTA: SU COSTO VA A LA OBRA DEL SUBCONTRATO (dueño, 15/09/2026) ═══
// MUTACIÓN QUE LO PONE ROJO: sacar `sub` de `repartir` → Castro JM vuelve a Estructura – Administración.
test('CERRADA, recibo de quincena de la cuadrilla de Gerson Castro: entero a la obra del subcontrato, nunca a ES-ADM', () => {
  const castro = persona('castro-jm', { subcontrato_obra_id: 'limpieza-de-escombros' })
  const r = cerrada({ personas: [castro], recibos: [recibo('castro-jm', 'Q2-08/2026', 80, 269950, 192887.48, 422185.06)] })
  assert.deepEqual(r.filas.map((f) => [f.obra_canonica_id, f.destino]), [['limpieza-de-escombros', 'obra']])
  cerca(r.filas[0].costo_total, 422185.06, 'el mismo costo del recibo, en otra obra')
  // Con horas cargadas en otra obra, tampoco se reparte: va entero al subcontrato.
  const conHoras = calcular({ personas: [castro], registros: dias('castro-jm', 'quattropani', 2, 9), tarifas: [tarifa('castro-jm', 5000)] })
  assert.deepEqual(conHoras.filas.map((f) => [f.obra_canonica_id, f.destino, f.horas]), [['limpieza-de-escombros', 'obra', 18]])
})

test('«no hay liq final»: un recibo FINAL-08 no es costo de ninguna quincena', () => {
  const gerson = persona('gerson', { subcontrato_obra_id: 'limpieza-de-escombros' })
  const final = recibo('gerson', 'FINAL-08/2026', 26, 167741.01, 123806.34, 224955.08)
  assert.deepEqual(cerrada({ personas: [gerson], recibos: [final] }).filas, [])
  assert.deepEqual(calcular({ quincena: { desde: '2026-08-01', hasta: '2026-08-15' }, personas: [gerson], recibos: [final] }).filas, [])
})

test('la SQL dice lo mismo: 0900 y 0910 exigen el ingreso cargado; 0910 manda la cuadrilla al subcontrato y nunca cruza FINAL', () => {
  // Sin comentarios: la cabecera de 0900 cita la regla vieja para explicar qué cambió.
  const leer = (f) => readFileSync(join(DIR, `../../supabase/migrations/${f}`), 'utf8').split('\n').map((l) => l.replace(/--.*$/, '')).join('\n')
  const ACTIVO = '(p.fecha_ingreso is not null and p.fecha_ingreso <= q.hasta) and (p.fecha_egreso is null or p.fecha_egreso >= q.desde) as activo'
  for (const f of ['20260915T0900_plantel_sin_ingreso_no_es_desde_siempre.sql', '20260915T0910_cuadrilla_de_subcontrato_no_es_plantel_propio.sql']) {
    const sql = leer(f)
    assert.ok(sql.includes(ACTIVO), `${f}: activo volvió a leer el ingreso vacío como «ya estaba»`)
    assert.doesNotMatch(sql, /p\.fecha_ingreso is null or/)
    assert.match(sql, /revoke execute on function public\.costo_mo_quincena_calculo\(date, text\[\]\) from public, anon, authenticated;/)
    assert.doesNotMatch(sql, /grant execute on function public\.costo_mo_quincena_calculo[^;]*authenticated/)
  }
  const sub = leer('20260915T0910_cuadrilla_de_subcontrato_no_es_plantel_propio.sql')
  assert.match(sub, /left join public\.subcontrato sc on sc\.id = p\.subcontrato_id/)
  assert.match(sub, /coalesce\(pc\.sub_obra, ho\.obra\) as obra/)
  assert.match(sub, /case when pc\.sub_obra is not null then 'obra'\n\s+when pc\.es_jefe then 'ES-ADM'/)
  assert.match(sub, /left join horas_obra ho on pc\.horas > 0 and not pc\.es_jefe and pc\.sub_obra is null and/)
  assert.match(sub, /where r\.periodo = q\.periodo/)
  // La columna nace con permiso y la vista no pierde security_invoker.
  assert.match(sub, /grant select \(subcontrato_id\)[^;]*on public\.personas to authenticated;/)
  assert.match(sub, /create or replace view public\.persona_directorio with \(security_invoker = true\) as/)
  assert.match(sub, /revoke all on function public\.persona_para_costo\(\) from public, anon, authenticated;/)
})
