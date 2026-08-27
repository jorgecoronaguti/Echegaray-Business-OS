// QUÉ PUEDE HACER, POR LA PUERTA DE XSAS, QUIEN PIDE.
//
// ═══ LA REGLA ═══
//
// El gateway NO otorga permisos: los compara. Este archivo es el único que los deriva, y lo hace
// desde la fuente real —el rol de `public.perfiles`, contra el que ya están escritas las policies—
// nunca desde lo que diga un cliente.
//
// ═══ POR QUÉ EN P0 NADIE ESCRIBE POR ACÁ ═══
//
// Las tools del núcleo declaran `drive.read`, que es LECTURA. Ninguna capability de escritura entra
// en esta tabla, a propósito: la puerta se abre primero para leer, y una capacidad que escribe se
// habilita cuando exista quien firme el efecto de esa escritura. Agregar una acá es una decisión
// del dueño, no un descuido de configuración.
//
// ═══ POR QUÉ `campo` NO LEE ═══
//
// Las tools de lectura del núcleo son económicas y de empresa entera (costo por obra, estado
// general, cuadro económico). Un empleado de campo ve lo suyo por su pantalla, con la RLS de la
// base; darle esas tools sería abrirle por el chat lo que la web le cierra. Falla cerrado: un rol
// que no está en la tabla se queda sin permisos, no con los del vecino.

/** Lo que cada rol de `perfiles.rol` puede pedirle a XSAS. Fail-closed: lo que no está, no puede. */
export const PERMISOS_POR_ROL = Object.freeze({
  direccion: Object.freeze(['drive.read', 'os.read']),
  administracion: Object.freeze(['drive.read', 'os.read']),
  jefe_obra: Object.freeze(['drive.read', 'os.read']),
  campo: Object.freeze([]),
})

/** Los permisos de un rol. PURA. Un rol desconocido no hereda nada. */
export function permisosDeRol(rol) {
  return [...(PERMISOS_POR_ROL[String(rol ?? '').trim()] ?? [])]
}

/**
 * EL ACTOR DETRÁS DE UN USUARIO DE MATTERMOST.
 *
 * Cruza `comunicacion.identidades` (quién es ese `user_id` de la plataforma) con `auth.users` +
 * `public.perfiles` (qué rol tiene esa persona en el OS) POR EMAIL, que es el único dato que las
 * dos puntas comparten hoy. Sin identidad registrada o sin perfil, devuelve un actor SIN permisos:
 * el gateway va a contestar lo que no necesita permiso y va a decir que no puede lo demás.
 *
 * @param {{query:Function}} port
 * @param {{userId:string, username?:string, display?:string}} usuario
 */
export async function actorDeMattermost(port, usuario) {
  const base = { id: `mm:${usuario?.userId ?? 'desconocido'}`, nombre: usuario?.display ?? usuario?.username ?? null, rol: 'desconocido', permisos: [] }
  if (!port?.query || !usuario?.userId) return base
  try {
    const { rows } = await port.query(
      `select p.rol, p.nombre
         from comunicacion.identidades i
         join auth.users u on lower(u.email) = lower(i.email)
         join public.perfiles p on p.id = u.id
        where i.plataforma = 'mattermost' and i.plataforma_user_id = $1 and i.activo
        limit 1`,
      [String(usuario.userId)],
    )
    if (!rows.length) return base
    return { ...base, nombre: rows[0].nombre ?? base.nombre, rol: rows[0].rol, permisos: permisosDeRol(rows[0].rol) }
  } catch {
    // Que no se pueda leer el rol NO puede convertirse en permisos de más. Se responde sin ellos.
    return base
  }
}
