// EL CONSUMIDOR DE LA COLA DE LA PANTALLA 24 — toma un lote y lo mete por el circuito del bot.
//
// La app deja el archivo en Storage y una fila en `public.comprobante_entrada`. Acá termina el
// viaje: se toma el lote más viejo, se bajan sus archivos, se llama al MISMO circuito que usa
// Mattermost (`circuito.mjs`) y se escribe de vuelta qué pasó con cada archivo.
//
// ═══ UN LOTE ES UN POST ═══
//
// Cinco fotos subidas de una vez tienen que ser UN fajo, igual que cinco fotos en un post. Por eso
// se toma el lote entero o nada: procesar de a un archivo rompería el colapso de la misma factura
// fotografiada dos veces y abriría cinco conversaciones con el Sheet donde corresponde una.
//
// El lote viaja como `channelId`, y no es una analogía perezosa: es la clave con la que el
// repositorio agrupa el fajo (`plataforma`, `plataforma_user_id`, `channel_id`) y la que después
// permite volver de la fila de la pantalla al comprobante registrado en la base. Un lote nuevo por
// gesto de carga garantiza que dos cargas distintas nunca se mezclen en el mismo fajo.
//
// ═══ TODO ENTRA INYECTADO ═══
//
// `procesar`, `bajarArchivo` y `port` entran por parámetro para poder probar el reparto de estados,
// la puerta y el reciclado de lo colgado con dobles en memoria — sin Postgres, sin Google, sin
// Storage y sin gastar un token de visión.

import { procesarComprobantes } from './circuito.mjs'
import * as repoReal from './repositorio.mjs'
import { bajarDeStorage } from '../../lib/storage-supabase.mjs'
import { ESTADO } from '../../lib/comprobantes/fajo.mjs'
import {
  ENTRADA, MAX_INTENTOS, aplicarReintento, cierreDelFajo, estadoDeEntrada, estadoDeExcepcion,
  repartirVeredicto,
} from '../../lib/comprobantes/entrada-web.mjs'

/** El bucket privado donde la pantalla deja los archivos. */
export const BUCKET = 'comprobantes'

/** Cuántos minutos puede quedarse una fila en `procesando` antes de darla por colgada. */
export const LEASE_MIN = Number(process.env.ORQ_COMPROBANTES_WEB_LEASE_MIN || 15)

/** Los roles que pueden cargar un gasto desde la pantalla. Es el mismo `es_administracion()` de la RLS. */
export const ROLES = Object.freeze(['direccion', 'administracion', 'jefe_obra'])

const TEXTO_SIN_PERMISO =
  'Tu usuario ya no tiene habilitada la carga de comprobantes. No cargué nada. Avisale a Dirección.'

/**
 * LA PUERTA DE LA WEB. La RLS ya dejó entrar la fila; esto vuelve a preguntar AHORA, que es cuando
 * se va a escribir en el Sheet. Un rol se cambia entre que alguien sube una foto y el worker la
 * procesa, y este camino termina moviendo plata: falla cerrado, igual que la del chat.
 */
export function guardaDeLaWeb(port) {
  return async ({ actor = {} } = {}) => {
    const id = actor?.plataforma_user_id
    if (!id) return { ok: false, motivo: 'sin_identidad', detalle: 'sin_identidad', texto: TEXTO_SIN_PERMISO }
    try {
      const r = await port.query('select rol, nombre from public.perfiles where id = $1', [id])
      const rol = r?.rows?.[0]?.rol
      if (!ROLES.includes(rol)) {
        return { ok: false, motivo: 'permiso', detalle: 'sin_permiso', texto: TEXTO_SIN_PERMISO }
      }
      return { ok: true, canal: { id: actor.channel_id, nombre: 'pantalla de Compras', area: 'compras' }, display: r.rows[0].nombre ?? null, via: 'rol' }
    } catch {
      // Fail-closed: si no se puede confirmar el rol, no se carga. Un permiso que se afloja cuando
      // se cae Postgres no es un permiso.
      return { ok: false, motivo: 'permiso', detalle: 'permiso_no_verificable', texto: 'No pude confirmar tu permiso, así que no cargué nada. Se reintenta solo.' }
    }
  }
}

/**
 * Devuelve a la cola lo que quedó `procesando` de un worker que se murió a mitad de camino.
 *
 * Sin esto un reinicio de la VM deja comprobantes en «procesando» para siempre: la pantalla giraría
 * indefinidamente sobre un archivo que nadie va a mirar. Ver `timeout-que-mata-al-escritor`.
 */
export async function reciclarColgadas(port, { minutos = LEASE_MIN, maxIntentos = MAX_INTENTOS } = {}) {
  const r = await port.query(
    `update public.comprobante_entrada
        set estado = case when intentos >= $2 then 'error' else 'pendiente' end,
            motivo = case when intentos >= $2
                          then 'la lectura se cortó a la mitad y ya no quedan reintentos'
                          else motivo end,
            cerrado_at = case when intentos >= $2 then now() else null end
      where estado = 'procesando' and tomado_at < now() - make_interval(mins => $1::int)
      returning id`,
    [minutos, maxIntentos],
  )
  return r?.rows ?? []
}

/**
 * Toma el lote pendiente más VIEJO, entero, y lo marca `procesando` gastando un intento.
 *
 * El intento se gasta ANTES de trabajar, no después: si el proceso se muere en el medio, el contador
 * ya subió y `reciclarColgadas` sabe cuántas veces se intentó. Contarlo al final haría que una falla
 * que mata al proceso se reintentara para siempre.
 */
export async function tomarLote(port) {
  const r = await port.query(
    `with siguiente as (
       select lote from public.comprobante_entrada
        where estado = 'pendiente' order by subido_at asc limit 1 for update skip locked
     )
     update public.comprobante_entrada e
        set estado = 'procesando', intentos = e.intentos + 1, tomado_at = now(), motivo = null
      where e.lote = (select lote from siguiente) and e.estado = 'pendiente'
      returning e.id, e.lote, e.storage_path, e.nombre_archivo, e.media_type, e.subido_por, e.intentos`,
  )
  return r?.rows ?? []
}

/**
 * EL NOMBRE DE QUIEN SUBIÓ, Y POR QUÉ ES UNA DECISIÓN Y NO UN CAMPO MÁS.
 *
 * El freno de mano de Sheets (`escritura.mjs`) se levanta SÓLO cuando el fajo lleva un
 * `plataforma_username`: *«el freno existe para que ningún TIMER y ningún AGENTE escriba solo. Un
 * fajo confirmado tiene un username: una persona identificada que miró el comprobante y apretó
 * Confirmar»*. Alguien que arrastra la foto en la pantalla 24 y toca «Cargar» es exactamente esa
 * persona, aunque el trabajo lo termine el worker: lo que el freno distingue es el ORIGEN DE LA
 * INTENCIÓN, no qué proceso escribe la celda.
 *
 * Si el nombre no se puede resolver, viaja `null` y el freno NO se levanta: los comprobantes quedan
 * guardados y se dice. Fallar cerrado acá cuesta una espera; fallar abierto cuesta una escritura en
 * el Sheet que nadie pidió.
 */
export async function nombreDeQuienSubio(port, usuarioId) {
  try {
    const r = await port.query('select nombre from public.perfiles where id = $1', [usuarioId])
    return String(r?.rows?.[0]?.nombre ?? '').trim() || null
  } catch { return null }
}

/** Un bajador para el circuito: `fileId` es el id de la fila de la cola. */
export function bajadorDe(filas = [], bajarArchivo = bajarDeStorage) {
  const porId = new Map(filas.map((f) => [String(f.id), f]))
  return async (fileId) => {
    const f = porId.get(String(fileId))
    if (!f) return { ok: false, fileId, nombre: String(fileId), error: 'el archivo no está en esta carga' }
    const r = await bajarArchivo({
      bucket: BUCKET, path: f.storage_path, nombre: f.nombre_archivo, mediaType: f.media_type,
    })
    return { ...r, fileId }
  }
}

/**
 * Lo que quedó registrado EN SU DESTINO — no lo que el circuito dijo que hizo.
 *
 * Se lee `comunicacion.comprobantes_cargados` por el lote (que viajó como `channel_id`): proveedor,
 * número, total y la FILA de Compras. Es la evidencia del efecto: si esta consulta vuelve vacía, la
 * pantalla no puede afirmar que el gasto entró, por más que el mensaje del circuito diga «✔».
 */
export async function comprobantesDelLote(port, lote) {
  try {
    const r = await port.query(
      `select c.proveedor, c.cuit, c.tipo, c.numero, c.total, c.fila, c.hoja, c.clave
         from comunicacion.comprobantes_cargados c
         join comunicacion.comprobante_fajos f on f.id = c.fajo_id
        where f.plataforma = 'web' and f.channel_id = $1
        order by c.id`,
      [lote],
    )
    return r?.rows ?? []
  } catch {
    // No poder leer el registro NO es «no se cargó nada»: se devuelve null y el resultado lo declara.
    return null
  }
}

/** Escribe el estado final de una fila. `en_espera` NO cierra: sigue esperando a una persona. */
async function guardarFila(port, veredicto, { fajoId = null, resultado = null } = {}) {
  await port.query(
    `update public.comprobante_entrada
        set estado = $2, motivo = $3, resultado = $4::jsonb, fajo_id = $5,
            cerrado_at = case when $2 in ('cargado','ya_estaba','rechazado','error') then now() else null end
      where id = $1`,
    [veredicto.id, veredicto.estado, veredicto.motivo ?? null,
      resultado ? JSON.stringify(resultado) : null, fajoId],
  )
}

/**
 * CIERRA EL FAJO CUANDO LA FILA WEB YA NO ESPERA A NADIE.
 *
 * Por chat, un fajo que vuelve como `confirmar` queda abierto porque hay un hilo donde una persona
 * va a tocar un botón. En la web no hay hilo: el veredicto ES la respuesta. Sin esto, un lote que
 * termina `ya_estaba` cierra su fila y deja el fajo `abierto` para siempre (prueba real 25/08), y
 * ese fajo abierto es además el que la carga SIGUIENTE de la misma persona va a reusar.
 *
 * Qué estado le corresponde a cada veredicto lo decide `cierreDelFajo`, que es puro y tiene su test.
 * Acá sólo queda lo que necesita la base: de dónde sale el id y por qué se cierra condicionado.
 *
 * `desde: ABIERTO` no es prudencia decorativa: en el camino feliz `escritura.mjs` ya cerró el fajo
 * como CARGADO con las filas que escribió, y volver a cerrarlo con `filas: null` borraría justamente
 * la evidencia de en qué fila de Compras entró el gasto.
 *
 * No propaga: el veredicto de las filas ya está guardado y es lo que ve la pantalla. Si esto falla,
 * se registra y el fajo queda abierto —el estado de hoy—, pero el lote no se pierde.
 */
export async function cerrarFajoDelLote(dep, { fajoId = null, lote, usuario, veredicto } = {}) {
  const { port, log } = dep
  const repo = dep.repo ?? repoReal
  const cierre = cierreDelFajo(veredicto?.estado, { motivo: veredicto?.motivo })
  if (!cierre) return null
  try {
    // Sin `fajoId` (una excepción que voló antes de que el circuito contestara) el fajo se busca por
    // la misma clave con la que se abrió: la web, la persona y el lote-como-canal.
    const id = fajoId ?? (await repo.fajoAbierto(port, {
      plataforma: 'web', userId: String(usuario), channelId: String(lote),
    }))?.id
    if (!id) return null
    const r = await repo.cerrarFajo(port, { id, desde: ESTADO.ABIERTO, ...cierre })
    return r ? { id, estado: cierre.estado } : null
  } catch (e) {
    log?.error?.('comprobantes web: no pude cerrar el fajo', { lote, error: String(e?.message ?? e) })
    return null
  }
}

/**
 * Procesa UN lote. Devuelve `null` si no había nada que hacer.
 *
 * @param {object} dep `{port, google, log, procesar?, bajarArchivo?}`
 */
export async function procesarUnLote(dep) {
  const { port, google, log } = dep
  const procesar = dep.procesar ?? procesarComprobantes
  const filas = await tomarLote(port)
  if (!filas.length) return null

  const lote = filas[0].lote
  const usuario = filas[0].subido_por
  const intentos = Math.max(...filas.map((f) => Number(f.intentos) || 1))
  const quien = await nombreDeQuienSubio(port, usuario)

  let salida
  try {
    salida = await procesar({
      port, google, log,
      bajar: bajadorDe(filas, dep.bajarArchivo),
      guarda: guardaDeLaWeb(port),
    }, {
      fileIds: filas.map((f) => String(f.id)),
      // SIN TEXTO. En el chat el texto del post es de donde sale la obra cuando el papel no la dice;
      // acá no hay texto que mandar, y fabricar uno sería fabricar imputación contable.
      texto: null,
      actor: {
        plataforma: 'web', plataforma_user_id: String(usuario), channel_id: String(lote),
        // Ver `nombreDeQuienSubio`: es lo que distingue «una persona cargó esto» de «un timer
        // escribió solo», y de eso depende que el freno de mano se levante o no.
        plataforma_username: quien,
      },
      channelId: String(lote),
      plataforma: 'web',
      postId: String(lote),
      rootPostId: String(lote),
      ahora: new Date(),
    })
  } catch (e) {
    const v = aplicarReintento(estadoDeExcepcion(e), intentos)
    for (const f of filas) await guardarFila(port, { ...v, id: f.id })
    // Si al lote no le quedan reintentos, la fila cierra en `error` y el fajo tiene que cerrar con
    // ella. Mientras queden (`pendiente`), `cierreDelFajo` devuelve null y el fajo se reusa.
    const fajo = await cerrarFajoDelLote(dep, { lote, usuario, veredicto: v })
    log?.error?.('comprobantes web: el lote falló', { lote, error: String(e?.message ?? e), fajo: fajo?.id ?? null })
    return { lote, filas: filas.length, estado: v.estado, fajo }
  }

  const veredicto = aplicarReintento(estadoDeEntrada(salida), intentos)
  const registrados = await comprobantesDelLote(port, lote)
  const resultado = {
    texto: salida?.texto ?? null,
    cargados: veredicto.cargados, yaEstaban: veredicto.yaEstaban, suma: veredicto.suma,
    // `null` y `[]` NO son lo mismo: uno es «no pude leer el registro», el otro «no entró ninguno».
    comprobantes: registrados,
  }
  for (const v of repartirVeredicto(filas, veredicto, salida?.parte ?? {})) {
    await guardarFila(port, v, { fajoId: salida?.fajoId ?? null, resultado })
  }
  // EL FAJO SE CIERRA CON EL VEREDICTO DEL LOTE, no con el de cada archivo: el fajo es uno solo y
  // agrupa la tanda entera. Un archivo ilegible dentro de un lote que cargó no descarta la tanda.
  const fajo = await cerrarFajoDelLote(dep, { fajoId: salida?.fajoId ?? null, lote, usuario, veredicto })
  log?.info?.('comprobantes web: lote procesado', { lote, filas: filas.length, estado: veredicto.estado, fajo: fajo?.estado ?? null })
  return { lote, filas: filas.length, estado: veredicto.estado, registrados: registrados?.length ?? null, fajo }
}

/** Vacía la cola: recicla lo colgado y procesa lotes hasta que no quede ninguno pendiente. */
export async function drenarCola(dep, { maxLotes = 20 } = {}) {
  const reciclados = await reciclarColgadas(dep.port)
  const hechos = []
  for (let i = 0; i < maxLotes; i++) {
    const r = await procesarUnLote(dep)
    if (!r) break
    hechos.push(r)
  }
  return { reciclados: reciclados.length, lotes: hechos }
}

export { ENTRADA }
