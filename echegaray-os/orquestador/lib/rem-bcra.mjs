// REM DEL BCRA LEÍDO DE SU PROPIA PLANILLA — la inflación esperada sin pasar por un modelo.
//
// ═══ POR QUÉ (26/09/2026) ═══
//
// Los índices se traían con la búsqueda web del proveedor del modelo: dos búsquedas pagas, un texto
// libre y un regex que adivinaba meses en español. El dueño: «tenemos muchas herramientas propias
// de inteligencia para que todo se siga basando en Claude — hay que cambiar eso». El dato ya está
// publicado y estructurado: el BCRA sube cada mes `relevamiento-expectativas-mercado-tablas-AAAA-MM.xlsx`
// con la mediana mes por mes. Leerla es gratis, exacta y no confunde enero del año que viene con
// enero de éste (el regex sí: «enero» siempre era del año en curso).
//
// LO QUE NO HACE: si la página cambia y no aparece la planilla, o la planilla no trae el bloque del
// IPC nivel general, devuelve error. No hay fallback a otra fuente ni a un número a mano.

export const PAGINA_REM = 'https://www.bcra.gob.ar/PublicacionesEstadisticas/Relevamiento_Expectativas_de_Mercado.asp'
const ORIGEN = 'https://www.bcra.gob.ar'
const MES_EN = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 }

/** PURO: el link a la planilla de tablas más reciente que aparezca en el HTML de la página. */
export function linkDeTablas(html) {
  const links = [...String(html ?? '').matchAll(/href="([^"]*relevamiento-expectativas-mercado-tablas-(\d{4})-(\d{2})\.xlsx)"/gi)]
    .map((m) => ({ url: m[1].startsWith('http') ? m[1] : ORIGEN + m[1], edicion: `${m[2]}-${m[3]}` }))
    .sort((a, b) => b.edicion.localeCompare(a.edicion))
  return links[0] ?? null
}

/**
 * PURO: de las filas de la hoja «Cuadros de resultados» saca la MEDIANA de la variación mensual del
 * IPC nivel general. Filas como ["Aug-26","var. % mensual","1.7",...].
 * @returns {Array<{periodo:string, variacion:number}>}
 */
export function variacionesDelCuadro(filas) {
  const i0 = filas.findIndex((f) => /IPC nivel general/i.test(String(f?.[0] ?? '')))
  if (i0 < 0) return []
  const out = []
  for (const f of filas.slice(i0 + 1)) {
    if (!f?.length) { if (out.length) break; continue }
    const m = /^([a-z]{3})-(\d{2})$/i.exec(String(f[0]).trim())
    if (!m || !/mensual/i.test(String(f[1] ?? ''))) continue
    const mes = MES_EN[m[1].toLowerCase()]
    const v = Number(String(f[2]).replace(',', '.'))
    // Mismo filtro que el parser viejo: un IPC mensual fuera de 0–15% es un error de lectura.
    if (!mes || !Number.isFinite(v) || v <= 0 || v > 15) continue
    out.push({ periodo: `20${m[2]}-${String(mes).padStart(2, '0')}`, variacion: Math.round((v / 100) * 1e6) / 1e6 })
  }
  return out
}

/** Baja la página, encuentra la planilla vigente y devuelve las medianas. */
export async function leerRemBcra({ bajar = fetch } = {}) {
  const pedir = async (url) => {
    const r = await bajar(url, { headers: { 'user-agent': 'Mozilla/5.0 (EchegarayOS)' }, redirect: 'follow', signal: AbortSignal.timeout(30_000) })
    if (!r.ok) throw new Error(`BCRA respondió ${r.status} en ${url}`)
    return r
  }
  const link = linkDeTablas(await (await pedir(PAGINA_REM)).text())
  if (!link) throw new Error('la página del REM no trae la planilla de tablas')
  const XLSX = await import('xlsx')
  const wb = XLSX.read(Buffer.from(await (await pedir(link.url)).arrayBuffer()), { type: 'buffer' })
  const hoja = wb.Sheets['Cuadros de resultados'] ?? wb.Sheets[wb.SheetNames[0]]
  const variaciones = variacionesDelCuadro(XLSX.utils.sheet_to_json(hoja, { header: 1, raw: false }))
  if (!variaciones.length) throw new Error(`la planilla ${link.edicion} no trae el IPC nivel general mes por mes`)
  return { edicion: link.edicion, url: link.url, variaciones }
}
