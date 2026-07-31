// EL PRESUPUESTO DE AUTOMATIZACIONES DE AFIP SDK — PARA NO GASTAR LO QUE NO HAY.
//
// ═══ EL AVISO DEL DUEÑO (31/07), Y TENÍA RAZÓN ═══
//
// "cuidado con eso porque usas tantas automatizaciones de afip sdk, deja solo las q se usan"
//
// Horas antes yo había pasado el sync de ARCA de `OnCalendar=*-*-05` (una vez por mes) a DIARIO, para
// cerrar un atraso de quince días. Lo que no miré es cómo se paga eso. Medido en la cuenta:
//
//   automation_limit ................ 10 por período (plan free, 10/07 → 10/08)
//   current_period_automation_usage .. 10   ← AGOTADO
//
// Y cada corrida del sync consume DOS: una para el libro R (compras) y otra para el E (ventas). O sea:
//
//   mensual .... 2 por mes    ✓ (como estaba)
//   semanal .... 8 por mes    ✓ con margen
//   DIARIO ..... ~60 por mes  ✗ seis veces el límite
//
// No había nada que "dejar sólo lo que se usa": el OS usa UN solo tipo de automatización
// (`mis-comprobantes`). El problema no era cuántas hay guardadas — es cuántas veces se las llama.
//
// ═══ POR QUÉ UN FRENO Y NO SÓLO BAJAR LA FRECUENCIA ═══
//
// Bajar la frecuencia arregla el caso de hoy y no evita el próximo: cualquiera —yo incluido— puede
// volver a subirla, o correr el script a mano varias veces depurando algo. El freno pregunta a la API
// cuánto queda ANTES de crear la automatización y se niega si no alcanza. Y deja una RESERVA: si el
// dueño necesita traer el libro con urgencia, tiene que haber cupo para eso, no puede habérselo comido
// un timer.

/** Cuántas automatizaciones consume una corrida completa del sync: libro R + libro E. */
export const POR_CORRIDA = 2

/** Cupo que NO se toca desde un timer: queda para una corrida manual urgente del dueño. */
export const RESERVA_MANUAL = 2

/**
 * NÚCLEO PURO: ¿alcanza el cupo para pedir `necesita` automatizaciones?
 *
 * @param {{usadas:number, limite:number}} cuota lo que dice la API del proyecto
 * @param {{necesita?:number, reserva?:number, manual?:boolean}} opts
 * @returns {{alcanza:boolean, disponible:number, motivo:string}}
 */
export function alcanzaElCupo({ usadas = 0, limite = 0 } = {}, { necesita = POR_CORRIDA, reserva = RESERVA_MANUAL, manual = false } = {}) {
  const libres = Math.max(0, Number(limite) - Number(usadas))
  // Una corrida MANUAL puede usar la reserva: para eso existe. Un timer, no.
  const disponible = manual ? libres : Math.max(0, libres - reserva)
  if (disponible >= necesita) {
    return { alcanza: true, disponible, motivo: `quedan ${libres} de ${limite}${manual ? '' : ` (${reserva} reservadas para uso manual)`}` }
  }
  return {
    alcanza: false,
    disponible,
    motivo: libres === 0
      ? `el cupo de automatizaciones está AGOTADO (${usadas}/${limite} en este período). No se llama a la API: cada llamada de más se factura.`
      : `quedan ${libres} de ${limite} y ${manual ? 'se necesitan' : `${reserva} están reservadas para uso manual, así que sólo se pueden usar ${disponible} y se necesitan`} ${necesita}.`,
  }
}

/**
 * La cuota del proyecto, leída de la API de la cuenta. Devuelve null si no se pudo averiguar —y en ese
 * caso el llamador decide: preferimos NO llamar antes que gastar a ciegas.
 *
 * @param {{accountToken:string, fetch?:Function}} deps
 */
export async function leerCuota({ accountToken, fetch: f = fetch } = {}) {
  if (!accountToken) return null
  const res = await f('https://app.afipsdk.com/api/v1/projects', {
    headers: { Authorization: `Bearer ${accountToken}` },
  })
  if (!res.ok) return null
  const d = await res.json()
  const p = (Array.isArray(d) ? d[0] : null)?.project
  if (!p) return null
  return {
    usadas: Number(p.current_period_automation_usage ?? 0),
    limite: Number(p.automation_limit ?? 0),
    plan: String(p.automation_billing_plan ?? ''),
    desde: String(p.subscription_current_period_start ?? '').slice(0, 10),
    hasta: String(p.subscription_current_period_end ?? '').slice(0, 10),
  }
}

/** El texto del aviso, para que el log diga qué pasó y por qué. */
export const explicar = (cuota, veredicto) => cuota
  ? `AfipSDK · plan ${cuota.plan} · ${cuota.usadas}/${cuota.limite} automatizaciones usadas en el período ${cuota.desde}→${cuota.hasta}. ${veredicto.motivo}`
  : 'AfipSDK · no pude leer el cupo de la cuenta. No llamo a la API: gastar a ciegas es peor que no traer el dato.'
