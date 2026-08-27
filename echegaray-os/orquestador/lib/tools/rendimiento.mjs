// LO QUE ECHEGARAY APRENDIÓ HACIENDO LA TAREA — disponible para quien cotiza.
//
// Es la punta consumidora del ciclo de XSAS: `xsas-ciclo.mjs` mide la obra y deja el rendimiento en
// `rendimiento_historico`; esta herramienta lo devuelve cuando alguien va a poner un precio.
//
// Nunca devuelve un número solo: devuelve la referencia con la que se venía cotizando, la
// experiencia propia con su cantidad de casos y su confianza, y cuál se recomienda con el motivo.
// Un número sin origen no entra a un presupuesto.
import { query } from '../db.mjs'
import { rendimientoDeTarea } from '../rendimiento-para-cotizar.mjs'

export function rendimientoTools() {
  return {
    'rendimiento.para_cotizar': {
      capability: 'drive.read',
      account: 'ecsas',
      schema: {
        name: 'rendimiento_para_cotizar',
        description:
          'Antes de poner horas o precio a una tarea, consultá qué rendimiento (hs por unidad) tiene medido Echegaray de haberla hecho. Devuelve la REFERENCIA base con la que se venía cotizando y la EXPERIENCIA REAL de obra por separado, con cantidad de casos y confianza, y cuál conviene usar. Pasá tarea: el código o parte del nombre (ej. "REPLANTEO", "EXCAVACIONES"). Si la experiencia todavía es un solo caso, NO cambies el precio por eso: mostrale al dueño las dos cifras y que decida.',
        input_schema: {
          type: 'object',
          properties: { tarea: { type: 'string', description: 'código o parte del nombre de la tarea' } },
          required: ['tarea'],
        },
      },
      async run(input) {
        const t = String(input?.tarea || '').trim()
        if (t.length < 3) return { error: 'decime el código o el nombre de la tarea' }
        const { rows } = await query(
          `select id, codigo, nombre, unidad from public.tarea_tipo
            where codigo ilike $1 or nombre ilike $1 order by nombre limit 5`, [`%${t}%`])
        if (!rows.length) return { sin_datos: `no encontré una tarea que se parezca a "${t}"` }
        const salida = []
        for (const r of rows) {
          const rec = await rendimientoDeTarea({ query }, r.id)
          // Una tarea de la que no se sabe nada se informa igual: el hueco es información.
          salida.push({ tarea: r.nombre, codigo: r.codigo, unidad: r.unidad, ...rec })
        }
        return { tareas: salida }
      },
    },
  }
}
