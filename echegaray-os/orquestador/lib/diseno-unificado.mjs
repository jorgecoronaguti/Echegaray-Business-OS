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
 * NÚCLEO PURO: ¿esta celda es una explicación y no un rótulo?
 *
 * Dos caminos, y basta uno:
 *   · LARGO — pasa el tope de un rótulo. No hace falta interpretarla: ocupa lugar de nota.
 *   · ARGUMENTO — trae un conector explicativo y al menos seis palabras. El piso de palabras existe
 *     porque un encabezado legítimo puede contener el conector suelto («Nota de crédito», «Notas»):
 *     con menos de seis palabras no hay argumento, hay rótulo.
 *
 * @param {unknown} celda el valor crudo de la celda (puede ser una fórmula: se mira lo que se VE)
 * @param {{tope?:number}} opciones
 * @returns {null|{clase:'larga'|'argumenta', largo:number, texto:string}}
 */
export function esProsa(celda, { tope = TOPE_PROSA } = {}) {
  const t = textoVisible(celda)
  if (!t) return null
  if (t.length > tope) return { clase: 'larga', largo: t.length, texto: t }
  if (palabras(t) >= 6 && RE_CONECTOR.test(t)) return { clase: 'argumenta', largo: t.length, texto: t }
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

/** ¿La fila tiene contenido sólo en la columna A? Un título ocupa su fila solo. */
const soloEnA = (f) => !(f || []).slice(1).some((c) => String(c ?? '').trim())

/**
 * NÚCLEO PURO: los números de bloque de primer nivel, en el orden en que aparecen.
 *
 * Sólo cuenta las filas donde el título está SOLO: un renglón de datos que empieza con «1 · algo»
 * no abre un bloque. Las sub-secciones (`N.M · …`) se ignoran a propósito: cuelgan de su madre.
 */
export function bloquesDe(filas = []) {
  const out = []
  filas.forEach((f, i) => {
    if (!soloEnA(f)) return
    const m = String(f?.[0] ?? '').trim().match(ES_SECCION_NUM)
    if (m && m[2] === undefined) out.push({ fila: i + 1, n: Number(m[1]), titulo: m[3] })
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
  const a1 = String(filas?.[0]?.[0] ?? '').trim()
  const restoF1 = (filas?.[0] ?? []).slice(1).some((c) => String(c ?? '').trim())
  const a2 = textoVisible(filas?.[1]?.[0])
  const f3 = (filas?.[2] ?? []).some((c) => String(c ?? '').trim())

  if (!a1) mal.push({ fila: 1, regla: 'sin-titulo', detalle: 'A1 vacía: la pestaña no dice cómo se llama' })
  else if (pestana && a1 !== pestana) mal.push({ fila: 1, regla: 'titulo-distinto', detalle: `A1 dice "${a1}" y la pestaña se llama "${pestana}"` })
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
      regla: p.clase === 'larga' ? 'prosa' : 'explicacion',
      detalle: `${p.largo} car. — "${p.texto.slice(0, 70)}"`,
    })),
  ]
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
