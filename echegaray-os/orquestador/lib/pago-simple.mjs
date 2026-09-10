// EL ARCHIVO «PAGO SIMPLE» DE SANTANDER, ESCRITO SOBRE EL QUE EL BANCO YA ACEPTÓ.
//
// Este módulo no diseña nada: toma el .xlsx de un lote que Santander debitó, le cambia SÓLO las
// filas de datos de la hoja «Pagos» y devuelve el archivo. Los encabezados, los estilos, las
// validaciones de datos, las imágenes y hasta las filas vacías del final quedan como estaban.
//
// ═══ POR QUÉ SE EDITA EL XML Y NO LA PLANILLA ═══
//
// Ver `xlsx-zip.mjs`: abrir el archivo con una librería de planillas y volver a guardarlo perdió
// las imágenes, los dibujos y las cinco reglas de validación del original. Acá se toca una sola
// entrada del ZIP —la hoja Pagos— y se la escribe con el MISMO vocabulario XML que ya usaba.
//
// ═══ LOS ESTILOS NO SE INVENTAN: SE MIDEN ═══
//
// Cada celda del original lleva un índice de estilo (`s="111"`) que apunta a `styles.xml`. Poner un
// número a mano ataría este código a un archivo concreto. `estilosDeDatos` los DEDUCE de las filas
// que ya están: por cada columna, el par (estilo, tipo) que más se repite entre los pagos reales.
// Si mañana el banco manda otra plantilla, los estilos salen de esa.

const COLUMNAS = Object.freeze(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'])

/** Las cinco entidades que XML exige escapar. El nombre de un beneficiario puede traer «&». */
export function escaparXml(texto) {
  return String(texto ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

function desescaparXml(texto) {
  return String(texto ?? '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&')
}

/** Número de fila de la primera fila de datos: la que sigue al encabezado «Forma de pago». */
export function filaDelEncabezado(xml) {
  const filas = [...xml.matchAll(/<row r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)]
  for (const f of filas) {
    if (/<t>Forma de pago<\/t>/.test(f[2])) return Number(f[1])
  }
  throw new Error('la hoja no tiene la fila de encabezados «Forma de pago»')
}

/** Las celdas A..H de una fila, con su estilo, su tipo y su valor ya desescapado. */
function celdasDe(cuerpo) {
  const out = {}
  const re = /<c r="([A-Z]+)\d+"(?:\s+s="(\d+)")?(?:\s+t="(\w+)")?\s*(?:\/>|>([\s\S]*?)<\/c>)/g
  for (const m of cuerpo.matchAll(re)) {
    const [, col, s, t, dentro] = m
    if (!COLUMNAS.includes(col)) continue
    const inline = dentro && /<is><t[^>]*>([\s\S]*?)<\/t><\/is>/.exec(dentro)
    const v = dentro && /<v>([\s\S]*?)<\/v>/.exec(dentro)
    out[col] = { s: s ?? null, t: t ?? null, valor: inline ? desescaparXml(inline[1]) : (v ? v[1] : null) }
  }
  return out
}

/** Todas las filas de datos (las que siguen al encabezado y tienen algo en A). */
export function filasDeDatos(xml) {
  const enc = filaDelEncabezado(xml)
  const out = []
  for (const f of xml.matchAll(/<row r="(\d+)"([^>]*)>([\s\S]*?)<\/row>/g)) {
    const r = Number(f[1])
    if (r <= enc) continue
    const celdas = celdasDe(f[3])
    if (!celdas.A?.valor) continue
    out.push({ fila: r, atributos: f[2], celdas })
  }
  return out
}

/**
 * El (estilo, tipo) dominante por columna, medido sobre las filas de datos del propio archivo.
 *
 * Se toma el más frecuente y no el de la primera fila a propósito: en el lote de junio/julio la
 * primera fila traía estilos distintos al resto (`s="109"` contra `s="111"`) y trece celdas
 * sueltas de relleno en las columnas O..AA que ninguna otra fila tiene. La mayoría es la forma
 * real del archivo; la primera fila es donde queda la basura del editor.
 */
export function estilosDeDatos(xml) {
  const filas = filasDeDatos(xml)
  if (filas.length === 0) throw new Error('la hoja no tiene ninguna fila de datos de la que deducir el formato')
  const estilos = {}
  for (const col of COLUMNAS) {
    const cuenta = new Map()
    for (const f of filas) {
      const c = f.celdas[col]
      if (!c) continue
      const clave = `${c.s ?? ''}|${c.t ?? ''}`
      cuenta.set(clave, (cuenta.get(clave) ?? 0) + 1)
    }
    if (cuenta.size === 0) { estilos[col] = null; continue }
    const [mejor] = [...cuenta.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    const [s, t] = mejor[0].split('|')
    estilos[col] = { s: s || null, t: t || null }
  }
  return { estilos, atributosFila: filas.at(-1).atributos, primeraFila: filas[0].fila }
}

function celdaXml(col, fila, estilo, valor, { texto }) {
  if (valor === null || valor === undefined || valor === '') return ''
  const s = estilo?.s ? ` s="${estilo.s}"` : ''
  const t = texto ? ' t="inlineStr"' : ' t="n"'
  const cuerpo = texto ? `<is><t>${escaparXml(valor)}</t></is>` : `<v>${valor}</v>`
  return `<c r="${col}${fila}"${s}${t}>${cuerpo}</c>`
}

/**
 * Una fila de pago con el vocabulario exacto de la plantilla.
 *
 * `importe` se escribe como lo escribe el original: el número, sin forzar decimales
 * (`129689.6`, no `129689.60`). Los dos decimales los pone el FORMATO de la celda, que viaja en
 * `styles.xml` y no se toca.
 */
export function filaPago({ fila, pago, fechaSerial, orden, estilos, atributosFila }) {
  const c = (col, valor, texto) => celdaXml(col, fila, estilos.estilos[col], valor, { texto })
  return `<row r="${fila}"${atributosFila}>`
    + c('A', 'T', true)
    + c('B', orden, false)
    + c('C', pago.nombre, true)
    + c('D', 'CUIL', true)
    + c('E', pago.cuil, false)
    + c('F', fechaSerial, false)
    + c('G', pago.importe, false)
    + c('H', pago.cuenta, true)
    + '</row>'
}

/**
 * La hoja «Pagos» con los pagos nuevos.
 *
 * Las filas que sobran del lote anterior NO se borran: se VACÍAN conservando sus atributos. Así el
 * archivo mantiene la misma cantidad de filas y el `<dimension>` del original sigue siendo cierto
 * — no hay que tocarlo, y no tocarlo es una cosa menos que puede salir mal.
 */
export function hojaConPagos(xml, { pagos, fechaSerial, orden }) {
  const enc = filaDelEncabezado(xml)
  const estilos = estilosDeDatos(xml)
  let i = 0
  return xml.replace(/<row r="(\d+)"([^>]*)>([\s\S]*?)<\/row>/g, (todo, r, attrs) => {
    if (Number(r) <= enc) return todo
    if (i < pagos.length) {
      const fila = filaPago({
        fila: Number(r), pago: pagos[i], fechaSerial, orden, estilos, atributosFila: estilos.atributosFila,
      })
      i += 1
      return fila
    }
    return `<row r="${r}"${attrs}></row>`
  })
}

/** Las cuentas que el banco YA acreditó, indexadas por CUIL. La memoria contra la que se valida. */
export function cuentasAceptadas(xml) {
  const m = new Map()
  for (const f of filasDeDatos(xml)) {
    const cuil = f.celdas.E?.valor
    const cuenta = f.celdas.H?.valor
    if (cuil && cuenta) m.set(String(cuil), { cuenta: String(cuenta), nombre: f.celdas.C?.valor ?? '' })
  }
  return m
}

/**
 * ¿El archivo generado es el mismo archivo que el que el banco aceptó, con otros datos?
 *
 * PURA: recibe los dos XML de la hoja y el mapa de cuentas aceptadas. Falla ante cualquier
 * diferencia de estructura, no sólo ante las que a alguien se le ocurrió listar: compara el
 * prólogo entero (todo lo que hay antes de la primera fila de datos) y el epílogo entero (desde
 * el cierre de `sheetData`, que es donde viven merges y validaciones) carácter por carácter.
 */
export function validarPagoSimple(xmlPlantilla, xmlGenerado, aceptadas) {
  const errores = []
  const corte = (xml) => {
    const enc = filaDelEncabezado(xml)
    const i = xml.indexOf(`<row r="${enc + 1}"`)
    const j = xml.indexOf('</sheetData>')
    return { prologo: xml.slice(0, i), epilogo: xml.slice(j) }
  }
  let p, g
  try { p = corte(xmlPlantilla); g = corte(xmlGenerado) } catch (e) { return { ok: false, errores: [e.message] } }
  if (p.prologo !== g.prologo) errores.push('el encabezado de la hoja no es el mismo que el de la plantilla')
  if (p.epilogo !== g.epilogo) errores.push('los merges o las validaciones de datos cambiaron respecto de la plantilla')

  const cantidadFilas = (xml) => (xml.match(/<row r="\d+"/g) ?? []).length
  if (cantidadFilas(xmlPlantilla) !== cantidadFilas(xmlGenerado)) {
    errores.push(`la hoja tiene ${cantidadFilas(xmlGenerado)} filas y la plantilla ${cantidadFilas(xmlPlantilla)}`)
  }

  const esperados = estilosDeDatos(xmlPlantilla).estilos
  const filas = filasDeDatos(xmlGenerado)
  if (filas.length === 0) errores.push('el archivo generado no tiene ninguna fila de pago')
  for (const f of filas) {
    for (const col of COLUMNAS) {
      const c = f.celdas[col]
      const e = esperados[col]
      if (!c) { if (col !== 'B') errores.push(`fila ${f.fila}: falta la columna ${col}`); continue }
      if (e && (c.s ?? null) !== (e.s ?? null)) {
        errores.push(`fila ${f.fila}, columna ${col}: estilo ${c.s ?? '(ninguno)'} y la plantilla usa ${e.s ?? '(ninguno)'}`)
      }
      if (e && (c.t ?? null) !== (e.t ?? null)) {
        errores.push(`fila ${f.fila}, columna ${col}: tipo ${c.t ?? '(ninguno)'} y la plantilla usa ${e.t ?? '(ninguno)'}`)
      }
    }
    if (f.celdas.A?.valor !== 'T') errores.push(`fila ${f.fila}: la forma de pago es «${f.celdas.A?.valor}» y tiene que ser «T»`)
    if (f.celdas.D?.valor !== 'CUIL') errores.push(`fila ${f.fila}: el tipo de documento es «${f.celdas.D?.valor}»`)
    const cuil = f.celdas.E?.valor
    const cuenta = f.celdas.H?.valor
    const ya = aceptadas.get(String(cuil))
    if (!ya) errores.push(`fila ${f.fila}: el CUIL ${cuil} no figura en ningún lote que el banco haya acreditado`)
    else if (ya.cuenta !== String(cuenta)) {
      errores.push(`fila ${f.fila}: la cuenta ${cuenta} NO es la que el banco acreditó para ${cuil} (${ya.cuenta})`)
    } else if (ya.nombre !== f.celdas.C?.valor) {
      errores.push(`fila ${f.fila}: el nombre «${f.celdas.C?.valor}» no es el que usó el banco («${ya.nombre}»)`)
    }
  }
  return { ok: errores.length === 0, errores, filas: filas.length }
}

/** Serial de fecha de Excel (base 1899-12-30), que es como la plantilla guarda la fecha de pago. */
export function serialExcel(aaaammdd) {
  const d = Date.UTC(Number(aaaammdd.slice(0, 4)), Number(aaaammdd.slice(4, 6)) - 1, Number(aaaammdd.slice(6)))
  return Math.round((d - Date.UTC(1899, 11, 30)) / 86400000)
}

/** La «Orden de pago» del banco: el período como MAAAA, con el mes sin cero a la izquierda. */
export function ordenDePago(periodo) {
  return Number(`${Number(periodo.slice(4))}${periodo.slice(0, 4)}`)
}
