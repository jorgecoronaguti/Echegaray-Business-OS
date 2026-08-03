// LA PESTAÑA "Compras" VIVA — para no cargar dos veces lo que ya está cargado, y para saber cómo
// imputa esta empresa.
//
// ═══ POR QUÉ NO ALCANZA EL REGISTRO PROPIO (03/08) ═══
//
// `comunicacion.comprobantes_cargados` sólo sabe de lo que entró POR EL CHAT. El comprobante de
// Corralón que el dueño mandó a `comprobantes-gastos` ya estaba en Compras fila 802 — cargado por
// Claude Code con el mismo pipeline. El registro del chat no lo tenía, así que la idempotencia no
// podía verlo, y el bot se ofreció a cargarlo de nuevo. El dueño ya se había quejado antes de
// mandar uno cargado y no recibir aviso.
//
// La barrera tiene que mirar el DESTINO, no el registro de lo que hizo uno mismo. La evidencia de
// que un gasto está cargado es la fila de Compras, no la anotación propia de haberlo cargado.
//
// ═══ EL DEFECTO QUE ESTE ARCHIVO ARREGLA (03/08, ticket de combustible) ═══
//
// El dueño mandó un TIQUE FACTURA "A" de Combustibles Barcelo, `00113-00014219`, $64.006,07. Ya
// estaba en Compras fila 800, con el mismo número y el mismo total al centavo. El bot no lo detectó
// y ofreció "Confirmar y cargar".
//
// La causa NO fue que faltara mirar Compras: se miraba. Fue que las dos pasadas de búsqueda
// dependían de datos que ese ticket no tenía:
//   · la pasada por número exigía el TIPO ("A"), y de un tique la visión no siempre lo saca — el
//     mensaje decía "comprobante 00113-…", no "F A 00113-…": el tipo venía en null;
//   · la pasada por proveedor+fecha+importe DESCARTABA a propósito las filas con el mismo número,
//     dando por hecho que ésas ya las había cazado la primera.
// Entre las dos dejaron ciego justo el caso más obvio: el mismo número y el mismo total.
//
// Y el agravante: un tique de estación de servicio **puede legítimamente no estar en ARCA**. El bot
// dijo "no figura en ARCA" y siguió. Que no esté en ARCA no dice NADA sobre si ya está cargado —
// cuando ARCA no lo encuentra es cuando MÁS falta hace mirar la pestaña viva.
//
// ═══ LA REGLA, AHORA ═══
//
// **Se busca SIEMPRE, con ARCA o sin ARCA, y por varias claves**, de la más fuerte a la más débil:
//   (CUIT|proveedor, número) · (número, total) · (CUIT|proveedor, fecha, total) · (fecha, total)
// Ninguna exige el tipo, ninguna exige el CUIT y ninguna exige ARCA. Lo que cambia según la clave no
// es SI se busca, sino con cuánta certeza se afirma:
//   · CARGADO  = es éste. Certeza suficiente para no volver a cargarlo.
//   · PROBABLE = puede ser éste. No se decide solo: se muestra la fila y se pregunta.
//
// ═══ CUIT: LA IDENTIDAD CORRECTA QUE EL DESTINO NO GUARDA ═══
//
// El identificador de un proveedor es el CUIT, pero **la pestaña Compras no tiene columna de CUIT**:
// su identidad es el nombre del desplegable estricto (que es, además, el valor al que `matchProveedor`
// ya tradujo lo que leyó la foto). Por eso las claves "por CUIT" se resuelven con un mapa
// nombre→CUIT OPCIONAL: cuando alguien puede proveerlo, el CUIT manda sobre el nombre; cuando no, la
// identidad es el nombre y se dice. No se inventa una columna que el Sheet no tiene.
//
// Es SÓLO LECTURA. Ni una escritura, ni una fórmula: el freno de mano de Sheets no lo afecta.

import { numeroCanonico, fechaDeLectura, soloDigitos } from './lectura.mjs'
import { normalizar, aNumero, redondear2 } from '../carga-comprobantes.mjs'

/** Rango mínimo suficiente: C fecha … O total. La fila del Sheet es el índice + esta base. */
export const RANGO = 'Compras!C4:O'
export const FILA_BASE = 4

/** Posición de cada dato DENTRO del rango leído (C = 0). Contrato con `RANGO`. */
const EN = { fecha: 0, proveedor: 2, tipo: 4, numero: 5, unidad: 6, obra: 7, detalle: 8, concepto: 9, total: 12 }

/** Tolerancia de importe. Debajo de esto es el redondeo del comprobante, no otra compra. */
const TOLERANCIA = 0.5

export const HALLAZGO = Object.freeze({
  CARGADO: 'cargado',   // es éste: no se vuelve a cargar
  PROBABLE: 'probable', // puede ser éste: se pregunta con botones
})

/**
 * Importe de una celda de Compras. Un negativo del Sheet viene ENTRE PARÉNTESIS —así lo formatea el
 * dueño— y `aNumero` se come el paréntesis y devuelve el positivo. Una nota de crédito leída como
 * compra es el error de $41,9M que este repo ya pagó: acá el signo se respeta.
 */
export function importeDeCompras(v) {
  const s = String(v ?? '')
  const n = aNumero(s)
  if (n == null) return null
  return /\(.*\)/.test(s) ? -Math.abs(n) : n
}

/** El tipo de la columna G ("F A", "N C") → la letra que usa la lectura ('A', 'NC'). */
export function tipoDeCompras(v) {
  const s = normalizar(v).replace(/\s+/g, '')
  if (!s) return null
  if (s === 'nc') return 'NC'
  const m = s.replace(/^f/, '').match(/^([abc])$/)
  return m ? m[1].toUpperCase() : s.toUpperCase()
}

/**
 * Filas crudas del rango → índice consultable. NÚCLEO PURO.
 *
 * @param {Array<Array<string>>} filas  lo que devuelve `readSheetValues(RANGO)`
 * @param {{cuitPorProveedor?:Object|Map}} [o]  nombre de proveedor normalizado → CUIT, si se sabe
 */
export function indexarCompras(filas = [], { cuitPorProveedor = null } = {}) {
  const cuitDe = lectorDeCuit(cuitPorProveedor)
  // LAS CLAVES NO LLEVAN NI EL TIPO NI EL PROVEEDOR. Un índice que los mete en la clave sólo puede
  // contestar preguntas que traigan esos datos, y el ticket que motivó este arreglo no traía el tipo.
  // Se indexa por lo que SIEMPRE se puede leer de una foto —el número, la fecha y el total— y la
  // identidad del proveedor se evalúa después, sobre cada candidata.
  const porNumero = new Map()
  const porFechaTotal = new Map()
  const registros = []
  let n = 0
  filas.forEach((r, i) => {
    const numero = numeroCanonico(r?.[EN.numero])
    const proveedor = normalizar(r?.[EN.proveedor])
    if (!numero && !proveedor) return
    n++
    const reg = {
      fila: i + FILA_BASE,
      hoja: 'Compras',
      proveedor: String(r?.[EN.proveedor] ?? '').trim() || null,
      cuit: cuitDe(proveedor),
      tipo: tipoDeCompras(r?.[EN.tipo]),
      numero,
      fecha: fechaDeLectura(r?.[EN.fecha]),
      total: importeDeCompras(r?.[EN.total]),
      unidad: String(r?.[EN.unidad] ?? '').trim() || null,
      obra: String(r?.[EN.obra] ?? '').trim() || null,
      detalle: String(r?.[EN.detalle] ?? '').trim() || null,
      concepto: String(r?.[EN.concepto] ?? '').trim() || null,
    }
    registros.push(reg)
    if (numero) empujar(porNumero, numero, reg)
    if (reg.fecha && reg.total != null) empujar(porFechaTotal, `${reg.fecha}|${redondear2(reg.total)}`, reg)
  })
  // Una sola lectura del Sheet alimenta las TRES cosas que hacen falta: el duplicado, el vocabulario
  // con el que se resuelve lo escrito a mano, y la historia de imputación con la que se aprende.
  return {
    porNumero,
    porFechaTotal,
    filas: n,
    detalles: detallesPorObra(filas),
    historia: registros.map(aHistoria),
  }
}

function lectorDeCuit(mapa) {
  if (!mapa) return () => null
  const get = mapa instanceof Map ? (k) => mapa.get(k) : (k) => mapa[k]
  return (proveedorNorm) => {
    if (!proveedorNorm) return null
    const c = soloDigitos(get(proveedorNorm) ?? '')
    return c.length === 11 ? c : null
  }
}

function empujar(mapa, clave, reg) {
  const ya = mapa.get(clave)
  if (ya) ya.push(reg); else mapa.set(clave, [reg])
}

/**
 * ¿La fila de Compras es del MISMO proveedor que el comprobante leído?
 *
 * Tres respuestas, no dos: `desconocido` no es `distinto`. Un ticket sin nombre legible no puede
 * afirmar que la fila 800 sea de otro; sólo puede no aportar. Tratar "no sé" como "no" es la forma
 * de perder un duplicado, y como "sí", la de inventar uno.
 */
export function identidadProveedor(comprobante = {}, reg = {}) {
  const ca = soloDigitos(comprobante.cuit)
  const cb = soloDigitos(reg.cuit)
  // El CUIT manda cuando los dos lados lo tienen: es el identificador real del proveedor.
  if (ca.length === 11 && cb.length === 11) return ca === cb ? 'igual' : 'distinto'
  const a = normalizar(comprobante.proveedor)
  const b = normalizar(reg.proveedor)
  if (!a || !b) return 'desconocido'
  if (a === b) return 'igual'
  // "Combustibles Barcelo" contra "COMBUSTIBLES BARCELO SRL": el mismo criterio de contención que
  // usa `matchProveedor` contra el desplegable, para no partir la identidad por un sufijo.
  const min = Math.min(a.length, b.length)
  if (min >= 4 && (a.includes(b) || b.includes(a))) return 'igual'
  return 'distinto'
}

/** ¿Los dos importes son el mismo? null = alguno no se sabe (no se puede afirmar ni negar). */
function importeCierra(a, b) {
  if (a == null || b == null) return null
  return Math.abs(redondear2(a - b)) <= TOLERANCIA
}

/**
 * ¿Este comprobante ya está en Compras? Devuelve null, un `CARGADO` o un `PROBABLE`.
 *
 * NO DEPENDE DE ARCA, NI DEL TIPO, NI DEL CUIT. Corre siempre, con lo que haya leído la foto.
 *
 * @param {object} comprobante  el normalizado por `lectura.mjs`
 * @param {{porNumero:Map, porFechaTotal:Map}} indice
 */
export function buscarEnCompras(comprobante = {}, indice = {}) {
  const numero = numeroCanonico(comprobante.numero)
  const tipo = comprobante.esNotaCredito ? 'NC' : (comprobante.tipo ?? null)
  const fecha = comprobante.fecha ?? null
  const total = comprobante.total == null ? null : redondear2(comprobante.total)
  const sinProveedor = !normalizar(comprobante.proveedor) && soloDigitos(comprobante.cuit).length !== 11

  // ── 1) POR NÚMERO ──────────────────────────────────────────────────────────
  // Un mismo número lo pueden emitir dos proveedores distintos (0001-00000123 lo tiene medio mundo),
  // así que la fila candidata tiene que aguantar además la identidad del proveedor o el importe.
  if (numero) {
    const cands = (indice.porNumero?.get(numero) ?? [])
      .map((r) => ({ r, quien: identidadProveedor(comprobante, r), cierra: importeCierra(total, r.total) }))
      .filter((c) => c.quien !== 'distinto')
    // (proveedor|CUIT, número) con el importe que cierra, o (número, total) cuando no se sabe quién
    // es: en los dos casos es ÉSTE. Es la clave que cazaba el ticket de Barcelo y no se disparaba.
    const seguras = cands.filter((c) => c.cierra === true || (c.cierra == null && c.quien === 'igual'))
    if (seguras.length) return hallazgo(HALLAZGO.CARGADO, seguras, viaNumero(seguras[0], tipo))
    // Mismo número y mismo proveedor con OTRO importe: un proveedor no emite dos comprobantes con el
    // mismo punto de venta y número. O es éste con un importe mal tipeado, o es una fila mal cargada.
    // Las dos salidas son caras: se pregunta.
    const dudosas = cands.filter((c) => c.quien === 'igual')
    if (dudosas.length) return hallazgo(HALLAZGO.PROBABLE, dudosas, 'proveedor+numero (el importe no cierra)')
  }

  // ── 2) POR FECHA + TOTAL ───────────────────────────────────────────────────
  if (fecha && total != null) {
    const cands = (indice.porFechaTotal?.get(`${fecha}|${total}`) ?? [])
      .map((r) => ({ r, quien: identidadProveedor(comprobante, r) }))
      // El mismo número ya lo resolvió la pasada de arriba; acá interesa el que trae OTRO número
      // (o ninguno), que es el duplicado con un dígito mal leído.
      .filter((c) => !numero || !c.r.numero || c.r.numero !== numero)
    const mismos = cands.filter((c) => c.quien === 'igual')
    if (mismos.length) return hallazgo(HALLAZGO.PROBABLE, mismos, 'proveedor+fecha+importe')
    // Sin proveedor legible, fecha y total exactos siguen siendo una pista que hay que mostrar. Con
    // proveedor legible y distinto, no: dos compras del mismo día por la misma plata a proveedores
    // distintos es una coincidencia, no un duplicado, y una alarma que suena siempre deja de leerse.
    if (sinProveedor && cands.length) return hallazgo(HALLAZGO.PROBABLE, cands, 'fecha+importe')
  }
  return null
}

function viaNumero(mejor, tipo) {
  if (tipo && mejor.r.tipo && tipo === mejor.r.tipo) return 'tipo+numero'
  if (mejor.quien === 'igual') return soloDigitos(mejor.r.cuit).length === 11 ? 'cuit+numero' : 'proveedor+numero'
  return 'numero+total'
}

function hallazgo(que, cands, via) {
  return { que, ...cands[0].r, via, otras: cands.length - 1 }
}

/**
 * Lee la pestaña viva y devuelve el índice. Nunca lanza: si Google no contesta, se declara en `ok`.
 * No poder mirar Compras NO es lo mismo que "no está cargado", y quien llame tiene que distinguirlo
 * — el mensaje lo dice en vez de dejar creer que se miró.
 *
 * @param {object} google  cliente de `lib/google.mjs`
 */
export async function indiceDeCompras(google, { fileId, cuitPorProveedor = null } = {}) {
  const id = fileId || process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
  const vacio = { porNumero: new Map(), porFechaTotal: new Map(), filas: 0, detalles: {}, historia: [] }
  if (typeof google?.readSheetValues !== 'function') return { ok: false, ...vacio, error: 'sin cliente de Google' }
  try {
    return { ok: true, ...indexarCompras(await google.readSheetValues(id, RANGO), { cuitPorProveedor }) }
  } catch (e) {
    return { ok: false, ...vacio, error: String(e?.message ?? e).slice(0, 200) }
  }
}

/**
 * El vocabulario VIVO de la columna K por obra, para poder resolver lo escrito a mano.
 * Se arma del mismo índice: una sola lectura del Sheet alimenta el duplicado y la imputación.
 *
 * @returns {Object<string,string[]>} obra → detalles ya usados, del más usado al menos
 */
export function detallesPorObra(filas = []) {
  const cuenta = new Map()
  for (const r of filas) {
    const obra = String(r?.[EN.obra] ?? '').trim()
    const det = String(r?.[EN.detalle] ?? '').trim()
    if (!obra || !det) continue
    if (!cuenta.has(obra)) cuenta.set(obra, new Map())
    const m = cuenta.get(obra)
    m.set(det, (m.get(det) ?? 0) + 1)
  }
  const out = {}
  for (const [obra, m] of cuenta) out[obra] = [...m.entries()].sort((a, b) => b[1] - a[1]).map(([d]) => d)
  return out
}

/**
 * Las filas de Compras con la forma que espera `imputacion-aprendida.mjs`.
 *
 * POR QUÉ ACÁ Y NO OTRA TABLA. La lib que APRENDE cómo imputa el dueño ya existe y es la única que
 * sabe hacerlo (perfiles por proveedor, umbrales calibrados, confianza declarada). Lo que le faltaba
 * no era inteligencia: era que alguien le pasara la historia CON el detalle de la columna K.
 * `public.costos_obra` —su feeder original— espeja Compras pero PEGA detalle y concepto en un solo
 * campo (`sync-compras.mjs`) y sólo guarda las filas que ya tienen obra. La pestaña viva los tiene
 * separados y los tiene todos.
 *
 * Entonces: la historia sale de la MISMA lectura que ya se hace para el duplicado, y el que aprende
 * sigue siendo uno solo. Cero consultas de más, cero segunda implementación.
 */
export function historiaDeCompras(filas = []) {
  return indexarCompras(filas).historia
}

function aHistoria(reg) {
  return {
    proveedor: reg.proveedor,
    unidad_negocio: reg.unidad,
    obra_texto: reg.obra,
    detalle: reg.detalle,
    concepto: reg.concepto,
  }
}
