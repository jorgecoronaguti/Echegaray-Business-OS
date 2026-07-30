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

import { timingSafeEqual } from 'node:crypto'
import { iniciarAsistencia } from './asistencia-inicio.mjs'

export const RESPUESTA = Object.freeze({ CANAL: 'in_channel', PRIVADA: 'ephemeral' })

const TEXTO = Object.freeze({
  SIN_CONFIGURAR: 'La carga de asistencia todavía no está configurada. Avisale a Dirección.',
  NO_AUTORIZADO: 'No pude verificar que este pedido venga de Mattermost.',
  SIN_IDENTIDAD: 'No pude identificarte. Cerrá sesión y volvé a entrar.',
  ERROR: 'No pude abrir la carga. Probá de nuevo en un minuto.',
})

const esTexto = (v) => typeof v === 'string' && v.length > 0

/** Comparación en tiempo constante: un token no se compara con `===`. */
function igualEnTiempoConstante(a, b) {
  if (!esTexto(a) || !esTexto(b)) return false
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  if (x.length !== y.length) return false
  return timingSafeEqual(x, y)
}

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
export function crearComandoAsistencia({ tokenComando, port, google, url = null, iniciar = iniciarAsistencia, log = null } = {}) {
  return async function manejar({ campos = {}, ip = null } = {}) {
    // 1) ¿Viene de Mattermost? Sin token configurado NO se atiende: un endpoint que abre
    //    cargas sin verificar nada es peor que un endpoint apagado.
    if (!esTexto(tokenComando)) {
      log?.warn?.('comando de asistencia sin token configurado: se rechaza', { ip })
      return efimero(TEXTO.SIN_CONFIGURAR)
    }
    if (!igualEnTiempoConstante(tokenComando, campos.token)) {
      // Sin detalle: quien no tiene el token no se entera de si existe, venció o es otro.
      log?.warn?.('comando de asistencia con token inválido', { ip })
      return efimero(TEXTO.NO_AUTORIZADO)
    }

    // 2) Identidad REAL de Mattermost, no la que diga el cuerpo del pedido.
    const userId = esTexto(campos.user_id) ? campos.user_id : null
    if (!userId) return efimero(TEXTO.SIN_IDENTIDAD)

    // 3) EXACTAMENTE el mismo arranque que `@os asistencia`. La guarda de canal y permisos
    //    corre adentro: acá no se repite ni se afloja.
    let r
    try {
      r = await iniciar({
        port,
        google,
        url,
        actor: {
          plataforma_user_id: userId,
          plataforma_username: campos.user_name ?? null,
          channel_id: campos.channel_id ?? null,
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
