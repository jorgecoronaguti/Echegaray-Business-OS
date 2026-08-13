// LA BADLAR ES UNA FUENTE, NO UNA CONSTANTE — y por eso tiene que poder contrastarse contra el BCRA.
//
// ═══ POR QUÉ EXISTE (13/08) ═══
//
// La línea FONDEFIN entró al OS con su TNA calculada sobre una FOTO de la Badlar (22,8125% del
// 11/08). La foto quedó escrita a mano en tres números sueltos —valor, fecha y un rango min/max— y
// una auditoría independiente encontró el agujero: NINGÚN test se ponía rojo si ese valor estaba mal
// tipeado pero era plausible. Un `22,5%` en vez de `22,8125%` pasaba los once tests en verde y
// publicaba una TNA falsa con cara de dato oficial.
//
// Es la trampa que este repo ya pagó dos veces (el espejo de JORNALES, el IPC): una fuente que se
// congela —o se transcribe mal— sin gritar.
//
// ═══ LO QUE CAMBIA ═══
//
// 1. LA SERIE CRUDA, NO EL RESUMEN. Acá abajo está la respuesta de la API del BCRA tal como la
//    devolvió, rueda por rueda. El valor de referencia, su fecha y el rango se DERIVAN de ella
//    (`ultimaObservacion`, `rangoDeLaSerie`): dejan de ser tres números que alguien puede desalinear
//    entre sí. Un dedazo en el valor de referencia ya no existe como categoría — no hay dónde
//    tipearlo.
// 2. EL CONTRASTE CONTRA EL BCRA VIVO. `contrastarBadlar()` es puro y `traerSerieBcra()` trae la
//    serie de verdad. Es el único control que NO se valida contra la misma información que produce:
//    la serie guardada acá se compara contra la que publica el BCRA hoy. Lo corre
//    `scripts/canario-badlar-fondefin.mjs`.
//
// LO QUE ESTO NO ARREGLA: un dedazo DENTRO de la serie transcripta (poner 21,50 donde el BCRA dijo
// 21,25 en una rueda del medio) no lo caza ningún test offline — sólo el canario contra la API. Está
// declarado a propósito y no se disimula.

/** La variable del BCRA: "Tasa de interés BADLAR de bancos privados" (v4.0, estadísticas monetarias). */
export const BCRA_ID_VARIABLE = 7
export const BCRA_URL = `https://api.bcra.gob.ar/estadisticas/v4.0/monetarias/${BCRA_ID_VARIABLE}`

/** El BCRA publica porcentajes (22.8125); el OS trabaja en fracción (0.228125). Una sola conversión. */
export const aFraccion = (pct) => Number(pct) / 100

/**
 * LA SERIE OBSERVADA — respuesta de `${BCRA_URL}?desde=2026-07-20&hasta=2026-08-13`, leída el
 * 13/08/2026. Son las 17 ruedas hábiles del período: el crudo, no un promedio ni un recorte.
 *
 * Valores en fracción. Se guarda entera —y no sólo la última— porque el rango que la ficha de
 * FONDEFIN publica ("la misma línea sale entre 12,53% y 13,69% según el día del acta") es una
 * afirmación sobre la DISPERSIÓN, y una afirmación sobre la dispersión se sostiene con la serie o no
 * se sostiene.
 */
export const SERIE_BADLAR = [
  { fecha: '2026-07-20', valor: 0.211250 },
  { fecha: '2026-07-21', valor: 0.218750 },
  { fecha: '2026-07-22', valor: 0.220000 },
  { fecha: '2026-07-23', valor: 0.221875 },
  { fecha: '2026-07-24', valor: 0.220000 },
  { fecha: '2026-07-27', valor: 0.209375 },
  { fecha: '2026-07-28', valor: 0.220000 },
  { fecha: '2026-07-29', valor: 0.212500 },
  { fecha: '2026-07-30', valor: 0.219375 },
  { fecha: '2026-07-31', valor: 0.216250 },
  { fecha: '2026-08-03', valor: 0.214375 },
  { fecha: '2026-08-04', valor: 0.223125 },
  { fecha: '2026-08-05', valor: 0.208750 },
  { fecha: '2026-08-06', valor: 0.220000 },
  { fecha: '2026-08-07', valor: 0.215000 },
  { fecha: '2026-08-10', valor: 0.216250 },
  { fecha: '2026-08-11', valor: 0.228125 },
]

/** Cuándo se leyó la serie de arriba de la API. No es la fecha del dato: es la de la lectura. */
export const SERIE_LEIDA_EL = '2026-08-13'

/**
 * NÚCLEO PURO: convierte la respuesta de la API del BCRA en la serie del OS, ordenada por fecha.
 *
 * FALLA MOSTRANDO VACÍO, NO A MEDIAS. Si el BCRA cambia el shape (ya pasó al saltar de v3 a v4), esto
 * devuelve `[]` y el canario dice "no pude leer la serie" — que es un grito. Rellenar con lo que se
 * entienda y seguir sería exactamente el dato falso que este archivo viene a evitar.
 *
 * @param {unknown} json el body de la respuesta
 * @returns {{fecha:string, valor:number}[]} valores en fracción, ascendente por fecha
 */
export function parseSerieBcra(json) {
  const detalle = json?.results?.[0]?.detalle ?? json?.results?.detalle ?? null
  if (!Array.isArray(detalle)) return []
  const serie = []
  for (const d of detalle) {
    const fecha = typeof d?.fecha === 'string' ? d.fecha.slice(0, 10) : null
    const valor = Number(d?.valor)
    if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !Number.isFinite(valor) || valor <= 0) continue
    serie.push({ fecha, valor: aFraccion(valor) })
  }
  return serie.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0))
}

/** NÚCLEO PURO: la rueda más reciente de una serie. `null` si no hay ninguna. */
export function ultimaObservacion(serie = SERIE_BADLAR) {
  if (!Array.isArray(serie) || !serie.length) return null
  return serie.reduce((a, b) => (b.fecha > a.fecha ? b : a))
}

/**
 * NÚCLEO PURO: el mínimo y el máximo de la serie, CON las fechas en que ocurrieron y cuántas ruedas
 * la componen.
 *
 * Las ruedas se cuentan y se nombran porque el rótulo anterior decía "rango_3_semanas" sobre una
 * ventana de 16 días corridos. El número aguantaba; el rótulo mentía, y un rótulo que miente termina
 * citado como si fuera el dato.
 */
export function rangoDeLaSerie(serie = SERIE_BADLAR) {
  if (!Array.isArray(serie) || !serie.length) return null
  let min = serie[0], max = serie[0]
  for (const p of serie) {
    if (p.valor < min.valor) min = p
    if (p.valor > max.valor) max = p
  }
  const fechas = serie.map((p) => p.fecha).sort()
  return {
    min: min.valor, min_el: min.fecha,
    max: max.valor, max_el: max.fecha,
    desde: fechas[0], hasta: fechas[fechas.length - 1],
    ruedas: serie.length,
  }
}

/**
 * Cuánta diferencia entre la referencia guardada y la que publica el BCRA es un ERROR DE CARGA y no
 * un movimiento de mercado: 0,01 punto porcentual. La Badlar se publica en múltiplos de 1/16 (0,0625
 * pp), así que cualquier diferencia real es cien veces mayor que esto.
 */
export const TOLERANCIA_PP = 0.01

/** Los mensajes de este archivo los lee el dueño: la coma es el decimal (es-AR), no el punto. */
const enPct = (f) => `${(Number(f) * 100).toFixed(4).replace('.', ',')}%`

/**
 * NÚCLEO PURO: contrasta la Badlar de referencia contra la serie que publica el BCRA.
 *
 * Cuatro veredictos, y ninguno es "asumo que está bien":
 *  · `sin_serie`    no se pudo leer el BCRA → NO SE AFIRMA NADA. No saber no es coincidir.
 *  · `mal_cargada`  el BCRA tiene ESA MISMA fecha con OTRO valor → la referencia está mal tipeada.
 *                   Éste es el caso que ningún test offline puede encontrar, y el motivo del canario.
 *  · `sin_esa_fecha` el BCRA no publicó esa fecha (feriado, o una fecha inventada).
 *  · `coincide`     el valor es el que el BCRA publica para esa fecha. Si además hay ruedas
 *                   posteriores, viajan en `posteriores` con cuánto se movió: la foto sigue siendo
 *                   correcta, pero ya no es la última.
 *
 * @param {{valor:number, fecha:string}} referencia
 * @param {{fecha:string, valor:number}[]} serie la serie VIVA del BCRA
 */
export function contrastarBadlar(referencia = {}, serie = [], { toleranciaPp = TOLERANCIA_PP } = {}) {
  if (!Array.isArray(serie) || !serie.length) {
    return { estado: 'sin_serie', motivo: 'el BCRA no devolvió ninguna rueda: no se puede afirmar que la referencia esté bien' }
  }
  const enEsaFecha = serie.find((p) => p.fecha === referencia.fecha)
  const ultima = ultimaObservacion(serie)
  const posteriores = serie.filter((p) => p.fecha > String(referencia.fecha ?? ''))
  if (!enEsaFecha) {
    return { estado: 'sin_esa_fecha', fecha: referencia.fecha ?? null, ultima_del_bcra: ultima,
      motivo: `el BCRA no publica una rueda del ${referencia.fecha}` }
  }
  const difPp = Math.abs(Number(enEsaFecha.valor) - Number(referencia.valor)) * 100
  if (difPp > toleranciaPp) {
    return { estado: 'mal_cargada', fecha: referencia.fecha, guardado: Number(referencia.valor),
      publicado: enEsaFecha.valor, diferencia_pp: difPp, ultima_del_bcra: ultima,
      motivo: `la referencia dice ${enPct(referencia.valor)} y el BCRA publica ${enPct(enEsaFecha.valor)} para el ${referencia.fecha}` }
  }
  return {
    estado: 'coincide', fecha: referencia.fecha, valor: enEsaFecha.valor,
    ultima_del_bcra: ultima, ruedas_posteriores: posteriores.length,
    derrape_pp: posteriores.length ? (ultima.valor - Number(referencia.valor)) * 100 : 0,
  }
}

/**
 * Trae la serie viva del BCRA. `fetch` se inyecta para poder probar el parseo sin red.
 *
 * NO TIRA: devuelve `{ok:false, motivo}` y deja que el canario lo informe. Un canario que se cae por
 * un timeout no avisa nada, y el silencio es justo lo que vino a romper.
 *
 * @param {{fetch?:Function}} deps
 * @param {{desde?:string, hasta?:string, limit?:number}} opts
 */
export async function traerSerieBcra(deps = {}, { desde, hasta, limit = 100 } = {}) {
  const f = deps.fetch || globalThis.fetch
  if (typeof f !== 'function') return { ok: false, motivo: 'no hay fetch disponible en este runtime' }
  const q = new URLSearchParams()
  if (desde) q.set('desde', desde)
  if (hasta) q.set('hasta', hasta)
  q.set('limit', String(limit))
  const url = `${BCRA_URL}?${q}`
  try {
    const res = await f(url)
    if (!res?.ok) return { ok: false, motivo: `el BCRA respondió ${res?.status ?? '¿?'}`, url }
    const serie = parseSerieBcra(await res.json())
    if (!serie.length) return { ok: false, motivo: 'la respuesta del BCRA no trajo ninguna rueda legible (¿cambió el shape de la API?)', url }
    return { ok: true, serie, url }
  } catch (e) {
    return { ok: false, motivo: String(e?.message ?? e).slice(0, 160), url }
  }
}
