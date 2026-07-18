// Tool: estado de OBLIGACIONES (área Adm. y Finanzas). Deuda por tipo, saldo tras pagos, vencidas
// y lo que entra en 30 días. Fuente public.obligaciones + aplicaciones_pago. 0 API.
import { estadoObligaciones } from '../obligaciones.mjs'

export function obligacionesTools() {
  return {
    'obligaciones.estado': {
      capability: 'drive.read',
      account: 'ecsas',
      schema: {
        name: 'obligaciones_estado',
        description:
          'Estado de las OBLIGACIONES / deudas de la empresa: saldo total pendiente (obligación − pagos ya aplicados), desglose por tipo (comercial, impositiva/ARCA, financiera/banco, laboral/UOCRA-Cese, operativa/alquiler), lo VENCIDO, lo que entra en los próximos 30 días, y la lista de vencidas. USALO para "¿cuánto debemos?", "¿qué obligaciones tengo?", "¿qué vence?", "¿cuánto le debo a ARCA/al banco?". Números REALES del Cash Flow, 0 inventado. Nota: muchas deudas son acumuladas sin fecha de vencimiento cargada — se informan como saldo. Sin parámetros.',
        input_schema: { type: 'object', properties: {} },
      },
      async run() {
        try {
          return await estadoObligaciones()
        } catch (e) {
          return { error: `no pude calcular las obligaciones: ${String(e?.message ?? e).slice(0, 160)}` }
        }
      },
    },
  }
}
