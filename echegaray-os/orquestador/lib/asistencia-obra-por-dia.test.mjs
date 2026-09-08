import test from 'node:test'
import assert from 'node:assert/strict'
import {
  fechaDeCelda, limpiarNombre, filasDeValues, agruparPorPersonaDia, planDeCorreccion, planillaSinHh,
} from './asistencia-obra-por-dia.mjs'
import { resolutorDeObra, normAlias } from './jornales-a-registros-hh.mjs'

const CAB = ['ID ASISTENCIA', 'FECHA', 'CLIENTE', 'ID OBRA', 'NOMBRE', 'HORAS', 'OBSERVACION', 'ENCARGADO', 'QUINCENA']
const fila = (fecha, cliente, obra, nombre, horas = 9) => ['id', fecha, cliente, obra, nombre, horas, 'obs', 'rodrigo@ecsas.com.ar', 'agosto Q1']

const personas = [
  { id: 'p1', nombre_completo: 'AGUERO CRISTIAN DOMINGO', en_la_empresa: true, es_prueba: false },
  { id: 'p2', nombre_completo: 'SOSA NESTOR RAUL', en_la_empresa: true, es_prueba: false },
]
const resolver = resolutorDeObra({
  alias: new Map([
    [normAlias('JS - IMOTOR Mamposteria'), 'sf-mamposteria'],
    [normAlias('JS - IMOTOR Entrepiso'), 'entrepiso-y-escalera'],
    [normAlias('La Estrella Comedor'), 'le-comedor'],
  ]),
  canonicas: [], clienteAlias: new Map(),
})
const armar = (filas) => agruparPorPersonaDia(filasDeValues([CAB, ...filas]).filas, { personas, resolver })

test('la fecha llega como serial de Sheets, como dd/mm/aaaa o como ISO', () => {
  assert.equal(fechaDeCelda(46242), '2026-08-08')   // el serial que devuelve UNFORMATTED_VALUE
  assert.equal(fechaDeCelda('10/08/2026'), '2026-08-10')
  assert.equal(fechaDeCelda('2026-08-10'), '2026-08-10')
  assert.equal(fechaDeCelda(''), null)
  assert.equal(fechaDeCelda('sin fecha'), null)
})

test('la coma del apellido no es un token: «AGUERO, CRISTIAN» empareja', () => {
  assert.equal(limpiarNombre('AGUERO,  CRISTIAN DOMINGO'), 'AGUERO CRISTIAN DOMINGO')
  const { dias } = armar([fila(46244, 'JS - IMOTOR', 'Mamposteria', 'AGUERO, CRISTIAN DOMINGO')])
  assert.equal(dias.size, 1)
  assert.equal([...dias.values()][0].persona_id, 'p1')
})

test('se lee por encabezado, no por posición: una columna nueva al principio no rompe', () => {
  const conColumnaExtra = [['LO QUE SEA', ...CAB], ['x', ...fila(46244, 'JS - IMOTOR', 'Mamposteria', 'SOSA NESTOR RAUL')]]
  const { filas } = filasDeValues(conColumnaExtra)
  assert.equal(filas[0].obra, 'Mamposteria')
  assert.equal(filas[0].fecha, '2026-08-10')
})

test('sin la columna FECHA se para: no se adivina la posición', () => {
  assert.throws(() => filasDeValues([['CLIENTE', 'ID OBRA', 'NOMBRE', 'HORAS']]), /FECHA/)
})

test('lo que no resuelve no se inventa: persona y rótulo desconocidos se listan', () => {
  const r = armar([
    fila(46244, 'JS - IMOTOR', 'Mamposteria', 'PEREZ JUAN'),
    fila(46244, 'CLIENTE RARO', 'Obra Rara', 'SOSA NESTOR RAUL'),
  ])
  assert.equal(r.dias.size, 0)
  assert.equal(r.sinPersona.length, 1)
  assert.deepEqual(r.sinObra.map((x) => x.rotulo), ['CLIENTE RARO :: Obra Rara'])
})

test('EL DEFECTO: JORNALES rotuló la quincena con una obra y la planilla dice otra ese día', () => {
  const { dias } = armar([fila(46244, 'JS - IMOTOR', 'Mamposteria', 'AGUERO, CRISTIAN DOMINGO')])
  const hh = [{ id: 'r1', persona_id: 'p1', fecha: '2026-08-10', obra_canonica_id: 'le-comedor', tipo_hora: 'normal', horas: 9, fuente_legacy: 'sheet:jornales' }]
  const p = planDeCorreccion({ dias, hh })
  assert.equal(p.corregir.length, 1)
  assert.deepEqual({ de: p.corregir[0].de, a: p.corregir[0].a }, { de: 'le-comedor', a: 'sf-mamposteria' })
  assert.equal(p.coinciden, 0)
})

test('idempotente: si la obra ya es la de la planilla, no hay nada que corregir', () => {
  const { dias } = armar([fila(46244, 'JS - IMOTOR', 'Mamposteria', 'AGUERO, CRISTIAN DOMINGO')])
  const hh = [{ id: 'r1', persona_id: 'p1', fecha: '2026-08-10', obra_canonica_id: 'sf-mamposteria', tipo_hora: 'normal', horas: 9, fuente_legacy: 'sheet:jornales' }]
  const p = planDeCorreccion({ dias, hh })
  assert.deepEqual(p.corregir, [])
  assert.equal(p.coinciden, 1)
})

test('dos obras el mismo día: NO se reparte, se lista para el dueño', () => {
  const { dias } = armar([
    fila(46244, 'JS - IMOTOR', 'Mamposteria', 'AGUERO, CRISTIAN DOMINGO', 4),
    fila(46244, 'JS - IMOTOR', 'Entrepiso', 'AGUERO, CRISTIAN DOMINGO', 5),
  ])
  const hh = [{ id: 'r1', persona_id: 'p1', fecha: '2026-08-10', obra_canonica_id: 'le-comedor', tipo_hora: 'normal', horas: 9, fuente_legacy: 'sheet:jornales' }]
  const p = planDeCorreccion({ dias, hh })
  assert.deepEqual(p.corregir, [])
  assert.equal(p.ambiguos.length, 1)
  assert.deepEqual(p.ambiguos[0].obras.map((o) => o.obra_id), ['entrepiso-y-escalera', 'sf-mamposteria'])
})

test('una fila de la web no se toca aunque contradiga a la planilla', () => {
  const { dias } = armar([fila(46244, 'JS - IMOTOR', 'Mamposteria', 'AGUERO, CRISTIAN DOMINGO')])
  const hh = [{ id: 'r1', persona_id: 'p1', fecha: '2026-08-10', obra_canonica_id: 'le-comedor', tipo_hora: 'normal', horas: 9, fuente_legacy: 'web:asistencia-obra' }]
  const p = planDeCorreccion({ dias, hh })
  assert.deepEqual(p.corregir, [])
  assert.equal(p.contradiceWeb.length, 1)
})

test('ausencia y licencia no eligen obra: no se tocan', () => {
  const { dias } = armar([fila(46244, 'JS - IMOTOR', 'Mamposteria', 'AGUERO, CRISTIAN DOMINGO')])
  const hh = [
    { id: 'r1', persona_id: 'p1', fecha: '2026-08-10', obra_canonica_id: null, tipo_hora: 'licencia', horas: 8.8, fuente_legacy: 'sheet:jornales' },
    { id: 'r2', persona_id: 'p1', fecha: '2026-08-10', obra_canonica_id: null, tipo_hora: 'ausencia', horas: 0, fuente_legacy: 'sheet:jornales' },
  ]
  const p = planDeCorreccion({ dias, hh })
  assert.deepEqual(p.corregir, [])
  assert.equal(p.noTrabajadas.length, 2)
})

test('las horas extra sí se corrigen: son horas trabajadas en una obra', () => {
  const { dias } = armar([fila(46244, 'JS - IMOTOR', 'Mamposteria', 'AGUERO, CRISTIAN DOMINGO')])
  const hh = [{ id: 'r1', persona_id: 'p1', fecha: '2026-08-10', obra_canonica_id: 'le-comedor', tipo_hora: 'extra_50', horas: 2, fuente_legacy: 'sheet:jornales' }]
  assert.equal(planDeCorreccion({ dias, hh }).corregir.length, 1)
})

test('día de la planilla sin ninguna hora en la base: se lista, no se crea', () => {
  const { dias } = armar([fila(46244, 'JS - IMOTOR', 'Mamposteria', 'SOSA NESTOR RAUL')])
  assert.deepEqual(planillaSinHh({ dias, hh: [] }), [{ persona: 'SOSA NESTOR RAUL', fecha: '2026-08-10', obras: ['sf-mamposteria'] }])
  const hh = [{ persona_id: 'p2', fecha: '2026-08-10', tipo_hora: 'normal' }]
  assert.deepEqual(planillaSinHh({ dias, hh }), [])
})

// ═══ segundas oportunidades de emparejamiento (rótulos abreviados del encargado) ═══
import { emparejarPersonaPlanilla } from './asistencia-obra-por-dia.mjs'
import { indicePersonas } from './jornales-a-registros-hh.mjs'

const plantel = indicePersonas([
  { id: 'j1', nombre_completo: 'JOFRE ISMAEL', en_la_empresa: false },
  { id: 'j2', nombre_completo: 'PETINA RODRIGUEZ JAIRO EMANUEL', en_la_empresa: true },
  { id: 'j3', nombre_completo: 'GONZALEZ TOBARES JUAN GUILLERMO', en_la_empresa: true },
])

test('EL DEFECTO: «PETINA RODRIGUEZ JAIRO E» quedaba sin persona por la inicial suelta', () => {
  const r = emparejarPersonaPlanilla('PETINA RODRIGUEZ JAIRO E', plantel)
  assert.equal(r.estado, 'ok')
  assert.equal(r.persona.id, 'j2')
  assert.equal(r.criterio, 'inicial_truncada')
})

test('EL DEFECTO: el legajo dice «JOFRE ISMAEL» y la planilla «JOFRE ALBERTO ISMAEL»', () => {
  const r = emparejarPersonaPlanilla('JOFRE ALBERTO ISMAEL', plantel)
  assert.equal(r.estado, 'ok')
  assert.equal(r.persona.id, 'j1')
  assert.equal(r.criterio, 'legajo_mas_corto')
})

test('el emparejamiento exacto sigue mandando y se marca como tal', () => {
  const r = emparejarPersonaPlanilla('GONZALEZ TOBARES JUAN GUILLERMO', plantel)
  assert.equal(r.criterio, 'exacto')
  assert.equal(r.persona.id, 'j3')
})

test('una persona que no está en el legajo NO se inventa con la segunda oportunidad', () => {
  const r = emparejarPersonaPlanilla('GONZALEZ TOBARES EMILIAN', plantel)
  assert.notEqual(r.estado, 'ok')
})

test('la segunda oportunidad exige candidata única: dos que caben, ninguna gana', () => {
  const dos = indicePersonas([
    { id: 'a', nombre_completo: 'QUIROGA SEBASTIAN' },
    { id: 'b', nombre_completo: 'QUIROGA ADOLFO' },
  ])
  assert.notEqual(emparejarPersonaPlanilla('QUIROGA SEBASTIAN ADOLFO', dos).estado, 'ok')
})
