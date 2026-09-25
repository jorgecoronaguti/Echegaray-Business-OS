// ALARMA DE «SIN CRÉDITO» EN LA API DE ANTHROPIC — aviso inmediato, una vez por episodio.
//
// ═══ POR QUÉ ═══
//
// 25/09/2026 08:17: la cuenta prepaga se quedó sin crédito y se cortó la lectura de comprobantes de
// toda la empresa hasta que el dueño recargó (08:30). Nadie avisó: el OS degradaba en silencio.
//
// ═══ QUÉ SE MIRA Y QUÉ NO ═══
//
// HECHO: la API con clave normal no informa el saldo, y la Admin API (/v1/organizations/cost_report)
// tampoco lo devuelve — sólo la consola lo muestra. El dueño (25/09) descartó estimarlo con un saldo
// informado a mano: prefiere un OS autosuficiente que no le pregunte nada. Lo que sí es una MEDICIÓN
// directa es el rechazo: cada llamada que la API rechaza por falta de saldo queda en orq.chat_cost con
// `error_kind = 'credit'` (lib/ia/clasificar-error.mjs). Eso se vigila cada 5 minutos, sin llamar a
// la API: una consulta a Postgres.
//
// Un EPISODIO es una racha de rechazos por crédito sin una llamada exitosa en el medio; se identifica
// por el primero. Un solo aviso por episodio: el timer corre 288 veces por día y un aviso que se
// repite deja de leerse.

export const TZ = 'America/Argentina/San_Juan'

/** Clave en public.os_runtime donde queda el último episodio avisado (ISO del primer rechazo). */
export const CLAVE_ESTADO = 'alarma_credito_episodio'

/** HH:MM en la hora de la empresa. */
export function hhmm(fecha, tz = TZ) {
  return new Intl.DateTimeFormat('es-AR', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(fecha))
}

/**
 * ¿AVISAR? `avisado` es el ISO del último episodio avisado (o null si nunca corrió).
 *
 * La primera corrida de todas NO avisa un episodio que ya se recuperó (el del 25/09 08:17, que el
 * dueño resolvió recargando): lo toma como línea de base. Uno ABIERTO se avisa siempre.
 */
export function decidir({ episodio, avisado }) {
  if (!episodio?.inicio) return { avisar: false, avisado }
  const id = new Date(episodio.inicio).toISOString()
  if (avisado === id) return { avisar: false, avisado }
  if (avisado == null && episodio.recuperadoAt) return { avisar: false, avisado: id, lineaDeBase: true }
  return { avisar: true, avisado: id, texto: texto(episodio) }
}

export function texto(ep) {
  const n = Number(ep.fallas) || 0
  const rechazos = n ? ` ${n} llamada${n === 1 ? '' : 's'} rechazada${n === 1 ? '' : 's'}.` : ''
  if (ep.recuperadoAt) {
    return `⚠️ **La API de Anthropic se quedó sin crédito a las ${hhmm(ep.inicio)}** y volvió a andar a las ${hhmm(ep.recuperadoAt)}.${rechazos}`
  }
  return `🚨 **La API de Anthropic se quedó sin crédito a las ${hhmm(ep.inicio)}.**${rechazos}\n` +
    'Está cortada la lectura de comprobantes y todo lo que razona con Claude. Recargá en console.anthropic.com → Settings → Billing.'
}

/** Una ronda con los puertos inyectados: leerEpisodio(), leerAvisado(), guardarAvisado(id), avisar(texto). */
export async function ronda({ puertos }) {
  const episodio = await puertos.leerEpisodio()
  const avisado = await puertos.leerAvisado()
  const d = decidir({ episodio, avisado })
  // Se guarda DESPUÉS de avisar: si Mattermost falla, la ronda tira, no se guarda nada y el timer
  // lo reintenta a los 5 minutos. Un aviso que falló no cuenta como dado.
  if (d.avisar) await puertos.avisar(d.texto)
  if (d.avisado !== avisado) await puertos.guardarAvisado(d.avisado)
  return { episodio, ...d }
}

/**
 * El último episodio de las últimas 72 h: su primer rechazo (posterior al último éxito previo),
 * cuántos rechazos, y el primer éxito posterior (si existe, ya se recuperó).
 */
export const SQL_EPISODIO = `
  with ult as (
    select max(ts) as ts from orq.chat_cost
     where error_kind = 'credit' and ts > now() - interval '72 hours'
  ), ok_antes as (
    select max(c.ts) as ts from orq.chat_cost c, ult
     where c.proveedor = 'anthropic' and c.ok and c.ts < ult.ts
  )
  select (select min(c.ts) from orq.chat_cost c, ok_antes, ult
           where c.error_kind = 'credit' and c.ts > coalesce(ok_antes.ts, '-infinity') and c.ts <= ult.ts) as inicio,
         (select count(*) from orq.chat_cost c, ok_antes, ult
           where c.error_kind = 'credit' and c.ts > coalesce(ok_antes.ts, '-infinity') and c.ts <= ult.ts)::int as fallas,
         (select min(c.ts) from orq.chat_cost c, ult
           where c.proveedor = 'anthropic' and c.ok and c.ts > ult.ts) as "recuperadoAt"
    from ult where ult.ts is not null`
