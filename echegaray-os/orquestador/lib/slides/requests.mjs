// DE CAJAS A LA SLIDES API. La única traducción, y la única parte que sabe cómo se llama cada cosa
// en Google.
//
// ═══ TRES TRAMPAS DE ESTA API, YA PAGADAS ═══
//
// 1. `objectId` tiene que medir 5 caracteres o más. Un id como «r_1» hace fallar el batch entero
//    con un 400 que no dice cuál de las cien peticiones fue. Por eso `oid()` prefija.
// 2. `lineSpacing` es un PORCENTAJE del interlineado simple, y el simple ya es ~1,2 del cuerpo.
//    Pedir 142 cuando se quiere 1,42 da 1,7 real y la lámina desborda con las medidas «bien».
// 3. Un `createImage` con una URL que Google no puede bajar tira todo el batch. Por eso las
//    imágenes salen en su propio lote (ver `motor.mjs`): si el logo falla, se pierde el logo, no
//    la presentación.
//
// PURO: devuelve peticiones, no las manda.

import { rgb } from './marca.mjs'

/** Interlineado simple real de la Slides API, medido: el alto de línea por defecto es ~1,2 em. */
export const LINEA_SIMPLE = 1.2

const pt = (v) => ({ magnitude: Number(v.toFixed(2)), unit: 'PT' })
const color = (hex) => ({ rgbColor: rgb(hex) })

/** Ids válidos para la API a partir de los ids cortos de la composición. PURA. */
export const oid = (id) => `ecs${String(id).replace(/[^\w-]/g, '')}`

const ubicacion = (paginaId, c) => ({
  pageObjectId: paginaId,
  size: { width: pt(c.ancho), height: pt(Math.max(c.alto ?? 12, 1)) },
  transform: { scaleX: 1, scaleY: 1, translateX: Number(c.x.toFixed(2)), translateY: Number(c.y.toFixed(2)), unit: 'PT' },
})

function estiloTexto(objectId, estilo) {
  return {
    updateTextStyle: {
      objectId,
      textRange: { type: 'ALL' },
      style: {
        fontFamily: estilo.fuente,
        fontSize: pt(estilo.tamano),
        bold: !!estilo.negrita,
        foregroundColor: { opaqueColor: color(estilo.color) },
      },
      fields: 'fontFamily,fontSize,bold,foregroundColor',
    },
  }
}

function estiloParrafo(objectId, { alineacion = 'START', alto = 1.35, espacioDebajo = 0, sangria = 0 }) {
  const style = {
    alignment: alineacion,
    lineSpacing: Number(((alto / LINEA_SIMPLE) * 100).toFixed(1)),
    spaceBelow: pt(espacioDebajo),
  }
  let fields = 'alignment,lineSpacing,spaceBelow'
  if (sangria) {
    style.indentStart = pt(sangria)
    style.indentFirstLine = pt(0)
    fields += ',indentStart,indentFirstLine'
  }
  return { updateParagraphStyle: { objectId, textRange: { type: 'ALL' }, style, fields } }
}

/** Peticiones de un rectángulo/elipse. */
function deRect(paginaId, c) {
  const id = oid(c.id)
  const req = [{ createShape: { objectId: id, shapeType: c.forma || 'RECTANGLE', elementProperties: ubicacion(paginaId, c) } }]
  const props = {}
  const campos = []
  if (c.relleno) { props.shapeBackgroundFill = { solidFill: { color: color(c.relleno), alpha: 1 } }; campos.push('shapeBackgroundFill.solidFill.color') }
  if (c.borde) {
    props.outline = { outlineFill: { solidFill: { color: color(c.borde.color), alpha: 1 } }, weight: pt(c.borde.grosor ?? 1), dashStyle: 'SOLID' }
    campos.push('outline')
  } else {
    props.outline = { propertyState: 'NOT_RENDERED' }
    campos.push('outline')
  }
  req.push({ updateShapeProperties: { objectId: id, shapeProperties: props, fields: campos.join(',') } })
  return req
}

/** Caja de texto: sin fondo y sin borde SIEMPRE. El color de fondo lo pone un rectángulo debajo,
 *  que es lo que permite que el control de calidad sepa contra qué contrasta cada texto. */
function deTexto(paginaId, c, fuente) {
  const id = oid(c.id)
  const estilo = { ...c.estilo, fuente }
  const req = [
    { createShape: { objectId: id, shapeType: 'TEXT_BOX', elementProperties: ubicacion(paginaId, c) } },
    {
      updateShapeProperties: {
        objectId: id,
        shapeProperties: { shapeBackgroundFill: { propertyState: 'NOT_RENDERED' }, outline: { propertyState: 'NOT_RENDERED' }, contentAlignment: c.valign || 'TOP' },
        fields: 'shapeBackgroundFill,outline,contentAlignment',
      },
    },
  ]
  if (c.contenido) {
    req.push({ insertText: { objectId: id, text: c.contenido, insertionIndex: 0 } })
    req.push(estiloTexto(id, estilo))
    req.push(estiloParrafo(id, { alineacion: c.alineacion, alto: estilo.alto }))
  }
  return req
}

/** Lista con viñetas de verdad (las dibuja Slides). El aire entre ítems es medio interlineado:
 *  el mismo número que usa `medirBullets`, o la medición y el dibujo dirían cosas distintas. */
function deBullets(paginaId, c, fuente) {
  const id = oid(c.id)
  const estilo = { ...c.estilo, fuente }
  return [
    { createShape: { objectId: id, shapeType: 'TEXT_BOX', elementProperties: ubicacion(paginaId, c) } },
    {
      updateShapeProperties: {
        objectId: id,
        shapeProperties: { shapeBackgroundFill: { propertyState: 'NOT_RENDERED' }, outline: { propertyState: 'NOT_RENDERED' }, contentAlignment: 'TOP' },
        fields: 'shapeBackgroundFill,outline,contentAlignment',
      },
    },
    { insertText: { objectId: id, text: c.items.join('\n'), insertionIndex: 0 } },
    estiloTexto(id, estilo),
    estiloParrafo(id, { alto: estilo.alto, espacioDebajo: estilo.tamano * estilo.alto * 0.5, sangria: 16 }),
    { createParagraphBullets: { objectId: id, textRange: { type: 'ALL' }, bulletPreset: 'BULLET_DISC_CIRCLE_SQUARE' } },
  ]
}

const ALTO_FILA = 24

/** Tabla: cabecera en grafito, filas con separador horizontal y nada de líneas verticales.
 *
 *  El alto sale de `c.altoFilas` —lo que MIDIÓ `componentes.mjs` celda por celda—, no de un
 *  `filas × 24` que Slides ignora estirando la fila hasta que el texto entre. Además se fija
 *  `minRowHeight` por fila: es lo único que la API deja decir sobre el alto de una fila, y hace
 *  que lo dibujado y lo medido sean el mismo número. */
function deTabla(paginaId, c, fuente, paleta) {
  const id = oid(c.id)
  const cabecera = c.cabecera ?? paleta.cabecera
  const celda = c.celda ?? paleta.celda
  const filas = c.filas.length + 1
  const altoFilas = c.altoFilas?.length === filas ? c.altoFilas : Array.from({ length: filas }, () => ALTO_FILA)
  const altoTotal = altoFilas.reduce((a, b) => a + b, 0)
  const req = [{
    createTable: {
      objectId: id,
      elementProperties: { pageObjectId: paginaId, size: { width: pt(c.ancho), height: pt(altoTotal) }, transform: { scaleX: 1, scaleY: 1, translateX: c.x, translateY: c.y, unit: 'PT' } },
      rows: filas,
      columns: c.columnas.length,
    },
  }]
  c.anchoColumnas.forEach((w, i) => req.push({
    updateTableColumnProperties: { objectId: id, columnIndices: [i], tableColumnProperties: { columnWidth: pt(w) }, fields: 'columnWidth' },
  }))
  altoFilas.forEach((h, i) => req.push({
    updateTableRowProperties: { objectId: id, rowIndices: [i], tableRowProperties: { minRowHeight: pt(h) }, fields: 'minRowHeight' },
  }))
  req.push({
    updateTableCellProperties: {
      objectId: id,
      tableRange: { location: { rowIndex: 0, columnIndex: 0 }, rowSpan: 1, columnSpan: c.columnas.length },
      tableCellProperties: { tableCellBackgroundFill: { solidFill: { color: color(paleta.grafito), alpha: 1 } }, contentAlignment: 'MIDDLE' },
      fields: 'tableCellBackgroundFill.solidFill.color,contentAlignment',
    },
  })
  // Cebra suave en las filas pares: separa sin dibujar una sola línea.
  for (let f = 1; f < filas; f += 1) {
    if (f % 2 === 0) {
      req.push({
        updateTableCellProperties: {
          objectId: id,
          tableRange: { location: { rowIndex: f, columnIndex: 0 }, rowSpan: 1, columnSpan: c.columnas.length },
          tableCellProperties: { tableCellBackgroundFill: { solidFill: { color: color(paleta.fondo), alpha: 1 } }, contentAlignment: 'MIDDLE' },
          fields: 'tableCellBackgroundFill.solidFill.color,contentAlignment',
        },
      })
    } else {
      req.push({
        updateTableCellProperties: {
          objectId: id,
          tableRange: { location: { rowIndex: f, columnIndex: 0 }, rowSpan: 1, columnSpan: c.columnas.length },
          tableCellProperties: { contentAlignment: 'MIDDLE' },
          fields: 'contentAlignment',
        },
      })
    }
  }
  const derecha = new Set(c.alinearDerecha || [])
  const celdas = [c.columnas, ...c.filas]
  celdas.forEach((fila, f) => fila.forEach((valor, col) => {
    const txt = String(valor ?? '')
    // ═══ UNA CELDA VACÍA NO LLEVA NINGUNA PETICIÓN ═══
    //
    // Antes salteaba el `insertText` pero mandaba igual el estilo, y `updateTextStyle` con
    // `textRange: ALL` sobre una celda sin texto devuelve `400 · The object has no text` y tumba
    // el lote ENTERO: la presentación queda a medio dibujar. Una fila más corta que la cabecera
    // —que el componente completa con ''— alcanzaba para que el publish fallara.
    // Sin texto no hay nada que estilar: la celda queda con el formato de la tabla, que es
    // exactamente lo que se ve.
    if (!txt) return
    const loc = { rowIndex: f, columnIndex: col }
    const est = f === 0 ? cabecera : celda
    req.push({ insertText: { objectId: id, cellLocation: loc, text: txt, insertionIndex: 0 } })
    req.push({
      updateTextStyle: {
        objectId: id, cellLocation: loc, textRange: { type: 'ALL' },
        style: { fontFamily: fuente, fontSize: pt(est.tamano), bold: !!est.negrita, foregroundColor: { opaqueColor: color(est.color) } },
        fields: 'fontFamily,fontSize,bold,foregroundColor',
      },
    })
    req.push({
      updateParagraphStyle: {
        objectId: id, cellLocation: loc, textRange: { type: 'ALL' },
        // El interlineado es el MISMO con el que se midió la fila, no un 100 fijo: si el dibujo
        // y la medición usan números distintos, la medición no prueba nada.
        style: { alignment: derecha.has(col) ? 'END' : 'START', lineSpacing: Number(((est.alto / LINEA_SIMPLE) * 100).toFixed(1)) },
        fields: 'alignment,lineSpacing',
      },
    })
  }))
  return req
}

function deImagen(paginaId, c) {
  return [{ createImage: { objectId: oid(c.id), url: c.url, elementProperties: ubicacion(paginaId, c) } }]
}

/**
 * Peticiones de UNA lámina, separadas en `principales` (todo lo que no puede fallar) e `imagenes`
 * (lo que Google puede rechazar por no poder bajar la URL). Ver la trampa 3 arriba.
 */
export function requestsDeLamina(paginaId, lamina, { fuente, paleta }) {
  const principales = [{
    updatePageProperties: {
      objectId: paginaId,
      pageProperties: { pageBackgroundFill: { solidFill: { color: color(lamina.fondo), alpha: 1 } } },
      fields: 'pageBackgroundFill.solidFill.color',
    },
  }]
  const imagenes = []
  for (const c of lamina.cajas) {
    if (c.tipo === 'rect') principales.push(...deRect(paginaId, c))
    else if (c.tipo === 'texto') principales.push(...deTexto(paginaId, c, fuente))
    else if (c.tipo === 'bullets') principales.push(...deBullets(paginaId, c, fuente))
    else if (c.tipo === 'tabla') principales.push(...deTabla(paginaId, c, fuente, paleta))
    else if (c.tipo === 'imagen') imagenes.push(...deImagen(paginaId, c))
  }
  return { principales, imagenes }
}

/** Crea las N láminas en blanco. Se hace en su propio lote para conocer los ids de página antes de
 *  dibujar: dibujar y crear en el mismo batch obliga a adivinar el orden de las respuestas. */
export function requestsCrearLaminas(cantidad) {
  return Array.from({ length: cantidad }, (_, i) => ({
    createSlide: { objectId: `ecspag${String(i + 1).padStart(3, '0')}`, insertionIndex: i, slideLayoutReference: { predefinedLayout: 'BLANK' } },
  }))
}

export const idDeLamina = (i) => `ecspag${String(i + 1).padStart(3, '0')}`
