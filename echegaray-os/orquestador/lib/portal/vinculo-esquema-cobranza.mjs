// EL VÍNCULO QUE LE FALTA A UNA FILA DEL ESQUEMA — propuesta pura, sin base, para que la revise una
// persona antes de escribirla.
//
// ═══ POR QUÉ EXISTE (auditoría, 14/09/2026) ═══
//
// Una fila de `esquema_pago` sin `cobranza_fila` no tiene contraparte en la réplica de Cobranzas:
// `vivo.ts` no puede refrescarla y su copia queda congelada. Ese día había 14 así, y dos de ellas
// —La Estrella «Faltante (2 de 2)» y Messina «Cobro» del Pilón— se le publicaban vencidas al cliente
// estando COBRADAS en el Sheet. El portal ya no las pinta vencidas; lo que falta es resolver la fila.
//
// ═══ LO QUE ENSEÑÓ LA PRIMERA CORRIDA: NO TODAS ESTÁN SIN VINCULAR, ALGUNAS ESTÁN DUPLICADAS ═══
//
// Las dos filas de la auditoría calzan exacto con una fila de Cobranzas (La Estrella id 40, mismo
// importe; Pilón id 30, 0,12 %) — pero esa fila de Cobranzas YA está vinculada a OTRA fila del
// esquema («Faltante - GALPON 9» y «PILON»). O sea: son copias viejas de un pago que el esquema ya
// tiene bien atado. Vincularlas dejaría dos filas del esquema apuntando a la misma de Cobranzas;
// lo que corresponde es retirar la copia. Eso se informa como DUPLICADO, con el id de la otra fila.
//
// ═══ POR QUÉ PROPONE Y NO ESCRIBE ═══
//
// El vínculo y el retiro cambian lo que ve un cliente externo (Nivel E): un vínculo equivocado le
// publicaría el cobro de OTRA fila, un retiro equivocado le borraría un pago. Acá sólo se calcula la
// propuesta con su evidencia; el SQL lo revisa quien no lo construyó y lo corre un tercero.
//
// ═══ LA REGLA DE CALCE, EN ORDEN ═══
//
//   1 · mismo `cliente_id` y misma moneda; la fila de Cobranzas no está anulada;
//   2 · importe nativo dentro de ±1 % (Messina: $3.488.735 guardado contra $3.484.558 del Sheet);
//   3 · fecha de cobro a no más de 45 días de la fecha guardada (la Q se re-tipea al cobrar);
//   4 · si las dos nombran una certificación («3/9»), tiene que ser la misma: Quattropani tiene ocho
//       cuotas de U$S 4.235 y el importe solo no las distingue.
// Se ordena por certificación coincidente, después menor diferencia de importe, después de días.
// Si la mejor fila libre empata en todo con la segunda, es AMBIGUO. Si dos filas del esquema eligen la
// misma fila libre, es CONFLICTO. Si no hay ninguna libre pero sí una ya vinculada, es DUPLICADO.

import { certificacionDeConcepto, FILA_BASE, huellaDe } from './cobranzas-a-cliente.mjs'

export const TOLERANCIA_IMPORTE = 0.01
export const VENTANA_DIAS = 45

const diaISO = (v) => {
  if (v == null || v === '') return null
  const s = v instanceof Date ? v.toISOString() : String(v)
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null
}

const distanciaEnDias = (a, b) => (a && b
  ? Math.round(Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000)
  : null)

const monedaDe = (m) => (String(m ?? '').trim().toUpperCase() === 'USD' ? 'USD' : 'ARS')

/** La fila física de Cobranzas si pasa el filtro de identidad (cliente, moneda, no anulada). */
function filaElegible(pago, c) {
  if (!c?.cliente_id || c.cliente_id !== pago?.cliente_id) return null
  if (String(c.estado ?? '').trim().toUpperCase() === 'CANCELAR') return null
  if (monedaDe(c.moneda) !== monedaDe(pago.moneda)) return null
  const n = Number(String(c.sheet_id ?? '').trim())
  return Number.isInteger(n) && n >= 1 ? n + FILA_BASE : null
}

/** Todas las filas de Cobranzas que calzan con el pago, libres o no, de la mejor a la peor. */
function calces(pago, cobranzas) {
  const monto = Number(pago?.monto)
  if (!Number.isFinite(monto) || monto === 0) return []
  const cert = certificacionDeConcepto(pago?.concepto)
  const out = []
  for (const c of cobranzas) {
    const fila = filaElegible(pago, c)
    if (fila === null) continue
    const importe = Number(c.total_bruto_origen ?? c.total_bruto)
    if (!Number.isFinite(importe)) continue
    const difPct = Math.abs(importe - monto) / Math.abs(monto)
    if (difPct > TOLERANCIA_IMPORTE) continue
    const difDias = distanciaEnDias(diaISO(pago.fecha), diaISO(c.fecha_cobro))
    if (difDias === null || difDias > VENTANA_DIAS) continue
    const suCert = certificacionDeConcepto(c.concepto)
    if (cert && suCert && (cert.numero !== suCert.numero || cert.de !== suCert.de)) continue
    out.push({
      fila, clave: `${c.cliente_id}:${fila}`, sheet_id: String(c.sheet_id).trim(), concepto: c.concepto ?? null,
      estado: c.estado ?? null, fecha_cobro: diaISO(c.fecha_cobro), importe, dif_pct: difPct, dif_dias: difDias,
      misma_certificacion: Boolean(cert && suCert), ...huellaDe(c),
    })
  }
  return out.sort((a, b) => Number(b.misma_certificacion) - Number(a.misma_certificacion)
    || a.dif_pct - b.dif_pct || a.dif_dias - b.dif_dias)
}

/**
 * Las filas de Cobranzas LIBRES que podrían ser la de este pago, con su evidencia.
 *
 * @param pago fila de `esquema_pago`: `{ id, cliente_id, monto, fecha, moneda, concepto }`
 * @param cobranzas filas de `public.cobranzas` (origen `cobranzas_sheet`)
 * @param vinculadas `Map` (o `Set`) de `"cliente_id:cobranza_fila"` ya usados → id de la fila del esquema
 */
export function candidatos(pago, cobranzas = [], vinculadas = new Map()) {
  return calces(pago, cobranzas).filter((c) => !vinculadas.has(c.clave))
}

const empatan = (a, b) => a.misma_certificacion === b.misma_certificacion
  && Math.abs(a.dif_pct - b.dif_pct) < 1e-9 && a.dif_dias === b.dif_dias

function proponerUno(pago, cobranzas, vinculadas) {
  const todos = calces(pago, cobranzas)
  const libres = todos.filter((c) => !vinculadas.has(c.clave))
  if (libres.length === 0) {
    const ocupada = todos[0]
    if (!ocupada) return { pago, propuesta: null, motivo: 'sin_candidato', candidatos: [] }
    const duplicadoDe = vinculadas instanceof Map ? vinculadas.get(ocupada.clave) ?? null : null
    return { pago, propuesta: null, motivo: 'duplicado', duplicado_de: duplicadoDe, candidatos: todos }
  }
  if (libres.length > 1 && empatan(libres[0], libres[1])) {
    return { pago, propuesta: null, motivo: 'ambiguo', candidatos: libres }
  }
  return { pago, propuesta: libres[0], motivo: 'propuesto', candidatos: libres }
}

/**
 * LA PROPUESTA PARA CADA PAGO: `propuesto`, `duplicado`, `ambiguo`, `conflicto` o `sin_candidato`.
 * Sólo `propuesto` trae `propuesta`; `duplicado` trae `duplicado_de`; los otros, los candidatos.
 */
export function proponerVinculos(pagos = [], cobranzas = [], vinculadas = new Map()) {
  const res = pagos.map((pago) => proponerUno(pago, cobranzas, vinculadas))
  const usos = new Map()
  for (const r of res) if (r.propuesta) usos.set(r.propuesta.clave, (usos.get(r.propuesta.clave) ?? 0) + 1)
  return res.map((r) => (r.propuesta && usos.get(r.propuesta.clave) > 1
    ? { ...r, propuesta: null, motivo: 'conflicto' }
    : r))
}

const literal = (v) => (v == null ? 'null'
  : typeof v === 'number' ? String(v)
  : `'${String(v).replaceAll("'", "''")}'`)

/**
 * EL UPDATE QUE HABRÍA QUE CORRER, para revisar. `and cobranza_fila is null` hace que no pise un
 * vínculo que alguien haya puesto entre la propuesta y la aplicación. La huella viaja con el vínculo:
 * sin ella el worker no puede verificar que la fila del Sheet siga siendo la que era.
 */
export function sqlDelVinculo(r) {
  if (!r?.propuesta) return null
  const huellaMonto = r.propuesta.huella_monto == null ? null : Number(r.propuesta.huella_monto)
  return `update public.esquema_pago set cobranza_fila = ${r.propuesta.fila}, `
    + `huella_comprobante = ${literal(r.propuesta.huella_comprobante)}, huella_monto = ${literal(huellaMonto)} `
    + `where id = ${literal(r.pago.id)} and cobranza_fila is null;`
}

/**
 * EL RETIRO DE UN DUPLICADO, COMENTADO. Ocultarlo del portal o borrarlo es una decisión de quien
 * revisa —la fila puede tener reprogramaciones o una nota—, así que sale como comentario con la
 * evidencia, no como sentencia lista para correr.
 */
export function sqlDelDuplicado(r) {
  if (r?.motivo !== 'duplicado') return null
  const c = r.candidatos[0]
  return `-- DUPLICADO: ${literal(r.pago.id)} calza con Cobranzas id ${c.sheet_id} (fila ${c.fila}, ${c.estado ?? '—'}), `
    + `ya vinculada a ${literal(r.duplicado_de)}.\n`
    + `-- update public.esquema_pago set visible_portal = false where id = ${literal(r.pago.id)} and cobranza_fila is null;`
}
