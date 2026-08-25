// EL ALTA EN PASOS: QUE IRSE A LA MITAD NO PIERDA NADA, Y QUE UN PASO NO PISE A OTRO.
//
// ═══ LOS DEFECTOS QUE ESTAS PRUEBAS ATRAPAN ═══
//
// 1. UN PASO QUE ESCRIBE COLUMNAS QUE NO SON SUYAS. El primer diseño usaba un esquema único con
//    `partial()`: el paso «Fechas» mandaba su formulario y, como `jefe_obra` no venía, se guardaba
//    NULL encima del jefe de obra cargado en el paso anterior. Cada paso borraba el anterior y
//    nadie veía un error. `columnasDelPaso` devuelve SÓLO las columnas del paso, y acá se exige.
//
// 2. EL CERO QUE NO ES UN VACÍO. Un `<input type=number>` sin tocar manda cadena vacía. Si se
//    guardara como 0, el contrato sin cargar pasaría a ser un contrato de $0 — y el checklist diría
//    «monto y fechas cargados» sobre una obra sin contrato.
//
// 3. `estado = 'previo'`. El pedido lo escribía así y la base lo rechaza: `previo` es una ETAPA, y
//    `estado` tiene CHECK cerrado en activa|pausada|cerrada desde el 19/08. Ninguna escritura de
//    estos pasos puede tocar `estado`.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ESQUEMA_PASO, PASOS, columnasDelPaso, debeFijarMonto, esPasoQueGuarda, idDeObra, pasoAnterior,
  pasoSiguiente, resolverPaso, urlPaso,
} from '../../src/features/obras/services/alta.ts'

/** El camino COMPLETO del paso: lo que manda el navegador → Zod → las columnas. Probar sólo
 *  `columnasDelPaso` con valores a mano deja afuera el esquema, y ahí estaba el defecto del cero. */
const guardaria = (paso, form) => columnasDelPaso(paso, ESQUEMA_PASO[paso].parse(form))

test('los pasos son los del pedido, en su orden, y terminan en Confirmar', () => {
  assert.deepEqual(PASOS.map((p) => p.id), [
    'informacion', 'responsable', 'fechas', 'contrato', 'drive', 'equipo', 'cronograma', 'confirmar',
  ])
  assert.equal(pasoSiguiente('confirmar'), null)
  assert.equal(pasoAnterior('informacion'), null)
})

test('cada paso lleva al siguiente y vuelve al anterior sin saltearse ninguno', () => {
  for (let i = 0; i < PASOS.length - 1; i++) {
    assert.equal(pasoSiguiente(PASOS[i].id), PASOS[i + 1].id)
    assert.equal(pasoAnterior(PASOS[i + 1].id), PASOS[i].id)
  }
})

test('sin obra creada NINGÚN paso posterior es alcanzable: no hay fila que editar', () => {
  // Un link a `?paso=contrato` sin `?obra=` pintaría un formulario que escribe sobre la nada, y el
  // administrador tipearía el contrato para que se pierda al enviarlo.
  for (const p of PASOS) assert.equal(resolverPaso(p.id, false), 'informacion')
})

test('un paso desconocido no rompe el alta: cae en el primero', () => {
  assert.equal(resolverPaso('presupuesto', true), 'informacion')
  assert.equal(resolverPaso(undefined, true), 'informacion')
  assert.equal(resolverPaso('drive', true), 'drive')
})

test('el borrador se recupera pegando el link: el id de la obra viaja en la URL', () => {
  assert.equal(urlPaso('la-estrella', 'drive'), '/obras/nueva?obra=la-estrella&paso=drive')
  // Sin obra todavía no hay borrador que recuperar, y la URL no puede afirmar que sí.
  assert.equal(urlPaso(null, 'drive'), '/obras/nueva')
})

test('cada paso escribe SÓLO sus columnas: ninguno puede pisar lo que cargó otro', () => {
  const columnas = {
    responsable: ['jefe_obra'],
    fechas: ['fecha_inicio_plan', 'fecha_fin_plan'],
    // ═══ CAMBIO DE CONTRATO declarado (migración 20260821T5000) ═══
    // `monto_contratado` dejó de ser escribible por PostgREST: la columna quedó fuera del GRANT y
    // la plata entra SÓLO por `fijar_monto_contratado()` con permiso económico. El paso «contrato»
    // ya no devuelve columnas de escritura directa — la regla de cuándo llamar al RPC vive en
    // `debeFijarMonto` y se prueba abajo.
    contrato: [],
    drive: ['drive_carpeta_id'],
  }
  for (const [paso, esperadas] of Object.entries(columnas)) {
    assert.deepEqual(Object.keys(columnasDelPaso(paso, {})).sort(), [...esperadas].sort(), paso)
  }
})

test('ninguna escritura de un paso toca `estado`: «previo» es una ETAPA y el CHECK lo rechazaría', () => {
  for (const p of ['responsable', 'fechas', 'contrato', 'drive']) {
    assert.equal('estado' in columnasDelPaso(p, {}), false, p)
    assert.equal('etapa' in columnasDelPaso(p, {}), false, p)
  }
})

test('el campo vacío se guarda NULL, nunca cero ni cadena vacía', () => {
  // Es la diferencia entre «no hay contrato cargado» y «el contrato es de $0», y es la que hace que
  // el checklist pueda decir la verdad.
  // El contrato ya no escribe directo (ver arriba): vacío o no, no devuelve columna.
  assert.deepEqual(columnasDelPaso('contrato', { monto_contratado: '' }), {})
  assert.deepEqual(columnasDelPaso('fechas', { fecha_inicio_plan: '', fecha_fin_plan: '2026-11-30' }),
    { fecha_inicio_plan: null, fecha_fin_plan: '2026-11-30' })
  assert.deepEqual(columnasDelPaso('responsable', { jefe_obra: '' }), { jefe_obra: null })
  assert.deepEqual(columnasDelPaso('drive', { drive_carpeta_id: '' }), { drive_carpeta_id: null })
})

test('el formulario en blanco, PASANDO POR EL ESQUEMA, guarda NULL y no cero', () => {
  // ═══ EL DEFECTO QUE ESTE CASO ATRAPA ═══
  //
  // `z.union([z.coerce.number(), z.literal('')])` valida en orden: un `<input type=number>` sin
  // tocar manda `''`, `Number('')` da 0, y el vacío se guardaba como CERO. El contrato sin cargar
  // pasaba a ser un contrato de $0 y el checklist anunciaba «monto y fechas cargados» sobre una obra
  // sin contrato. Lo encontró el recorrido de navegador; la prueba de `columnasDelPaso` sola no,
  // porque le pasaba `''` a mano y saltaba el esquema. Por eso este caso parte del FORMULARIO.
  assert.deepEqual(guardaria('contrato', { monto_contratado: '' }), {})
  assert.deepEqual(guardaria('fechas', { fecha_inicio_plan: '', fecha_fin_plan: '' }),
    { fecha_inicio_plan: null, fecha_fin_plan: null })
  assert.deepEqual(guardaria('responsable', { jefe_obra: '' }), { jefe_obra: null })
  assert.deepEqual(guardaria('drive', { drive_carpeta_id: '' }), { drive_carpeta_id: null })
})

test('lo que sí se tipeó pasa el esquema tal cual, incluido un cero explícito', () => {
  // El esquema sigue distinguiendo «no sé» de «cero» aunque la escritura vaya por RPC: es el dato
  // que `debeFijarMonto` recibe como `ahora`.
  assert.deepEqual(ESQUEMA_PASO.contrato.parse({ monto_contratado: '187450000' }), { monto_contratado: 187450000 })
  assert.deepEqual(ESQUEMA_PASO.contrato.parse({ monto_contratado: '0' }), { monto_contratado: 0 })
  assert.equal(ESQUEMA_PASO.contrato.safeParse({ monto_contratado: '-5' }).success, false)
  assert.equal(ESQUEMA_PASO.fechas.safeParse({ fecha_inicio_plan: '01/03/2026' }).success, false)
})

test('el RPC del monto se llama exactamente cuando corresponde: la regla de `debeFijarMonto`', () => {
  // 1 · el campo AUSENTE no es un vacío: quien no ve economía no manda la clave, y eso jamás borra.
  assert.equal(debeFijarMonto(false, 187450000, null), false)
  // 2 · el vacío TIPEADO sí es una orden de borrar.
  assert.equal(debeFijarMonto(true, 187450000, null), true)
  // 3 · sin cambio no se llama — y la comparación es numérica (`numeric` puede llegar como string).
  assert.equal(debeFijarMonto(true, '187450000', 187450000), false)
  assert.equal(debeFijarMonto(true, null, null), false)
  // 4 · cargar de verdad, incluido el cero explícito sobre un sin-cargar.
  assert.equal(debeFijarMonto(true, null, 0), true)
})

test('sólo los cuatro pasos de una columna guardan por su propio formulario', () => {
  assert.deepEqual(PASOS.map((p) => p.id).filter(esPasoQueGuarda),
    ['responsable', 'fechas', 'contrato', 'drive'])
  // Equipo y Cronograma escriben con las acciones que YA existen (`asignarPersona`,
  // `crearActividad`): si aparecieran acá, habría una segunda puerta a `obra_asignacion`.
  assert.equal(esPasoQueGuarda('equipo'), false)
  assert.equal(esPasoQueGuarda('cronograma'), false)
  assert.equal(esPasoQueGuarda('confirmar'), false)
})

test('el identificador de la obra sale del nombre y es un slug estable', () => {
  assert.equal(idDeObra('La Estrella'), 'la-estrella')
  assert.equal(idDeObra('Ampliación Nº 3 — Módulo B'), 'ampliacion-n-3-modulo-b')
  assert.equal(idDeObra('  Messina  '), 'messina')
  // Un nombre sin una sola letra ni número no deja identificador: la acción corta antes de insertar,
  // en vez de crear una obra con id vacío que después nadie puede abrir por URL.
  assert.equal(idDeObra('...'), '')
})
