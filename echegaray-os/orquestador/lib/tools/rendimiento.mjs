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
          'Antes de poner horas, plazo o precio a una tarea, consultá qué tiene medido Echegaray de haberla hecho. Devuelve TRES cosas separadas: la REFERENCIA base con la que se venía cotizando, la EXPERIENCIA REAL de rendimiento (hs por unidad) y la EXPERIENCIA REAL de DURACIÓN (días planificados contra días reales) — cada una con su cantidad de casos, obras distintas y confianza. Pasá tarea: el código o parte del nombre (ej. "REPLANTEO", "EXCAVACIONES"). Si una experiencia todavía es un solo caso, NO cambies el número por eso: mostrale al dueño las cifras y que decida. Las dos métricas no se mezclan: de una tarea se puede saber la duración por seis casos y el rendimiento por ninguno.',
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
          // LA DURACIÓN VIAJA AL LADO, NO ADENTRO. Es otra métrica con otro requisito: sólo necesita
          // fechas, así que hoy se sabe de muchas más tareas que el rendimiento.
          const { rows: [e] } = await query(
            `select casos_duracion, obras_duracion, dias_plan_mediana, dias_real_mediana,
                    desvio_pct_mediana, confianza_duracion, duracion_reutilizable
               from public.experiencia_por_tarea where tarea_tipo_id = $1`, [r.id])
          const duracion = e && e.casos_duracion > 0
            ? {
              casos: e.casos_duracion, obras: e.obras_duracion,
              diasPlanMediana: Number(e.dias_plan_mediana), diasRealMediana: Number(e.dias_real_mediana),
              desvioPctMediana: e.desvio_pct_mediana == null ? null : Number(e.desvio_pct_mediana),
              confianza: e.confianza_duracion,
              // Con una sola obra hay un dato, no una referencia — la misma regla que el rendimiento.
              reutilizable: e.duracion_reutilizable,
            }
            : null
          // Una tarea de la que no se sabe nada se informa igual: el hueco es información.
          salida.push({ tarea: r.nombre, codigo: r.codigo, unidad: r.unidad, ...rec, duracion })
        }
        return { tareas: salida }
      },
    },
  }
}
