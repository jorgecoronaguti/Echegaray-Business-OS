// LOS HABERES PAGADOS QUE SE MARCAN EN LA WEB, COMO PAGOS CON FECHA — EL NÚCLEO DE `_HABERES_PAGADOS_RAW`.
//
// ═══ POR QUÉ EXISTE (02/10/2026) ═══
//
// El dueño, pagando la quincena: «a medida que vamos marcando los pagos, poniendo los montos de lo bancario
// y efectivo, pega en Supabase y se replica en Sheet Flujo de Fondos». Lo primero era cierto
// (`liquidacion_linea.pagado_banco` / `pagado_efectivo`, con su historial en `liquidacion_cambio`); lo
// segundo no: los pasos de nómina del pipeline leen la planilla JORNALES y la SUBEN a la base. Ninguno
// bajaba lo marcado en la web al Sheet. Esto es la fase 2 que la migración 20261002T1800 dejó dicha.
//
// ═══ POR QUÉ UN PAGO SE ARMA CON LOS DELTAS Y NO CON EL ACUMULADO ═══
//
// `pagado_efectivo` es un ACUMULADO sin fecha. Volcarlo entero con la fecha de la última marca fecha mal
// lo que se pagó ANTES: hoy una persona pasó de $122.200 (cargado antes de la web) a $357.200 — lo que salió
// del cajón hoy son $235.000, no $357.200. Y sumar acumulados duplicaría cada corrección. Por eso un pago es
// un DELTA de `liquidacion_cambio` (tipo «cambio»), nunca la fila «base»: la base es el backfill de lo que ya
// había (JORNALES, carga histórica), que el Sheet ya tiene por su propio camino.
//
// ═══ LAS CORRECCIONES DESHACEN EL PAGO MÁS RECIENTE ═══
//
// Hoy se marcó $1.391.446,92 en la quincena 01–15/09 de dos personas, se borró a los tres minutos y se
// volvió a marcar en la 16–30/09. Un delta negativo descuenta del último pago abierto de esa línea y medio
// (pila): el de la quincena equivocada desaparece, el bueno queda. Un negativo sin pago web abierto corrige
// lo cargado antes de la web: no es un pago y no genera fila — se declara como aviso.
//
// ═══ EL EFECTIVO SALE DE `liquidacion_pago_efectivo` (02/10/2026, desde el enganche con CAJA) ═══
//
// Con la migración 20261002T1800 aplicada, el efectivo NO se arma con el historial: cada renglón de esa tabla
// ya es un movimiento del cajón con el DÍA en que salió el billete y si salió de la caja o de una entrega a
// rendir. Es la misma tabla que lee `efectivo_caja_saldo`: una sola definición del pago en efectivo para la
// web y para el Sheet. Y es la que el dueño corrigió a mano el 02/10 (lo pagado ese día, que la siembra había
// fechado 16/09): armarlo desde el historial publicaba otra fecha y otro importe para el mismo billete.
//
// Su siembra trae la carga histórica entera; por eso entran sólo los renglones de quincenas ≥ `CORTE_QUINCENA`
// (las anteriores siguen saliendo de la planilla) y los que no son siembra. Sin la migración (42P01) se vuelve
// al historial, con la fecha del cambio.
//
// ═══ EL ORIGEN DEL CAMBIO: LO QUE ESCRIBE UN CARGADOR NO ES UN PAGO (objeción de la auditoría, 02/10/2026) ═══
//
// `liquidacion-cargar-jornales.mjs` y `liquidacion-medio-de-pago.mjs` escriben `pagado_*` sin sesión: el
// trigger los registra con origen `sin_sello`. Tomarlos como pagos publicaba la carga histórica como pagada HOY
// por banco. Por banco no hay otro camino `sin_sello` (el chat sólo paga en efectivo), así que se descartan.
// En efectivo el chat SÍ paga sin sesión (`pago_efectivo_de_sueldo`), por eso el efectivo no filtra el historial
// sino que sale de la tabla, donde el cargador deja SU fecha (fin de la quincena, `fecha_pago_efectivo`) y el
// chat la suya (`p_fecha`).

/** El medio de pago y la columna de `liquidacion_linea` que lo acumula. */
export const MEDIOS = { banco: 'pagado_banco', efectivo: 'pagado_efectivo' }

/**
 * LA QUINCENA DESDE LA QUE CAJA LEE LOS HABERES DE LA WEB (decisión del dueño, 02/10/2026: «el corte propuesto
 * y aceptado es la 2ª quincena de septiembre»). Las anteriores siguen saliendo de la planilla Nómina. El
 * generador de la réplica lo escribe en `_HABERES_PAGADOS_RAW!B2`, que es lo que citan las fórmulas.
 */
export const CORTE_QUINCENA = '2026-09-16'

/** Los caminos que NO son un pago: un cargador o una sincronización sin sesión (ver arriba). */
export const ORIGENES_QUE_NO_SON_PAGO = Object.freeze(['sin_sello'])

const CENTAVO = 0.005
/** Ventana para emparejar un delta del historial con el renglón que escribió el trigger de la migración. */
const EMPAREJE_MS = 120_000

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)
const ms = (t) => (t instanceof Date ? t.getTime() : Date.parse(t ?? ''))
const clave = (liq, persona) => `${liq}|${persona}`

/**
 * NÚCLEO PURO: ¿de dónde salió el billete? Banco es banco. Efectivo es «caja» salvo que el trigger de la
 * migración lo haya reclasificado como pagado con una entrega a rendir (que ya bajó la caja al entregarse).
 */
export function saleDe(medio, anotacion) {
  if (medio === 'banco') return 'banco'
  return anotacion?.origen === 'entrega' ? 'entrega a rendir' : 'caja'
}

/**
 * NÚCLEO PURO: el renglón de `liquidacion_pago_efectivo` que escribió el mismo cambio. Mismo importe, misma
 * persona y quincena, registrado a menos de dos minutos. Cada renglón se usa una sola vez (`usados`).
 */
export function emparejarAnotacion(cambio, anotaciones, usados) {
  const delta = num(cambio.despues) - num(cambio.antes)
  const t = ms(cambio.en)
  return (anotaciones ?? []).find((a) => !usados.has(a) && !String(a.clave ?? '').startsWith('siembra:')
    && a.liquidacion_id === cambio.liquidacion_id && a.persona_id === cambio.persona_id
    && Math.abs(num(a.importe) - delta) <= CENTAVO
    && Number.isFinite(t) && Math.abs(ms(a.registrado_en) - t) <= EMPAREJE_MS) ?? null
}

/** Un delta positivo abre (o engorda) un pago; uno negativo descuenta de los pagos abiertos, último primero. */
function aplicarDelta(pila, d, avisos, etiqueta) {
  if (d.importe > 0) {
    const tope = pila[pila.length - 1]
    if (tope && tope.fecha === d.fecha && tope.saleDe === d.saleDe) {
      tope.importe += d.importe; tope.anoto = d.anoto; tope.instante = d.instante
    } else pila.push({ ...d })
    return
  }
  let falta = -d.importe
  while (falta > CENTAVO && pila.length) {
    const tope = pila[pila.length - 1]
    const baja = Math.min(falta, tope.importe)
    tope.importe -= baja; falta -= baja
    if (tope.importe <= CENTAVO) pila.pop()
  }
  if (falta > CENTAVO) avisos.push(`${etiqueta}: corrección de ${falta.toFixed(2)} sobre lo cargado antes de la web — no es un pago, no hay fila`)
}

/** El acumulado de la línea manda: si quedó por debajo de lo armado (escritura sin historial), se recorta. */
function recortarAlAcumulado(pila, acumulado, avisos, etiqueta) {
  let sobra = pila.reduce((s, p) => s + p.importe, 0) - Math.max(acumulado, 0)
  if (sobra > CENTAVO) avisos.push(`${etiqueta}: el historial suma ${sobra.toFixed(2)} más que el acumulado de la línea — se recorta`)
  while (sobra > CENTAVO && pila.length) {
    const tope = pila[pila.length - 1]
    const baja = Math.min(sobra, tope.importe)
    tope.importe -= baja; sobra -= baja
    if (tope.importe <= CENTAVO) pila.pop()
  }
}

/**
 * NÚCLEO PURO: los pagos de UNA línea en UN medio.
 * @param {object} linea fila de liquidacion_linea + quincena (desde, hasta, grupo, persona)
 * @param {'banco'|'efectivo'} medio
 * @param {object[]} cambios los `tipo='cambio'` de esa línea y esa columna, en orden de `en`
 * @param {{anotaciones?: object[]|null, usados: Set, nombres?: Map, avisos: string[]}} ctx
 */
export function pagosDeLinea(linea, medio, cambios, ctx) {
  const etiqueta = `${linea.persona} ${linea.desde} ${linea.grupo} ${medio}`
  const pila = []
  for (const c of cambios) {
    const importe = num(c.despues) - num(c.antes)
    if (Math.abs(importe) <= CENTAVO) continue
    const anot = medio === 'efectivo' && ctx.anotaciones ? emparejarAnotacion(c, ctx.anotaciones, ctx.usados) : null
    if (anot) ctx.usados.add(anot)
    const fecha = anot?.fecha ? String(anot.fecha).slice(0, 10) : String(c.fecha_cambio ?? '').slice(0, 10)
    aplicarDelta(pila, {
      id: `lc:${c.id}`, fecha, fechaSegun: anot?.fecha ? 'anotada en la web' : 'día del cambio',
      saleDe: saleDe(medio, anot), importe, anoto: ctx.nombres?.get(c.autor) ?? (c.autor ? String(c.autor).slice(0, 8) : 'sin autor'),
      instante: c.en,
    }, ctx.avisos, etiqueta)
  }
  recortarAlAcumulado(pila, num(linea[MEDIOS[medio]]), ctx.avisos, etiqueta)
  return pila.map((p) => ({ ...p, importe: Math.round(p.importe * 100) / 100, medio,
    desde: linea.desde, hasta: linea.hasta, grupo: linea.grupo, persona: linea.persona }))
}

/**
 * NÚCLEO PURO: todos los pagos marcados en la web.
 * @param {{lineas: object[], cambios: object[], anotaciones?: object[]|null, nombres?: Map}} insumos
 *   `anotaciones` es `null` cuando la migración 20261002T1800 no está aplicada.
 * @returns {{pagos: object[], avisos: string[]}} pagos ordenados por fecha, quincena, grupo, persona
 */
export function armarPagos({ lineas, cambios, anotaciones = null, nombres = new Map() }) {
  const porLinea = new Map()
  for (const c of [...(cambios ?? [])].sort((a, b) => ms(a.en) - ms(b.en) || num(a.id) - num(b.id))) {
    if (c.tipo === 'base') continue
    const medio = Object.keys(MEDIOS).find((m) => MEDIOS[m] === c.columna)
    if (!medio) continue
    // Con la tabla de la caja, el efectivo sale de ella (`pagosEfectivoDeLaCaja`), no del historial.
    if (medio === 'efectivo' && anotaciones) continue
    if (medio === 'banco' && ORIGENES_QUE_NO_SON_PAGO.includes(c.origen)) continue
    const k = `${clave(c.liquidacion_id, c.persona_id)}|${medio}`
    if (!porLinea.has(k)) porLinea.set(k, [])
    porLinea.get(k).push(c)
  }
  const ctx = { anotaciones, usados: new Set(), nombres, avisos: [] }
  const pagos = anotaciones ? pagosEfectivoDeLaCaja(anotaciones, nombres) : []
  for (const l of lineas ?? []) {
    for (const medio of Object.keys(MEDIOS)) {
      const cs = porLinea.get(`${clave(l.liquidacion_id, l.persona_id)}|${medio}`)
      if (cs) pagos.push(...pagosDeLinea(l, medio, cs, ctx))
    }
  }
  pagos.sort((a, b) => a.fecha.localeCompare(b.fecha) || String(a.desde).localeCompare(String(b.desde))
    || String(a.grupo).localeCompare(String(b.grupo)) || String(a.persona).localeCompare(String(b.persona), 'es'))
  return { pagos, avisos: ctx.avisos }
}

/** ¿De dónde sale la fecha de este renglón de la caja? Lo dice para quien audite la réplica. */
function fechaSegunDeLaCaja(a) {
  if (!String(a.clave ?? '').startsWith('siembra:')) return 'anotada en la web'
  return String(a.nota ?? '').startsWith('siembra') ? 'siembra (fecha dicha por el dueño)' : 'corregida por el dueño'
}

/**
 * NÚCLEO PURO: los pagos en efectivo, uno por renglón de `liquidacion_pago_efectivo` (quincena ≥ corte o
 * anotado fuera de la siembra). El importe conserva su signo: un renglón negativo es una corrección que
 * devuelve el billete el día del movimiento que corrige (así lo fecha el trigger).
 * @param {object[]} anotaciones renglones con fecha, importe, origen, clave, nota, quincena_desde/hasta, grupo,
 *   persona, registrado_por, registrado_en, id
 */
export function pagosEfectivoDeLaCaja(anotaciones, nombres = new Map(), corte = CORTE_QUINCENA) {
  return (anotaciones ?? [])
    .filter((a) => String(a.quincena_desde ?? '').slice(0, 10) >= corte || !String(a.clave ?? '').startsWith('siembra:'))
    .filter((a) => Math.abs(num(a.importe)) > CENTAVO)
    .map((a) => ({
      id: `pe:${a.id}`, fecha: String(a.fecha ?? '').slice(0, 10), fechaSegun: fechaSegunDeLaCaja(a),
      saleDe: saleDe('efectivo', a), importe: Math.round(num(a.importe) * 100) / 100, medio: 'efectivo',
      anoto: nombres.get(a.registrado_por) ?? (a.registrado_por ? String(a.registrado_por).slice(0, 8) : 'sin autor'),
      instante: a.registrado_en, desde: String(a.quincena_desde ?? '').slice(0, 10),
      hasta: String(a.quincena_hasta ?? '').slice(0, 10), grupo: a.grupo, persona: a.persona,
    }))
}

/** NÚCLEO PURO: lo que el ensayo imprime — filas, total por medio y por quincena. */
export function resumen(pagos) {
  const porMedio = { banco: 0, efectivo: 0 }
  const porQuincena = new Map()
  for (const p of pagos) {
    porMedio[p.medio] += p.importe
    const k = `${p.desde}–${p.hasta} ${p.grupo}`
    const q = porQuincena.get(k) ?? { filas: 0, banco: 0, efectivo: 0 }
    q.filas += 1; q[p.medio] += p.importe
    porQuincena.set(k, q)
  }
  const r2 = (v) => Math.round(v * 100) / 100
  return { filas: pagos.length, banco: r2(porMedio.banco), efectivo: r2(porMedio.efectivo),
    porQuincena: [...porQuincena].sort(([a], [b]) => a.localeCompare(b)).map(([k, q]) => ({ quincena: k, filas: q.filas, banco: r2(q.banco), efectivo: r2(q.efectivo) })) }
}
