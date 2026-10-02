// LOS HABERES PAGADOS QUE SE MARCAN EN LA WEB, ADENTRO DE LAS FÓRMULAS DE CAJA — EL ENGANCHE.
//
// ═══ POR QUÉ EXISTE (02/10/2026) ═══
//
// El dueño, pagando la quincena 16–30/09: lo que se marca en Liquidación de horas (pagado en banco / en
// efectivo) tiene que «reflejarse ok en todos lados», y CAJA mostraba «Efectivo en pesos» sin descontar lo que
// salió del cajón ese día. CAJA descargaba la nómina SÓLO por la planilla (Nómina: «Pagado el», Banco, Adelanto,
// Total recibo; Oficina: «Se paga el», Pagado, Banco), y la planilla se completa después — o nunca, si la web ya
// lo tiene. La web gana: desde la quincena de corte, lo pagado sale de `_HABERES_PAGADOS_RAW`.
//
// ═══ UNA FUENTE POR QUINCENA, NUNCA DOS ═══
//
// El corte no es por fecha de pago sino por QUINCENA (la columna C de la réplica contra `JORNALES_REAL_DESDE`):
// una quincena se lee de la planilla O de la web, nunca de las dos. Si el dueño además anota «Pagado el» en la
// planilla para una quincena ≥ corte, la planilla queda afuera por construcción y no se resta dos veces. La
// Oficina no tiene «desde»: su fila es un MES y se identifica por «Se paga el» (el sueldo de septiembre se paga
// el 01/10). Como el mensualizado se liquida en la web por mes en la 2ª quincena (desde septiembre), «Se paga el»
// ≥ corte es exactamente el mes que la web ya tiene.
//
// ═══ POR QUÉ EL EFECTIVO NO FILTRA «Sale de» ═══
//
// Un pago hecho con la plata de una ENTREGA A RENDIR («Sale de» = entrega a rendir) ya bajó la caja al
// entregarse — pero CAJA también DEVUELVE ese adelanto (`MOVIMIENTOS_QUE_VUELVEN`, «Adelanto de sueldo» de
// `_EFECTIVO_RAW`), justamente porque la nómina siempre restó el sueldo ENTERO. Si acá se restara sólo «caja», el
// adelanto volvería y no se iría nunca: el cajón quedaría inflado por cada adelanto. Restando todo el efectivo, el
// contrapeso que ya existe sigue cerrando, igual que con la planilla.
//
// ═══ EL CORTE ES UN PARÁMETRO DE LA RÉPLICA ═══
//
// `B2` de la réplica, escrito por su generador desde `CORTE_QUINCENA` (lib/haberes-pagados.mjs), con rótulo en A2.
// Si la celda no es una fecha (una réplica vieja, anterior a este enganche) el corte cae en 31/12/9999: la web no
// suma nada y la planilla suma todo — el comportamiento de antes, sin duplicar en ningún sentido.

/** La réplica: hoja, primera fila de datos, columnas (el contrato de `haberes-pagados-raw-pestana.mjs`). */
export const HAB = Object.freeze({
  hoja: "'_HABERES_PAGADOS_RAW'", desde: 4, corte: '$B$2',
  fecha: 'A', quincena: 'C', hasta: 'D', grupo: 'E', medio: 'G', importe: 'I', anotado: 'K',
})

/** Los grupos de la web que tienen su propio renglón en CAJA. `obreros` = todo lo que no es oficina. */
const GRUPO = { obreros: (g) => `(${g}<>"oficina")`, oficina: (g) => `(${g}="oficina")` }

const col = (h, x) => `${h.hoja}!$${x}$${h.desde}:$${x}`

/** La quincena de corte, o 31/12/9999 si la réplica todavía no la publica (= todo sigue por la planilla). */
export const corteQuincena = (h = HAB) =>
  `IF(ISNUMBER(${h.hoja}!${h.corte});${h.hoja}!${h.corte};DATE(9999;12;31))`

/** El factor que deja en la planilla sólo lo ANTERIOR al corte. `desde` = el rango de fechas que identifica la fila. */
export const antesDelCorte = (desde, h = HAB) => `(${desde}<${corteQuincena(h)})`

/** Las filas de la réplica de un medio y un grupo, de quincenas ≥ corte. Factor listo para multiplicar. */
function filasDesdeElCorte(medio, grupo, h) {
  const q = col(h, h.quincena)
  return `(${col(h, h.medio)}="${medio}")*${GRUPO[grupo](col(h, h.grupo))}*ISNUMBER(${q})*(${q}>=${corteQuincena(h)})`
}

const importe = (h) => `IF(ISNUMBER(${col(h, h.importe)});${col(h, h.importe)};0)`

// ═══ DE CONTEO A CONTEO: UN PAGO ANOTADO ANTES DEL SELLO YA ESTÁ ADENTRO DEL CONTEO (02/10/2026) ═══
//
// Esto usaba `ventanaDelConteo`, la de las demás salidas: inclusiva por DÍA (fecha ≥ día del conteo). El dueño
// marcó $6.080.000 de haberes en efectivo en la web a la mañana, contó el cajón a las ~15:15 ($26.946.000, con
// esos billetes ya afuera) y el anexo publicó $20.866.000: el mismo pago restado otra vez. La web, a diferencia
// de Compras o la planilla, SÍ guarda la hora (`Anotado el`, columna K de la réplica), así que el empate del
// mismo día no hace falta resolverlo a ciegas:
//   · sello con hora y pago con «Anotado el» → resta sólo si se anotó DESPUÉS del sello;
//   · si falta cualquiera de las dos horas → resta sólo si el pago es de un día POSTERIOR al del conteo.
// Es el criterio de `efectivo_caja_saldo` en Postgres (lo del día del conteo queda adentro): las dos caras dicen
// lo mismo. Recibe el ANCLA CRUDA (el instante del sello), no el día de gracia de `anclaDeSalida`: con el día
// de gracia, un sello sin hora haría restar justamente lo del día del conteo.
const despuesDelSello = (sello, h) => {
  const f = col(h, h.fecha); const k = col(h, h.anotado)
  const conHora = `ISNUMBER(${k})*(INT(${sello})<>${sello})`
  return `(${conHora}*(${k}>${sello})+(1-${conHora})*(${f}>INT(${sello})))*(${f}<=TODAY())`
}

/**
 * NÚCLEO PURO: los haberes pagados en EFECTIVO después del sello del conteo, según la web. DESCARGA de la caja
 * física. Ver `despuesDelSello`: de conteo a conteo, lo anotado antes del sello no resta.
 * @param {string} sello referencia al ancla CRUDA del conteo (el instante del sello, sin día de gracia)
 * @param {'obreros'|'oficina'} grupo
 */
export function formulaHaberesWebEfectivo(sello, grupo, h = HAB) {
  const f = col(h, h.fecha)
  return `SUMPRODUCT(${filasDesdeElCorte('efectivo', grupo, h)}*ISNUMBER(${f})*${despuesDelSello(sello, h)}*${importe(h)})`
}

/**
 * NÚCLEO PURO: los haberes pagados por BANCO después del corte del extracto, según la web. Ventana exclusiva,
 * igual que la planilla: lo del día del corte ya está en el saldo del extracto.
 * @param {string} corte referencia a la fecha de corte del extracto
 * @param {'obreros'|'oficina'} grupo
 */
export function formulaHaberesWebBanco(corte, grupo, h = HAB) {
  const f = col(h, h.fecha)
  return `SUMPRODUCT(${filasDesdeElCorte('banco', grupo, h)}*ISNUMBER(${f})*(${f}>${corte})*${importe(h)})`
}

/** NÚCLEO PURO: la fecha del último pago en efectivo de la web dentro de la ventana (para la fecha de CAJA!D7). */
export function maxHaberesWebEfectivo(sello, grupo, h = HAB) {
  const f = col(h, h.fecha)
  return `SUMPRODUCT(MAX(${filasDesdeElCorte('efectivo', grupo, h)}*ISNUMBER(${f})*${despuesDelSello(sello, h)}`
    + `*(${importe(h)}<>0)*IF(ISNUMBER(${f});${f};0)))`
}

// ═══ LO PAGADO TAMBIÉN DESCARGA LA OBLIGACIÓN, NO SÓLO LA CAJA (02/10/2026) ═══
//
// El dueño pagó la quincena 16–30/09 y el sueldo de Oficina de septiembre, los marcó en la web, y CAJA bajó la
// caja por esos $12.986.224 — pero `_MOVIMIENTOS` seguía publicando la MISMA quincena (Jornales proyectada al
// 30/09, $9.103.379) y el MISMO mes (Oficina · 01/10, $5.000.000) como VENCIDOS. «Faltan» pasó de $23,6 M a
// $36,5 M: lo pagado restado dos veces, una por la caja y otra por la deuda. Una obligación pagada confirma la
// proyección, no se suma a ella.
//
// El arreglo vive en el LIBRO, que es la fuente de la deuda (CAJA, Semanal y Mensual sólo lo leen): el renglón
// pendiente de una quincena ≥ corte vale MAX(0; lo proyectado − lo pagado en la web de ESA quincena y ESE grupo).
// Es fórmula, igual que el puente de Nómina: un pago marcado en la web descarga la deuda en cuanto la réplica se
// reescribe, sin esperar la corrida del libro. Lo pagado de más NO genera crédito (el MAX): un excedente en una
// quincena no es un adelanto de la siguiente hasta que alguien lo diga. Las quincenas < corte no tienen filas
// que pasen el filtro: siguen exactamente como antes.

const SERIAL_0 = Date.UTC(1899, 11, 30)
const serialDe = (anio, mes) => Math.round((Date.UTC(anio, mes - 1, 1) - SERIAL_0) / 864e5)

/** Las filas de la réplica de un grupo y de quincenas ≥ corte, en los DOS medios. */
const filasDelGrupo = (grupo, h) => {
  const q = col(h, h.quincena)
  return `${GRUPO[grupo](col(h, h.grupo))}*ISNUMBER(${q})*(${q}>=${corteQuincena(h)})`
}

/**
 * NÚCLEO PURO: lo pagado en la web (banco + efectivo) de UNA quincena de obreros, identificada por su «hasta».
 * @param {number} hasta serial del último día de la quincena (la columna D de la réplica)
 */
export function formulaPagadoWebQuincena(hasta, h = HAB) {
  if (!Number.isFinite(hasta)) throw new Error('caja-haberes-web: la quincena necesita su «hasta» como serial')
  const d = col(h, h.hasta)
  return `SUMPRODUCT(${filasDelGrupo('obreros', h)}*ISNUMBER(${d})*(${d}=${hasta})*${importe(h)})`
}

/**
 * NÚCLEO PURO: lo pagado en la web de un MES de oficina (el mensualizado se liquida en la 2ª quincena del mes:
 * su «hasta» cae en ese mes). Rango de seriales y no YEAR()/MONTH(), que con un texto en la columna da #VALUE!.
 */
export function formulaPagadoWebMes(anio, mes, grupo = 'oficina', h = HAB) {
  if (!GRUPO[grupo]) throw new Error(`caja-haberes-web: grupo desconocido ${grupo}`)
  const d = col(h, h.hasta)
  const desde = serialDe(anio, mes)
  const tope = mes === 12 ? serialDe(anio + 1, 1) : serialDe(anio, mes + 1)
  return `SUMPRODUCT(${filasDelGrupo(grupo, h)}*ISNUMBER(${d})*(${d}>=${desde})*(${d}<${tope})*${importe(h)})`
}

/** NÚCLEO PURO: la celda del libro = lo pendiente, nunca negativo. `base` = número o fórmula (con o sin «=»). */
export const netoDeLoPagadoWeb = (base, pagado) => `=MAX(0;(${String(base).replace(/^=/, '')})-${pagado})`

/**
 * NÚCLEO PURO: la réplica leída (desde A1, valores sin formato) → lo pagado por quincena (obreros) y por mes
 * (por grupo), con el MISMO filtro que las fórmulas. Es el valor en memoria del libro: el control de la corrida
 * compara lo escrito contra esto, así que tiene que decir lo mismo que la fórmula.
 * @returns {{quincena:(hasta:number)=>number, mes:(anio:number, mes:number, grupo?:string)=>number}}
 */
export function pagadoWebDeLaReplica(grilla, h = HAB) {
  const filas = Array.isArray(grilla) ? grilla : []
  const corte = typeof filas[1]?.[1] === 'number' ? filas[1][1] : Infinity
  const porQ = new Map(); const porMes = new Map()
  for (const f of filas.slice(h.desde - 1)) {
    const [, , desde, hasta, grupo, , , , imp] = f ?? []
    if (typeof desde !== 'number' || desde < corte || typeof hasta !== 'number' || typeof imp !== 'number') continue
    const g = grupo === 'oficina' ? 'oficina' : 'obreros'
    if (g === 'obreros') porQ.set(hasta, (porQ.get(hasta) ?? 0) + imp)
    const dt = new Date(SERIAL_0 + hasta * 864e5)
    const k = `${g}:${dt.getUTCFullYear()}-${dt.getUTCMonth() + 1}`
    porMes.set(k, (porMes.get(k) ?? 0) + imp)
  }
  return Object.freeze({
    corte,
    quincena: (hasta) => porQ.get(hasta) ?? 0,
    mes: (anio, mes, grupo = 'oficina') => porMes.get(`${grupo}:${anio}-${mes}`) ?? 0,
  })
}

/** Sin réplica leída: nadie pagó nada en la web y ningún renglón se toca (el comportamiento de antes). */
export const SIN_PAGOS_WEB = Object.freeze({ corte: Infinity, quincena: () => 0, mes: () => 0 })
