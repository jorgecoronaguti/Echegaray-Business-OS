#!/usr/bin/env node
// EL AVISO DE UNA ENTREGA DE EFECTIVO — «le llega el aviso con el enlace para dar conformidad y firmar».
//
// Diseño (D02 · M01 · componente de canal 5): cuando Administración entrega efectivo, la persona recibe
// el enlace directo a la pantalla de firma, sin buscarla.
//
// ═══ POR MENSAJE DIRECTO, NO POR EL CANAL (dueño, 23/09/2026) ═══
//
// «Para la firma de registro de plata, XSAS tiene que mandar mensaje directo a cada persona que se le dio
// la plata para que firme, no vía canal Efectivo; así se hace el registro nada más». El canal es donde se
// REGISTRA la entrega; el pedido de firma es entre el bot y esa persona. Si la persona no tiene usuario de
// Mattermost atado, el aviso cae al canal mencionándola, como antes: peor un aviso público que ninguno.
//
// SIN MONTO. El canal lo ve todo el grupo que rinde; cuánta plata recibió cada uno es de esa persona y
// de Administración, y está en la pantalla a la que lleva el enlace.
//
// ═══ Y LO QUE PASA, EN EL HILO DEL CANAL (dueño, 24/09/2026) ═══
//
// «La persona firmó el recibo y no me emitió notificación ni de ida ni de que ya estaba firmado. Todo esto
// pase en el canal efectivo, en el hilo de cada escritura». La entrega recuerda el hilo donde se registró
// (`origen_post_id`) y ahí quedan la ida («📨 Le pedí la firma…»), la firma («✓ … firmó») y la anulación
// («✕ … anulada»). Sin monto. El directo al dueño por la firma se retiró: salía y se perdía en su DM.
//
// UNA VEZ. `efectivo_entrega.avisada_en` se marca con el id del post, releído de Mattermost: un aviso
// que la API dijo publicar pero no se puede leer no cuenta como avisado y se reintenta.
//
//   node orquestador/scripts/efectivo-avisos.mjs [--dry]
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { debeAvisarA } from '../lib/notificaciones.mjs'

export const URL_APP = process.env.ORQ_APP_URL || 'https://app.ecsas.com.ar'

/** NÚCLEO PURO: el texto del aviso. */
export function textoDelAviso({ username, codigo, destino, entregaId, directo = false }) {
  const quien = directo ? 'Te entregaron' : username ? `@${username} te entregaron` : 'Hay una entrega de'
  return [`${quien} efectivo a rendir: **${codigo}** · ${destino}.`,
    `Confirmá que lo recibiste y firmá: ${URL_APP}/mi-informacion/efectivo/firmar?entrega=${entregaId}`,
    'Los tickets de lo que gastes, mandalos al canal Efectivo.'].join('\n')
}

/** El canal directo bot ↔ persona. Mattermost lo crea si no existe; devuelve su id. */
async function canalDirectoCon(mmUserId) {
  const base = String(delEntorno('MM_BASE_URL') ?? '').replace(/\/+$/, '')
  const token = delEntorno('MM_BOT_TOKEN')
  if (!base || !token || !mmUserId) return null
  const h = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const yo = await fetch(`${base}/api/v4/users/me`, { headers: h })
  if (!yo.ok) return null
  const { id: botId } = await yo.json()
  const r = await fetch(`${base}/api/v4/channels/direct`, { method: 'POST', headers: h, body: JSON.stringify([botId, String(mmUserId)]) })
  if (!r.ok) return null
  return (await r.json())?.id ?? null
}

function delEntorno(clave) {
  if (process.env[clave]) return process.env[clave]
  try {
    const txt = readFileSync(join(homedir(), '.config/echegaray-orq/comunicacion.env'), 'utf8')
    return txt.match(new RegExp(`^${clave}=(.*)$`, 'm'))?.[1]?.trim() ?? null
  } catch { return null }
}

/**
 * EL USUARIO DE MATTERMOST POR EL EMAIL, cuando la tabla de identidades todavía no lo tiene (24/09/2026).
 * Esa tabla se llena cuando la persona LE ESCRIBE al bot: Emiliano nunca le había escrito, no figuraba, y el
 * aviso de ER-0020 salió al canal en vez de por directo (dueño: «manda el mensaje al canal efectivo en lugar
 * del chat directo a la persona»). El email es el de la cuenta de la app, que es el mismo con que entra a
 * Mattermost; si Mattermost no lo conoce, no hay directo posible y el aviso va al canal, como antes.
 */
export async function usuarioMattermostPorEmail(email) {
  const base = String(delEntorno('MM_BASE_URL') ?? '').replace(/\/+$/, '')
  const token = delEntorno('MM_BOT_TOKEN')
  if (!base || !token || !email) return null
  const r = await fetch(`${base}/api/v4/users/email/${encodeURIComponent(String(email).trim().toLowerCase())}`, { headers: { Authorization: `Bearer ${token}` } })
  if (!r.ok) return null
  const u = await r.json()
  return u?.id && !u.delete_at ? { id: u.id, username: u.username ?? null } : null
}

/**
 * Publica y RELEE el post. Devuelve el id sólo si se pudo leer de vuelta.
 *
 * `rootId` es la raíz del hilo donde se registró la entrega. Si Mattermost la rechaza (400: el post se borró),
 * el aviso sale suelto: peor un aviso fuera del hilo que ninguno.
 */
async function publicarYReleer(channelId, message, rootId = null) {
  const base = String(delEntorno('MM_BASE_URL') ?? '').replace(/\/+$/, '')
  const token = delEntorno('MM_BOT_TOKEN')
  if (!base || !token) throw new Error('sin MM_BASE_URL / MM_BOT_TOKEN')
  const h = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const postear = (root) => fetch(`${base}/api/v4/posts`, { method: 'POST', headers: h, body: JSON.stringify({ channel_id: channelId, message, ...(root ? { root_id: root } : {}) }) })
  let r = await postear(rootId)
  if (!r.ok && r.status === 400 && rootId) r = await postear(null)
  if (!r.ok) throw new Error(`Mattermost ${r.status} al publicar`)
  const { id } = await r.json()
  const v = await fetch(`${base}/api/v4/posts/${id}`, { headers: h })
  return v.ok && (await v.json())?.message === message ? id : null
}

/**
 * NÚCLEO: las entregas abiertas sin aviso, con la persona resuelta a su usuario de Mattermost.
 * Sin migración aplicada devuelve null (no hay nada que avisar y no es una falla).
 */
export async function pendientesDeAviso(port) {
  try {
    const { rows } = await port.query(
      `select e.id, e.codigo, coalesce(o.nombre, 'Estructura') as destino, i.plataforma_username as username,
              i.plataforma_user_id as mm_user_id, pf.id as usuario_id, u.email, per.nombre_completo as nombre,
              e.entregada_por, e.origen_post_id
         from public.efectivo_entrega e
         left join public.obra_canonica o on o.id = e.obra_id
         left join public.personas per on per.id = e.persona_id
         left join public.perfiles pf on pf.persona_id = e.persona_id
         left join auth.users u on u.id = pf.id
         left join comunicacion.identidades i on lower(i.email) = lower(u.email) and i.plataforma = 'mattermost' and i.activo
        where e.avisada_en is null and e.anulada_en is null and e.cerrada_en is null
          -- Una entrega de prueba no avisa a nadie (dueño, 24/09/2026), igual que no entra al Sheet.
          and not e.es_prueba
          -- LA ENTREGA DEL CHAT ESPERA SU HILO: el especialista escribe origen_post_id apenas la registra, y
          -- el relleno desde el outbox la alcanza en el tick siguiente. Sin esta espera, el aviso de ida de
          -- una entrega recién hecha salía suelto porque el hilo todavía no estaba anotado.
          and (e.origen_post_id is not null or e.creada_en < now() - interval '10 seconds')
        order by e.creada_en`)
    return rows
  } catch (e) {
    if (e?.code === '42P01' || e?.code === '42703') return null
    throw e
  }
}

/** La hora de San Juan, HH:MM. */
export function horaSanJuan(fecha = new Date()) {
  return new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/San_Juan', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(fecha)
}

/**
 * NÚCLEO PURO: la línea que queda en el HILO del canal cuando sale el pedido de firma (dueño, 24/09/2026:
 * «no me emitió notificación ni de ida»). Sin monto. `quien` es @usuario o el nombre del padrón.
 */
export function textoDeIda({ codigo, quien, hora, directo = true, motivo = null }) {
  return directo
    ? `📨 Le pedí la firma de **${codigo}** a ${quien} por mensaje directo · ${hora}`
    : `📨 No le pude pedir la firma de **${codigo}** a ${quien} por mensaje directo (${motivo ?? 'sin Mattermost'}): el pedido queda acá · ${hora}`
}

export async function avisarEntregas(port, { dry = false, publicar = publicarYReleer, directo = canalDirectoCon, porEmail = usuarioMattermostPorEmail, log = console, ahora = () => new Date() } = {}) {
  const pend = await pendientesDeAviso(port)
  if (!pend) return { avisadas: 0, sinMigracion: true }
  if (!pend.length) return { avisadas: 0 }
  // EL CANAL, POR ORDEN (22/09/2026): el de rendiciones si existiera, y si no el de comprobantes —
  // Comprobantes-gastos, que es donde el dueño decidió que viva todo el efectivo. El canal propio se archivó;
  // sin este orden, los avisos para firmar dejaban de salir y nadie se enteraba.
  const canal = (await port.query(
    `select channel_id from comunicacion.canales_area
      where plataforma = 'mattermost' and area_clave in ('rendicion', 'compras') and activo
      order by case area_clave when 'rendicion' then 0 else 1 end limit 1`)).rows[0]?.channel_id
  // Sin canal no se inventa otro lugar: se dice, y las entregas quedan sin avisar hasta que exista.
  if (!canal) { log.warn?.(`efectivo: ${pend.length} entrega(s) sin avisar — no hay canal atado a rendicion ni a compras`); return { avisadas: 0, sinCanal: pend.length } }
  let avisadas = 0
  for (const e of pend) {
    // DIRECTO si la persona tiene usuario Y no apagó este aviso (Mi cuenta › Notificaciones); si no,
    // al canal con la mención: la firma hace falta igual. En el directo no hace falta el @.
    const quiereDm = await debeAvisarA(port, e.usuario_id, 'efectivo_firma', 'mattermost_dm')
    // Sin identidad todavía, se la busca por el email de su cuenta (ver `usuarioMattermostPorEmail`).
    const mm = e.mm_user_id ? { id: e.mm_user_id, username: e.username } : await porEmail(e.email).catch(() => null)
    const dm = mm?.id && quiereDm ? await directo(mm.id).catch(() => null) : null
    const username = e.username ?? mm?.username ?? null
    const quien = username ? `@${username}` : (e.nombre ?? 'la persona')
    const hora = horaSanJuan(ahora())
    let texto = textoDelAviso({ username: dm ? null : username, codigo: e.codigo, destino: e.destino, entregaId: e.id, directo: !!dm })
    // SIN DIRECTO, EL PEDIDO VA AL HILO DE LA ENTREGA y dice por qué no fue por directo.
    if (!dm) {
      const motivo = !mm?.id ? 'no tiene usuario de Mattermost' : !quiereDm ? 'apagó los avisos directos' : 'Mattermost no abrió el directo'
      texto = `${textoDeIda({ codigo: e.codigo, quien, hora, directo: false, motivo })}\n${texto}`
    }
    if (dry) { log.info?.(`[dry] ${e.codigo} (${dm ? 'directo' : 'canal'}${e.origen_post_id ? ', hilo' : ''}): ${texto.split('\n')[0]}`); continue }
    const post = await publicar(dm ?? canal, texto, dm ? null : (e.origen_post_id ?? null)).catch((err) => { log.warn?.(`efectivo: no pude avisar ${e.codigo}: ${err.message}`); return null })
    if (!post) continue
    // CON DIRECTO, la constancia de la ida queda en el hilo del canal: se encola en la MISMA sentencia que
    // marca la entrega avisada, así no hay una sin la otra. La publica `drenarAvisos`, con reintento y releído.
    await port.query(
      dm
        ? `with u as (update public.efectivo_entrega set avisada_en = now(), aviso_post_id = $2 where id = $1 and avisada_en is null returning id, entregada_por)
           insert into public.efectivo_aviso (entrega_id, tipo, destino, texto, pedido_por)
           select id, 'pedido_firma', 'canal', $3, entregada_por from u`
        : `update public.efectivo_entrega set avisada_en = now(), aviso_post_id = $2 where id = $1 and avisada_en is null`,
      dm ? [e.id, post, textoDeIda({ codigo: e.codigo, quien, hora })] : [e.id, post])
    avisadas++
  }
  return { avisadas, pendientes: pend.length }
}

// ── LO QUE LA APP PIDE POR EL CANAL: RECLAMAR UNA RENDICIÓN (D03) Y PEDIR EL DATO DE UN TICKET (D05) ──
//
// La web corre en Vercel y no tiene el token del bot: encola el aviso en `public.efectivo_aviso`
// (migración 20260922T2800) y esto lo vacía. Mismo canal y mismo releído que el aviso de entrega: un
// post que la API dice haber publicado pero no se puede leer NO se marca enviado y se reintenta.
//
// El texto viene armado de la base —la app no elige qué se dice en el chat de la empresa— y no lleva
// un solo peso: el canal lo ve todo el grupo que rinde.

/** El canal oficial donde salen los avisos del efectivo. `null` si no hay ninguno atado. */
export async function canalDeEfectivo(port) {
  const { rows } = await port.query(
    `select channel_id from comunicacion.canales_area
      where plataforma = 'mattermost' and area_clave in ('rendicion', 'compras') and activo
      order by case area_clave when 'rendicion' then 0 else 1 end limit 1`)
  return rows[0]?.channel_id ?? null
}

/** NÚCLEO PURO: el mensaje final. La mención va adelante para que le suene el teléfono a quien debe. */
export function textoDelPedido({ username, texto }) {
  return username ? `@${username} ${texto}` : texto
}

/** Los tipos que el canal recibe con la mención ADELANTE («@rsosa faltan los tickets…»). Los demás la llevan adentro. */
const CON_MENCION_ADELANTE = new Set(['reclamo', 'pedido_de_dato'])

/** NÚCLEO PURO: `{persona}` → @usuario, o el nombre del padrón si no tiene Mattermost. */
export function conPersona(texto, { username, nombre }) {
  return String(texto).replaceAll('{persona}', username ? `@${username}` : (nombre ?? 'la persona'))
}

/**
 * A DÓNDE VA CADA AVISO (dueño, 24/09/2026: «todo esto pase en el canal efectivo directamente, y más fácil en
 * el hilo de cada escritura»):
 *
 *   - destino `canal` → al canal Efectivo, EN EL HILO donde se registró la entrega (`origen_post_id`); una
 *     entrega hecha en la web no tiene hilo y el aviso sale suelto, con el código ER.
 *   - destino `persona` → por directo a quien recibió la plata (la anulación, con el monto). Si no hay directo
 *     posible NO cae al canal: ese texto lleva el monto, y la anulación ya se dice en el hilo sin él.
 *   - destino `dueno` → RETIRADO el 24/09: el directo de ER-0020 salió y se perdió en el DM. Si quedara alguno
 *     encolado de antes, se descarta diciendo por qué.
 */
export async function drenarAvisos(port, { dry = false, publicar = publicarYReleer, directo = canalDirectoCon, porEmail = usuarioMattermostPorEmail, log = console, tope = 20 } = {}) {
  let pend
  try {
    const { rows } = await port.query(
      `select a.id, a.tipo, a.texto, a.destino, i.plataforma_username as username, i.plataforma_user_id as mm_user_id,
              pf.id as usuario_id, u.email, per.nombre_completo as nombre, e.codigo, e.origen_post_id
         from public.efectivo_aviso a
         join public.efectivo_entrega e on e.id = a.entrega_id
         left join public.personas per on per.id = e.persona_id
         left join public.perfiles pf on pf.persona_id = e.persona_id
         left join auth.users u on u.id = pf.id
         left join comunicacion.identidades i
                on lower(i.email) = lower(u.email) and i.plataforma = 'mattermost' and i.activo
        where a.enviado_en is null and a.intentos < 5 and not e.es_prueba
        order by a.pedido_en limit $1`, [tope])
    pend = rows
  } catch (e) {
    // Sin la 2800 aplicada no hay cola: no es una falla, es una base más vieja que el código.
    if (e?.code === '42P01' || e?.code === '42703') return { enviados: 0, sinMigracion: true }
    throw e
  }
  if (!pend.length) return { enviados: 0 }
  const canal = await canalDeEfectivo(port)
  if (!canal) {
    log.warn?.(`efectivo: ${pend.length} pedido(s) sin salir — no hay canal atado a rendicion ni a compras`)
    return { enviados: 0, sinCanal: pend.length }
  }
  let enviados = 0
  const descartar = (a, motivo) => port.query(
    `update public.efectivo_aviso set intentos = 5, ultimo_error = $2 where id = $1 and enviado_en is null`, [a.id, motivo])
  for (const a of pend) {
    let destinoPost
    let root = null
    let texto
    if (a.destino === 'canal') {
      destinoPost = canal
      root = a.origen_post_id ?? null
      if (a.texto.includes('{persona}')) {
        // Sin identidad todavía, el usuario se busca por el email de su cuenta (igual que el pedido de firma).
        const username = a.username ?? (a.email ? (await porEmail(a.email).catch(() => null))?.username ?? null : null)
        texto = conPersona(a.texto, { username, nombre: a.nombre })
      } else {
        texto = CON_MENCION_ADELANTE.has(a.tipo) ? textoDelPedido(a) : a.texto
      }
    } else if (a.destino === 'persona') {
      // LA PREFERENCIA SE RESPETA (Mi cuenta › Notificaciones). Apagado o sin usuario: no hay directo.
      const quiereDm = a.tipo === 'anulacion' ? await debeAvisarA(port, a.usuario_id, 'efectivo_anulacion', 'mattermost_dm') : true
      destinoPost = quiereDm && a.mm_user_id ? await directo(a.mm_user_id).catch(() => null) : null
      if (!destinoPost) {
        if (!dry) await descartar(a, 'sin directo con la persona: no se publica en el canal porque lleva el monto; el hilo del canal ya lo dice sin él')
        continue
      }
      texto = a.texto
    } else {
      if (!dry) await descartar(a, 'el directo al dueño se retiró el 24/09/2026: los avisos del efectivo van al hilo del canal')
      continue
    }
    if (dry) { log.info?.(`[dry] ${a.tipo} → ${a.destino}${root ? ' (hilo)' : ''}: ${texto.split('\n')[0]}`); continue }
    let post = null
    try {
      post = await publicar(destinoPost, texto, root)
    } catch (err) {
      await port.query('select public.efectivo_aviso_fallo($1, $2)', [a.id, String(err?.message ?? err)])
      log.warn?.(`efectivo: no pude mandar el ${a.tipo}: ${err?.message ?? err}`)
      continue
    }
    if (!post) {
      await port.query('select public.efectivo_aviso_fallo($1, $2)', [a.id, 'publicado pero no se pudo releer'])
      continue
    }
    await port.query('select public.efectivo_aviso_enviado($1, $2)', [a.id, post])
    enviados++
  }
  return { enviados, pendientes: pend.length }
}

/**
 * EL HILO DE LAS ENTREGAS HECHAS POR CHAT, SACADO DE LA RESPUESTA DEL BOT (24/09/2026).
 *
 * El especialista anota `origen_post_id` al registrar la entrega, pero corre en el worker de comunicación, que
 * sólo se reinicia de 2 a 5 h. Hasta entonces —y después, como red— se lee del outbox: la respuesta
 * «Registrado: **ER-00xx**» salió en el canal Efectivo con `root_id` = el hilo. Se exige que la respuesta sea
 * posterior a la entrega y de los diez minutos siguientes: un código de una prueba borrada no se confunde.
 */
export async function rellenarOrigenDesdeElChat(port) {
  try {
    const { rowCount } = await port.query(
      `update public.efectivo_entrega e set origen_post_id = r.root_id
         from (select substring(o.payload->'data'->>'texto' from '^Registrado: \\*\\*(ER-[0-9]+)\\*\\*') as codigo,
                      o.payload->'data'->>'root_id' as root_id, o.creado_at
                 from comunicacion.outbox o
                where o.creado_at > now() - interval '3 days'
                  and o.payload->'data'->>'texto' like 'Registrado: **ER-%'
                  and o.payload->'data'->>'channel_id' in (
                        select channel_id from comunicacion.canales_area
                         where plataforma = 'mattermost' and area_clave in ('rendicion', 'compras'))) r
        where e.origen_post_id is null and r.root_id is not null and e.codigo = r.codigo
          and e.creada_en > now() - interval '3 days'
          and r.creado_at between e.creada_en and e.creada_en + interval '10 minutes'`)
    return rowCount ?? 0
  } catch (e) {
    if (e?.code === '42P01' || e?.code === '42703') return null
    throw e
  }
}

/**
 * UN TICK, EN ORDEN: primero el hilo, después la ida (que encola su constancia al hilo) y al final la cola,
 * que la publica en el mismo tick. Es lo que corre el timer (`procesar-comprobantes-web.mjs`, cada 15 s):
 * el 24/09 el relleno quedó escrito acá y el timer llamaba a las otras dos sueltas — no corría nunca.
 */
export async function cicloDeAvisos(port, { dry = false, log = console } = {}) {
  let hilos = 0
  if (!dry) {
    try { hilos = await rellenarOrigenDesdeElChat(port) } catch (e) { log.warn?.(`efectivo: no pude rellenar los hilos: ${e?.message ?? e}`) }
  }
  const entregas = await avisarEntregas(port, { dry, log })
  const pedidos = await drenarAvisos(port, { dry, log })
  return { hilos, entregas, pedidos }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const db = await import('../lib/db.mjs')
  const port = { query: (...a) => db.query(...a) }
  const dry = process.argv.includes('--dry')
  cicloDeAvisos(port, { dry })
    .then((r) => console.log(JSON.stringify(r)))
    .catch((e) => { console.error('ERROR:', e.message); process.exitCode = 1 })
    .finally(() => db.closePool?.())
}
