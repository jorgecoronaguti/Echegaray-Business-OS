// CUÁNDO UNA COBRANZA ESTÁ VENCIDA PARA LAS CARAS DEL OS — la columna U de la pestaña Cobranzas.
//
// ═══ EL PEDIDO (dueño, 14/09/2026) ═══
//
// «Marca cualquier cosa como vencido y no condice con lo que se ve en el portal; todo tiene que
// consolidarse en Supabase y leerse de ahí.» Medido ese día: cuatro definiciones vivas del mismo
// concepto. La ficha y la cartera usaban emisión + 30 días; la cuenta corriente, `Q < hoy` sobre
// Pendiente Y Facturado; el portal, `Q < hoy` sobre todo lo no cobrado ni proyectado, con hoy en UTC.
//
// ═══ LA REGLA ES LA DEL SHEET, TEXTUAL ═══
//
//     U = IF(O="Cobrado";"Cobrado"; IF(O="Pendiente"; IF(Q<TODAY();"Vencido"; Q-TODAY()); O))
//
// O es el estado y Q la «Fecha cobro». P —la fecha de venta— NO es un vencimiento. Facturado,
// Proyectado, CANCELAR o cualquier otro estado se muestran como su estado: nunca como vencido.
//
// La definición canónica vive en Postgres: `public.estado_de_cobro(estado, fecha_cobro, hoy)`
// (migración 20260914T1200). Esto es su GEMELO para el código que no lee de la base —el sync del
// portal y la proyección en vivo—, y `cobranza-estado-de-cobro.pg.test.mjs` lo compara fila por fila
// contra la función SQL sobre la réplica real. Si divergen, ese test se pone rojo.
//
// ═══ DOS DETALLES QUE NO SON INTERPRETACIÓN ═══
//
// · MAYÚSCULAS: el `=` de Google Sheets entre textos no distingue mayúsculas —«pendiente» es igual a
//   «Pendiente»—, así que acá tampoco. Espacios sí distingue, y acá tampoco se recortan.
// · Q VACÍA: en el Sheet una celda vacía vale 0 y `0 < TODAY()` da «Vencido». Acá NO: sin fecha no se
//   puede afirmar que venció, y es `otro`. Es la única desviación deliberada de la fórmula; al
//   14/09/2026 ninguna fila Pendiente de la réplica tiene Q vacía, así que hoy no cambia ningún número.
//
// ═══ HOY ES HOY EN SAN JUAN ═══
//
// Entre las 21:00 y las 24:00 de Argentina la fecha UTC ya es mañana: con UTC, un cobro que vence hoy
// se pintaba vencido tres horas antes de que termine el día.

export const ZONA_SAN_JUAN = 'America/Argentina/San_Juan'

/** @typedef {'cobrado'|'vencido'|'a_vencer'|'otro'} EstadoDeCobro */

/**
 * La fecha de hoy en San Juan, `YYYY-MM-DD`.
 * @param {Date} [ahora]
 */
export function hoyEnSanJuan(ahora = new Date()) {
  return ahora.toLocaleDateString('en-CA', { timeZone: ZONA_SAN_JUAN })
}

/**
 * Una fecha como la trae Postgres o un test, recortada al día. Un `Date` se lee en San Juan: un
 * `timestamptz` de las 23:00 del 25 en Argentina es el 25, aunque en UTC ya sea el 26.
 * @param {string|Date|null|undefined} v
 * @returns {string|null}
 */
export function diaISO(v) {
  if (v == null || v === '') return null
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : hoyEnSanJuan(v)
  const s = String(v).trim()
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null
}

/**
 * EL ESTADO DE COBRO de una fila de Cobranzas. Mismo resultado que `public.estado_de_cobro`.
 *
 * @param {string|null|undefined} estado columna O
 * @param {string|Date|null|undefined} fechaCobro columna Q
 * @param {string|Date} hoy `YYYY-MM-DD` en San Juan, o un instante (se convierte a San Juan)
 * @returns {EstadoDeCobro}
 */
export function estadoDeCobro(estado, fechaCobro, hoy) {
  const o = estado == null ? null : String(estado).toLowerCase()
  if (o === 'cobrado') return 'cobrado'
  if (o !== 'pendiente') return 'otro'
  const q = diaISO(fechaCobro)
  const h = diaISO(hoy)
  if (q === null || h === null) return 'otro'
  return q < h ? 'vencido' : 'a_vencer'
}

/**
 * Días de la columna U: `Q − hoy`. Negativo = días de atraso; cero o positivo = días de espera.
 * `null` sin fecha.
 * @param {string|Date|null|undefined} fechaCobro
 * @param {string|Date} hoy
 */
export function diasParaCobro(fechaCobro, hoy) {
  const q = diaISO(fechaCobro)
  const h = diaISO(hoy)
  if (q === null || h === null) return null
  return Math.round((Date.parse(`${q}T00:00:00Z`) - Date.parse(`${h}T00:00:00Z`)) / 86_400_000)
}
