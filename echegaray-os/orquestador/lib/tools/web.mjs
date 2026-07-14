// Tool de BÚSQUEDA EN INTERNET para el motor interactivo y los especialistas. Lectura
// (Nivel A) — reusa la capacidad 'drive.read' (auto) para no requerir una migración de
// policy; sin efecto externo (solo consulta). Clave para presupuestar: precios de
// materiales, jornales/convenios vigentes, normativa, proveedores.
import { webSearch } from '../web-search.mjs'

export function webSearchTools() {
  return {
    'web.search': {
      capability: 'drive.read',
      account: 'ecsas',
      schema: {
        name: 'web_search',
        description:
          'Busca en INTERNET información actual: precios de materiales (hormigón, acero, áridos…), jornales/convenios vigentes, normativa, proveedores, referencias de mercado. Usalo cuando presupuestás y necesitás un precio o dato que no está en los archivos. Pasá query (qué buscar, específico y con lugar/fecha si aplica). Devuelve un resumen con fuentes. Los precios son REFERENCIA a verificar, no cotización en firme.',
        input_schema: {
          type: 'object',
          properties: { query: { type: 'string', description: 'qué buscar, ej. "precio m3 hormigón H21 San Juan 2026"' } },
          required: ['query'],
        },
      },
      async run(input) {
        if (!input?.query) return { error: 'falta query' }
        try {
          const r = await webSearch(String(input.query).slice(0, 300))
          return { ok: true, query: input.query, resultado: r.text, busquedas: r.searches }
        } catch (e) {
          return { error: `no pude buscar en internet: ${String(e?.message ?? e).slice(0, 160)}` }
        }
      },
    },
  }
}
