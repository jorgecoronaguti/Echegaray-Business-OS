// EL ESTÁNDAR VISUAL DEL ARCHIVO — UNA SOLA VEZ, PARA LAS CATORCE PESTAÑAS.
//
// POR QUÉ EXISTE (21/07). El dueño: "revisar el formato de todas las pestañas y hacerlas coincidir",
// después de "malos formatos de lectura de la información". Tenía razón y era medible: cada pestaña
// se formateaba dentro de su propio script, así que cada script inventó su propia paleta.
//
// LO QUE MEDÍ ANTES DE DECIDIR NADA (readSheetFormats sobre las 14 pestañas visibles):
//
//   Calibri 12 bold sobre #1e2638   → RESUMEN, Jornales por Quincena, Cargas Sociales
//   Arial 16/22/11 bold sobre #0d1d1d / #008b8b → Compras, Cobranzas, Cheques Emitidos, Tarjeta
//   Calibri 13 bold SIN FONDO       → las nueve que armé yo
//   filas congeladas: 0, 1, 2, 3, 4 y 6 según la pestaña
//
// Cuatro familias tipográficas y tres paletas en un mismo archivo. Los títulos de las pestañas que
// hice yo ni siquiera tenían barra de color: al pasar de RESUMEN a Estructura parecía otro documento.
//
// ═══ EL ESTÁNDAR ES PROPIO, NO EL QUE YA HABÍA ═══
//
// Mi primera versión adoptaba el #1e2638 + Calibri que el dueño ya usaba, por prudencia. Él lo
// corrigió: "no, el estándar que sea el tuyo". Así que esto es una decisión de diseño, y la
// justifico.
//
// 1. ARIAL EN TODO. El dueño la eligió y no hay nada que discutir, pero además no se pierde nada:
//    los dígitos de Arial son de ANCHO FIJO. Yo había puesto Roboto Mono en las columnas numéricas
//    justamente para que los millares se alinearan entre filas —$1.111.111 y $8.888.888 tienen que
//    ocupar lo mismo o la columna queda despareja y deja de servir para comparar— y Arial ya lo hace
//    sola. La alineación se conserva con una sola familia en todo el archivo, que además es más
//    prolijo que mezclar dos.
// 2. UN VERDE AZULADO MUY OSCURO como color de mando (#0f2a33), no un azul genérico. Es el mismo
//    familiar del #008b8b que las pestañas de carga ya traían, así que el archivo se siente uno solo
//    en vez de dos documentos pegados — pero con la profundidad que le falta al turquesa original.
// 3. TRES TAMAÑOS Y NO SIETE. Título, bloque, cuerpo, nota. Cada tamaño extra es una jerarquía que
//    el lector tiene que decodificar y que no significa nada.
// 4. EL CERO SE MUESTRA COMO "—". Un "$0" invita a leerse como un dato medido; casi siempre es
//    "acá no hay nada". Son dos cosas distintas y la planilla tiene que decir cuál es.
//
// ═══ POR QUÉ ESTO ES UNA LIB Y NO UNA FUNCIÓN EN CADA SCRIPT ═══
//
// Porque ya probamos lo otro. El formato tiene la misma propiedad que un dato: si se define en nueve
// lugares, tiene nueve versiones y ninguna es la correcta.

/** La paleta. Un solo lugar donde cambiar un color del archivo entero. */
export const COLOR = {
  // La barra de título: verde azulado muy oscuro. El color de mando del archivo.
  titulo: { red: 0.059, green: 0.165, blue: 0.200 },      // #0f2a33
  tituloTexto: { red: 1, green: 1, blue: 1 },
  // El encabezado de una tabla: el mismo tono, dos pasos más claro. La jerarquía se lee sin leer.
  encabezado: { red: 0.122, green: 0.302, blue: 0.353 },  // #1f4d5a
  encabezadoTexto: { red: 1, green: 1, blue: 1 },
  // El rótulo de un bloque dentro de la pestaña ("1 · QUÉ SE DEBE Y CUÁNDO").
  bloque: { red: 0.910, green: 0.933, blue: 0.941 },      // #e8eef0
  bloqueTexto: { red: 0.059, green: 0.165, blue: 0.200 },
  // Subtotal y total. El total pesa más que el subtotal, y los dos menos que el encabezado.
  subtotal: { red: 0.957, green: 0.969, blue: 0.973 },    // #f4f7f8
  total: { red: 0.859, green: 0.902, blue: 0.918 },       // #dbe6ea
  // Un valor PROYECTADO, no real. Ámbar: nunca se puede confundir con un dato medido.
  proyectado: { red: 0.992, green: 0.945, blue: 0.839 },  // #fdf1d6
  proyectadoTexto: { red: 0.478, green: 0.357, blue: 0.071 },
  // Una alerta que pide acción. Es el único rojo del archivo: si se usa para todo, no alerta nada.
  alerta: { red: 0.984, green: 0.890, blue: 0.871 },      // #fbe3de
  alertaTexto: { red: 0.612, green: 0.184, blue: 0.110 },
  // Un control que da bien.
  ok: { red: 0.875, green: 0.933, blue: 0.878 },          // #dfeee0
  // El negro del archivo. No es el negro puro: un #000 sobre blanco vibra y cansa a las cuatro
  // pestañas. Éste es el mismo tono del título, aclarado.
  texto: { red: 0.063, green: 0.078, blue: 0.094 },        // #101317
  // Una nota al costado: se lee si hace falta, no compite con los números.
  nota: { red: 0.357, green: 0.404, blue: 0.439 },        // #5b6770
}

/** Arial en todo el archivo. Sus dígitos son de ancho fijo, así que las columnas de importes se
 *  alinean solas entre filas sin necesidad de una segunda familia monoespaciada. */
// La convención de número de un estado financiero tiene UNA definición en el repo. Acá se consume,
// no se copia — ver el bloque de NUM más abajo.
import { MONEDA_TOTAL } from './formato-statement.mjs'

export const FUENTE = 'Arial'
export const FUENTE_NUM = 'Arial'

/** Cuatro tamaños. Cada uno de más es una jerarquía que no significa nada. */
export const TAM = {
  // El titular del panel de una pestaña: el número que se lee desde lejos. Se declara acá y no se
  // escribe suelto en cada script — un tamaño que no está en esta tabla es un tamaño que nadie
  // decidió, y así se llega a seis tipografías distintas en una misma pestaña.
  titular: 16,
  titulo: 13,
  bloque: 11,
  cuerpo: 10,
  nota: 9,
}

/** Las alturas de fila. 21px es lo que entra en una pantalla sin scroll infinito. */
export const ALTO = { titulo: 28, bloque: 24, fila: 21 }

/**
 * Los formatos de número. UNO por unidad, y la unidad se DECLARA — no se adivina del rótulo.
 *
 * POR QUÉ ESTÁ ACÁ ESA ADVERTENCIA: el 21/07 el control de Cobranzas decidía el formato con una
 * regex sobre el texto de la etiqueta. Al mejorar dos redacciones, los conteos pasaron a mostrarse
 * como "$4" y "$2" y ningún test lo vio. Un formato que depende de cómo está escrito un rótulo se
 * rompe cada vez que se mejora la redacción, y en silencio.
 */
// ═══ EL NEGATIVO VA ENTRE PARÉNTESIS, Y EL ROJO ES DEL CONTROL (04/08) ═══
//
// Los tres patrones de acá llevaban `[Red]-`: guion y rojo. Las dos cosas están mal, y la segunda es
// la peor.
//
//   · EL GUION. La presentación que exigen AICPA y FASB bajo US GAAP —endosada por IFRS y pedida por
//     la SEC en las presentaciones de sociedades— es el PARÉNTESIS. El motivo es de lectura antes que
//     de norma: un guion chico se confunde con una marca de impresión o se pasa por alto, y leer mal
//     un solo número tuerce todo el análisis.
//   · EL ROJO. Con `[Red]` se pinta CUALQUIER negativo: una nota de crédito legítima, un neto de tramo
//     que da menos que cero porque ese mes se paga más de lo que se cobra. Cuando todo puede ponerse
//     rojo, el rojo deja de avisar. El único rojo de una pestaña es el de un control que no cierra
//     (MONEDA_CONTROL, en formato-statement.mjs).
//
// El patrón no se reescribe acá: se toma de formato-statement.mjs, que es su única definición. Ver el
// límite declarado: los importes del CUERPO siguen llevando "$" en esta capa (la convención de
// statement lo reserva para la fila de total), y eso todavía no se separó en las pestañas que la usan.
export const NUM = {
  // El tercer tramo del patrón: un cero se muestra como "—" y no como "$0", que invita a leerse
  // como un dato medido cuando casi siempre significa "acá no hay nada".
  moneda: { ...MONEDA_TOTAL },
  monedaExacta: { type: 'CURRENCY', pattern: '"$"#,##0.00;("$"#,##0.00);"—"' },
  cantidad: { type: 'NUMBER', pattern: '#,##0;(#,##0);"—"' },
  // El separador decimal del PATRÓN se deja exactamente como estaba: es lo único de este bloque que
  // no se está corrigiendo, y cambiarlo "de paso" es cómo se rompe un formato en silencio.
  porcentaje: { type: 'PERCENT', pattern: '0.0%;(0.0%);"—"' },
  fecha: { type: 'DATE', pattern: 'dd/mm/yyyy' },
  mes: { type: 'DATE', pattern: 'mmm-yy' },
  dias: { type: 'NUMBER', pattern: '0" d";-0" d";"—"' },
  texto: { type: 'TEXT' },
}

/** Qué unidades son numéricas: las que van en monoespaciada y alineadas a la derecha. */
const ES_NUMERO = new Set(['moneda', 'monedaExacta', 'cantidad', 'porcentaje', 'dias'])

/** Los anchos de columna. La primera lleva el concepto y necesita aire; las de números, no. */
export const ANCHO = { concepto: 270, texto: 150, numero: 112, fecha: 94, nota: 320, angosta: 58 }

const txt = (o = {}) => ({ fontFamily: FUENTE, fontSize: TAM.cuerpo, ...o })
const num = (o = {}) => ({ fontFamily: FUENTE_NUM, fontSize: TAM.cuerpo, ...o })

/**
 * NÚCLEO PURO: completa un formato con la tipografía del estándar.
 *
 * POR QUÉ EXISTE (21/07). El dueño: "tiene mil formatos de letras y colores distintos la pestaña
 * caja, ¿eso es world class?". Medido: dos tipografías conviviendo, y la culpa era de una trampa de
 * la API que no se ve leyendo el código.
 *
 * Cuando un pedido escribe `textFormat: { bold: true, fontSize: 9 }` con `fields:
 * 'userEnteredFormat'`, Sheets REEMPLAZA el textFormat entero: lo que no se nombra no se conserva,
 * se pierde. Y sin fontFamily la celda vuelve a la tipografía por defecto de la hoja —Calibri— aunque
 * la pestaña entera esté en Arial. Así aparecieron 31 celdas en otra fuente: todos los títulos,
 * encabezados y rótulos de bloque, o sea justo los que más se miran.
 *
 * Envolviendo cada formato con esto, la fuente deja de depender de que nadie se olvide de nombrarla.
 */
export function conFuente(formato = {}, { numerico = false } = {}) {
  if (!formato?.textFormat) return formato
  // El color del texto va por el mismo camino y por el mismo motivo: un textFormat que no lo nombra
  // deja la celda en el negro puro del default en vez del negro del archivo. Eran 38 celdas.
  return {
    ...formato,
    textFormat: {
      fontFamily: numerico ? FUENTE_NUM : FUENTE,
      fontSize: TAM.cuerpo,
      foregroundColor: COLOR.texto,
      ...formato.textFormat,
    },
  }
}

/** NÚCLEO PURO: el formato de la celda de TÍTULO de una pestaña (fila 1). */
export function titulo() {
  return {
    backgroundColor: COLOR.titulo,
    textFormat: txt({ fontSize: TAM.titulo, bold: true, foregroundColor: COLOR.tituloTexto }),
    horizontalAlignment: 'LEFT',
    verticalAlignment: 'MIDDLE',
    // OVERFLOW_CELL y no WRAP: un título que se envuelve empuja toda la pestaña hacia abajo. Y
    // además no se puede mergear una columna congelada con una que no lo está.
    wrapStrategy: 'OVERFLOW_CELL',
  }
}

/** NÚCLEO PURO: el rótulo de un BLOQUE dentro de la pestaña. */
export function bloque() {
  return {
    backgroundColor: COLOR.bloque,
    textFormat: txt({ fontSize: TAM.bloque, bold: true, foregroundColor: COLOR.bloqueTexto }),
    horizontalAlignment: 'LEFT',
    verticalAlignment: 'MIDDLE',
    wrapStrategy: 'OVERFLOW_CELL',
  }
}

/** NÚCLEO PURO: el encabezado de una tabla. */
export function encabezado() {
  return {
    backgroundColor: COLOR.encabezado,
    textFormat: txt({ bold: true, foregroundColor: COLOR.encabezadoTexto }),
    horizontalAlignment: 'CENTER',
    verticalAlignment: 'MIDDLE',
    wrapStrategy: 'WRAP',
  }
}

/**
 * NÚCLEO PURO: una celda de datos.
 * @param {keyof NUM} unidad la unidad DECLARADA, no inferida del rótulo
 */
export function celda(unidad = 'texto', { fondo, bold = false, alineacion, color } = {}) {
  const esNum = ES_NUMERO.has(unidad)
  const base = esNum ? num : txt
  return {
    ...(fondo ? { backgroundColor: fondo } : {}),
    numberFormat: NUM[unidad] ?? NUM.texto,
    textFormat: base({ bold, ...(color ? { foregroundColor: color } : {}) }),
    // Los números a la derecha: una columna de importes existe para compararse consigo misma, y
    // centrada no se puede. Las fechas también, porque son ordinales.
    horizontalAlignment: alineacion ?? (esNum || unidad === 'fecha' || unidad === 'mes' ? 'RIGHT' : 'LEFT'),
    // EL TEXTO DERRAMA, EL NÚMERO NO. Con CLIP, un rótulo de 53 caracteres en una columna de 230px
    // se cortaba aunque tuviera media pestaña vacía al lado — y así se cortaban los títulos de
    // bloque, las notas al costado y los "hay cheque al proveedor, sin imputar". Un número
    // derramado, en cambio, se confunde con el de la columna de al lado: ese sigue en CLIP.
    wrapStrategy: esNum ? 'CLIP' : 'OVERFLOW_CELL',
  }
}

/** NÚCLEO PURO: una fila de TOTAL. */
export function total(unidad = 'moneda') {
  return celda(unidad, { fondo: COLOR.total, bold: true })
}

/** NÚCLEO PURO: una fila de SUBTOTAL. */
export function subtotal(unidad = 'moneda') {
  return celda(unidad, { fondo: COLOR.subtotal, bold: true })
}

/**
 * NÚCLEO PURO: una nota al costado. Chica, gris e itálica: se lee si hace falta.
 *
 * DERRAMA, NO SE CORTA. Con CLIP, "Tiene que dar igual que…" se leía "Tiene que dar igu" y ahí
 * terminaba: la explicación de un control quedaba a medias justo donde importa. Una nota vive al
 * costado de celdas vacías; que use ese espacio es exactamente para lo que está. Si la vecina tiene
 * contenido Sheets la corta igual, y eso lo caza el detector `texto_cortado`.
 */
export function nota() {
  return {
    textFormat: txt({ fontSize: TAM.nota, italic: true, foregroundColor: COLOR.nota }),
    horizontalAlignment: 'LEFT',
    wrapStrategy: 'OVERFLOW_CELL',
  }
}

/** NÚCLEO PURO: un valor PROYECTADO. Ámbar, para que nunca se confunda con un real. */
export function proyectado(unidad = 'moneda') {
  return celda(unidad, { fondo: COLOR.proyectado, color: COLOR.proyectadoTexto })
}

/** NÚCLEO PURO: una alerta que pide acción. El único rojo del archivo. */
export function alerta(unidad = 'texto') {
  return celda(unidad, { fondo: COLOR.alerta, bold: true, color: COLOR.alertaTexto })
}

/** NÚCLEO PURO: un control que da bien. */
export function ok(unidad = 'moneda') {
  return celda(unidad, { fondo: COLOR.ok, bold: true })
}

/**
 * NÚCLEO PURO: EL RESET.
 *
 * Va SIEMPRE como primer request de cualquier pestaña que se rehace. Sin él, el formato viejo
 * sobrevive donde el bloque nuevo no llega: el 21/07 la pestaña de Proveedores quedó con bandas
 * azules en el medio de la nada después de reordenar los bloques, y el dueño la vio antes que yo.
 *
 * Borra fondo, tipografía, alineación y ajuste. NO borra el contenido.
 */
export function reset(sheetId, filas = 400, columnas = 30) {
  return {
    repeatCell: {
      range: { sheetId, startRowIndex: 0, endRowIndex: filas, startColumnIndex: 0, endColumnIndex: columnas },
      cell: {
        userEnteredFormat: {
          backgroundColor: { red: 1, green: 1, blue: 1 },
          textFormat: txt({ bold: false, italic: false, foregroundColor: { red: 0.063, green: 0.078, blue: 0.094 } }),
          horizontalAlignment: 'LEFT',
          verticalAlignment: 'MIDDLE',
          wrapStrategy: 'CLIP',
        },
      },
      fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,wrapStrategy)',
    },
  }
}

/**
 * NÚCLEO PURO: ¿esta pestaña respeta el estándar?
 *
 * Compara lo que devuelve `readSheetFormats` contra lo declarado acá. Sin una medición, "hacer
 * coincidir el formato" es una opinión y no se puede verificar que quedó hecho.
 *
 * @param {{titulo:string, filas:Array, congeladas:{filas:number}}} f salida de readSheetFormats
 * @returns {{ok:boolean, desvios:string[]}}
 */
export function auditar(f, { congeladas = 3 } = {}) {
  if (!f) return { ok: false, desvios: ['no pude leer el formato'] }
  const desvios = []
  const c = f.filas?.[0]?.[0]?.formato
  const tf = c?.textFormat ?? {}

  if (tf.fontFamily !== FUENTE) desvios.push(`el título usa ${tf.fontFamily ?? 'sin declarar'} y el estándar es ${FUENTE}`)
  if (tf.fontSize !== TAM.titulo && tf.fontSize !== 15) desvios.push(`el título mide ${tf.fontSize ?? '?'}pt y el estándar es ${TAM.titulo} o 15pt`)
  if (!tf.bold) desvios.push('el título no está en negrita')

  // ═══ EL ESTÁNDAR CAMBIÓ: EL TÍTULO NO LLEVA BARRA (23/07) ═══
  //
  // Este auditor exigía una barra de color rellena en la fila 1. Mientras la exigiera, el formateador
  // general se la iba a repintar a toda pestaña que su generador dejara con la piel de statement — y
  // así fue: cada pestaña quedaba bien y volvía a quedar mal dos horas después. Un auditor que mide
  // contra el estándar viejo no deja avanzar al nuevo. Ahora exige lo contrario: fondo BLANCO.
  const b = c?.backgroundColor
  const cerca = (x, y) => Math.abs((x ?? 0) - y) < 0.02
  if (b && !(cerca(b.red, 1) && cerca(b.green, 1) && cerca(b.blue, 1))) {
    desvios.push('el título tiene una barra de color: el estándar es tinta sobre blanco, con una línea fina abajo')
  }
  if ((f.congeladas?.filas ?? 0) !== congeladas) {
    desvios.push(`tiene ${f.congeladas?.filas ?? 0} fila(s) congelada(s) y el estándar son ${congeladas}`)
  }

  // ── LA TIPOGRAFÍA DE TODAS LAS CELDAS, NO SÓLO LA DEL TÍTULO ────────────────────────────────
  //
  // POR QUÉ (21/07). Este auditor miraba la fila 1 y las filas congeladas, y con eso daba una
  // pestaña por "en estándar". Ocho pestañas pasaban el control con 1.593 celdas en Calibri adentro
  // —651 en Proveedores, 533 en Materiales—, y como pasaban el control, el unificador las salteaba
  // sin tocarlas. Un auditor que mira una muestra y declara sano el conjunto es peor que no tenerlo.
  //
  // La causa de fondo de esas celdas está en conFuente(): un textFormat que no nombra la tipografía
  // hace que Sheets la reemplace por la de la hoja. Esto es lo que lo hace VISIBLE.
  let fuera = 0
  for (const fila of f.filas ?? []) {
    for (const celda of fila ?? []) {
      if (!String(celda?.valor ?? '').trim()) continue
      const ff = celda?.formato?.textFormat?.fontFamily
      if (ff && ff !== FUENTE && ff !== FUENTE_NUM) fuera++
    }
  }
  if (fuera) desvios.push(`${fuera} celda(s) fuera de ${FUENTE}`)

  return { ok: desvios.length === 0, desvios }
}
