// EL PAPEL QUE ENTRÓ POR EL CHAT SE GUARDA EN EL MOMENTO EN QUE SU FILA QUEDA ESCRITA EN COMPRAS.
//
// Orden del dueño (08/09/2026): «si se carga un comprobante a través del chat tiene que producir la
// carga en pestaña Compras del Sheet Flujo de Fondos así como en sección Compras de app.ecsas.com.ar
// y ahí mismo su archivo en el formato en que fue enviado».
//
// Medido ese día: el bot escribía la fila y anotaba el registro, pero `public.compra_adjunto` —la
// tabla de la que la pantalla Compras cuelga el archivo— sólo la llenaba un script manual
// (`backfill-comprobantes-mattermost.mjs`), corrido por última vez el 05/09. Todo lo posterior quedó
// en la pestaña y sin papel en la app. Eso no es un bug de la pantalla: es un paso del circuito que
// no existía. Acá vive ese paso, y lo usan el bot (al cerrar la carga) y el backfill (el histórico).
//
// ═══ EN EL FORMATO EN QUE FUE ENVIADO ═══
//
// El bot convierte HEIC→JPEG para que el modelo lo pueda mirar. Eso es para la LECTURA. Lo que se
// guarda como respaldo es el archivo tal cual lo mandó la persona: `preparar` es la identidad.
//
// ═══ NUNCA TUMBA LA CARGA ═══
//
// La fila ya está en el Sheet y en el registro cuando esto corre. Un bucket caído o un archivo que
// pesa 6 MB se DECLARAN en el aviso al dueño; no reabren el fajo ni hacen fallar la confirmación.
// `origen_file_id` es único: correr dos veces sobre el mismo archivo no duplica nada.

import { subirAStorage } from '../storage-supabase.mjs'

export const BUCKET = 'comprobantes'
/** El techo del bucket (`20260825T1000`). Un archivo más grande no entra: se declara, no se trunca. */
// 25 MB desde el 09/09/2026: era 5 MB —el techo de la API de visión— y dejaba fuera del respaldo
// las fotos del iPhone (5,0–5,2 MB), que ahora se achican para la API pero se guardan enteras.
export const MAX_BYTES = 25 * 1024 * 1024
/** Los tipos que el bucket acepta. Lo que no está acá no es un comprobante mirable. */
export const MEDIA_OK = Object.freeze([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf', 'image/heic', 'image/heif',
])

/** La ruta en el bucket. El post agrupa: cinco fotos de un fajo quedan juntas y se ve por qué. */
export const rutaDe = (postId, fileId, nombre) => {
  const ext = String(nombre ?? '').split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin'
  return `historico/${postId ?? 'sin-post'}/${fileId}.${ext}`
}

/** ¿Entra al bucket? Puro. */
export function admisible(a = {}) {
  const tipo = String(a.media_type ?? a.mediaType ?? '').split(';')[0].trim().toLowerCase()
  if (!MEDIA_OK.includes(tipo)) return { ok: false, motivo: `tipo ${tipo || 'desconocido'}` }
  if (Number(a.bytes) > MAX_BYTES) return { ok: false, motivo: `pesa ${(a.bytes / 1048576).toFixed(1)} MB` }
  if (!Number(a.bytes)) return { ok: false, motivo: 'tamaño cero' }
  return { ok: true }
}

/** La extensión también es evidencia del tipo: el iPhone manda `.HEIC` con mime vacío. */
const POR_EXTENSION = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', pdf: 'application/pdf', heic: 'image/heic', heif: 'image/heif' }
export function tipoDe(mediaType, nombre) {
  const t = String(mediaType ?? '').split(';')[0].trim().toLowerCase()
  if (MEDIA_OK.includes(t)) return t
  return POR_EXTENSION[String(nombre ?? '').split('.').pop()?.toLowerCase()] ?? t
}

/**
 * Los archivos de un fajo CARGADO, cada uno con la fila y la clave que le tocó.
 *
 * `items` y `filas` van en el mismo orden (los dos salen de `itemsQueEntran`). Un ítem puede haber
 * entrado con varias fotos (`copias`: el dueño mandó la misma factura dos veces): todas cuelgan de la
 * misma fila. Puro, para poder probarlo sin Mattermost.
 *
 * @returns {Array<{file_id:string, nombre:string|null, post_id:string|null, clave:string|null, fila:number|null}>}
 */
export function archivosDelFajo({ fajo = {}, items = [], filas = [] } = {}) {
  const postId = (fajo.post_ids ?? [])[0] ?? null
  const salida = []
  items.forEach((it, k) => {
    const f = filas[k] ?? {}
    const clave = f.clave ?? it?.clave ?? null
    const fila = Number.isInteger(f.fila) ? f.fila : null
    const fuentes = [it?.origen, ...(it?.copias ?? [])].filter((o) => o?.fileId)
    for (const o of fuentes) {
      salida.push({ file_id: String(o.fileId), nombre: o.nombre ?? null, post_id: o.postId ?? postId, clave, fila })
    }
  })
  return salida
}

/**
 * Baja UN archivo tal cual fue enviado, lo sube al bucket y lo anota en `compra_adjunto`.
 *
 * @param {{bajar:Function, subir?:Function, query:Function}} dep
 *        `bajar(fileId)` → `{ok, nombre, mediaType, data(base64), error}` (el de `flujo.mjs` con
 *        `preparar` identidad); `subir` default `subirAStorage`; `query` Postgres.
 * @param {{file_id:string, nombre?:string, post_id?:string, clave?:string|null, fila?:number|null}} a
 * @param {{vinculado_por?:string, confianza?:number|null}} [vinculo]
 * @returns {Promise<{ok:true, path:string, yaEstaba:boolean}|{ok:false, motivo:string}>}
 */
export async function respaldarArchivo(dep, a, vinculo = {}) {
  const { bajar, query } = dep
  const subir = dep.subir ?? subirAStorage
  const bajado = await bajar(a.file_id)
  if (!bajado?.ok) return { ok: false, motivo: bajado?.error ?? 'no pude bajar el archivo' }
  const buf = Buffer.isBuffer(bajado.data) ? bajado.data : Buffer.from(String(bajado.data ?? ''), 'base64')
  const nombre = a.nombre ?? bajado.nombre ?? a.file_id
  const mediaType = tipoDe(bajado.mediaType, nombre)
  const v = admisible({ media_type: mediaType, bytes: buf.length })
  if (!v.ok) return { ok: false, motivo: v.motivo }
  const path = rutaDe(a.post_id, a.file_id, nombre)
  const subido = await subir({ bucket: BUCKET, path, data: buf, mediaType })
  if (!subido?.ok) return { ok: false, motivo: subido?.error ?? 'no pude guardar el archivo' }
  const conClave = Boolean(a.clave)
  await query(
    `insert into public.compra_adjunto
       (compra_clave, fila_compras, storage_path, nombre, media_type, bytes, origen,
        origen_post_id, origen_file_id, subido_at, vinculado_por, confianza, vinculado_at)
     values ($1,$2,$3,$4,$5,$6,'mattermost',$7,$8,now(),$9,$10,$11)
     on conflict (origen_file_id) where origen_file_id is not null do update set
       -- EL VÍNCULO SE REPONE, NUNCA SE PISA. «do nothing» dejaba el archivo colgado para siempre
       -- cuando la fila ya existía sin clave: el backfill lo sube como «sin_vincular» apenas aparece
       -- en el canal, y el respaldo del fajo —que sí trae la clave y la fila— llegaba después y no
       -- escribía nada. Medido el 08/09/2026: 57 adjuntos de 181 en «sin_vincular», entre ellos los
       -- de las filas 858, 863, 923, 924 y 928, que la app mostraba «sin comprobante» con el papel
       -- ya guardado en el bucket. «coalesce» sobre lo que YA está: rellena el hueco y no toca un
       -- vínculo que alguien (o la conciliación) ya resolvió.
       compra_clave   = coalesce(public.compra_adjunto.compra_clave, excluded.compra_clave),
       fila_compras   = coalesce(public.compra_adjunto.fila_compras, excluded.fila_compras),
       vinculado_por  = case when public.compra_adjunto.compra_clave is null and excluded.compra_clave is not null
                             then excluded.vinculado_por else public.compra_adjunto.vinculado_por end,
       confianza      = case when public.compra_adjunto.compra_clave is null and excluded.compra_clave is not null
                             then excluded.confianza else public.compra_adjunto.confianza end,
       vinculado_at   = case when public.compra_adjunto.compra_clave is null and excluded.compra_clave is not null
                             then excluded.vinculado_at else public.compra_adjunto.vinculado_at end`,
    [a.clave ?? null, a.fila ?? null, path, nombre, mediaType, buf.length,
      a.post_id ?? null, a.file_id,
      vinculo.vinculado_por ?? (conClave ? 'registro' : 'sin_vincular'),
      vinculo.confianza ?? (conClave ? 1 : null),
      conClave ? new Date().toISOString() : null],
  )
  return { ok: true, path, yaEstaba: Boolean(subido.yaEstaba) }
}

/**
 * Todos los archivos de un fajo que acaba de quedar CARGADO. Nunca lanza.
 *
 * @returns {Promise<{guardados:number, yaEstaban:number, fallidos:Array<{nombre:string, motivo:string}>, omitido?:string}>}
 */
export async function respaldarFajoCargado(dep, { fajo, items = [], filas = [] } = {}) {
  const vacio = { guardados: 0, yaEstaban: 0, fallidos: [] }
  const archivos = archivosDelFajo({ fajo, items, filas })
  if (!archivos.length) return vacio
  if (typeof dep?.bajar !== 'function') return { ...vacio, omitido: 'sin Mattermost: no puedo bajar los archivos' }
  if (typeof dep?.query !== 'function') return { ...vacio, omitido: 'sin Postgres: no puedo anotar los archivos' }
  const r = { ...vacio }
  for (const a of archivos) {
    try {
      const x = await respaldarArchivo(dep, a)
      if (x.ok) { r.guardados++; if (x.yaEstaba) r.yaEstaban++ } else r.fallidos.push({ nombre: a.nombre ?? a.file_id, motivo: x.motivo })
    } catch (e) {
      r.fallidos.push({ nombre: a.nombre ?? a.file_id, motivo: String(e?.message ?? e).slice(0, 160) })
    }
  }
  return r
}

// ═══ LO QUE NO SE PUDO GUARDAR NO SE PIERDE: SE REINTENTA (15/09/2026) ═══
//
// EL DEFECTO. `respaldarFajoCargado` devuelve `omitido: 'sin Mattermost: no puedo bajar los
// archivos'` cuando el escritor corre sin `MM_BASE_URL`/`MM_BOT_TOKEN` —el cargador desde la
// terminal, el worker de la pantalla 24, cualquier reintento fuera del bot—. Eso salía como un
// renglón en el aviso y ahí terminaba: la fila quedaba en Compras y en la app sin papel, y nadie
// volvía a intentarlo nunca. El único que recuperaba esos archivos era un script manual corrido a
// mano el 05/09.
//
// QUÉ PENDIENTE SE ANOTA: NINGUNO. No hace falta una tabla nueva y por eso no se crea: el pendiente
// ya está escrito en `comunicacion.comprobante_fajos` —los `items` con sus `origen.fileId` y las
// `filas` que les tocaron— y lo que falta es justamente la fila de `public.compra_adjunto`. El
// pendiente es la DIFERENCIA entre las dos, calculada cada vez. Una tabla de pendientes sería una
// tercera verdad que puede quedar desincronizada de las otras dos; esto no puede.

/**
 * Los archivos de fajos YA CARGADOS que todavía no tienen su fila en `compra_adjunto`. Puro.
 *
 * Sólo cuenta lo que quedó CARGADO (tiene fila o clave): un adjunto de un comprobante que nunca
 * entró a Compras no es un respaldo faltante, es un comprobante que no se cargó — y eso lo vigila
 * `vigilancia.mjs`, no esto.
 *
 * @param {Array<{id:string, items:object[], filas:object[], post_ids:string[]}>} fajos
 * @param {Set<string>} yaGuardados  `origen_file_id` que ya están en `compra_adjunto`
 */
export function pendientesDeFajos(fajos = [], yaGuardados = new Set()) {
  const out = []
  for (const f of fajos ?? []) {
    const items = Array.isArray(f?.items) ? f.items : []
    const filas = Array.isArray(f?.filas) ? f.filas : []
    for (const a of archivosDelFajo({ fajo: f, items, filas })) {
      if (!a.file_id || yaGuardados.has(a.file_id)) continue
      if (!a.fila && !a.clave) continue
      out.push({ ...a, fajo_id: f?.id ?? null })
    }
  }
  return out
}

/**
 * La misma diferencia, contra Postgres. Sólo lectura: no anota nada, no sube nada.
 * @param {{query:Function}} dep
 */
export async function respaldosPendientes(dep, { limite = 200, dias = 60 } = {}) {
  if (typeof dep?.query !== 'function') return []
  const f = await dep.query(
    `select id, post_ids, items, filas from comunicacion.comprobante_fajos
      where filas is not null and creado_at > now() - make_interval(days => $1)
      order by creado_at desc limit $2`, [dias, limite])
  const candidatos = pendientesDeFajos(f?.rows ?? [])
  if (!candidatos.length) return []
  const ids = [...new Set(candidatos.map((c) => c.file_id))]
  const g = await dep.query('select origen_file_id from public.compra_adjunto where origen_file_id = any($1)', [ids])
  const ya = new Set((g?.rows ?? []).map((r) => r.origen_file_id))
  return candidatos.filter((c) => !ya.has(c.file_id))
}

/**
 * La repesca: baja y guarda lo que quedó pendiente. Nunca lanza — corre colgada de un timer.
 * @param {{bajar:Function, subir?:Function, query:Function}} dep
 */
export async function reintentarRespaldos(dep, { limite = 20, dias = 60 } = {}) {
  const r = { pendientes: 0, guardados: 0, fallidos: [] }
  if (typeof dep?.bajar !== 'function' || typeof dep?.query !== 'function') return { ...r, omitido: 'sin Mattermost o sin Postgres' }
  let pend
  try {
    pend = await respaldosPendientes(dep, { dias })
  } catch (e) {
    return { ...r, omitido: `no pude mirar los pendientes: ${String(e?.message ?? e).slice(0, 120)}` }
  }
  r.pendientes = pend.length
  for (const a of pend.slice(0, limite)) {
    try {
      const x = await respaldarArchivo(dep, a, { vinculado_por: 'repesca' })
      if (x.ok) r.guardados++
      else r.fallidos.push({ nombre: a.nombre ?? a.file_id, motivo: x.motivo })
    } catch (e) {
      r.fallidos.push({ nombre: a.nombre ?? a.file_id, motivo: String(e?.message ?? e).slice(0, 160) })
    }
  }
  return r
}

/** Cada cuánto barre la repesca. Diez minutos: no es urgente, pero tampoco puede ser «algún día». */
export const REPESCA_INTERVALO_MS_DEFAULT = 10 * 60_000

/**
 * La repesca con su propio intervalo, para colgarla del tick del worker —que es el único proceso que
 * tiene a la vez el pool de la base y el cliente de Mattermost—. Mismo patrón que el vigía de fajos
 * mudos: no suma a `trabajo` y nunca propaga error.
 */
export function crearRepescaDeRespaldos({ bajar, query, subir, intervaloMs = REPESCA_INTERVALO_MS_DEFAULT, log = null, ahora = () => Date.now() } = {}) {
  let proximo = 0
  return async function repescar() {
    const t = ahora()
    if (t < proximo) return null
    proximo = t + intervaloMs
    try {
      const r = await reintentarRespaldos({ bajar, query, subir })
      if (r.guardados || r.fallidos.length) log?.info?.('comprobantes: repesca de respaldos', r)
      return r
    } catch (e) {
      log?.warn?.('comprobantes: la repesca de respaldos falló', { detalle: String(e?.message ?? e).slice(0, 200) })
      return null
    }
  }
}

/** El renglón que se le dice al dueño. `null` cuando no hay nada que decir. */
export function avisoDeRespaldo(r) {
  if (!r) return null
  if (r.omitido) return `⚠ No guardé los archivos en la app: ${r.omitido}. Quedan pendientes y los reintento solo.`
  if (!r.fallidos?.length) return null
  const lista = r.fallidos.slice(0, 5).map((f) => `${f.nombre} (${f.motivo})`).join(' · ')
  return `⚠ ${r.fallidos.length} archivo(s) no quedaron en la app: ${lista}. La fila en Compras sí está.`
}
