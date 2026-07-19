// Tool: P&L DEVENGADO (área Contabilidad y Legales). Lee el dashboard mensual que el dueño ya arma
// en el Sheet "Ingresos y Egresos - P&L" (fuente declarada, Q10). Lectura, 0 API, no escribe.
import { estadoPyL } from '../pyl.mjs'

export function pylTools(google) {
  return {
    'pyl.estado': {
      capability: 'drive.read',
      account: 'ecsas',
      schema: {
        name: 'pyl_estado',
        description:
          'El P&L (Estado de Resultados) DEVENGADO de la empresa: ingresos, costos directos, MARGEN BRUTO (monto y %), gastos operativos, IIBB y EBITDA. Por mes o acumulado del año. Lee el dashboard mensual real del Sheet "Ingresos y Egresos - P&L". USALO para "¿cómo viene el P&L?", "¿cuál es el margen bruto de julio?", "¿el EBITDA acumulado?", "¿cuánto ganamos este mes?", "resultado del año". Pasá "mes" con un mes (ej. "julio") o "acumulado" para el total 2026; vacío = serie mensual + acumulado. OJO criterio: el P&L es DEVENGADO (resultado económico), distinto de la CAJA que es percibido — no los mezcles; para la caja usá el briefing de caja. Números REALES del Sheet, 0 inventado.',
        input_schema: {
          type: 'object',
          properties: { mes: { type: 'string', description: 'mes (ej. "julio", "jul-26") o "acumulado"/"total"; vacío = todo el año' } },
        },
      },
      async run(input) {
        try {
          return await estadoPyL(google, input?.mes)
        } catch (e) {
          return { error: `no pude leer el P&L: ${String(e?.message ?? e).slice(0, 160)}` }
        }
      },
    },
  }
}
