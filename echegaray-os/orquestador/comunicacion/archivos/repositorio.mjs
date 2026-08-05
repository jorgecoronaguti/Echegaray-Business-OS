// EL ESTADO DE UN ARCHIVO RECIBIDO EN POSTGRES. El único archivo del módulo que conoce la tabla.
//
// Todo lo demás (el flujo, el especialista, los botones) le pide cosas a esto y no escribe una línea
// de SQL: así el flujo se prueba entero con un doble en memoria, sin Postgres. Es la misma forma que
// ya usa `comprobantes/repositorio.mjs`, y es deliberado — dos módulos hermanos que se prueban
// distinto terminan probándose uno solo.

/** ¿Está aplicada la migración? Una consulta barata, sin tocar datos. Anda antes y después. */
export async function tablasListas(port) {
  if (typeof port?.query !== 'function') return false
  try {
    const { rows } = await port.query(
      `select count(*)::int as n from information_schema.tables
        where table_schema = 'comunicacion' and table_name = 'archivos_recibidos'`)
    return (rows?.[0]?.n ?? 0) === 1
  } catch { return false }
}

/**
 * Registra un archivo recibido y su propuesta.
 *
 * IDEMPOTENTE POR (evento, file_id): si el mismo mensaje se procesa dos veces —un lease vencido y
 * reclamado por otro worker— devuelve la fila que ya existía en vez de abrir una segunda propuesta
 * sobre el mismo extracto. Sin esto, el dueño podría ver dos botones de importar el mismo archivo.
 */
export async function registrar(port, {
  plataforma = 'mattermost', userId = null, username = null, channelId = null, rootPostId = null,
  postId = null, commEventId = null, fileId, nombre = null, familia = null, formato = null,
  mimeDeclarado = null, tamano = null, destino = null, propuesta = null, estado = 'recibido',
} = {}) {
  const { rows } = await port.query(
    `insert into comunicacion.archivos_recibidos
       (plataforma, plataforma_user_id, plataforma_username, channel_id, root_post_id, post_id,
        comm_event_id, file_id, nombre, familia, formato, mime_declarado, tamano, destino, propuesta, estado)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16)
     on conflict do nothing
     returning *`,
    [plataforma, userId, username, channelId, rootPostId, postId, commEventId, fileId, nombre,
      familia, formato, mimeDeclarado, tamano, destino, propuesta == null ? null : JSON.stringify(propuesta), estado],
  )
  if (rows[0]) return rows[0]
  // Chocó con el índice: la propuesta ya existe. Se devuelve ESA, nunca una nueva.
  const { rows: ya } = await port.query(
    `select * from comunicacion.archivos_recibidos
      where plataforma = $1 and comm_event_id is not distinct from $2 and file_id = $3
      order by creado_at desc limit 1`,
    [plataforma, commEventId, fileId])
  return ya[0] ?? null
}

/** Un archivo por id, en cualquier estado. Lo usa el manejador de los botones. */
export async function porId(port, id) {
  if (!id) return null
  const { rows } = await port.query('select * from comunicacion.archivos_recibidos where id = $1', [id])
  return rows[0] ?? null
}

/**
 * TOMAR PARA IMPORTAR — compare-and-set en una sola sentencia.
 *
 * Dos clicks seguidos, o el mismo click reenviado por un reintento de Mattermost, tienen que
 * importar UNA vez. Leer y después escribir dejaría abierta exactamente la ventana que hay que
 * cerrar: el segundo click no encuentra nada que tomar y contesta que ya se está importando.
 * @returns {Promise<object|null>} la fila tomada, o null si otro se la llevó
 */
export async function tomarParaImportar(port, id) {
  const { rows } = await port.query(
    `update comunicacion.archivos_recibidos
        set estado = 'importando', ultimo_at = now()
      where id = $1 and estado = 'propuesto'
      returning *`, [id])
  return rows[0] ?? null
}

/** Cierra el archivo con lo que quedó DE VERDAD en el destino (releído), o con el error. */
export async function cerrar(port, id, { estado, resultado = null, error = null } = {}) {
  const { rows } = await port.query(
    `update comunicacion.archivos_recibidos
        set estado = $2, resultado = $3::jsonb, error = $4, ultimo_at = now(), cerrado_at = now()
      where id = $1
      returning *`,
    [id, estado, resultado == null ? null : JSON.stringify(resultado), error])
  return rows[0] ?? null
}

/** Vuelve a dejarlo disponible: la importación falló y el dueño tiene que poder reintentar. */
export async function devolver(port, id, error = null) {
  const { rows } = await port.query(
    `update comunicacion.archivos_recibidos
        set estado = 'propuesto', error = $2, ultimo_at = now()
      where id = $1 and estado = 'importando'
      returning *`, [id, error])
  return rows[0] ?? null
}
