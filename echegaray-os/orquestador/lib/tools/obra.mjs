// Tool OBRA para el motor y los especialistas: expone el cuadro económico por obra
// (contratado↔presupuesto↔costo real↔adicionales, margen y desvío) como una tool que
// el CFO, el jefe de obra o el presupuestador pueden llamar para razonar sobre números
// REALES en vez de suponer. Lectura (Nivel A) — reusa 'drive.read' (auto), sin efecto
// externo. Reusa lib/obra-economics.mjs (misma fuente que la respuesta determinística
// del chat) para no duplicar el cálculo.
import { cuadroEconomico } from '../obra-economics.mjs'

export function obraTools() {
  return {
    'obra.cuadro_economico': {
      capability: 'drive.read',
      account: 'ecsas',
      schema: {
        name: 'cuadro_economico_obra',
        description:
          'Trae el CUADRO ECONÓMICO real de una obra desde los datos cargados: monto contratado, presupuesto (costo previsto y margen esperado), costo real acumulado, adicionales, y los cálculos de margen y desvío de costo. Usalo ANTES de opinar sobre la rentabilidad, el margen o la salud económica de una obra: da números reales con su etiqueta (DATO/CÁLCULO/DESCONOCIDO). Pasá "obra" con el nombre (o parte); sin obra, devuelve el resumen de todas. Si una obra está en curso, las cifras son parciales (a la fecha).',
        input_schema: {
          type: 'object',
          properties: { obra: { type: 'string', description: 'nombre de la obra (o parte); vacío = todas' } },
        },
      },
      async run(input) {
        try {
          const nombre = String(input?.obra || '').trim() || null
          const cuadro = await cuadroEconomico(nombre)
          return { ok: true, obra: nombre || 'todas', cuadro }
        } catch (e) {
          return { error: `no pude armar el cuadro económico: ${String(e?.message ?? e).slice(0, 160)}` }
        }
      },
    },
  }
}
