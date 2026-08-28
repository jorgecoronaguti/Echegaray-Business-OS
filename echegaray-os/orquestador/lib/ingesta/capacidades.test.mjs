// QUE «SOPORTADO» NO PUEDA VOLVER A SER UNA SOLA PALABRA.
//
// ═══ POR QUÉ LOS PDF DE ACÁ SE FABRICAN Y NO SE HARDCODEA LA CLASE ═══
//
// La pregunta que este cuadro tiene que contestar —«un PDF sin capa de texto, ¿hasta dónde llega?»—
// no se puede contestar escribiendo `clase: 'RASTER'` en un objeto: eso prueba que el cuadro sabe
// imprimir lo que le dan. Los dos PDF de abajo son PDF de verdad, de nueve objetos, y los abre
// `leerPdf` con pdfjs igual que a un plano de Drive. La clase RASTER la decide `clasificarPagina`
// mirando la imagen que tapa la hoja, que es la ruta de producción.
//
// Y ninguno de los dos proyectos reales tiene un PDF escaneado: sin este fixture, la fila «PDF
// raster» del cuadro sería una fila que nunca se ejecutó.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { cuadroDeFormatos, etapasDeArchivo, etapasDeCad, filaContenedor, filaRol, claseDominante, ETAPA, FILA } from './capacidades.mjs'
import { leerPdf, CLASE_PDF } from './pdf.mjs'
import { segmentarLamina } from '../plano/documental.mjs'
import { partirDocumentos } from '../plano/documentos.mjs'

/** Un PDF de una página con los objetos que se le pasen. Mínimo pero válido: tabla xref con los
 *  offsets reales, que es lo que pdfjs necesita para no entrar en modo recuperación. */
function armarPdf({ ancho = 595, alto = 842, recursos = '', contenido = '', extra = [] } = {}) {
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${ancho} ${alto}] /Resources << ${recursos} >> /Contents 4 0 R >>`,
    `<< /Length ${contenido.length} >>\nstream\n${contenido}\nendstream`,
    ...extra,
  ]
  let cuerpo = '%PDF-1.4\n'
  const offsets = []
  objs.forEach((o, i) => { offsets.push(cuerpo.length); cuerpo += `${i + 1} 0 obj\n${o}\nendobj\n` })
  const inicio = cuerpo.length
  let xref = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`
  for (const o of offsets) xref += `${String(o).padStart(10, '0')} 00000 n \n`
  cuerpo += `${xref}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${inicio}\n%%EOF\n`
  return Buffer.from(cuerpo, 'latin1')
}

/** Un plano ESCANEADO: una imagen que tapa la hoja entera, cero trazos y cero letras. */
const pdfRaster = () => armarPdf({
  recursos: '/XObject << /Im0 5 0 R >>',
  contenido: 'q 595 0 0 842 0 0 cm /Im0 Do Q',
  extra: ['<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceGray /BitsPerComponent 8 /Length 1 >>\nstream\n\x80\nendstream'],
})

/** Un plano DIBUJADO: trazos de verdad, ninguno lo bastante grande como para ser una vista — así el
 *  fixture no necesita el recortador de imágenes y sigue midiendo lo mismo. */
const pdfVectorial = () => armarPdf({
  contenido: Array.from({ length: 30 }, (_, i) => `${10 + i * 3} ${10 + i * 3} 12 12 re S`).join('\n'),
})

const escribirTemporal = async (bytes, nombre) => {
  const ruta = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'xsas-cap-')), nombre)
  fs.writeFileSync(ruta, bytes)
  return ruta
}

const fila = (nombre, extra = {}) => ({ name: nombre, path: `/obra/${nombre}`, mime_type: extra.mime ?? 'application/octet-stream', drive_file_id: nombre, is_folder: false })

test('EL PDF RASTER SE ABRE Y NO SE PARSEA — y eso es la respuesta correcta, no una falla del cuadro', async () => {
  const bytes = pdfRaster()
  const d = await leerPdf(bytes)
  assert.equal(d.clase, CLASE_PDF.RASTER, 'lo decide clasificarPagina, no el fixture')
  const seg = await segmentarLamina({ name: 'Escaneado.pdf' }, bytes, { escribirTemporal })
  assert.equal(seg.paginas, 1, 'el PDF abre perfecto: por eso «se abrió» no puede ser la prueba')
  assert.equal(seg.laminas[0].trazos, 0)
  assert.equal(seg.laminas[0].caracteres, 0)
  assert.equal(seg.laminas[0].regiones.length, 0, 'sin trazos ni textos no hay vista que recortar')

  const { insumos } = partirDocumentos([fila('Escaneado.pdf', { mime: 'application/pdf' })])
  const r = { documentos: { insumos }, documental: { segmentaciones: [{ ...seg, archivo: 'Escaneado.pdf' }] } }
  const e = etapasDeArchivo(insumos[0], r, indiceVacio())
  assert.equal(e.etapas[ETAPA.DETECTADO].ok, true)
  assert.equal(e.etapas[ETAPA.PARSEADO].ok, false, 'ABRIR NO ES PARSEAR: si esto se pone verde, el cuadro volvió a mentir')
  assert.match(e.etapas[ETAPA.PARSEADO].porQue, /es una imagen adentro de un PDF/)
  assert.equal(e.contenedor, FILA.PDF_RASTER.clave)
})

test('EL PDF VECTORIAL SÍ SE PARSEA — el control puede dar verde, no está clavado en rojo', async () => {
  const bytes = pdfVectorial()
  const seg = await segmentarLamina({ name: 'Plano.pdf' }, bytes, { escribirTemporal })
  assert.ok(seg.laminas[0].trazos >= 20, `salieron ${seg.laminas[0].trazos} trazos`)
  const { insumos } = partirDocumentos([fila('Plano.pdf', { mime: 'application/pdf' })])
  const r = { documentos: { insumos }, documental: { segmentaciones: [{ ...seg, archivo: 'Plano.pdf' }] } }
  const e = etapasDeArchivo(insumos[0], r, indiceVacio())
  assert.equal(e.etapas[ETAPA.PARSEADO].ok, true)
  assert.equal(e.contenedor, FILA.PDF_VECTORIAL.clave)
})

/** Los índices vacíos: ningún elemento, ningún hecho. Sirve para probar las etapas de arriba sin
 *  arrastrar un cómputo entero — y deja INTERPRETADO en rojo, que es lo que corresponde. */
const indiceVacio = () => ({ elementos: new Map(), items: new Map(), hechos: new Map(), hechosDePieza: new Map(), enProyecto: new Map(), cruzados: new Map() })

test('LAS CUATRO ETAPAS NO SON UNA ESCALERA: una imagen llega a INTERPRETADO sin pasar por PARSEADO', () => {
  const { insumos } = partirDocumentos([fila('Croquis de obra.jpg', { mime: 'image/jpeg' })])
  const ix = indiceVacio()
  ix.elementos.set('Croquis de obra.jpg', 3)
  ix.items.set('Croquis de obra.jpg', 2)
  const e = etapasDeArchivo(insumos[0], { documentos: { insumos }, documental: {} }, ix)
  assert.equal(e.etapas[ETAPA.DETECTADO].ok, true)
  assert.equal(e.etapas[ETAPA.PARSEADO].ok, false, 'no hay lector local que le saque estructura a un JPG')
  assert.equal(e.etapas[ETAPA.INTERPRETADO].ok, true, 'la visión mira el archivo entero')
  assert.equal(e.etapas[ETAPA.INTEGRADO_PROYECTO].ok, true)
  assert.match(e.etapas[ETAPA.INTERPRETADO].porQue, /sin estructura previa/)
})

test('UN FORMATO QUE NO ESTÁ EN LA TABLA NO SE DETECTA — y sale nombrado, no ignorado', () => {
  const { insumos } = partirDocumentos([fila('Galpon.bak')])
  const e = etapasDeArchivo(insumos[0], { documentos: { insumos }, documental: {} }, indiceVacio())
  assert.equal(e.etapas[ETAPA.DETECTADO].ok, false)
  assert.equal(e.contenedor, null)
  assert.match(e.etapas[ETAPA.DETECTADO].porQue, /ni la extensión «\.bak» ni el MIME/)
})

test('UN PDF CUYA CLASE NO SE CONOCE NO ES «VECTORIAL POR DEFECTO»', () => {
  assert.equal(filaContenedor('x.pdf', { clasePdf: null }), null)
  assert.equal(filaContenedor('x.pdf', { clasePdf: 'RASTER' }), FILA.PDF_RASTER)
  assert.equal(filaContenedor('x.pdf', { clasePdf: 'MIXTO' }), FILA.PDF_VECTORIAL, 'con trazos se puede medir aunque haya imagen')
  assert.equal(filaContenedor('x.tif'), FILA.TIFF)
  assert.equal(filaContenedor('x.xlsm'), FILA.EXCEL)
  assert.equal(filaContenedor('x.docx'), FILA.DOC)
})

test('el ROL sale de la misma función que decide el peso de la fuente, no de una segunda tabla', () => {
  assert.equal(filaRol('MEMORIA'), FILA.MEMORIA)
  assert.equal(filaRol('PLIEGO'), FILA.PLIEGO)
  assert.equal(filaRol('PLANILLA'), null, 'una planilla del cliente no es una especificación')
  assert.equal(filaRol(null), null)
})

test('la clase del documento es la de la mayoría de sus páginas, y el empate se resuelve estable', () => {
  assert.equal(claseDominante([{ clase: 'VECTORIAL' }, { clase: 'VECTORIAL' }, { clase: 'RASTER' }]), 'VECTORIAL')
  assert.equal(claseDominante([{ clase: 'RASTER' }, { clase: 'VECTORIAL' }]), 'RASTER', 'orden alfabético: dos corridas dicen lo mismo')
  assert.equal(claseDominante([]), null)
})

test('UNA FILA SIN ARCHIVOS NO PUEDE LEERSE COMO VERDE — no hay evidencia de nada', () => {
  const c = cuadroDeFormatos({ documentos: { insumos: [] }, documental: {} })
  for (const f of c.filas) {
    assert.equal(f.archivos, 0)
    assert.equal(f.alcanza, null, `${f.clave} sin archivos no puede declarar una etapa alcanzada`)
    assert.match(f.porQue, /no puede afirmar nada/)
  }
})

test('EL CUADRO CUENTA ARCHIVOS REALES: si uno se cae, la fila baja', () => {
  const filas = [fila('Plano.pdf', { mime: 'application/pdf' }), fila('Otro.pdf', { mime: 'application/pdf' })]
  const { insumos } = partirDocumentos(filas)
  const r = {
    documentos: { insumos, reservados: [] },
    documental: {
      segmentaciones: [
        { archivo: 'Plano.pdf', paginas: 1, laminas: [{ clase: 'VECTORIAL', trazos: 40, caracteres: 100, regiones: [{}, {}] }] },
        { archivo: 'Otro.pdf', paginas: 1, laminas: [{ clase: 'RASTER', trazos: 0, caracteres: 0, regiones: [] }] },
      ],
    },
    laminas: [{ archivo: 'Plano.pdf', elementos: [{ id: 'A' }] }],
    computo: { items: [{ archivo: 'Plano.pdf', id: 'A' }] },
  }
  const c = cuadroDeFormatos(r)
  const vect = c.filas.find((f) => f.clave === 'PDF_VECTORIAL')
  const rast = c.filas.find((f) => f.clave === 'PDF_RASTER')
  assert.equal(vect.archivos, 1)
  assert.equal(vect[ETAPA.INTEGRADO_PROYECTO], 1)
  assert.equal(vect.alcanza, ETAPA.INTEGRADO_PROYECTO)
  assert.equal(rast.archivos, 1)
  assert.equal(rast[ETAPA.PARSEADO], 0)
  assert.equal(rast.alcanza, ETAPA.DETECTADO, 'el escaneado se queda en DETECTADO')
})

test('LOS RESERVADOS NO ENSUCIAN EL CUADRO: no están sin leer por una limitación, se cuentan aparte', () => {
  const c = cuadroDeFormatos({ documentos: { insumos: [], reservados: [{ name: 'PRESUPUESTO.pdf' }, { name: 'COMPUTO.xlsx' }] }, documental: {} })
  assert.equal(c.archivos.length, 0)
  assert.equal(c.reservados, 2)
  assert.match(c.resumen, /2 reservado\(s\)/)
})

test('DOS CUADROS SOBRE LA MISMA CORRIDA DAN EXACTAMENTE LO MISMO', () => {
  const { insumos } = partirDocumentos([fila('A.pdf', { mime: 'application/pdf' }), fila('B.dwg')])
  const r = { documentos: { insumos }, documental: { cad: [{ archivo: 'B.dwg', medicion: { entidades: 10, capas: ['x'], cotas: [] } }] } }
  assert.deepEqual(cuadroDeFormatos(r), cuadroDeFormatos(r))
})

test('NEGATIVO: un CAD que ABRE con cero entidades no está PARSEADO — abrir no es parsear', () => {
  // Del lado PDF esta regla ya tenía su test; del lado CAD no, y mutarla a `etapa(true, …)`
  // sobrevivía: un DWG vacío se reportaba parseado y ningún control se ponía en rojo.
  const ix = { hechosDePieza: new Map(), enProyecto: new Map(), cruzados: new Map() }
  const vacio = etapasDeCad({ medicion: { entidades: 0, capas: [], cotas: [] } }, ix, 'planta.dwg')
  assert.equal(vacio[ETAPA.PARSEADO].ok, false, 'si esto diera true, «PARSEADO» no mediría nada')
  assert.match(vacio[ETAPA.PARSEADO].porQue, /0 entidad/)
  // Y el caso contrario, sin el cual no sería un control: con entidades, sí parsea.
  const lleno = etapasDeCad({ medicion: { entidades: 1240, capas: ['A'], cotas: [1, 2] } }, ix, 'planta.dwg')
  assert.equal(lleno[ETAPA.PARSEADO].ok, true)
})
