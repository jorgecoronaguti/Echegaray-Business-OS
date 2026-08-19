import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  BUCKET_ACTIVOS, BUCKET_INACTIVOS, CATEGORIAS, REQUERIDOS_ACTIVO,
  categoriaDeArchivo, faltantes, fechaDelArchivo, nombreCanonico, personaDeCarpeta,
  planDeSincronizacion,
} from './legajos-sincro.mjs'

test('cada categoría del legajo es una de las declaradas', () => {
  const nombres = [
    'BAJA.pdf', 'Ramos Baja ARCA.pdf', 'Telegrama de despido.pdf', 'Acuse_20260122161346.pdf',
    'Alta - Aballay Diego.pdf', 'FWEB_1988788.pdf', 'DNI - Walter Santander.pdf', 'Ruben Frente.jpg',
    'HM 24:4- FERREYRA RODOLFO.pdf', 'EPP - GALVAN.pdf', 'Capacitan - Cocheras.pdf',
    'Liquidación BAZAN.pdf', 'Lote_363652 fdc.xlsx', 'BOLETA DE TARJETA.pdf',
  ]
  for (const n of nombres) assert.ok(CATEGORIAS.includes(categoriaDeArchivo(n)), n)
})

test('la baja gana aunque el nombre diga otra cosa, y el alta no se confunde con un apellido', () => {
  assert.equal(categoriaDeArchivo('Ramos Baja ARCA.pdf'), 'baja')
  assert.equal(categoriaDeArchivo('Gordillo Baja.pdf'), 'baja')
  assert.equal(categoriaDeArchivo('Telegrama Santander.pdf'), 'baja')
  assert.equal(categoriaDeArchivo('Alta - Aballay Alejandro.pdf'), 'alta_temprana')
  // «SALINAS» y «PALACIOS» contienen letras de ALTA/EPP pero no son la palabra.
  assert.equal(categoriaDeArchivo('HM - SALINAS.pdf'), 'examen_medico')
  assert.equal(categoriaDeArchivo('DNI - Palacios.pdf'), 'dni')
})

test('lo que no se reconoce entra como «otro», no se pierde', () => {
  assert.equal(categoriaDeArchivo('Tramites307163046432026.pdf'), 'otro')
  assert.equal(categoriaDeArchivo('0af5eb7e-3e72-41b6-9b97-0b479a923754.pdf'), 'otro')
})

test('la fecha sale del nombre sólo si está entera', () => {
  assert.equal(fechaDelArchivo('BAJA - 30:6:25.pdf'), '2025-06-30')
  assert.equal(fechaDelArchivo('HM - IVAN ROSALES 9:6:25.pdf'), '2025-06-09')
  assert.equal(fechaDelArchivo('TELEGRAMA - RESP 04:5:26.pdf'), '2026-05-04')
  assert.equal(fechaDelArchivo('Acuse_20260122161346.pdf'), '2026-01-22')
})

test('día y mes sin año NO son una fecha', () => {
  assert.equal(fechaDelArchivo('HM 24:4- FERREYRA RODOLFO.pdf'), null)
  assert.equal(fechaDelArchivo('baja 15:5.pdf'), null)
  assert.equal(fechaDelArchivo('HM - NARBAEZ.pdf'), null)
})

test('una fecha imposible no se publica', () => {
  assert.equal(fechaDelArchivo('BAJA - 31:2:25.pdf'), null)
  assert.equal(fechaDelArchivo('BAJA - 45:13:25.pdf'), null)
})

test('el nombre del legajo conserva los acentos', () => {
  assert.equal(nombreCanonico('Guadalupe Galván'), 'GUADALUPE GALVÁN')
  assert.equal(nombreCanonico('AGUIRRE LEANDRO 7:2:26'), 'AGUIRRE LEANDRO')
})

test('el empate de tokens se resuelve por proporción de nombre compartido', () => {
  const personas = [
    { id: 'a', nombre_completo: 'GONZALEZ EMILIANO' },
    { id: 'b', nombre_completo: 'GONZALEZ TOBARES JUAN GUILLERMO' },
  ]
  // Dos tokens en común con cada una; 2 de 3 contra 2 de 5.
  assert.equal(personaDeCarpeta('GONZALEZ TOBARES EMILIANO', personas).persona.id, 'a')
  assert.equal(personaDeCarpeta('GONZALES TOBARES JUAN GUILLERMO', personas).persona.id, 'b')
})

test('cuando ni la proporción despega, la carpeta queda sin emparejar', () => {
  const personas = [
    { id: 'a', nombre_completo: 'QUIROGA JULIO CESAR' },
    { id: 'b', nombre_completo: 'QUIROGA JULIO ROBERTO' },
  ]
  const r = personaDeCarpeta('QUIROGA JULIO', personas)
  assert.equal(r.persona, null)
  assert.match(r.motivo, /ambigua/)
})

test('el estado sale del bucket: sin baja en la carpeta también egresa', () => {
  const carpetas = [
    { id: 'c1', name: 'NARBAEZ', ruta: BUCKET_INACTIVOS },
    { id: 'c2', name: 'TELLO JUAN', ruta: BUCKET_ACTIVOS },
  ]
  const personas = [
    { id: 'p1', nombre_completo: 'NARBAEZ RAMON', drive_folder_id: null, en_la_empresa: true },
    { id: 'p2', nombre_completo: 'TELLO JUAN', drive_folder_id: 'c2', en_la_empresa: false },
  ]
  const plan = planDeSincronizacion({ carpetas, archivos: [], personas })
  assert.deepEqual(plan.egresos.map((e) => e.persona.id), ['p1'])
  assert.deepEqual(plan.reingresos.map((e) => e.persona.id), ['p2'])
})

test('una carpeta en 3. A REVISAR no crea a nadie', () => {
  const carpetas = [{ id: 'c9', name: 'QUIROGA SEBASTIAN', ruta: '3. A REVISAR - dos personas posibles' }]
  const archivos = [{ id: 'f1', name: 'HM.pdf', ruta: '3. A REVISAR - dos personas posibles/QUIROGA SEBASTIAN' }]
  const plan = planDeSincronizacion({ carpetas, archivos, personas: [] })
  assert.equal(plan.altas.length, 0)
  assert.equal(plan.documentos.length, 0)
  assert.deepEqual(plan.pendientes.map((p) => p.carpeta), ['QUIROGA SEBASTIAN'])
})

test('la carpeta de administración no es de nadie', () => {
  const carpetas = [{ id: 'c8', name: 'COCHERAS', ruta: '9. ADMINISTRACION (no es legajo)' }]
  const plan = planDeSincronizacion({ carpetas, archivos: [], personas: [] })
  assert.equal(plan.altas.length, 0)
  assert.equal(plan.pendientes.length, 0)
})

test('dos carpetas para la misma persona: la segunda se declara y no pisa a la primera', () => {
  const carpetas = [
    { id: 'c1', name: 'POBLETE LUIS', ruta: BUCKET_INACTIVOS },
    { id: 'c2', name: 'POBLETE LUIS ALBERTO', ruta: BUCKET_INACTIVOS },
  ]
  const personas = [{ id: 'p1', nombre_completo: 'POBLETE LUIS ALBERTO', drive_folder_id: null, en_la_empresa: false }]
  const plan = planDeSincronizacion({ carpetas, archivos: [], personas })
  assert.equal(plan.vinculos.length, 1)
  assert.equal(plan.ambiguas.length, 1)
  assert.match(plan.ambiguas[0].motivo, /ya tiene otra carpeta/)
})

test('el vínculo ya existente manda sobre el parecido del nombre', () => {
  const carpetas = [{ id: 'c1', name: 'SANCHEZ', ruta: BUCKET_INACTIVOS }]
  const personas = [
    { id: 'p1', nombre_completo: 'SANCHEZ MARIO', drive_folder_id: 'c1', en_la_empresa: false },
    { id: 'p2', nombre_completo: 'SANCHEZ MARIO ANDRES', drive_folder_id: null, en_la_empresa: false },
  ]
  const plan = planDeSincronizacion({ carpetas, archivos: [], personas })
  assert.equal(plan.vinculos.length, 0)
  assert.equal(plan.altas.length, 0)
  assert.deepEqual(plan.sinCarpeta.map((p) => p.id), ['p2'])
})

test('los documentos cuelgan de la carpeta, así el alta nueva los puede reclamar después', () => {
  const carpetas = [{ id: 'c1', name: 'ZOGBE LEONARDO', ruta: BUCKET_ACTIVOS }]
  const archivos = [
    { id: 'f1', name: 'HM - ZOGBER 9:6:25.pdf', ruta: `${BUCKET_ACTIVOS}/ZOGBE LEONARDO` },
    { id: 'f2', name: 'DNI - Leonardo Zogbe.pdf', ruta: `${BUCKET_ACTIVOS}/ZOGBE LEONARDO` },
    { id: 'f3', name: 'suelto.pdf', ruta: '' },
  ]
  const plan = planDeSincronizacion({ carpetas, archivos, personas: [] })
  assert.equal(plan.altas.length, 1)
  assert.deepEqual(plan.documentos.map((d) => d.drive_file_id), ['f1', 'f2'])
  assert.ok(plan.documentos.every((d) => d.carpeta_id === 'c1' && d.persona_id === null))
  assert.equal(plan.documentos[0].fecha_documento, '2025-06-09')
})

test('qué le falta a un legajo activo', () => {
  assert.deepEqual(faltantes(['dni', 'examen_medico']), ['alta_temprana', 'epp'])
  assert.deepEqual(faltantes(REQUERIDOS_ACTIVO), [])
})
