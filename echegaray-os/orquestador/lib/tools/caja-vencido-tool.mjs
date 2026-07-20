// Tool: MOVIMIENTOS DE CAJA VENCIDOS SIN CONCILIAR (área Adm. y Finanzas).
//
// Hallazgo de la auditoría 2026-07-19: la capacidad `alertasCaja` ya detectaba los cobros y pagos
// PROYECTADOS cuya fecha ya pasó y que nadie marcó como reales — hoy $25M en cobros y $9,9M en pagos,
// el más viejo del 2 de julio. Pero solo la consumía la vigilancia autónoma: el dueño NO podía
// preguntarla. Plata proyectada que venció y quedó invisible.
//
// La regla profesional que esto implementa (skill finanzas-tesoreria-construccion): "un proyectado
// que se cumple se marca como real". Mientras no se concilie, no se sabe si ese dinero entró.
// Reusa alertasCaja + priorizarCaja — no reimplementa nada. 0 API.
import { alertasCaja, priorizarCaja } from '../caja-alertas.mjs'

export function cajaVencidoTools() {
  return {
    'caja.vencido': {
      capability: 'drive.read',
      account: 'ecsas',
      schema: {
        name: 'caja_vencido_sin_conciliar',
        description:
          'Cobros y pagos que estaban PROYECTADOS, cuya fecha ya pasó, y que NADIE marcó como cobrados/pagados realmente. Es plata que se esperaba mover y quedó sin confirmar: mientras no se concilie, no se sabe si entró o salió. Devuelve el total por tipo, hace cuántos días vencía el más viejo, y los ítems concretos priorizados por impacto en caja. USALO para "¿qué tengo vencido?", "¿qué cobros no se confirmaron?", "¿qué quedó sin conciliar?", "¿de qué me tengo que ocupar en la caja?". Números REALES de public.movimientos_caja, 0 inventado. Si el resultado viene vacío puede significar dos cosas distintas: que está todo conciliado, o que hace tiempo nadie carga movimientos — aclaralo.',
        input_schema: {
          type: 'object',
          properties: {
            tipo: { type: 'string', description: 'filtrar por "cobro" o "pago" (opcional; vacío = ambos)' },
          },
        },
      },
      async run(input) {
        try {
          const [alertas, priorizados] = await Promise.all([
            alertasCaja({ maxItems: 5 }),
            priorizarCaja({ tipo: input?.tipo || null, limit: 8 }),
          ])
          return {
            resumen: alertas,
            priorizados,
            sin_pendientes: alertas.length === 0,
            criterio: 'un movimiento proyectado cuya fecha ya pasó y sigue sin marcarse como real es plata sin conciliar — no es ni ingreso confirmado ni pérdida, es incertidumbre que hay que cerrar.',
            fuente: 'public.movimientos_caja (estado proyectado con fecha vencida)',
          }
        } catch (e) {
          return { error: `no pude leer los vencidos de caja: ${String(e?.message ?? e).slice(0, 160)}` }
        }
      },
    },
  }
}
