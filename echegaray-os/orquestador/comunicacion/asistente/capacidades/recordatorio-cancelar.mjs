// CAPACIDAD `recordatorio.cancelar` — "cancelá el recordatorio de los saldos".
//
// CANCELACIÓN LÓGICA: el recordatorio queda `cancelled`, no se borra. Lo que se cancela y
// cuándo es parte de la historia — y sin la fila no hay forma de explicar por qué dejó de
// sonar algo que la persona sí había programado.
//
// PROPIEDAD: sólo el que lo creó o el que lo recibe. La regla vive en el repositorio
// (`puedeCancelar`), no acá: si mañana entra otra puerta al mismo recordatorio, la regla ya
// está del lado de la base y no hay que acordarse de copiarla.
//
// NADIE CANCELA POR ID EN UN CHAT. La persona dice "el de los saldos". Si eso identifica uno
// solo, se cancela; si identifica varios, se pregunta con opciones. Elegir por ella sería la
// forma más rápida de apagar el recordatorio equivocado.

import { z } from 'zod'
import {
  CAPACIDAD, ERROR, errorAsistente, resultadoAclaracion, resultadoError, resultadoOk,
} from '../contratos.mjs'
import { RECHAZO, RecordatoriosPostgres, aContrato, frecuenciaEnTexto } from '../recordatorios.mjs'
import { formatearAR } from '../tiempo.mjs'

const ID = CAPACIDAD.RECORDATORIO_CANCELAR

const repoDe = (ctx) => ctx?.recordatorios ?? new RecordatoriosPostgres(ctx.port)

const zCancelar = z.object({
  id: z.string().min(1).nullable().default(null),
  referencia: z.string().nullable().default(null), // "el de los saldos", como lo dijo
})

/** Sin acentos y en minúsculas: "cargar saldos" tiene que encontrar "Cargar Saldós". */
const normalizar = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

const etiqueta = (r) => `${String(r.contenido).trim()} — ${frecuenciaEnTexto(r.cadencia) ?? formatearAR(r.proxima_ejecucion)}`

/** Traduce el rechazo del repositorio a algo que la persona pueda entender. */
function noSePudo(motivo) {
  if (motivo === RECHAZO.AJENO) {
    return errorAsistente(ERROR.PERMISO_DENEGADO, 'Ese recordatorio no es tuyo: sólo puede cancelarlo quien lo creó o quien lo recibe.')
  }
  if (motivo === RECHAZO.CERRADO) return errorAsistente(ERROR.NO_ENCONTRADO, 'Ese recordatorio ya no estaba activo.')
  return errorAsistente(ERROR.NO_ENCONTRADO, 'No encontré ese recordatorio.')
}

export const capacidad = {
  id: ID,
  nombre: 'Cancelar recordatorio',
  descripcion: 'cancelar un recordatorio que ya no querés que suene',
  version: '1.0.0',
  permisos: [],
  ejemplos: ['cancelá el recordatorio de los saldos', 'ya no me recuerdes lo del contador'],
  efectoExterno: false,
  habilitada: async (ctx) => Boolean(ctx?.recordatorios ?? ctx?.port?.query),
  entrada: zCancelar,

  async ejecutar(params, ctx = {}) {
    const p = zCancelar.parse(params ?? {})
    const yo = ctx.identidad?.plataformaUserId
    if (!yo) return resultadoError(ID, errorAsistente(ERROR.USUARIO_INEXISTENTE, 'No te tengo identificado en el OS. Avisale a Jorge.'))
    const repo = repoDe(ctx)

    let id = p.id
    if (!id) {
      const activos = await repo.listarDe(yo, {})
      if (!activos.length) return resultadoError(ID, errorAsistente(ERROR.NO_ENCONTRADO, 'No tenés recordatorios activos.'))
      const ref = normalizar(p.referencia)
      const candidatos = ref ? activos.filter((r) => normalizar(r.contenido).includes(ref)) : activos
      if (!candidatos.length) {
        return resultadoError(ID, errorAsistente(ERROR.NO_ENCONTRADO, `No encontré ningún recordatorio sobre «${p.referencia}».`))
      }
      if (candidatos.length > 1) {
        return resultadoAclaracion(ID, '¿Cuál cancelo?',
          candidatos.map((r) => ({ valor: String(r.id), etiqueta: etiqueta(r) })), { ...p })
      }
      id = candidatos[0].id
    }

    const r = await repo.cancelar(id, yo)
    if (!r.ok) return resultadoError(ID, noSePudo(r.motivo))
    const que = String(r.recordatorio.contenido).trim().replace(/[.\s]+$/, '')
    const texto = r.recordatorio.destinatario_user_id === yo
      ? `Listo. Ya no te recuerdo ${que}.`
      : `Listo. Ya no se lo recuerdo a ${r.recordatorio.destinatario_display ?? 'esa persona'}: ${que}.`
    return resultadoOk(ID, texto, aContrato(r.recordatorio))
  },
}
