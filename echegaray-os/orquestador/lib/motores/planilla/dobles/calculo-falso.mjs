// UN EVALUADOR DE FÓRMULAS MÍNIMO — PARA LOS DOBLES, NO PARA PRODUCCIÓN.
//
// ═══ POR QUÉ EXISTE Y POR QUÉ ES CHIQUITO ═══
//
// El motor promete que una fórmula escrita ATERRIZA y CALCULA: no alcanza con que el texto vuelva
// igual, porque una fórmula perfecta que devuelve #REF! es una escritura fallida. Para probar esa
// promesa sin tocar Google hace falta algo que, del otro lado, de verdad calcule.
//
// Es deliberadamente pobre: suma, resta, multiplica, divide, resuelve referencias y rangos, y
// conoce seis funciones. NO es una reimplementación de Sheets y no debe crecer para serlo — si un
// test necesita `QUERY` o `ARRAYFORMULA`, ese test tiene que correr contra Google, no contra esto.
// Un doble que intenta ser fiel al original termina teniendo sus propios bugs y probando los bugs
// del doble.
//
// ACEPTA `,` Y `;` COMO SEPARADOR. No es tolerancia: es el punto. `google.mjs` convierte la fórmula
// canónica a es-AR antes de mandarla, y si el doble sólo entendiera comas, la conversión que la
// producción SÍ hace rompería todos los tests — que es exactamente al revés de lo que se quiere.

/** Los errores que este doble sabe producir. Los mismos textos que devuelve Sheets. */
export const ERR = Object.freeze({ REF: '#REF!', NOMBRE: '#NAME?', DIV0: '#DIV/0!', VALOR: '#VALUE!' })

const ES_ERROR = (v) => typeof v === 'string' && Object.values(ERR).includes(v)

/** Letra de columna → índice 0. Copia local a propósito: un doble no debe importar del módulo que
 *  está ayudando a probar, o un bug en `direcciones.mjs` se cancelaría solo. */
function col(letras) {
  let n = 0
  for (const c of letras.toUpperCase()) n = n * 26 + (c.charCodeAt(0) - 64)
  return n - 1
}

/** Trocea la fórmula (sin el `=`) en números, textos, referencias, funciones y símbolos. */
function tokenizar(src) {
  const t = []
  let i = 0
  while (i < src.length) {
    const c = src[i]
    if (/\s/.test(c)) { i++; continue }
    if (c === '"') {
      let j = i + 1
      while (j < src.length && src[j] !== '"') j++
      t.push({ t: 'txt', v: src.slice(i + 1, j) }); i = j + 1; continue
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1]))) {
      const m = /^[0-9]*[.,]?[0-9]+/.exec(src.slice(i))
      t.push({ t: 'num', v: Number(m[0].replace(',', '.')) }); i += m[0].length; continue
    }
    // Nombre de hoja citado: 'Panel Caja'!A1:B2
    const ref = /^('(?:[^']|'')*'|[A-Za-z_][A-Za-z0-9_]*)?!?\$?([A-Za-z]+)\$?([0-9]+)(?::\$?([A-Za-z]+)\$?([0-9]+))?/
      .exec(src.slice(i))
    if (ref && (ref[0].includes('!') || !/^[A-Za-z_]+\(/.test(src.slice(i)))) {
      const m = ref
      t.push({
        t: 'ref',
        hoja: m[1] ? m[1].replace(/^'|'$/g, '').replace(/''/g, "'") : null,
        a: { f: Number(m[3]) - 1, c: col(m[2]) },
        b: m[4] ? { f: Number(m[5]) - 1, c: col(m[4]) } : null,
      })
      i += m[0].length; continue
    }
    const fn = /^[A-Za-z_][A-Za-z0-9_.]*/.exec(src.slice(i))
    if (fn) { t.push({ t: 'fn', v: fn[0].toUpperCase() }); i += fn[0].length; continue }
    t.push({ t: 'sim', v: c }); i++
  }
  return t
}

/** Las funciones que el doble conoce. Cualquier otra devuelve `#NAME?`, que es lo que hace Sheets. */
const FUNCIONES = {
  SUM: (a) => a.reduce((x, y) => x + num(y), 0),
  SUMA: (a) => a.reduce((x, y) => x + num(y), 0),
  COUNT: (a) => a.filter((v) => typeof v === 'number').length,
  MAX: (a) => Math.max(...a.map(num)),
  MIN: (a) => Math.min(...a.map(num)),
  ROUND: (a) => Math.round(num(a[0]) * 10 ** num(a[1] ?? 0)) / 10 ** num(a[1] ?? 0),
  CONCAT: (a) => a.map((v) => String(v ?? '')).join(''),
}

const num = (v) => (typeof v === 'number' ? v : Number(String(v ?? '').replace(',', '.')) || 0)

/**
 * Evalúa una fórmula sobre una hoja.
 *
 * @param {string} formula con el `=` adelante
 * @param {(hoja:string|null, fila:number, col:number)=>unknown} leer resolvedor de celda
 * @param {string|null} hojaActual la hoja donde vive la fórmula (para las refs sin hoja)
 */
export function evaluar(formula, leer, hojaActual) {
  const tokens = tokenizar(String(formula).slice(1))
  let p = 0
  const fin = () => p >= tokens.length
  const ver = () => tokens[p]

  const resolverRef = (tk) => {
    const hoja = tk.hoja ?? hojaActual
    if (!tk.b) return leer(hoja, tk.a.f, tk.a.c)
    const out = []
    for (let f = tk.a.f; f <= tk.b.f; f++) {
      for (let c = tk.a.c; c <= tk.b.c; c++) out.push(leer(hoja, f, c))
    }
    return out
  }

  function primario() {
    const tk = ver()
    if (!tk) return ERR.VALOR
    if (tk.t === 'num' || tk.t === 'txt') { p++; return tk.v }
    if (tk.t === 'ref') { p++; return resolverRef(tk) }
    if (tk.t === 'sim' && tk.v === '(') { p++; const v = expresion(); if (ver()?.v === ')') p++; return v }
    if (tk.t === 'sim' && tk.v === '-') { p++; const v = primario(); return ES_ERROR(v) ? v : -num(v) }
    if (tk.t === 'fn') {
      p++
      if (ver()?.v !== '(') return ERR.NOMBRE
      p++
      const args = []
      while (!fin() && ver()?.v !== ')') {
        const v = expresion()
        if (Array.isArray(v)) args.push(...v); else args.push(v)
        if (ver()?.v === ',' || ver()?.v === ';') p++ // los DOS separadores: ver el encabezado
      }
      if (ver()?.v === ')') p++
      const err = args.find(ES_ERROR)
      if (err) return err
      const f = FUNCIONES[tk.v]
      return f ? f(args) : ERR.NOMBRE
    }
    p++
    return ERR.VALOR
  }

  function termino() {
    let a = primario()
    while (!fin() && (ver().v === '*' || ver().v === '/')) {
      const op = ver().v; p++
      const b = primario()
      if (ES_ERROR(a)) return a
      if (ES_ERROR(b)) return b
      if (op === '/' && num(b) === 0) return ERR.DIV0
      a = op === '*' ? num(a) * num(b) : num(a) / num(b)
    }
    return a
  }

  function expresion() {
    let a = termino()
    while (!fin() && (ver().v === '+' || ver().v === '-' || ver().v === '&')) {
      const op = ver().v; p++
      const b = termino()
      if (ES_ERROR(a)) return a
      if (ES_ERROR(b)) return b
      if (op === '&') a = `${a ?? ''}${b ?? ''}`
      else a = op === '+' ? num(a) + num(b) : num(a) - num(b)
    }
    return a
  }

  const v = expresion()
  return Array.isArray(v) ? (v[0] ?? '') : v
}
