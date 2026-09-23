import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  MAX_ARCHIVOS, MAX_BYTES, aTimestampLocal, agruparPorDia, agruparPorFrente, archivoAceptable, descripcionFinal,
  esRutaDelParte, fechaDeTomaExif, fechaExifAIso, medidaComprimida, ordenarAdjuntos, resumenDeAdjuntos,
  revisarLote, rutaDeAdjunto, tipoDe, traducirError, type AdjuntoDeParte,
} from './parteAdjuntos.ts'

// LAS REGLAS DEL REGISTRO MULTIMEDIA DEL PARTE (pedido del dueño, 23/09/2026). Lo que decide qué
// entra, cómo se nombra el objeto y cómo se agrupa, sin navegador ni base.

const ID = '6f1c2a3e-1111-4222-8333-444455556666'

test('qué entra: foto, video y PDF por tipo; y si el navegador no trae tipo, por extensión', () => {
  assert.deepEqual(archivoAceptable({ name: 'a.jpg', type: 'image/jpeg', size: 10 }),
    { ok: true, mediaType: 'image/jpeg', clase: 'imagen', extension: 'jpg' })
  assert.equal(tipoDe({ name: 'IMG_1.HEIC', type: '', size: 1 }), 'image/heic')
  assert.equal(tipoDe({ name: 'clip.mov', type: 'application/octet-stream', size: 1 }), 'video/quicktime')
  assert.equal(archivoAceptable({ name: 'clip.mov', type: '', size: 5 }).ok, true)
  assert.equal(archivoAceptable({ name: 'plano.pdf', type: 'application/pdf', size: 5 }).ok, true)
})

test('qué no entra: docx, vacío, más pesado que el tope de su clase (y el tope es por clase)', () => {
  const docx = archivoAceptable({ name: 'contrato.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 5 })
  assert.equal(docx.ok, false)
  assert.match(!docx.ok ? docx.error : '', /no es una foto, un video/)
  const vacio = archivoAceptable({ name: 'a.jpg', type: 'image/jpeg', size: 0 })
  assert.match(!vacio.ok ? vacio.error : '', /vacío/)
  const videoGrande = archivoAceptable({ name: 'v.mp4', type: 'video/mp4', size: MAX_BYTES.video + 1 })
  assert.match(!videoGrande.ok ? videoGrande.error : '', /más de 100 MB/)
  // Un video de 60 MB entra; una imagen de 60 MB no: el tope del bucket no es el tope de la foto.
  assert.equal(archivoAceptable({ name: 'v.mp4', type: 'video/mp4', size: 60 * 1024 * 1024 }).ok, true)
  assert.equal(archivoAceptable({ name: 'f.png', type: 'image/png', size: 60 * 1024 * 1024 }).ok, false)
})

test('el lote: un archivo malo no voltea a los buenos, el tope se aplica sobre los aceptados y el sobrante se nombra', () => {
  const buenos = Array.from({ length: MAX_ARCHIVOS + 2 }, (_, i) => ({ name: `f${i}.jpg`, type: 'image/jpeg', size: 10 }))
  const r = revisarLote([{ name: 'x.docx', type: 'application/msword', size: 3 }, ...buenos])
  assert.equal(r.aceptados.length, MAX_ARCHIVOS)
  assert.equal(r.rechazados.length, 1)
  assert.deepEqual(r.sobrantes, [`f${MAX_ARCHIVOS}.jpg`, `f${MAX_ARCHIVOS + 1}.jpg`])
  assert.match(r.aviso ?? '', /x\.docx/)
  assert.match(r.aviso ?? '', /2 quedaron afuera/)
  assert.equal(revisarLote([]).aviso, null)
})

test('la ruta es obra/<obra>/<fecha>/<uuid>.<ext>, con la extensión del TIPO y no del nombre', () => {
  assert.equal(rutaDeAdjunto({ obraId: 'galpon-9', fecha: '2026-09-23', id: ID.toUpperCase(), mediaType: 'video/quicktime' }),
    `obra/galpon-9/2026-09-23/${ID}.mov`)
  assert.throws(() => rutaDeAdjunto({ obraId: '../otra', fecha: '2026-09-23', id: ID, mediaType: 'image/jpeg' }), /obra válida/)
  assert.throws(() => rutaDeAdjunto({ obraId: 'galpon-9', fecha: '23/09/2026', id: ID, mediaType: 'image/jpeg' }), /AAAA-MM-DD/)
  assert.throws(() => rutaDeAdjunto({ obraId: 'galpon-9', fecha: '2026-09-23', id: 'x', mediaType: 'image/jpeg' }), /uuid/)
  assert.throws(() => rutaDeAdjunto({ obraId: 'galpon-9', fecha: '2026-09-23', id: ID, mediaType: 'text/html' }), /no es un tipo aceptado/)
})

test('esRutaDelParte hace la misma pregunta que la policy: esa obra, ese día, un uuid con extensión', () => {
  const ruta = `obra/galpon-9/2026-09-23/${ID}.jpg`
  assert.equal(esRutaDelParte(ruta, 'galpon-9', '2026-09-23'), true)
  assert.equal(esRutaDelParte(ruta, 'galpon-9', '2026-09-22'), false)
  assert.equal(esRutaDelParte(ruta, 'quattropani', '2026-09-23'), false)
  assert.equal(esRutaDelParte(`obra/galpon-9/2026-09-23/../${ID}.jpg`, 'galpon-9', '2026-09-23'), false)
  assert.equal(esRutaDelParte(`galpon-9/2026-09-23/${ID}.jpg`, 'galpon-9', '2026-09-23'), false)
})

const fila = (p: Partial<AdjuntoDeParte> & { id: string }): AdjuntoDeParte => ({
  obra_id: 'galpon-9', fecha: '2026-09-23', actividad_id: null, ejecucion_id: null, storage_path: `obra/galpon-9/2026-09-23/${p.id}.jpg`,
  nombre_archivo: 'f.jpg', tipo_mime: 'image/jpeg', tamano_bytes: 10, descripcion: null, tomada_en: null, subido_por: 'u',
  creado_en: '2026-09-23T21:00:00Z', borrado_en: null, ...p,
})

test('orden: por cuándo se sacó, y si no se sabe por cuándo se subió; las borradas no se dibujan', () => {
  const as = [
    fila({ id: 'c', creado_en: '2026-09-23T21:30:00Z' }),
    fila({ id: 'a', tomada_en: '2026-09-23T11:00:00Z', creado_en: '2026-09-23T21:40:00Z' }),
    fila({ id: 'b', tomada_en: '2026-09-23T14:00:00Z', creado_en: '2026-09-23T21:20:00Z' }),
    fila({ id: 'z', borrado_en: '2026-09-23T22:00:00Z' }),
  ]
  assert.deepEqual(ordenarAdjuntos(as).map((a) => a.id), ['a', 'b', 'c'])
})

test('por día: el más reciente arriba; por frente: «Del día» primero, después el orden del parte, y el frente desconocido se dice', () => {
  const as = [
    fila({ id: 'a', fecha: '2026-09-22' }),
    fila({ id: 'b', fecha: '2026-09-23', actividad_id: 'f2' }),
    fila({ id: 'c', fecha: '2026-09-23', actividad_id: 'f1' }),
    fila({ id: 'd', fecha: '2026-09-23', actividad_id: 'fantasma' }),
  ]
  const dias = agruparPorDia(as)
  assert.deepEqual(dias.map((d) => d.fecha), ['2026-09-23', '2026-09-22'])
  assert.equal(dias[0].adjuntos.length, 3)
  const g = agruparPorFrente(as.filter((a) => a.fecha === '2026-09-23'), [{ id: 'f1', nombre: 'Mampostería' }, { id: 'f2', nombre: 'Techo' }])
  assert.deepEqual(g.map((x) => [x.rotulo, x.adjuntos.map((a) => a.id)]),
    [['Mampostería', ['c']], ['Techo', ['b']], ['frente sin nombre', ['d']]])
  const conDelDia = agruparPorFrente([fila({ id: 'x' }), fila({ id: 'y', actividad_id: 'f1' })], [{ id: 'f1', nombre: 'Mampostería' }])
  assert.deepEqual(conDelDia.map((x) => x.rotulo), ['Del día', 'Mampostería'])
})

test('el resumen cuenta por clase y el cero se dice «sin fotos» (NULL nunca es 0)', () => {
  assert.equal(resumenDeAdjuntos([]), 'sin fotos')
  assert.equal(resumenDeAdjuntos([fila({ id: 'a' }), fila({ id: 'b' }), fila({ id: 'v', tipo_mime: 'video/mp4' }),
    fila({ id: 'p', tipo_mime: 'application/pdf' }), fila({ id: 'z', borrado_en: 'x' })]), '2 fotos · 1 video · 1 PDF')
  assert.equal(resumenDeAdjuntos([fila({ id: 'a' })]), '1 foto')
})

test('EXIF: DateTimeOriginal de un JPEG mínimo, little y big endian; sin APP1 → null; basura → null', () => {
  assert.equal(fechaDeTomaExif(jpegConExif('2026:09:23 08:14:05', true)), '2026-09-23T08:14:05')
  assert.equal(fechaDeTomaExif(jpegConExif('2026:09:23 08:14:05', false)), '2026-09-23T08:14:05')
  assert.equal(fechaDeTomaExif(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2])), null)
  assert.equal(fechaDeTomaExif(new Uint8Array([1, 2, 3])), null)
  assert.equal(fechaDeTomaExif(jpegConExif('0000:00:00 00:00:00', true)), null)
  assert.equal(fechaExifAIso('2026:13:01 00:00:00'), null)
  assert.match(aTimestampLocal('2026-09-23T08:14:05'), /Z$/)
})

test('la compresión no agranda y respeta el lado mayor', () => {
  assert.deepEqual(medidaComprimida(4000, 3000), { ancho: 2000, alto: 1500, reduce: true })
  assert.deepEqual(medidaComprimida(1200, 1600), { ancho: 1200, alto: 1600, reduce: false })
  assert.deepEqual(medidaComprimida(1000, 4000), { ancho: 500, alto: 2000, reduce: true })
})

test('la descripción del conjunto llena sólo lo que no tiene texto propio; vacío es null', () => {
  assert.equal(descripcionFinal('  ', 'Encofrado listo'), 'Encofrado listo')
  assert.equal(descripcionFinal('Columna C3', 'Encofrado listo'), 'Columna C3')
  assert.equal(descripcionFinal('', ''), null)
})

test('los errores se dicen en castellano y el desconocido se deja tal cual', () => {
  assert.match(traducirError('new row violates row-level security policy'), /no puede cargar fotos/)
  assert.match(traducirError('mime type text/html is not supported'), /no entra/)
  assert.equal(traducirError('algo raro'), 'algo raro')
})

/** Un JPEG de mentira con APP1 Exif → TIFF → IFD0 (un tag: ExifIFD) → Exif IFD (un tag: DateTimeOriginal). */
function jpegConExif(fecha: string, le: boolean): Uint8Array {
  const tiff: number[] = []
  const u16 = (n: number) => le ? [n & 0xff, n >> 8] : [n >> 8, n & 0xff]
  const u32 = (n: number) => le ? [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, n >>> 24] : [n >>> 24, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]
  tiff.push(...(le ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(0x2a), ...u32(8))
  // IFD0 en 8: 1 entrada (0x8769 LONG 1 → offset 26), next=0
  tiff.push(...u16(1), ...u16(0x8769), ...u16(4), ...u32(1), ...u32(26), ...u32(0))
  // Exif IFD en 26: 1 entrada (0x9003 ASCII 20 → offset 44), next=0
  tiff.push(...u16(1), ...u16(0x9003), ...u16(2), ...u32(20), ...u32(44), ...u32(0))
  for (const ch of fecha) tiff.push(ch.charCodeAt(0))
  tiff.push(0)
  const app1 = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff]
  const largo = app1.length + 2
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe1, largo >> 8, largo & 0xff, ...app1, 0xff, 0xda, 0, 2])
}
