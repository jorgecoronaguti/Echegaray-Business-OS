// EL CONSUMIDOR DE LA COLA DE MAILS AL CLIENTE (pantallas 31 y 32).
//
// La app encola en `public.mail_saliente` detrás de un click; acá se manda por el Gmail del
// orquestador. Es NIVEL E —efecto comunicacional hacia afuera— y por eso hay dos cosas que este
// worker no hace nunca: no decide a quién escribirle, y no vuelve a intentar indefinidamente.
//
// ═══ POR QUÉ EL ESTADO SE MARCA ANTES DE ENVIAR ═══
//
// Un mail no se puede des-enviar. Si se marcara `enviado` DESPUÉS y el proceso muriera entre el
// envío y el UPDATE, la próxima corrida lo mandaría de nuevo: el cliente recibe dos. Por eso se toma
// la fila (a `procesando`, con `for update skip locked`) ANTES de llamar a Gmail. El riesgo se
// invierte a propósito: ante una muerte a mitad de camino preferimos un mail que quizá no salió
// —y que una persona puede reenviar— antes que uno duplicado que ya está en la bandeja del cliente.
import { esc } from './plantillas.mjs'

// ═══ DESDE CUÁNDO ATIENDE (25/09/2026) ═══
//
// La cola existió desde el 25/08 sin un worker instalado: lo que se hubiera encolado en ese mes
// quedó esperando sin que nadie lo mandara. Encender el worker NO puede ser la decisión de mandar
// ese atraso — un aviso de vencimiento de hace semanas, o una invitación a alguien a quien después se
// le habló por otro lado, es un mail equivocado que ya no se puede des-enviar. Es Nivel E y lo decide
// el dueño.
//
// Por eso el worker sólo toca filas pedidas DESDE `ORQ_MAIL_DESDE` (la fecha en que se instaló).
// Lo anterior queda `pendiente`, intacto, y el worker lo cuenta en cada corrida como RETENIDO. Si el
// dueño decide mandarlo, se corre la fecha hacia atrás; si decide descartarlo, se marca `error` con
// el motivo. Sin la variable el worker no arranca: falla cerrado, no «manda todo».
export function desdeDelEntorno(env = process.env) {
  const v = String(env.ORQ_MAIL_DESDE ?? '').trim()
  const d = v ? new Date(v) : null
  if (!d || Number.isNaN(d.getTime())) {
    throw new Error('ORQ_MAIL_DESDE falta o no es una fecha: el worker no manda nada sin saber desde '
      + 'cuándo le corresponde (ver cola-mails.mjs, «DESDE CUÁNDO ATIENDE»)')
  }
  return d
}

/** Cuántos esperan: los que le tocan a este worker y los retenidos (anteriores al corte). */
export async function contarCola(port, { desde }) {
  const r = await port.query(
    `select count(*) filter (where pedido_at >= $1)::int as nuevos,
            count(*) filter (where pedido_at <  $1)::int as retenidos
       from public.mail_saliente where estado in ('pendiente', 'procesando')`,
    [desde],
  )
  return { nuevos: r?.rows?.[0]?.nuevos ?? 0, retenidos: r?.rows?.[0]?.retenidos ?? 0 }
}

export const MAX_INTENTOS = 3
export const LEASE_MIN = Number(process.env.ORQ_MAIL_LEASE_MIN || 10)
/** El remitente es la casilla de Administración, no una dirección de sistema. */
export const REMITENTE = process.env.ORQ_PORTAL_REMITENTE || 'administracion@ecsas.com.ar'

export async function reciclarColgados(port, { minutos = LEASE_MIN, desde } = {}) {
  if (!desde) throw new Error('reciclarColgados sin `desde`: no se tocan filas retenidas')
  const r = await port.query(
    `update public.mail_saliente
        set estado = case when intentos >= $2 then 'error' else 'pendiente' end,
            error = case when intentos >= $2 then 'el envío se cortó y no quedan reintentos' else error end
      where estado = 'procesando' and tomado_at < now() - make_interval(mins => $1::int)
        and pedido_at >= $3
      returning id`,
    [minutos, MAX_INTENTOS, desde],
  )
  return r?.rows?.length ?? 0
}

export async function tomarMail(port, { desde } = {}) {
  if (!desde) throw new Error('tomarMail sin `desde`: no se toma nada que pueda ser del atraso retenido')
  const r = await port.query(
    `update public.mail_saliente m
        set estado = 'procesando', tomado_at = now(), intentos = m.intentos + 1
      where m.id = (select id from public.mail_saliente
                     where estado = 'pendiente' and pedido_at >= $1 order by pedido_at limit 1
                     for update skip locked)
      returning m.*`,
    [desde],
  )
  return r?.rows?.[0] ?? null
}

/**
 * ¿ESTE MAIL TODAVÍA CORRESPONDE?
 *
 * Se pregunta AHORA, no cuando se encoló. Entre el click y el envío pueden pasar minutos y en el
 * medio el acceso puede haberse revocado. Mandarle a alguien a quien acabamos de sacarle el acceso
 * un mail que dice «ya tenés acceso» es el peor de los dos errores posibles. Falla cerrado: si no se
 * puede confirmar, no se manda.
 */
export async function sigueCorrespondiendo(port, mail) {
  if (mail?.plantilla !== 'habilitacion_portal') return { ok: true }
  try {
    const r = await port.query(
      'select revocado_at from public.cliente_acceso where email = $1',
      [mail.para],
    )
    if (!r?.rows?.length) return { ok: false, motivo: 'el mail ya no tiene un acceso habilitado' }
    if (r.rows[0].revocado_at) return { ok: false, motivo: 'el acceso se revocó después de encolar el mail' }
    return { ok: true }
  } catch (e) {
    return { ok: false, motivo: `no pude confirmar el acceso: ${e.message}` }
  }
}

/**
 * Gmail manda HTML pero muchos clientes muestran la alternativa de texto. `gmailSend` no arma
 * multipart alternativo, así que el HTML va como HTML — y el asunto tiene que alcanzar para entender
 * de qué se trata sin abrirlo.
 */
export async function enviarUno({ port, google, mail }) {
  const corresponde = await sigueCorrespondiendo(port, mail)
  if (!corresponde.ok) {
    await port.query(
      "update public.mail_saliente set estado = 'error', error = $2 where id = $1",
      [mail.id, corresponde.motivo],
    )
    return 'cancelado'
  }
  const r = await google.gmailSend({
    to: mail.para, subject: mail.asunto, body: mail.cuerpo_html, html: true,
  })
  await port.query(
    "update public.mail_saliente set estado = 'enviado', enviado_at = now(), error = null where id = $1",
    [mail.id],
  )
  return r?.id ? 'enviado' : 'enviado'
}

export async function procesarCola({ port, google, desde, max = 25 } = {}) {
  const reciclados = await reciclarColgados(port, { desde })
  const cuenta = { reciclados, enviado: 0, cancelado: 0, error: 0 }
  for (let i = 0; i < max; i += 1) {
    const mail = await tomarMail(port, { desde })
    if (!mail) break
    try {
      cuenta[await enviarUno({ port, google, mail })] += 1
    } catch (e) {
      cuenta.error += 1
      const agotado = mail.intentos >= MAX_INTENTOS
      await port.query(
        'update public.mail_saliente set estado = $2, error = $3 where id = $1',
        [mail.id, agotado ? 'error' : 'pendiente', String(e.message).slice(0, 500)],
      )
    }
  }
  return cuenta
}

/** Deja el cuerpo listo para encolar. Se exporta para que la server action arme la fila igual. */
export function filaDeMail({ para, plantilla, cliente_id, pedido_por }) {
  return {
    para: String(para ?? '').trim().toLowerCase(),
    asunto: plantilla.asunto,
    cuerpo_html: plantilla.html,
    plantilla: plantilla.plantilla,
    clave_unica: plantilla.clave_unica,
    cliente_id: cliente_id ?? null,
    pedido_por,
  }
}

export { esc }
