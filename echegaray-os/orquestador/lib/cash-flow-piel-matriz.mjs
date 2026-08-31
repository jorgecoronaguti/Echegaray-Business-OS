// LA PIEL DE LAS DOS MATRICES DE CASH FLOW — poca tinta, una fila que decide, y el rojo del déficit.
//
// ═══ LAS REGLAS, HEREDADAS Y RECORTADAS (06/08/2026) ═══
//
//   1. RÓTULO CHICO GRIS, NÚMERO EN NEGRITA. En una matriz la jerarquía la dan la fila y el peso, no
//      el tamaño: un cuerpo 18 no entra en una columna de 95px y Sheets lo tapa con "###" sin avisar.
//   2. UNA SOLA TIPOGRAFÍA (Arial, tres tamaños).
//   3. UN SOLO ACENTO, para el saldo final: es la fila que decide.
//   4. EL ROJO ES DEL DÉFICIT REAL, y de nada más. Si se usa para todo negativo deja de avisar.
//   5. NADA DE BORDES NI CAJAS. Una regla fina separa; un rectángulo encierra.
//
// ═══ LA COLUMNA A VA CONGELADA, Y ES NUEVO ═══
//
// Las vistas de bloques no lo necesitaban (todo entraba en tres columnas). Una matriz scrollea en
// horizontal: sin congelar la columna del concepto, tres columnas a la derecha ya no se sabe qué fila
// se está leyendo. Se congelan las siete primeras filas (título, hero y encabezado) y la columna A.
//
// ═══ LAS REGLAS CONDICIONALES SE BORRAN ANTES DE RE-CREARSE ═══
//
// `addConditionalFormatRule` APILA: sin borrar primero, cada corrida deja un juego más y a la semana
// la pestaña tiene doscientas reglas superpuestas.
//
// Y VAN SOBRE UN RANGO CONTIGUO CON LA FÓRMULA RELATIVA A SU PRIMERA CELDA. La versión de bloques
// escribía una regla por celda porque sus celdas NO eran contiguas —una por bloque— y con varios
// rangos en una sola regla Sheets ajusta la fórmula contra el PRIMER rango: un día crítico sin pintar
// y uno tranquilo pintado. Acá la fila entera es un rango, así que una regla alcanza y el ajuste
// relativo es exactamente el que se quiere: la columna corre, la fila queda fija (`B$14`).

import { MONEDA_CUERPO, MONEDA_TOTAL } from './formato-statement.mjs'
import { spansDelHero } from './cash-flow-hero-cabe.mjs'
import { INK, MUTED, HAIR, ACENTO, BLANCO } from './estilo-statement.mjs'
import { FILA, letra } from './cash-flow-matriz.mjs'

const FUENTE = 'Arial'

/**
 * LA PRIMERA COLUMNA VA CONGELADA — y eso limita lo que se puede fusionar.
 *
 * La matriz tiene doce meses (o cincuenta y tres semanas) a la derecha: sin la columna de concepto
 * fija, scrollear a diciembre deja números sin fila que los nombre.
 *
 * El precio es que **Sheets se niega a fusionar un rango que cruza esa frontera** —«You can't merge
 * frozen and non-frozen columns»— y devuelve 400 para TODO el lote, así que un merge del titular que
 * arranca en la A tumba también los colores, los anchos y los bordes. Pasó el 31/08: el Cash Flow
 * Mensual quedó sin formatear entero por una tarjeta.
 */
const COLUMNAS_CONGELADAS = 1
/** El detalle, apagado contra la tinta de los titulares: se lee como respaldo, no como mensaje. */
const TENUE = { red: 0.36, green: 0.38, blue: 0.42 }
/** El gris del encabezado de la matriz. Suave: marca la banda sin competir con los números. */
const GRIS_SUAVE = { red: 0.95, green: 0.95, blue: 0.94 }
/**
 * El tinte de la columna TOTAL. Más claro todavía que el encabezado: con 53 columnas de tiempo, el
 * TOTAL es el único ancla visual del extremo derecho y sin un fondo se pierde entre las semanas.
 */
const GRIS_TOTAL = { red: 0.97, green: 0.97, blue: 0.96 }
/**
 * El fondo de la columna del período EN CURSO. Es el mismo azul frío del botón "IR A LA SEMANA ACTUAL"
 * pero más claro: la marca y el atajo que lleva a ella se leen como la misma cosa, y ninguno de los dos
 * compite con el rojo del déficit — el único color de este cuadro que tiene que interrumpir la lectura.
 */
export const EN_CURSO = { red: 0.937, green: 0.957, blue: 0.984 }
/** El único rojo del archivo: saldo bajo cero. */
export const DEFICIT = { red: 0.70, green: 0.20, blue: 0.20 }
/** Ámbar: por encima de cero pero por debajo del piso. Avisa sin gritar. */
export const AVISO = { red: 0.55, green: 0.40, blue: 0.05 }
/** El tinte de un desvío negativo: rojo apagado, sin negrita. No es un déficit, es una señal. */
export const TINTE = { red: 0.62, green: 0.31, blue: 0.28 }

/** Ancho de cada zona, en píxeles. La columna del concepto tiene que alojar "Variación vs presupuesto". */
export const ANCHOS = Object.freeze({ concepto: 260, tiempo: 95, total: 110 })
/** Alto de fila normal. Una matriz no necesita aire vertical: lo que la hace legible es la grilla. */
export const ALTO_FILA = 21

const txt = (color, { bold = false, size = 10, italic = false } = {}) =>
  ({ foregroundColor: color, bold, italic, fontSize: size, fontFamily: FUENTE })

/**
 * NÚCLEO PURO: los requests de formato de una matriz de cash flow.
 *
 * @param {object} p
 * @param {number} p.sheetId
 * @param {object} p.meta el meta que devolvió la grilla
 * @param {number} [p.filasHoja] alto real de la hoja, para resetear también lo que quedó debajo
 * @param {number} [p.colsHoja]
 */
export function pielMatriz({ sheetId, meta, filasHoja = 0, colsHoja = 0 }) {
  const req = []
  const alto = Math.max(meta.footprint.filas, filasHoja)
  const ancho = Math.max(meta.footprint.cols, colsHoja)
  // Un rango de alto o ancho cero devuelve 400 y tumba el lote entero, dejando la pestaña a medio
  // formatear. La guarda es la misma que en el resto del repo, y por el mismo incidente.
  const rango = (r0, r1, c0, c1) => (r1 > r0 && c1 > c0
    ? { sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 }
    : null)
  const push = (r, fields, format) => { if (r) req.push({ repeatCell: { range: r, cell: { userEnteredFormat: format }, fields } }) }
  const celdas = (f, c0, c1, fields, format) => push(rango(f - 1, f, c0, c1), fields, format)
  const reglaFina = (f, lado, c0 = 0, c1 = meta.footprint.cols) => {
    const r = rango(f - 1, f, c0, c1)
    if (r) req.push({ updateBorders: { range: r, [lado]: { style: 'SOLID', width: 1, color: HAIR } } })
  }
  const col0 = meta.cab.col0
  const colUltima = meta.cab.colTotal

  // ── 0. TODO EL FOOTPRINT VISIBLE, ANTES DE PINTAR NADA ──────────────────────────────────────────
  //
  // El layout anterior dejó GRUPOS de filas colapsados y el Mensual apareció con las filas 8 a 13
  // invisibles: la matriz entera —los cuatro flujos y el resultado— tapada, y el formato aplicándose
  // igual sobre celdas que nadie veía. Los grupos los borra `tandasDeGrupos` (necesita su propio lote,
  // porque borrar un grupo que no existe devuelve 400); lo que sigue desoculta lo que quedó escondido
  // "a mano". Va PRIMERO en el lote: formatear lo invisible es exactamente el defecto que se pagó.
  req.push(...desocultarFootprint(sheetId, { filas: alto, cols: ancho }))

  // ── 1. La hoja: sin reja, con el encabezado y el concepto anclados ───────────────────────────────
  req.push({
    updateSheetProperties: {
      properties: { sheetId, gridProperties: { hideGridlines: true, frozenRowCount: FILA.cabecera, frozenColumnCount: COLUMNAS_CONGELADAS } },
      fields: 'gridProperties(hideGridlines,frozenRowCount,frozenColumnCount)',
    },
  })
  // El reset: todo el footprint parte de blanco y cuerpo base. Sin él, la negrita de la corrida
  // anterior aterriza sobre una fila que ahora significa otra cosa.
  // `wrapStrategy` entra al reset (28/08/2026): sin él, la estrategia de la corrida anterior sobrevivía
  // celda por celda y en el hero real convivían OVERFLOW_CELL y CLIP. Un formato que no se resetea no es
  // el formato que este archivo declara: es el que quedó.
  push(rango(0, alto, 0, ancho), 'userEnteredFormat(backgroundColor,textFormat,numberFormat,horizontalAlignment,wrapStrategy)',
    {
      backgroundColor: BLANCO,
      textFormat: txt(INK, { size: 10 }),
      numberFormat: { type: 'TEXT' },
      horizontalAlignment: 'LEFT',
      wrapStrategy: 'OVERFLOW_CELL',
    })
  {
    const r = rango(0, alto, 0, ancho)
    if (r) {
      req.push({
        updateBorders: {
          range: r,
          top: { style: 'NONE' }, bottom: { style: 'NONE' }, left: { style: 'NONE' }, right: { style: 'NONE' },
          innerHorizontal: { style: 'NONE' }, innerVertical: { style: 'NONE' },
        },
      })
    }
  }

  formatoEncabezado({ celdas, meta })
  formatoHero({ celdas, reglaFina, req, rango, meta })
  formatoCuerpo({ push, celdas, reglaFina, rango, meta, col0, colUltima })

  // ── Anchos y altos ──────────────────────────────────────────────────────────────────────────────
  const dim = (dimension, i0, i1, pixelSize) => req.push({
    updateDimensionProperties: { range: { sheetId, dimension, startIndex: i0, endIndex: i1 }, properties: { pixelSize }, fields: 'pixelSize' },
  })
  dim('COLUMNS', 0, 1, ANCHOS.concepto)
  dim('COLUMNS', col0, colUltima, ANCHOS.tiempo)
  dim('COLUMNS', colUltima, colUltima + 1, ANCHOS.total)
  // El alto se RESETEA en todo el footprint, no sólo en las filas nuevas: una fila que quedó de 42px
  // en un layout anterior sigue de 42px para siempre, y una matriz con dos alturas se lee como dos
  // tablas pegadas.
  dim('ROWS', 0, alto, ALTO_FILA)
  return req
}

/**
 * NÚCLEO PURO: los requests que dejan VISIBLE todo el footprint.
 *
 * `hiddenByUser:false` sobre filas y columnas. No alcanza con borrar los grupos: una fila que alguien
 * ocultó a mano (o que quedó oculta de la zona auxiliar del diseño viejo) sigue oculta después de que
 * el grupo desaparece, y el generador la escribe igual — un cuadro correcto que no se ve.
 */
export function desocultarFootprint(sheetId, { filas = 0, cols = 0 } = {}) {
  return [['ROWS', filas], ['COLUMNS', cols]]
    .filter(([, fin]) => fin > 0)
    .map(([dimension, fin]) => ({
      updateDimensionProperties: {
        range: { sheetId, dimension, startIndex: 0, endIndex: fin },
        properties: { hiddenByUser: false },
        fields: 'hiddenByUser',
      },
    }))
}

/** Cuántos niveles de grupo se intenta borrar. Sheets admite hasta 8 anidados; cuatro cubre cualquier layout real. */
export const NIVELES_DE_GRUPO = 4

/**
 * NÚCLEO PURO: los requests para VACIAR los grupos de filas y columnas heredados, EN TANDAS.
 *
 * ═══ POR QUÉ EN TANDAS Y NO EN UNA LISTA SOLA ═══
 *
 * `deleteDimensionGroup` sobre un rango SIN grupo devuelve 400, y un 400 en un `batchUpdate` tumba el
 * lote ENTERO — con el formato adentro. Y no se puede saber cuántos niveles hay sin leerlos. Así que
 * se manda un request por vez y se corta en el primer error: ése es el nivel que ya no existe.
 *
 * Cada tanda es una dimensión, para que el error de las filas no impida limpiar las columnas.
 *
 * @returns {Array<Array<object>>} una lista de requests por dimensión, en orden de borrado
 */
export function tandasDeGrupos(sheetId, { filas = 0, cols = 0 } = {}, niveles = NIVELES_DE_GRUPO) {
  return [['ROWS', filas], ['COLUMNS', cols]]
    .filter(([, fin]) => fin > 0)
    .map(([dimension, fin]) => Array.from({ length: niveles }, () => ({
      deleteDimensionGroup: { range: { sheetId, dimension, startIndex: 0, endIndex: fin } },
    })))
}

/** Título, subtítulo y el atajo de la esquina. */
function formatoEncabezado({ celdas, meta }) {
  celdas(FILA.titulo, 0, 1, 'userEnteredFormat(textFormat,horizontalAlignment)',
    { textFormat: txt(INK, { bold: true, size: 16 }), horizontalAlignment: 'LEFT' })
  celdas(FILA.subtitulo, 0, 1, 'userEnteredFormat(textFormat,horizontalAlignment)',
    { textFormat: txt(MUTED, { size: 9 }), horizontalAlignment: 'LEFT' })
  celdas(FILA.subtitulo, meta.cab.colTotal, meta.cab.colTotal + 1, 'userEnteredFormat(textFormat,horizontalAlignment)',
    { textFormat: txt(ACENTO, { size: 9 }), horizontalAlignment: 'RIGHT' })
  // ── A3 DEJA DE DISFRAZARSE DE BOTÓN (13/08/2026) ──
  //
  // Tenía fondo azul, negrita y texto centrado: la forma exacta de un botón. Y `HYPERLINK` no puede
  // ser un botón —un clic sólo selecciona, el segundo abre el chip, el tercero navega, y el doble clic
  // abre el modo edición—, así que la piel estaba prometiendo lo mismo que el rótulo viejo. Ahora la
  // celda dice "Semana actual: AH · 10/08" y se ve como lo que es: un dato con un vínculo adentro.
  // Alineada a la izquierda como el título y el subtítulo, sin fondo, en el acento del archivo.
  if (meta.botonHoy) {
    celdas(meta.botonHoy.fila, meta.botonHoy.col, meta.botonHoy.col + 1,
      'userEnteredFormat(textFormat,backgroundColor,horizontalAlignment)',
      {
        textFormat: txt(ACENTO, { size: 9 }),
        backgroundColor: BLANCO,
        horizontalAlignment: 'LEFT',
      })
  }
}

/**
 * Las TRES líneas del titular, apiladas: rótulo chico gris, número en negrita, glosa apagada.
 *
 * ═══ EL DESBORDE SE DECLARA, NO SE HEREDA (28/08/2026) ═══
 *
 * `readSheetFormats` sobre el hero real devolvía celdas en `OVERFLOW_CELL` y celdas en `CLIP` mezcladas
 * —residuo de layouts anteriores, porque el reset de la piel nunca tocó `wrapStrategy`—. Las dos se ven
 * mal de maneras distintas: `CLIP` corta el número a mitad de dígito y `OVERFLOW_CELL` lo derrama sobre
 * lo que tenga al lado. Ahora las tres filas del hero se escriben en `OVERFLOW_CELL` explícito y la
 * fila de la glosa quedó VACÍA a la derecha de cada número, así que desbordar es lo correcto: el texto
 * corre sobre columnas vacías hasta el slot siguiente. Que ese ancho alcance lo mide
 * `cash-flow-hero-cabe.mjs`; que la celda esté vacía lo garantizan las grillas.
 *
 * `WRAP` no sirve acá: partiría el importe en dos renglones dentro de una fila de 21 px de alto y
 * escondería la mitad. Un número no se parte.
 */
/**
 * LA CELDA DEL VALOR ES EL SLOT ENTERO, MERGEADA — porque el desborde no se dibuja en el PDF.
 *
 * ═══ LO QUE SE VIO EN EL RENDER REAL (29/08/2026) ═══
 *
 * Con `OVERFLOW_CELL` en toda la fila y las celdas vecinas vacías, el número DEBERÍA correr sobre
 * ellas. En pantalla corre. En el PDF que exporta Google se corta en el borde exacto de su columna:
 * `($31.332.233)` salió `($31.332.233`, `$125.306.590` salió `$125.306.59`. Un carácter, tres de las
 * cuatro tarjetas, y el dato en la celda estaba entero — era render.
 *
 * MERGEAR ES LA ÚNICA FORMA DE QUE LA CELDA MIDA LO QUE EL AUDITOR MIDE. No depende de que la de al
 * lado siga vacía, no depende de que el renderer respete el desborde, y no baja el cuerpo del titular
 * a 9 px. Es el mismo tratamiento que las tarjetas de CAJA, que se ven bien desde hace tres semanas.
 *
 * SE DESMERGEA ANTES DE MERGEAR: un `mergeCells` sobre un rango que ya tiene un merge PARCIAL devuelve
 * 400 y tumba el lote entero, y el layout del hero ya cambió tres veces este mes. `unmergeCells` sobre
 * un rango sin merges es un no-op, así que el par es idempotente.
 *
 * SÓLO LA FILA DEL VALOR. Rótulos y glosas son texto de 9 px que el PDF mostró entero: se miden contra
 * el slot con desborde y se dejan como están. No se toca lo que se vio funcionando.
 */
function desmergeDelValor({ req, rango, meta }) {
  const entera = rango(meta.hero.valor - 1, meta.hero.valor, 0, meta.footprint.cols)
  if (entera) req.push({ unmergeCells: { range: entera } })
}

/**
 * Y los merges van AL FINAL: formatear una celda ya mergeada es pedirle a la API que adivine.
 *
 * SE SALTEA EL SPAN QUE CRUZA LA FRONTERA DE LO CONGELADO. Es siempre el primero —la tarjeta que
 * arranca en la columna A— y su merge devuelve 400 arrastrando el lote entero. Sin fusionar, esa
 * celda vuelve a medirse por desborde, que es como se veía antes de que el merge existiera: peor
 * que las otras tres, y muchísimo mejor que la pestaña sin formato.
 *
 * No se resuelve descongelando: con doce meses a la derecha, perder la columna de concepto deja
 * números sin fila que los nombre, que es un problema más caro que una tarjeta angosta.
 */
function mergeDelValor({ req, rango, meta }) {
  for (const { desde, hasta } of spansDelHero(meta.hero.slots, meta.footprint.cols)) {
    if (desde < COLUMNAS_CONGELADAS && hasta > COLUMNAS_CONGELADAS) continue
    const r = rango(meta.hero.valor - 1, meta.hero.valor, desde, hasta)
    if (r && hasta - desde > 1) req.push({ mergeCells: { range: r, mergeType: 'MERGE_ROWS' } })
  }
}

function formatoHero({ celdas, reglaFina, req, rango, meta }) {
  const nota = meta.hero.nota ?? meta.hero.valor + 1
  const spans = spansDelHero(meta.hero.slots, meta.footprint.cols)
  desmergeDelValor({ req, rango, meta })
  for (const [i, s] of meta.hero.slots.entries()) {
    celdas(meta.hero.rotulo, s, s + 1, 'userEnteredFormat(textFormat,wrapStrategy)',
      { textFormat: txt(MUTED, { bold: true, size: 9 }), wrapStrategy: 'OVERFLOW_CELL' })
    // CUERPO 12, Y CON EL SLOT ENTERO COMO CELDA — MERGEADA, no desbordada (ver `mergeDelValor`).
    // Bajar el cuerpo hasta que entrara en una columna de 89 px pedía cuerpo 9 —el mismo de la glosa—,
    // y un titular del tamaño de su propia nota deja de ser un titular. 14 lo taparía con "###" en una
    // columna angosta y 18 —el de las tarjetas de CAJA, que viven en columnas anchas— tampoco entra.
    // EL FORMATO CUBRE EL SPAN ENTERO, no la columna del ancla: es la celda que va a existir después
    // del merge, y pintar media celda mergeada deja el resto con el formato de la corrida anterior.
    celdas(meta.hero.valor, s, spans[i].hasta, 'userEnteredFormat(textFormat,numberFormat,horizontalAlignment,wrapStrategy)',
      {
        textFormat: txt(ACENTO, { bold: true, size: 12 }),
        numberFormat: MONEDA_TOTAL,
        horizontalAlignment: 'LEFT',
        wrapStrategy: 'OVERFLOW_CELL',
      })
    celdas(nota, s, s + 1, 'userEnteredFormat(textFormat,numberFormat,horizontalAlignment,wrapStrategy)',
      {
        textFormat: txt(TENUE, { size: 9 }),
        numberFormat: { type: 'TEXT' },
        horizontalAlignment: 'LEFT',
        wrapStrategy: 'OVERFLOW_CELL',
      })
  }
  reglaFina(meta.hero.rotulo, 'top')
  mergeDelValor({ req, rango, meta })
}

/** El encabezado de la matriz y sus filas de concepto. */
function formatoCuerpo({ push, celdas, reglaFina, rango, meta, col0, colUltima }) {
  const f = meta.fila
  const filaFin = meta.filaFin
  const patron = meta.tipo === 'mes' ? 'mmm yy' : 'dd/mm'

  // El encabezado: banda gris suave, y las fechas como FECHAS (el valor es un serial; el patrón sólo
  // decide cómo se lee). Si se escribiera el texto "1/12/2026", CF_MESES prometería doce fechas y
  // entregaría once y una cadena — que es exactamente lo que pasó en el Mensual anterior.
  celdas(meta.cab.fila, 0, meta.footprint.cols, 'userEnteredFormat(backgroundColor,textFormat)',
    { backgroundColor: GRIS_SUAVE, textFormat: txt(MUTED, { bold: true, size: 9 }) })
  // La fecha va CENTRADA sobre su columna: es el título de la columna, no un dato alineado con los
  // importes de abajo. Alineada a la derecha, con 53 columnas angostas, se leía pegada a la vecina.
  celdas(meta.cab.fila, col0, colUltima, 'userEnteredFormat(numberFormat,horizontalAlignment)',
    { numberFormat: { type: 'DATE', pattern: patron }, horizontalAlignment: 'CENTER' })
  celdas(meta.cab.fila, colUltima, colUltima + 1, 'userEnteredFormat(numberFormat,horizontalAlignment)',
    { numberFormat: { type: 'TEXT' }, horizontalAlignment: 'CENTER' })
  reglaFina(meta.cab.fila, 'bottom')

  // El cuerpo: el concepto a la izquierda, plata a la derecha en toda la matriz. `MONEDA_CUERPO` es
  // moneda sin decimales y ya escribe "—" cuando el valor es cero: el guion no se inventa como texto,
  // sale del patrón — un "—" tipeado sería un texto donde tiene que haber un número.
  push(rango(FILA.concepto - 1, filaFin, 0, 1), 'userEnteredFormat(textFormat,horizontalAlignment)',
    { textFormat: txt(INK, { size: 10 }), horizontalAlignment: 'LEFT' })
  push(rango(FILA.concepto - 1, filaFin, col0, colUltima + 1), 'userEnteredFormat(numberFormat,horizontalAlignment)',
    { numberFormat: MONEDA_CUERPO, horizontalAlignment: 'RIGHT' })
  // La columna TOTAL, con su propio fondo. Sólo el fondo: el resto lo ponen las filas, y si se pisara
  // acá la negrita del saldo final se perdería justo en la celda que cierra el cuadro.
  push(rango(FILA.concepto - 1, filaFin, colUltima, colUltima + 1), 'userEnteredFormat.backgroundColor',
    { backgroundColor: GRIS_TOTAL })

  // ── La apertura por rubro: el subtotal pesa, el detalle respalda ────────────────────────────────
  //
  // La jerarquía la hacen el PESO y el TAMAÑO, no un color ni una caja: el subtotal en negrita a
  // cuerpo 10, sus rubros en gris a cuerpo 9 con la sangría que ya trae el rótulo. Sin esto, 43 filas
  // de la misma tipografía se leen como una lista plana y el subtotal se pierde adentro de su propia
  // apertura — que es exactamente lo contrario de lo que la apertura vino a resolver.
  for (const b of meta.bloques ?? []) {
    celdas(b.subtotal, 0, meta.footprint.cols, 'userEnteredFormat.textFormat',
      { textFormat: txt(INK, { bold: true, size: 10 }) })
    push(rango(b.primeraSub - 1, b.ultimaSub, 0, meta.footprint.cols), 'userEnteredFormat.textFormat',
      { textFormat: txt(TENUE, { size: 9 }) })
  }

  // ── La sección POR CLIENTE: misma sangría y misma tipografía que la apertura por rubro ───────────
  //
  // A propósito: son la misma clase de fila —el detalle que respalda un subtotal— y darles una piel
  // propia las haría leer como otra tabla pegada abajo. Lo único distinto es el TÍTULO de la sección
  // (gris, chico, con una regla fina arriba) y la cabecera de cada cliente, que pesa como un subtotal
  // porque ES un subtotal: el neto de ese cliente.
  if (meta.clientes) {
    celdas(meta.clientes.titulo, 0, meta.footprint.cols, 'userEnteredFormat.textFormat',
      { textFormat: txt(MUTED, { bold: true, size: 9 }) })
    reglaFina(meta.clientes.titulo, 'top')
    for (const b of meta.clientes.bloques) {
      celdas(b.cabecera, 0, meta.footprint.cols, 'userEnteredFormat.textFormat',
        { textFormat: txt(INK, { bold: true, size: 10 }) })
      push(rango(b.primera - 1, b.ultima, 0, meta.footprint.cols), 'userEnteredFormat.textFormat',
        { textFormat: txt(TENUE, { size: 9 }) })
    }
  }

  // Las dos filas que se leen primero. El saldo final lleva el único acento del cuadro, y una regla
  // fina arriba que lo separa del resultado: es la línea de cierre, no una fila más de la lista.
  celdas(f.resultado, 0, meta.footprint.cols, 'userEnteredFormat.textFormat', { textFormat: txt(INK, { bold: true, size: 10 }) })
  reglaFina(f.resultado, 'top')
  celdas(f.saldoFinal, 0, meta.footprint.cols, 'userEnteredFormat.textFormat', { textFormat: txt(ACENTO, { bold: true, size: 10 }) })
  celdas(f.saldoFinal, col0, colUltima + 1, 'userEnteredFormat(textFormat,numberFormat)',
    { textFormat: txt(ACENTO, { bold: true, size: 10 }), numberFormat: MONEDA_TOTAL })
  reglaFina(f.saldoFinal, 'top')
}

/**
 * NÚCLEO PURO: las reglas condicionales de una matriz.
 *
 * Cuatro preguntas, y ninguna más: ¿el saldo se va abajo de cero? ¿queda por debajo del piso? ¿el
 * período consume caja? ¿el desvío es negativo? Cada una es una regla sobre la FILA entera.
 *
 * @param {object} p
 * @param {number} p.sheetId
 * @param {object} p.meta
 * @param {string|null} p.refMinima rango con nombre de la caja mínima; sin él, sólo se marca el déficit
 */
export function reglasCondicionales({ sheetId, meta, refMinima = null }) {
  // ═══ EL RANGO CON NOMBRE VA ENVUELTO EN INDIRECT ═══
  //
  // La API rechaza `N(CAJA_MINIMA)` dentro de una CUSTOM_FORMULA con 400 INVALID_ARGUMENT: las
  // fórmulas de formato condicional NO aceptan rangos con nombre — limitación de Sheets, no de este
  // código. `INDIRECT("nombre")` sí resuelve, y sigue el nombre si la celda se mueve.
  const porNombre = refMinima ? `INDIRECT("${refMinima}")` : null
  const f = meta.fila
  const c0 = meta.cab.col0
  const c1 = meta.cab.colTotal + 1
  // `letra` y no `String.fromCharCode(65+i)`: con el semanal a 53 semanas la matriz llega a BC, y la
  // aritmética corta devolvía un carácter cualquiera pasada la Z — una regla condicional apuntando a
  // una celda que no existe no da error, simplemente no pinta nunca.
  const req = []
  const regla = (filaN, formula, color, bold) => req.push({
    addConditionalFormatRule: {
      rule: {
        ranges: [{ sheetId, startRowIndex: filaN - 1, endRowIndex: filaN, startColumnIndex: c0, endColumnIndex: c1 }],
        booleanRule: {
          condition: { type: 'CUSTOM_FORMULA', values: [{ userEnteredValue: formula }] },
          format: { textFormat: { foregroundColor: color, bold } },
        },
      },
      index: 0,
    },
  })
  /** La celda de referencia de una regla: columna RELATIVA (corre con el rango), fila FIJA. */
  const ref = (filaN) => `${letra(c0)}$${filaN}`

  // El orden importa: la primera regla que da verdadera gana. El déficit va primero porque un saldo
  // negativo también está por debajo del piso, y lo que hay que ver es que está bajo cero.
  regla(f.saldoFinal, `=N(${ref(f.saldoFinal)})<0`, DEFICIT, true)
  if (refMinima) {
    // `<>""` no es cosmético: un mes anterior al corte va VACÍO, y `N("")` vale 0 — sin esa guarda la
    // regla del piso pintaría de ámbar todas las celdas vacías del cuadro.
    regla(f.saldoFinal, `=AND(${ref(f.saldoFinal)}<>"";N(${ref(f.saldoFinal)})>=0;N(${ref(f.saldoFinal)})<N(${porNombre}))`, AVISO, true)
  }
  regla(f.resultado, `=N(${ref(f.resultado)})<0`, TINTE, false)
  for (const clave of ['variacionPresupuesto', 'variacionMesAnterior']) {
    if (f[clave]) regla(f[clave], `=N(${ref(f[clave])})<0`, TINTE, false)
  }
  req.push(...reglaPeriodoEnCurso({ sheetId, meta }))
  return req
}

/**
 * ═══ LA COLUMNA DE HOY, MARCADA (13/08/2026) ═══
 *
 * El dueño, sobre el Cash Flow Semanal: *"están marcando mal la semana actual"*. Medido en el archivo
 * vivo ese día: **no la marcaban de ninguna forma**. Las 53 columnas de semana salían con exactamente
 * el mismo fondo, la misma tinta y el mismo peso, y la única señal de "acá estamos" era el botón de la
 * esquina — que apuntaba con el fragmento "#gid=" suelto y por lo tanto no navegaba. Sobre 53 columnas
 * angostas eso significa buscar la fecha a ojo cada vez que se abre la pestaña.
 *
 * ES FORMATO CONDICIONAL, NO UN PINTADO POR COORDENADA, y ésa es la decisión que importa: la pestaña se
 * regenera cada 2 horas pero la semana cambia sola el lunes a la madrugada. Una columna pintada por
 * índice queda correcta hasta la primera vez que el pipeline no corre, y entonces señala con confianza
 * la semana equivocada — que es peor que no señalar nada. La fórmula se evalúa cuando la hoja calcula:
 * el día que el generador no corra, la marca sigue estando bien.
 *
 * LA VENTANA ES LA MISMA QUE SUMA LA COLUMNA — semi-abierta [encabezado, encabezado+7) en el semanal y
 * [1° del mes, 1° del siguiente) en el mensual. No se reescribe acá: si fuera otra, la marca señalaría
 * una columna y los números serían de otra.
 *
 * UN SOLO TONO Y NADA MÁS. La regla 5 de esta piel prohíbe cajas y bordes; el estándar del dueño pide
 * "menos, no más". Un fondo apenas más frío que el blanco alcanza para que el ojo la encuentre sin que
 * compita con el rojo del déficit, que es el único color que tiene que gritar en este cuadro.
 *
 * VA ÚLTIMA en el orden de reglas —índice 0 se apila al frente, así que la última empujada gana— pero
 * no compite con las de tinta: aquéllas pintan el TEXTO y ésta el FONDO. Se ven juntas.
 */
export function reglaPeriodoEnCurso({ sheetId, meta }) {
  const primera = `${letra(meta.cab.col0)}$${meta.cab.fila}`
  const dentro = meta.tipo === 'mes'
    ? `AND(${primera}<=TODAY();EOMONTH(${primera};0)>=TODAY())`
    : `AND(${primera}<=TODAY();${primera}+7>TODAY())`
  return [{
    addConditionalFormatRule: {
      rule: {
        // Del encabezado hasta el saldo final: la columna entera que se lee, sin la columna TOTAL
        // (que no es un período y no puede ser "hoy") ni el bloque por cliente de más abajo.
        ranges: [{
          sheetId,
          startRowIndex: meta.cab.fila - 1,
          endRowIndex: meta.fila.saldoFinal,
          startColumnIndex: meta.cab.col0,
          endColumnIndex: meta.cab.colTotal,
        }],
        booleanRule: {
          condition: { type: 'CUSTOM_FORMULA', values: [{ userEnteredValue: `=${dentro}` }] },
          format: { backgroundColor: EN_CURSO },
        },
      },
      index: 0,
    },
  }]
}

/** Los requests para borrar TODAS las reglas condicionales de una pestaña, de atrás para adelante. */
export function borrarCondicionales(sheetId, cantidad = 0) {
  const req = []
  for (let i = cantidad - 1; i >= 0; i--) req.push({ deleteConditionalFormatRule: { sheetId, index: i } })
  return req
}

/**
 * Los requests para ACHICAR la hoja al footprint declarado. Devuelve [] si ya está en medida.
 *
 * ═══ POR QUÉ SE BORRA Y NO SE DEJA ═══
 *
 * Las dos pestañas venían de 220×65 con 86 filas muertas y quince columnas ocultas de maquinaria. La
 * escritura sólo limpia el rectángulo que declara suyo: todo lo de afuera se queda con la mitad
 * derecha del diseño anterior, para siempre, y `auditar-pantalla` lo sigue midiendo.
 *
 * ES SEGURO PORQUE LA PROTECCIÓN NO ES ÉSTA: si el dueño editó cualquier celda de la pestaña, la
 * FIRMA lo detecta y la escritura no ocurre (escribirPreservando aborta antes de tocar nada). Esto
 * sólo corre después de una escritura que ya tuvo permiso, y por eso el generador lo llama DESPUÉS.
 */
export function achicarHoja(sheetId, { filas = 0, cols = 0 }, footprint) {
  const req = []
  if (filas > footprint.filas) {
    req.push({ deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: footprint.filas, endIndex: filas } } })
  }
  if (cols > footprint.cols) {
    req.push({ deleteDimension: { range: { sheetId, dimension: 'COLUMNS', startIndex: footprint.cols, endIndex: cols } } })
  }
  return req
}
