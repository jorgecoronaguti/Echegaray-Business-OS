// EL COMANDO NATIVO `/asistencia`.
//
// Es la MISMA carga que `@os asistencia`, por otra puerta. No duplica una línea de lógica:
// llama a `iniciarAsistencia`, igual que el especialista. Si mañana cambia el arranque,
// cambia para las dos puertas a la vez — que es la razón de que esto sea tan corto.
//
// POR QUÉ EXISTEN LAS DOS. `/asistencia` tiene autocompletado y no obliga a acordarse del
// nombre del bot; `@os asistencia` funciona sin que un administrador dé de alta nada. El
// bot es `system_user` y NO puede crear el comando (verificado: 403 contra el servidor
// real), así que el alta es un clic humano y la mención es la puerta que ya está abierta.
//
// LA RESPUESTA VA AL CANAL (`in_channel`), no efímera, y eso es a propósito: el mensaje
// interactivo tiene que ser un post real para que los botones funcionen y para poder
// reescribirlo. Un efímero no se puede actualizar por API — y además el bot tampoco puede
// publicarlos (403). Los RECHAZOS sí van efímeros: que te digan que no podés cargar es
// asunto tuyo, no del canal.

import { randomUUID } from 'node:crypto'
import { iniciarAsistencia } from './asistencia-inicio.mjs'
import { igualEnTiempoConstante } from './secreto-compartido.mjs'
import { crearAuditor, EVENTO, ORIGEN, payloadRechazo } from '../lib/asistencia-auditoria.mjs'

export const RESPUESTA = Object.freeze({ CANAL: 'in_channel', PRIVADA: 'ephemeral' })

const TEXTO = Object.freeze({
  SIN_CONFIGURAR: 'La carga de asistencia todavía no está configurada. Avisale a Dirección.',
  NO_AUTORIZADO: 'No pude verificar que este pedido venga de Mattermost.',
  SIN_IDENTIDAD: 'No pude identificarte. Cerrá sesión y volvé a entrar.',
  ERROR: 'No pude abrir la carga. Probá de nuevo en un minuto.',
})

const esTexto = (v) => typeof v === 'string' && v.length > 0

const efimero = (texto) => ({ status: 200, body: { response_type: RESPUESTA.PRIVADA, text: texto } })

/**
 * Crea el manejador del slash command.
 *
 * @param {object} deps
 * @param {string} deps.tokenComando  token que Mattermost manda con cada invocación
 * @param {{query:Function, withTx:Function}} deps.port
 * @param {object} deps.google
 * @param {string} [deps.url]         URL del callback de las acciones
 * @param {Function} [deps.iniciar]   inyectable para tests
 * @returns {(o:{campos:object, ip?:string}) => Promise<{status:number, body:object}>}
 */
export function crearComandoAsistencia({ tokenComando, port, google, url = null, iniciar = iniciarAsistencia, auditar = null, log = null } = {}) {
  // El auditor se arma una vez; cada rechazo se registra con su propio `request_id`.
  const registrar = auditar ?? (port ? crearAuditor(port) : async () => ({ ok: false }))

  return async function manejar({ campos = {}, ip = null } = {}) {
    const requestId = randomUUID()

    /**
     * Rechaza y DEJA CONSTANCIA. Que un intento no prospere no lo vuelve invisible.
     *
     * La auditoría no puede cambiar el resultado: si falla, el rechazo se devuelve igual.
     * Un sistema que deja pasar —o que se cae— porque no pudo escribir un log es peor que
     * uno que no audita.
     */
    const negar = async (texto, { motivo, detalle, verificada = true }) => {
      await registrar(EVENTO.DENIED, payloadRechazo({
        origen: ORIGEN.COMANDO, motivo, detalle, requestId, identidadVerificada: verificada,
        actor: { plataforma_user_id: campos.user_id ?? null, plataforma_username: campos.user_name ?? null },
        channelId: campos.channel_id ?? null, teamId: campos.team_id ?? null,
      })).catch((e) => log?.warn?.('no se pudo auditar un rechazo de asistencia', { detalle: String(e?.message ?? e).slice(0, 120) }))
      return efimero(texto)
    }

    // 1) ¿Viene de Mattermost? Sin token configurado NO se atiende: un endpoint que abre
    //    cargas sin verificar nada es peor que un endpoint apagado.
    if (!esTexto(tokenComando)) {
      log?.warn?.('comando de asistencia sin token configurado: se rechaza', { ip })
      return negar(TEXTO.SIN_CONFIGURAR, { motivo: 'token', detalle: 'token_sin_configurar', verificada: false })
    }
    if (!igualEnTiempoConstante(tokenComando, campos.token)) {
      // Sin detalle: quien no tiene el token no se entera de si existe, venció o es otro.
      log?.warn?.('comando de asistencia con token inválido', { ip })
      return negar(TEXTO.NO_AUTORIZADO, { motivo: 'token', detalle: 'token_invalido', verificada: false })
    }

    // 2) Identidad REAL de Mattermost, no la que diga el cuerpo del pedido.
    const userId = esTexto(campos.user_id) ? campos.user_id : null
    if (!userId) return negar(TEXTO.SIN_IDENTIDAD, { motivo: 'sin_identidad', detalle: 'sin_identidad' })

    // 3) EXACTAMENTE el mismo arranque que `@os asistencia`. La guarda de canal y permisos
    //    corre adentro: acá no se repite ni se afloja. La auditoría del rechazo de la guarda
    //    también vive adentro, para que la mención y el comando registren lo mismo.
    let r
    try {
      r = await iniciar({
        port,
        google,
        url,
        requestId,
        origen: ORIGEN.COMANDO,
        actor: {
          plataforma_user_id: userId,
          plataforma_username: campos.user_name ?? null,
          channel_id: campos.channel_id ?? null,
          team_id: campos.team_id ?? null,
        },
      })
    } catch (e) {
      log?.error?.('comando de asistencia: fallo al abrir', { detalle: String(e?.message ?? e).slice(0, 200) })
      return efimero(TEXTO.ERROR)
    }

    // 4) Sin mensaje interactivo (denegado, sin obras, planilla sin la columna) la respuesta
    //    es privada: es una explicación para quien escribió, no una novedad para el canal.
    if (!Array.isArray(r.attachments) || !r.attachments.length) return efimero(r.texto ?? TEXTO.ERROR)

    return {
      status: 200,
      body: { response_type: RESPUESTA.CANAL, text: r.texto ?? '', attachments: r.attachments },
    }
  }
}
