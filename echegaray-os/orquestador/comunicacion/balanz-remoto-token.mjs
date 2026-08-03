// EL ENLACE DE LA PANTALLA REMOTA — firmado, con vencimiento, y sin nada adentro.
//
// ═══ QUÉ PROTEGE Y QUÉ NO ═══
//
// Protege el ACCESO al escritorio donde vive el navegador de Balanz. Quien abra ese escritorio ve la
// pantalla del bróker y puede tipear en ella, así que el enlace vale tanto como la sesión: se firma,
// vence rápido y no se publica en ningún lado salvo el canal privado de Dirección.
//
// No protege la cuenta de Balanz: eso lo hace el login del bróker, que sigue siendo manual. Este
// token nunca toca usuario, contraseña ni OTP, y no hay ninguno adentro — el contenido es una fecha
// de vencimiento y nada más.
//
// ═══ POR QUÉ FIRMADO Y NO GUARDADO EN UNA TABLA ═══
//
// Un token firmado se verifica sin estado: la pantalla remota tiene que funcionar aunque Supabase no
// conteste, porque el caso de uso es justamente "algo se rompió y hay que entrar a mirar". Un token
// en base de datos agrega una dependencia viva al camino de recuperación.

import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto'

/** Veinte minutos. Alcanza de sobra para un login con OTP y no deja un enlace útil dando vueltas. */
export const VIGENCIA_MS = Number(process.env.BALANZ_REMOTO_VIGENCIA_MS || 20 * 60 * 1000)

export class SecretoFaltante extends Error {
  constructor() {
    super('BALANZ_REMOTO_SECRETO no está configurado: sin secreto no se firma ni se verifica ningún enlace')
    this.code = 'SECRETO_FALTANTE'
  }
}

/**
 * El secreto. FALLA CERRADO: sin secreto no se emite ni se acepta nada.
 *
 * La tentación es generar uno al vuelo si falta. Sería peor que no tener token: cada reinicio del
 * proceso invalidaría los enlaces vivos, y —lo grave— dos procesos con secretos distintos aceptarían
 * cosas distintas, con lo cual "el enlace no anda" y "el enlace de cualquiera anda" pasan a depender
 * de qué proceso atendió. Un control que depende del azar no es un control.
 */
export function secretoRemoto(env = process.env) {
  const s = env.BALANZ_REMOTO_SECRETO
  if (!s || String(s).length < 16) throw new SecretoFaltante()
  return String(s)
}

const firmar = (mensaje, secreto) => createHmac('sha256', secreto).update(mensaje).digest('hex')

/** Genera un secreto nuevo para que alguien lo pegue en el archivo de entorno. No lo guarda. */
export function sugerirSecreto() { return randomBytes(32).toString('hex') }

/**
 * Emite un token. El `nonce` no aporta seguridad por sí solo — el token no es de un solo uso, porque
 * la pantalla necesita el mismo token para el HTML y para el WebSocket — pero hace que dos enlaces
 * emitidos en el mismo milisegundo sean distintos y rastreables en el log.
 */
export function emitirToken({ ahora = Date.now(), vigenciaMs = VIGENCIA_MS, env = process.env } = {}) {
  const secreto = secretoRemoto(env)
  const vence = ahora + vigenciaMs
  const nonce = randomBytes(6).toString('hex')
  const cuerpo = `${vence}.${nonce}`
  return { token: `${cuerpo}.${firmar(cuerpo, secreto)}`, vence: new Date(vence).toISOString() }
}

/** Comparación en tiempo constante. Con `===`, la diferencia de tiempo filtra la firma byte a byte. */
function igualSeguro(a, b) {
  const ba = Buffer.from(String(a), 'utf8')
  const bb = Buffer.from(String(b), 'utf8')
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}

/**
 * Verifica. Devuelve `{valido, motivo}` y NUNCA lanza por un token malo: un token inválido es una
 * respuesta 403 normal, no un error del servidor.
 */
export function verificarToken(token, { ahora = Date.now(), env = process.env } = {}) {
  let secreto
  try { secreto = secretoRemoto(env) } catch { return { valido: false, motivo: 'el servidor no tiene secreto configurado' } }
  const partes = String(token || '').split('.')
  if (partes.length !== 3) return { valido: false, motivo: 'el enlace está incompleto' }
  const [venceTxt, nonce, firma] = partes
  const vence = Number(venceTxt)
  if (!Number.isFinite(vence)) return { valido: false, motivo: 'el enlace está mal formado' }
  // LA FIRMA PRIMERO, EL VENCIMIENTO DESPUÉS. Al revés, un token vencido y con firma falsa se
  // distingue de uno vencido y bien firmado por el mensaje, y eso le dice a quien prueba si acertó
  // la firma.
  if (!igualSeguro(firma, firmar(`${venceTxt}.${nonce}`, secreto))) return { valido: false, motivo: 'el enlace no es válido' }
  if (ahora > vence) return { valido: false, motivo: 'el enlace venció: pedí uno nuevo desde Mattermost' }
  return { valido: true, vence: new Date(vence).toISOString(), nonce }
}

/** El token que viene en `?t=`. Nunca se loguea: quien lo tenga entra. */
export function tokenDeUrl(url) {
  try { return new URL(url, 'http://interno').searchParams.get('t') } catch { return null }
}
