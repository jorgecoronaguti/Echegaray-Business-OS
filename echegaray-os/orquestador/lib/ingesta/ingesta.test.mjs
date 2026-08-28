// LA CARPETA LLEGA COMO LLEGA, Y LO QUE NO SE PUDO LEER TIENE QUE VERSE.
//
// Las dos pruebas que importan acá son las que impiden dos silencios distintos: un archivo que el
// circuito no sabe abrir y desaparece del inventario, y una lámina que se manda entera al modelo
// porque nadie la partió en sus dibujos.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { registrar, inventariar, formatoDe, FORMATO, ESTADO, hashDe } from './registro.mjs'
import { segmentar, agrupar, clasificarRegion, seTocan, cajaRobusta, absorberContenidas, contenidaEn, TIPO_REGION } from './segmentar.mjs'
import { clasificarPagina, renglones, transformarCaja, componer, CLASE_PDF } from './pdf.mjs'
import { CONVERSORES, convertirADxf, conversoresDisponibles, versionDeDwg } from './dwg.mjs'

const CARPETA = [
  { nombre: 'Plano de Arquitectura.pdf', mime: 'application/pdf' },
  { nombre: 'ESTRUCTURA.dwg', mime: 'application/octet-stream' },
  { nombre: 'ESTRUCTURA.dxf', mime: 'application/octet-stream' },
  { nombre: 'IMG_20260812_relevamiento.jpg', mime: 'image/jpeg' },
  { nombre: 'Computo del cliente.xlsx', mime: 'application/octet-stream' },
  { nombre: 'Pliego de especificaciones.docx', mime: null },
  { nombre: 'planos.zip', mime: null },
  { nombre: 'archivo_sin_extension', mime: null },
]

test('LA EXTENSIÓN MANDA SOBRE EL MIME: Drive devuelve octet-stream para casi todo', () => {
  assert.equal(formatoDe({ nombre: 'ESTRUCTURA.dwg', mime: 'application/octet-stream' }), FORMATO.DWG)
  assert.equal(formatoDe({ nombre: 'Computo.xlsx', mime: 'application/octet-stream' }), FORMATO.PLANILLA)
  assert.equal(formatoDe({ nombre: 'foto', mime: 'image/heic' }), FORMATO.IMAGEN, 'sin extensión sí vale el MIME')
  assert.equal(formatoDe({ nombre: 'algo.raro', mime: null }), FORMATO.OTRO)
})

test('LO QUE NO SE PUDO LEER NO DESAPARECE DEL INVENTARIO', () => {
  const inv = inventariar(CARPETA)
  assert.equal(inv.total, 8)
  assert.equal(inv.sinLeer.length, 2, 'el .zip y el archivo sin extensión — el .dwg ya se abre solo')
  assert.ok(inv.sinLeer.every((f) => f.porQue), 'cada uno dice POR QUÉ no se pudo')
  assert.equal(inv.porEstado[ESTADO.NO_LEGIBLE], 2)
  assert.equal(inv.porEstado[ESTADO.REQUIERE_CONVERSION], undefined, 'el DWG dejó de requerir intervención del usuario')
})

test('el registro trae el hash del contenido, que es la llave del caché', () => {
  const bytes = Buffer.from('un plano cualquiera')
  const f = registrar({ nombre: 'plano.pdf', bytes })
  assert.equal(f.hash, hashDe(bytes))
  assert.equal(f.bytes, bytes.length)
  assert.equal(registrar({ nombre: 'plano.pdf' }).hash, null, 'inventariar sin descargar deja el hash en null, no en cadena vacía')
})

test('EL .DWG SE ABRE SOLO: hay conversor local y el usuario no exporta nada', async () => {
  const f = registrar({ nombre: 'ESTRUCTURA.dwg' })
  assert.equal(f.estado, ESTADO.PENDIENTE, 'ya no requiere intervención del usuario')
  assert.equal(f.adaptador, 'ingesta/dwg.mjs')
  assert.ok((await conversoresDisponibles()).length >= 1, 'sin conversor en la máquina esta capacidad no existe, y el test lo dice')
  assert.ok(CONVERSORES.some((c) => c.libre), 'la primera opción es libre y local, no un servicio de terceros')
})

test('la versión del DWG se lee de sus seis primeros bytes, para no adivinar por qué falló', () => {
  assert.equal(versionDeDwg(Buffer.from('AC1032xxx')).version, 'AutoCAD 2018')
  assert.equal(versionDeDwg(Buffer.from('AC1027xxx')).version, 'AutoCAD 2013')
  assert.equal(versionDeDwg(Buffer.from('NOPExxxxx')).conocida, false)
})

test('un DWG que no existe falla DECLARANDO el motivo, no con una medición vacía', async () => {
  const r = await convertirADxf('/no/existe/ESTRUCTURA.dwg')
  assert.equal(r.ok, false)
  assert.ok(r.porQue)
  assert.equal(r.estado, 'NO_LEGIBLE')
})

test('SEGMENTAR: dos dibujos separados por espacio en blanco son dos regiones, no una', () => {
  const izquierda = [[10, 10, 100, 100], [20, 20, 90, 90], [30, 30, 40, 40]]
  const derecha = [[300, 10, 400, 100], [310, 20, 390, 90]]
  const g = agrupar([...izquierda, ...derecha], { holgura: 5 })
  assert.equal(g.length, 2)
  assert.equal(g[0].miembros + g[1].miembros, 5)
})

test('la holgura es lo que separa: con holgura grande, los mismos trazos son un solo dibujo', () => {
  const cajas = [[10, 10, 100, 100], [300, 10, 400, 100]]
  assert.equal(agrupar(cajas, { holgura: 5 }).length, 2)
  assert.equal(agrupar(cajas, { holgura: 250 }).length, 1)
  assert.equal(seTocan([0, 0, 10, 10], [12, 0, 20, 10], 5), true)
  assert.equal(seTocan([0, 0, 10, 10], [12, 0, 20, 10], 1), false)
})

test('CADA REGIÓN SE CLASIFICA POR EL TÍTULO QUE EL PLANO ESCRIBE, no por su forma', () => {
  const textos = [
    { x: 50, y: 50, texto: 'PLANTA DE FUNDACION' },
    { x: 350, y: 50, texto: 'CORTE A-A' },
    { x: 650, y: 50, texto: 'DETALLE DE BASE' },
    { x: 950, y: 50, texto: 'PLANILLA DE COLUMNAS' },
  ]
  assert.equal(clasificarRegion([0, 0, 200, 200], textos).tipo, TIPO_REGION.PLANTA)
  assert.equal(clasificarRegion([300, 0, 500, 200], textos).tipo, TIPO_REGION.CORTE)
  assert.equal(clasificarRegion([600, 0, 800, 200], textos).tipo, TIPO_REGION.DETALLE)
  assert.equal(clasificarRegion([900, 0, 1100, 200], textos).tipo, TIPO_REGION.CUADRO)
  assert.equal(clasificarRegion([0, 0, 200, 200], textos).confianza, 'alta')
})

test('sin título, la región queda INDETERMINADO — que es una respuesta y no un error', () => {
  const r = clasificarRegion([0, 0, 200, 200], [{ x: 50, y: 50, texto: '1.63' }])
  assert.equal(r.tipo, TIPO_REGION.INDETERMINADO)
  assert.equal(r.confianza, 'baja')
  assert.match(r.porQue, /ningún título/)
})

test('la carátula se reconoce por su lugar cuando no tiene una palabra que la delate', () => {
  const textos = [{ x: 900, y: 60, texto: 'Quattropani' }, { x: 900, y: 40, texto: '1:100' }, { x: 900, y: 20, texto: 'Agosto 2026' }]
  const r = clasificarRegion([850, 0, 1180, 100], textos, { ancho: 1189, alto: 841 })
  assert.equal(r.tipo, TIPO_REGION.CARATULA)
  assert.equal(r.confianza, 'media')
})

test('SEGMENTAR una lámina completa devuelve regiones con coordenadas citables', () => {
  const lamina = {
    ancho: 1189, alto: 841,
    trazos: [
      ...Array.from({ length: 20 }, (_, i) => [50 + i, 400 + i, 500, 800]),
      ...Array.from({ length: 20 }, (_, i) => [700 + i, 400 + i, 1100, 800]),
    ],
    textos: [
      { x: 60, y: 810, ancho: 120, alto: 10, texto: 'PLANTA DE FUNDACION' },
      { x: 710, y: 810, ancho: 80, alto: 10, texto: 'CORTE A-A' },
    ],
  }
  const s = segmentar(lamina)
  assert.equal(s.regiones.length, 2)
  assert.deepEqual(s.regiones.map((r) => r.tipo).sort(), ['corte', 'planta'])
  assert.ok(s.regiones.every((r) => r.caja.length === 4), 'la caja es la evidencia: sin ella no se puede citar de dónde salió el dato')
  assert.ok(s.regiones.every((r) => r.fraccionDeHoja > 0))
})

test('las regiones minúsculas se descartan Y SE CUENTAN: no se pierden en silencio', () => {
  const s = segmentar({ ancho: 1000, alto: 1000, trazos: [[0, 0, 500, 500], [900, 900, 902, 902]], textos: [] })
  assert.equal(s.regiones.length, 1)
  assert.equal(s.descartadas, 1)
  assert.match(s.porQueDescartadas, /notas, sellos o flechas/)
})

test('DOS SEGMENTACIONES de la misma lámina dan las mismas regiones en el mismo orden', () => {
  const lamina = { ancho: 1000, alto: 1000, trazos: [[0, 0, 400, 400], [600, 600, 900, 900]], textos: [] }
  assert.deepEqual(segmentar(lamina), segmentar(lamina))
})

test('PDF: una hoja tapada por una imagen es RASTER; con trazos es VECTORIAL', () => {
  const area = 1000 * 1000
  assert.equal(clasificarPagina({ caracteres: 0, trazos: 0, imagenes: [[0, 0, 1000, 1000]], area }), CLASE_PDF.RASTER)
  assert.equal(clasificarPagina({ caracteres: 500, trazos: 300, imagenes: [[0, 0, 50, 50]], area }), CLASE_PDF.VECTORIAL, 'el logo de la empresa no convierte un plano vectorial en un escaneo')
  assert.equal(clasificarPagina({ caracteres: 500, trazos: 300, imagenes: [[0, 0, 1000, 1000]], area }), CLASE_PDF.MIXTO)
  assert.equal(clasificarPagina({ caracteres: 5000, trazos: 2, imagenes: [], area }), CLASE_PDF.TEXTO)
  assert.equal(clasificarPagina({ caracteres: 0, trazos: 0, imagenes: [], area }), CLASE_PDF.VACIO)
})

test('PDF: los renglones se arman por Y con tolerancia, y se ordenan por X', () => {
  const r = renglones([
    { x: 300, y: 100.5, texto: '$ 8.277' },
    { x: 50, y: 100, texto: 'Item:' },
    { x: 90, y: 100, texto: 'Demolición' },
    { x: 50, y: 80, texto: 'otro renglón' },
  ])
  assert.equal(r.length, 2)
  assert.equal(r[0].texto, 'Item:Demolición$ 8.277', 'de arriba hacia abajo, y dentro del renglón de izquierda a derecha')
})

test('PDF: la caja de un trazo se lleva a coordenadas de hoja con la matriz corriente', () => {
  const escala2 = [2, 0, 0, 2, 10, 20]
  assert.deepEqual(transformarCaja(escala2, [0, 0, 1, 1]), [10, 20, 12, 22])
  assert.deepEqual(componer([1, 0, 0, 1, 0, 0], escala2), escala2, 'componer con la identidad no cambia nada')
})

// ═══ G1 · DOS VISTAS QUE SE PISAN SE RECORTAN Y SE MIRAN DOS VECES ═══
//
// Medido sobre una lámina real: 13 de 28 pares de vistas se pisaban y la suma de áreas daba 1,11
// veces la hoja. Cada solape es un pedazo del plano recortado dos veces, mirado dos veces (dos
// llamadas de visión) y devuelto como dos elementos con nombres distintos: es el motor del doble
// cómputo. Con la envolvente robusta la suma bajó a 0,99 y 0,93.

test('G1 · UNA COTA ESTIRADA NO AGRANDA LA VISTA HASTA TAPAR A LA DE AL LADO', () => {
  const titulo = { x: 100, y: 100 }
  const cerca = Array.from({ length: 20 }, (_, i) => [90 + i, 90 + i, 110 + i, 110 + i])
  const lejana = [900, 900, 950, 950]
  const conTodo = cajaRobusta([...cerca, lejana], titulo, { percentil: 1 })
  const robusta = cajaRobusta([...cerca, lejana], titulo)
  assert.ok(conTodo.caja[2] >= 950, 'con todas, el rabo estira la caja hasta el otro dibujo')
  assert.ok(robusta.caja[2] < 300, 'la envolvente robusta deja el rabo afuera')
  assert.equal(robusta.dejadas, 1, 'y lo que quedó afuera se cuenta: el recorte no se achica en silencio')
})

test('G1 · con una sola caja no se descarta nada — el percentil nunca deja una vista vacía', () => {
  const r = cajaRobusta([[10, 10, 20, 20]], { x: 15, y: 15 })
  assert.deepEqual(r.caja, [10, 10, 20, 20])
  assert.equal(r.dejadas, 0)
})

test('G1 · LA MISMA CAJA CON DOS TÍTULOS es una vista repetida: se absorbe y se declara', () => {
  const a = { n: 1, titulo: 'ESTRUCTURA TECHO', tipo: 'planta', caja: [0, 0, 100, 100] }
  const b = { n: 2, titulo: 'PLANTA DE TECHOS', tipo: 'planta', caja: [2, 2, 98, 98] }
  const otra = { n: 3, titulo: 'CORTE A-A', tipo: 'corte', caja: [200, 0, 300, 100] }
  const r = absorberContenidas([a, b, otra])
  assert.equal(r.regiones.length, 2)
  assert.equal(r.absorbidas.length, 1)
  assert.match(r.absorbidas[0].porQue, /una sola vista con dos títulos/)
})

test('G1 · UN DETALLE CHICO ADENTRO DE UNA PLANTA NO SE ABSORBE — es el motivo por el que se segmenta', () => {
  // Absorberlo tira el motivo entero: un detalle de 8 mm en el papel sólo se puede leer recortado
  // y ampliado. Medido: la regla anterior se comió tres «Detalle …» adentro de «ESTRUCTURA TECHO».
  const planta = { n: 1, titulo: 'ESTRUCTURA TECHO', tipo: 'planta', caja: [0, 0, 100, 100] }
  const detalle = { n: 2, titulo: 'Detalle soldadura perfiles', tipo: 'detalle', caja: [10, 10, 40, 40] }
  const r = absorberContenidas([planta, detalle])
  assert.equal(r.regiones.length, 2)
  assert.equal(r.absorbidas.length, 0)
  assert.equal(contenidaEn([10, 10, 40, 40], [0, 0, 100, 100]), 1, 'está 100% adentro y aun así es una vista propia')
})

test('G1 · dos vistas que apenas se rozan NO se absorben', () => {
  const r = absorberContenidas([
    { n: 1, titulo: 'A', caja: [0, 0, 100, 100] },
    { n: 2, titulo: 'B', caja: [90, 0, 190, 100] },
  ])
  assert.equal(r.regiones.length, 2)
  assert.equal(r.absorbidas.length, 0)
})
