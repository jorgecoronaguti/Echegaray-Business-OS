// Tool: OPERACIONES CON NOMBRE sobre una pestaña. Propone primero, aplica sólo si se lo piden.
//
// Reemplaza el modo anterior de arreglar planillas: el modelo improvisando celda por celda en vivo
// (13 pasos, 100 s, $1,99 y dos #N/A en la pestaña Caja el 2026-07-19). Acá el modelo elige QUÉ
// operación corresponde y el código sabe CÓMO hacerla, igual siempre y testeada.
import { OPERACIONES, formatPropuesta } from '../operaciones-sheet.mjs'
import { auditarGrid } from '../auditar-pestana.mjs'

/** Obras canónicas + alias, desde la fuente única. Sin ellas, normalizar_obras no puede decidir. */
async function obrasConocidas() {
  try {
    const { query } = await import('../db.mjs')
    const canon = (await query('select nombre from public.obra_canonica')).rows.map((r) => r.nombre)
    const al = (await query(`select a.alias, o.nombre from public.obra_alias a
                             join public.obra_canonica o on o.id = a.obra_id`)).rows
    return { canonicas: canon, alias: Object.fromEntries(al.map((r) => [r.alias, r.nombre])) }
  } catch { return { canonicas: [], alias: {} } }
}

export function operacionesSheetTools(google) {
  return {
    'sheet.operacion': {
      capability: 'drive.write',
      account: 'ecsas',
      schema: {
        name: 'mejorar_pestana',
        description:
          'Aplica una MEJORA CONCRETA y probada a una pestaña, en vez de improvisar celda por celda. Operaciones disponibles: "normalizar_obras" (unifica los nombres de obra con las obras canónicas del OS, para que ese gasto o cobro entre al control económico por obra), "totales_a_formula" (convierte totales escritos a mano en SUMA viva, que se recalcula sola), "numeros_como_texto" (convierte números guardados como texto, que hoy no suman y dejan los totales cortos sin dar error). POR DEFECTO SÓLO PROPONE: devuelve exactamente qué celdas cambiarían, para mostrárselas al dueño antes de tocar nada. Recién con aplicar=true escribe. Lo ambiguo (ej. varias obras en un mismo campo) NUNCA se resuelve solo: se devuelve para que decida el dueño. Antes de escribir, el OS guarda cómo estaba la pestaña, así que siempre se puede volver atrás.',
        input_schema: {
          type: 'object',
          properties: {
            archivo_id: { type: 'string', description: 'id del Sheet en Drive' },
            pestana: { type: 'string', description: 'nombre exacto de la pestaña' },
            operacion: {
              type: 'string',
              enum: ['normalizar_obras', 'totales_a_formula', 'numeros_como_texto'],
              description: 'qué mejora aplicar',
            },
            aplicar: {
              type: 'boolean',
              description: 'false (por defecto) = sólo proponer; true = escribir los cambios',
            },
          },
          required: ['archivo_id', 'pestana', 'operacion'],
        },
      },
      async run(input) {
        try {
          const fn = OPERACIONES[input?.operacion]
          if (!fn) return { error: `operación desconocida: ${input?.operacion}` }
          if (!google?.readSheetGrid) return { error: 'no hay cuenta de Google autorizada para leer el Sheet' }

          const grid = await google.readSheetGrid(input.archivo_id, input.pestana)
          const aud = auditarGrid(grid)
          if (aud.vacia) return { error: 'esa pestaña está vacía' }
          // La fila de encabezado la detecta la auditoría; las operaciones la necesitan para saber
          // dónde arrancan los datos (y no tratar el encabezado como un dato más).
          const primerTitulo = String(aud.encabezado[0] ?? '')
          const filaDatos = (grid.filas || []).findIndex(
            (f) => (f || []).some((c) => String(c?.valor ?? '').trim() === primerTitulo))
          const ctx = { encabezado: aud.encabezado, filaDatos: filaDatos < 0 ? 0 : filaDatos }

          const r = input.operacion === 'normalizar_obras'
            ? fn(grid, { ...ctx, ...(await obrasConocidas()) })
            : fn(grid, ctx)

          if (!input?.aplicar) {
            return {
              ...r,
              aplicado: false,
              propuesta: formatPropuesta(r),
              nota: 'Sólo propuesta: NO se tocó nada. Mostrale los cambios al dueño y pedile confirmación antes de aplicar.',
            }
          }
          if (!r.cambios?.length) return { ...r, aplicado: false, nota: 'No hay nada que cambiar.' }
          if (!google.updateSheetValues) return { error: 'no hay cuenta autorizada para escribir' }

          // USER_ENTERED: respeta fórmulas y el formato es-AR, como si se tipeara.
          for (const c of r.cambios) {
            await google.updateSheetValues(input.archivo_id, `${input.pestana}!${c.celda}`, [[c.a]], { yaGuardado: true }) // corrección aprobada por el dueño: no la bloquea la guarda
          }
          return {
            ...r,
            aplicado: true,
            celdas_escritas: r.cambios.length,
            nota: 'Aplicado. Si algo quedó mal, pedime "volvé atrás".',
          }
        } catch (e) {
          return { error: `no pude ejecutar la operación: ${String(e?.message ?? e).slice(0, 200)}` }
        }
      },
    },
  }
}
