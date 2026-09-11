// EL ESPEJO DE LA PLANILLA JORNALES. Lo que cada test protege es la razón por la que el dueño podría
// dejar de abrir el Sheet: que la fila diga lo mismo, que la celda vacía se pueda escribir, y que el
// chip no diga «coincide» sobre una comparación que no se hizo.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  cotejoConLaPlanilla, diasDelEspejo, filasDelEspejo, totalesDelEspejo, type DatosDelEspejo,
} from './espejoDeJornales.ts'
import { liquidarLinea } from './liquidacionQuincena.ts'
import { sinOverrides } from './liquidacionOverrides.ts'

// 1 al 15 de septiembre de 2026. El 6 y el 13 son domingos.
const Q = { desde: '2026-09-01', hasta: '2026-09-15' } as const

const linea = (horas: number | null, valorHora: number | null = 3650) => sinOverrides(liquidarLinea({
  personaId: 'p1', nombre: 'Maldonado', horas,
  tarifa: valorHora == null ? null : { valorHora, netoMensual: null, desde: '2026-01-01', origen: 'test' },
  adelanto: 0, yaTransferido: 0, reciboNeto: null, giroEnElLote: false,
}, 'obreros'))

const base = (extra: Partial<DatosDelEspejo> = {}): DatosDelEspejo => ({
  quincena: Q,
  personas: [{ id: 'p1', nombre: 'Maldonado', valorHora: 3650, convenio: 'UOCRA' }],
  registros: [],
  presencias: [],
  lineas: { p1: { grupo: 'obreros', linea: linea(0) } },
  cuadrosCerrados: new Set(),
  horasDeLaPlanilla: new Map([['p1', 0]]),
  diasDeLaPlanilla: new Map(),
  hayEspejo: true,
  hoy: '2026-09-15',
  ...extra,
})

test('LAS COLUMNAS SON LUNES A SÁBADO; EL DOMINGO APARECE SÓLO SI TIENE HORAS', () => {
  // EL DEFECTO QUE ATRAPA: esconder una columna que tiene horas cargadas. Si alguien trabajó el
  // domingo 6 y la tabla no lo dibuja, la fila suma un número que no se puede ver en ningún día.
  assert.equal(diasDelEspejo(Q, new Set()).length, 13)
  const conDomingo = diasDelEspejo(Q, new Set(['2026-09-06']))
  assert.equal(conDomingo.length, 14)
  assert.ok(conDomingo.includes('2026-09-06'))
  assert.ok(!conDomingo.includes('2026-09-13'), 'el domingo sin horas no agrega columna')
})

test('UNA CELDA VACÍA SE PUEDE ESCRIBIR, Y SIN REGISTRO NO TIENE A QUIÉN IMPUTARLE TODAVÍA', () => {
  // EL DEFECTO QUE ATRAPA: que `sin-cargar` siga siendo de sólo lectura. Es el gesto central de la
  // planilla —escribir el 8 en la celda del martes— y era el que la app no dejaba hacer.
  const [fila] = filasDelEspejo(base())
  assert.equal(fila.celdas[0].marca, 'sin-cargar')
  assert.equal(fila.celdas[0].editable, true)
  assert.equal(fila.celdas[0].registroId, null)
  assert.equal(fila.celdas[0].registros, 0)
})

test('UN DÍA CON UN REGISTRO SE CORRIGE SOBRE ESA FILA; CON DOS NO SE ELIGE EN SILENCIO', () => {
  const [fila] = filasDelEspejo(base({
    registros: [
      { persona_id: 'p1', id: 'r1', fecha: '2026-09-01', tipo_hora: 'normal', horas: 9 },
      { persona_id: 'p1', id: 'r2', fecha: '2026-09-02', tipo_hora: 'normal', horas: 4 },
      { persona_id: 'p1', id: 'r3', fecha: '2026-09-02', tipo_hora: 'extra_50', horas: 2 },
    ],
  }))
  assert.equal(fila.celdas[0].registroId, 'r1')
  assert.equal(fila.celdas[0].editable, true)
  assert.equal(fila.celdas[1].registros, 2)
  assert.equal(fila.celdas[1].editable, false, 'dos candidatas: elige el panel, no la pantalla')
  assert.equal(fila.celdas[1].registroId, null)
})

test('UNA AUSENCIA NO SE EDITA EN LÍNEA, Y UNA QUINCENA CERRADA NO SE EDITA EN NINGUNA CELDA', () => {
  const [conAusencia] = filasDelEspejo(base({
    presencias: [{ persona_id: 'p1', fecha: '2026-09-01', estado: 'ausente', motivo: null }],
  }))
  assert.equal(conAusencia.celdas[0].marca, 'ausencia')
  assert.equal(conAusencia.celdas[0].editable, false)

  const [cerrada] = filasDelEspejo(base({ cuadrosCerrados: new Set(['obreros']) }))
  assert.equal(cerrada.cerrada, true)
  assert.ok(cerrada.celdas.every((c) => !c.editable), 'lo cerrado no se edita (R6)')
})

test('UN REGISTRO SIN `id` APAGA LA CELDA EN VEZ DE ESCRIBIR A CIEGAS', () => {
  const [fila] = filasDelEspejo(base({
    registros: [{ persona_id: 'p1', fecha: '2026-09-01', tipo_hora: 'normal', horas: 9 }],
  }))
  assert.equal(fila.celdas[0].editable, false)
})

test('«SIN ESPEJO» NO ES «COINCIDE»: un control que no pudo mirar no dice que está bien', () => {
  // EL DEFECTO QUE ATRAPA: devolver `coincide` cuando no hay lectura de la planilla. El dueño dejaría
  // de abrir el Sheet creyendo que alguien comparó, y nadie comparó.
  assert.equal(cotejoConLaPlanilla(97, null).estado, 'sin-espejo')
  assert.equal(cotejoConLaPlanilla(97, null).diferencia, null)
  const [fila] = filasDelEspejo(base({ hayEspejo: false, horasDeLaPlanilla: new Map([['p1', 97]]) }))
  assert.equal(fila.cotejo.estado, 'sin-espejo')
})

test('EL COTEJO COMPARA HORAS CRUDAS, NO LIQUIDABLES', () => {
  // La planilla suma las celdas del bloque: 9 + 0 = 9. Las liquidables de ese mismo par de días son
  // 9 también, pero con una licencia que paga la jornada dejarían de coincidir para siempre.
  const registros = [
    { persona_id: 'p1', id: 'r1', fecha: '2026-09-01', tipo_hora: 'normal', horas: 9 },
    { persona_id: 'p1', id: 'r2', fecha: '2026-09-02', tipo_hora: 'licencia', horas: 0, notas: 'enfermedad' },
  ]
  const [coincide] = filasDelEspejo(base({ registros, horasDeLaPlanilla: new Map([['p1', 9]]) }))
  assert.equal(coincide.cotejo.estado, 'coincide')
  assert.equal(coincide.cotejo.diferencia, 0)

  const [difiere] = filasDelEspejo(base({ registros, horasDeLaPlanilla: new Map([['p1', 17]]) }))
  assert.equal(difiere.cotejo.estado, 'difiere')
  assert.equal(difiere.cotejo.diferencia, -8, 'la base tiene 8 h menos que la planilla')
})

test('UNA PERSONA DE LA PLANILLA QUE NO ESTÁ EN EL ESPEJO VALE CERO, NO «SIN ESPEJO»', () => {
  // Con espejo leído, la ausencia de una persona en la planilla es un dato: el bloque no la tiene.
  const [fila] = filasDelEspejo(base({
    registros: [{ persona_id: 'p1', id: 'r1', fecha: '2026-09-01', tipo_hora: 'normal', horas: 9 }],
    horasDeLaPlanilla: new Map(),
  }))
  assert.equal(fila.cotejo.estado, 'difiere')
  assert.equal(fila.cotejo.horasEnLaPlanilla, 0)
})

test('EL PIE NO SUMA A QUIEN NO TIENE TARIFA, Y LO CUENTA', () => {
  const filas = filasDelEspejo(base({
    personas: [
      { id: 'p1', nombre: 'Maldonado', valorHora: 3650, convenio: null },
      { id: 'p2', nombre: 'Alaniz', valorHora: null, convenio: null },
    ],
    registros: [{ persona_id: 'p1', id: 'r1', fecha: '2026-09-01', tipo_hora: 'normal', horas: 9 }],
    lineas: {
      p1: { grupo: 'obreros', linea: linea(9) },
      p2: { grupo: 'obreros', linea: { ...linea(10, null), personaId: 'p2', nombre: 'Alaniz' } },
    },
    horasDeLaPlanilla: new Map([['p1', 9]]),
  }))
  const t = totalesDelEspejo(filas)
  assert.equal(t.personas, 2)
  assert.equal(t.sinTarifa, 1)
  assert.equal(t.cobra, 9 * 3650, 'la fila sin tarifa no suma como $ 0')
  assert.equal(t.horas, 9, 'sus horas tampoco: el total tiene que cerrar con lo que muestra')
  assert.equal(t.porDia[0], 9)
  assert.equal(t.porDia[1], null, 'nadie cargó el 2: `null`, no 0')
})

test('EL ORDEN ES EL DEL MÓDULO PERSONAL: jefes primero y alfabético en español', () => {
  const filas = filasDelEspejo(base({
    personas: [
      { id: 'p1', nombre: 'Ñandú', valorHora: 1, convenio: null },
      { id: 'p2', nombre: 'Zogbe', valorHora: 1, convenio: null },
      { id: 'p3', nombre: 'Villa', valorHora: 1, convenio: null, esJefe: true },
    ],
    lineas: {
      p1: { grupo: 'obreros', linea: linea(0) },
      p2: { grupo: 'obreros', linea: linea(0) },
      p3: { grupo: 'oficina', linea: linea(0) },
    },
    horasDeLaPlanilla: new Map(),
  }))
  assert.deepEqual(filas.map((f) => f.nombre), ['Villa', 'Ñandú', 'Zogbe'])
})

test('SIN LÍNEA DE PAGO LA PERSONA NO SE DIBUJA: media fila se lee como una liquidación perdida', () => {
  const filas = filasDelEspejo(base({
    personas: [
      { id: 'p1', nombre: 'Maldonado', valorHora: 1, convenio: null },
      { id: 'p9', nombre: 'Sin actividad', valorHora: 1, convenio: null },
    ],
  }))
  assert.deepEqual(filas.map((f) => f.personaId), ['p1'])
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// EL COTEJO SE HACE SOBRE LOS DÍAS QUE LA PLANILLA TIENE (11/09/2026)
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// Medido en producción: al mediodía la planilla tenía OCHO días cargados de los trece de la
// quincena. El cotejo comparaba la ventana entera, así que las quince personas daban «difiere 8 h»
// —el día de hoy, que la app carga sola y el dueño todavía no escribió— y un chip permanentemente
// en rojo deja de leerse. Restringido a los ocho días, catorce de quince dieron EXACTO.
//
// LA MUTACIÓN QUE PONE ESTO ROJO: volver a sumar toda la ventana de `registros_hh`.

test('LOS DÍAS QUE LA PLANILLA NO TIENE NO ENTRAN EN LA COMPARACIÓN', () => {
  // La planilla habla del 1 y del 2. El 3 lo cargó la app sola. Comparar los tres daría «difiere 8».
  const [fila] = filasDelEspejo(base({
    registros: [
      { persona_id: 'p1', id: 'r1', fecha: '2026-09-01', tipo_hora: 'normal', horas: 9 },
      { persona_id: 'p1', id: 'r2', fecha: '2026-09-02', tipo_hora: 'normal', horas: 9 },
      { persona_id: 'p1', id: 'r3', fecha: '2026-09-03', tipo_hora: 'normal', horas: 8 },
    ],
    horasDeLaPlanilla: new Map([['p1', 18]]),
    diasDeLaPlanilla: new Map([['p1', new Set(['2026-09-01', '2026-09-02'])]]),
  }))
  assert.equal(fila.cotejo.estado, 'coincide')
  assert.equal(fila.cotejo.horasEnLaBase, 18, 'las 8 h del día que la planilla no tiene NO suman')
  assert.equal(fila.cotejo.diasComparados, 2)
  assert.equal(fila.cotejo.diasSinComparar, 11, 'y la pantalla puede decir cuántos quedaron afuera')
})

test('UNA DIFERENCIA DENTRO DE LOS DÍAS CARGADOS SÍ ES UNA DIFERENCIA', () => {
  // EL CASO REAL: Gonzalez Tobares Juan Guillermo tiene dos días con DOS filas de la web cada uno,
  // que el importador declara intocables porque no puede elegir cuál pisa a cuál. Ese chip rojo es
  // un dato, no ruido — y es el único de los quince.
  const [fila] = filasDelEspejo(base({
    registros: [
      { persona_id: 'p1', id: 'r1', fecha: '2026-09-01', tipo_hora: 'normal', horas: 9 },
      { persona_id: 'p1', id: 'r2', fecha: '2026-09-01', tipo_hora: 'normal', horas: 9 },
    ],
    horasDeLaPlanilla: new Map([['p1', 9]]),
    diasDeLaPlanilla: new Map([['p1', new Set(['2026-09-01'])]]),
  }))
  assert.equal(fila.cotejo.estado, 'difiere')
  assert.equal(fila.cotejo.diferencia, 9)
  assert.equal(fila.cotejo.diasComparados, 1)
})

test('CON ESPEJO PERO SIN DÍAS DE ESA PERSONA, NO SE COMPARA CONTRA CERO', () => {
  // Los dos jefes de Oficina: su pestaña no tiene bloque de septiembre. La planilla no habla de
  // ellos, y «difiere 80 h» sería mentir sobre una comparación que no se puede hacer.
  const [fila] = filasDelEspejo(base({
    registros: [{ persona_id: 'p1', id: 'r1', fecha: '2026-09-01', tipo_hora: 'normal', horas: 9 }],
    horasDeLaPlanilla: new Map(),
    diasDeLaPlanilla: new Map(),
  }))
  assert.equal(fila.cotejo.diasComparados, 0)
  assert.equal(fila.cotejo.diasSinComparar, 13)
})
