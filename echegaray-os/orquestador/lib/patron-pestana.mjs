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
/**
 * Una sección numerada: "1 · TÍTULO", o una SUB-sección: "4.1 · TÍTULO".
 *
 * POR QUÉ EXISTEN LAS SUB-SECCIONES (23/07). El dueño, sobre CAJA: "los títulos son confusos".
 * Tenía trece secciones al mismo nivel, y las últimas nueve eran en realidad el ANEXO de la cuarta
 * —viven adentro de su grupo desplegable—. Numeradas todas igual, el lector no tiene forma de saber
 * que las tres primeras contestan la pregunta y el resto es el respaldo. La jerarquía del número
 * dice lo que el orden solo no puede decir.
 */
export const ES_SECCION_NUM = /^\s*(\d+)(?:\.(\d+))?\s*·\s+(\S.*)$/
/**
 * Un título de bloque sin número: arranca con una tirada larga en versalita. Sólo el hero puede
 * serlo. Se mide la TIRADA INICIAL, no la línea entera, porque estos títulos suelen traer una
 * aclaración en minúscula después de un guion ("CONTROLES Y CONCILIACIONES — el detalle …").
 */
export const ES_BLOQUE_SIN_NUMERO = /^[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ0-9 ,.·/:()%$]{9,}(?:\s*[—–-]|\s*$)/
/**
 * Encabezado de tabla: la primera palabra nombra la dimensión.
 *
 * "Nómina" entró el 13/08 con el rediseño de Jornales: el cuadro que abre esa pestaña tiene una fila
 * por POBLACIÓN de empleados (obreros, oficina, dirección), y esa es su dimensión. Sin la palabra acá,
 * la fila de encabezado no recibía ni la versalita apagada ni su regla —se dibujaba igual que un
 * renglón de importes— porque la piel lee esta misma lista (`estilo-statement` la importa).
 */
export const ES_ENCABEZADO = /^(per[ií]odo|concepto|plan|proveedor|obra|rubro|familia|cuenta|tipo|n[°º]|fecha|mes|semana|quincena|categor[ií]a|n[óo]mina|l[ií]nea|r[ée]gimen|qu[ée] pasa)\b/i
/** Un sub-ítem indentado. */
export const ES_SUBITEM = /^\s{2,}·\s/
/** Errores de fórmula que nunca deberían quedar vivos en una pestaña. */
export const ES_ERROR = /^#(REF|VALUE|VALOR|N\/A|NAME|¿NOMBRE\?|DIV\/0|NUM|NULL)[!?]?/i

/** Largo a partir del cual un texto deja de ser un rótulo y pasa a ser una nota. */
export const LARGO_NOTA = 60

/**
 * NÚCLEO PURO: EL TEXTO QUE EL LECTOR VE EN UNA CELDA.
 *
 * Una celda de texto se ve entera. Una FÓRMULA se ve como el literal que devuelve, y ahí es donde se
 * escondían las glosas más largas de Jornales: el supuesto del convenio medía 374 caracteres adentro
 * de un `=IF(...;"…";"…")` y ningún auditor lo veía, porque todos leen valores y el valor de una
 * fórmula, en frío, es la fórmula. Se devuelve el literal MÁS LARGO: es el que ocupa la fila.
 *
 * Se descartan los pedazos que no son prosa —máscaras de formato, separadores, el string vacío—
 * exigiendo DOS cosas: tres letras seguidas y un espacio. Con la primera sola se colaba `"d/m/yyyy"`
 * (la "yyyy" son cuatro letras), que es una máscara de fecha y no algo que alguien lea. Una glosa
 * tiene más de una palabra; una máscara, nunca.
 */
export function textoVisible(celda) {
  const s = String(celda ?? '').trim()
  if (!s.startsWith('=')) return s
  return [...s.matchAll(/"((?:[^"]|"")*)"/g)]
    .map((m) => m[1])
    .filter((x) => /\p{L}{3}/u.test(x) && /\s/.test(x))
    .sort((a, b) => b.length - a.length)[0] ?? ''
}

/**
 * NÚCLEO PURO: LAS GLOSAS DE LA COLUMNA DE CONCEPTO QUE SE PASARON DE LARGO.
 *
 * ═══ POR QUÉ EXISTE (13/08) ═══
 *
 * El dueño rechazó el diseño de "Jornales por Quincena": *"tiene muchas palabras y frases y
 * explicación que nadie lee … cada pestaña tiene que quedar minimalista y de clase mundial"*. La
 * pestaña no tenía un solo defecto de los que el auditor ya mide —ni un error, ni un ancho mezclado,
 * ni un bloque sin número— y aun así estaba mal: eran 3.118 caracteres de párrafo en la columna A.
 *
 * `auditarPatron` YA tenía el umbral (`LARGO_NOTA`) y la regla `nota-en-el-medio`, pero saltea la
 * columna A por diseño (`if (j === 0 …) return`) porque es la columna ancha, la que derrama. Ese
 * permiso, pensado para que un rótulo pudiera respirar, es exactamente por donde entró el párrafo.
 *
 * ESTO NO SE METIÓ ADENTRO DE `auditarPatron` A PROPÓSITO. Ese auditor lo consumen las siete pestañas
 * del libro y todas tienen glosas largas hoy: subir la regla ahí pondría en rojo trabajo ajeno que
 * nadie pidió tocar. Se ofrece como medida aparte, y cada generador la adopta en su propio test
 * cuando su pestaña se rediseña. La regla se gana pestaña por pestaña, no por decreto.
 *
 * @param {any[][]} filas                                   la grilla que arma el generador
 * @param {{tope?:number, columna?:number, desde?:number}} o tope de caracteres · columna de concepto ·
 *   primera fila medida (por defecto la 3: la 1 es el título y la 2 es, POR GRAMÁTICA, la única línea
 *   de prosa de la pestaña — qué contesta · fuente · fecha de corte)
 * @returns {{fila:number, largo:number, texto:string}[]}
 */
export function glosasLargas(filas = [], { tope = LARGO_NOTA, columna = 0, desde = 3 } = {}) {
  const largas = []
  filas.forEach((f, i) => {
    if (i + 1 < desde) return
    const t = textoVisible((f || [])[columna])
    if (t.length > tope) largas.push({ fila: i + 1, largo: t.length, texto: t })
  })
  return largas
}

/** Indenta un sub-ítem con el mismo prefijo en toda la pestaña. */
export const sub = (texto) => `   · ${texto}`
/** Rotula un total con el mismo prefijo en toda la pestaña. */
export const total = (texto) => `⇒ ${texto}`
/** Titula una sección con el mismo formato en toda la pestaña. */
export const seccion = (n, texto) => `${n} · ${String(texto).toUpperCase()}`

const celda = (f, j) => String(f?.[j] ?? '').trim()
const vacia = (f) => !(f || []).some((c) => String(c ?? '').trim())

/**
 * LAS DOS REGLAS QUE SIGNIFICAN "LA PESTAÑA ESTÁ ROTA", Y NO "LA PESTAÑA SE LEE MAL".
 *
 * `error-de-formula` es un número que no existe: quien lea esa celda lee `#REF!`. `vacia` es una
 * escritura que no llegó. Las dos invalidan el DATO. Todo el resto de la gramática —una fila sin
 * rótulo, un ancho mezclado, una sección desordenada— invalida la LECTURA, con los números correctos
 * publicados abajo.
 */
export const REGLAS_QUE_ROMPEN_EL_DATO = new Set(['error-de-formula', 'vacia'])

/**
 * NÚCLEO PURO: parte los defectos de patrón en los que tumban la corrida y los que son un REPORTE.
 *
 * ═══ POR QUÉ NO ES FAIL-CLOSED, QUE FUE LA OTRA OPCIÓN SOBRE LA MESA (14/08) ═══
 *
 * Un generador fail-closed sobre el patrón NO escribiría cuando la pestaña tiene un defecto. Suena
 * bien y en este caso es peor, por dos razones medidas sobre el caso real:
 *
 *   1. EL DEFECTO ESTÁ EN LA PESTAÑA, NO EN LA GRILLA. El residuo `F41:F44` de "Jornales por
 *      Quincena" ya estaba publicado antes de la corrida. No escribir no lo saca: lo CONGELA, y de
 *      paso congela los jornales, las fechas de pago y la proyección — el dato bueno se pierde para
 *      no publicar un defecto que igual queda a la vista.
 *   2. EL AUDITOR CORRE DESPUÉS DE ESCRIBIR PORQUE MIDE LO QUE QUEDÓ. Auditar la grilla ANTES no
 *      contesta la misma pregunta: la grilla no es lo que se ve (la fusión preserva, el centinela
 *      limpia, el dueño edita). Una guarda fail-closed apoyada en esa medición distinta se dispara
 *      por falsos positivos y deja la pestaña sin actualizar para siempre — la forma exacta de las
 *      pérdidas que este repo ya pagó.
 *
 * Entonces: el defecto de patrón se declara REPORTE. No es un fallo de datos y no debe leerse como
 * tal — leerlo así hace que el worker reintente una corrida que va a reproducir el mismo defecto, y
 * mezcla "los números están mal" con "el cuadro se lee mal", que exigen acciones distintas.
 *
 * Lo que sí cambia: el reporte tiene que ser NOMBRABLE. Un `⚠ 1 defecto de patrón` no es accionable;
 * la fila con su contenido sí, porque es lo que una persona necesita para limpiar la celda por la vía
 * declarada. La corrida sigue en rojo sólo cuando el dato está roto.
 *
 * @param {{fila:number, regla:string, detalle:string}[]} defectos
 * @returns {{rotos:Array, reporte:Array}}
 */
export function clasificarDefectos(defectos = []) {
  const rotos = []
  const reporte = []
  for (const d of defectos || []) (REGLAS_QUE_ROMPEN_EL_DATO.has(d?.regla) ? rotos : reporte).push(d)
  return { rotos, reporte }
}

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
  let subEsperada = 1
  let vistaPrimeraSeccion = false
  const titulos = new Map()
  filas.forEach((f, i) => {
    const a = celda(f, 0)
    if (!a) return
    const m = a.match(ES_SECCION_NUM)
    if (m) {
      vistaPrimeraSeccion = true
      const n = Number(m[1])
      const sub = m[2] === undefined ? null : Number(m[2])
      if (sub === null) {
        if (n !== esperada) mal(i + 1, 'seccion-desordenada', `Esperaba la sección ${esperada} y encontré la ${n}: "${a}".`)
        esperada = n + 1
        subEsperada = 1
      } else {
        // Una sub-sección tiene que colgar de la sección que se acaba de abrir, y correr de a uno.
        if (n !== esperada - 1) mal(i + 1, 'subseccion-huerfana', `"${a.slice(0, 40)}" cuelga de la sección ${n}, pero la abierta es la ${esperada - 1}.`)
        else if (sub !== subEsperada) mal(i + 1, 'seccion-desordenada', `Esperaba la ${n}.${subEsperada} y encontré la ${n}.${sub}: "${a}".`)
        subEsperada = sub + 1
      }
      const clave = m[3].toUpperCase()
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
  const encabezados = []
  filas.forEach((f, i) => {
    if (!ES_ENCABEZADO.test(celda(f, 0))) return
    let n = (f || []).length
    while (n > 0 && !celda(f, n - 1)) n--
    if (!n) return
    anchos.set(n, (anchos.get(n) ?? 0) + 1)
    encabezados.push({ fila: i, ancho: n })
  })
  // El ancho de la pestaña es el del cuadro: el que más se repite y, si empatan, el MÁS ANCHO.
  // Sin el desempate por ancho, una pestaña con un cuadro y dos bloques de posición —tres
  // encabezados, uno cada uno— elegía como "declarado" el primero que apareciera, que es justamente
  // el más angosto, y entonces el cuadro entero quedaba marcado como el intruso.
  const declarado = ancho ?? [...anchos.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0]
  // ═══ EXCEPCIÓN 2 — EL BLOQUE DE POSICIÓN, ARRIBA (06/08) ═══
  //
  // Una pestaña puede ABRIR con bloques de posición más angostos que su cuadro, y no es un descuido:
  // un calendario de vencimientos no tiene doce meses, tiene fechas; una posición de financiamiento
  // tiene límite, tomado y disponible. Forzarlos a doce columnas sería inventar diez celdas vacías
  // por fila para que el auditor esté contento.
  //
  // LA EXCEPCIÓN ES ESTRECHA, para que no se cuele el descuadre real que esta regla vino a cazar:
  // sólo cuentan los bloques que están ARRIBA del primer cuadro del ancho declarado, y sólo si son
  // MÁS ANGOSTOS. Uno más ancho arriba, o uno angosto en el medio del detalle, sigue siendo un cuadro
  // que no se puso de acuerdo — que es exactamente lo que se ve corrido en pantalla.
  const primeroDelAncho = encabezados.find((e) => e.ancho === declarado)?.fila ?? Infinity
  const dePosicion = new Set(encabezados
    .filter((e) => e.fila < primeroDelAncho && e.ancho < declarado)
    .map((e) => e.ancho))
  for (const a of dePosicion) {
    // Sólo se perdona si TODOS los encabezados de ese ancho están arriba: uno suelto abajo delata
    // que el ancho no es de la posición sino de un cuadro que quedó descuadrado.
    const abajo = encabezados.some((e) => e.ancho === a && e.fila >= primeroDelAncho)
    if (abajo) dePosicion.delete(a)
  }
  for (const a of dePosicion) anchos.delete(a)
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
