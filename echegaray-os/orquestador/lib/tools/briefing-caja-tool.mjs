// Tool del BRIEFING DE CAJA — expone el briefing determinístico (cash-briefing.mjs) al chat y a
// las tareas programadas. 0 razonamiento del modelo: los números salen de columnas estructuradas.
import { cashBriefing, formatBriefing } from '../cash-briefing.mjs'

export function briefingCajaTools(google) {
  return {
    'briefing.caja': {
      capability: 'drive.read',
      account: 'ecsas',
      schema: {
        name: 'briefing_caja',
        description: 'Arma el BRIEFING DE CAJA del día (determinístico, 0 API, número exacto de columnas estructuradas del Cash Flow): saldo de caja hoy, cobranzas del mes en curso (cobrado y por cobrar) y VENCIMIENTOS a pagar en los próximos 7 días (cheques + tarjeta, con proveedor y fecha). Usalo cuando el dueño pida "briefing", "cómo estamos de caja", "qué tengo que pagar esta semana", "resumen de caja", "qué se viene", o cuando una tarea programada de la mañana lo pida. Devolvé el texto TAL CUAL (ya viene formateado y con los números reales) — NO recalcules ni inventes nada.',
        input_schema: { type: 'object', properties: {} },
      },
      async run() {
        try {
          const b = await cashBriefing(google)
          return { texto: formatBriefing(b), datos: b }
        } catch (e) {
          return { error: `no pude armar el briefing de caja: ${String(e?.message ?? e).slice(0, 160)}` }
        }
      },
    },
  }
}
