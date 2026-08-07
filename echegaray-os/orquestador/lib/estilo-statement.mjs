// PIEL DE STATEMENT — el salto de "planilla" a "cómo se vería en JPMorgan".
//
// POR QUÉ EXISTE (22/07). El dueño: cada pestaña tiene que quedar minimalista y de clase mundial.
// El estilo compartido (estilo-pestana.mjs) ya usa un teal sobrio, pero le faltan las tres cosas que
// separan un statement de una planilla, y que ya se aplicaron a mano en CAJA y en Cheques Emitidos:
//
//   1. SIN reja (gridlines off) — el mayor "tell" de planilla.
//   2. Sin barras de color rellenas: los encabezados y las secciones se marcan con TIPOGRAFÍA (tinta,
//      versalita) y una línea fina (hairline), no con un rectángulo pintado.
//   3. Totales RULADOS: una línea fina arriba, el número en acento; no un relleno.
//
// Es una CAPA que se aplica ENCIMA del formato de número que ya puso el generador (moneda, fecha):
// sólo cambia fondo, bordes y la tipografía de las filas de estructura. Detecta la estructura por el
// CONTENIDO de la columna A (título, sección "N. …", encabezado de tabla, total) para poder reusarse
// en cualquier pestaña sin que cada generador le pase las filas a mano.

export const INK = { red: 0.10, green: 0.13, blue: 0.20 }
export const MUTED = { red: 0.53, green: 0.52, blue: 0.49 }
export const HAIR = { red: 0.82, green: 0.80, blue: 0.76 }
export const ACENTO = { red: 0.11, green: 0.23, blue: 0.37 }
export const BLANCO = { red: 1, green: 1, blue: 1 }

const txt = (color, { bold = false, size = 10, italic = false } = {}) => ({ foregroundColor: color, bold, italic, fontSize: size, fontFamily: 'Arial' })

// ═══ UNA SOLA GRAMÁTICA, NO DOS (06/08) ═══
//
// La estructura de una pestaña la DECLARA `patron-pestana.mjs` —es el módulo que la audita— y acá se
// tenía una segunda copia, más pobre, para dibujarla. Las dos no coincidían, y donde no coincidían el
// auditor daba la pestaña por buena mientras la pantalla mostraba otra cosa:
//
//   · las SUB-SECCIONES ("1.1 · EL PLANTEL BASE") no matcheaban nada acá: los tres sub-bloques de
//     Jornales se dibujaban con el mismo cuerpo que una fila de datos.
//   · el TÍTULO DEL HERO ("JORNALES Y SUELDOS — la posición") tampoco: la única cifra que la pestaña
//     contesta abría sin ningún marcador.
//   · "Categoría", "Quincena", "Persona"… no estaban en la lista de encabezados de acá, así que esas
//     filas no recibían ni la versalita apagada ni la regla de abajo.
//
// El resultado era una pestaña de un solo tono, que es exactamente lo que el dueño lee como "no se
// entiende". Se importa la gramática en vez de repetirla: si mañana cambia, cambia en un solo lugar.
import { ES_SECCION_NUM, ES_BLOQUE_SIN_NUMERO, ES_ENCABEZADO as ES_ENCABEZADO_GRAMATICA } from './patron-pestana.mjs'

/** Reglas de detección por el contenido de la columna A. El orden importa: total antes que sección. */
// El "⚠ " es propio de la piel y no de la gramática: una alarma se dibuja como un total (rulada y en
// negrita) porque es lo que hay que ver primero, aunque no sea la suma de nada.
export const ES_TOTAL = /^\s*(⇒|total\b|⚠ )/i
export const ES_ENCABEZADO = ES_ENCABEZADO_GRAMATICA
/**
 * Una sección de primer nivel. Se conserva TAL CUAL estaba: hay pestañas que numeran con punto
 * ("1. IVA REAL DE ARCA") y no con "·", y cambiarla por la del patrón las dejaría sin ningún título.
 * No matchea "1.1 · …" —después del punto exige un espacio— así que la sub-sección no se le cuela.
 */
export const ES_SECCION = /^\s*\d+\s*[.\-·]\s+\S|^[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ0-9 ,.·/—-]{10,}$/
/**
 * El bloque del hero: la tirada en versalita con su aclaración en minúscula detrás
 * ("JORNALES Y SUELDOS — la posición"). Es el único bloque que la gramática admite sin número, y
 * abre la cifra que la pestaña contesta: sin esto arrancaba sin ningún marcador.
 */
export const ES_BLOQUE_HERO = ES_BLOQUE_SIN_NUMERO
/** Una sub-sección: "1.1 · TÍTULO". Cuelga de la sección abierta y pesa menos que ella. */
export const ES_SUBSECCION = (a) => {
  const m = String(a).match(ES_SECCION_NUM)
  return !!m && m[2] !== undefined
}

/**
 * NÚCLEO PURO: los requests de formato de la piel, a partir del contenido escrito.
 * @param {{sheetId:number, filas:string[][], cols:number, congeladas?:number}} p
 * @returns {object[]} requests para spreadsheetBatchUpdate
 */
export function skinRequests({ sheetId, filas, cols, congeladas = 0, titular = 0, filasHoja = 0 }) {
  const rango = (r0, r1, c0, c1) => ({ sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 })
  const fmt = (r, fields, cell) => ({ repeatCell: { range: rango(r, r + 1, 0, cols), cell, fields } })
  const bg = (color) => ({ userEnteredFormat: { backgroundColor: color } })
  // ═══ UNA REGLA SE DIBUJA DEL ANCHO DE LA TABLA, NO DE LA HOJA ═══
  //
  // POR QUÉ (23/07). El dueño: "líneas marcadas que se cortan". Las reglas iban de la columna A a la
  // última de la grilla SIEMPRE, así que en un bloque que sólo llena cuatro columnas la línea seguía
  // ocho columnas más sobre la nada — y en la pantalla eso se lee como una línea rota, no como una
  // regla. Una regla existe para separar CONTENIDO: donde no hay contenido, no hay regla.
  const anchoDe = (r) => {
    let n = 0
    const f = filas[r] || []
    for (let j = 0; j < Math.min(f.length, cols); j++) if (String(f[j] ?? '').trim()) n = j + 1
    return Math.max(n, 1)
  }
  /** El ancho del bloque al que pertenece la fila r: el máximo de las filas contiguas con contenido. */
  const anchoBloque = (r) => {
    let n = anchoDe(r)
    for (let i = r + 1; i < filas.length && (filas[i] || []).some((x) => String(x ?? '').trim()); i++) n = Math.max(n, anchoDe(i))
    for (let i = r - 1; i >= 0 && (filas[i] || []).some((x) => String(x ?? '').trim()); i--) n = Math.max(n, anchoDe(i))
    return n
  }
  const hairline = (r) => ({ updateBorders: { range: rango(r, r + 1, 0, anchoBloque(r)), bottom: { style: 'SOLID', width: 1, color: HAIR } } })
  const hairlineTop = (r) => ({ updateBorders: { range: rango(r, r + 1, 0, anchoBloque(r)), top: { style: 'SOLID', width: 1, color: HAIR } } })

  const reqs = [
    { updateSheetProperties: { properties: { sheetId, gridProperties: { hideGridlines: true, frozenRowCount: congeladas } }, fields: 'gridProperties(hideGridlines,frozenRowCount)' } },
    // Fondo blanco parejo: borra cualquier relleno viejo (barras teal, subtotales pintados).
    { repeatCell: { range: rango(0, filas.length, 0, cols), cell: bg(BLANCO), fields: 'userEnteredFormat.backgroundColor' } },
    // ═══ EL RESET DEL CUERPO — LO QUE FALTABA ═══
    //
    // POR QUÉ (23/07). La piel formateaba los títulos, los encabezados y los totales, y a las demás
    // filas NO LES TOCABA NADA. Así que cuando el layout cambiaba, la itálica o la negrita de la
    // versión anterior aterrizaba sobre una fila que no tenía nada que ver: en Cargas Sociales
    // "Aportes de Seguridad Social" salía en itálica y "Contribuciones de Obra Social" en redonda,
    // sin ninguna regla detrás. Eso es exactamente lo que hace que un cuadro se lea desprolijo y no
    // se pueda seguir con el ojo. El cuerpo arranca parejo y después se marcan las excepciones.
    { repeatCell: { range: rango(0, filas.length, 0, cols), cell: { userEnteredFormat: { textFormat: txt(INK, { bold: false, size: 10 }) } }, fields: 'userEnteredFormat.textFormat' } },
    // ═══ SE LIMPIA MÁS ALLÁ DE DONDE LLEGA LA GRILLA ═══
    //
    // POR QUÉ (23/07). El dueño: "el diseño se corrompe desde la celda 53 en adelante, queda
    // impresentable". Y era exacto: debajo del contenido flotaban cuatro reglas grises sobre la nada.
    // La limpieza de bordes iba de la fila 1 a la última de la grilla, así que TODO lo que la versión
    // anterior había formateado más abajo sobrevivía. Una pestaña que se acorta deja su huella
    // colgando, y el ojo la lee como una tabla que empieza y no tiene contenido.
    //
    // Se limpia hasta el final de la HOJA, no de la grilla. Es el mismo defecto que dejó las filas
    // altísimas cuando se sacó el muro de texto: resetear sólo lo que uno escribe no alcanza.
    { updateBorders: { range: rango(0, Math.max(filas.length, filasHoja), 0, cols), top: { style: 'NONE' }, bottom: { style: 'NONE' }, left: { style: 'NONE' }, right: { style: 'NONE' }, innerHorizontal: { style: 'NONE' }, innerVertical: { style: 'NONE' } } },
    { repeatCell: { range: rango(filas.length, Math.max(filas.length, filasHoja), 0, cols), cell: { userEnteredFormat: { backgroundColor: BLANCO, textFormat: txt(INK, { bold: false, size: 10 }) } }, fields: 'userEnteredFormat(backgroundColor,textFormat)' } },
    { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: Math.max(filas.length, filasHoja) }, properties: { pixelSize: 21 }, fields: 'pixelSize' } },
  ]

  filas.forEach((fila, i) => {
    const a = String(fila?.[0] ?? '').trim()
    if (!a && !(fila || []).some((x) => String(x ?? '').trim())) return
    if (i === 0) { // Título de la pestaña.
      reqs.push(fmt(i, 'userEnteredFormat(textFormat,horizontalAlignment)', { userEnteredFormat: { textFormat: txt(INK, { bold: true, size: 15 }), horizontalAlignment: 'LEFT' } }))
      return
    }
    if (i === 1) { // El subtítulo: apagado y chico, no compite con nada.
      reqs.push(fmt(i, 'userEnteredFormat(textFormat,horizontalAlignment)', { userEnteredFormat: { textFormat: txt(MUTED, { size: 9 }), horizontalAlignment: 'LEFT' } }))
      return
    }
    if (ES_TOTAL.test(a)) { // Total: rulado, tinta, negrita.
      reqs.push(fmt(i, 'userEnteredFormat(textFormat)', { userEnteredFormat: { textFormat: txt(INK, { bold: true, size: 10 }) } }), hairlineTop(i))
      return
    }
    if (ES_ENCABEZADO.test(a)) { // Encabezado de tabla: versalita apagada + hairline abajo.
      reqs.push(fmt(i, 'userEnteredFormat(textFormat,horizontalAlignment)', { userEnteredFormat: { textFormat: txt(MUTED, { bold: true, size: 9 }), horizontalAlignment: 'LEFT' } }), hairline(i))
      return
    }
    // UN TÍTULO DE SECCIÓN OCUPA SU FILA SOLO. Sin esta condición, un rótulo de concepto que está en
    // versalita —"L.R.T. — ART", el nombre de un proveedor— salía en negrita con una regla encima,
    // como si abriera un bloque nuevo. Un renglón con importes al lado nunca es un título.
    const soloEnSuFila = !(fila || []).slice(1).some((x) => String(x ?? '').trim())
    if (!soloEnSuFila) return
    if (ES_SECCION.test(a) || ES_BLOQUE_HERO.test(a)) { // Sección: tinta, negrita, cuerpo 11, hairline arriba.
      reqs.push(fmt(i, 'userEnteredFormat(textFormat,horizontalAlignment)', { userEnteredFormat: { textFormat: txt(INK, { bold: true, size: 11 }), horizontalAlignment: 'LEFT' } }), hairlineTop(i))
      return
    }
    // ── LA SUB-SECCIÓN PESA MENOS QUE SU SECCIÓN, Y ESO ES LA JERARQUÍA ──
    //
    // Negrita para que se lea como un título, cuerpo 10 y SIN regla: la regla es lo que abre un bloque
    // nuevo, y una sub-sección no abre nada — cuelga del bloque que ya está abierto. Dibujarla igual
    // que su madre es lo que hace que el lector no sepa cuál de los dos títulos manda.
    if (ES_SUBSECCION(a)) {
      reqs.push(fmt(i, 'userEnteredFormat(textFormat,horizontalAlignment)', { userEnteredFormat: { textFormat: txt(INK, { bold: true, size: 10 }), horizontalAlignment: 'LEFT' } }))
    }
  })
  // ═══ EL TITULAR ES EL NÚMERO MÁS FUERTE DE LA PÁGINA ═══
  // Una pestaña contesta UNA pregunta. Su respuesta tiene que verse desde lejos y sin buscarla; el
  // resto es el respaldo de esa respuesta. Sin esto, la cifra que importa pesa igual que las otras
  // ochenta y hay que leer la pestaña entera para encontrarla.
  if (titular) {
    // 13 puntos, no 18: a 18 el rótulo desbordaba su columna y el importe salía cortado a la mitad
    // ("$11.084.4"). Un titular que no entra en su celda no es un titular, es un error de imprenta.
    // La jerarquía la termina de dar el ACENTO, que ninguna otra fila usa.
    reqs.push({ repeatCell: { range: rango(titular - 1, titular, 0, 2), cell: { userEnteredFormat: { textFormat: txt(ACENTO, { bold: true, size: 13 }) } }, fields: 'userEnteredFormat.textFormat' } })
    reqs.push({ updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: titular - 1, endIndex: titular }, properties: { pixelSize: 26 }, fields: 'pixelSize' } })
  }
  return reqs
}
