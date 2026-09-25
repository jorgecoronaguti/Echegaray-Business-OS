// QUÉ PASÓ CON EL MAIL — LEÍDO DE `public.mail_saliente`, NO DEL BOTÓN QUE SE APRETÓ.
//
// ═══ EL DEFECTO (25/09/2026) ═══
//
// «Invitar» y «Publicar esquema» encolan un mail y la pantalla decía «Invitación reenviada.» o
// «Recibe un mail con el link». La cola no tuvo worker del 25/08 al 25/09, y desde que lo tiene la
// cuenta que envía (administracion@) no está conectada: ningún mail salió nunca. La pantalla
// afirmaba un envío que no había pasado. Un mail es Nivel E: quien lo pidió tiene que saber si llegó.
//
// Ahora el click dice lo que es seguro —«queda en cola»— y la fila dice lo que la cola sabe:
// en cola, en cola sin cuenta que envía, enviado (con hora) o no salió (con el motivo).
//
// ═══ ¿LA CUENTA QUE ENVÍA ANDA? SE DEDUCE DE LA MISMA COLA ═══
//
// La web no puede leer `orq.google_tokens`. Pero el worker, cuando no tiene token, anota el motivo
// en las filas pendientes sin gastarles intentos (`marcarSinCuenta` en cola-mails.mjs). Entonces:
// anda ⇔ alguna vez salió un mail Y ninguna fila está trabada por falta de cuenta. Sin ningún envío
// en la historia no hay evidencia de que ande, y se dice que falta conectarla.
//
// Módulo puro, sin alias `@/`: lo importan componentes de cliente y las pruebas de `node --test`.

export type EstadoMailCola = 'pendiente' | 'procesando' | 'enviado' | 'error'

/** Una fila de `public.mail_saliente`, lo justo para contar qué le pasó. */
export interface MailCola {
  para: string
  estado: EstadoMailCola
  pedido_at: string
  enviado_at: string | null
  error: string | null
  clave_unica?: string | null
}

export const COLUMNAS_MAIL = 'para, estado, pedido_at, enviado_at, error, clave_unica'

/** El comienzo del motivo que escribe el worker. Atado a `SIN_CUENTA` de cola-mails.mjs por prueba. */
export const SIN_CUENTA = 'no está conectada la cuenta que envía'
export const esSinCuenta = (error: string | null | undefined): boolean =>
  typeof error === 'string' && error.startsWith(SIN_CUENTA)

export type Tono = 'pos' | 'warn' | 'neg'

/** «25/09 14:43» en hora de San Juan, sea cual sea el huso del proceso (Vercel corre en UTC). */
export function fechaHoraAR(iso: string): string {
  const partes = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Argentina/San_Juan', day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(iso))
  const p = (t: string) => partes.find((x) => x.type === t)?.value ?? ''
  return `${p('day')}/${p('month')} ${p('hour')}:${p('minute')}`
}

/** El renglón de un mail: qué le pasó, en palabras, y con qué color. */
export function lecturaDelMail(m: MailCola): { texto: string; tono: Tono } {
  if (m.estado === 'enviado') return { texto: `mail enviado ${fechaHoraAR(m.enviado_at ?? m.pedido_at)}`, tono: 'pos' }
  if (m.estado === 'error') return { texto: `el mail no salió: ${m.error ?? 'sin motivo registrado'}`, tono: 'neg' }
  if (esSinCuenta(m.error)) return { texto: 'mail en cola: falta conectar la cuenta que envía', tono: 'warn' }
  if (m.error) return { texto: `mail en cola, falló un intento: ${m.error}`, tono: 'warn' }
  return { texto: 'mail en cola, todavía no salió', tono: 'warn' }
}

/** Lo que se le dice a quien apretó el botón. «Anda» sale de `remitenteAnda`, nunca se supone. */
export function textoEnCola(anda: boolean, varios = false): string {
  const [queda, sale] = varios ? ['quedan', 'salen'] : ['queda', 'sale']
  return anda
    ? `${queda} en cola; ${sale} en los próximos minutos`
    : `${queda} en cola; ${sale} cuando esté conectada la cuenta que envía`
}

export function remitenteAnda(ultimoEnviadoAt: string | null, hayTrabadoSinCuenta: boolean): boolean {
  return ultimoEnviadoAt !== null && !hayTrabadoSinCuenta
}

/** El último mail de cada destinatario (las filas vienen en cualquier orden). */
export function ultimoPorDestinatario(mails: MailCola[]): Map<string, MailCola> {
  const out = new Map<string, MailCola>()
  for (const m of mails) {
    const previo = out.get(m.para)
    if (!previo || m.pedido_at > previo.pedido_at) out.set(m.para, m)
  }
  return out
}

/**
 * Los mails de la ÚLTIMA publicación del esquema. La clave es `esquema:<cliente>:<publicado_at>:<mail>`:
 * una publicación son todas las filas que comparten todo menos el mail.
 */
export function mailsDeLaUltimaPublicacion(mails: MailCola[]): MailCola[] {
  if (!mails.length) return []
  const ultimo = mails.reduce((a, b) => (b.pedido_at > a.pedido_at ? b : a))
  const clave = ultimo.clave_unica ?? null
  const sufijo = `:${ultimo.para}`
  if (!clave || !clave.endsWith(sufijo)) return [ultimo]
  const lote = clave.slice(0, -sufijo.length)
  return mails.filter((m) => m.clave_unica === `${lote}:${m.para}`)
}

/** Una línea para el aviso de la última publicación: cuántos salieron, cuántos esperan y por qué. */
export function resumenAviso(mails: MailCola[]): { texto: string; tono: Tono } | null {
  if (!mails.length) return null
  const enviados = mails.filter((m) => m.estado === 'enviado')
  const fallidos = mails.filter((m) => m.estado === 'error')
  const enCola = mails.filter((m) => m.estado === 'pendiente' || m.estado === 'procesando')
  const partes: string[] = []
  if (enviados.length) {
    const ultimo = enviados.map((m) => m.enviado_at ?? m.pedido_at).sort().at(-1) as string
    partes.push(`${enviados.length} enviado${enviados.length === 1 ? '' : 's'} (${fechaHoraAR(ultimo)})`)
  }
  if (enCola.length) {
    partes.push(`${enCola.length} en cola${enCola.some((m) => esSinCuenta(m.error))
      ? ': sale cuando esté conectada la cuenta que envía' : ', todavía sin salir'}`)
  }
  if (fallidos.length) partes.push(`${fallidos.length} no salió: ${fallidos[0].error ?? 'sin motivo registrado'}`)
  const tono: Tono = fallidos.length ? 'neg' : enCola.length ? 'warn' : 'pos'
  return { texto: `Aviso por mail de la última publicación: ${partes.join(' · ')}`, tono }
}
