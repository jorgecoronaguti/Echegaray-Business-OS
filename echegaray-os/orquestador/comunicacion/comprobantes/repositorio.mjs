// EL ESTADO DEL FAJO EN POSTGRES — y la barrera que impide cargar dos veces el mismo comprobante.
//
// Es el ÚNICO archivo que conoce las dos tablas de `20260803120000_comprobantes_por_chat.sql`. Todo
// lo demás (el flujo, el especialista, el manejador de botones) le pide cosas a esto y no escribe
// una línea de SQL: así el flujo se prueba entero con un doble en memoria, sin Postgres.
//
// ANDA ANTES Y DESPUÉS DE LA MIGRACIÓN, a propósito. `tablasListas` contesta si el esquema ya está
// aplicado; si no lo está, el especialista dice "todavía no está habilitada la carga por chat" en
// vez de reventar con un error de Postgres en la cara del dueño. El deploy y la migración no siempre
// caen juntos, y este repo ya perdió medio día por suponer que sí.

import { ESTADO } from '../../lib/comprobantes/fajo.mjs'

/** ¿Está aplicada la migración? Una sola consulta barata, sin tocar datos. */
export async function tablasListas(port) {
  if (typeof port?.query !== 'function') return false
  try {
    const { rows } = await port.query(
      `select count(*)::int as n from information_schema.tables
        where table_schema = 'comunicacion'
          and table_name in ('comprobante_fajos','comprobantes_cargados')`)
    return (rows?.[0]?.n ?? 0) === 2
  } catch { return false }
}

/** El fajo abierto de esta persona en este canal, o null. */
export async function fajoAbierto(port, { plataforma = 'mattermost', userId, channelId } = {}) {
  if (!userId || !channelId) return null
  const { rows } = await port.query(
    `select * from comunicacion.comprobante_fajos
      where plataforma = $1 and plataforma_user_id = $2 and channel_id = $3 and estado = $4
      limit 1`,
    [plataforma, userId, channelId, ESTADO.ABIERTO])
  return rows[0] ?? null
}

/** Un fajo por id, en cualquier estado. Lo usa el manejador de los botones. */
export async function fajoPorId(port, id) {
  if (!id) return null
  const { rows } = await port.query('select * from comunicacion.comprobante_fajos where id = $1', [id])
  return rows[0] ?? null
}

/**
 * Abre un fajo. Si otro proceso lo abrió primero (dos posts casi simultáneos), el índice único
 * parcial rechaza el insert y devolvemos el que ya existe: nunca dos confirmaciones para la misma
 * tanda.
 */
export async function abrirFajo(port, { plataforma = 'mattermost', userId, username, channelId, rootPostId, postId, items = [] } = {}) {
  try {
    const { rows } = await port.query(
      `insert into comunicacion.comprobante_fajos
         (plataforma, plataforma_user_id, plataforma_username, channel_id, root_post_id, post_ids, items)
       values ($1,$2,$3,$4,$5,$6,$7::jsonb) returning *`,
      [plataforma, userId, username ?? null, channelId, rootPostId ?? null, postId ? [postId] : [], JSON.stringify(items)])
    return rows[0]
  } catch (e) {
    if (String(e?.code) !== '23505') throw e
    return fajoAbierto(port, { plataforma, userId, channelId })
  }
}

/**
 * Suma comprobantes a un fajo abierto y corre su reloj.
 *
 * `where estado = 'abierto'` NO es decorativo: entre que se leyó el fajo y que se lo actualiza, el
 * dueño pudo haber apretado Confirmar. Sin esa condición, un adjunto que llega tarde se agregaría a
 * un fajo que ya se está escribiendo — o sea, cargaría algo que nadie confirmó.
 */
export async function agregarAlFajo(port, { id, items, postId } = {}) {
  const { rows } = await port.query(
    `update comunicacion.comprobante_fajos
        set items = $2::jsonb,
            post_ids = case when $3::text is null or $3 = any(post_ids) then post_ids else array_append(post_ids, $3) end,
            ultimo_at = now()
      where id = $1 and estado = $4
      returning *`,
    [id, JSON.stringify(items), postId ?? null, ESTADO.ABIERTO])
  return rows[0] ?? null
}

/** Reemplaza los ítems (una corrección) sin tocar el estado ni el reloj de agrupación. */
export async function guardarItems(port, { id, items } = {}) {
  const { rows } = await port.query(
    `update comunicacion.comprobante_fajos set items = $2::jsonb, ultimo_at = now()
      where id = $1 and estado = $3 returning *`,
    [id, JSON.stringify(items), ESTADO.ABIERTO])
  return rows[0] ?? null
}

/** Guarda el id del post del bot que se reescribe en cada cambio (un mensaje, no una cascada). */
export async function guardarAvisoPost(port, { id, avisoPostId } = {}) {
  const { rows } = await port.query(
    'update comunicacion.comprobante_fajos set aviso_post_id = $2 where id = $1 returning *', [id, avisoPostId ?? null])
  return rows[0] ?? null
}

/**
 * Toma el fajo para confirmarlo: `abierto` → `confirmado`, en UNA sentencia.
 *
 * Es un compare-and-set y por eso devuelve null si alguien ya lo tomó. Dos clicks seguidos en
 * Confirmar —o el mismo click reenviado por un reintento de Mattermost— tienen que cargar UNA vez;
 * leer-y-después-escribir dejaría la ventana abierta justo para eso.
 */
export async function tomarParaConfirmar(port, { id } = {}) {
  const { rows } = await port.query(
    `update comunicacion.comprobante_fajos set estado = $2, ultimo_at = now()
      where id = $1 and estado = $3 returning *`,
    [id, ESTADO.CONFIRMADO, ESTADO.ABIERTO])
  return rows[0] ?? null
}

/** Estado final del fajo (cargado / encolado / descartado / error). */
export async function cerrarFajo(port, { id, estado, filas = null, error = null } = {}) {
  const { rows } = await port.query(
    `update comunicacion.comprobante_fajos
        set estado = $2, filas = $3::jsonb, error = $4, ultimo_at = now(), cerrado_at = now()
      where id = $1 returning *`,
    [id, estado, filas ? JSON.stringify(filas) : null, error])
  return rows[0] ?? null
}

/** Vuelve un fajo confirmado a abierto: la escritura falló antes de escribir nada. */
export async function reabrirFajo(port, { id, error = null } = {}) {
  const { rows } = await port.query(
    `update comunicacion.comprobante_fajos set estado = $2, error = $3, ultimo_at = now()
      where id = $1 and estado = $4 returning *`,
    [id, ESTADO.ABIERTO, error, ESTADO.CONFIRMADO])
  return rows[0] ?? null
}

/**
 * ¿Alguno de estos comprobantes ya está cargado? Devuelve `Map<clave, {fila, post_id, creado_at}>`.
 *
 * Se consulta ANTES de mostrar la confirmación, no sólo antes de escribir: el dueño tiene que ver
 * "ya está cargado en la fila 412" mientras todavía puede corregir, no descubrirlo después.
 */
export async function yaCargados(port, claves = []) {
  const lista = [...new Set(claves.filter(Boolean))]
  if (!lista.length) return new Map()
  const { rows } = await port.query(
    'select clave, fila, hoja, post_id, creado_at from comunicacion.comprobantes_cargados where clave = any($1)',
    [lista])
  return new Map(rows.map((r) => [r.clave, r]))
}

/**
 * Registra las filas escritas. `on conflict do nothing` sobre `clave`: si dos caminos intentaron
 * cargar el mismo comprobante, el segundo no explota — simplemente no agrega nada, y el llamador ve
 * que su clave no volvió.
 *
 * @returns {Promise<string[]>} las claves que EFECTIVAMENTE se registraron acá
 */
export async function registrarCargados(port, filas = []) {
  const out = []
  for (const f of filas) {
    if (!f?.clave) continue
    const { rows } = await port.query(
      `insert into comunicacion.comprobantes_cargados
         (clave, cuit, tipo, numero, proveedor, fecha, total, plataforma, channel_id, post_id,
          plataforma_user_id, fajo_id, hoja, fila)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       on conflict (clave) do nothing
       returning clave`,
      [f.clave, f.cuit ?? null, f.tipo ?? null, f.numero ?? null, f.proveedor ?? null,
        f.fechaIso ?? null, f.total ?? null, f.plataforma ?? 'mattermost', f.channelId ?? null,
        f.postId ?? null, f.userId ?? null, f.fajoId ?? null, f.hoja ?? 'Compras', f.fila ?? null])
    if (rows.length) out.push(rows[0].clave)
  }
  return out
}

/**
 * RESERVA las claves ANTES de escribir en el Sheet, con `fila` en null.
 *
 * POR QUÉ RESERVAR Y NO REGISTRAR DESPUÉS. Entre que se escribe en el Sheet y que se anota en la
 * base hay una ventana: si el proceso muere ahí, el gasto ya está en Compras y la base no lo sabe —
 * y el próximo envío del mismo comprobante lo carga otra vez. Reservando primero, esa ventana
 * cambia de signo: en el peor caso queda una reserva sin fila, que se puede ver y limpiar, en vez de
 * un gasto duplicado en el Flujo de Fondos. Se prefiere el error que se nota.
 *
 * @returns {Promise<string[]>} las claves reservadas por ESTA llamada (las que ya estaban, no)
 */
export async function reservarClaves(port, filas = []) {
  return registrarCargados(port, filas.map((f) => ({ ...f, fila: null })))
}

/** Completa el número de fila de las claves ya reservadas. */
export async function anotarFilas(port, filas = []) {
  for (const f of filas) {
    if (!f?.clave || f.fila == null) continue
    await port.query(
      'update comunicacion.comprobantes_cargados set fila = $2, hoja = $3 where clave = $1 and fila is null',
      [f.clave, f.fila, f.hoja ?? 'Compras'])
  }
}

/**
 * Filas CANDIDATAS de `public.comprobantes_arca` para conciliar UN comprobante leído.
 *
 * Trae poco a propósito: el CAE exacto, el CUIT del emisor, y todo lo emitido ese día. Con eso
 * `arca.mjs` resuelve las cuatro pasadas sin traerse el padrón entero a memoria por cada foto — y
 * la pasada "fecha + total" necesita ver a TODOS los emisores de ese día para poder afirmar que la
 * coincidencia es única.
 *
 * `tipo_libro = 'R'` es el libro de RECIBIDOS (compras). El de emitidos son las ventas de la
 * empresa y no tiene nada que ver con un comprobante de gasto.
 *
 * Nunca lanza: si la tabla no existe o la base no contesta, devuelve `[]` y la conciliación queda
 * "no verificada". No poder verificar no es lo mismo que no estar.
 */
export async function candidatasArca(port, { cae = null, cuit = null, fechaIso = null } = {}) {
  if (typeof port?.query !== 'function') return []
  if (!cae && !cuit && !fechaIso) return []
  try {
    const { rows } = await port.query(
      `select emisor_cuit, emisor_nombre, punto_venta, numero, cae, fecha_emision, tipo_comprobante,
              imp_total::float8 imp_total, total_iva::float8 total_iva, neto_gravado::float8 neto_gravado
         from public.comprobantes_arca
        where tipo_libro = 'R'
          and ( ($1::text is not null and cae = $1)
             or ($2::text is not null and emisor_cuit = $2)
             or ($3::date is not null and fecha_emision = $3) )
        limit 500`,
      [cae, cuit, fechaIso])
    return rows ?? []
  } catch { return [] }
}

/** Suelta las claves reservadas cuando la escritura NO llegó a ocurrir. Sólo las que siguen sin fila. */
export async function soltarReservas(port, claves = []) {
  const lista = [...new Set(claves.filter(Boolean))]
  if (!lista.length) return 0
  const { rowCount } = await port.query(
    'delete from comunicacion.comprobantes_cargados where clave = any($1) and fila is null', [lista])
  return rowCount ?? 0
}
