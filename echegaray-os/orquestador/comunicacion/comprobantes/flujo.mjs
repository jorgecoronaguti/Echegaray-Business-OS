// DE LA FOTO EN EL CANAL AL MENSAJE CON BOTONES — el flujo entero, sin una línea de SQL ni de red.
//
// Todo entra INYECTADO (`port`, `mattermost`, `leer`, `listas`) porque así este archivo se prueba
// completo con dobles: se le da un adjunto de mentira, un lector que devuelve un JSON conocido y un
// repositorio en memoria, y se verifica el mensaje que sale. Si armara sus propias dependencias,
// probarlo exigiría Postgres, Google, Mattermost y crédito de API — o sea, no se probaría.
//
// EL ORDEN IMPORTA Y ES ÉSTE:
//   1. ¿está aplicada la migración?   → si no, se dice; no se revienta.
//   2. LA PUERTA (canal + permiso)    → antes de bajar un solo byte y antes de gastar un token.
//   3. bajar los adjuntos             → sólo lo que un modelo de visión puede mirar.
//   4. leer cada uno                  → una llamada por comprobante, en paralelo acotado.
//   5. matchear proveedor y obra      → contra los desplegables ESTRICTOS; sin match, se pregunta.
//   6. ¿ya está cargado?              → por (CUIT, tipo, número), ANTES de mostrar nada.
//   7. abrir o ampliar el fajo        → un mensaje con botones, no una cascada.
//
// NO ESCRIBE EN EL SHEET. Ni acá ni por accidente: la escritura vive en `escritura.mjs` y sólo la
// dispara un Confirmar.

import { matchProveedor } from '../../lib/carga-comprobantes.mjs'
import { normalizarLectura, claveComprobante, obraDeAnotacion, MEDIA_SOPORTADOS, MAX_BYTES_ADJUNTO } from '../../lib/comprobantes/lectura.mjs'
import { colapsarRepetidos, entraEnElFajo, mensajeFajo, ESTADO } from '../../lib/comprobantes/fajo.mjs'
import { puedeCargarComprobantes } from './guarda.mjs'
import * as repoReal from './repositorio.mjs'

/** Techo de adjuntos por post. Un álbum de 40 fotos no es un fajo: es un accidente. */
export const MAX_ADJUNTOS = Number(process.env.ORQ_COMPROBANTES_MAX_ADJUNTOS || 12)

export const TEXTO = Object.freeze({
  SIN_ESQUEMA: 'La carga de comprobantes por chat todavía no está habilitada en esta instalación. Avisale a Dirección.',
  SIN_ADJUNTOS: 'Mandame la foto o el PDF del comprobante y lo cargo.',
  NADA_LEGIBLE: 'No pude leer ninguno de los archivos que mandaste. Si son fotos, que se vea el total y el número de comprobante.',
  DEMASIADOS: `Mandá hasta ${MAX_ADJUNTOS} comprobantes por vez, así los puedo revisar de a uno.`,
})

/**
 * Baja un adjunto de Mattermost y lo deja listo para el modelo de visión.
 * Devuelve `{error}` en vez de lanzar: un archivo que no se puede bajar no tumba los otros tres.
 */
export async function bajarAdjunto(mattermost, fileId) {
  try {
    const info = await mattermost.archivoInfo(fileId)
    const mediaType = String(info?.mime_type ?? '').split(';')[0].trim().toLowerCase()
    const nombre = info?.name ?? fileId
    if (!MEDIA_SOPORTADOS.includes(mediaType)) {
      return { ok: false, nombre, error: `no puedo mirar un archivo ${mediaType || 'de tipo desconocido'}` }
    }
    if (Number(info?.size ?? 0) > MAX_BYTES_ADJUNTO) {
      return { ok: false, nombre, error: 'la imagen pesa demasiado; mandala más liviana' }
    }
    const buf = await mattermost.archivo(fileId)
    const data = Buffer.isBuffer(buf) ? buf.toString('base64') : Buffer.from(buf).toString('base64')
    return { ok: true, fileId, nombre, mediaType, data }
  } catch (e) {
    return { ok: false, nombre: fileId, error: `no pude bajar el archivo: ${String(e?.message ?? e).slice(0, 120)}` }
  }
}

/**
 * Un adjunto ya bajado → el ítem del fajo (comprobante + preguntas abiertas).
 *
 * `listas` son los desplegables ESTRICTOS. Si no se pudieron leer (`ok:false`), NO se marca al
 * proveedor como nuevo: se lo deja tal cual y se declara que no se pudo verificar. Decir "este
 * proveedor no existe" porque falló una lectura sería fabricar un hallazgo.
 *
 * `textoPost` es lo que la persona ESCRIBIÓ al mandar la foto. Es la segunda fuente de la obra y no
 * un adorno: mandar la foto con "ARCOR" al lado es la forma más natural de decir a qué obra va, y
 * mucho más frecuente que anotarla a mano en el papel antes de fotografiarlo. Sin mirarla, el bot
 * preguntaba por una obra que la persona acababa de escribir un renglón más arriba.
 *
 * EL ORDEN IMPORTA: manda lo que dice el COMPROBANTE; el texto del chat sólo se usa cuando el papel
 * no dice nada. Y las dos pasan por el MISMO matcheo estricto contra el desplegable, que devuelve
 * null si la referencia es ambigua. Escribir "ARCOR" no mete "ARCOR" en la celda: mete el rótulo del
 * desplegable que matchea sin ambigüedad, o no mete nada y se pregunta.
 */
export function armarItem({ lectura, adjunto, listas, textoPost = null } = {}) {
  const { comprobante, faltantes, dudas } = normalizarLectura(lectura)
  const listasOk = listas?.ok !== false && (listas?.proveedores?.length ?? 0) > 0

  let proveedorNuevo = false
  if (listasOk && comprobante.proveedor) {
    const m = matchProveedor(comprobante.proveedor, listas.proveedores)
    comprobante.proveedor = m.valor
    proveedorNuevo = m.esNuevo === true
  }

  // 1º el papel, 2º lo que escribió la persona. Nunca al revés.
  const obras = listas?.obras ?? []
  let obra = obraDeAnotacion(comprobante.anotacion, obras)
  let obraVia = obra ? 'comprobante' : null
  if (!obra) {
    const porTexto = obraDeAnotacion(textoPost, obras)
    if (porTexto) { obra = porTexto; obraVia = 'mensaje' }
  }
  comprobante.obra = obra?.valor ?? null
  comprobante.obraVia = obraVia

  const k = claveComprobante(comprobante)
  return {
    comprobante,
    clave: k?.clave ?? null,
    claveFuerte: k?.fuerte ?? false,
    proveedorNuevo,
    listasVerificadas: listasOk,
    faltantes,
    dudas,
    origen: { fileId: adjunto?.fileId ?? null, nombre: adjunto?.nombre ?? null },
  }
}

/**
 * Procesa un post con adjuntos. Es el punto de entrada del especialista.
 *
 * @param {object} d  dependencias inyectadas
 * @param {{query:Function}} d.port
 * @param {object} d.mattermost   cliente con `archivoInfo` y `archivo`
 * @param {Function} d.leer       (adjunto) => {ok, crudo}   — el modelo de visión
 * @param {Function} d.listas     () => {ok, proveedores, obras}
 * @param {string} d.url          URL de callback CON el secreto en la query
 * @param {object} [d.log]
 * @param {object} m  el mensaje
 * @returns {Promise<{texto:string, attachments?:Array, estado:string, fajoId?:string}>}
 */
export async function procesarPost(d, m = {}) {
  const { port, mattermost, leer, listas, url, log } = d
  // El repositorio entra INYECTABLE (default: el real). Es la costura que permite probar el flujo
  // entero —puerta, lectura, agrupado, idempotencia, mensaje— con un doble en memoria, sin Postgres.
  const repo = d.repo ?? repoReal
  const fileIds = (m.fileIds ?? []).filter(Boolean)
  if (!fileIds.length) return { texto: TEXTO.SIN_ADJUNTOS, estado: 'sin_adjuntos' }
  if (fileIds.length > MAX_ADJUNTOS) return { texto: TEXTO.DEMASIADOS, estado: 'demasiados' }

  // 1) ¿Existe el esquema? Antes que nada: sin las tablas no hay idempotencia, y sin idempotencia
  //    esto no se enciende. Cargar sin barrera de duplicados es peor que no cargar.
  if (!await repo.tablasListas(port)) return { texto: TEXTO.SIN_ESQUEMA, estado: 'sin_esquema' }

  // 2) LA PUERTA. Antes de bajar un byte y antes de gastar un token de visión.
  const permitido = await puedeCargarComprobantes({
    port, actor: m.actor ?? {}, channelId: m.channelId, plataforma: m.plataforma ?? 'mattermost',
  })
  if (!permitido.ok) {
    log?.info?.('comprobantes: rechazado en la puerta', { motivo: permitido.motivo, detalle: permitido.detalle })
    return { texto: permitido.texto, estado: `rechazado_${permitido.motivo}` }
  }

  // 3) Bajar. En serie: son pocos archivos y Mattermost es local; el paralelo acá sólo compra
  //    complejidad y riesgo de rate limit.
  const bajados = []
  const problemas = []
  for (const id of fileIds) {
    const a = await bajarAdjunto(mattermost, id)
    if (a.ok) bajados.push(a); else problemas.push(`· ${a.nombre}: ${a.error}`)
  }

  // 4) Leer con el modelo. Una llamada por adjunto.
  const listasVivas = await listas()
  const items = []
  for (const a of bajados) {
    const r = await leer(a)
    if (!r?.ok) { problemas.push(`· ${a.nombre}: ${r?.error ?? 'no pude leerlo'}`); continue }
    // El texto del post vale para TODOS sus adjuntos: mandar cinco fotos con un solo "ARCOR" arriba
    // es la forma en que se manda un fajo de una misma obra.
    items.push(armarItem({ lectura: r.crudo, adjunto: a, listas: listasVivas, textoPost: m.texto ?? null }))
  }
  if (!items.length) {
    return { texto: [TEXTO.NADA_LEGIBLE, ...(problemas.length ? ['', ...problemas] : [])].join('\n'), estado: 'ilegible' }
  }

  // 5) Colapsar los repetidos del propio envío (la misma factura fotografiada dos veces).
  const { items: unicos } = colapsarRepetidos(items)

  // 6) ¿Ya estaban cargados? Se pregunta ANTES de mostrar, para que se vea junto con todo lo demás.
  await marcarYaCargados(port, unicos, repo)

  // 7) Abrir o ampliar el fajo.
  const abierto = await repo.fajoAbierto(port, {
    plataforma: m.plataforma ?? 'mattermost', userId: m.actor?.plataforma_user_id, channelId: m.channelId,
  })
  const seSuma = entraEnElFajo(abierto, {
    userId: m.actor?.plataforma_user_id, channelId: m.channelId, ahora: m.ahora ?? new Date(),
  })

  let fajo
  if (seSuma) {
    // Al ampliar se vuelve a colapsar contra lo que YA estaba en el fajo: mandar dos veces la misma
    // foto en dos posts distintos tiene que dar una línea, no dos.
    const { items: todos } = colapsarRepetidos([...(abierto.items ?? []), ...unicos])
    fajo = await repo.agregarAlFajo(port, { id: abierto.id, items: todos, postId: m.postId })
    // Si el update no tocó nada, alguien confirmó el fajo entre la lectura y ahora: se abre uno nuevo
    // en vez de perder los comprobantes recién leídos.
    if (!fajo) fajo = await repo.abrirFajo(port, nuevoFajo(m, unicos))
  } else {
    // Un fajo abierto pero fuera de la ventana no se toca: se cierra por vencimiento para que el
    // índice único deje abrir el nuevo, y el mensaje viejo queda como quedó.
    if (abierto) await repo.cerrarFajo(port, { id: abierto.id, estado: ESTADO.DESCARTADO, error: 'vencido por ventana' })
    fajo = await repo.abrirFajo(port, nuevoFajo(m, unicos))
  }
  if (!fajo) return { texto: 'No pude abrir la carga. Probá de nuevo en un minuto.', estado: 'error' }

  const msg = mensajeFajo(fajo, { url })
  const cola = problemas.length ? ['', '**No pude con estos:**', ...problemas].join('\n') : ''
  return { texto: msg.texto + cola, attachments: msg.attachments, estado: 'confirmar', fajoId: fajo.id }
}

function nuevoFajo(m, items) {
  return {
    plataforma: m.plataforma ?? 'mattermost',
    userId: m.actor?.plataforma_user_id,
    username: m.actor?.plataforma_username ?? null,
    channelId: m.channelId,
    rootPostId: m.rootPostId ?? m.postId ?? null,
    postId: m.postId ?? null,
    items,
  }
}

/** Le cuelga a cada ítem el `yaCargado` que corresponda. Muta los ítems a propósito: son de acá. */
export async function marcarYaCargados(port, items = [], repo = repoReal) {
  const mapa = await repo.yaCargados(port, items.map((i) => i.clave))
  for (const it of items) {
    const y = it.clave ? mapa.get(it.clave) : null
    if (y) it.yaCargado = { fila: y.fila, hoja: y.hoja, post_id: y.post_id, creado_at: y.creado_at }
  }
  return items
}
