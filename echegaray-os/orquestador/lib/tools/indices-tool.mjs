import { actualizarIndices, formatIndices } from '../indices-economicos.mjs'

export function indicesTools() {
  return {
    'os.indices_economicos': {
      capability: 'drive.read',
      account: 'ecsas',
      schema: {
        name: 'indices_economicos',
        description:
          'Lee de la planilla oficial del BCRA la INFLACIÓN mensual proyectada (REM, mediana) y la deja guardada con su ' +
          'fuente para que TODA proyección del OS la use. Devuelve el factor acumulado por mes: ' +
          'multiplicar una proyección a valores de hoy por ese factor la lleva a pesos de ese mes. ' +
          'Usalo antes de creerle a cualquier proyección de caja o de costos a varios meses. Avisa si ' +
          'el dato está vencido y NO inventa un índice si la planilla no se puede leer.',
        input_schema: {
          type: 'object',
          properties: { forzar: { type: 'boolean', description: 'true = vuelve a leer aunque el dato sea reciente' } },
        },
      },
      async run(input) {
        try {
          const r = await actualizarIndices({ forzar: input?.forzar })
          return { ...r, resumen: formatIndices(r) }
        } catch (e) {
          return { error: `no pude actualizar los índices: ${String(e?.message ?? e).slice(0, 200)}` }
        }
      },
    },
  }
}
