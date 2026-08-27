// ABRIR UN PDF SIN MANDARLO AL MODELO — texto CON COORDENADAS y geometría dibujada.
//
// ═══ POR QUÉ NO ALCANZABA `readPdfText` ═══
//
// `google.readPdfText` devuelve el texto en el orden en que el PDF lo emite, y ese orden miente en
// todo documento que tenga columnas. Medido sobre `JULIO_2026_MANO DE OBRA_CIRCOT.pdf`: los cinco
// encabezados «RUBRO: …» salen AL FINAL de la página, después de los 33 ítems que encabezan. Un
// parser que confíe en el orden le cuelga los ítems de DEMOLICIONES al rubro FUNDACIONES —o a
// ninguno—, y el dato queda mal clasificado sin que nada se rompa.
//
// La posición arregla eso y no cuesta nada: pdfjs ya la trae en `transform`. Un renglón es un
// conjunto de fragmentos que comparten la Y; una columna, los que comparten la X. Con eso, el
// mismo lector sirve para un pliego, para una planilla impresa y para el cuadro de un plano.
//
// ═══ Y POR QUÉ ADEMÁS LA GEOMETRÍA ═══
//
// Un plano vectorial trae los trazos como `constructPath` con su caja envolvente. Eso permite dos
// cosas que la visión no debería tener que hacer: decidir si la lámina es VECTORIAL o RASTER —y por
// lo tanto si conviene medirla o mirarla—, y encontrar las REGIONES dibujadas para recortarlas.
// Contar símbolos diminutos mandando la hoja entera al modelo es la forma cara de equivocarse.
//
// Todo lo de acá es local: 0 llamadas de API, 0 tokens.

/** Cómo está hecha una página. Gobierna con qué herramienta se la trabaja después. */
export const CLASE_PDF = Object.freeze({
  VECTORIAL: 'VECTORIAL', // hay trazos: se puede medir
  RASTER: 'RASTER',       // es una imagen: sólo se puede mirar
  MIXTO: 'MIXTO',         // trazos e imagen conviven (un plano escaneado con sellos vectoriales)
  TEXTO: 'TEXTO',         // texto sin dibujo: un pliego, una memoria, una planilla
  VACIO: 'VACIO',         // ni texto ni trazos ni imagen: una carátula en blanco
})

/** Cargar pdfjs. Se hace adentro y no arriba porque el paquete es pesado y hay circuitos del OS que
 *  importan este módulo sólo por sus funciones puras. */
async function pdfjs() {
  return import('pdfjs-dist/legacy/build/pdf.mjs')
}

/** Multiplicar dos matrices de transformación de PDF [a,b,c,d,e,f]. PURA. */
export function componer(m1, m2) {
  return [
    m1[0] * m2[0] + m1[2] * m2[1], m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3], m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4], m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ]
}

/** Aplicar una matriz a una caja [x0,y0,x1,y1] y devolver la caja envolvente del resultado. PURA. */
export function transformarCaja(m, caja) {
  const [x0, y0, x1, y1] = caja
  const puntos = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]])
  const xs = puntos.map((p) => p[0])
  const ys = puntos.map((p) => p[1])
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
}

/** Los trazos de una página en coordenadas de página, recorriendo la lista de operadores y llevando
 *  la matriz corriente por save/restore/transform. Sin eso, un plano dibujado dentro de un bloque
 *  escalado devuelve cajas en un sistema de coordenadas que no es el de la hoja. */
function trazosDe(ops, nombrePorCodigo) {
  const trazos = []
  const imagenes = []
  let ctm = [1, 0, 0, 1, 0, 0]
  const pila = []
  for (let i = 0; i < ops.fnArray.length; i++) {
    const op = nombrePorCodigo[ops.fnArray[i]]
    const args = ops.argsArray[i]
    if (op === 'save') pila.push(ctm)
    else if (op === 'restore') ctm = pila.pop() ?? [1, 0, 0, 1, 0, 0]
    else if (op === 'transform') ctm = componer(ctm, Array.from(args))
    else if (op === 'constructPath') {
      const mm = args?.[2]
      if (mm && mm.length >= 4) trazos.push(transformarCaja(ctm, [mm[0], mm[1], mm[2], mm[3]]))
    } else if (op === 'paintImageXObject' || op === 'paintJpegXObject' || op === 'paintInlineImageXObject') {
      // La imagen se dibuja en el cuadrado unitario y la CTM la lleva a su lugar y su tamaño.
      imagenes.push(transformarCaja(ctm, [0, 0, 1, 1]))
    }
  }
  return { trazos, imagenes }
}

/** El área de una caja. PURA. */
export const areaDe = (c) => Math.max(0, c[2] - c[0]) * Math.max(0, c[3] - c[1])

/**
 * DE QUÉ ESTÁ HECHA UNA PÁGINA. PURA.
 *
 * El umbral de raster no es «hay una imagen»: es «hay una imagen que TAPA la página». Un plano
 * vectorial con el logo de la empresa tiene una imagen y se mide igual de bien; un plano escaneado
 * tiene UNA imagen que ocupa la hoja entera y no se puede medir de ninguna forma.
 */
export function clasificarPagina({ caracteres = 0, trazos = 0, imagenes = [], area = 1 } = {}) {
  const tapa = imagenes.some((c) => areaDe(c) >= area * 0.6)
  const dibuja = trazos >= 20
  if (tapa && dibuja) return CLASE_PDF.MIXTO
  if (tapa) return CLASE_PDF.RASTER
  if (dibuja) return CLASE_PDF.VECTORIAL
  if (caracteres > 40) return CLASE_PDF.TEXTO
  return CLASE_PDF.VACIO
}

/** Un fragmento de texto de pdfjs → la caja que ocupa en la página. PURA.
 *  `transform` es [a,b,c,d,e,f]: e y f son la esquina inferior izquierda de la línea base. */
export function cajaDeTexto(item) {
  const t = item?.transform ?? [1, 0, 0, 1, 0, 0]
  const x = t[4]
  const y = t[5]
  const ancho = Number(item?.width ?? 0)
  const alto = Number(item?.height ?? Math.abs(t[3]) ?? 0)
  return { x, y, ancho, alto, texto: String(item?.str ?? '') }
}

/**
 * LOS RENGLONES DE UNA PÁGINA. PURA.
 *
 * Agrupa fragmentos por Y con tolerancia, porque dos fragmentos del mismo renglón casi nunca tienen
 * exactamente la misma Y —cambian de fuente, de tamaño o de línea base—. Devuelve los fragmentos ya
 * ordenados por X dentro de cada renglón, que es el orden en que un humano los lee.
 */
export function renglones(textos = [], { tolerancia = 3 } = {}) {
  const utiles = textos.filter((t) => String(t.texto ?? '').trim().length)
  const grupos = []
  for (const t of [...utiles].sort((a, b) => b.y - a.y || a.x - b.x)) {
    const g = grupos.find((x) => Math.abs(x.y - t.y) <= tolerancia)
    if (g) { g.items.push(t); g.y = (g.y * (g.items.length - 1) + t.y) / g.items.length }
    else grupos.push({ y: t.y, items: [t] })
  }
  return grupos.map((g) => ({
    y: Math.round(g.y * 100) / 100,
    items: g.items.sort((a, b) => a.x - b.x),
    texto: g.items.sort((a, b) => a.x - b.x).map((t) => t.texto).join('').replace(/\s+/g, ' ').trim(),
  }))
}

/**
 * LEER UN PDF ENTERO. Devuelve una estructura plana; no guarda handles ni deja el documento abierto.
 *
 * `conGeometria` se puede apagar cuando sólo interesa el texto (un pliego, una memoria): recorrer la
 * lista de operadores de un plano grande cuesta tiempo y no aporta nada si nadie va a medir.
 */
export async function leerPdf(bytes, { conGeometria = true, desde = 1, hasta = null } = {}) {
  const { getDocument, OPS } = await pdfjs()
  const nombrePorCodigo = {}
  for (const [k, v] of Object.entries(OPS)) nombrePorCodigo[v] = k
  const doc = await getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, useSystemFonts: false }).promise
  const ultima = Math.min(hasta ?? doc.numPages, doc.numPages)
  const paginas = []
  try {
    for (let n = Math.max(1, desde); n <= ultima; n++) {
      const page = await doc.getPage(n)
      const vp = page.getViewport({ scale: 1 })
      const tc = await page.getTextContent()
      const textos = tc.items.filter((i) => 'str' in i).map(cajaDeTexto)
      const geo = conGeometria ? trazosDe(await page.getOperatorList(), nombrePorCodigo) : { trazos: [], imagenes: [] }
      const caracteres = textos.reduce((a, t) => a + t.texto.length, 0)
      paginas.push({
        numero: n,
        ancho: vp.width,
        alto: vp.height,
        caracteres,
        textos,
        trazos: geo.trazos,
        imagenes: geo.imagenes,
        clase: clasificarPagina({ caracteres, trazos: geo.trazos.length, imagenes: geo.imagenes, area: vp.width * vp.height }),
      })
      page.cleanup()
    }
  } finally {
    try { await doc.destroy() } catch { /* cerrar el documento nunca decide si la lectura sirvió */ }
  }
  return { paginas: doc.numPages, leidas: paginas, clase: claseDelDocumento(paginas) }
}

/** La clase del documento entero: la de sus páginas si coinciden, MIXTO si no. PURA. */
export function claseDelDocumento(paginas = []) {
  const clases = new Set(paginas.filter((p) => p.clase !== CLASE_PDF.VACIO).map((p) => p.clase))
  if (!clases.size) return CLASE_PDF.VACIO
  if (clases.size === 1) return [...clases][0]
  return CLASE_PDF.MIXTO
}
