// Tool: AUDITAR UNA PESTAÑA de un Sheet real — hechos verificables sobre la estructura, para que el
// criterio profesional de la skill de Sheets se aplique ARRIBA de evidencia y no de una impresión.
import { auditarPestana, formatAuditoria } from '../auditar-pestana.mjs'

export function auditarPestanaTools(google) {
  return {
    'sheet.audit': {
      capability: 'drive.read',
      account: 'ecsas',
      schema: {
        name: 'auditar_pestana',
        description:
          'ANALIZA la estructura real de una pestaña de un Google Sheet: cuántas celdas tienen FÓRMULA vs números escritos a mano, totales pegados a mano, rangos abiertos (A:M), SI.ERROR que tapa errores, celdas combinadas, columnas numéricas contaminadas con texto, encabezados duplicados y filas vacías intercaladas. USALO SIEMPRE ANTES de opinar sobre una pestaña o de proponer mejoras: leer sólo los valores no permite distinguir un total calculado de uno pegado a mano, que es la diferencia que más importa. Pasá el id del Sheet y el nombre exacto de la pestaña. Después de auditar, aplicá el criterio de la skill de Sheets sobre estos hechos y proponé mejoras concretas celda por celda — nunca al revés. Además CRUZA el contenido con el conocimiento del OS: te avisa si la pestaña usa nombres de obra que el OS no reconoce (ese dato queda fuera de todo control económico) y te trae lo que el OS ya aprendió de esa área. Pasá `area` para ese cruce.',
        input_schema: {
          type: 'object',
          properties: {
            archivo_id: { type: 'string', description: 'id del Sheet en Drive' },
            pestana: { type: 'string', description: 'nombre exacto de la pestaña' },
            rango: { type: 'string', description: 'rango A1 opcional para acotar (ej. "Caja!A1:M200")' },
            area: { type: 'string', description: 'área de negocio de la pestaña (finanzas, cobranzas, compras, obra, jornales...) para traer lo que el OS ya aprendió de ese tema' },
          },
          required: ['archivo_id', 'pestana'],
        },
      },
      async run(input) {
        try {
          if (!input?.archivo_id || !input?.pestana) return { error: 'necesito el id del Sheet y el nombre de la pestaña' }
          const r = await auditarPestana(google, input.archivo_id, input.pestana, input.rango, { area: input.area })
          return { ...r, resumen: formatAuditoria(r) }
        } catch (e) {
          return { error: `no pude auditar la pestaña: ${String(e?.message ?? e).slice(0, 200)}` }
        }
      },
    },
  }
}
