// LAS ACTIVIDADES DE ESTAS PRUEBAS SON LAS DE SAN FRANCISCO, copiadas de `obra_actividad` el
// 21/08/2026, y los documentos son los de su carpeta real. Si alguna se pone roja, el asistente
// volvió a colgar un plano de la tarea equivocada — o a tratar un NULL como un cero.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CLAVE_VINCULO, SIN_VINCULO, ESTADO_CANTIDAD, PISO_TOKENS,
  frentesDeRuta, vincularDocumentoAActividad, compararComputoContraPlan, planosPosterioresAlPlan,
} from './documentacion-obra-vinculo.mjs'

const SF = 'administracion/PRESUPUESTOS - CLIENTES/JAVIER SANCHEZ'

// Recorte fiel de obra_actividad para obra_id='san-francisco'
const ACTIVIDADES = [
  { id: 'a1', nombre: 'GALPON 2', seccion: 'TAREA DE LA SEMANA', tipo: 'resumen' },
  { id: 'a2', nombre: 'Muro G 2/3 de 5m - 18 paneles', seccion: 'GALPON 2', tipo: 'tarea' },
  { id: 'a3', nombre: 'Muro G 2/3 de 1,5m - 24 paneles', seccion: 'GALPON 2', tipo: 'tarea' },
  { id: 'a4', nombre: 'Colocacion de cancamo', seccion: 'GALPON 4', tipo: 'tarea' },
  { id: 'a5', nombre: 'Entrepiso', seccion: 'GALPON 4', tipo: 'resumen' },
  { id: 'a6', nombre: 'Reclavado de Paneles de Techo', seccion: 'GALPON 4', tipo: 'tarea' },
]

test('los frentes se leen de la carpeta de la obra para abajo, no del data room entero', () => {
  assert.deepEqual(
    frentesDeRuta(`${SF}/Instalacion Electrica/Cotizacion Interna/Cotizacion Interna.xlsm`, SF),
    ['Cotizacion Interna', 'Instalacion Electrica'],
  )
  // sin la carpeta de la obra, "administracion" sería un frente de la obra
  assert.ok(frentesDeRuta(`${SF}/ADICIONALES/Cloacas - JS.pdf`, SF).includes('administracion') === false)
})

test('la carpeta le gana a las palabras: el documento pertenece al frente donde alguien lo puso', () => {
  const v = vincularDocumentoAActividad(
    { name: 'Estructura San Francisco del Monte Entrepiso.pdf', path: `${SF}/Entrepiso/Estructura San Francisco del Monte Entrepiso.pdf` },
    ACTIVIDADES, { carpetaObra: SF },
  )
  assert.equal(v.clave, CLAVE_VINCULO.carpeta)
  assert.equal(v.actividad_id, 'a5')
  assert.equal(v.confianza, 'alta')
})

test('un frente con varias actividades devuelve el FRENTE, nunca una tarea', () => {
  // "GALPON 2" existe en el Sheet real de las dos formas: como fila de resumen y como sección de
  // las filas que cuelgan. Devolver la fila de resumen haría que el jefe de obra lea
  // "actividad: GALPON 2" — que no es una actividad, es un galpón entero.
  for (const frente of ['GALPON 2', 'GALPON 4']) {
    const v = vincularDocumentoAActividad(
      { name: 'algo.pdf', path: `${SF}/${frente}/algo.pdf` }, ACTIVIDADES, { carpetaObra: SF },
    )
    assert.equal(v.frente, frente)
    assert.equal(v.actividad_id, null, frente)
    assert.match(v.nota, /pertenece al frente/)
    assert.ok(v.actividades_del_frente.length > 1)
  }
})

test('un frente que es UNA sola actividad sí devuelve esa actividad', () => {
  const v = vincularDocumentoAActividad(
    { name: 'Presupuesto.pdf', path: `${SF}/Entrepiso/Presupuesto.pdf` }, ACTIVIDADES, { carpetaObra: SF },
  )
  assert.equal(v.actividad_id, 'a5')
  assert.equal(v.clave, CLAVE_VINCULO.carpeta)
})

test('sin carpeta útil, las palabras alcanzan sólo si son dos o más', () => {
  const v = vincularDocumentoAActividad(
    { name: 'Reclavado de Paneles de Techo - relevamiento.pdf', path: `${SF}/Reclavado de Paneles de Techo - relevamiento.pdf` },
    ACTIVIDADES, { carpetaObra: SF },
  )
  assert.equal(v.clave, CLAVE_VINCULO.tokens)
  assert.equal(v.actividad_id, 'a6')
  assert.ok(v.palabras_en_comun >= PISO_TOKENS)
  assert.equal(v.confianza, 'media', 'una inferencia nunca sale con confianza alta')
})

test('una sola palabra en común NO es un vínculo', () => {
  const v = vincularDocumentoAActividad(
    { name: 'Cancamos comprados.pdf', path: `${SF}/Cancamos comprados.pdf` }, ACTIVIDADES, { carpetaObra: SF },
  )
  assert.equal(v.actividad_id, null)
  assert.equal(v.motivo, SIN_VINCULO.sinCandidato)
})

test('empate = ambiguo, y ambiguo NO es un vínculo: se listan las candidatas', () => {
  const v = vincularDocumentoAActividad(
    { name: 'Muro G 2/3 paneles.pdf', path: `${SF}/Muro G 2 3 paneles.pdf` }, ACTIVIDADES, { carpetaObra: SF },
  )
  assert.equal(v.actividad_id, null)
  assert.equal(v.motivo, SIN_VINCULO.ambiguo)
  assert.equal(v.candidatas.length, 2)
})

test('las palabras de relleno del data room no emparejan nada', () => {
  const v = vincularDocumentoAActividad(
    { name: 'Gastos -  Entrepiso y Escalera JS (1).pdf', path: `${SF}/Gastos JS.pdf` },
    [{ id: 'z', nombre: 'Gastos de obra JS', seccion: null }], { carpetaObra: SF },
  )
  assert.equal(v.actividad_id, null, '"gastos", "js" y "obra" son ruido: no pueden formar un vínculo')
})

// ─────────── el cómputo contra el plan ───────────

const CON_PLAN = [
  { id: 'p1', nombre: 'Contrapiso de hormigon', seccion: null, unidad: 'm2', cantidad_objetivo: 1200 },
  { id: 'p2', nombre: 'Mamposteria de ladrillo hueco', seccion: null, unidad: 'm2', cantidad_objetivo: null },
  { id: 'p3', nombre: 'Viga de encadenado superior', seccion: null, unidad: 'ml', cantidad_objetivo: 96 },
]

test('NULL en cantidad planificada es SIN PLAN, no cero — si no, todo el informe es ruido', () => {
  const r = compararComputoContraPlan(
    [{ descripcion: 'Mamposteria de ladrillo hueco', cantidad: 340, unidad: 'm2', fila: 12 }], CON_PLAN,
  )
  assert.equal(r[0].estado, ESTADO_CANTIDAD.sinPlan)
  assert.notEqual(r[0].estado, ESTADO_CANTIDAD.difiere)
  assert.match(r[0].detalle, /nadie cargó cantidad planificada/)
})

test('la diferencia real se marca, con el delta y sin adjetivos', () => {
  const r = compararComputoContraPlan(
    [{ descripcion: 'Contrapiso de hormigon', cantidad: 1340, unidad: 'm2', fila: 4 }], CON_PLAN,
  )
  assert.equal(r[0].estado, ESTADO_CANTIDAD.difiere)
  assert.equal(r[0].delta, 140)
  assert.equal(r[0].cantidad_plan, 1200)
  assert.equal(r[0].fila, 4)
})

test('por debajo del 1% es redondeo de planilla, no una decisión de nadie', () => {
  const r = compararComputoContraPlan(
    [{ descripcion: 'Contrapiso de hormigon', cantidad: 1205, unidad: 'm2' }], CON_PLAN,
  )
  assert.equal(r[0].estado, ESTADO_CANTIDAD.coincide)
})

test('m² y m³ NO se convierten: el factor es el espesor y no está en ninguna de las dos filas', () => {
  const r = compararComputoContraPlan(
    [{ descripcion: 'Contrapiso de hormigon', cantidad: 120, unidad: 'm3' }], CON_PLAN,
  )
  assert.equal(r[0].estado, ESTADO_CANTIDAD.unidadDistinta)
  assert.match(r[0].detalle, /no se convierte/)
})

test('un elemento del cómputo que el plan no tiene se declara: es trabajo sin planificar', () => {
  const r = compararComputoContraPlan(
    [{ descripcion: 'Cordon cuneta perimetral', cantidad: 80, unidad: 'ml' }], CON_PLAN,
  )
  assert.equal(r[0].estado, ESTADO_CANTIDAD.sinActividad)
  assert.equal(r[0].cantidad_plan, undefined)
})

// ─────────── el plano posterior al plan ───────────

test('caso real Nivelación de Cocheras: el legajo Rev C es POSTERIOR a la cotización Rev B', () => {
  const r = planosPosterioresAlPlan(
    [
      { name: 'ARSJ Nivelacion de cocheras - Legajo de Planos Rev C.pdf', drive_file_id: 'C', modified_time: '2025-04-29T03:00:00Z' },
      { name: 'ARSJ Nivelacion de cocheras - Legajo de Planos Rev B.pdf', drive_file_id: 'B', modified_time: '2025-04-17T03:00:00Z' },
    ],
    { fechaPlan: '2025-04-23T03:00:00Z', nombrePlan: 'ARSJ Planilla de Cotizacion - Nivelacion de cocheras Rev B.xls' },
  )
  assert.equal(r.revisar.length, 1)
  assert.equal(r.revisar[0].drive_file_id, 'C')
  assert.match(r.revisar[0].afirmacion, /motivo para revisar, no diferencia demostrada/)
})

test('sin fecha del plan no se afirma nada: se dice qué dato falta', () => {
  const r = planosPosterioresAlPlan([{ name: 'x.pdf', modified_time: '2025-01-01' }], { fechaPlan: null })
  assert.deepEqual(r.revisar, [])
  assert.match(r.motivo, /no se sabe con qué fecha/)
})

test('un documento sin fecha de modificación no entra como posterior', () => {
  const r = planosPosterioresAlPlan(
    [{ name: 'sin fecha.pdf', modified_time: null }], { fechaPlan: '2020-01-01' },
  )
  assert.deepEqual(r.revisar, [])
})
