// Tool: EGRESOS POR ÁREA — clasifica el libro de salidas de dinero contra las 8 áreas del OS.
import { egresosPorArea, formatEgresos } from '../egresos-por-area.mjs'
import { nombreArea } from '../biblioteca-area.mjs'

export function egresosTools(google) {
  return {
    'os.egresos_por_area': {
      capability: 'os.read',
      schema: {
        name: 'egresos_por_area',
        description:
          'Analiza la pestaña de EGRESOS de un Sheet (por defecto "Compras" del Flujo de Caja) y la ' +
          'clasifica contra las 8 áreas del OS, con el corte fino de cada una (sueldo neto, cargas ' +
          'sociales, compra imputada a obra, flota, impuestos, bancario…). USALA cuando el dueño ' +
          'pregunte cómo se reparte el gasto, cómo subdividir esa pestaña, o cuánto pesa cada área. ' +
          'Resuelve las obras por el eje canónico, no por match de nombre. Declara aparte las filas ' +
          'de plantilla (fórmulas vivas sin dato) y las filas sin concepto: son huecos de captura ' +
          'reales, no errores del análisis. 0 API.',
        input_schema: {
          type: 'object',
          properties: {
            file_id: { type: 'string', description: 'ID del Sheet.' },
            pestana: { type: 'string', description: 'Pestaña a analizar. Por defecto "Compras".' },
            fila_encabezado: { type: 'number', description: 'Fila donde están los nombres de columna. Por defecto 3.' },
          },
          required: ['file_id'],
        },
      },
      async run(args = {}) {
        try {
          const r = await egresosPorArea(google, args)
          return r.error ? r : { ...r, resumen_texto: formatEgresos(r, nombreArea) }
        } catch (e) {
          return { error: `no pude analizar los egresos: ${String(e?.message ?? e).slice(0, 200)}` }
        }
      },
    },
  }
}
