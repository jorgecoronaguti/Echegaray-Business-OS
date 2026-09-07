// EL CONTRATO DE DISEÑO DEL «Flujo de Caja - Cash Flow» — UNO SOLO, Y MEDIBLE.
//
// ═══ POR QUÉ EXISTE (05/09/2026) ═══
//
// El dueño: *"necesito unificar el diseño de todas las pestañas … cada pestaña tiene que quedar
// minimalista y de clase mundial"*, y en la misma vuelta, más restrictivo: *"quiero q en el diseño
// del sheet flujo de fondos respete el minimalismo extremo y no tenga aclaraciones ni explicaciones
// de nada"*.
//
// El archivo ya tenía las DOS mitades del estándar y le faltaba la tercera:
//
//   · `estilo-statement.mjs` — cómo se DIBUJA (tinta, versalita, hairline, sin reja, titular).
//   · `patron-pestana.mjs`   — la GRAMÁTICA de una pestaña (secciones, totales, encabezados).
//   · y nada que dijera QUÉ TIENE QUE SER IGUAL EN TODAS ni que lo MIDIERA contra el archivo vivo.
//
// Esa falta no es teórica. `glosasLargas` —la única regla contra el párrafo— mira SÓLO la columna A
// y su propio comentario declara que se gana "pestaña por pestaña, no por decreto". El decreto llegó,
// y además la prosa no estaba donde se la buscaba: medido el 05/09 con `auditar-pantalla`, las doce
// glosas más largas de "Proveedores" viven en la columna C (C160: *"Es la misma línea del Cash Flow
// Me…"*, 40 caracteres visibles de un texto más largo) y la de "Materiales" en A51 (88 caracteres).
// Un control que sólo mira la primera columna devuelve el mismo verde que uno que revisó la pestaña.
//
// ═══ EL CONTRATO, ESCRITO ═══
//
// Vale para TODA pestaña del archivo salvo las cinco que el dueño excluyó (ver `EXCLUIDAS`).
//
//  1. ENCABEZADO, tres filas y siempre las mismas.
//     A1 = el nombre de la pestaña, solo, sin adornos ni fecha.
//     A2 = UNA línea de procedencia: qué contesta · de dónde sale · a qué fecha. Es la ÚNICA prosa
//          admitida en todo el archivo, y tiene tope (`TOPE_SUBTITULO`). No explica: declara.
//     A3 = vacía. La respiración entre el encabezado y el primer bloque es parte del encabezado.
//  2. TITULAR en la fila 4: la cifra que la pestaña contesta, en acento y a mayor cuerpo (lo aplica
//     `skinRequests({ titular })`). Una pestaña contesta UNA pregunta.
//  3. BLOQUES `N · TÍTULO EN VERSALITA`, numerados 1..N, CONSECUTIVOS, sin huecos ni repetidos. El
//     respaldo cuelga como `N.1 · …`, nunca como un bloque de primer nivel más.
//  4. ENCABEZADO DE TABLA nombrando su dimensión (`ES_ENCABEZADO`), y TOTALES con el prefijo `⇒`.
//  5. ORDEN DE COLUMNAS, siempre el mismo: concepto → dimensión (fecha/mes/obra) → importes →
//     estado → origen. Lo que se lee primero es lo que identifica la fila.
//  6. NÚMEROS: es-AR (coma decimal, punto de miles), moneda sin decimales, cero dibujado `—`,
//     porcentaje con un decimal, y la unidad declarada UNA vez en el encabezado de columna — no
//     repetida celda por celda (Fuselab Creative, 03/08/2026).
//  7. NEGATIVOS ENTRE PARÉNTESIS, no con guion: es el formato estándar bajo GAAP e IFRS porque un
//     guion chico se confunde con una marca de la página (AccountingTools, 28/05/2026).
//  8. TIPOGRAFÍA de cifras TABULAR (dígitos de ancho fijo), que es lo que alinea las columnas de
//     números sin tocar nada más (Butterick's Practical Typography, "Tabular figures"). Ya lo
//     resuelve `formato-pestanas.mjs` con Roboto Mono en toda celda con formato numérico.
//  9. SIN REJA Y SIN RELLENOS: la estructura la marcan la tipografía y una línea fina. Las reglas
//     verticales de una tabla son non-data-ink y se borran (Tufte, *The Visual Display of
//     Quantitative Information*, 1983). Un bloque = un mensaje (IBCS SUCCESS: SAY · CONDENSE ·
//     SIMPLIFY — IBCS Association, estándar v1.2, 2022).
// 10. LO QUE NO SE DIBUJA: leyendas, notas al pie, disclaimers, glosarios, la aclaración debajo de
//     un total, el "tener en cuenta que…". Nada. El porqué de un número vive en el código del script
//     que lo escribe, que es donde alguien lo va a buscar el día que importe.
//
// LO QUE ESTE MÓDULO **NO** DECIDE: qué número es el correcto, ni qué dato va en cada pestaña. Mide
// FORMA. Y mide sólo lo que se ve en los VALORES: el color, el ancho y la fuente los miden
// `auditar-pantalla.mjs` y `estilo-pestana.auditar()`, que ya existen y no se duplican acá.
//
// ═══ LA CONVENCIÓN DE COLOR DE LA BANCA NO SE ADOPTA, Y ES A PROPÓSITO ═══
//
// La búsqueda del 05/09 devuelve el estándar de Wall Street: azul para el input tipeado, negro para
// la fórmula, verde para la referencia a otra hoja (Wall Street Prep, 15/10/2024; Wall Street Oasis,
// 12/10/2024). Acá NO se aplica, por una razón medida: ese código de color existe para que un humano
// audite un modelo a ojo, y en este archivo esa auditoría la hace `censo-numeros-pegados.mjs` celda
// por celda, con nombre y apellido de cada número tipeado. Pintar de azul 484 celdas agregaría tinta
// sin agregar un solo control que el OS no tenga ya. Se toma el principio (input y cálculo se
// distinguen), no el mecanismo.

import { ES_SECCION_NUM, LARGO_NOTA, textoVisible } from './patron-pestana.mjs'

/**
 * LAS CINCO PESTAÑAS QUE EL DUEÑO SACÓ DEL ALCANCE, con su motivo textual.
 *
 * No es una lista de comodidad: cada una está excluida por una decisión suya, y el motivo se guarda
 * para que el día que alguien quiera "unificarlas también" tenga que discutir con la decisión y no
 * con un silencio. Compras y Cobranzas además son FUENTE: se leen, no se reescriben.
 */
export const EXCLUIDAS = Object.freeze({
  Compras: 'fuente — la carga una persona; el dueño la excluyó del rediseño',
  Cobranzas: 'fuente — la carga una persona; el dueño la excluyó del rediseño',
  CAJA: 'el dueño, 05/09: «CAJA es otra pestaña q no puedes tocar»',
  'Cheques Emitidos': 'el dueño, 05/09: «cheques emitidos y recibidos estan ok»',
  'Cheques Recibidos': 'el dueño, 05/09: «cheques emitidos y recibidos estan ok»',
})

/** ¿Esta pestaña entra en el contrato? */
export const enAlcance = (pestana) => !Object.hasOwn(EXCLUIDAS, String(pestana))

/**
 * Tope de caracteres a partir del cual una celda deja de ser un rótulo y pasa a ser una nota.
 * Se REUSA `LARGO_NOTA` en vez de elegir un número nuevo: dos umbrales para la misma idea es cómo se
 * empieza a tener dos definiciones de "minimalista".
 */
export const TOPE_PROSA = LARGO_NOTA

/**
 * Tope de la fila 2, la única línea de prosa admitida. Más largo que un rótulo porque tiene que
 * entrar «qué contesta · fuente · corte», y bastante más corto que un párrafo: a partir de acá deja
 * de declarar procedencia y empieza a explicar.
 */
export const TOPE_SUBTITULO = 120

/**
 * LOS CONECTORES QUE DELATAN UNA EXPLICACIÓN AUNQUE SEA CORTA.
 *
 * El tope de caracteres solo no alcanza: *"NO es error sin más"* mide 18 y es exactamente lo que el
 * dueño mandó sacar. Lo que distingue una explicación de un rótulo no es el largo, es que argumenta
 * — y argumentar en castellano pasa casi siempre por una de estas piezas.
 *
 * Van con límites de palabra (`\b`) porque sin ellos "sino" matchea adentro de "asimismo" y
 * "significa" adentro de cualquier cosa que termine en -fica.
 */
export const CONECTORES = Object.freeze([
  'porque', 'por eso', 'es decir', 'o sea', 'de modo que', 'así que', 'de manera que',
  'significa', 'quiere decir', 'tener en cuenta', 'hay que', 'hace falta', 'sirve para',
  'no es', 'no son', 'no compara', 'no incluye', 'aclaraci[óo]n', 'nota', 'ojo',
  'recordar', 'atenci[óo]n', 'mientras tanto', 'a diferencia de', 'salvo que', 'sin m[áa]s',
])

const RE_CONECTOR = new RegExp(`\\b(${CONECTORES.join('|')})\\b`, 'iu')

/** Cuántas palabras de verdad tiene un texto (dos letras o más: descarta separadores y símbolos). */
const palabras = (t) => (String(t).match(/\p{L}{2,}/gu) ?? []).length

/**
 * NÚCLEO PURO: UN TÍTULO DE SECCIÓN, PARTIDO EN LO QUE NOMBRA Y LO QUE GLOSA.
 *
 * ═══ LA REGLA QUE FALTABA, Y POR QUÉ SE PARTE EN DOS (05/09/2026) ═══
 *
 * Bajo «minimalismo extremo» un título PUEDE NOMBRAR SU BLOQUE Y NO PUEDE ARGUMENTAR SOBRE ÉL.
 * Nombrar un bloque de esta empresa no entra en sesenta caracteres: «3.7 · Quattropani - Melisa
 * García SAS — SALÓN COMERCIAL · 18/08 → 30/10» son 71 y no sobra una palabra — el cliente, el tipo
 * de obra y el plazo son la identidad del bloque, no una explicación de lo que hay adentro.
 *
 * Medido contra el archivo, el detector marcaba CATORCE títulos de sección como prosa por pasar el
 * tope, y uno («6 · LO QUE HAY QUE CORREGIR EN COMPRAS», 38 caracteres) como explicación porque
 * «hay que» está en la lista de conectores. Ninguno de los quince argumenta nada.
 *
 * El corte es el guion largo: lo de la IZQUIERDA es el NOMBRE del bloque y no se juzga; lo de la
 * DERECHA es la glosa, y la glosa se juzga con las mismas dos varas que cualquier otra celda. No
 * hace falta un umbral nuevo —dos números para la misma idea es cómo se pierde el criterio—: con el
 * tope de siempre aplicado a la glosa pasan los catorce títulos legítimos y siguen cayendo los tres
 * que de verdad explican, entre ellos «6 · LO QUE ARCA REGISTRÓ — la plomería, no es para leer».
 *
 * @param {string} texto
 * @returns {null|{nombre:string, glosa:string}} null si la celda no es un título de sección
 */
export function partesDeTitulo(texto) {
  const t = String(texto ?? '').trim()
  if (!ES_SECCION_NUM.test(t)) return null
  // El separador es el guion LARGO rodeado de espacios. El corto queda afuera a propósito: aparece
  // adentro de los nombres propios («Quattropani - Melisa García SAS») y partir ahí cortaría el
  // nombre del cliente al medio.
  const i = t.indexOf(' — ')
  return i < 0 ? { nombre: t, glosa: '' } : { nombre: t.slice(0, i), glosa: t.slice(i + 3).trim() }
}

/**
 * NÚCLEO PURO: ¿esta celda es una explicación y no un rótulo?
 *
 * Dos caminos, y basta uno:
 *   · LARGO — pasa el tope de un rótulo. No hace falta interpretarla: ocupa lugar de nota.
 *   · ARGUMENTO — trae un conector explicativo y al menos seis palabras. El piso de palabras existe
 *     porque un encabezado legítimo puede contener el conector suelto («Nota de crédito», «Notas»):
 *     con menos de seis palabras no hay argumento, hay rótulo.
 *
 * En un título de sección las dos varas se aplican a la GLOSA y no al renglón entero: ver
 * `partesDeTitulo`. `sobre` dice qué se juzgó, para que el hallazgo no muestre un texto distinto del
 * que midió.
 *
 * @param {unknown} celda el valor crudo de la celda (puede ser una fórmula: se mira lo que se VE)
 * @param {{tope?:number}} opciones
 * @returns {null|{clase:'larga'|'argumenta', largo:number, texto:string, sobre:'celda'|'glosa'}}
 */
export function esProsa(celda, { tope = TOPE_PROSA } = {}) {
  const visible = textoVisible(celda)
  if (!visible) return null
  const partes = partesDeTitulo(visible)
  if (partes) {
    // EL NOMBRE SE JUZGA SÓLO POR LARGO. Un nombre que no entra en el tope dejó de nombrar y empezó
    // a describir; pero un conector adentro de un nombre no es un argumento («LO QUE HAY QUE
    // CORREGIR EN COMPRAS» nombra un bloque, no explica nada).
    if (partes.nombre.length > tope) return { clase: 'larga', largo: partes.nombre.length, texto: partes.nombre, sobre: 'nombre' }
    if (!partes.glosa) return null
    return juzgar(partes.glosa, tope, 'glosa')
  }
  return juzgar(visible, tope, 'celda')
}

/** Las dos varas —largo y argumento— sobre un texto ya recortado a lo que hay que juzgar. */
function juzgar(t, tope, sobre) {
  if (t.length > tope) return { clase: 'larga', largo: t.length, texto: t, sobre }
  if (palabras(t) >= 6 && RE_CONECTOR.test(t)) return { clase: 'argumenta', largo: t.length, texto: t, sobre }
  return null
}

const LETRA = (n) => { let s = ''; for (let i = n; i >= 0; i = Math.floor(i / 26) - 1) s = String.fromCharCode(65 + (i % 26)) + s; return s }

/**
 * NÚCLEO PURO: TODA la prosa de la grilla, mire donde mire.
 *
 * Recorre el ancho entero y no la columna de concepto. Es la diferencia con `glosasLargas`, y es la
 * que importa: las doce glosas de "Proveedores" están en la C.
 *
 * La fila 2 se saltea SIEMPRE (es la línea de procedencia, que tiene su propia regla y su propio
 * tope) y la 1 también (es el nombre de la pestaña).
 *
 * @param {any[][]} filas la grilla leída de la pestaña
 * @param {{tope?:number, desde?:number}} opciones
 * @returns {{fila:number, col:string, clase:string, largo:number, texto:string}[]}
 */
export function prosaEnGrilla(filas = [], { tope = TOPE_PROSA, desde = 3 } = {}) {
  const out = []
  filas.forEach((f, i) => {
    if (i + 1 < desde) return
    ;(f || []).forEach((celda, j) => {
      const p = esProsa(celda, { tope })
      if (p) out.push({ fila: i + 1, col: LETRA(j), ...p })
    })
  })
  return out
}

/**
 * Normaliza para comparar el título contra el nombre de la pestaña: minúsculas y sin tildes.
 *
 * POR QUÉ NO SE COMPARA LITERAL (05/09). Con igualdad exacta, nueve de quince pestañas del alcance
 * daban `titulo-distinto` y ocho eran ruido: "Cargas sociales" contra "Cargas Sociales" (una
 * mayúscula) y "Tarjeta de crédito" contra "Tarjeta de Credito" (la tilde le falta AL NOMBRE DE LA
 * PESTAÑA, no al título). Un control con 8 de 9 falsos deja de mirarse, y el que sobra —"Servicios
 * recurrentes 2026" en una pestaña llamada "Recurrentes"— se pierde entre ellos.
 */
const normal = (s) => String(s).normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()

/** ¿La fila tiene contenido sólo en la columna A? */
const soloEnA = (f) => !(f || []).slice(1).some((c) => String(c ?? '').trim())

/** ¿El nombre del bloque —lo de la izquierda del guion largo— está en mayúsculas? */
function gritaComoTitulo(titulo) {
  const nombre = String(titulo ?? '').split(' — ')[0]
  const letras = nombre.match(/\p{L}/gu) ?? []
  return letras.length >= 3 && nombre.toLocaleUpperCase('es') === nombre
}

/**
 * NÚCLEO PURO: los números de bloque de primer nivel, en el orden en que aparecen.
 *
 * Sólo cuenta las filas donde el título está SOLO: un renglón de datos que empieza con «1 · algo»
 * no abre un bloque. Las sub-secciones (`N.M · …`) se ignoran a propósito: cuelgan de su madre.
 */
export function bloquesDe(filas = []) {
  const out = []
  filas.forEach((f, i) => {
    // ═══ POR QUÉ YA NO SE EXIGE QUE EL TÍTULO ESTÉ SOLO EN SU FILA (06/09/2026) ═══
    //
    // Se exigía, y el archivo lo desmintió. En «Recurrentes» la A4 dice «1 · EL GASTO RECURRENTE,
    // MES A MES» y la B4 arranca los doce encabezados de mes: el título comparte su renglón con la
    // cabecera del cuadro, que es exactamente como tiene que verse. Con `soloEnA` ese bloque no
    // existía, y los otros dos —numerados 2 y 3, sin un solo hueco— salían reportados como «es el
    // bloque 1º y está numerado 2». Dos desvíos falsos sobre una pestaña impecable.
    //
    // LA SEGUNDA PUERTA: EL TÍTULO GRITA. Un renglón de detalle numerado —«1 · una fila de detalle»,
    // con su importe al lado— sigue sin abrir bloque, que es la razón por la que existía `soloEnA`.
    // Lo que las separa no es estar solo en la fila: es que en este archivo TODOS los títulos de
    // primer nivel van en mayúsculas y ninguna fila de datos lo está.
    // EL TÍTULO SE LEE COMO LO VE EL LECTOR, NO COMO ESTÁ ESCRITO. Medido el 06/09 en «OBRAS»: el
    // bloque 1 es `="1 · COBRANZAS PENDIENTES AL "&TEXT(TODAY();"dd/mm/yyyy")` —el corte va adentro
    // del título y por eso es fórmula—, y esta función lo leía crudo. Con el `=` adelante no matchea
    // `ES_SECCION_NUM`, así que el bloque 1 no existía para el control y los otros cuatro quedaban
    // corridos un lugar: cuatro `numeracion-con-hueco` sobre una pestaña numerada 1,2,3,4,5 sin un
    // solo hueco. El resto del módulo ya leía con `textoVisible`; esta función se había quedado atrás.
    const m = textoVisible(f?.[0]).trim().match(ES_SECCION_NUM)
    if (!m || m[2] !== undefined) return
    if (!soloEnA(f) && !gritaComoTitulo(m[3])) return
    out.push({ fila: i + 1, n: Number(m[1]), titulo: m[3] })
  })
  return out
}

/**
 * NÚCLEO PURO: ¿la numeración de bloques es 1..N consecutiva?
 *
 * POR QUÉ ES UNA REGLA Y NO UN GUSTO: un cuadro que va «1, 2, 3, 4, 8, 9» le dice al lector que le
 * faltan cuatro bloques que en realidad nunca existieron. La skill lo pide explícito, y es el defecto
 * que aparece solo cada vez que se saca un bloque y nadie renumera.
 *
 * @returns {{n:number, fila:number, detalle:string}[]} un hallazgo por bloque fuera de lugar
 */
export function numeracionRota(filas = []) {
  const bloques = bloquesDe(filas)
  const mal = []
  bloques.forEach((b, i) => {
    if (b.n !== i + 1) mal.push({ n: b.n, fila: b.fila, detalle: `es el bloque ${i + 1}º y está numerado ${b.n}` })
  })
  return mal
}

/**
 * NÚCLEO PURO: el encabezado de tres filas.
 *
 * @returns {{fila:number, regla:string, detalle:string}[]}
 */
export function encabezadoRoto(filas = [], { pestana = '' } = {}) {
  const mal = []
  // Por lo mismo que en `bloquesDe`: el nombre de la pestaña se compara con lo que se VE. Una A1
  // armada con fórmula —para que el título lleve su fecha de corte— no es un título distinto.
  const a1 = textoVisible(filas?.[0]?.[0]).trim()
  const restoF1 = (filas?.[0] ?? []).slice(1).some((c) => String(c ?? '').trim())
  const a2 = textoVisible(filas?.[1]?.[0])
  const f3 = (filas?.[2] ?? []).some((c) => String(c ?? '').trim())

  if (!a1) mal.push({ fila: 1, regla: 'sin-titulo', detalle: 'A1 vacía: la pestaña no dice cómo se llama' })
  else if (pestana && !normal(a1).startsWith(normal(pestana))) {
    mal.push({ fila: 1, regla: 'titulo-distinto', detalle: `A1 dice "${a1}" y la pestaña se llama "${pestana}": el lector tiene dos nombres para lo mismo` })
  } else if (pestana && normal(a1) !== normal(pestana)) {
    mal.push({ fila: 1, regla: 'titulo-con-glosa', detalle: `A1 agrega "${a1.slice(pestana.length).trim()}": eso es la línea de procedencia y va en A2` })
  }
  if (restoF1) mal.push({ fila: 1, regla: 'titulo-acompanado', detalle: 'la fila del título tiene algo más al lado: el título va solo' })
  if (!a2) mal.push({ fila: 2, regla: 'sin-procedencia', detalle: 'A2 vacía: falta la línea «qué contesta · fuente · corte»' })
  else if (a2.length > TOPE_SUBTITULO) mal.push({ fila: 2, regla: 'procedencia-larga', detalle: `${a2.length} caracteres (tope ${TOPE_SUBTITULO}): dejó de declarar y empezó a explicar` })
  else if (palabras(a2) >= 6 && RE_CONECTOR.test(a2)) mal.push({ fila: 2, regla: 'procedencia-explica', detalle: `argumenta en vez de declarar: "${a2.slice(0, 60)}"` })
  if (f3) mal.push({ fila: 3, regla: 'sin-respiro', detalle: 'la fila 3 tiene contenido: el encabezado se come el primer bloque' })
  return mal
}

/**
 * EL VEREDICTO DE UNA PESTAÑA CONTRA EL CONTRATO. Núcleo puro: no toca la red.
 *
 * @param {any[][]} filas
 * @param {{pestana?:string, tope?:number}} opciones
 * @returns {{fila:number, col?:string, regla:string, detalle:string}[]}
 */
export function auditarDiseno(filas = [], { pestana = '', tope = TOPE_PROSA } = {}) {
  if (!enAlcance(pestana)) return []
  return [
    ...encabezadoRoto(filas, { pestana }),
    ...numeracionRota(filas).map((x) => ({ fila: x.fila, regla: 'numeracion-con-hueco', detalle: x.detalle })),
    ...prosaEnGrilla(filas, { tope }).map((p) => ({
      fila: p.fila,
      col: p.col,
      regla: reglaDeProsa(p),
      detalle: `${p.largo} car. — "${p.texto.slice(0, 70)}"`,
    })),
  ]
}

/**
 * Cómo se llama el desvío según QUÉ se juzgó. Un título que argumenta y una glosa suelta a mitad de
 * la grilla no se arreglan igual: el primero se recorta, la segunda se borra.
 */
function reglaDeProsa(p) {
  if (p.sobre === 'nombre') return 'titulo-largo'
  if (p.sobre === 'glosa') return 'titulo-argumenta'
  return p.clase === 'larga' ? 'prosa' : 'explicacion'
}

/** Agrupa los hallazgos por regla, con un ejemplo cada uno. Para imprimir sin inundar la consola. */
export function resumen(hallazgos = []) {
  const m = new Map()
  for (const h of hallazgos) {
    if (!m.has(h.regla)) m.set(h.regla, { regla: h.regla, n: 0, ejemplo: h })
    m.get(h.regla).n++
  }
  return [...m.values()].sort((a, b) => b.n - a.n)
}
