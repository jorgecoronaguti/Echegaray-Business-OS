// Tool: CONTROL ADMINISTRATIVO — corre el checklist de cierre de la skill de administración sobre
// los datos reales y devuelve EXCEPCIONES, no un reporte. Determinística, 0 API.
import { controlAdministrativo, formatCierre, periodoActual } from '../control-administrativo.mjs'

export function controlAdministrativoTools() {
  return {
    'admin.control': {
      capability: 'os.read',
      schema: {
        name: 'control_administrativo',
        description:
          'Corre el CONTROL DE CIERRE ADMINISTRATIVO sobre los datos reales de la empresa y devuelve las excepciones. USALO cuando el dueño pregunte "¿puedo cerrar el mes?", "¿qué me falta en administración?", "¿está todo en orden?", "¿qué está mal cargado?", "revisá la administración", o antes de mandar documentación al Estudio Contable. Verifica: facturas de compra sin imputar a obra, cobranzas con fecha de cobro vencida, obligaciones vencidas y obligaciones sin fecha de vencimiento. Devuelve también qué puntos del cierre el OS NO puede verificar por falta de fuente (conciliación bancaria, remitos, envío al Estudio) — eso NO es un OK y hay que decírselo al dueño tal cual. Parámetro opcional: periodo YYYY-MM (por defecto el mes corriente).',
        input_schema: {
          type: 'object',
          properties: {
            periodo: { type: 'string', description: 'período a controlar en formato YYYY-MM (opcional; por defecto el mes actual)' },
          },
        },
      },
      async run(input) {
        try {
          const per = String(input?.periodo || '').trim() || periodoActual()
          if (!/^\d{4}-\d{2}$/.test(per)) return { error: 'el período va en formato YYYY-MM (ej. 2026-07)' }
          const r = await controlAdministrativo({ periodo: per })
          return { ...r, resumen: formatCierre(r) }
        } catch (e) {
          return { error: `no pude correr el control administrativo: ${String(e?.message ?? e).slice(0, 200)}` }
        }
      },
    },
  }
}
