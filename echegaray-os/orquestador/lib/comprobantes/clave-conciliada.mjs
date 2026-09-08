// LAS DOS CLAVES DEL MISMO COMPROBANTE — `c:<cuit>|…` y `p:<proveedor>|…`.
//
// EL DEFECTO QUE ESTO ARREGLA (medido el 08/09/2026 sobre los 14 días desde el 25/08).
//
// El lector del bot arma la clave con el CUIT que leyó del papel: `c:33538492219|0021-00078128`.
// La fila que ese mismo bot escribió en la pestaña Compras vuelve del Sheet SIN CUIT —la columna
// quedó vacía— y `claveDeCompra` la resuelve por proveedor: `p:santa clara srl|0021-00078128`.
// Son el mismo comprobante y son dos claves distintas, así que el cruce de la pantalla
// (`compra_adjunto.compra_clave = compra_sheet.clave`) no encuentra nada y la compra sale
// «sin comprobante» aunque el archivo esté guardado. Medidas ese día: 16 filas de 66 con las dos
// claves desalineadas, y 197 filas del espejo con clave `p:` conviviendo con adjuntos `c:`.
//
// LA REGLA. El NÚMERO de comprobante es lo que identifica al comprobante dentro de un proveedor
// —eso ya está fijado en la memoria del OS— así que el número tiene que coincidir SIEMPRE. Lo que
// se afloja es sólo la identidad, y sólo cuando uno de los dos lados no la tiene: un `c:` empata con
// un `p:` únicamente si el nombre del proveedor coincide. Dos `c:` con CUIT distinto NUNCA empatan,
// y dos `p:` con proveedor distinto tampoco: aflojar eso pegaría la factura de un proveedor a la
// fila de otro, que es peor que no mostrar el papel.

/** Sin tildes, en minúsculas, sin puntuación y con los espacios colapsados. */
export function normalizar(v) {
  return String(v ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
}

/** El número de comprobante sin ceros a la izquierda ni separadores: `0004-00003746` → `400003746`. */
export function numeroNormalizado(v) {
  return String(v ?? '').replace(/\D/g, '').replace(/^0+/, '')
}

/**
 * Las piezas de una clave. Formatos reales: `c:<cuit>|<numero>`, `p:<proveedor>|<numero>` y los dos
 * con un tipo en el medio (`c:23369111574|NC|0004-00000097`).
 *
 * @returns {{por:'cuit'|'proveedor'|null, identidad:string, tipo:string, numero:string}|null}
 */
export function partesDeClave(clave) {
  const s = String(clave ?? '').trim()
  if (!s) return null
  const m = s.match(/^([cp]):(.*)$/)
  if (!m) return null
  const trozos = m[2].split('|')
  if (trozos.length < 2) return null
  const numero = trozos[trozos.length - 1]
  const tipo = trozos.slice(1, -1).join('|')
  return {
    por: m[1] === 'c' ? 'cuit' : 'proveedor',
    identidad: m[1] === 'c' ? String(trozos[0]).replace(/\D/g, '') : normalizar(trozos[0]),
    tipo: normalizar(tipo),
    numero: numeroNormalizado(numero),
  }
}

/**
 * ¿Las dos claves nombran el mismo comprobante?
 *
 * `proveedores` son los nombres de cada lado, y sólo hacen falta cuando las claves se identifican
 * distinto (una por CUIT y la otra por proveedor). Sin ese dato, un `c:` y un `p:` NO empatan: se
 * prefiere no mostrar el papel antes que colgárselo a la compra equivocada.
 *
 * @param {string|null} a
 * @param {string|null} b
 * @param {{proveedorA?:string|null, proveedorB?:string|null}} [proveedores]
 */
export function mismoComprobante(a, b, { proveedorA = null, proveedorB = null } = {}) {
  const x = partesDeClave(a)
  const y = partesDeClave(b)
  if (!x || !y) return false
  if (!x.numero || x.numero !== y.numero) return false
  if (x.tipo !== y.tipo) return false
  if (x.por === y.por) return Boolean(x.identidad) && x.identidad === y.identidad
  // Una por CUIT y la otra por proveedor: el nombre es lo único que queda para probar que es el mismo.
  const pa = normalizar(proveedorA) || (x.por === 'proveedor' ? x.identidad : '')
  const pb = normalizar(proveedorB) || (y.por === 'proveedor' ? y.identidad : '')
  if (!pa || !pb) return false
  return pa === pb || pa.startsWith(pb) || pb.startsWith(pa)
}

/**
 * La fila del espejo que le corresponde a una clave del lector. Devuelve `null` si no hay ninguna, y
 * también si hay MÁS DE UNA: un empate no se resuelve adivinando.
 *
 * @param {string|null} clave           la que armó el lector del bot
 * @param {Array<{clave:string|null, proveedor?:string|null, fila?:number}>} filas  el espejo
 * @param {{proveedor?:string|null}} [ctx]  el proveedor que leyó el bot
 */
export function filaConciliada(clave, filas = [], { proveedor = null } = {}) {
  const exacta = filas.filter((f) => f.clave && f.clave === clave)
  if (exacta.length === 1) return exacta[0]
  const cerca = filas.filter((f) => mismoComprobante(clave, f.clave, { proveedorA: proveedor, proveedorB: f.proveedor }))
  return cerca.length === 1 ? cerca[0] : null
}
