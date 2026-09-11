// LA BOLETA DE IERIC Y LA DE FODECO SON EL DECLARADO QUE «NO EXISTÍA» (11/09/2026).
//
// ═══ EL DEFECTO ═══
//
// `cargas-pagos-banco.mjs` nació el 10/09 declarando en `SIN_APAREO` que IERIC y FODECO no tenían
// contra qué aparearse: *«no hay importe declarado contra el cual compararlos»* y, de FODECO, *«no se
// le encontró un solo débito propio en el extracto»*. Las dos frases eran falsas y costaron lo mismo
// que el defecto de UOCRA que ese módulo arregló: el pago salía de la cuenta y el OS no sabía de qué
// era.
//
// ═══ LO QUE SE MIDIÓ EL 11/09, Y POR QUÉ ALCANZA ═══
//
//   · EL DECLARADO EXISTE Y ESTÁ EN DRIVE. El portal de IERIC genera dos boletas por período —
//     `ContribucionIERIC<CUIT><AAAAMM>.pdf` y `ContribucionFODECO<CUIT><AAAAMM>.pdf`— y el estudio
//     las deja en `archivo-fiscal/AAAA/IERIC/`. Cada una dice PERIODO DE APORTE, TOTAL A PAGAR al
//     centavo, número de boleta y vencimiento. Las dos son el 1 % de la misma base (Fondo de Cese
//     depositado + actualización), por eso valen lo mismo: 06 → $15.092,62 · 07 → $13.191,19 ·
//     08 → $13.794,56 (base $1.379.455,92, 23 trabajadores).
//   · FODECO SÍ TIENE DÉBITO: ES EL SEGUNDO. IERIC cobra las dos boletas por el mismo servicio de
//     Pago Mis Cuentas («IERIC CONT 1P», cuenta 35220/46 del Banco Nación), así que en el extracto
//     de Santander aparecen DOS débitos iguales el mismo día con el mismo texto —«Pago de servicios -
//     Ieric cont.1p: 30716304643» o «Compra con tarjeta de debito - Merpago*ieric»—: 31/07 (2 ×
//     $15.092,62), 18/08 (2 × $13.191,19), 11/09 (2 × $13.794,56, trx 889015905659 y 493817674210).
//     Uno es IERIC y el otro FODECO; el comprobante del banco no dice cuál es cuál, y no hace falta:
//     valen lo mismo y cancelan las dos boletas del período.
//
// ═══ LO QUE ESTE MÓDULO HACE Y LO QUE NO ═══
//
// Lee la boleta (texto del PDF, `pdf-parse` local, 0 costo de API) y la convierte en el declarado
// que `cargas-pagos-banco.mjs` necesita: `{ organismo, periodo, total, boleta, vence }`. El APAREO
// —qué débito paga qué boleta— vive allá, con el de UOCRA y el Fondo de Cese, porque es UNA regla
// de precedencia (BANCO > Compras > boleta > proyección) y no dos.
//
// NO INVENTA UNA BOLETA. Si el PDF no parsea, si el nombre del archivo dice IERIC y el texto FODECO,
// o si el CUIT no es el de la empresa, esa boleta no entra y se avisa con nombre. Y NO ESCRIBE una
// réplica en el Sheet: el declarado de IERIC/FODECO no está en la serie «Total declarado gremiales»
// de Cargas Sociales (ver `cargas-bloques.mjs`), así que el Libro lo trata aparte —`fueraDelDeclarado`
// en `cargas-pagos-banco.mjs`— y esta lectura alcanza con hacerse en la corrida del Libro.
//
// El parser y el «vigentes» son puros. `leerBoletasIeric` recibe `query` y `google` como parámetros
// para poder probarse con dobles, igual que el indexador de Drive.

const txt = (v) => String(v ?? '').trim()

/** El nombre con que el portal de IERIC genera cada boleta: organismo, CUIT del empleador, AAAAMM. */
export const RE_ARCHIVO_BOLETA = /^Contribucion(IERIC|FODECO)(\d{11})(\d{4})(\d{2})\.pdf$/i

/** El CUIT que tiene que decir la boleta: la de otro empleador no es una obligación nuestra. */
export const CUIT_EMPLEADOR = '30-71630464-3'

/** «13.794,56» (es-AR) → 13794.56. Devuelve null si no es un importe. */
export function importeEsAr(s) {
  const m = /^(\d{1,3}(?:\.\d{3})*|\d+),(\d{2})$/.exec(txt(s))
  if (!m) return null
  return Number(`${m[1].replace(/\./g, '')}.${m[2]}`)
}

/**
 * NÚCLEO PURO: una boleta de IERIC/FODECO a partir del texto de su PDF.
 *
 * El PDF trae la boleta DOS veces (talón del empleador y del recaudador): se toma la primera
 * aparición de cada dato. Los dos talones dicen lo mismo, y si no lo dijeran el problema sería del
 * portal, no de este parser.
 *
 * @returns {{organismo:'IERIC'|'FODECO', periodo:string, total:number, boleta:string|null,
 *            vence:string|null, cuit:string|null, trabajadores:number|null, base:number|null}|null}
 */
export function parsearBoletaIeric(texto) {
  const t = String(texto ?? '').replace(/\s+/g, ' ')
  const org = /PAGO 1% (IERIC|FODECO) \$/i.exec(t)
  const per = /PERIODO DE APORTE (\d{4})\/(\d{2})/i.exec(t)
  const tot = /TOTAL A PAGAR \$ ?([\d.]+,\d{2})/i.exec(t)
  const total = tot ? importeEsAr(tot[1]) : null
  if (!org || !per || total === null) return null
  const mes = Number(per[2])
  if (mes < 1 || mes > 12) return null
  const bol = /N[úu]mero de Boleta: ?(\d+)/i.exec(t)
  const ven = /VENCIMIENTO DE PAGO (\d{2})\/(\d{2})\/(\d{2})/i.exec(t)
  const cuit = /CUIT: ?(\d{2}-\d{8}-\d)/.exec(t)
  const trab = /TOTAL TRABAJADORES (\d+)/i.exec(t)
  const base = /\bTOTAL ([\d.]+,\d{2}) (?:\(Solo RED BANELCO \/ PMC\) )?\d{30,}/.exec(t)
  return {
    organismo: org[1].toUpperCase(),
    periodo: `${per[1]}-${per[2]}`,
    total,
    boleta: bol ? bol[1] : null,
    vence: ven ? `20${ven[3]}-${ven[2]}-${ven[1]}` : null,
    cuit: cuit ? cuit[1] : null,
    trabajadores: trab ? Number(trab[1]) : null,
    base: base ? importeEsAr(base[1]) : null,
  }
}

/**
 * NÚCLEO PURO: ¿el nombre del archivo y su texto cuentan la misma boleta?
 * Devuelve el motivo del rechazo, o null si es coherente. Un archivo renombrado a mano, o la boleta
 * de otro empleador en nuestra carpeta, no puede convertirse en una obligación nuestra.
 */
export function incoherencia(nombre, b) {
  if (!b) return 'no parsea: sin PERIODO DE APORTE, TOTAL A PAGAR u organismo'
  if (b.cuit && b.cuit !== CUIT_EMPLEADOR) return `es de otro empleador (CUIT ${b.cuit})`
  const m = RE_ARCHIVO_BOLETA.exec(txt(nombre))
  if (!m) return null
  if (m[1].toUpperCase() !== b.organismo) return `el nombre dice ${m[1].toUpperCase()} y el texto ${b.organismo}`
  if (`${m[3]}-${m[4]}` !== b.periodo) return `el nombre dice ${m[3]}-${m[4]} y el texto ${b.periodo}`
  return null
}

/**
 * NÚCLEO PURO: las boletas por período, una de cada organismo.
 * Si un período tiene dos boletas del mismo organismo (rectificativa, reimpresión), gana la de MAYOR
 * número de boleta: el portal numera correlativo y la última emitida es la vigente.
 *
 * @returns {Map<string, {periodo:string, IERIC:object|null, FODECO:object|null}>}
 */
export function boletasIericVigentes(lista = []) {
  const out = new Map()
  for (const b of lista) {
    if (!b?.periodo || !b.organismo || !(b.total > 0)) continue
    const p = out.get(b.periodo) ?? { periodo: b.periodo, IERIC: null, FODECO: null }
    const ya = p[b.organismo]
    if (!ya || Number(b.boleta ?? 0) > Number(ya.boleta ?? 0)) p[b.organismo] = b
    out.set(b.periodo, p)
  }
  return out
}

/** «AAAAMM» de hace `meses` meses: la ventana de boletas que vale la pena leer en cada corrida. */
export function periodoDesde(hoy = new Date(), meses = 13) {
  const d = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() - meses, 1))
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

/**
 * Las boletas de IERIC/FODECO que están en el índice de Drive, leídas del PDF.
 *
 * Misma disciplina que `f931-sheet.mjs`: se buscan en `public.drive_index` (no se recorre Drive), de
 * dos copias del mismo nombre vale la más nueva, y un PDF que no se pudo leer se nombra y se sigue.
 * NUNCA rompe la corrida: sin base o sin Drive devuelve [] y avisa — la única consecuencia es que
 * IERIC/FODECO vuelven a quedar sin aparear, que es el estado de ayer.
 *
 * @param {{query:Function, google:{readPdfText:Function}, aviso?:Function, hoy?:Date}} deps
 * @returns {Promise<Array<object>>} boletas parseadas, con `archivo` y `drive_file_id`
 */
export async function leerBoletasIeric({ query, google, aviso = () => {}, hoy = new Date() } = {}) {
  let filas = []
  try {
    const r = await query(
      `select name, drive_file_id, path, modified_time from public.drive_index
        where name ~* '^Contribucion(IERIC|FODECO)\\d{17}\\.pdf$' and mime_type = 'application/pdf'
          and coalesce(trashed, false) = false and coalesce(ausente_en_drive, false) = false
          and substring(name from '(\\d{6})\\.pdf$') >= $1
        order by name, modified_time desc nulls last`, [periodoDesde(hoy)])
    filas = r?.rows ?? r ?? []
  } catch (e) {
    aviso(`cargas-boletas-ieric: no pude consultar drive_index (${String(e?.message ?? e).slice(0, 60)}) — IERIC/FODECO sin aparear en esta corrida.`)
    return []
  }
  const porNombre = new Map()
  for (const f of filas) if (!porNombre.has(f.name)) porNombre.set(f.name, f)
  const out = []
  for (const a of porNombre.values()) {
    try {
      const { text, scanned } = await google.readPdfText(a.drive_file_id, { maxChars: 8000 })
      if (scanned) { aviso(`cargas-boletas-ieric: ${a.name} es un PDF escaneado, sin texto — no entra.`); continue }
      const b = parsearBoletaIeric(text)
      const motivo = incoherencia(a.name, b)
      if (motivo) { aviso(`cargas-boletas-ieric: ${a.name} no entra — ${motivo}.`); continue }
      out.push({ ...b, archivo: a.name, drive_file_id: a.drive_file_id })
    } catch (e) {
      aviso(`cargas-boletas-ieric: no pude leer ${a.name} (${String(e?.message ?? e).slice(0, 60)}).`)
    }
  }
  return out
}
