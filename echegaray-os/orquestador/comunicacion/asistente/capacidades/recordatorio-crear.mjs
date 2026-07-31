// CAPACIDAD `recordatorio.crear` — "recordame X el jueves" / "recordale a Rodrigo Y".
//
// EFECTO EXTERNO: NO. El efecto es del OS sobre sí mismo (una fila y un DM del bot), no sobre
// un sistema de terceros. Por eso no pasa por la barrera de idempotencia de
// `asistente_ejecuciones`: la creación ya es idempotente por `idempotency_key`, que es el
// comm_event_id del mensaje que la pidió.
//
// LO QUE ESTA CAPACIDAD SE NIEGA A HACER: crear un recordatorio inútil. Sin momento, no hay
// recordatorio — se pregunta. Con un destinatario que no resolvió a una identidad real, no
// hay recordatorio — se pregunta, porque "Rodrigo" no es una persona, hay dos. Y un momento
// que ya pasó no se acepta en silencio: nadie se entera hasta que el recordatorio no suena.
//
// LA CONFIRMACIÓN LLEVA LA FECHA EN TEXTO. "Listo, lo programé" es una promesa que la
// persona no puede verificar; "todos los lunes a las 08:00" sí, y si dijo martes lo ve ahí.

import { computeNextRun } from '../../../lib/schedules.mjs'
import {
  CAPACIDAD, ERROR, errorAsistente, resultadoAclaracion, resultadoError, resultadoOk,
  zRecordatorioCrear,
} from '../contratos.mjs'
import { RecordatoriosPostgres, aContrato, frecuenciaEnTexto } from '../recordatorios.mjs'
import { formatearAR, instanteAR, paredAR, yaPaso } from '../tiempo.mjs'

const ID = CAPACIDAD.RECORDATORIO_CREAR

/** El repositorio sale del contexto. `ctx.recordatorios` es la costura para los tests: en
 *  producción siempre se arma sobre el port del OS. */
const repoDe = (ctx) => ctx?.recordatorios ?? new RecordatoriosPostgres(ctx.port)

/** Sin punto final: se va a incrustar dentro de una oración nuestra. */
const limpio = (s) => String(s ?? '').trim().replace(/[.\s]+$/, '')

/** Cuándo suena, dicho de forma que la persona lo pueda desmentir. */
function cuandoEnTexto(rec) {
  return frecuenciaEnTexto(rec.cadencia) ?? `el ${formatearAR(rec.proxima_ejecucion)}`
}

export const capacidad = {
  id: ID,
  nombre: 'Crear recordatorio',
  descripcion: 'recordarte algo a vos, o a otra persona, en un momento o de forma recurrente',
  version: '1.0.0',
  permisos: [],
  ejemplos: [
    'recordame cargar saldos todos los lunes a las 8',
    'recordale a Rodrigo mañana a las 9 que lleve la documentación',
    'avisame en 2 horas de llamar al contador',
  ],
  efectoExterno: false,
  // Depende de la base y de NADA más: un recordatorio interno no necesita Google.
  habilitada: async (ctx) => Boolean(ctx?.recordatorios ?? ctx?.port?.query),
  entrada: zRecordatorioCrear,

  /**
   * @param {import('zod').infer<typeof zRecordatorioCrear>} params
   * @param {object} ctx  ContextoAsistente (contratos.mjs)
   */
  async ejecutar(params, ctx = {}) {
    const p = zRecordatorioCrear.parse(params ?? {})
    const ahora = ctx.ahora?.() ?? new Date()
    const yo = ctx.identidad?.plataformaUserId
    if (!yo) {
      return resultadoError(ID, errorAsistente(ERROR.USUARIO_INEXISTENTE, 'No te tengo identificado en el OS. Avisale a Jorge.'))
    }

    // Destinatario: si no dijo a quién, es para sí mismo. Si dijo un nombre que no resolvió
    // a una identidad, se pregunta — no se elige por la persona.
    const destinoId = p.destinatarioUserId ?? (p.destinatario ? null : yo)
    if (!destinoId) {
      return resultadoAclaracion(ID, `¿A quién se lo recuerdo? No pude identificar a «${p.destinatario}».`, [], { ...p })
    }

    if (!p.cuando) {
      return resultadoAclaracion(ID, `¿Cuándo te lo recuerdo? Decime el día y la hora.`, [], { ...p })
    }
    let cuando = p.cuando
    if (yaPaso(cuando, ahora)) {
      // Con cadencia el instante era sólo el ancla: se corre a la próxima ocurrencia real.
      // Sin cadencia no hay nada que salvar — un recordatorio en el pasado no suena nunca.
      if (!p.cadencia) {
        return resultadoError(ID, errorAsistente(ERROR.DATO_FALTANTE,
          `Ese momento ya pasó (${formatearAR(cuando)}). Decime cuándo te lo recuerdo.`))
      }
      // Vuelve a la forma del contrato con `instanteAR` y NO con `toISOString()`: `zInstante`
      // no acepta milisegundos, así que un `…T11:00:00.000Z` sería rechazado tres capas
      // más abajo por algo que no tiene nada que ver con lo que la persona pidió.
      const pared = paredAR(computeNextRun(p.cadencia, ahora) ?? ahora)
      cuando = instanteAR(pared.y, pared.m, pared.d, pared.hh, pared.mm)
    }

    const rec = await repoDe(ctx).crear({
      creador: { userId: yo, display: ctx.identidad?.nombreVisible ?? null },
      destinatario: destinoId === yo ? null : { userId: destinoId, display: p.destinatario ?? null },
      contenido: p.contenido, cuando, cadencia: p.cadencia, zonaHoraria: p.zonaHoraria,
      idempotencyKey: ctx.commEventId ?? null, correlationId: ctx.correlationId ?? null,
    })

    const que = limpio(rec.contenido)
    const quien = destinoId === yo ? 'Te' : `Le`
    const aQuien = destinoId === yo ? '' : ` a ${rec.destinatario_display ?? 'esa persona'}`
    const cabeza = rec.duplicado ? 'Ya lo tenía.' : 'Listo.'
    const texto = `${cabeza} ${quien} recuerdo${aQuien} ${que} ${cuandoEnTexto(rec)}.`
    return resultadoOk(ID, texto, { ...aContrato(rec), duplicado: Boolean(rec.duplicado) })
  },
}
