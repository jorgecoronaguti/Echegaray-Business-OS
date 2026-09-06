// DÓNDE VIVE LA DECLARACIÓN DE ORIGEN CUANDO EL SHEET YA NO PUEDE ALOJARLA.
//
// ═══ EL DEFECTO, MEDIDO EL 06/09/2026 ═══
//
// `censo-numeros-pegados.mjs` decide si un número pegado es una violación o un dato de origen
// legítimo leyendo una LEYENDA que el generador escribe en una celda visible (`RE_ORIGEN` sobre el
// valor de la celda). En Cargas Sociales esa leyenda vivía en la columna O:
//
//     G.mensual(p.nombre, …, `Réplica del plan cargado en Compras · ${p.n} cuota(s) · …`)
//
// El 05/09 el dueño ordenó «minimalismo extremo y no tenga aclaraciones ni explicaciones de nada», y
// `cargas-sociales-pestana.mjs:347` pasó a llamar `vaciarColumnaDeProsa(gridFinal, ANCHO - 1)`, que
// escribe el centinela VACIO en toda la columna O. Leído del archivo vivo: `Cargas Sociales!O1:O90`
// no tiene una sola celda con texto.
//
// Resultado: el censo informa 15 violaciones en B81:K83 —las cuotas de tres planes de pago que son
// una réplica de lo cargado en Compras y espejado en Supabase, y que el propio generador documenta
// como réplica— porque la leyenda que las amparaba dejó de existir.
//
// LOS DOS MECANISMOS SON INCOMPATIBLES, y no por un descuido: uno pide que la procedencia esté
// escrita en la pestaña y el otro prohíbe que haya nada escrito en la pestaña que no sea el dato.
// Mientras convivan, el censo miente hacia el lado peor: cuenta como defecto lo que está bien, y el
// que mira el número deja de creerle a los que sí son defectos.
//
// ═══ POR QUÉ NO SE RESUELVE DENTRO DEL SHEET ═══
//
//   · NOTA DE CELDA. Descartada con evidencia del propio repositorio: `borrarNotas`
//     (lib/nota-celda.mjs) borra las notas de A..colOrigen en cada corrida de los tres generadores
//     que la usan, así que una declaración puesta ahí no sobrevive a la corrida siguiente. Y el
//     dueño ya la había rechazado antes por su cuenta: «quitá las notas, son confusas».
//   · METADATO DE RANGO (developerMetadata). Invisible de verdad, pero no se puede revisar en un
//     diff, no queda en git, y obliga a ESCRIBIR en el Sheet para declarar algo que el repositorio
//     ya sabe. Una declaración que sólo existe en el archivo vivo se pierde el día que el generador
//     rehace el bloque, y nadie se entera.
//
// ═══ DÓNDE VIVE, ENTONCES ═══
//
// En el repositorio, al lado de la pestaña que ampara (`PESTANAS` en `scripts/formato-pestanas.mjs`),
// que es donde ya se declaraba el único origen por columna que existía (`CAJA`, columna C). Es
// versionado, se lee en el diff, y el día que alguien quiera ampliar el amparo tiene que discutir
// con un texto y no con un silencio.
//
// ═══ LA PARTE QUE HACE QUE ESTO SIGA SIENDO UN CONTROL Y NO UN INTERRUPTOR ═══
//
// Una excepción declarada apaga un aviso. Si además puede apagarlo para siempre y sin que se note,
// deja de ser una excepción y pasa a ser el modo de tapar el problema — es exactamente lo que
// `formato-pestanas.mjs` se negó a hacer con E45:E61 de OBRAS («declararlo acá sería usar la
// excepción para apagar el aviso»).
//
// Por eso el amparo es angosto en las tres dimensiones y se denuncia solo cuando deja de aplicar:
//
//   1 · POR BLOQUE, NO POR PESTAÑA. Ampara el run de filas donde vive el rótulo declarado y nada
//       más. Un número pegado tres filas más abajo, en el bloque siguiente, se sigue contando.
//   2 · POR COLUMNA. Sólo las columnas declaradas. Una cuota que aparezca en la N —la del total,
//       que es fórmula— sigue siendo violación.
//   3 · POR RÓTULO Y NO POR NÚMERO DE FILA. Es la regla del repositorio («filas por RÓTULO en
//       variable, nunca por posición fija»): si el bloque baja cuatro filas porque se agregó un
//       subtítulo, el amparo lo sigue; si en cambio se aplicara a `B81:K83`, amparar
//       silenciosamente lo que caiga ahí mañana.
//   4 · UNA DECLARACIÓN QUE NO ENCUENTRA SU BLOQUE ES UN HALLAZGO, no un no-op. Si el bloque se
//       renombra, se parte o se borra, la declaración queda huérfana y hay que decirlo: si no, la
//       pestaña se queda con un permiso vigente para un bloque que ya no existe, que es la forma
//       exacta en que nace un control que no puede dar rojo.
//
// LO QUE ESTE MÓDULO **NO** DECIDE: si un dato es de origen o es un cálculo. Eso lo decide quien
// escribe la declaración, y tiene que poder defenderlo. Acá sólo se resuelve dónde se anota y cómo
// se verifica que la anotación siga hablando de algo que existe.

/** Cómo se compara un rótulo: sin tildes, sin mayúsculas, sin el número de sección, sin la glosa. */
export function normalizarRotulo(texto) {
  // EL ORDEN IMPORTA, Y COSTÓ UN ROJO. Quitar tildes con `\p{Diacritic}` ANTES de cortar el número de
  // sección borra el `·` mismo: U+00B7 (MIDDLE DOT) tiene la propiedad Diacritic en Unicode porque el
  // catalán lo usa como tal. Con el separador ya borrado, el regex de sección no matchea y
  // «7 · Planes de pago» queda como «7 planes de pago» — o sea que el bloque renumerado deja de
  // reconocerse y la declaración se vuelve huérfana sola. Primero se corta la sección, después se
  // despoja de tildes.
  return String(texto ?? '')
    .replace(/^\s*\d+(?:\.\d+)?\s*·\s*/, '')   // «7 · Planes de pago» → «Planes de pago»
    .split(' — ')[0]                            // la glosa a la derecha del guion largo no identifica
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** ¿La fila está vacía? Es el mismo criterio con que el censo parte la grilla en bloques. */
const vacia = (fila) => !(fila ?? []).some((c) => String(c?.valor ?? c ?? '').trim())

/** El texto que se ve en una celda de la grilla, venga como objeto del censo o como string pelado. */
const visible = (celda) => String(celda?.valor ?? celda ?? '').trim()

/**
 * NÚCLEO PURO: parte la grilla en bloques — runs de filas no vacías.
 *
 * Es el MISMO particionado que usa `censar`, y a propósito: dos definiciones de «bloque» conviviendo
 * en el mismo control es cómo se termina amparando un rango distinto del que se creyó declarar.
 *
 * @param {Array<Array<unknown>>} filas
 * @returns {{desde:number, hasta:number}[]} índices 0-based, `hasta` inclusive
 */
export function bloquesDeGrilla(filas = []) {
  const out = []
  for (let a = 0, i = 0; i <= filas.length; i++) {
    if (i === filas.length || vacia(filas[i])) {
      if (i > a) out.push({ desde: a, hasta: i - 1 })
      a = i + 1
    }
  }
  return out
}

/** Índice de columna (0-based) a letra. */
const LETRA = (n) => { let s = ''; for (let i = n; i >= 0; i = Math.floor(i / 26) - 1) s = String.fromCharCode(65 + (i % 26)) + s; return s }

/** Letra de columna a índice 0-based. */
export function indiceDeColumna(letra) {
  const s = String(letra ?? '').trim().toUpperCase()
  if (!/^[A-Z]+$/.test(s)) throw new Error(`indiceDeColumna: "${letra}" no es una columna`)
  return [...s].reduce((n, c) => n * 26 + (c.charCodeAt(0) - 64), 0) - 1
}

/** `'B:M'` → `['B','C',…,'M']`. Una columna suelta también vale: `'C'` → `['C']`. */
export function expandirColumnas(spec) {
  const s = String(spec ?? '').trim().toUpperCase()
  if (!s.includes(':')) return [s]
  const [a, b] = s.split(':')
  const [i, j] = [indiceDeColumna(a), indiceDeColumna(b)]
  if (j < i) throw new Error(`expandirColumnas: el rango ${s} está dado vuelta`)
  return Array.from({ length: j - i + 1 }, (_, k) => LETRA(i + k))
}

/**
 * NÚCLEO PURO: qué celdas ampara el registro de orígenes, y qué declaración quedó huérfana.
 *
 * Una declaración es `{ bloque, cols, que }`:
 *   · `bloque` — el rótulo con que el generador titula la sección. Se compara normalizado.
 *   · `cols`   — `'B:M'` o `'C'`. Sin `cols` no ampara nada: una declaración sin columnas es un
 *                permiso en blanco, y un permiso en blanco no se otorga por omisión.
 *   · `que`    — por qué esos números son origen y no cálculo. No se usa para decidir; se usa para
 *                que la próxima persona pueda discutirlo.
 *
 * @param {Array<Array<unknown>>} filas la grilla de la pestaña (0-based)
 * @param {{bloque:string, cols:string, que?:string}[]} declaraciones
 * @returns {{amparadas:Set<string>, huerfanas:{bloque:string, motivo:string}[]}}
 */
export function amparoDeOrigen(filas = [], declaraciones = []) {
  const amparadas = new Set()
  const huerfanas = []
  const bloques = bloquesDeGrilla(filas)

  for (const d of declaraciones) {
    const buscado = normalizarRotulo(d?.bloque)
    if (!buscado) { huerfanas.push({ bloque: String(d?.bloque ?? ''), motivo: 'la declaración no dice qué bloque ampara' }); continue }
    if (!String(d?.cols ?? '').trim()) { huerfanas.push({ bloque: String(d?.bloque ?? ''), motivo: 'la declaración no dice qué columnas ampara' }); continue }

    // El bloque se identifica por su rótulo en la PRIMERA columna: es donde el generador escribe el
    // título de sección. Buscarlo en toda la fila haría que una celda de datos con el mismo texto
    // abriera un amparo que nadie declaró.
    const donde = bloques.filter((b) => {
      for (let i = b.desde; i <= b.hasta; i++) if (normalizarRotulo(visible(filas[i]?.[0])) === buscado) return true
      return false
    })
    if (!donde.length) { huerfanas.push({ bloque: String(d.bloque), motivo: 'ningún bloque de la pestaña lleva ese rótulo' }); continue }

    const cols = expandirColumnas(d.cols)
    for (const b of donde) {
      for (let i = b.desde; i <= b.hasta; i++) for (const c of cols) amparadas.add(`${c}${i + 1}`)
    }
  }
  return { amparadas, huerfanas }
}
