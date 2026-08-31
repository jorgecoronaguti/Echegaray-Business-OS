// LA TANDA — un solo post del bot para toda la carga, aunque el dueño mande tres posts de fotos.
//
// ═══ EL CASO DIFÍCIL, Y CÓMO SE RESUELVE ═══
//
// Si manda tres posts seguidos, ¿son una tanda o tres? La respuesta que se eligió tiene dos partes,
// y la primera es la que de verdad decide:
//
//   1. **Si todavía hay un post de esa persona en proceso, es la MISMA tanda.** No importa cuánto
//      haya pasado: el OS no puede haber "terminado" mientras sigue leyendo. Y como cada post tarda
//      ~2m30s, éste es el caso normal de una carga fuerte — el dueño manda los tres seguidos y para
//      cuando termina el primero ya llegaron los otros dos.
//   2. Si no hay nada en curso, sigue siendo la misma tanda mientras la última actividad esté dentro
//      de una ventana corta (`ORQ_COMPROBANTES_TANDA_MIN`, 10 minutos por defecto). Pasada la
//      ventana, es otra carga y merece su propio mensaje.
//
// Por qué NO se usó la ventana del fajo (5 min): son dos cosas distintas y confundirlas ya costó
// caro. El fajo agrupa lo que se ESCRIBE de una vez y se CONSUME al cargar. La tanda agrupa la
// CONVERSACIÓN y tiene que sobrevivir al fajo. Con el fajo cerrándose en cada post, atarle el
// mensaje sería volver a un mensaje por post.
//
// Por qué NO se esperó a que la tanda "termine" para recién hablar: este repo ya decidió que un bot
// que calla se lee como un bot colgado. El post se publica al toque con «⏳ recibí 8, leyendo…» y se
// REESCRIBE hasta «✔ listo: 8 cargados, 2 ya estaban». Un mensaje, y señal de vida.
//
// ═══ ANDA ANTES Y DESPUÉS DE LA MIGRACIÓN ═══
//
// Sin las tablas, `conLaTanda` no hace absolutamente nada y el especialista responde como siempre
// (un mensaje por post). Es peor experiencia, no es una falla.

import { acumular, parteVacia, textoTanda } from '../../lib/comprobantes/parte.mjs'

/** Cuánto dura una tanda sin actividad, en minutos. Ver el encabezado: sólo aplica si no hay nada en curso. */
export const VENTANA_TANDA_MIN = Number(process.env.ORQ_COMPROBANTES_TANDA_MIN || 10)

// ── EL ESTADO EN POSTGRES ────────────────────────────────────────────────────

/** ¿Está aplicada la migración de tandas? Una consulta barata, sin tocar datos. */
export async function tablasListas(port) {
  if (typeof port?.query !== 'function') return false
  try {
    const { rows } = await port.query(
      `select count(*)::int as n from information_schema.tables
        where table_schema = 'comunicacion'
          and table_name in ('comprobante_tandas','comprobante_partes')`)
    return (rows?.[0]?.n ?? 0) === 2
  } catch { return false }
}

/**
 * La tanda abierta de esta persona en este canal, si sigue viva.
 *
 * "Viva" = tiene algo en curso O su última actividad está dentro de la ventana. La condición está en
 * SQL y no en JS a propósito: el reloj que decide es el de la base, el mismo con el que se escribió
 * `ultimo_at`. Comparar contra el reloj del worker mete una diferencia que nadie controla.
 */
export async function tandaViva(port, { plataforma = 'mattermost', userId, channelId, ventanaMin = VENTANA_TANDA_MIN } = {}) {
  if (!userId || !channelId) return null
  const { rows } = await port.query(
    `select t.* from comunicacion.comprobante_tandas t
      where t.plataforma = $1 and t.plataforma_user_id = $2 and t.channel_id = $3
        and t.estado = 'abierta'
        and (t.ultimo_at >= now() - ($4 || ' minutes')::interval
             or exists (select 1 from comunicacion.comprobante_partes p
                         where p.tanda_id = t.id and p.estado = 'en_curso'))
      limit 1`,
    [plataforma, userId, channelId, String(Math.max(1, Number(ventanaMin) || VENTANA_TANDA_MIN))])
  return rows[0] ?? null
}

/** Cierra la tanda abierta que quedó vieja, para que el índice único parcial deje abrir una nueva. */
export async function cerrarVencidas(port, { plataforma = 'mattermost', userId, channelId } = {}) {
  await port.query(
    `update comunicacion.comprobante_tandas
        set estado = 'cerrada', cerrado_at = now()
      where plataforma = $1 and plataforma_user_id = $2 and channel_id = $3 and estado = 'abierta'`,
    [plataforma, userId, channelId])
}

/** Abre una tanda. Si otro proceso la abrió primero, devuelve la suya: nunca dos mensajes. */
export async function abrirTanda(port, { plataforma = 'mattermost', userId, channelId, rootPostId } = {}) {
  try {
    const { rows } = await port.query(
      `insert into comunicacion.comprobante_tandas (plataforma, plataforma_user_id, channel_id, root_post_id)
       values ($1,$2,$3,$4) returning *`,
      [plataforma, userId, channelId, rootPostId ?? null])
    return rows[0]
  } catch (e) {
    if (String(e?.code) !== '23505') throw e
    return tandaViva(port, { plataforma, userId, channelId, ventanaMin: 60 * 24 })
  }
}

/**
 * Abre la parte de ESTE post. Devuelve `{ nueva:false }` si ya estaba procesada.
 *
 * LA IDEMPOTENCIA DEL CONTEO. El worker puede reejecutar una tarea (con el lease de 30 s pasaba tres
 * veces) y un mensaje que dice 24 cuando entraron 8 destruye la confianza igual que una fila
 * duplicada. El unique (tanda_id, post_id) es la barrera; el `do nothing` es cómo se entera el
 * llamador de que este post ya se hizo.
 */
export async function abrirParte(port, { tandaId, postId, recibidos = 0 } = {}) {
  const { rows } = await port.query(
    `insert into comunicacion.comprobante_partes (tanda_id, post_id, estado, parte)
     values ($1,$2,'en_curso',$3::jsonb)
     on conflict (tanda_id, post_id) do nothing
     returning *`,
    [tandaId, String(postId), JSON.stringify({ ...parteVacia(), recibidos })])
  if (rows[0]) return { nueva: true, parte: rows[0] }
  const { rows: ya } = await port.query(
    'select * from comunicacion.comprobante_partes where tanda_id = $1 and post_id = $2', [tandaId, String(postId)])
  return { nueva: false, parte: ya[0] ?? null }
}

/** Cierra la parte con lo que ese post produjo, y corre el reloj de la tanda. */
export async function cerrarParte(port, { tandaId, postId, parte } = {}) {
  await port.query(
    `update comunicacion.comprobante_partes
        set estado = 'listo', parte = $3::jsonb, cerrado_at = now()
      where tanda_id = $1 and post_id = $2`,
    [tandaId, String(postId), JSON.stringify(parte ?? parteVacia())])
  await port.query('update comunicacion.comprobante_tandas set ultimo_at = now() where id = $1', [tandaId])
}

/** El acumulado de la tanda y cuántos posts siguen en curso. Se SUMA de las partes; no hay contador. */
export async function estadoDeLaTanda(port, tandaId) {
  const { rows } = await port.query(
    'select estado, parte from comunicacion.comprobante_partes where tanda_id = $1 order by id', [tandaId])
  return {
    parte: acumular(rows.map((r) => r.parte ?? {})),
    enVuelo: rows.filter((r) => r.estado === 'en_curso').length,
  }
}

/**
 * Cambia el post vivo de la tanda. A diferencia de `guardarAviso`, PISA el anterior a propósito:
 * lo llama `bajarElAviso` cuando el resumen tuvo que mudarse abajo del último post de la persona.
 */
export async function moverAviso(port, { id, avisoPostId } = {}) {
  const { rows } = await port.query(
    'update comunicacion.comprobante_tandas set aviso_post_id = $2 where id = $1 returning aviso_post_id',
    [id, avisoPostId])
  return rows[0]?.aviso_post_id ?? null
}

/** Guarda el post del bot. Sólo si todavía no había uno: dos posts para la misma tanda es el defecto. */
export async function guardarAviso(port, { id, avisoPostId } = {}) {
  const { rows } = await port.query(
    `update comunicacion.comprobante_tandas set aviso_post_id = $2
      where id = $1 and aviso_post_id is null returning aviso_post_id`, [id, avisoPostId])
  if (rows[0]) return rows[0].aviso_post_id
  const { rows: ya } = await port.query('select aviso_post_id from comunicacion.comprobante_tandas where id = $1', [id])
  return ya[0]?.aviso_post_id ?? null
}

// ── LA ORQUESTACIÓN ──────────────────────────────────────────────────────────

/**
 * Corre `trabajo()` adentro de una tanda: publica o reescribe UN post y no deja hablar a nadie más.
 *
 * @param {object} d
 * @param {{query:Function}} d.port
 * @param {object} d.mattermost   cliente con `crearPost` y `actualizarPost`
 * @param {object} [d.repo]       este mismo módulo, inyectable para probar sin Postgres
 * @param {object} [d.log]
 * @param {{plataforma?:string, userId:string, channelId:string, postId:string, rootPostId?:string, recibidos:number}} m
 * @param {Function} trabajo      () => {texto, estado, fajoId, parte}
 * @returns {Promise<object>} la salida para el handler (con `silencioso` si publicó por su cuenta)
 */
export async function conLaTanda(d, m = {}, trabajo) {
  const { port, mattermost, log } = d
  const repo = d.repo ?? moduloPropio()
  if (!m.postId || !await repo.tablasListas(port)) return await trabajo()

  const ident = { plataforma: m.plataforma ?? 'mattermost', userId: m.userId, channelId: m.channelId }
  let tanda
  try {
    tanda = await repo.tandaViva(port, ident)
    if (!tanda) {
      // La que quedó vieja se cierra ANTES de abrir: el índice único parcial no deja dos abiertas, y
      // reusar una tanda vencida haría que la carga de mañana editara el mensaje de ayer.
      await repo.cerrarVencidas(port, ident)
      tanda = await repo.abrirTanda(port, { ...ident, rootPostId: m.rootPostId ?? m.postId })
    }
  } catch (e) {
    log?.warn?.('comprobantes: no pude abrir la tanda, sigo con un mensaje por post', { detalle: String(e?.message ?? e).slice(0, 200) })
    return await trabajo()
  }
  if (!tanda?.id) return await trabajo()

  const abierta = await repo.abrirParte(port, { tandaId: tanda.id, postId: m.postId, recibidos: m.recibidos ?? 0 })
  if (!abierta.nueva) {
    // ESTE POST YA SE PROCESÓ (reejecución de la tarea). No se vuelve a leer ni a escribir nada: se
    // refresca el mensaje con lo que hay y se calla. Contar dos veces sería mentir el total.
    const est = await repo.estadoDeLaTanda(port, tanda.id)
    const texto = textoTanda(est.parte, { enVuelo: est.enVuelo })
    const { ok } = await refrescar({ mattermost, log }, tanda, texto)
    // Igual que abajo: sólo se declara `silencioso` si el mensaje de verdad quedó en el canal.
    return { texto, estado: 'repetido', privado: false, ...(ok ? { silencioso: true } : {}) }
  }

  // ⏳ ANTES DE TRABAJAR. El especialista tarda minutos: sin esto el canal queda mudo y el dueño
  // vuelve a mandar las fotos.
  //
  // ═══ Y SI YA HABÍA UN MENSAJE, TIENE QUE BAJAR (31/08) ═══
  //
  // Llegar acá con `abierta.nueva` significa que la persona mandó OTRO post después de que el bot
  // publicó el suyo. Reescribir el de antes deja la respuesta ARRIBA de las fotos nuevas, y
  // Mattermost no notifica ni reordena un post editado: desde la pantalla del dueño, mandó fotos y
  // no pasó nada. Es exactamente lo que el 25/08 obligó a sacar la PREGUNTA como post propio; el
  // resumen se dejó reescribiéndose y volvió a pasar hoy — 15:07, 15:13 y 15:19 contestados los
  // tres sobre el post de las 15:08, con 11 comprobantes ya cargados en Compras que él no vio.
  //
  // Sigue habiendo UN mensaje vivo por tanda: el de antes se reemplaza por una línea que apunta
  // abajo. No es una cascada de resúmenes, es el mismo resumen que se muda al pie.
  const enCurso = await repo.estadoDeLaTanda(port, tanda.id)
  const enCursoTexto = textoTanda(enCurso.parte, { enVuelo: Math.max(1, enCurso.enVuelo) })
  if (tanda.aviso_post_id) {
    const bajado = await bajarElAviso({ mattermost, log, port, repo }, tanda, enCursoTexto)
    // Si no se pudo publicar abajo, se reescribe el de arriba: peor lugar, pero nunca silencio.
    if (bajado) tanda = { ...tanda, aviso_post_id: bajado }
    else await refrescar({ mattermost, log }, tanda, enCursoTexto)
  } else {
    const publicado = await refrescar({ mattermost, log }, tanda, enCursoTexto, { port, repo })
    if (publicado.creado) tanda = { ...tanda, aviso_post_id: publicado.creado }
  }

  let r
  try {
    r = await trabajo()
  } catch (e) {
    // LA PARTE SE CIERRA PASE LO QUE PASE. Una parte que queda `en_curso` para siempre deja la tanda
    // sin poder decir nunca que terminó — y «terminó» es lo único que el dueño pidió.
    await repo.cerrarParte(port, {
      tandaId: tanda.id, postId: m.postId,
      parte: { ...parteVacia(), recibidos: m.recibidos ?? 0, avisos: [`falló el procesamiento: ${String(e?.message ?? e).slice(0, 160)}`] },
    }).catch(() => {})
    await refrescarMensaje({ port, repo, mattermost, log }, tanda).catch(() => {})
    throw e
  }

  await repo.cerrarParte(port, { tandaId: tanda.id, postId: m.postId, parte: r?.parte ?? parteVacia() })
  const { texto, ok: refrescado } = await refrescarMensaje({ port, repo, mattermost, log }, tanda)

  // ═══ UNA PREGUNTA NO ES UN RESUMEN, Y NO PUEDE IR REESCRITA (25/08) ═══
  //
  // El resumen se REESCRIBE sobre el post que la tanda publicó al principio, y eso está bien: es lo
  // que el dueño pidió («solo quiero q confirme q termino todo»). Pero Mattermost no notifica ni
  // reordena un post editado: quien mandó una foto hace un minuto no mira un mensaje de hace cinco.
  //
  // Medido el 25/08 en el canal `ataehrd…`: la tanda `e0f7529f` agrupó tres posts y reescribió
  // siempre el mismo aviso (`qpr8tig33…`, publicado 15:16:38). El journal registró tres veces «el
  // especialista publicó por su cuenta» —era verdad, publicó— y en el canal no apareció nada nuevo.
  // El fajo `de1c9a7a` quedó abierto esperando una respuesta a una pregunta que nadie llegó a leer.
  //
  // Así que la pregunta sale como POST PROPIO, en el hilo. Y si NO se pudo publicar, esto no se
  // declara `silencioso`: cae al outbox, que tiene reintento y dead-letter. Un fallo de publicación
  // no puede convertirse en silencio sin rastro, que es exactamente lo que pasó.
  const pregunta = r?.pregunta
  if (pregunta?.texto) {
    const publicada = await publicarPregunta({ mattermost, log }, tanda, pregunta)
    if (!publicada) {
      log?.warn?.('comprobantes: no pude publicar la pregunta del fajo, la mando por el outbox', { tanda: tanda.id, fajo: pregunta.fajoId })
      return { texto: pregunta.texto, estado: r?.estado, privado: false, datos: { tanda: tanda.id, fajo: pregunta.fajoId } }
    }
  }

  // Si no se pudo publicar ni reescribir nada, se degrada honestamente: sale por el outbox. Un
  // mensaje de más es mejor que ninguno.
  //
  // `refrescado` es la mitad que faltaba: `aviso_post_id` prueba que ALGUNA VEZ se publicó, no que
  // ESTA reescritura haya entrado. Si Mattermost rechazó la edición, el canal se queda con el
  // «⏳ leyendo…» y el handler informaba éxito — silencio sin rastro, otra vez.
  if (!tanda.aviso_post_id || !refrescado) return { texto: texto ?? r?.texto, estado: r?.estado, privado: false }
  return { texto, estado: r?.estado, privado: false, silencioso: true, datos: { tanda: tanda.id, post: tanda.aviso_post_id } }
}

/**
 * Publica la pregunta abierta como post NUEVO en el hilo. Nunca lanza.
 *
 * Lleva sus `attachments` si los trae (con los botones apagados vienen vacíos, y el texto ya dice
 * qué escribir para contestar: la salida no puede depender de un interruptor que en producción está
 * en cero).
 *
 * @returns {Promise<boolean>} si de verdad quedó publicada
 */
async function publicarPregunta({ mattermost, log }, tanda, pregunta) {
  if (typeof mattermost?.crearPost !== 'function' || !tanda?.channel_id) return false
  try {
    const post = await mattermost.crearPost({
      channel_id: tanda.channel_id,
      message: pregunta.texto,
      root_id: tanda.root_post_id ?? undefined,
      props: { attachments: pregunta.attachments ?? [] },
    })
    return Boolean(post?.id)
  } catch (e) {
    log?.warn?.('comprobantes: no pude publicar la pregunta', { detalle: String(e?.message ?? e).slice(0, 200) })
    return false
  }
}

/** Lo que queda escrito donde estaba el resumen antes de mudarse. Una línea, sin datos: los datos
 *  están completos en el mensaje nuevo y repetirlos acá sería publicar dos veces el mismo total. */
export const TEXTO_MUDADO = '⤴ _El resumen de esta carga sigue abajo, en el mensaje nuevo._'

/**
 * Publica el mensaje vivo de la tanda ABAJO de todo y deja arriba un puntero. Nunca lanza.
 *
 * El orden importa y no es intercambiable: primero se PUBLICA el nuevo, y recién con su id en la
 * mano se toca el viejo. Al revés, un fallo al publicar dejaría el único mensaje que existía
 * convertido en «seguí abajo» apuntando a nada.
 *
 * @returns {Promise<string|null>} el id del mensaje nuevo, o null si no se pudo publicar.
 */
async function bajarElAviso({ mattermost, log, port, repo }, tanda, texto) {
  if (typeof mattermost?.crearPost !== 'function' || !tanda?.channel_id) return null
  let post
  try {
    post = await mattermost.crearPost({
      channel_id: tanda.channel_id,
      message: texto,
      root_id: tanda.root_post_id ?? undefined,
      props: { attachments: [] },
    })
  } catch (e) {
    log?.warn?.('comprobantes: no pude bajar el mensaje de la tanda', { detalle: String(e?.message ?? e).slice(0, 200) })
    return null
  }
  if (!post?.id) return null
  // Que el viejo no se pueda reescribir deja DOS resúmenes en el canal: molesto, no grave. El
  // mensaje nuevo ya está publicado y es el que manda.
  try {
    if (typeof mattermost?.actualizarPost === 'function' && tanda.aviso_post_id) {
      await mattermost.actualizarPost({ id: tanda.aviso_post_id, message: TEXTO_MUDADO, props: { attachments: [] } })
    }
  } catch (e) {
    log?.warn?.('comprobantes: el mensaje viejo quedó como estaba', { detalle: String(e?.message ?? e).slice(0, 200) })
  }
  // Y si la base no acepta el cambio, se sigue con el id nuevo en memoria: lo que no puede pasar es
  // que este post se publique y después se reescriba el otro.
  try { await repo.moverAviso(port, { id: tanda.id, avisoPostId: post.id }) } catch (e) {
    log?.warn?.('comprobantes: no pude registrar el mensaje mudado', { detalle: String(e?.message ?? e).slice(0, 200) })
  }
  return post.id
}

/**
 * Reescribe el mensaje con el acumulado de TODA la tanda.
 *
 * ═══ LA TANDA NO SE CIERRA ACÁ, Y ESE ERA EL DEFECTO ═══
 *
 * La primera versión cerraba la tanda apenas `enVuelo` llegaba a 0. Como cada post termina antes de
 * que llegue el siguiente, eso la cerraba DESPUÉS DE CADA POST y el segundo abría una tanda nueva:
 * tres posts, tres mensajes — exactamente lo que se estaba arreglando, y con el mecanismo nuevo
 * puesto. El test «TRES POSTS SEGUIDOS PRODUCEN UN SOLO MENSAJE» lo agarró en rojo.
 *
 * «No queda nada en curso» significa «terminé lo que me mandaste hasta ahora», no «se acabó la
 * conversación». Lo que la termina es el TIEMPO, y esa decisión es de `tandaViva` + `cerrarVencidas`,
 * que corren cuando llega el post siguiente. Una tanda abierta que nadie vuelve a usar no molesta a
 * nadie: la próxima carga la cierra antes de abrir la suya.
 */
async function refrescarMensaje({ port, repo, mattermost, log }, tanda) {
  const est = await repo.estadoDeLaTanda(port, tanda.id)
  const texto = textoTanda(est.parte, { enVuelo: est.enVuelo })
  // `ok` es lo que permite no mentir cuando Mattermost rechaza la edición. Ver `conLaTanda`: sin
  // esto, una edición fallida se declaraba publicada y el canal se quedaba con el «⏳ leyendo…» de
  // hace cinco minutos, que es exactamente lo que el dueño lee como «se clavó».
  const { ok } = await refrescar({ mattermost, log }, tanda, texto)
  return { texto, ok }
}

/**
 * Publica el post del bot la primera vez y lo REESCRIBE todas las demás. Nunca lanza.
 *
 * NUNCA MANDA `attachments`: `props.attachments: []` va explícito para que un post que quedó de
 * antes con botones los pierda al reescribirse. Las tarjetas se fueron (ver `botonesFajo`).
 *
 * @returns {Promise<{ok:boolean, creado:string|null}>} `ok` = el mensaje quedó en el canal;
 *   `creado` = el id, sólo cuando lo acaba de publicar.
 */
async function refrescar({ mattermost, log }, tanda, texto, guardar = null) {
  const id = tanda?.aviso_post_id
  const nada = { ok: false, creado: null }
  try {
    if (id) {
      if (typeof mattermost?.actualizarPost !== 'function') return nada
      await mattermost.actualizarPost({ id, message: texto, props: { attachments: [] } })
      return { ok: true, creado: null }
    }
    if (typeof mattermost?.crearPost !== 'function' || !tanda?.channel_id) return nada
    const post = await mattermost.crearPost({
      channel_id: tanda.channel_id,
      message: texto,
      root_id: tanda.root_post_id ?? undefined,
      props: { attachments: [] },
    })
    if (!post?.id) return nada
    if (guardar?.port && guardar?.repo) {
      // Si otro proceso ganó la carrera, manda el suyo: el nuestro queda huérfano pero no se
      // multiplican los mensajes hacia adelante.
      const vigente = await guardar.repo.guardarAviso(guardar.port, { id: tanda.id, avisoPostId: post.id })
      return { ok: true, creado: vigente ?? post.id }
    }
    return { ok: true, creado: post.id }
  } catch (e) {
    log?.warn?.('comprobantes: no pude refrescar el mensaje de la tanda', { detalle: String(e?.message ?? e).slice(0, 200) })
    return nada
  }
}

/** Este mismo módulo como objeto, para que `conLaTanda` use el repositorio real por default. */
function moduloPropio() {
  return { tablasListas, tandaViva, cerrarVencidas, abrirTanda, abrirParte, cerrarParte, estadoDeLaTanda, guardarAviso, moverAviso }
}
