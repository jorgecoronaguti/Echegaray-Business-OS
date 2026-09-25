// ═══ EL DÓLAR DE REFERENCIA LO ESCRIBE LA CORRIDA, NO GOOGLEFINANCE (25/09/2026, opción A del dueño) ═══
//
// `_CAJA_ANEXO` tenía `=IFERROR(GOOGLEFINANCE("CURRENCY:USDARS");"")`. La cotización se mueve cada
// minuto (1521,573 → 1521,492 → 1521,502 medido el 25/09) y cada movimiento recalcula en cadena todo lo
// que cuelga de `TIPO_CAMBIO_USD`: Cobranzas, OBRAS, CAJA, _MOVIMIENTOS y los 9.785 SUMPRODUCT de los
// dos Cash Flow. Google no contesta una lectura hasta terminar: medido en una COPIA del archivo sin
// nadie editando, leer dos celdas tardó 60–119 s con la fórmula viva y 0,6 s con el número clavado. El
// pipeline no terminaba desde el 24/09 a las 21:19.
//
// LA FUENTE ES EL BCRA, NO `tc_vigente()`. `public.tipo_cambio` —de donde lee `tc_vigente()`— la llena
// `obras-economia-sync.mjs` leyendo ESTA celda: escribir la celda desde la base cerraría el círculo y el
// dólar quedaría congelado para siempre sin un solo error a la vista. La Comunicación A 3500 (mayorista)
// es la referencia oficial, tiene fecha y es independiente del archivo; contra GOOGLEFINANCE difiere en
// centésimas (24/09: BCRA 1519,50 · Sheet 1519,88). El BCRA la publica una vez por día hábil: entre la
// apertura y la publicación rige la del último día hábil, y la celda lo dice con su fecha.
//
// Si el BCRA no contesta, se cae a `tc_vigente()` DECLARÁNDOLO (es la última cotización que vio el
// archivo, con su fecha). Si tampoco hay eso, no se escribe nada: la celda queda con lo que tenía.

export const URL_BCRA = 'https://api.bcra.gob.ar/estadisticascambiarias/v1.0/Cotizaciones/USD'

/**
 * NÚCLEO PURO: la última cotización del cuerpo de la API del BCRA con fecha <= hoy.
 * @param {any} cuerpo  JSON de /Cotizaciones/USD
 * @param {string} hoy  'AAAA-MM-DD'
 * @returns {{tc:number, fecha:string}|null}
 */
export function ultimaCotizacionBcra(cuerpo, hoy) {
  const filas = Array.isArray(cuerpo?.results) ? cuerpo.results : []
  let mejor = null
  for (const r of filas) {
    const fecha = String(r?.fecha ?? '').slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || fecha > hoy) continue
    const usd = (r?.detalle ?? []).find((d) => d?.codigoMoneda === 'USD')
    const tc = Number(usd?.tipoCotizacion)
    if (!Number.isFinite(tc) || tc <= 0) continue
    if (!mejor || fecha > mejor.fecha) mejor = { tc, fecha }
  }
  return mejor
}

/** 'AAAA-MM-DD' → serial de Sheets (días desde 1899-12-30). PURA. */
export function serialDeFecha(iso) {
  const [a, m, d] = String(iso).slice(0, 10).split('-').map(Number)
  return Math.round((Date.UTC(a, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000)
}

const ddmm = (iso) => { const [a, m, d] = String(iso).slice(0, 10).split('-'); return `${d}/${m}/${a}` }

/**
 * NÚCLEO PURO: la cotización que se escribe, con su fecha y el texto de origen.
 * @param {{bcra:{tc:number,fecha:string}|null, base:{tc:number,fecha:string}|null, leidoEn:string}} o
 *   `leidoEn` es la hora de lectura ya formateada ('25/09/2026 11:20').
 * @returns {{tc:number, fechaSerial:number, origen:string, fuente:'bcra'|'base'}|null}
 */
export function cotizacionAEscribir({ bcra, base, leidoEn }) {
  if (bcra?.tc > 0) {
    return { tc: bcra.tc, fechaSerial: serialDeFecha(bcra.fecha), fuente: 'bcra',
      origen: `BCRA · Com. A 3500 (mayorista) del ${ddmm(bcra.fecha)} · leída por el OS el ${leidoEn}. La escribe cada corrida; no se carga a mano.` }
  }
  if (base?.tc > 0) {
    return { tc: base.tc, fechaSerial: serialDeFecha(base.fecha), fuente: 'base',
      origen: `⚠ el BCRA no contestó: última cotización que vio el archivo (${ddmm(base.fecha)}, public.tipo_cambio) · leída por el OS el ${leidoEn}` }
  }
  return null
}

/** IMPURA: pide al BCRA los últimos 10 días y devuelve la última. Nunca lanza: null si no pudo. */
export async function leerBcra({ hoy, fetchImpl = globalThis.fetch, timeoutMs = 20000 } = {}) {
  const desde = new Date(Date.parse(`${hoy}T12:00:00Z`) - 10 * 86400000).toISOString().slice(0, 10)
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), timeoutMs)
  try {
    const r = await fetchImpl(`${URL_BCRA}?fechadesde=${desde}&fechahasta=${hoy}`, { signal: ac.signal })
    if (!r.ok) return null
    return ultimaCotizacionBcra(await r.json(), hoy)
  } catch { return null } finally { clearTimeout(t) }
}
