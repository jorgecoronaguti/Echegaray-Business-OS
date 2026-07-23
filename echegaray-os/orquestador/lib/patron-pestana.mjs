// EL PATRÓN DE DISEÑO DE UNA PESTAÑA — UNA SOLA GRAMÁTICA PARA TODAS.
//
// POR QUÉ EXISTE (23/07). El dueño, cuarta vez sobre lo mismo: "las pestañas no respetan un patrón
// de diseño". Tenía razón, y la causa no era estética sino ESTRUCTURAL: cada pestaña la escribían
// uno, dos o tres generadores distintos, cada uno con su propio ancho de grilla, su propia forma de
// titular un bloque y su propio lugar para las notas. "Cargas Sociales" la escriben TRES scripts y
// tiene bloques de 10 y de 14 columnas mezclados, dos bloques sin número y un bloque huérfano que
// ningún generador reclama —y que quedó roto en #VALUE! sin que nadie se enterara—.
//
// Un estándar que sólo vive en la cabeza del que escribe el código no es un estándar. Esto lo baja a
// dos cosas verificables: HELPERS para construir la pestaña bien, y un AUDITOR que la mide después.
//
// ═══ LA GRAMÁTICA ═══
//
//   Fila 1   TÍTULO de la pestaña (una línea, en oración)
//   Fila 2   qué contesta · fuente · fecha de corte
//   Fila 3   en blanco
//   HERO     el único bloque sin número: el titular y sus sub-ítems. Se lee en tres segundos.
//   1 · …    secciones NUMERADAS Y CORRIDAS. Cada una contesta UNA pregunta, escrita en el título.
//
//   Dentro de una sección:  encabezado de tabla → detalle → fila de total que empieza con "⇒".
//
// ═══ LAS REGLAS DE COLUMNA (lo que estandarizan los bancos: misma columna, mismo significado) ═══
//
//   A          el concepto. Los sub-ítems van indentados con "   · ".
//   B          EL IMPORTE. Siempre el mismo lugar en toda la pestaña.
//   C…         la serie (meses, monedas, cantidades). Opcional.
//   ÚLTIMA     el origen o la nota. NUNCA una nota larga en el medio de la grilla: desparrama la
//              fila y descuadra todo lo que está debajo.
//
// Un solo ANCHO DE GRILLA por pestaña. Dos anchos distintos es lo que hace que un cuadro se vea
// corrido respecto del de arriba, y es el defecto que el dueño llama "totalmente descuadrado".

/** Un total: se rula y va en negrita. */
export const ES_TOTAL = /^\s*(⇒|total\b)/i
/** Una sección numerada: "1 · TÍTULO". El separador es "·", no punto ni guion. */
export const ES_SECCION_NUM = /^\s*(\d+)\s*·\s+(\S.*)$/
/**
 * Un título de bloque sin número: arranca con una tirada larga en versalita. Sólo el hero puede
 * serlo. Se mide la TIRADA INICIAL, no la línea entera, porque estos títulos suelen traer una
 * aclaración en minúscula después de un guion ("CONTROLES Y CONCILIACIONES — el detalle …").
 */
export const ES_BLOQUE_SIN_NUMERO = /^[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ0-9 ,.·/:()%$]{9,}(?:\s*[—–-]|\s*$)/
/** Encabezado de tabla: la primera palabra nombra la dimensión. */
export const ES_ENCABEZADO = /^(per[ií]odo|concepto|plan|proveedor|obra|rubro|familia|cuenta|tipo|n[°º]|fecha|mes|semana|l[ií]nea|r[ée]gimen|qu[ée] pasa)\b/i
/** Un sub-ítem indentado. */
export const ES_SUBITEM = /^\s{2,}·\s/
/** Errores de fórmula que nunca deberían quedar vivos en una pestaña. */
export const ES_ERROR = /^#(REF|VALUE|VALOR|N\/A|NAME|¿NOMBRE\?|DIV\/0|NUM|NULL)[!?]?/i

/** Largo a partir del cual un texto deja de ser un rótulo y pasa a ser una nota. */
export const LARGO_NOTA = 60

/** Indenta un sub-ítem con el mismo prefijo en toda la pestaña. */
export const sub = (texto) => `   · ${texto}`
/** Rotula un total con el mismo prefijo en toda la pestaña. */
export const total = (texto) => `⇒ ${texto}`
/** Titula una sección con el mismo formato en toda la pestaña. */
export const seccion = (n, texto) => `${n} · ${String(texto).toUpperCase()}`

const celda = (f, j) => String(f?.[j] ?? '').trim()
const vacia = (f) => !(f || []).some((c) => String(c ?? '').trim())

/**
 * NÚCLEO PURO: mide una pestaña contra la gramática y devuelve lo que no la cumple.
 *
 * No arregla nada: nombra el defecto con su fila, para que el generador dueño lo corrija. Es el
 * único modo de que "patrón de diseño" sea una afirmación verificable y no una opinión.
 *
 * @param {any[][]} filas          la grilla leída de la pestaña (valores, no fórmulas)
 * @param {{ancho?:number}} opts   ancho de grilla esperado; si no se pasa, se deduce del hero
 * @returns {{fila:number, regla:string, detalle:string}[]}
 */
export function auditarPatron(filas = [], { ancho } = {}) {
  const malos = []
  const mal = (fila, regla, detalle) => malos.push({ fila, regla, detalle })

  if (!filas.length) return [{ fila: 0, regla: 'vacia', detalle: 'La pestaña no tiene contenido.' }]

  // ── Fila 1: el título. Fila 2: de dónde sale y a qué fecha. ──
  const t = celda(filas[0], 0)
  if (!t) mal(1, 'sin-titulo', 'La fila 1 tiene que ser el título de la pestaña.')
  else if (t === t.toUpperCase() && t.length > 3) mal(1, 'titulo-versalita', `El título va en oración, no en versalita: "${t}".`)
  if (!celda(filas[1], 0)) mal(2, 'sin-subtitulo', 'La fila 2 tiene que decir qué contesta la pestaña, de qué fuente sale y a qué fecha.')

  // ── Secciones: numeradas, corridas, sin repetir, y ningún bloque suelto después del hero. ──
  let esperada = 1
  let vistaPrimeraSeccion = false
  const titulos = new Map()
  filas.forEach((f, i) => {
    const a = celda(f, 0)
    if (!a) return
    const m = a.match(ES_SECCION_NUM)
    if (m) {
      vistaPrimeraSeccion = true
      const n = Number(m[1])
      if (n !== esperada) mal(i + 1, 'seccion-desordenada', `Esperaba la sección ${esperada} y encontré la ${n}: "${a}".`)
      esperada = n + 1
      const clave = m[2].toUpperCase()
      if (titulos.has(clave)) mal(i + 1, 'seccion-repetida', `El título ya está en la fila ${titulos.get(clave)} — residuo de una corrida vieja.`)
      else titulos.set(clave, i + 1)
      return
    }
    // Un bloque en versalita sin número, DESPUÉS de que empezaron las secciones, es un bloque suelto:
    // el lector no sabe si es una sección nueva, un sub-bloque o un resto. El hero (antes de la
    // sección 1) es la única excepción.
    //
    // UN TÍTULO OCUPA SU FILA SOLO. Sin esta condición se marcaba cada proveedor en versalita de un
    // listado agrupado ("PEDRO TELLO | $1.234 | …"), que es un DATO, no un título: 56 falsos
    // positivos en Proveedores. Un renglón con importes al lado nunca es un encabezado de bloque.
    const soloEnSuFila = !(f || []).slice(1).some((c) => String(c ?? '').trim())
    if (vistaPrimeraSeccion && soloEnSuFila && ES_BLOQUE_SIN_NUMERO.test(a) && !ES_TOTAL.test(a) && !ES_ENCABEZADO.test(a)) {
      mal(i + 1, 'bloque-sin-numero', `"${a.slice(0, 50)}" es un bloque sin número: o lleva número o va adentro de una sección.`)
    }
  })
  if (esperada === 1) mal(0, 'sin-secciones', 'La pestaña no tiene ninguna sección numerada.')

  // ── Un solo ancho de grilla. Dos anchos es lo que hace que un cuadro se vea corrido. ──
  const anchos = new Map()
  filas.forEach((f) => {
    if (!ES_ENCABEZADO.test(celda(f, 0))) return
    let n = (f || []).length
    while (n > 0 && !celda(f, n - 1)) n--
    if (n) anchos.set(n, (anchos.get(n) ?? 0) + 1)
  })
  const declarado = ancho ?? [...anchos.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
  // UNA EXCEPCIÓN, Y UNA SOLA: EL LEDGER. Una pestaña de statement puede llevar debajo su registro
  // crudo —cheque por cheque, operación por operación—, que necesariamente es más ancho que los
  // cuadros de arriba. Se admite UN bloque así: más ancho que el resto y una sola vez. Dos o tres
  // anchos distintos ya no son un ledger, son cuadros que no se pusieron de acuerdo: eso es lo que
  // se ve corrido en pantalla.
  const extras = [...anchos.entries()].filter(([n]) => n !== declarado)
  const esLedgerUnico = extras.length === 1 && extras[0][1] === 1 && extras[0][0] > declarado
  if (anchos.size > 1 && !esLedgerUnico) {
    const lista = [...anchos.keys()].sort((a, b) => a - b).join(', ')
    mal(0, 'anchos-mezclados', `La pestaña mezcla ${anchos.size} anchos de grilla (${lista} columnas). Tiene que ser uno solo (${declarado}), salvo un único bloque de registro más ancho al final.`)
  }

  filas.forEach((f, i) => {
    const a = celda(f, 0)
    // ── Ningún error de fórmula vivo. ──
    ;(f || []).forEach((c, j) => {
      if (ES_ERROR.test(String(c ?? '').trim())) mal(i + 1, 'error-de-formula', `Columna ${j + 1}: ${String(c).trim()} — la pestaña está rota, no sólo fea.`)
    })
    if (vacia(f)) return
    // ── Ninguna fila con datos y sin concepto: el lector no sabe qué está mirando. ──
    //
    // Se exige que TAMBIÉN la segunda columna esté vacía. En un listado agrupado (Proveedores) la
    // fila de detalle deja la columna A libre a propósito —el nombre lo puso la fila de grupo— y
    // rotula en B: eso se entiende. Lo que no se entiende es un número flotando sin rótulo alguno.
    if (!a && !celda(f, 1)) { mal(i + 1, 'fila-sin-concepto', 'Tiene valores pero ni la columna A ni la B dicen qué son.'); return }
    if (!a) return
    // ── Las notas largas van en la última columna, nunca en el medio. ──
    const ultima = declarado ? declarado - 1 : (f || []).length - 1
    ;(f || []).forEach((c, j) => {
      const s = String(c ?? '').trim()
      if (j === 0 || j >= ultima) return
      if (s.length > LARGO_NOTA) mal(i + 1, 'nota-en-el-medio', `Columna ${j + 1}: un texto de ${s.length} caracteres en el medio de la grilla desparrama la fila. Va en la última columna.`)
    })
  })

  return malos
}
