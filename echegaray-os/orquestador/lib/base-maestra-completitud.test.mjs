// §6 · Los casos de este archivo son los MEDIDOS en la base real, con sus códigos y sus pesos.
// El par T1107.1/T1107.2 es el defecto que motivó el módulo: dos mitades que el motor trataba como
// dos opciones.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  alcanceDeclarado, raizComercial, cajonesDe, huecosDe, evaluarComposicion,
  paresComplementarios, complementosDe, paresSospechosos,
} from './base-maestra-completitud.mjs'
import { ESTADO_BM } from './base-maestra-estado.mjs'
import { CAJON } from './cotizador/costo.mjs'

// Los nombres son los literales de public.tarea_tipo.
const T1107_1 = { codigo: 'T1107.1', nombre: 'PISO DE HORMIGON ALISADO MECÁNICO - MANO DE OBRA', unidad: 'M2' }
const T1107_2 = { codigo: 'T1107.2', nombre: 'PISO DE HORMIGON ALISADO MECÁNICO - MATERIALES H17, 15cm y #6 15-15', unidad: 'M2' }
const T1139 = { codigo: 'T1139', nombre: 'PINTURA VIAL - MATERIALES Y MANO DE OBRA', unidad: 'ML' }
const T1091 = { codigo: 'T1091', nombre: 'FLETE', unidad: 'UN' }
const T1010 = { codigo: 'T1010', nombre: 'COLUMNA DE CARGA H17 - FE 190 KG/M3', unidad: 'M3' }
const T1069 = { codigo: 'T1069', nombre: 'COLUMNA DE CARGA H17 - FE 120 KG/M3', unidad: 'M3' }

test('el alcance parcial se lee del nombre, no se supone', () => {
  assert.equal(alcanceDeclarado(T1107_1.nombre).cajon, CAJON.LABOR)
  assert.equal(alcanceDeclarado(T1107_2.nombre).cajon, CAJON.MATERIALS)
  assert.equal(alcanceDeclarado('PINTURA PARA PILETA (CAUCHO CLOHORADO) - CONSUMIBLES').cajon, CAJON.MATERIALS)
})

test('una partida que declara LOS DOS cajones NO es parcial (T1139, medido)', () => {
  // Éste fue un falso positivo REAL de la primera versión: el guion marcaba MATERIALS y la mano de
  // obra quedaba detrás de una «y» que la expresión no contemplaba.
  assert.equal(alcanceDeclarado(T1139.nombre), null)
  assert.equal(huecosDe({ ...T1139, lineas: [{ tipo: 'mano_obra' }, { tipo: 'carga_social' }, { tipo: 'material' }] }).huecos.length, 0)
})

test('NO se declara incompleta una composición por lo que «debería» tener (FLETE)', () => {
  // Un flete no lleva mano de obra y está completo. Un control que exige los cinco cajones a todas
  // las partidas siempre dice que no, y un control que siempre dice que no no dice nada.
  const r = huecosDe({ ...T1091, lineas: [{ tipo: 'otro' }] })
  assert.deepEqual(r.huecos, [])
  assert.equal(evaluarComposicion({ ...T1091, lineas: [{ tipo: 'otro' }], costoDirecto: 38587.5 }).estado, ESTADO_BM.HISTORICO)
})

test('EL CASO T1107: dos mitades, no dos opciones', () => {
  const pares = paresComplementarios([T1107_1, T1107_2, T1091, T1139])
  assert.equal(pares.length, 1)
  assert.deepEqual(pares[0].miembros.map((m) => m.codigo), ['T1107.1', 'T1107.2'])
  assert.deepEqual(complementosDe('T1107.1', pares).map((c) => c.codigo), ['T1107.2'])
  assert.deepEqual(complementosDe('T1091', pares), [], 'una partida sin complemento no inventa uno')
})

test('UNA COMPOSICIÓN INCOMPLETA NO CUESTA 0 — publica null y conserva el número como referencia', () => {
  const pares = paresComplementarios([T1107_1, T1107_2])
  const ev = evaluarComposicion(
    { ...T1107_1, costoDirecto: 17550.9, lineas: [{ tipo: 'mano_obra' }, { tipo: 'carga_social' }, { tipo: 'equipo' }, { tipo: 'material' }] },
    { complementos: complementosDe('T1107.1', pares), estadoDeclarado: ESTADO_BM.VALIDADO },
  )
  assert.equal(ev.estado, ESTADO_BM.INCOMPLETO, 'los huecos empeoran el estado declarado; nunca lo mejoran')
  assert.equal(ev.costoDirecto, null)
  assert.notEqual(ev.costoDirecto, 0)
  assert.equal(ev.costoDeReferencia, 17550.9, 'el número se muestra para saber de cuánto se habla, sin entrar a ninguna suma')
  assert.ok(ev.huecos.some((h) => h.causa === 'COMPLEMENTO_EN_LA_BASE'))
  assert.ok(ev.huecos.some((h) => h.causa === 'ALCANCE_PARCIAL_DECLARADO'))
})

test('mano de obra sin carga social es aritmética, no opinión', () => {
  const r = huecosDe({ codigo: 'X', nombre: 'TAREA X', lineas: [{ tipo: 'mano_obra' }, { tipo: 'material' }] })
  assert.ok(r.huecos.some((h) => h.causa === 'MANO_OBRA_SIN_CARGA_SOCIAL'))
  const ok = huecosDe({ codigo: 'X', nombre: 'TAREA X', lineas: [{ tipo: 'mano_obra' }, { tipo: 'carga_social' }] })
  assert.equal(ok.huecos.length, 0)
})

test('una composición sin líneas no cuesta 0: cuesta desconocido', () => {
  const ev = evaluarComposicion({ codigo: 'Z', nombre: 'TAREA Z', lineas: [], costoDirecto: 0 })
  assert.ok(ev.huecos.some((h) => h.causa === 'SIN_LINEAS'))
  assert.equal(ev.costoDirecto, null)
})

test('una línea sin precio impide afirmar el costo directo', () => {
  const ev = evaluarComposicion({ codigo: 'W', nombre: 'TAREA W', lineas: [{ tipo: 'material' }], lineasSinPrecio: 1, costoDirecto: 999 })
  assert.equal(ev.estado, ESTADO_BM.INCOMPLETO)
  assert.equal(ev.costoDirecto, null)
})

test('un posible duplicado NO se fusiona ni se elige: se reporta', () => {
  const sos = paresSospechosos([T1010, T1069, T1107_1, T1107_2])
  assert.deepEqual(sos.map((s) => s.codigos), [['T1010', 'T1069']])
  // T1107.1/.2 NO salen acá: declaran alcances distintos, son complementarias — otra cosa, otra
  // respuesta. Confundirlas haría que el motor «elija» una de dos mitades.
  assert.equal(sos.some((s) => s.codigos.includes('T1107.1')), false)
})

test('la raíz comercial corta en el separador de alcance, no en cualquier guion', () => {
  assert.equal(raizComercial(T1107_2.nombre), raizComercial(T1107_1.nombre))
  // «MALLA SIMA Q188 15-15» y «H-17» llevan guiones que son parte del nombre.
  assert.equal(raizComercial('HORMIGON H-17 PARA LOSA'), 'hormigon h-17 para losa')
})

test('cajonesDe ignora un tipo que no existe en vez de inventarle un cajón', () => {
  assert.deepEqual(cajonesDe([{ tipo: 'mano_obra' }, { tipo: 'inventado' }, { tipo: 'material' }]),
    { [CAJON.LABOR]: 1, [CAJON.MATERIALS]: 1 })
})
