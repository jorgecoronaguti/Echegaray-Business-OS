import { actualizarIndices, formatIndices } from '../indices-economicos.mjs'
import { webSearch } from '../web-search.mjs'

export function indicesTools() {
  return {
    'os.indices_economicos': {
      capability: 'drive.read',
      account: 'ecsas',
      schema: {
        name: 'indices_economicos',
        description:
          'Trae de internet la INFLACIÓN mensual proyectada (REM del BCRA) y la deja guardada con su ' +
          'fuente para que TODA proyección del OS la use. Devuelve el factor acumulado por mes: ' +
          'multiplicar una proyección a valores de hoy por ese factor la lleva a pesos de ese mes. ' +
          'Usalo antes de creerle a cualquier proyección de caja o de costos a varios meses. Avisa si ' +
          'el dato está vencido y NO inventa un índice si la búsqueda no devuelve números.',
        input_schema: {
          type: 'object',
          properties: { forzar: { type: 'boolean', description: 'true = vuelve a buscar aunque el dato sea reciente' } },
        },
      },
      async run(input) {
        try {
          const r = await actualizarIndices((q) => webSearch(q), { forzar: input?.forzar })
          return { ...r, resumen: formatIndices(r) }
        } catch (e) {
          return { error: `no pude actualizar los índices: ${String(e?.message ?? e).slice(0, 200)}` }
        }
      },
    },
  }
}
