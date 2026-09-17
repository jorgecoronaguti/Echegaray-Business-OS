// EL RITMO DE LA BAJADA DE ARCA — CUÁNDO GASTAR UNA CORRIDA DE LA CUOTA, DECIDIDO CADA DÍA.
//
// ═══ POR QUÉ EXISTE (17/09/2026) ═══
//
// El dueño pidió la bajada DIARIA para que el IVA tenga como máximo un día de atraso. Con el plan free
// de AfipSDK no entra: 10 automatizaciones por ventana (del 10 al 10), cada corrida gasta 2 (libro R +
// libro E) y se reservan 2 para una corrida manual del dueño → 4 corridas por ventana. Diaria son ~60.
//
// El timer fijo (01, 11 y 18) usaba 3 de esas 4 y no se enteraba de las corridas manuales: si el dueño
// bajaba a mano, el día 01 —el único que captura el mes cerrado entero— podía encontrarse sin cuota.
//
// Ahora el timer corre TODOS los días a las 03:00 y esta función decide si hoy se gasta, con la cuota
// REAL del proveedor en la mano:
//   · Un DÍA PRIORITARIO (01 cierre de mes · 11 cuota renovada · 18 antes de la DDJJ) corre si hay cuota.
//   · Un día cualquiera corre SÓLO si sobra una corrida después de guardar una para cada día prioritario
//     que queda en la ventana, y si cae lejos de la última bajada y del próximo día prioritario.
// Así la cuarta corrida de la ventana se usa (en el medio del hueco más largo) sin robarle nunca al 01.
//
// Esto NO saca ninguna protección: el guardián de cuota (`presupuesto`) sigue decidiendo si alcanza.
// Sólo decide NO gastar en días que no convienen. Sin cuota del proveedor, se queda en los prioritarios.

export const DIAS_PRIORITARIOS = Object.freeze(
  String(process.env.ORQ_ARCA_DIAS_PRIORIDAD || '1,11,18').split(',').map((d) => Number(d.trim())).filter((d) => d >= 1 && d <= 31),
)
export const POR_CORRIDA = 2
export const SEPARACION_MIN = 7   // días desde la última bajada para gastar una corrida extra
export const MARGEN_PRIORITARIO = 4 // días hasta el próximo prioritario para gastar una extra

const DIA = 86400000
const fechaUTC = (iso) => new Date(`${String(iso).slice(0, 10)}T00:00:00Z`)
const iso = (d) => d.toISOString().slice(0, 10)
const diasEntre = (a, b) => Math.round((fechaUTC(b) - fechaUTC(a)) / DIA)

/**
 * La fecha CIVIL local (la VM está en hora de San Juan) de un instante. NO `toISOString()`: entre las
 * 21:00 y las 23:59 eso devuelve el día siguiente, y un catch-up nocturno del timer gastaría la corrida
 * del 01 el 30 a la noche (hallazgo de la auditoría, 17/09/2026). Es la misma fecha que usa `hasta`.
 */
export function fechaLocal(instante = new Date()) {
  const dd = (n) => String(n).padStart(2, '0')
  return `${instante.getFullYear()}-${dd(instante.getMonth() + 1)}-${dd(instante.getDate())}`
}

/** ¿Es hoy un día prioritario? */
export const esPrioritario = (hoy, dias = DIAS_PRIORITARIOS) => dias.includes(fechaUTC(hoy).getUTCDate())

/** Fin (exclusivo) de la ventana «2026-09-10→2026-10-10», o null si no se puede leer. */
export function finDeVentana(ventana) {
  const m = String(ventana ?? '').match(/→\s*(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : null
}

/** Los días prioritarios en (desde, hasta) — ambos exclusivos —, como fechas ISO. */
export function prioritariosEntre(desde, hasta, dias = DIAS_PRIORITARIOS) {
  const out = []
  for (let d = new Date(fechaUTC(desde).getTime() + DIA); iso(d) < hasta; d = new Date(d.getTime() + DIA)) {
    if (dias.includes(d.getUTCDate())) out.push(iso(d))
  }
  return out
}

/** Próximo día prioritario estrictamente después de `hoy`. */
export function proximoPrioritario(hoy, dias = DIAS_PRIORITARIOS) {
  for (let i = 1; i <= 62; i++) {
    const d = new Date(fechaUTC(hoy).getTime() + i * DIA)
    if (dias.includes(d.getUTCDate())) return iso(d)
  }
  return null
}

/**
 * NÚCLEO PURO: ¿se gasta una corrida hoy?
 *
 * @param {{hoy:string, disponible:number, fuente:string, ventana:string, ultimaBajada?:string|null, dias?:number[]}} p
 *        `disponible` es el de `presupuesto` (límite − reserva − usadas), ANTES de gastar hoy.
 * @returns {{toca:boolean, motivo:string, prioritarioSinCuota?:boolean}}
 */
export function tocaHoy({ hoy, disponible, fuente, ventana, ultimaBajada = null, dias = DIAS_PRIORITARIOS }) {
  const corridas = Math.floor(Math.max(0, Number(disponible) || 0) / POR_CORRIDA)
  const dia = fechaUTC(hoy).getUTCDate()
  // Una segunda invocación el mismo día (catch-up de Persistent=true, un reinicio) no vuelve a gastar
  // ni grita falta de cuota. El registro se anota con fechaLocal() (sync-arca), la misma fecha que acá.
  const yaBajoHoy = ultimaBajada && String(ultimaBajada).slice(0, 10) === String(hoy).slice(0, 10)
  if (dias.includes(dia) && yaBajoHoy) return { toca: false, motivo: `día prioritario (${dia}) pero ya se bajó hoy` }
  // Un día prioritario sin cuota NO se calla: `prioritarioSinCuota` le dice al script que siga y falle fuerte.
  if (corridas < 1) return { toca: false, prioritarioSinCuota: dias.includes(dia), motivo: `no queda cuota para una corrida (${disponible} disponible(s))` }
  if (dias.includes(dia)) {
    return { toca: true, motivo: `día prioritario (${dia}) con ${corridas} corrida(s) disponible(s)` }
  }

  const fin = finDeVentana(ventana)
  if (fuente !== 'proveedor' || !fin) {
    return { toca: false, motivo: 'sin cuota real del proveedor no gasto fuera de los días prioritarios' }
  }
  const reservadas = prioritariosEntre(hoy, fin, dias).length
  const extra = corridas - reservadas
  if (extra < 1) return { toca: false, motivo: `${corridas} corrida(s) y ${reservadas} día(s) prioritario(s) por delante en la ventana: no sobra ninguna` }

  const desdeUltima = ultimaBajada ? diasEntre(ultimaBajada, hoy) : Infinity
  const prox = proximoPrioritario(hoy, dias)
  const hastaProx = prox ? diasEntre(hoy, prox) : Infinity
  if (desdeUltima < SEPARACION_MIN) return { toca: false, motivo: `sobra ${extra} corrida(s) pero la última bajada fue hace ${desdeUltima} día(s)` }
  if (hastaProx < MARGEN_PRIORITARIO) return { toca: false, motivo: `sobra ${extra} corrida(s) pero el próximo día prioritario (${prox}) está a ${hastaProx} día(s)` }
  return { toca: true, motivo: `corrida extra: sobra(n) ${extra}, última bajada hace ${desdeUltima} día(s), próximo prioritario a ${hastaProx}` }
}

/** La última fecha con consumo en el registro local de uso (o null). */
export function ultimaBajadaDe(registro) {
  const fechas = (registro?.eventos ?? []).map((e) => String(e?.fecha ?? '')).filter((f) => /^\d{4}-\d{2}-\d{2}$/.test(f))
  return fechas.length ? fechas.sort().at(-1) : null
}
