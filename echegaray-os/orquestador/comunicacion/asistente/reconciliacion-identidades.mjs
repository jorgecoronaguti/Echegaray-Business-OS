// RECONCILIACIÓN DE IDENTIDADES — que el OS sepa SIEMPRE quién le está escribiendo.
//
// EL DEFECTO QUE ORIGINA ESTE ARCHIVO, MEDIDO EN PRODUCCIÓN EL 04/08. `comunicacion.identidades`
// tenía `plataforma_user_id = 'u-jorge'` y `'u-rodrigo'`: valores de una siembra de ejemplo. Los
// ids reales de Mattermost son otros. El bot resuelve la identidad POR EL ID REAL que trae el
// evento, no encontraba fila, se quedaba sin email, y toda capacidad que necesita la cuenta de
// Google de la persona quedó fuera de `habilitadas`. El dueño pidió un evento de Calendar —con su
// token de Google enlazado y todo— y recibió «no tengo habilitado eso para vos». No faltaba un
// permiso: faltaba reconocer a la persona.
//
// CUÁNDO CORRE, Y POR QUÉ ASÍ. La reparación es EN EL MOMENTO DEL PEDIDO (`asegurarIdentidad`, que
// llama el router cuando no encuentra identidad o la encuentra sin email). Las otras dos opciones
// que se evaluaron dejan una ventana abierta:
//   · al arrancar el consumidor WS: sólo corre cuando el servicio reinicia, que en producción pasa
//     en un deploy. Alguien dado de alta en Mattermost el martes queda roto hasta el próximo deploy.
//   · por timer: achica la ventana pero no la cierra, y le pega a la API de Mattermost por gente
//     que quizás nunca escribe.
// La reparación en el momento no tiene ventana por construcción: la persona que escribe es la que
// se verifica, con el id que Mattermost acaba de emitir. Cuesta UNA llamada a Mattermost y sólo
// cuando falta el dato — cuando la identidad está completa no se consulta nada.
// Lo que la reparación NO ve son las filas de gente que hoy no escribe (una identidad vieja que
// apunta a un usuario que ya no existe, un token de Google sin identidad). Para eso está
// `auditarIdentidades`, que es el canario y corre a mano o por timer sin tocar nada.
//
// TRES REGLAS DURAS:
//   1. EL EMAIL LO MANDA MATTERMOST. Es donde la persona se autentica. Nunca se infiere del
//      username: `jorge` → `jorge@ecsas.com.ar` es una adivinanza que un día crea un evento en la
//      cuenta de otro.
//   2. NUNCA SE BORRA NI SE FUSIONA UNA IDENTIDAD. Si dos filas colisionan (mismo email, distinto
//      user_id) se DECLARA y se deja como está. Fusionar personas es irreversible; que un humano
//      mire una fila de más cuesta un minuto.
//   3. FAIL-CLOSED. Si Mattermost no contesta no se escribe nada y se dice. Una reconciliación a
//      ciegas —o peor, una que "completa" con lo que había a mano— es peor que ninguna.

import { identidadDe, listarIdentidades, registrarIdentidad, emailDe, nombreCorto } from './identidades.mjs'
import { TZ_EMPRESA } from './contratos.mjs'

const PLATAFORMA = 'mattermost'

/** Lo que puede estar mal, con un código estable para el canario y los tests. */
export const HALLAZGO = Object.freeze({
  SIN_MATTERMOST: 'sin_mattermost',       // no se pudo preguntar: no se concluye nada
  NO_VERIFICABLE: 'no_verificable',       // no se pudo mirar una fuente (la base, por ejemplo)
  ID_INEXISTENTE: 'id_inexistente',       // la identidad apunta a un usuario que Mattermost no conoce
  BAJA_EN_MATTERMOST: 'baja_en_mattermost',
  SIN_EMAIL: 'sin_email',
  EMAIL_DISTINTO: 'email_distinto',
  EMAIL_DUPLICADO: 'email_duplicado',     // dos identidades activas con el mismo correo
  TOKEN_SIN_IDENTIDAD: 'token_sin_identidad', // enlazó su Google y el chat no lo conoce
})

const norm = (e) => String(e ?? '').trim().toLowerCase()

const hallazgo = (codigo, quien, mensaje) => ({ codigo, quien, mensaje })

/**
 * Usuario de Mattermost → identidad del OS. El nombre visible es el que la gente reconoce.
 *
 * NO PISA EL TRABAJO DE UNA PERSONA: los `alias` cargados a mano (los apodos con que el equipo se
 * nombra de verdad) se preservan y se les suman los que trae Mattermost.
 */
export function aIdentidad(u, { aliasPrevios = [] } = {}) {
  const nombre = [u.first_name, u.last_name].filter(Boolean).join(' ').trim()
  const alias = new Set(aliasPrevios.map((a) => String(a).trim()).filter(Boolean))
  for (const a of [u.nickname, u.first_name, u.username]) if (a && String(a).trim()) alias.add(String(a).trim())
  return {
    plataforma: PLATAFORMA,
    plataformaUserId: String(u.id),
    plataformaUsername: u.username ?? null,
    nombreVisible: nombre || u.nickname || u.username || String(u.id),
    alias: [...alias],
    email: u.email ?? null,
    zonaHoraria: TZ_EMPRESA,
    activo: true,
  }
}

/**
 * ¿Quién es este user_id en Mattermost?
 *
 * `null` significa UNA sola cosa: Mattermost contestó que ese usuario no existe. Cualquier otro
 * problema —timeout, 500, token vencido— TIRA, para que quien llama pueda distinguir «no está» de
 * «no pude averiguarlo» y fallar cerrado en el segundo. Un `null` por caída de red haría que el OS
 * concluyera que una persona real no existe.
 */
export async function usuarioMattermost(mm, userId) {
  if (typeof mm?.usuario !== 'function') throw new Error('cliente de Mattermost sin usuario(id)')
  try {
    return (await mm.usuario(String(userId))) ?? null
  } catch (e) {
    if (Number(e?.status) === 404) return null
    throw e
  }
}

/** El cliente del OS, cargado tarde para no arrastrar el entorno de producción a cada test. */
async function clienteAutomatico(log) {
  try {
    const { mattermostDelOs } = await import('../../lib/mattermost-os.mjs')
    return mattermostDelOs({ log })
  } catch {
    return null
  }
}

/** ¿Hay otra identidad activa con este mismo correo? Se declara; NUNCA se fusiona. */
function colisionDeEmail(lista, nueva) {
  const email = norm(nueva.email)
  if (!email) return null
  const otra = lista.find((i) => norm(i.email) === email && i.plataformaUserId !== nueva.plataformaUserId)
  if (!otra) return null
  return hallazgo(HALLAZGO.EMAIL_DUPLICADO, nueva.nombreVisible,
    `${nueva.nombreVisible} (${email}) quedó con dos identidades: la de Mattermost `
    + `(${nueva.plataformaUserId}) y otra vieja (${otra.plataformaUserId}, "${nombreCorto(otra)}"). `
    + 'No fusiono ni borro nada: revisala y borrá la que sobra a mano.')
}

/**
 * La identidad REAL de quien está escribiendo, reparándola contra Mattermost si hace falta.
 *
 * Camino corto y gratis: si la fila existe y tiene email, no se consulta nada.
 *
 * @param {object} o
 * @param {{query:Function}} o.port
 * @param {{usuario:Function}} [o.mm]        cliente de Mattermost; si no viene, el del OS
 * @param {string} o.plataformaUserId        el id REAL que trajo el evento
 * @param {object} [o.previa]                la fila ya leída, para no consultarla dos veces
 * @returns {Promise<{identidad:object|null, accion:string, hallazgo:object|null}>}
 *   accion: `ya_estaba` · `creada` · `completada` · `sin_verificar` · `desconocida` · `ignorada`
 */
export async function asegurarIdentidad({
  port, mm, plataforma = PLATAFORMA, plataformaUserId, previa = undefined, log = null,
} = {}) {
  if (!port?.query || !plataformaUserId) return { identidad: null, accion: 'sin_verificar', hallazgo: null }
  const guardada = previa !== undefined ? previa : await identidadDe(port, plataformaUserId, { plataforma })
  if (guardada && emailDe(guardada)) return { identidad: guardada, accion: 'ya_estaba', hallazgo: null }

  // `undefined` = "usá el cliente del OS"; `null` = "no hay cliente" (lo que un test necesita decir
  // sin que el entorno de la máquina decida por él).
  const cliente = mm === undefined ? await clienteAutomatico(log) : mm
  const quien = guardada ? nombreCorto(guardada) : String(plataformaUserId)
  if (!cliente) {
    return {
      identidad: guardada,
      accion: 'sin_verificar',
      hallazgo: hallazgo(HALLAZGO.SIN_MATTERMOST, quien,
        'No tengo con qué preguntarle a Mattermost quién es esta persona (falta configuración del bot). No toco nada.'),
    }
  }

  let u = null
  try {
    u = await usuarioMattermost(cliente, plataformaUserId)
  } catch (e) {
    log?.warn?.('identidades: Mattermost no contestó, no se reconcilia nada', {
      plataformaUserId: String(plataformaUserId), detalle: String(e?.message ?? e).slice(0, 120),
    })
    return {
      identidad: guardada,
      accion: 'sin_verificar',
      hallazgo: hallazgo(HALLAZGO.SIN_MATTERMOST, quien,
        'Mattermost no me contestó quién es esta persona. No escribo nada hasta poder verificarlo.'),
    }
  }

  if (!u) {
    return {
      identidad: guardada,
      accion: 'desconocida',
      hallazgo: hallazgo(HALLAZGO.ID_INEXISTENTE, quien,
        `Mattermost no conoce al usuario ${plataformaUserId}. No doy de alta una identidad inventada.`),
    }
  }
  // Un bot no tiene agenda ni tareas, y a un usuario dado de baja no se le crea una identidad
  // nueva: la fila diría que está activo justo cuando dejó de estarlo.
  if (u.is_bot === true || Number(u.delete_at ?? 0) !== 0) {
    return {
      identidad: guardada,
      accion: 'ignorada',
      hallazgo: hallazgo(HALLAZGO.BAJA_EN_MATTERMOST, u.username ?? quien,
        `El usuario ${u.username ?? plataformaUserId} está dado de baja o es un bot: no le creo identidad.`),
    }
  }

  const lista = await listarIdentidades(port, { plataforma })
  const nueva = aIdentidad(u, { aliasPrevios: guardada?.alias ?? [] })
  const colision = colisionDeEmail(lista, nueva)
  if (colision) log?.warn?.('identidades: colisión de email', { detalle: colision.mensaje })

  const { identidad } = await registrarIdentidad(port, nueva)
  log?.info?.('identidades: identidad reconciliada contra Mattermost', {
    usuario: identidad.plataformaUsername, accion: guardada ? 'completada' : 'creada',
  })
  return { identidad, accion: guardada ? 'completada' : 'creada', hallazgo: colision }
}

/** Los correos que enlazaron su Google. Si no se puede mirar, se dice — no se asume que no hay. */
async function emailsConToken(port) {
  try {
    const { rows } = await port.query('select email from orq.google_tokens')
    return { emails: rows.map((r) => norm(r.email)).filter(Boolean), ok: true }
  } catch {
    return { emails: [], ok: false }
  }
}

/**
 * AUDITORÍA COMPLETA — lo que grita antes que el usuario. No escribe una sola fila.
 *
 * Mira las dos direcciones:
 *   · toda identidad activa tiene que existir de verdad en Mattermost, con su correo igual;
 *   · toda persona que enlazó su Google tiene que tener identidad en el chat.
 *
 * @returns {Promise<{ok:boolean, revisadas:number, hallazgos:Array<{codigo:string,quien:string,mensaje:string}>}>}
 */
export async function auditarIdentidades({ port, mm, plataforma = PLATAFORMA, log = null } = {}) {
  const identidades = await listarIdentidades(port, { plataforma })
  const cliente = mm === undefined ? await clienteAutomatico(log) : mm
  if (!cliente) {
    return {
      ok: false,
      revisadas: 0,
      hallazgos: [hallazgo(HALLAZGO.SIN_MATTERMOST, 'el OS',
        'No hay cómo hablarle a Mattermost (falta MM_BASE_URL / MM_BOT_TOKEN): no se revisó ninguna identidad.')],
    }
  }

  const hallazgos = []
  const vistos = new Map() // email → primera identidad que lo usa
  for (const i of identidades) {
    const quien = nombreCorto(i)
    const email = norm(i.email)
    if (email) {
      const ya = vistos.get(email)
      if (ya) {
        hallazgos.push(hallazgo(HALLAZGO.EMAIL_DUPLICADO, quien,
          `${email} está en dos identidades activas: ${nombreCorto(ya)} (${ya.plataformaUserId}) y ${quien} (${i.plataformaUserId}). Borrá a mano la que sobra: yo no fusiono personas.`))
      } else vistos.set(email, i)
    }

    let u = null
    try {
      u = await usuarioMattermost(cliente, i.plataformaUserId)
    } catch (e) {
      hallazgos.push(hallazgo(HALLAZGO.SIN_MATTERMOST, quien,
        `No pude verificar a ${quien} contra Mattermost: ${String(e?.message ?? e).slice(0, 80)}.`))
      continue
    }
    if (!u) {
      hallazgos.push(hallazgo(HALLAZGO.ID_INEXISTENTE, quien,
        `${quien} está en el OS con el usuario ${i.plataformaUserId}, que Mattermost no conoce. `
        + 'Cuando esa persona escriba, el OS no la va a reconocer, y "avisale a ' + quien + '" no le va a llegar a nadie.'))
      continue
    }
    if (Number(u.delete_at ?? 0) !== 0) {
      hallazgos.push(hallazgo(HALLAZGO.BAJA_EN_MATTERMOST, quien,
        `${quien} está dado de baja en Mattermost y sigue activo en el OS.`))
    }
    if (!email) {
      hallazgos.push(hallazgo(HALLAZGO.SIN_EMAIL, quien,
        `${quien} no tiene correo en el OS (en Mattermost es ${u.email ?? 'desconocido'}). `
        + 'Sin correo no puede agendar, ni anotar tareas, ni que lo inviten a un evento.'))
    } else if (norm(u.email) && norm(u.email) !== email) {
      hallazgos.push(hallazgo(HALLAZGO.EMAIL_DISTINTO, quien,
        `${quien} figura como ${email} en el OS y como ${norm(u.email)} en Mattermost. Manda Mattermost.`))
    }
  }

  const { emails, ok } = await emailsConToken(port)
  if (!ok) {
    hallazgos.push(hallazgo(HALLAZGO.NO_VERIFICABLE, 'el OS',
      'No pude leer orq.google_tokens: no sé si hay gente con Google enlazado y sin identidad.'))
  }
  for (const e of emails) {
    if (!vistos.has(e)) {
      hallazgos.push(hallazgo(HALLAZGO.TOKEN_SIN_IDENTIDAD, e,
        `${e} enlazó su Google con el OS y no tiene identidad en el chat. Cuando escriba, el bot no va a saber que es él.`))
    }
  }

  return { ok: hallazgos.length === 0, revisadas: identidades.length, hallazgos }
}
