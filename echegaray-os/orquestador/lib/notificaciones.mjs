// QUÉ AVISOS MANDA EL OS, Y SI HAY QUE MANDARLE ÉSTE A ESTA PERSONA POR ACÁ.
//
// Es el catálogo de tipos de aviso (uno por hecho que hoy genera un mensaje a una persona) y la única
// función que los emisores consultan antes de mandar: `debeAvisar`. La preferencia vive en
// `public.usuario_preferencia_notificacion` (migración 20260923T2610) y la escribe cada uno desde
// Mi cuenta › Notificaciones. SIN FILA = SE AVISA: apagar es lo que se guarda.
//
// El catálogo se espeja en `src/features/mi-cuenta/services/notificaciones.ts` (la pantalla) y un
// test de cada lado exige que las claves coincidan: un tipo que la pantalla ofrece y ningún emisor
// consulta sería un interruptor pintado.

/** @typedef {'efectivo_firma'|'efectivo_anulacion'|'efectivo_firmada'|'sistema'} TipoAviso */
/** @typedef {'mattermost_dm'|'correo'} CanalAviso */

export const TIPOS = Object.freeze([
  { clave: 'efectivo_firma', titulo: 'Efectivo para firmar', detalle: 'Te entregaron efectivo a rendir: el enlace para confirmar y firmar.', para: 'persona' },
  { clave: 'efectivo_anulacion', titulo: 'Entrega anulada', detalle: 'Se anuló una entrega de efectivo a tu nombre, con el motivo.', para: 'persona' },
  { clave: 'efectivo_firmada', titulo: 'Efectivo firmado', detalle: 'Alguien firmó la plata que recibió: quién, cuánto y cuándo.', para: 'dueno' },
  { clave: 'sistema', titulo: 'Avisos del sistema', detalle: 'Despliegues, controles y lo que el OS necesita decirle al dueño.', para: 'dueno' },
])

export const CANALES = Object.freeze([
  { clave: 'mattermost_dm', titulo: 'Mensaje directo del bot', disponible: true },
  // El OS no manda correos de aviso: el canal existe en la tabla para el día que los mande, y la
  // pantalla NO dibuja un interruptor para él.
  { clave: 'correo', titulo: 'Correo', disponible: false },
])

export const esTipo = (t) => TIPOS.some((x) => x.clave === t)
export const esCanal = (c) => CANALES.some((x) => x.clave === c)

/**
 * NÚCLEO PURO. `preferencias` son las filas de ESE usuario ({ tipo, canal, activo }). Devuelve `true`
 * salvo que exista una fila para (tipo, canal) con `activo = false`. Un tipo o canal desconocido no
 * se apaga por accidente: se avisa (fallar cerrado acá sería callar).
 */
export function debeAvisar(preferencias, tipo, canal) {
  if (!Array.isArray(preferencias)) return true
  const fila = preferencias.find((p) => p.tipo === tipo && p.canal === canal)
  return fila ? fila.activo !== false : true
}

/** Las preferencias guardadas de un usuario (uid de auth). Sin migración aplicada devuelve []. */
export async function preferenciasDe(port, usuarioId) {
  if (!usuarioId) return []
  try {
    const { rows } = await port.query(
      'select tipo, canal, activo from public.usuario_preferencia_notificacion where usuario_id = $1', [usuarioId])
    return rows
  } catch (e) {
    if (e?.code === '42P01') return []
    throw e
  }
}

/** ¿Hay que avisarle a este usuario (uid de auth) este tipo por este canal? Sin uid: sí. */
export async function debeAvisarA(port, usuarioId, tipo, canal) {
  if (!usuarioId) return true
  return debeAvisar(await preferenciasDe(port, usuarioId), tipo, canal)
}

/**
 * EL UID DEL DUEÑO, para consultar sus preferencias: su usuario de Mattermost (`ORQ_DUENO_MM`) →
 * `comunicacion.identidades.email` → `auth.users`. `null` si no se puede resolver, y entonces se avisa.
 */
export async function usuarioDelDueno(port, username = process.env.ORQ_DUENO_MM ?? 'jorge') {
  try {
    const { rows } = await port.query(
      `select u.id from comunicacion.identidades i
         join auth.users u on lower(u.email) = lower(i.email)
        where i.plataforma = 'mattermost' and lower(i.plataforma_username) = lower($1) and i.activo
        limit 1`, [username])
    return rows[0]?.id ?? null
  } catch {
    return null
  }
}
