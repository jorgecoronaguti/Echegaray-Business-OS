// LAS TRES CARAS DE UNA REGLA, EVALUADAS DE VERDAD.
//
// POR QUÉ EXISTE (13/08/2026). Cada regla de `rubro-caja.mjs` está escrita tres veces —en JS, en
// fórmula es-AR para la columna AC de Compras y en SQL para el núcleo Postgres— y las tres viven
// pegadas en el mismo objeto "a propósito, para que no puedan desincronizarse". Pero lo único que
// las mantenía juntas era la vista: los tests comparaban TEXTO (que el rubro aparezca en la
// fórmula, que el archivo generado coincida con el generador). Ninguno preguntaba lo único que
// importa — ¿las tres clasifican la MISMA fila en el MISMO rubro?
//
// El caso que lo destapó: al agregar 'mass consultora' y la excepción por unidad de obra hubo que
// escribir la condición tres veces con tres gramáticas distintas (`&&`/`*`/`and`, `!includes`/
// `<>`/`not in`, precedencias distintas). Un paréntesis de más en cualquiera de las tres pasa todos
// los tests de texto y hace que el cuadro del Sheet y el Libro digan cosas distintas de la misma
// plata, sin un solo error.
//
// LO QUE ESTE ARCHIVO ES Y LO QUE NO ES. Es un intérprete del SUBCONJUNTO chico de Sheets y de SQL
// que las reglas usan — suficiente para decidir verdadero/falso sobre una fila. No es un motor de
// planilla ni un Postgres: si aparece una función que no conoce, ROMPE con el texto que no entendió
// en vez de devolver `false`, que sería exactamente la forma de mentir que vino a evitar.
//
// NO NORMALIZA NADA. `LOWER()` y `lower()` bajan a minúsculas y no recortan espacios, igual que en
// Sheets y en Postgres. El `norm()` de JS SÍ recorta: esa diferencia es real y tiene que poder
// verse, no taparse acá.

/** Los rangos de Compras que las reglas leen, y a qué campo de la fila corresponden. */
const RANGOS_SHEET = {
  '$E$4:$E': 'proveedor',
  '$I$4:$I': 'unidad',
  '$J$4:$J': 'cliente',
  // El concepto en la planilla son DOS columnas concatenadas (K = concepto, L = detalle). La fila de
  // prueba trae el texto junto en `concepto`, así que K lo aporta entero y L queda vacía.
  '$K$4:$K': 'concepto',
  '$L$4:$L': null,
  '$O$4:$O': 'total',
}

/** Las columnas de costos_obra y el campo de la fila que representan. */
const COLS_SQL = { proveedor: 'proveedor', unidad_negocio: 'unidad', obra_texto: 'cliente', concepto: 'concepto' }

/** El centinela del `<>`: el NUL, el único carácter que ninguna fórmula del generador puede tener. */
const NE = '\u0000'

const celda = (fila, campo) => (campo === null ? '' : fila[campo] ?? '')
const bajar = (v) => String(v ?? '').toLowerCase()

/**
 * NÚCLEO PURO: evalúa la condición de un Sheet (la cara `sheet` de una regla) sobre una fila.
 *
 * Traduce a JavaScript conservando la precedencia —en Sheets, igual que en JS, `*` liga más que `+`
 * y los dos ligan más que la comparación—, así que `a*(b+c>0)>0` significa lo mismo en los dos.
 *
 * @param {string} expr condición en es-AR (separador ';')
 * @param {object} fila {proveedor, unidad, cliente, concepto, total}
 * @returns {boolean}
 */
export function evaluarSheet(expr, fila = {}) {
  // Los literales salen PRIMERO y viajan aparte: si se los volviera a escribir dentro del código
  // generado, el `\.` de "sanitarios od s\.a\.s\." se leería como un punto cualquiera y el regex
  // pasaría a aceptar cualquier carácter — el test daría verde por el motivo equivocado.
  const literales = []
  let src = String(expr).replace(/"([^"]*)"/g, (_, s) => `S[${literales.push(s) - 1}]`)
  for (const [rango, campo] of Object.entries(RANGOS_SHEET)) {
    src = src.split(rango).join(`C(${JSON.stringify(campo)})`)
  }
  const resto = src.match(/\$[A-Z]+\$?\d*(:\$?[A-Z]+)?/)
  if (resto) throw new Error(`regla-tres-caras: rango de Sheet que no conozco: ${resto[0]}`)
  // El `<>` se aparta con un centinela ANTES de duplicar los `=`: traducido a `!=` de una, el paso
  // siguiente lo convertiría en `!==` y la comparación cambiaría de sentido en silencio.
  src = src.replace(/<>/g, NE).replace(/=/g, '==').split(NE).join('!=')
    .replace(/&/g, '+').replace(/;/g, ',')
  const fn = new Function('C', 'S', 'LOWER', 'REGEXMATCH', 'N', `return (${src})`)
  return Boolean(fn(
    (campo) => celda(fila, campo),
    literales,
    bajar,
    (texto, patron) => new RegExp(patron).test(String(texto)),
    (v) => (typeof v === 'number' ? v : 0),
  ))
}

/** Parte el SQL en símbolos: paréntesis, comas, operadores, literales entre comillas y palabras. */
function tokenizar(sql) {
  const out = []
  let i = 0
  while (i < sql.length) {
    const c = sql[i]
    if (/\s/.test(c)) { i++; continue }
    if ('(),~='.includes(c)) { out.push({ t: c }); i++; continue }
    if (c === "'") {
      let j = i + 1, s = ''
      while (j < sql.length && !(sql[j] === "'" && sql[j + 1] !== "'")) {
        if (sql[j] === "'") { s += "'"; j += 2; continue }
        s += sql[j]; j++
      }
      out.push({ t: 'str', v: s }); i = j + 1; continue
    }
    const m = /^[A-Za-z_][A-Za-z_0-9]*/.exec(sql.slice(i))
    if (!m) throw new Error(`regla-tres-caras: SQL que no entiendo: "${sql.slice(i, i + 24)}"`)
    out.push({ t: 'id', v: m[0].toLowerCase() }); i += m[0].length
  }
  return out
}

/**
 * NÚCLEO PURO: evalúa la condición SQL (la cara `sql` de una regla) sobre una fila.
 *
 * Gramática soportada, que es toda la que las reglas usan:
 *   cond  := cond ('and'|'or') cond | '(' cond ')' | comp
 *   comp  := lower(coalesce(col, '')) ('=' str | '~' str | 'not' 'in' '(' str, … ')')
 *
 * @param {string} expr condición SQL
 * @param {object} fila {proveedor, unidad, cliente, concepto}
 * @returns {boolean}
 */
export function evaluarSql(expr, fila = {}) {
  const tk = tokenizar(String(expr))
  let p = 0
  const ver = () => tk[p]
  const comer = (t, v) => {
    const x = tk[p++]
    if (!x || x.t !== t || (v !== undefined && x.v !== v)) {
      throw new Error(`regla-tres-caras: esperaba ${v ?? t} y vino ${JSON.stringify(x)}`)
    }
    return x
  }
  const operando = () => {
    comer('id', 'lower'); comer('('); comer('id', 'coalesce'); comer('(')
    const col = comer('id').v
    comer(','); comer('str'); comer(')'); comer(')')
    if (!(col in COLS_SQL)) throw new Error(`regla-tres-caras: columna SQL que no conozco: ${col}`)
    return bajar(celda(fila, COLS_SQL[col]))
  }
  const comparacion = () => {
    const izq = operando()
    if (ver()?.t === '=') { p++; return izq === comer('str').v }
    if (ver()?.t === '~') { p++; return new RegExp(comer('str').v).test(izq) }
    comer('id', 'not'); comer('id', 'in'); comer('(')
    const vals = [comer('str').v]
    while (ver()?.t === ',') { p++; vals.push(comer('str').v) }
    comer(')')
    return !vals.includes(izq)
  }
  const primaria = () => {
    if (ver()?.t === '(') { p++; const v = disyuncion(); comer(')'); return v }
    return comparacion()
  }
  // Los dos operadores CONSUMEN siempre, aunque el resultado ya esté decidido: `x && primaria()`
  // se saltearía el parseo del lado derecho y el resto de la expresión quedaría sin leer.
  // El `and` liga más fuerte que el `or`, igual que en Postgres: sin eso, `a and b or c` se leería
  // `a and (b or c)` y la regla de recurrentes —que es exactamente esa forma— cambiaría de sentido.
  const conjuncion = () => {
    let v = primaria()
    while (ver()?.t === 'id' && ver().v === 'and') { p++; v = primaria() && v }
    return v
  }
  function disyuncion() {
    let v = conjuncion()
    while (ver()?.t === 'id' && ver().v === 'or') { p++; v = conjuncion() || v }
    return v
  }
  const r = disyuncion()
  if (p !== tk.length) throw new Error(`regla-tres-caras: sobró SQL sin consumir en "${expr}"`)
  return r
}

/**
 * NÚCLEO PURO: el rubro de una fila según UNA de las tres caras, con el mismo orden de reglas que
 * `rubroDeCaja()` — la primera que matchea gana. Sin esto la comparación probaría la condición
 * suelta y no lo que el Sheet y la base efectivamente escriben, que depende del orden.
 *
 * @param {Array} reglas REGLAS de rubro-caja.mjs
 * @param {'js'|'sheet'|'sql'} cara
 * @param {object} fila
 * @param {string} sinClasificar el rubro de descarte
 */
export function rubroSegun(reglas, cara, fila, sinClasificar) {
  const evaluar = {
    js: (r) => Boolean(r.js(fila)),
    sheet: (r) => evaluarSheet(r.sheet, fila),
    sql: (r) => evaluarSql(r.sql, fila),
  }[cara]
  if (!evaluar) throw new Error(`regla-tres-caras: no existe la cara "${cara}"`)
  for (const r of reglas) if (evaluar(r)) return r.rubro
  return sinClasificar
}
