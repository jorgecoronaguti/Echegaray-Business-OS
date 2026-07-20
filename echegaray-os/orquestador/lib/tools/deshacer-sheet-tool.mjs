// Tool: DESHACER el último cambio que el OS hizo en una pestaña.
import { ultimoSnapshot, restaurarSnapshot } from '../sheet-snapshot.mjs'

export function deshacerSheetTools(google) {
  return {
    'sheet.undo': {
      capability: 'drive.write',
      account: 'ecsas',
      schema: {
        name: 'deshacer_cambio_sheet',
        description:
          'DESHACE el último cambio que el OS hizo en una pestaña, devolviéndola a como estaba antes (con sus fórmulas, no con los valores calculados). USALO cuando el dueño diga "volvé atrás", "deshacé eso", "dejala como estaba", "arruinaste la pestaña". Si te dice cuál, pasá archivo_id y pestana; si no, se toma el último cambio hecho. Antes de restaurar guarda el estado actual, así que deshacer también se puede deshacer. Si no hay ningún cambio registrado, decilo — no inventes que restauraste algo.',
        input_schema: {
          type: 'object',
          properties: {
            archivo_id: { type: 'string', description: 'id del Sheet (opcional)' },
            pestana: { type: 'string', description: 'nombre de la pestaña (opcional)' },
          },
        },
      },
      async run(input) {
        try {
          const snap = await ultimoSnapshot({ fileId: input?.archivo_id, pestana: input?.pestana })
          if (!snap) return { error: 'no tengo ningún cambio registrado para deshacer en esa pestaña' }
          const r = await restaurarSnapshot({ google, snapshotId: snap.id })
          return { ...r, tomado_el: snap.created_at, lo_habia_hecho: snap.tool ?? null }
        } catch (e) {
          return { error: `no pude deshacer: ${String(e?.message ?? e).slice(0, 200)}` }
        }
      },
    },
  }
}
