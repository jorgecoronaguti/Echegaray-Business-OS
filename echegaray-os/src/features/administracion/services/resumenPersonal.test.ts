import test from 'node:test'
import assert from 'node:assert/strict'
import { contar, metricasDelListado, type FilaContable } from './resumenPersonal.ts'

// EL PIE DE MÉTRICAS NO PUEDE LLAMAR «PLANTEL» A UN RESULTADO DE BÚSQUEDA.
//
// ═══ EL DEFECTO QUE ATRAPAN ESTAS PRUEBAS ═══
//
// La franja cuenta las filas que la tabla está mostrando. Es lo correcto —una segunda consulta sería
// una segunda verdad— y es también la trampa: esas filas cambian con el filtro y con el buscador,
// pero el rótulo no cambia solo. Un pie que dice «PLANTEL 2» después de escribir «Juan» afirma que
// la empresa tiene dos personas, y el número es correcto: lo que miente es la palabra.
//
// Es exactamente el defecto que en el Sheet escondió $292,8 M —un encabezado de período que dejó de
// describir la columna de abajo—. Si alguien vuelve a fijar el rótulo, estas pruebas se ponen rojas.

const persona = (p: Partial<FilaContable> = {}): FilaContable => ({
  obra_actual_id: null, cuadrilla_id: null, en_la_empresa: true, ...p,
})

const TRES: FilaContable[] = [
  persona({ obra_actual_id: 'escuela', cuadrilla_id: 'c1' }),
  persona({ obra_actual_id: 'escuela', cuadrilla_id: 'c1' }),
  persona(),
]

test('cuenta la obra por su ID, no por su nombre', () => {
  // `obra_actual` (el nombre) lo resuelve un join y puede venir vacío para una obra que sí existe:
  // contar por el nombre bajaría «en obra» sin que nada avise.
  const n = contar(TRES)
  assert.equal(n.total, 3)
  assert.equal(n.enObra, 2)
  assert.equal(n.sinAsignar, 1)
  assert.equal(n.sinCuadrilla, 1)
})

test('BUSCANDO, el conjunto se llama por lo que es: coincidencias, no plantel', () => {
  const m = metricasDelListado({ filtro: 'plantel', buscando: true, personas: TRES })
  assert.equal(m[0].etiqueta, 'Coinciden', 'un resultado de búsqueda se está publicando como el plantel')
  assert.equal(m[0].valor, 3)
})

test('en INACTIVOS el conjunto no se llama plantel — y no se le pregunta dónde trabaja', () => {
  const m = metricasDelListado({
    filtro: 'inactivos',
    buscando: false,
    personas: [persona({ en_la_empresa: false }), persona({ en_la_empresa: false })],
  })
  assert.equal(m[0].etiqueta, 'Inactivos')
  assert.deepEqual(
    m.map((x) => x.etiqueta), ['Inactivos'],
    'a quien ya no está se le está dibujando obra o cuadrilla: quedaron cerradas al egresar',
  )
})

test('el mismo número no se publica dos veces con dos nombres', () => {
  for (const filtro of ['en_obra', 'sin_asignar'] as const) {
    const m = metricasDelListado({ filtro, buscando: false, personas: TRES })
    const valores = m.map((x) => `${x.etiqueta}=${x.valor}`)
    assert.equal(
      new Set(m.map((x) => x.valor)).size >= 1 && m.filter((x) => x.valor === TRES.length).length, 1,
      `en «${filtro}» el total aparece más de una vez: ${valores.join(' · ')}`,
    )
  }
})

test('«sin asignar 0» no se pinta de ámbar: el color existe para lo que hay que mirar', () => {
  const todos = [persona({ obra_actual_id: 'escuela', cuadrilla_id: 'c1' })]
  const m = metricasDelListado({ filtro: 'plantel', buscando: false, personas: todos })
  const sinAsignar = m.find((x) => x.etiqueta === 'Sin asignar')
  assert.equal(sinAsignar?.valor, 0)
  assert.equal(sinAsignar?.tono, undefined, 'un ámbar sobre un 0 gasta la señal para cuando importe')
})

test('con gente sin asignar, la franja lo marca', () => {
  const m = metricasDelListado({ filtro: 'plantel', buscando: false, personas: TRES })
  assert.equal(m.find((x) => x.etiqueta === 'Sin asignar')?.tono, 'warn')
})

// ═══ EL PIE DEL CANÓNICO 19 ═══
//
// Tres defectos que se pintan en verde y son falsos:
//   1. «EN OBRA HOY 0» cuando la vista de presencia no se pudo leer — dice que no vino nadie.
//   2. «EN OBRA HOY» contado por la ASIGNACIÓN en vez de por la fichada — el rótulo promete
//      presencia y muestra otra cosa.
//   3. «HH DEL MES 0» cuando la lectura de horas falló.

import { metricasCanonicas, type FilaDelPie } from './resumenPersonal.ts'
import type { MarcaDeHoy } from './pulsoDelPlantel.ts'

const P: FilaDelPie[] = [
  { id: 'a', obra_actual_id: 'o1', cuadrilla_id: 'c1', en_la_empresa: true },
  { id: 'b', obra_actual_id: 'o1', cuadrilla_id: null, en_la_empresa: true },
  { id: 'c', obra_actual_id: null, cuadrilla_id: null, en_la_empresa: true },
]
// «a» fichó y sigue adentro; «b» está ASIGNADA a la obra pero no fichó. Son dos preguntas distintas.
const MARCAS = new Map<string, MarcaDeHoy>([['a', { persona_id: 'a', estado: 'activo' }]])
const HH = new Map<string, number>([['a', 168], ['b', 8.5]])
const rot = (m: { rotulo: string }[]) => m.map((x) => x.rotulo)
const val = (m: { rotulo: string; valor: string }[], r: string) => m.find((x) => x.rotulo === r)?.valor

test('EN OBRA HOY cuenta la FICHADA, no la asignación', () => {
  const m = metricasCanonicas({
    filtro: 'plantel', buscando: false, personas: P, marcas: MARCAS, hh: HH,
    hoyDisponible: true, hhDisponible: true,
  })
  // Dos personas están asignadas a «o1». Sólo una fichó. El rótulo dice HOY: gana la fichada.
  assert.equal(val(m, 'EN OBRA HOY'), '1')
  assert.equal(val(m, 'PLANTEL'), '3')
  assert.equal(val(m, 'SIN ASIGNAR'), '1')
})

test('una fuente que no se pudo leer NO publica su cifra en cero', () => {
  const m = metricasCanonicas({
    filtro: 'plantel', buscando: false, personas: P, marcas: MARCAS, hh: HH,
    hoyDisponible: false, hhDisponible: false,
  })
  assert.ok(!rot(m).includes('EN OBRA HOY'), '«EN OBRA HOY 0» diría que no vino nadie a trabajar')
  assert.ok(!rot(m).includes('HH DEL MES'), '«HH DEL MES 0» diría que el plantel no trabajó')
  assert.deepEqual(rot(m), ['PLANTEL', 'SIN ASIGNAR'])
})

test('HH DEL MES suma lo imputado y quien no tiene registro no baja el total a cero', () => {
  const m = metricasCanonicas({
    filtro: 'plantel', buscando: false, personas: P, marcas: MARCAS, hh: HH,
    hoyDisponible: true, hhDisponible: true,
  })
  assert.equal(val(m, 'HH DEL MES'), '176,5 h')
})

test('el rótulo del conjunto sigue al filtro, y a los inactivos no se les pregunta por hoy', () => {
  const buscando = metricasCanonicas({
    filtro: 'plantel', buscando: true, personas: P, marcas: MARCAS, hh: HH,
    hoyDisponible: true, hhDisponible: true,
  })
  assert.equal(buscando[0].rotulo, 'COINCIDEN')

  const inactivos = metricasCanonicas({
    filtro: 'inactivos', buscando: false, personas: P, marcas: MARCAS, hh: HH,
    hoyDisponible: true, hhDisponible: true,
  })
  assert.deepEqual(rot(inactivos), ['INACTIVOS'])
})

test('SIN ASIGNAR se enciende en ámbar sólo cuando hay alguien', () => {
  const conTodos: FilaDelPie[] = P.map((p) => ({ ...p, obra_actual_id: 'o1' }))
  const m = metricasCanonicas({
    filtro: 'plantel', buscando: false, personas: conTodos, marcas: MARCAS, hh: HH,
    hoyDisponible: true, hhDisponible: true,
  })
  assert.equal(m.find((x) => x.rotulo === 'SIN ASIGNAR')?.tono, 'ink')
})
