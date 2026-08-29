// LOS DOS FORMATOS DE WORD, ARMADOS A MANO PARA QUE CADA DEFECTO SE PUEDA PONER ROJO.
//
// No hay archivos de muestra en el repo a propósito: un `.docx` de 400 KB adentro de git no se
// puede revisar en un diff, y un test que depende de un archivo de Drive no corre sin credenciales.
// Todo lo de abajo se construye byte a byte, y cada caso está elegido para que ROMPA una decisión
// concreta del lector si alguien la revierte.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import zlib from 'node:zlib'
import XLSX from 'xlsx'
import { contenido, finDelDirectorio, indice, nombreSeguro, pareceZip, textoDe } from './zip.mjs'
import { DOCX_MIN_CARACTERES_UTILES, bloquesDeXml, desescapar, leerDocx, textoDeBloques } from './docx.mjs'
import { CTRL, leerDocOle, pareceOle, piezas, textoDePiezas } from './doc-ole.mjs'
import { VARIANTE, leerWord, varianteDe } from './word.mjs'

// ═══════════════════════════ un ZIP armado a mano ═══════════════════════════

/** Un ZIP clásico con las entradas que se le pidan. `mentirTamano` fabrica el defecto de una bomba
 *  de descompresión: el directorio declara un tamaño enorme para lo que en realidad se envía. */
function zip(entradas, { mentirTamano = null } = {}) {
  const locales = []
  const central = []
  let off = 0
  for (const [nombre, texto, opciones = {}] of entradas) {
    const datos = Buffer.from(texto, 'utf8')
    const comp = opciones.crudo ? datos : zlib.deflateRawSync(datos)
    const metodo = opciones.crudo ? 0 : 8
    const nb = Buffer.from(nombre, 'utf8')
    const declarado = mentirTamano ?? datos.length
    const lh = Buffer.alloc(30)
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(metodo, 8)
    lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(declarado, 22); lh.writeUInt16LE(nb.length, 26)
    locales.push(lh, nb, comp)
    const cd = Buffer.alloc(46)
    cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(metodo, 10)
    cd.writeUInt32LE(comp.length, 20); cd.writeUInt32LE(declarado, 24)
    cd.writeUInt16LE(nb.length, 28); cd.writeUInt32LE(off, 42)
    central.push(cd, nb)
    off += 30 + nb.length + comp.length
  }
  const cuerpo = Buffer.concat(locales)
  const dir = Buffer.concat(central)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(entradas.length, 8); eocd.writeUInt16LE(entradas.length, 10)
  eocd.writeUInt32LE(dir.length, 12); eocd.writeUInt32LE(cuerpo.length, 16)
  return Buffer.concat([cuerpo, dir, eocd])
}

test('el índice del ZIP sale del directorio central, no de los local headers', () => {
  const b = zip([['a.txt', 'hola'], ['word/document.xml', '<x/>']])
  const ix = indice(b)
  assert.equal(ix.ok, true)
  assert.deepEqual(ix.entradas.map((e) => e.nombre), ['a.txt', 'word/document.xml'])
  assert.equal(textoDe(b, 'a.txt').texto, 'hola')
})

test('un ZIP truncado devuelve el motivo en vez de tirar', () => {
  const b = zip([['a.txt', 'hola']])
  const r = indice(b.subarray(0, b.length - 30))
  assert.equal(r.ok, false)
  assert.match(r.porQue, /directorio central|truncado|partido/)
})

test('lo que no es un ZIP se dice con sus bytes, no con «no hay adaptador»', () => {
  const r = indice(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0, 0, 0, 0]))
  assert.equal(r.ok, false)
  assert.match(r.porQue, /d0 cf 11 e0/)
  assert.equal(pareceZip(Buffer.from([0xd0, 0xcf, 0x11, 0xe0])), false)
})

test('una entrada que se sale de su carpeta no se abre', () => {
  assert.equal(nombreSeguro('../../etc/passwd'), false)
  assert.equal(nombreSeguro('/etc/passwd'), false)
  assert.equal(nombreSeguro('word/document.xml'), true)
  const b = zip([['../fuera.txt', 'x']])
  const r = contenido(b, indice(b).entradas[0])
  assert.equal(r.ok, false)
  assert.match(r.porQue, /sale de su propia carpeta/)
})

test('el tope de expansión se mira ANTES de inflar, no después', () => {
  // Si el control se moviera a después de `inflateRawSync`, este caso pasaría igual y la defensa
  // contra una bomba de descompresión no existiría: inflar para después medir es inflar.
  const b = zip([['g.txt', 'x'.repeat(500)]], { mentirTamano: 900 })
  const r = contenido(b, indice(b).entradas[0], { maxSalida: 100 })
  assert.equal(r.ok, false)
  assert.match(r.porQue, /900 bytes descomprimidos y el tope es 100/)
})

test('el EOCD se busca sólo en la ventana del comentario final', () => {
  const b = zip([['a.txt', 'hola']])
  assert.equal(finDelDirectorio(b), b.length - 22)
  assert.equal(finDelDirectorio(Buffer.alloc(40)), -1)
})

// ═══════════════════════════ el `.docx` ═══════════════════════════

const P = (t) => `<w:p><w:r><w:t>${t}</w:t></w:r></w:p>`
const CELDA = (t) => `<w:tc>${P(t)}</w:tc>`
const FILA = (...cs) => `<w:tr>${cs.map(CELDA).join('')}</w:tr>`
const TABLA = (...fs) => `<w:tbl>${fs.join('')}</w:tbl>`
const DOC = (cuerpo) => `<?xml version="1.0"?><w:document xmlns:w="x"><w:body>${cuerpo}</w:body></w:document>`
const docx = (cuerpo, extras = []) => zip([['[Content_Types].xml', '<Types/>'], ['word/document.xml', DOC(cuerpo)], ...extras])

test('una fila de tabla llega ENTERA: la celda no se despega de su pieza', () => {
  // Éste es el defecto que este lector existe para evitar. Aplanado, «e = 0,5 mm» queda huérfano y
  // no hay forma de saber de qué pieza es el espesor.
  const b = bloquesDeXml(DOC(TABLA(FILA('Chapa T101', 'e = 0,5 mm', '340 m2'))))
  assert.equal(b.length, 1)
  assert.equal(b[0].tipo, 'tabla')
  assert.deepEqual(b[0].filas, [['Chapa T101', 'e = 0,5 mm', '340 m2']])
  assert.match(textoDeBloques(b), /Chapa T101 \| e = 0,5 mm \| 340 m2/)
})

test('el código de un campo no es texto del documento', () => {
  const cuerpo = `<w:p><w:r><w:instrText> PAGEREF _Toc17990 \\h 2 </w:instrText></w:r><w:r><w:t>Capítulo 3</w:t></w:r></w:p>`
  const t = textoDeBloques(bloquesDeXml(DOC(cuerpo)))
  assert.equal(t, 'Capítulo 3')
  assert.doesNotMatch(t, /PAGEREF/)
})

test('el texto borrado con control de cambios no vuelve al documento', () => {
  const cuerpo = `<w:p><w:r><w:delText>espesor 8 mm</w:delText></w:r><w:r><w:t>espesor 12 mm</w:t></w:r></w:p>`
  const t = textoDeBloques(bloquesDeXml(DOC(cuerpo)))
  assert.equal(t, 'espesor 12 mm')
})

test('tabulaciones y saltos de línea son separación real y se conservan', () => {
  const cuerpo = `<w:p><w:r><w:t>Rubro</w:t><w:tab/><w:t>m2</w:t><w:br/><w:t>Sub</w:t></w:r></w:p>`
  assert.equal(textoDeBloques(bloquesDeXml(DOC(cuerpo))), 'Rubro\tm2\nSub')
})

test('las entidades XML se desescapan y `&amp;` va último', () => {
  // Si `&amp;` se resolviera primero, `&amp;lt;` —un `&lt;` literal del documento— se convertiría
  // en un `<` y partiría el texto.
  assert.equal(desescapar('A &amp;lt; B'), 'A &lt; B')
  assert.equal(desescapar('m&#178; &amp; ml'), 'm² & ml')
})

test('un .docx que sólo tiene imágenes NO pasa por leído', () => {
  // El control tiene que PODER dar rojo. Del lado del PDF, el de «sin capa de texto» era incapaz de
  // dispararse porque los marcadores de página contaban como texto, y un reglamento escaneado pasó
  // como leído. Acá se prueba el disparo: 7 caracteres junto a una imagen no es un documento leído.
  const r = leerDocx(docx(P('Obra'), [['word/media/image1.png', 'PNGFALSO']]))
  assert.equal(r.ok, false)
  assert.equal(r.soloImagenes, true)
  assert.match(r.porQue, /adentro de las imágenes/)
})

test('el directorio «word/media/» vacío NO es una imagen: un corto completo no es un FALLO', () => {
  // Un `.docx` guardado con la carpeta de medios creada y sin nada adentro trae la ENTRADA de
  // directorio `word/media/`, de 0 bytes. Contarla empujaba un documento corto pero COMPLETO al
  // camino de «lo que dice está adentro de las imágenes y haría falta OCR»: un fallo inventado.
  const r = leerDocx(docx(P('Carátula de obra'), [['word/media/', '']]))
  assert.equal(r.ok, true, r.porQue)
  assert.equal(r.imagenes, 0)
})

test('un documento corto SIN imágenes se leyó entero: no se lo declara ilegible', () => {
  // La contraparte del test de arriba. Sin ella, bajar el umbral «por las dudas» convertiría 46
  // documentos leídos en 46 fracasos declarados, que es la falla opuesta y cuesta lo mismo.
  const corto = 'Carátula de obra'
  const r = leerDocx(docx(P(corto)))
  assert.equal(r.ok, true)
  assert.equal(r.escaso, true)
  assert.ok(r.utiles < DOCX_MIN_CARACTERES_UTILES)
})

test('un .xlsx no se confunde con un .docx y el motivo lo dice', () => {
  const r = leerDocx(zip([['[Content_Types].xml', '<Types/>'], ['xl/workbook.xml', '<w/>']]))
  assert.equal(r.ok, false)
  assert.match(r.porQue, /libro de Excel/)
})

// ═══════════════════════════ el `.doc` binario ═══════════════════════════

/** Un `.doc` de Word 97 armado byte a byte: FIB + piece table + texto. `pedazos` son los tramos tal
 *  como los guardó Word, y `orden` el orden REAL del documento — que es distinto a propósito. */
function docOle(pedazos, orden, { comprimido = true } = {}) {
  const cab = Buffer.alloc(0x200)
  cab.writeUInt16LE(0xa5ec, 0x0000)
  cab.writeUInt16LE(193, 0x0002)
  cab.writeUInt16LE(0x0200, 0x000A)   // el piece table vive en 1Table
  const tramos = []
  let cursor = 0x200
  for (const p of pedazos) {
    const b = comprimido ? Buffer.from(p, 'latin1') : Buffer.from(p, 'utf16le')
    tramos.push({ desde: cursor, bytes: b, caracteres: p.length })
    cursor += b.length
  }
  const doc = Buffer.concat([cab, ...tramos.map((t) => t.bytes)])
  const n = orden.length
  const plc = Buffer.alloc(4 * (n + 1) + 8 * n)
  let cp = 0
  for (let i = 0; i < n; i++) { plc.writeUInt32LE(cp, i * 4); cp += tramos[orden[i]].caracteres }
  plc.writeUInt32LE(cp, n * 4)
  for (let i = 0; i < n; i++) {
    const off = (n + 1) * 4 + i * 8
    const fc = comprimido ? (tramos[orden[i]].desde * 2) | 0x40000000 : tramos[orden[i]].desde
    plc.writeUInt32LE(fc >>> 0, off + 2)
  }
  const clx = Buffer.concat([Buffer.from([0x02]), (() => { const l = Buffer.alloc(4); l.writeUInt32LE(plc.length, 0); return l })(), plc])
  cab.writeUInt32LE(0, 0x01A2)
  cab.writeUInt32LE(clx.length, 0x01A6)
  cab.writeUInt32LE(cp, 0x004C)
  doc.writeUInt32LE(0, 0x01A2)
  doc.writeUInt32LE(clx.length, 0x01A6)
  doc.writeUInt32LE(cp, 0x004C)
  const cfb = XLSX.CFB.utils.cfb_new()
  XLSX.CFB.utils.cfb_add(cfb, 'WordDocument', doc)
  XLSX.CFB.utils.cfb_add(cfb, '1Table', clx)
  return Buffer.from(XLSX.CFB.write(cfb, { type: 'buffer' }))
}

test('el texto de un .doc sale del piece table, no del orden en que está guardado', () => {
  // Word guarda la edición nueva AL FINAL y deja la vieja adentro. Un lector que recorra el flujo de
  // punta a punta devuelve «SEGUNDOPRIMERO» —o peor, con el texto descartado en el medio—. Este
  // caso da rojo exactamente ahí.
  const b = docOle(['SEGUNDO. Espesor 12 mm. ', 'PRIMERO. Alcance de la obra. '], [1, 0])
  const r = leerDocOle(b)
  assert.equal(r.ok, true)
  assert.equal(r.piezas, 2)
  assert.equal(r.texto, 'PRIMERO. Alcance de la obra. SEGUNDO. Espesor 12 mm.')
})

test('un .doc en UTF-16 se lee igual que uno comprimido a un byte', () => {
  const r = leerDocOle(docOle(['Hormigón H-25 · 340 m² de cubierta'], [0], { comprimido: false }))
  assert.equal(r.ok, true)
  assert.equal(r.texto, 'Hormigón H-25 · 340 m² de cubierta')
})

test('los controles del .doc son estructura: celda, párrafo y código de campo', () => {
  const doc = Buffer.from(`A${String.fromCharCode(CTRL.CELDA)}B${String.fromCharCode(CTRL.PARRAFO)}${String.fromCharCode(CTRL.CAMPO_INICIO)}PAGEREF x${String.fromCharCode(CTRL.CAMPO_SEPARADOR)}7${String.fromCharCode(CTRL.CAMPO_FIN)}`, 'latin1')
  const t = textoDePiezas(doc, [{ desde: 0, caracteres: doc.length, comprimido: true }])
  assert.equal(t, 'A | B\n7')
  assert.doesNotMatch(t, /PAGEREF/)
})

test('un Clx sin piece table se declara, no se adivina', () => {
  const t = Buffer.from([0x01, 0x02, 0x00, 0xaa, 0xbb])
  const r = piezas(t, 0, t.length)
  assert.equal(r.ok, false)
  assert.match(r.porQue, /no contiene ningún piece table/)
})

test('lo que no es OLE2 se rechaza por su firma', () => {
  assert.equal(pareceOle(Buffer.from('PK')), false)
  const r = leerDocOle(Buffer.from('PKrellenorelleno'))
  assert.equal(r.ok, false)
  assert.match(r.porQue, /D0 CF 11 E0/)
})

// ═══════════════════════════ la puerta ═══════════════════════════

test('la firma decide el lector, no la extensión', () => {
  // Un `.docx` renombrado `.doc` es habitual en este data room. Elegir por el nombre lo declara
  // ilegible con un motivo que además miente.
  assert.equal(varianteDe(docx(P('x'))), VARIANTE.OOXML)
  assert.equal(varianteDe(docOle(['x'], [0])), VARIANTE.OLE2)
  assert.equal(varianteDe(Buffer.from('{\\rtf1\\ansi')), VARIANTE.RTF)
  const r = leerWord(docx(P('Memoria descriptiva de la obra: alcance, materiales y condiciones de ejecución acordadas con el comitente en la reunión de obra.')), { nombre: 'memoria.doc' })
  assert.equal(r.variante, VARIANTE.OOXML)
  assert.equal(r.ok, true)
})

test('lo que no es Word devuelve el motivo con el nombre del archivo', () => {
  const r = leerWord(Buffer.from('%PDF-1.7 esto es un pdf'), { nombre: 'pliego.doc' })
  assert.equal(r.ok, false)
  assert.equal(r.variante, VARIANTE.DESCONOCIDA)
  assert.match(r.porQue, /pliego\.doc/)
})
