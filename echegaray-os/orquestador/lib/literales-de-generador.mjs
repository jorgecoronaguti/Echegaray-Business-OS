// QUÉ TEXTO MANDA UN GENERADOR A UNA CELDA — LEÍDO DE SU CÓDIGO, SIN TOCAR LA RED.
//
// ═══ POR QUÉ EXISTE (06/09/2026) ═══
//
// `auditar-diseno-unificado.mjs` mide el contrato contra el archivo VIVO, y ésa es su virtud: dice
// lo que el lector ve hoy. Pero llega tarde para el trabajo de sacar la prosa, porque entre el
// commit que la saca del generador y el Sheet que deja de mostrarla hay una corrida del pipeline que
// desde un worktree no se puede hacer —y no se debe: este repositorio ya perdió una pestaña entera
// por escribir el Sheet real desde un worktree—.
//
// Sin este módulo la única verificación disponible es «lo saqué del código y confío». El test de
// «Plantel» resolvió lo mismo con un regex propio (`literalesDePlantel`), y ahí está el problema que
// esto viene a cerrar: ese regex captura UN literal por llamada, así que
//
//     fila('Neto acordado de 1.800.000 para CADA UNO. '
//       + 'Por banco va lo que dice su recibo y el efectivo COMPLETA hasta ese neto.')
//
// se mide como 38 caracteres cuando el lector ve 140. Un control que juzga la primera línea de un
// párrafo de tres da verde sobre exactamente el defecto que busca. Acá se concatenan las partes,
// que es lo que la celda va a mostrar.
//
// LO QUE ESTE MÓDULO **NO** HACE: ejecutar el generador. No sabe cuántas filas va a emitir, ni si
// una rama se toma; sabe qué textos PUEDE escribir. Para el contrato de prosa alcanza y sobra: un
// párrafo que el código puede emitir es un párrafo que algún día se publica.

/**
 * Recorre el código y aplica `fn(estado)` fuera de comentarios y de literales.
 *
 * Un escáner y no un regex porque las tres cosas que hay que distinguir —comentario, cadena y
 * template con `${}` adentro— se anidan entre sí, y un regex que las mezcla borra medio archivo. El
 * caso real: los comentarios de este repositorio están en castellano y traen comillas simples
 * («no borres mis ediciones»), así que cortar por comilla sin saber si se está adentro de un
 * comentario deja el escáner desfasado desde la primera línea.
 *
 * @param {string} src
 * @param {(i:number, c:string) => void} visitar se llama en cada carácter de CÓDIGO
 */
function recorrerCodigo(src, visitar) {
  const pila = []                        // los `${` abiertos dentro de templates
  let i = 0
  while (i < src.length) {
    const c = src[i]
    const d = src[i + 1]
    if (c === '/' && d === '/') { while (i < src.length && src[i] !== '\n') i++; continue }
    if (c === '/' && d === '*') { i = src.indexOf('*/', i + 2); i = i < 0 ? src.length : i + 2; continue }
    if (c === "'" || c === '"') { i = finDeCadena(src, i, c); continue }
    if (c === '`') { i = finDeTemplate(src, i, pila); continue }
    visitar(i, c)
    i++
  }
}

/** El índice DESPUÉS de la cadena que abre en `i` con la comilla `q`. */
function finDeCadena(src, i, q) {
  let j = i + 1
  while (j < src.length && src[j] !== q) { if (src[j] === '\\') j++; j++ }
  return j + 1
}

/**
 * El índice DESPUÉS del template que abre en `i`.
 *
 * Los `${…}` se saltan enteros y con su propio balanceo: adentro puede haber otro template (pasa en
 * este repositorio: `${x.map((d) => `${d.etiqueta} ${d.horas} h`).join(' · ')}`), y cortar en la
 * primera llave cerrada partiría la expresión al medio.
 */
function finDeTemplate(src, i, pila) {
  let j = i + 1
  while (j < src.length) {
    if (src[j] === '\\') { j += 2; continue }
    if (src[j] === '`') return j + 1
    if (src[j] === '$' && src[j + 1] === '{') {
      let n = 1
      j += 2
      while (j < src.length && n > 0) {
        if (src[j] === '`') { j = finDeTemplate(src, j, pila); continue }
        if (src[j] === "'" || src[j] === '"') { j = finDeCadena(src, j, src[j]); continue }
        if (src[j] === '{') n++
        if (src[j] === '}') n--
        j++
      }
      continue
    }
    j++
  }
  return j
}

/**
 * El código de cada llamada a `nombre(...)`, con los paréntesis balanceados y sin el `nombre(`.
 *
 * @param {string} src
 * @param {string} nombre
 * @returns {string[]}
 */
export function llamadasA(src, nombre) {
  const abre = []
  const out = []
  // El nombre se busca MIRANDO ATRÁS desde el paréntesis y no adelante desde el nombre: así hay un
  // solo push por paréntesis y la pila no se desfasa. `[ \t]*` en lugar de `\s*` a propósito — con
  // el salto de línea adentro, un comentario que termine en la palabra «fila» abriría una llamada
  // que no existe, y este repositorio comenta en castellano.
  const re = new RegExp(`(?<![\\w$.])${nombre}[ \\t]*$`)
  recorrerCodigo(src, (i, c) => {
    if (c === '(') abre.push(re.test(src.slice(Math.max(0, i - nombre.length - 8), i)) ? i + 1 : -1)
    else if (c === ')') { const a = abre.pop(); if (a > 0) out.push(src.slice(a, i)) }
  })
  return out
}

/** El primer argumento de una lista: se corta en la coma de nivel cero. */
export function primerArgumento(codigo) {
  let corte = codigo.length
  let n = 0
  recorrerCodigo(codigo, (i, c) => {
    if (corte < codigo.length) return
    if (c === '(' || c === '[' || c === '{') n++
    else if (c === ')' || c === ']' || c === '}') n--
    else if (c === ',' && n === 0) corte = i
  })
  return codigo.slice(0, corte)
}

/**
 * EL TEXTO QUE LA CELDA VA A MOSTRAR: todos los literales de la expresión, pegados en orden.
 *
 * Las interpolaciones se reemplazan por un dígito y no se borran, por dos razones que costaron
 * hallazgos falsos en las dos direcciones: borrarlas pega las palabras de los dos lados y fabrica
 * conectores que nadie escribió; dejarlas como `${…}` suma seis caracteres de sintaxis a un largo
 * que se compara contra un tope.
 */
export function textoDeCelda(codigo) {
  const partes = []
  let i = 0
  const src = String(codigo ?? '')
  while (i < src.length) {
    const c = src[i]
    const d = src[i + 1]
    if (c === '/' && d === '/') { while (i < src.length && src[i] !== '\n') i++; continue }
    if (c === '/' && d === '*') { i = src.indexOf('*/', i + 2); i = i < 0 ? src.length : i + 2; continue }
    if (c === "'" || c === '"') { const j = finDeCadena(src, i, c); partes.push(src.slice(i + 1, j - 1)); i = j; continue }
    if (c === '`') {
      const j = finDeTemplate(src, i, [])
      partes.push(src.slice(i + 1, j - 1).replace(/\$\{(?:[^{}]|\{[^{}]*\})*\}/gs, '0'))
      i = j
      continue
    }
    i++
  }
  return envolver(src, partes.join('').replace(/\\n/g, ' ').trim())
}

/**
 * LO QUE EL HELPER LE AGREGA AL TEXTO ANTES DE LLEGAR A LA CELDA.
 *
 * `seccion`, `sub` y `total` (lib/patron-pestana.mjs) no son decoración: el `N · ` de un título es
 * lo que hace que el contrato lo juzgue como TÍTULO —nombre a la izquierda del guion largo, glosa a
 * la derecha— y no como una celda cualquiera. Un extractor que devuelve el texto pelado le hace
 * medir a `esProsa` algo que nunca se escribe, y falla en las dos direcciones: marca títulos
 * legítimos y deja pasar glosas.
 *
 * El número de sección se pone en 1 porque el extractor no ejecuta nada: acá se juzga el TEXTO, y la
 * numeración consecutiva la mide `numeracionRota` sobre la grilla real.
 */
function envolver(expresion, texto) {
  const e = expresion.trimStart()
  if (!texto) return texto
  if (/^seccion\s*\(/.test(e)) return `1 · ${texto.toUpperCase()}`
  if (/^sub\s*\(/.test(e)) return `   · ${texto}`
  if (/^(?:rotulo)?[Tt]otal\s*\(/.test(e)) return `⇒ ${texto}`
  return texto
}

/**
 * LOS TEXTOS QUE UN GENERADOR MANDA A LA PRIMERA COLUMNA, en el tramo que se le pida.
 *
 * `desde`/`hasta` son marcadores del propio código —el comentario que abre el bloque de una
 * pestaña—, no números de línea: un generador que escribe DOS pestañas (`Nómina` y `Plantel` salen
 * del mismo archivo) necesita que el test sepa dónde termina una.
 *
 * @param {string} fuente el código del generador
 * @param {{fn?:string, desde?:string, hasta?:string}} opciones
 * @returns {string[]}
 */
export function textosDeColumnaA(fuente, { fn = 'fila', desde, hasta } = {}) {
  let src = String(fuente ?? '')
  if (desde) { const i = src.indexOf(desde); if (i >= 0) src = src.slice(i) }
  if (hasta) { const i = src.indexOf(hasta); if (i >= 0) src = src.slice(0, i) }
  return llamadasA(src, fn)
    .map((c) => textoDeCelda(primerArgumento(c)))
    .filter(Boolean)
}
