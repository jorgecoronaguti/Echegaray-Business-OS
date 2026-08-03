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
//   4. leer cada uno                  → una llamada por comprobante, con revisión si dudó.
//   5. matchear proveedor, obra y detalle → contra el desplegable ESTRICTO y el vocabulario vivo de
//                                       la columna K; sin match inequívoco, se pregunta.
//   6. conciliar contra ARCA          → corrige el número mal leído ANTES de deduplicar con él.
//   7. ¿ya está cargado?              → por (CUIT, tipo, número) en el registro Y en Compras VIVO.
//   8. abrir o ampliar el fajo        → un mensaje con botones, no una cascada.
//
// NO ESCRIBE EN EL SHEET. Ni acá ni por accidente: la escritura vive en `escritura.mjs` y sólo la
// dispara un Confirmar.

import { matchProveedor } from '../../lib/carga-comprobantes.mjs'
import { normalizarLectura, claveComprobante, MEDIA_SOPORTADOS, MAX_BYTES_ADJUNTO } from '../../lib/comprobantes/lectura.mjs'
import { imputacionDeAnotacion } from '../../lib/comprobantes/imputacion.mjs'
import { conciliarConArca, aplicarArca, ESTADO_ARCA } from '../../lib/comprobantes/arca.mjs'
import { buscarEnCompras, HALLAZGO } from '../../lib/comprobantes/compras-vivas.mjs'
import { colapsarRepetidos, entraEnElFajo, ESTADO } from '../../lib/comprobantes/fajo.mjs'
import { mensajeFajo } from '../../lib/comprobantes/mensaje.mjs'
import { perfilesDeImputacion, sugerirImputacion } from '../../lib/imputacion-aprendida.mjs'
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
    // EL DESPLEGABLE ES EL ÁRBITRO, NO EL MODELO. Cuando hubo revisión, las dos pasadas pueden haber
    // leído nombres distintos del mismo membrete ("Néstor Rubén Corralón Progreso" y "MATERIALES DE
    // CONSTRUCCION"): se prueban las dos contra la lista estricta y gana la que matchea. Si ninguna
    // matchea, queda la principal marcada como nueva, igual que antes.
    let m = matchProveedor(comprobante.proveedor, listas.proveedores)
    if (m.esNuevo && comprobante.proveedorAlt) {
      const alt = matchProveedor(comprobante.proveedorAlt, listas.proveedores)
      if (!alt.esNuevo) m = alt
    }
    comprobante.proveedor = m.valor
    proveedorNuevo = m.esNuevo === true
  }
  delete comprobante.proveedorAlt

  // 1º el papel, 2º lo que escribió la persona. Nunca al revés.
  const vocabulario = { obras: listas?.obras ?? [], detalles: listas?.detalles ?? {} }
  let imp = imputacionDeAnotacion(comprobante.anotacion, vocabulario)
  let obraVia = imp.obra ? 'comprobante' : null
  if (!imp.obra) {
    const porTexto = imputacionDeAnotacion(textoPost, vocabulario)
    if (porTexto.obra) { imp = porTexto; obraVia = 'mensaje' }
  }
  comprobante.obra = imp.obra ?? null
  comprobante.obraVia = obraVia
  // K "Detalles / Obra" no tiene desplegable: su lista legítima es el vocabulario que el dueño ya
  // usó en esa obra. Se completa sólo cuando la anotación identifica UNO solo; si "BSA" puede ser
  // tres detalles distintos de MESSINA, la obra queda resuelta y el detalle vacío.
  comprobante.detalleObra = imp.detalle ?? null
  comprobante.detalleVia = imp.detalleVia ?? null

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
 * Concilia un ítem contra el padrón de ARCA: corrige el número mal leído y completa el CUIT.
 *
 * VA ANTES DEL COLAPSO Y DE LA IDEMPOTENCIA, y ese orden es todo el arreglo: la clave de
 * deduplicación se arma con el número, así que corregirlo después sería corregirlo tarde. Con
 * `0004-00036542` el comprobante no colapsaba contra el que ya estaba en Compras; con el número
 * bueno, sí.
 *
 * `arcaDe` es inyectable y puede no estar: sin ella el ítem queda `no_verificado` y se declara. No
 * poder consultar ARCA nunca bloquea la carga — bloquearla convertiría una integración en un muro.
 */
export async function conciliarItems(items = [], arcaDe) {
  if (typeof arcaDe !== 'function') {
    for (const it of items) it.arca = { estado: ESTADO_ARCA.NO_VERIFICADO }
    return items
  }
  for (const it of items) {
    try {
      const filas = await arcaDe(it.comprobante ?? {})
      const r = conciliarConArca(it.comprobante ?? {}, filas ?? [])
      it.arca = aplicarArca(it.comprobante ?? {}, r)
      const k = claveComprobante(it.comprobante ?? {})
      it.clave = k?.clave ?? null
      it.claveFuerte = k?.fuerte ?? false
    } catch {
      // Una consulta caída no puede tumbar la lectura de una foto que ya se pagó.
      it.arca = { estado: ESTADO_ARCA.NO_VERIFICADO }
    }
  }
  return items
}

/**
 * ¿Alguno de estos comprobantes ya está en la pestaña Compras VIVA?
 *
 * Es distinto de `marcarYaCargados`, que sólo mira lo que entró por el chat. El caso real entró por
 * Claude Code: el registro propio no lo tenía y el destino sí. Un hallazgo por tipo+número es
 * certeza (`yaCargado`); uno por proveedor+fecha+importe con otro número es un PROBABLE duplicado
 * que se pregunta con botones, nunca se resuelve solo.
 */
export function marcarEnCompras(items = [], indice = null) {
  if (!indice?.ok) {
    // NO PODER MIRAR COMPRAS NO ES "NO ESTÁ CARGADO". Callarlo hace que las dos cosas se vean igual
    // en el mensaje, y el dueño confirma creyendo que se revisó. Se declara por ítem.
    for (const it of items) it.comprasNoRevisadas = { error: indice?.error ?? 'no pude leer la pestaña Compras' }
    return items
  }
  for (const it of items) {
    const r = buscarEnCompras(it.comprobante ?? {}, indice)
    if (!r) continue
    if (r.que === HALLAZGO.CARGADO && !it.yaCargado) {
      // `via` viaja porque el mensaje tiene que poder decir POR QUÉ es ése ("mismo número y mismo
      // total"). Un aviso de duplicado sin la razón es un aviso que no se puede desmentir.
      it.yaCargado = { fila: r.fila, hoja: r.hoja, fuente: 'Compras', obra: r.obra, detalle: r.detalle, via: r.via }
    } else if (r.que === HALLAZGO.PROBABLE && !it.yaCargado) {
      it.posibleDuplicado = {
        fila: r.fila, hoja: r.hoja, numero: r.numero, fecha: r.fecha, total: r.total,
        obra: r.obra, detalle: r.detalle, proveedor: r.proveedor, otras: r.otras ?? 0,
      }
    }
  }
  return items
}

/**
 * Completa la imputación que el PAPEL no dijo, con lo que la empresa ya hizo antes.
 *
 * ═══ POR QUÉ ESTA FUNCIÓN NO TIENE UNA SOLA REGLA DE IMPUTACIÓN ═══
 *
 * Porque ya existen y no son de acá. `lib/imputacion-aprendida.mjs` es el módulo del OS que aprende
 * de `Compras` cómo imputa el dueño —perfiles por proveedor, umbrales calibrados (n≥5 y 80% para
 * hablar firme), confianza declarada— y es el mismo que usa el cargador que corre Claude Code. El bot
 * lo IGNORABA y resolvía la imputación por su cuenta: por eso Claude Code parecía más inteligente que
 * el bot. Acá no se decide nada nuevo; se le pregunta al que sabe y se aplica su respuesta.
 *
 * ═══ EL ORDEN, QUE ES TODA LA REGLA ═══
 *
 * **Lo escrito a mano en el papel MANDA sobre el historial.** Si el comprobante dice "Camion BSA -
 * Messina", eso es una decisión del dueño tomada sobre ese gasto; el historial es una estadística
 * sobre otros gastos. El historial sólo llena lo que quedó vacío.
 *
 * Y proponer no es decidir: sólo se aplica lo que la lib declara FIRME (`pide_confirmacion:false`).
 * Lo que no llega, se pregunta —con las opciones más probables adelante— porque adivinar la obra
 * imputa plata a la obra equivocada y ensucia el margen de las dos.
 */
export function completarConHistorial(items = [], perfiles = null) {
  if (!perfiles?.por_proveedor) return items
  for (const it of items) {
    const c = it.comprobante ?? {}
    if (!c.proveedor) continue
    const base = { proveedor: c.proveedor, concepto: c.concepto, monto: c.total }
    let s = sugerirImputacion({ ...base, obra: c.obra }, perfiles)
    const ap = {}
    if (!c.obra && s.obra?.sugerido && !s.obra.pide_confirmacion) {
      c.obra = s.obra.sugerido
      c.obraVia = 'historial'
      ap.obra = { n: s.obra.n, share: s.obra.share }
      // El detalle depende de la obra: con la obra recién resuelta hay que volver a preguntar, o se
      // estaría ofreciendo el detalle más frecuente de OTRA obra.
      s = sugerirImputacion({ ...base, obra: c.obra }, perfiles)
    }
    if (!c.detalleObra && s.detalle?.sugerido && !s.detalle.pide_confirmacion) {
      c.detalleObra = s.detalle.sugerido
      c.detalleVia = 'historial'
      ap.detalle = { n: s.detalle.n, share: s.detalle.share, obra: s.detalle.obra ?? c.obra ?? null }
    }
    if (!c.unidad && s.unidad?.sugerido && !s.unidad.pide_confirmacion) {
      c.unidad = s.unidad.sugerido
      ap.unidad = { n: s.unidad.n, share: s.unidad.share }
    }
    // Lo que NO se aplicó viaja igual —con sus opciones, sus conteos y sus notas—: es con lo que el
    // mensaje pregunta sin preguntar en blanco, y de donde salen los botones. Tirarlo acá era la
    // causa del "Obra: falta — ¿a qué obra va?" que no decía nada, con 126 cargas de ese proveedor
    // ya contadas dos líneas más arriba.
    //
    // El RUBRO viaja aunque no se pregunte nunca: es la línea del Cash Flow donde va a caer esta
    // plata, o sea la consecuencia de la imputación que el dueño está por elegir.
    it.sugerencia = { obra: s.obra ?? null, detalle: s.detalle ?? null, unidad: s.unidad ?? null, rubro: s.rubro ?? null }
    if (Object.keys(ap).length) it.aprendido = ap
  }
  return items
}

/**
 * Procesa un post con adjuntos. Es el punto de entrada del especialista.
 *
 * @param {object} d  dependencias inyectadas
 * @param {{query:Function}} d.port
 * @param {object} d.mattermost   cliente con `archivoInfo` y `archivo`
 * @param {Function} d.leer       (adjunto) => {ok, crudo}   — el modelo de visión
 * @param {Function} d.listas     () => {ok, proveedores, obras}
 * @param {Function} [d.arcaDe]   (comprobante) => filas candidatas de public.comprobantes_arca
 * @param {Function} [d.comprasDe] () => índice de la pestaña Compras viva (`compras-vivas.mjs`)
 * @param {string} d.url          URL de callback CON el secreto en la query
 * @param {object} [d.log]
 * @param {object} m  el mensaje
 * @returns {Promise<{texto:string, attachments?:Array, estado:string, fajoId?:string}>}
 */
export async function procesarPost(d, m = {}) {
  // `arcaDe` y `comprasDe` son OPCIONALES y por eso están fuera del destructuring con default: sin
  // ellas el flujo funciona igual y lo declara. Que el padrón de ARCA no conteste no puede impedir
  // que una foto se lea.
  const { port, mattermost, leer, listas, url, log, arcaDe, comprasDe } = d
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
    mattermost, // segunda vía del permiso: estar en el canal oficial habilita
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
  //    Compras VIVO se lee una sola vez y sirve para dos cosas: el vocabulario de la columna K con el
  //    que se resuelve lo escrito a mano, y el índice contra el que se busca el duplicado.
  const [listasVivas, indiceCompras] = await Promise.all([
    listas(),
    typeof comprasDe === 'function' ? comprasDe().catch(() => null) : Promise.resolve(null),
  ])
  const vocabulario = { ...listasVivas, detalles: indiceCompras?.detalles ?? {} }
  const items = []
  for (const a of bajados) {
    const r = await leer(a)
    if (!r?.ok) { problemas.push(`· ${a.nombre}: ${r?.error ?? 'no pude leerlo'}`); continue }
    // El texto del post vale para TODOS sus adjuntos: mandar cinco fotos con un solo "ARCOR" arriba
    // es la forma en que se manda un fajo de una misma obra.
    items.push(armarItem({ lectura: r.crudo, adjunto: a, listas: vocabulario, textoPost: m.texto ?? null }))
  }
  if (!items.length) {
    return { texto: [TEXTO.NADA_LEGIBLE, ...(problemas.length ? ['', ...problemas] : [])].join('\n'), estado: 'ilegible' }
  }

  // 5) ARCA, ANTES de colapsar: corrige el número mal leído, que es justo con lo que se deduplica.
  await conciliarItems(items, arcaDe)

  // 6) Colapsar los repetidos del propio envío (la misma factura fotografiada dos veces).
  const { items: unicos } = colapsarRepetidos(items)

  // 7) ¿Ya estaban cargados? En el registro del chat Y en la pestaña Compras VIVA: el comprobante
  //    pudo haber entrado por Claude Code o a mano, que es exactamente lo que pasó.
  //    ESTO CORRE SIEMPRE, con ARCA o sin ARCA. Que un tique no esté en el Libro IVA no dice nada
  //    sobre si ya está cargado; es justo cuando más falta hace mirar el destino.
  await marcarYaCargados(port, unicos, repo)
  marcarEnCompras(unicos, indiceCompras)

  // 7 bis) Lo que el papel no dijo, lo dice la historia de Compras — vía el módulo que ya aprende
  //        para todo el OS. Nunca pisa lo escrito a mano.
  completarConHistorial(unicos, await perfilesDeHistorial(indiceCompras, d))

  // 8) Abrir o ampliar el fajo.
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

/**
 * Los perfiles de imputación, de la fuente más completa que haya.
 *
 * PRIMERO LA PESTAÑA VIVA, que ya se leyó para buscar el duplicado: trae el detalle de la columna K
 * separado del concepto y trae también las filas sin obra. SEGUNDO el espejo `public.costos_obra`,
 * que es el feeder original de la lib y el que usa el cargador. Los dos entran por la MISMA función
 * pura (`perfilesDeImputacion`): no hay dos formas de aprender, hay dos formas de leer la historia.
 *
 * Si no hay ninguna, se devuelve null y no se sugiere nada. Sin historia no se inventa una obra.
 */
async function perfilesDeHistorial(indiceCompras, d) {
  if (indiceCompras?.ok && indiceCompras.historia?.length) return perfilesDeImputacion(indiceCompras.historia)
  const desdeDB = d.perfilesDesdeDB
  if (typeof desdeDB !== 'function') return null
  try { return await desdeDB() } catch { return null }
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
