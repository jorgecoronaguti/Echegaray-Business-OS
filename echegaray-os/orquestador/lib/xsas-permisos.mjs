// QUÉ PUEDE HACER, POR LA PUERTA DE XSAS, QUIEN PIDE.
//
// ═══ LA REGLA ═══
//
// El gateway NO otorga permisos: los compara. Este archivo es el único que los deriva, y lo hace
// desde la fuente real —el rol de `public.perfiles`, contra el que ya están escritas las policies—
// nunca desde lo que diga un cliente.
//
// ═══ LA ESCRITURA EN DRIVE — AUTORIZADA EL 27/08/2026, Y ACOTADA ═══
//
// El dueño autorizó `drive.write` con una condición textual: *"NO significa acceso de escritura
// irrestricto para cualquier request… Una consulta común de chat NO obtiene drive.write por existir
// el permiso."*
//
// Por eso hay DOS cerraduras y hay que pasar las dos:
//
//   1. EL ROL  — sólo `direccion` la tiene. Es el único rol que hoy firma un efecto externo.
//   2. LA TOOL — una capability de escritura sólo vale para una tool que esté NOMBRADA abajo. Una
//      tool nueva que declare `drive.write` no escribe por declararlo: hay que agregarla acá, y
//      agregarla es una decisión que queda en el diff.
//
// La segunda cerradura es la que importa. Sin ella, «autorizar drive.write» significaría que
// cualquier tool futura hereda la escritura por poner una línea en su registro — que es exactamente
// el modo de falla que el dueño describió.
//
// ═══ POR QUÉ `campo` NO LEE ═══
//
// Las tools de lectura del núcleo son económicas y de empresa entera (costo por obra, estado
// general, cuadro económico). Un empleado de campo ve lo suyo por su pantalla, con la RLS de la
// base; darle esas tools sería abrirle por el chat lo que la web le cierra. Falla cerrado: un rol
// que no está en la tabla se queda sin permisos, no con los del vecino.

/** Lo que cada rol de `perfiles.rol` puede pedirle a XSAS. Fail-closed: lo que no está, no puede. */
export const PERMISOS_POR_ROL = Object.freeze({
  direccion: Object.freeze(['drive.read', 'os.read', 'drive.write', 'os.write', 'comercial.read']),
  administracion: Object.freeze(['drive.read', 'os.read', 'comercial.read']),
  jefe_obra: Object.freeze(['drive.read', 'os.read']),
  campo: Object.freeze([]),
})

// ═══ `comercial.read` — PUEDE CALCULAR NO ES PUEDE VER (27/08/2026) ═══
//
// Los permisos de arriba dicen qué capacidad se puede EJECUTAR. `comercial.read` dice otra cosa:
// qué parte del resultado se puede VER. Nació de un caso medido — un `jefe_obra` corrió
// `plano.cotizar`, que para su rol es razonable (leer los planos de su obra), y la respuesta le
// trajo el costo directo, la venta sin IVA y la cascada comercial entera. Nadie le dio permiso de
// ver el precio: se lo dio la tool, porque calcular y mostrar eran el mismo acto.
//
// El tachado lo aplica `xsas-visibilidad.mjs` en el gateway, sobre el resultado y sobre el texto,
// antes de que salga por cualquiera de las tres caras. Ocultarlo en la pantalla no sirve: el JSON
// viaja igual y Mattermost y los scripts no pasan por esa pantalla.
//
// `jefe_obra` conserva lo que es suyo —cantidades, HH, materiales, equipos, tareas, duraciones— y
// se le tacha la plata DICIÉNDOLO. Un recorte silencioso miente por omisión.

/**
 * QUÉ CAPABILITIES ESCRIBEN — por su forma, no por una lista.
 *
 * ═══ POR QUÉ DEJÓ DE SER UNA LISTA (27/08/2026, auditoría) ═══
 *
 * Era `['drive.write']`, y la auditoría encontró el agujero en diez minutos: `cotizacion.registrar`
 * declaraba `drive.read` y su `run` hace un `INSERT` en `public.cotizaciones`. Como la capability no
 * estaba en la lista, `escribeAfuera` decía que no escribía, las dos cerraduras no se enteraban y la
 * firma tampoco. Probado contra el gateway vivo: un `jefe_obra` —el rol descripto como sólo lectura—
 * llegó a ejecutar el cuerpo de la tool con HTTP 200.
 *
 * Una lista blanca de capabilities de escritura tiene el mismo defecto que cualquier defensa por
 * enumeración: alcanza hasta que aparece la que nadie enumeró. El sufijo es una REGLA, y cubre a las
 * que todavía no existen. Lo que NO cubre —y por eso además hay un test que enumera el registro
 * real— es una tool que escribe declarando una capability de lectura: eso no lo puede ver ninguna
 * regla sobre el nombre.
 */
export const SUFIJO_DE_ESCRITURA = /\.(write|delete|send|modify|trash|draft)$/
export const CAPACIDADES_DE_ESCRITURA = Object.freeze(['drive.write', 'os.write'])

/**
 * LAS ÚNICAS TOOLS QUE PUEDEN ESCRIBIR, POR NOMBRE.
 *
 * No es una lista de conveniencia: es la diferencia entre «XSAS tiene permiso de escritura» y «esta
 * capacidad concreta, que alguien revisó, puede escribir». Agregar una tool acá es una decisión del
 * dueño y queda en el historial del repositorio.
 */
export const TOOLS_AUTORIZADAS_A_ESCRIBIR = Object.freeze([
  'slides.crear',          // crear_presentacion_google_slides — deja el archivo en el Drive de la empresa
  'imagen.generar',        // generar_imagen — deja el PNG generado en el Drive, sellado como GENERADA
  'cotizacion.registrar',  // registrar_cotizacion — INSERT en public.cotizaciones (la biblioteca comercial)
  // analizar_planos_y_cotizar — INSERT en public.cotizaciones + cotizacion_partida + computo.
  // Declaraba `drive.read` y su propio comentario decía «escribe en Postgres una cotización en
  // BORRADOR»: la capability describía de dónde LEE, no qué DEJA. Un borrador que queda en la
  // biblioteca comercial es una escritura, aunque nadie lo haya adjudicado todavía.
  'plano.cotizar',
])

/** ¿Esta capability escribe afuera? PURA. */
export function escribeAfuera(capability) {
  return SUFIJO_DE_ESCRITURA.test(String(capability ?? ''))
}

/** ¿Esta tool está autorizada a usar una capability de escritura? PURA y fail-closed. */
export function autorizadaAEscribir(clave) {
  return TOOLS_AUTORIZADAS_A_ESCRIBIR.includes(String(clave ?? ''))
}

/** Los permisos de un rol. PURA. Un rol desconocido no hereda nada. */
export function permisosDeRol(rol) {
  return [...(PERMISOS_POR_ROL[String(rol ?? '').trim()] ?? [])]
}

/**
 * EL ROL QUE DICE LA BASE, NO EL QUE DICE EL CUERPO DEL PEDIDO.
 *
 * ═══ POR QUÉ HIZO FALTA (27/08/2026, auditoría) ═══
 *
 * La puerta HTTP pisaba `permisos` con los del rol y dejaba el ROL tal como venía en el cuerpo, bajo
 * un comentario que afirmaba «los permisos los deriva el OS». Los deriva, sí — del dato que manda
 * quien pide. Con el secreto de la puerta en la mano, declarar `rol: "direccion"` alcanzaba.
 *
 * El secreto sigue siendo la frontera de confianza y esto no la reemplaza: la achica. Cuando el
 * actor se puede identificar contra `public.perfiles` —una UUID de Supabase o un email—, manda lo
 * que dice la base. Cuando no —el worker, un timer, un actor de Mattermost ya resuelto por
 * `actorDeMattermost`—, se conserva lo declarado, porque ahí no hay a quién preguntarle y el
 * emisor ya pasó por el secreto.
 *
 * Devuelve `{rol, verificado, declarado}`: la diferencia entre lo declarado y lo real no se tapa.
 * PURA no es —lee la base—, pero falla cerrado: si la consulta rompe, no otorga nada nuevo.
 */
export async function rolVerificado(port, actor) {
  const declarado = String(actor?.rol ?? '').trim() || null
  const id = String(actor?.id ?? '').trim()
  const email = String(actor?.email ?? '').trim()
  const esUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  if (!port?.query || (!esUuid && !email)) return { rol: declarado, verificado: false, declarado }
  try {
    const { rows } = esUuid
      ? await port.query('select rol from public.perfiles where id = $1 limit 1', [id])
      : await port.query(
        `select p.rol from public.perfiles p
           join auth.users u on u.id = p.id
          where lower(u.email) = lower($1) limit 1`, [email])
    // Un actor que dice ser alguien y no existe NO hereda lo que declaró: se queda sin rol.
    if (!rows.length) return { rol: null, verificado: true, declarado }
    return { rol: rows[0].rol, verificado: true, declarado }
  } catch {
    return { rol: declarado, verificado: false, declarado }
  }
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
