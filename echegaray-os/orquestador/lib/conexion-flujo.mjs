// ¿ESTÁ CADA PESTAÑA ATADA A SU FUENTE, O ES UNA ISLA CON NÚMEROS PEGADOS?
//
// NÚCLEO PURO del mapa de conexión del Flujo de Fondos. No lee el archivo ni la red: recibe texto de
// fórmulas y devuelve estructura. El que lee es `scripts/auditar-conexion-flujo.mjs`.
//
// POR QUÉ EXISTE (13/08/2026). El pedido del dueño fue: *"todo el sheet flujo de fondos tiene q estar
// conectado entre si y con carpetas, sheets y apis q lo alimentan"*. Hasta hoy el archivo tenía tres
// controles que miran cada uno una parte y ninguno el conjunto:
//
//   · `auditar-duenos-pestanas.mjs`  → QUIÉN escribe cada pestaña (el registro de pasos).
//   · `censo-numeros-pegados.mjs`    → cuántos números están pegados en las 14 pestañas del formateador.
//   · `auditar-rangos-fosilizados.mjs` → si un rango con nombre apunta a celdas vacías.
//
// Lo que NINGUNO contesta es la pregunta del dueño: **hacia dónde apunta cada pestaña**. Sin el grafo
// no se puede ver una pestaña huérfana (nadie la cita y no cita a nadie) ni una referencia rota, que
// son los dos modos en que una pestaña deja de ser parte del sistema sin dar un solo error visible.
// `_MOVIMIENTOS` es el precedente caro: existía, tenía generador, nadie lo corría, y los dos cash
// flows recalcularon una semana entera sobre un libro viejo.
//
// LO QUE ESTE MÓDULO **NO** DECIDE. El veredicto celda por celda de la regla de oro sigue siendo de
// `censo-numeros-pegados.mjs`, que lee la grilla con su formato de número y sabe distinguir un dato
// de ORIGEN declarado de un cálculo pegado. Acá se mide VITALIDAD —qué proporción de lo que hay es
// fórmula— y se localizan los BLOQUES de importes pegados. Una capacidad, una fuente.

/** Los literales de texto de una fórmula, en blanco: adentro hay comas, `!` y palabras que no son
 *  referencias. La `QUERY("select A;B")` del libro engañaba a cualquier regex que no los sacara. */
const RE_TEXTO = /"(?:[^"]|"")*"/g
/** Los valores de error (`#REF!`, `#N/A`, `#NAME?`). Sin sacarlos, la `N` de `#N/A` se leía como
 *  rango con nombre inexistente y toda pestaña con un error salía con referencias rotas de más. */
const RE_ERROR = /#[A-Za-z]+(?:\/[A-Za-z0-9]+)*[!?]?/g
const RE_IMPORTRANGE = /IMPORTRANGE\s*\(\s*"([^"]+)"/gi
const RE_PESTANA_CITADA = /'((?:[^']|'')+)'!/g
/** Pestaña sin comillas: sólo puede serlo si el carácter previo no es parte de un identificador ni
 *  un `#` (que sería un valor de error). */
const RE_PESTANA_SUELTA = /(^|[^A-Za-z0-9_!$#À-ɏ])([A-Za-z_À-ɏ][A-Za-z0-9_À-ɏ]*)!/g
const RE_TOKEN = /[A-Za-z_À-ɏ][A-Za-z0-9_À-ɏ]*/g
const RESERVADAS = new Set(['TRUE', 'FALSE', 'VERDADERO', 'FALSO'])

const blancos = (n) => ' '.repeat(n)

/** Los literales de texto reemplazados por espacios, conservando las posiciones. */
export function sinTextos(formula) {
  return String(formula ?? '').replace(RE_TEXTO, (m) => blancos(m.length))
}

/** ¿El token es una referencia de celda (`A1`, `BH90`)? Se evalúa DESPUÉS de sacar los `$`. */
export function esRefCelda(t) { return /^[A-Za-z]{1,3}\d{1,7}$/.test(t) }

/**
 * Los nombres LOCALES que define un `LET(...)`.
 *
 * POR QUÉ HACE FALTA. `LET(pend; ...; pend*1,21)` define `pend` adentro de la fórmula. Sin esto,
 * cada variable de cada LET se reportaba como "rango con nombre que no existe" — un informe con
 * decenas de hallazgos falsos no lo lee nadie, y ahí adentro se pierde el hallazgo real.
 */
export function nombresLocalesLET(formula) {
  const s = sinTextos(formula)
  const out = new Set()
  for (let i = 0; i < s.length; i++) {
    if (!/^LET\s*\(/i.test(s.slice(i, i + 6))) continue
    if (i > 0 && /[A-Za-z0-9_]/.test(s[i - 1])) continue
    const abre = s.indexOf('(', i)
    let prof = 1, arg = 0, ini = abre + 1
    for (let k = abre + 1; k < s.length && prof > 0; k++) {
      const c = s[k]
      if (c === '(') prof++
      else if (c === ')') { prof--; continue }
      else if ((c === ';' || c === ',') && prof === 1) {
        // Los argumentos PARES de LET son los nombres; los impares, su valor. El último es el cuerpo.
        if (arg % 2 === 0) {
          const t = s.slice(ini, k).trim()
          if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(t)) out.add(t)
        }
        arg++
        ini = k + 1
      }
    }
  }
  return out
}

/**
 * Los tokens de un texto de fórmula ya limpio que son CANDIDATOS a rango con nombre.
 *
 * Se descarta lo que demostrablemente no lo es: función (le sigue un paréntesis), referencia de
 * celda, letra de columna de un rango abierto (`A:A`), y las constantes booleanas.
 *
 * LÍMITE DECLARADO: un nombre con forma de celda (`IVA1`) es indistinguible de una referencia por
 * texto. En este archivo los nombres llevan guion bajo (`CAJA_TOTAL_DISPONIBLE`, `ANEXO_*`), así que
 * el caso no aparece — pero si algún día aparece, este control lo va a pasar por alto en silencio.
 */
export function tokensDeNombre(texto) {
  // El `$` se BORRA, no se blanquea: `$A$1` con espacios queda `A 1` y `A` sola parecería un rango
  // con nombre. Es la misma trampa que el `#N/A` — el ruido de la sintaxis inventa hallazgos.
  const s = String(texto ?? '').replace(RE_ERROR, (m) => blancos(m.length)).replace(/\$/g, '')
  const out = new Set()
  for (const m of s.matchAll(RE_TOKEN)) {
    const t = m[0]
    const antes = s[m.index - 1] ?? ''
    const despues = s[m.index + t.length] ?? ''
    const sigNoBlanco = (s.slice(m.index + t.length).match(/^\s*(\S)/) || [])[1] ?? ''
    if (/[A-Za-z0-9_]/.test(antes)) continue          // parte de otro token (`1E+10`)
    if (sigNoBlanco === '(') continue                  // es una función
    // FUNCIÓN CON PUNTO: `NETWORKDAYS.INTL(`, `SUMAR.SI`, `BUSCAR.V`. Un rango con nombre no puede
    // llevar punto, así que un token seguido de `.` es siempre la primera mitad de una función.
    // Medido contra el archivo real: `NETWORKDAYS` salía como rango con nombre roto en 9 celdas de
    // "Jornales por Quincena" — un hallazgo falso arriba de todo, en el nivel más grave del informe.
    if (sigNoBlanco === '.') continue
    if (esRefCelda(t)) continue
    if (RESERVADAS.has(t.toUpperCase())) continue
    if (/^[A-Za-z]{1,3}$/.test(t) && (despues === ':' || antes === ':')) continue  // `A:A`
    out.add(t)
  }
  return [...out]
}

/** La clave del archivo destino de un IMPORTRANGE, venga como URL o como id pelado. */
export function claveDeImportrange(arg) {
  const m = String(arg ?? '').match(/\/spreadsheets\/d\/([A-Za-z0-9_-]+)/)
  return m ? m[1] : String(arg ?? '').trim()
}

/**
 * QUÉ CITA UNA FÓRMULA: pestañas, rangos con nombre, archivos externos y errores duros.
 * @returns {{pestanas:string[], nombres:string[], externas:string[], errores:string[]}}
 */
export function referenciasDeFormula(formula) {
  const bruta = String(formula ?? '')
  if (!bruta.startsWith('=')) return { pestanas: [], nombres: [], externas: [], errores: [] }
  const externas = [...bruta.matchAll(RE_IMPORTRANGE)].map((m) => claveDeImportrange(m[1]))
  // `#REF!` se cuenta ANTES de blanquear los errores: es el único que significa "acá había algo y
  // ya no está". Los demás (#N/A, #VALUE!) son estado de cálculo, no una referencia rota.
  const errores = (bruta.match(/#REF!/g) || [])
  const pestanas = new Set()
  let s = sinTextos(bruta)
  s = s.replace(RE_PESTANA_CITADA, (m, n) => { pestanas.add(n.replace(/''/g, "'")); return blancos(m.length) })
  s = s.replace(RE_PESTANA_SUELTA, (m, pre, n) => { pestanas.add(n); return pre + blancos(m.length - pre.length) })
  const locales = nombresLocalesLET(bruta)
  return {
    pestanas: [...pestanas],
    nombres: tokensDeNombre(s).filter((t) => !locales.has(t)),
    externas,
    errores,
  }
}

/**
 * QUÉ ES ESTA CELDA, leyendo las dos caras que devuelve la API.
 *
 * @param {unknown} cruda   lo que devolvió el render FORMULA (fórmula, número o texto literal)
 * @param {unknown} vista   lo que devolvió el render FORMATTED_VALUE (lo que se ve en pantalla)
 *
 * DERRAMADA: con render FORMULA una celda que produjo una ARRAYFORMULA/QUERY vecina vuelve VACÍA, y
 * con FORMATTED_VALUE vuelve llena. Confundirla con un número pegado es el error que hacía ver 5.593
 * números tipeados donde había un IMPORTRANGE — es tan viva como la fórmula que la derramó.
 */
export function clasificarCelda(cruda, vista) {
  const v = vista == null ? '' : String(vista).trim()
  if (typeof cruda === 'number') return pareceFecha(v) ? 'fecha' : 'pegado'
  const f = cruda == null ? '' : String(cruda)
  if (f.startsWith('=')) return 'formula'
  if (!f.trim()) return v ? 'derramada' : 'vacia'
  if (pareceFecha(f) || pareceFecha(v)) return 'fecha'
  return 'texto'
}

/** Un rótulo de período (`31/07/2026`) no es un importe pegado: escribir una fecha es declarar de qué
 *  período habla la columna. Contarlas tapaba las violaciones reales — lección de censo-numeros-pegados. */
export function pareceFecha(s) { return /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(String(s ?? '').trim()) }

export const VIVAS = new Set(['formula', 'derramada'])

/** Cuánto de lo que hay en la pestaña se recalcula solo. `pctViva` es sobre las celdas CON DATO. */
export function vitalidad(clases) {
  const c = { formula: 0, derramada: 0, pegado: 0, fecha: 0, texto: 0, vacia: 0 }
  for (const k of clases) c[k] = (c[k] ?? 0) + 1
  const conDato = c.formula + c.derramada + c.pegado + c.fecha + c.texto
  const vivas = c.formula + c.derramada
  return { ...c, conDato, vivas, pctViva: conDato ? Math.round((vivas / conDato) * 1000) / 10 : null }
}

export function colLetra(n) {
  let s = ''
  for (let i = n; i >= 0; i = Math.floor(i / 26) - 1) s = String.fromCharCode(65 + (i % 26)) + s
  return s
}

/**
 * LOS BLOQUES DE IMPORTES PEGADOS: corridas verticales de números literales en una misma columna.
 *
 * Un número pegado suelto puede ser cualquier cosa; **una columna de veinte importes seguidos donde
 * debería haber fórmula es un cuadro entero que dejó de actualizarse**, y la suma de esa corrida es
 * exactamente la plata que se fosiliza. Por eso el hallazgo se informa con su rango y su total.
 *
 * @param {Array<Array<unknown>>} formulas  matriz del render FORMULA
 * @param {Array<Array<unknown>>} vistas    matriz del render FORMATTED_VALUE
 */
export function bloquesPegados(formulas, vistas, { minFilas = 3 } = {}) {
  const alto = Math.max(formulas.length, vistas.length)
  const ancho = Math.max(0, ...formulas.map((f) => f.length), ...vistas.map((f) => f.length))
  const bloques = []
  for (let col = 0; col < ancho; col++) {
    let ini = -1, suma = 0
    const cerrar = (fin) => {
      const filas = fin - ini
      if (ini >= 0 && filas >= minFilas) {
        bloques.push({ rango: `${colLetra(col)}${ini + 1}:${colLetra(col)}${fin}`, filas, suma })
      }
      ini = -1
      suma = 0
    }
    for (let fila = 0; fila < alto; fila++) {
      const cruda = formulas[fila]?.[col]
      const clase = clasificarCelda(cruda, vistas[fila]?.[col])
      if (clase === 'pegado') {
        if (ini < 0) ini = fila
        suma += Number(cruda) || 0
      } else cerrar(fila)
    }
    cerrar(alto)
  }
  return bloques.sort((a, b) => Math.abs(b.suma) - Math.abs(a.suma))
}

/**
 * EL GRAFO: quién cita a quién, quién quedó aislada y qué referencia apunta al vacío.
 *
 * ═══ UN NOMBRE ES UNA CITA A SU PESTAÑA DE ORIGEN, NO SÓLO AL NOMBRE (15/08/2026) ═══
 *
 * `=N(CAJA_TOTAL_DISPONIBLE)` no lleva `'CAJA'!` adelante — por eso `p.refNombres` lo veía como una
 * cita a un NOMBRE suelto, nunca como una cita a la PESTAÑA donde ese nombre vive. El resultado medido
 * contra el archivo real: `CAJA citadaPor: []` cuando en realidad la citan `Cash Flow Semanal`,
 * `Cash Flow Mensual` y `Cheques Emitidos` — la celda de la que cuelga el año entero salía "sin
 * lectores", que es el peor tipo de falla en un auditor: no dice "no sé", dice "nadie depende de
 * esto" sobre la celda de la que depende todo.
 *
 * `hojaDelNombre` resuelve esto con el DATO REAL del archivo (`getNamedRanges` trae `range.sheetId`,
 * `getSheetMeta` trae `sheetId → title`) — no con una tabla escrita a mano: un nombre puede vivir en
 * una pestaña que no lleva su prefijo (`ARCA_COMPRAS_TOTAL` vive en "Proveedores y Materiales", no en
 * una pestaña "ARCA"), así que inferir la pestaña del propio nombre mentiría en ese caso.
 *
 * @param {Array<{titulo:string, refPestanas:Map<string,number>, refNombres:Map<string,number>, refsRotas:number}>} pestanas
 * @param {string[]} titulos            las pestañas que EXISTEN hoy en el archivo
 * @param {string[]} nombresDefinidos   los rangos con nombre que EXISTEN hoy
 * @param {Map<string,string>} hojaDelNombre  nombre de rango → título de la pestaña donde vive (puede
 *   faltar una entrada: un nombre sin pestaña resuelta simplemente no agrega arista, no revienta)
 */
export function construirGrafo(pestanas, titulos, nombresDefinidos, hojaDelNombre = new Map()) {
  const existe = new Set(titulos)
  const nombres = new Set(nombresDefinidos)
  const citadaPor = new Map(titulos.map((t) => [t, new Map()]))
  const rotas = []
  // SUMA, NO PISA: una pestaña puede citar el mismo destino directo (`'CAJA'!A1`) Y por nombre
  // (`CAJA_TOTAL_DISPONIBLE`) a la vez. Un `.set` liso haría que la segunda cita borre el conteo de
  // la primera en vez de sumarse.
  const citar = (destino, origen, n) => citadaPor.get(destino).set(origen, (citadaPor.get(destino).get(origen) ?? 0) + n)
  for (const p of pestanas) {
    for (const [destino, n] of p.refPestanas) {
      if (destino === p.titulo) continue              // autorreferencia: no es una arista del grafo
      if (!existe.has(destino)) { rotas.push({ pestana: p.titulo, tipo: 'pestaña', destino, celdas: n }); continue }
      citar(destino, p.titulo, n)
    }
    for (const [nombre, n] of p.refNombres) {
      if (!nombres.has(nombre) && !existe.has(nombre)) {
        rotas.push({ pestana: p.titulo, tipo: 'rango con nombre', destino: nombre, celdas: n })
        continue
      }
      const destino = hojaDelNombre.get(nombre)
      if (destino && existe.has(destino) && destino !== p.titulo) citar(destino, p.titulo, n)
    }
    if (p.refsRotas) rotas.push({ pestana: p.titulo, tipo: '#REF!', destino: '#REF!', celdas: p.refsRotas })
  }
  const sale = new Map(pestanas.map((p) => {
    const directas = [...p.refPestanas.keys()].filter((d) => existe.has(d) && d !== p.titulo)
    const porNombre = [...p.refNombres.keys()]
      .map((n) => hojaDelNombre.get(n))
      .filter((d) => d && existe.has(d) && d !== p.titulo)
    return [p.titulo, [...new Set([...directas, ...porNombre])]]
  }))
  const huerfanas = titulos.filter((t) => !(sale.get(t) || []).length && !(citadaPor.get(t)?.size))
  return { citadaPor, sale, huerfanas, rotas }
}
