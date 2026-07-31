// CAPACIDAD `recordatorio.listar` — "¿qué recordatorios tengo?".
//
// MUESTRA LOS DOS LADOS: los que la persona se puso a sí misma y los que otro le puso. Un
// listado que sólo mostrara los propios haría invisible justo lo que más importa — que
// alguien le programó algo — y la persona no tendría cómo cancelarlo.
//
// Cada línea dice CUÁNDO suena y, cuando corresponde, QUIÉN lo puso o PARA QUIÉN es. Sin ids
// en el texto: si hace falta cancelar, se cancela por lo que dice el recordatorio.

import { z } from 'zod'
import { CAPACIDAD, ESTADO_RECORDATORIO, resultadoOk } from '../contratos.mjs'
import { RecordatoriosPostgres, aContrato, frecuenciaEnTexto } from '../recordatorios.mjs'
import { formatearAR } from '../tiempo.mjs'

const ID = CAPACIDAD.RECORDATORIO_LISTAR

const repoDe = (ctx) => ctx?.recordatorios ?? new RecordatoriosPostgres(ctx.port)

const zListar = z.object({
  estado: z.enum(['active', 'delivered', 'completed', 'cancelled', 'failed'])
    .nullable().default(ESTADO_RECORDATORIO.ACTIVO),
})

/** Una línea del listado, en la voz de quien pregunta. */
function linea(rec, yo) {
  const cuando = frecuenciaEnTexto(rec.cadencia) ?? formatearAR(rec.proxima_ejecucion)
  const de = rec.creador_user_id !== yo ? ` (te lo puso ${rec.creador_display ?? 'otra persona'})` : ''
  const para = rec.destinatario_user_id !== yo ? ` (para ${rec.destinatario_display ?? 'otra persona'})` : ''
  return `• ${String(rec.contenido).trim()} — ${cuando}${de}${para}`
}

export const capacidad = {
  id: ID,
  nombre: 'Listar recordatorios',
  descripcion: 'decirte qué recordatorios tenés programados',
  version: '1.0.0',
  orden: 50,
  permisos: [],
  ejemplos: ['qué recordatorios tengo', 'mostrame mis recordatorios'],
  efectoExterno: false,
  habilitada: async (ctx) => Boolean(ctx?.recordatorios ?? ctx?.port?.query),
  entrada: zListar,

  async ejecutar(params, ctx = {}) {
    const p = zListar.parse(params ?? {})
    const yo = ctx.identidad?.plataformaUserId
    const filas = yo ? await repoDe(ctx).listarDe(yo, { estado: p.estado }) : []
    if (!filas.length) {
      // `ok:true` con evidencia de la consulta: "no tenés ninguno" es una respuesta, no un fallo.
      return resultadoOk(ID, 'No tenés recordatorios programados.', { cantidad: 0, estado: p.estado })
    }
    const titulo = filas.length === 1 ? 'Tenés 1 recordatorio:' : `Tenés ${filas.length} recordatorios:`
    return resultadoOk(ID, [titulo, ...filas.map((r) => linea(r, yo))].join('\n'), {
      cantidad: filas.length, estado: p.estado, recordatorios: filas.map(aContrato),
    })
  },
}
