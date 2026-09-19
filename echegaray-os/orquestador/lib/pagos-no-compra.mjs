// _PAGOS_NO_COMPRA_RAW — LOS PAGOS QUE SALEN DE LA CAJA Y NO TIENEN FACTURA NI FILA EN COMPRAS.
//
// ═══ POR QUÉ EXISTE (18/09/2026) ═══
//
// El dueño, sobre los tres retiros parciales de Dirección de agosto: *«ok, no en compras»*. Compras es
// el registro de comprobantes; un retiro de socio, un SAC pagado en efectivo o un gremial viejo no
// tienen comprobante, y cargarlos ahí como «Sueldos · Pago» los mezcla con las facturas —es lo que
// pasó con los retiros de julio (filas 779–781), la única vez que se cargaron—. Y hasta hoy no había
// OTRO lugar: la carga que no cabía en Compras no se hacía, y el Cash Flow seguía mostrando el mes
// entero como vencido con la plata ya salida del banco.
//
// ES UNA PESTAÑA DE CARGA, NO UNA RÉPLICA. `_BANCO_RAW` se reescribe entera desde Postgres; ésta se
// alimenta fila por fila (por script con el dato ya verificado contra el extracto, o a mano) y NUNCA
// se borra: el generador ubica su encabezado por rótulo, agrega debajo de la última fila con dato y
// deduplica por la referencia del banco. Lo que ya está adentro no se toca.
//
// SIRVE A MÁS DE UN RUBRO A PROPÓSITO. El plan de mudanza de Compras necesita la misma pestaña para
// el SAC en efectivo y los gremiales viejos; se diseña con la columna «Rubro» desde el primer día y
// hoy sólo se carga Dirección. Cada consumidor filtra por SU rubro y su período: dos rubros en la
// misma pestaña no se pueden mezclar por accidente.
//
// UN PAGO ES UN HECHO DE CAJA: lleva la fecha real del débito y la referencia del banco. El «Período»
// dice a qué mes de la obligación corresponde (el retiro de agosto se paga en septiembre), y es lo
// que el bloque de Dirección usa para imputarlo: la fecha dice CUÁNDO salió, el período dice QUÉ paga.

export const PESTANA_PAGOS_NC = '_PAGOS_NO_COMPRA_RAW'

/** Las columnas, en orden. El orden es contrato: las fórmulas del bloque de Dirección lo citan. */
export const COLUMNAS_PAGOS_NC = Object.freeze([
  ['Fecha', 'fecha'], ['Concepto', 'texto'], ['Rubro', 'texto'], ['Persona', 'texto'],
  ['Importe', 'monedaExacta'], ['Medio', 'texto'], ['Período', 'texto'], ['Referencia banco', 'texto'],
  ['Origen', 'texto'],
])
export const COL_PAGOS_NC = Object.freeze({
  fecha: 'A', concepto: 'B', rubro: 'C', persona: 'D', importe: 'E', medio: 'F', periodo: 'G', referencia: 'H', origen: 'I',
})
/** Fila 1 título · fila 2 nota · fila 3 encabezado · datos desde la 4. Igual que `_BANCO_RAW`. */
export const FILA0_PAGOS_NC = 4

/** Los rubros que esta pestaña admite. Un pago con otro rubro se rechaza: no hay quién lo consuma. */
export const RUBROS_PAGOS_NC = Object.freeze({
  direccion: 'Dirección · retiro',
  sac: 'SAC · efectivo',
  gremiales: 'Gremiales',
})

/** Los rangos abiertos de cada columna, como los citan las fórmulas de otras pestañas. */
export const refsPagosNC = Object.freeze(Object.fromEntries(
  Object.entries(COL_PAGOS_NC).map(([k, l]) => [k, `'${PESTANA_PAGOS_NC}'!$${l}$${FILA0_PAGOS_NC}:$${l}`]),
))

const ISO = /^\d{4}-\d{2}-\d{2}$/
const PERIODO = /^\d{4}-(0[1-9]|1[0-2])$/

/**
 * NÚCLEO PURO: ¿este pago se puede cargar? Devuelve los motivos por los que no; vacío si sí.
 * Lo mínimo es fecha real, rubro conocido, importe positivo y período: sin eso no hay a quién imputarlo.
 */
export function validarPagoNC(p = {}) {
  const motivos = []
  if (!ISO.test(String(p.fecha ?? ''))) motivos.push('fecha: va como YYYY-MM-DD (la fecha real del débito)')
  if (!Object.values(RUBROS_PAGOS_NC).includes(p.rubro)) motivos.push(`rubro: tiene que ser uno de ${Object.values(RUBROS_PAGOS_NC).join(' · ')}`)
  if (!(Number(p.importe) > 0)) motivos.push('importe: un número mayor que cero (el signo lo pone el rubro: siempre sale)')
  if (!PERIODO.test(String(p.periodo ?? ''))) motivos.push('periodo: va como YYYY-MM (el mes de la obligación que paga)')
  if (p.rubro === RUBROS_PAGOS_NC.direccion && !String(p.persona ?? '').trim()) motivos.push('persona: un retiro de Dirección es de un socio')
  return motivos
}

/**
 * NÚCLEO PURO: la identidad de un pago. La referencia del banco cuando la hay —no cambia entre
 * descargas y es única—; sin ella, fecha + rubro + persona + importe.
 */
export function clavePagoNC(p = {}) {
  const ref = String(p.referencia ?? '').trim().replace(/^0+/, '')
  if (ref) return `ref:${ref}`
  return `dato:${p.fecha}|${p.rubro}|${String(p.persona ?? '').trim().toLowerCase()}|${Number(p.importe)}`
}

/** NÚCLEO PURO: un pago → la fila de la pestaña, en el orden de `COLUMNAS_PAGOS_NC`. */
export function filaPagoNC(p = {}) {
  return [
    String(p.fecha ?? ''), String(p.concepto ?? ''), String(p.rubro ?? ''), String(p.persona ?? ''),
    Number(p.importe) || 0, String(p.medio ?? ''), String(p.periodo ?? ''), String(p.referencia ?? ''),
    String(p.origen ?? ''),
  ]
}

/** NÚCLEO PURO: una fila leída de la pestaña → el pago. `null` si la fila no tiene dato. */
export function pagoDeFila(f = []) {
  if (!f || !String(f[0] ?? '').trim()) return null
  return {
    fecha: aIso(f[0]), concepto: f[1] ?? '', rubro: f[2] ?? '', persona: f[3] ?? '',
    importe: Number(f[4]) || 0, medio: f[5] ?? '', periodo: String(f[6] ?? ''), referencia: String(f[7] ?? ''),
    origen: f[8] ?? '',
  }
}

/** Un serial de Sheets o un texto de fecha → 'YYYY-MM-DD'. */
export function aIso(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return new Date(Date.UTC(1899, 11, 30) + v * 86400000).toISOString().slice(0, 10)
  const s = String(v ?? '').trim()
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return s
}

/**
 * NÚCLEO PURO: EL PLAN DE ALTA. Qué filas se agregan y cuáles ya estaban, con su motivo.
 *
 * NO PROPONE BAJAS NI CAMBIOS: la pestaña no se borra. Un pago que ya está —por referencia o por
 * dato— se informa y no se repite; uno inválido se informa y no entra. La primera fila libre es la que
 * sigue a la última con dato, no "el largo de lo leído": una fila vacía en el medio no es el final.
 *
 * @param {Array<Array>} filasLeidas la pestaña desde la fila 1 (título, nota, encabezado, datos)
 * @param {object[]} nuevos los pagos a cargar
 */
export function planDeAltaNC(filasLeidas = [], nuevos = []) {
  const encabezado = filasLeidas[FILA0_PAGOS_NC - 2] ?? []
  const rotulosOk = COLUMNAS_PAGOS_NC.every(([n], j) => String(encabezado[j] ?? '').trim() === n)
  const existentes = filasLeidas.slice(FILA0_PAGOS_NC - 1).map(pagoDeFila).filter(Boolean)
  const claves = new Set(existentes.map(clavePagoNC))
  let ultimaConDato = FILA0_PAGOS_NC - 1
  filasLeidas.forEach((f, i) => { if (i + 1 >= FILA0_PAGOS_NC && f?.some((c) => String(c ?? '').trim())) ultimaConDato = i + 1 })
  const altas = []; const yaEstaban = []; const rechazados = []
  const vistos = new Set()
  for (const p of nuevos) {
    const motivos = validarPagoNC(p)
    if (motivos.length) { rechazados.push({ pago: p, motivos }); continue }
    const k = clavePagoNC(p)
    if (claves.has(k) || vistos.has(k)) { yaEstaban.push({ pago: p, clave: k }); continue }
    vistos.add(k)
    altas.push(p)
  }
  return { rotulosOk, existentes, primeraLibre: ultimaConDato + 1, altas, yaEstaban, rechazados }
}

/**
 * NÚCLEO PURO: LOS PAGOS QUE COMPRAS YA TIENE (revisión independiente 19/09/2026).
 *
 * La pestaña deduplica contra sí misma; esto la cruza contra Compras. El bloque de Dirección suma las dos
 * fuentes, así que un retiro cargado en los dos lados se contaría dos veces sin que ningún número
 * descuadre. Es PROBABLE y no cierto —Compras no guarda la referencia del banco—: misma persona, mismo
 * importe y fechas a `tolerancia` días o menos. Quien carga lo mira y decide; el script no escribe esos.
 *
 * @param {object[]} altas pagos a cargar ({ fecha ISO, persona, importe })
 * @param {object[]} compras filas de Compras ya leídas ({ fila, persona, importe, fecha ISO })
 */
export function enComprasTambien(altas = [], compras = [], { tolerancia = 5 } = {}) {
  const dia = (iso) => Date.parse(`${iso}T00:00:00Z`) / 86400000
  const norm = (t) => String(t ?? '').trim().toLowerCase()
  const choques = []
  for (const p of altas) {
    const persona = norm(p.persona)
    if (!persona) continue
    const iguales = compras.filter((c) => norm(c.persona) === persona
      && Math.abs(Number(c.importe) - Number(p.importe)) < 0.5
      && Number.isFinite(dia(c.fecha)) && Math.abs(dia(c.fecha) - dia(p.fecha)) <= tolerancia)
    if (iguales.length) choques.push({ pago: p, filas: iguales.map((c) => c.fila) })
  }
  return choques
}

/**
 * NÚCLEO PURO: las condiciones de Sheets que eligen, en esta pestaña, los pagos de UN rubro y UN período.
 * Se unen con `*` para SUMPRODUCT y con `;` para FILTER — el mismo idioma que `condicionesPagoDelMes`.
 */
export function condicionesPagoNC(rubro, periodo) {
  return [
    `(${refsPagosNC.rubro}="${rubro}")`,
    `(${refsPagosNC.periodo}&""="${periodo}")`,
  ]
}

/** NÚCLEO PURO: 'YYYY-MM' de un mes 1–12 de un año. Meses 13+ desbordan al año siguiente. */
export function periodoDe(anio, mes) {
  const y = anio + Math.floor((mes - 1) / 12)
  const m = ((mes - 1) % 12) + 1
  return `${y}-${String(m).padStart(2, '0')}`
}
