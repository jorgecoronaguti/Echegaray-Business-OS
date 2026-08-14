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
//   9. si no falta NADA, se carga solo → sin botones y sin clicks (ver `cargarSolo`).
//
// NO SABE ESCRIBIR EN EL SHEET. La escritura vive entera en `escritura.mjs` y entra por `escribir`,
// inyectada como todo lo demás: acá se decide CUÁNDO, nunca CÓMO.

import { claveComprobante, MEDIA_ACEPTADOS, MAX_BYTES_ADJUNTO, tipoPorExtension } from '../../lib/comprobantes/lectura.mjs'
import { prepararParaVision } from '../../lib/comprobantes/imagen.mjs'
import { conciliarConArca, aplicarArca, ESTADO_ARCA } from '../../lib/comprobantes/arca.mjs'
import { buscarEnCompras, HALLAZGO, escalaDelProveedor, detallesFirmes, obrasFirmes } from '../../lib/comprobantes/compras-vivas.mjs'
import { colapsarRepetidos, entraEnElFajo, estaCompleto, imputacionPendiente, rotulosDe, ESTADO } from '../../lib/comprobantes/fajo.mjs'
import { mensajeFajo } from '../../lib/comprobantes/mensaje.mjs'
import { rendicionDeAdjuntos, textoRendicion } from '../../lib/comprobantes/rendicion.mjs'
import { identificar } from '../../lib/comprobantes/identidad.mjs'
import { parteVacia, parteDeRendicion, parteDeEscritura, sumarPartes } from '../../lib/comprobantes/parte.mjs'
import { matchUnico } from '../../lib/comprobantes/imputacion.mjs'
import { perfilesDeImputacion } from '../../lib/imputacion-aprendida.mjs'
import { completarUno } from '../../lib/comprobantes/imputacion-historial.mjs'
import { puedeCargarComprobantes } from './guarda.mjs'
import * as repoReal from './repositorio.mjs'

// QUÉ VA EN CADA COLUMNA se decide en `lib/comprobantes/item.mjs`, que es puro y se prueba solo. Se
// re-exporta desde acá porque es el punto de entrada histórico del módulo: mover el archivo no puede
// obligar a tocar a todos los que ya lo importaban.
export { armarItem, opcionesParaImputar } from '../../lib/comprobantes/item.mjs'
import { armarItem } from '../../lib/comprobantes/item.mjs'

/** Techo de adjuntos por post. Un álbum de 40 fotos no es un fajo: es un accidente. */
export const MAX_ADJUNTOS = Number(process.env.ORQ_COMPROBANTES_MAX_ADJUNTOS || 12)

export const TEXTO = Object.freeze({
  SIN_ESQUEMA: 'La carga de comprobantes por chat todavía no está habilitada en esta instalación. Avisale a Dirección.',
  SIN_ADJUNTOS: 'Mandame la foto o el PDF del comprobante y lo cargo.',
  // "NO CARGUÉ NADA" VA EXPLÍCITO. "No pude leer" describe lo que le pasó al bot; lo que el dueño
  // necesita saber es qué pasó con SU gasto. Sin esa frase, un mensaje que arranca con una disculpa
  // se puede leer como "lo cargué igual, más o menos".
  NADA_LEGIBLE: 'No pude leer ninguno de los archivos que mandaste, así que **no cargué nada**. '
    + 'Si son fotos: que se vean enteros el total y el número de comprobante, sin reflejos y sin cortar los bordes. '
    + 'Mandalos de nuevo y lo intento otra vez.',
  DEMASIADOS: `Mandá hasta ${MAX_ADJUNTOS} comprobantes por vez, así los puedo revisar de a uno.`,
})

/**
 * Baja un adjunto de Mattermost y lo deja listo para el modelo de visión.
 * Devuelve `{error}` en vez de lanzar: un archivo que no se puede bajar no tumba los otros tres.
 */
export async function bajarAdjunto(mattermost, fileId, { preparar = prepararParaVision } = {}) {
  try {
    const info = await mattermost.archivoInfo(fileId)
    const mediaType = String(info?.mime_type ?? '').split(';')[0].trim().toLowerCase()
    const nombre = info?.name ?? fileId
    // ═══ EL TIPO NO SE DEDUCE SÓLO DEL MIME (13/08) ═══
    //
    // Mattermost devuelve el `mime_type` que le declaró el cliente, y para un `.HEIC` mandado desde
    // el iPhone eso a veces llega vacío o como `application/octet-stream`. La extensión del nombre es
    // la otra evidencia y es la que el dueño ve: si el archivo se llama IMG_7572.HEIC, es un HEIC.
    const tipo = MEDIA_ACEPTADOS.includes(mediaType) ? mediaType : (tipoPorExtension(nombre) ?? mediaType)
    if (!MEDIA_ACEPTADOS.includes(tipo)) {
      return { ok: false, fileId, nombre, error: `no puedo mirar un archivo ${tipo || 'de tipo desconocido'}` }
    }
    if (Number(info?.size ?? 0) > MAX_BYTES_ADJUNTO) {
      return { ok: false, fileId, nombre, error: 'la imagen pesa demasiado; mandala más liviana' }
    }
    const buf = await mattermost.archivo(fileId)
    const crudo = Buffer.isBuffer(buf) ? buf.toString('base64') : Buffer.from(buf).toString('base64')
    // Lo que un modelo NO puede mirar —el HEIC del iPhone— se convierte acá, y si no se puede se dice
    // con su motivo y su nombre de archivo. Ver `lib/comprobantes/imagen.mjs`.
    const listo = await preparar({ data: crudo, mediaType: tipo, nombre, fileId })
    if (!listo.ok) return { ok: false, fileId, nombre, error: listo.error }
    return {
      ok: true, fileId, nombre, mediaType: listo.mediaType, data: listo.data,
      ...(listo.convertidoDe ? { convertidoDe: listo.convertidoDe } : {}),
    }
  } catch (e) {
    // EL `fileId` VIAJA TAMBIÉN EN EL FALLO (05/08). Sin él, un adjunto que no se pudo bajar no se
    // puede aparear con el adjunto que entró, y la rendición no puede cerrar la cuenta: es la mitad
    // del defecto de las cinco fotos, donde tres se perdieron sin que nada lo dijera.
    return { ok: false, fileId, nombre: fileId, error: `no pude bajar el archivo: ${String(e?.message ?? e).slice(0, 120)}` }
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
    for (const it of items) {
      it.comprasNoRevisadas = { error: indice?.error ?? 'no pude leer la pestaña Compras' }
      // FAIL-CLOSED: la duda del registro (mismo número, otro importe) la iba a resolver la pestaña.
      // Sin pestaña no hay quién la resuelva, y entre preguntar de más y duplicar un gasto, se
      // pregunta. Ver `marcarYaCargados`.
      if (it.registroOtroImporte && !it.yaCargado) {
        it.yaCargado = { fila: it.registroOtroImporte.fila, hoja: 'Compras', fuente: 'registro', total: it.registroOtroImporte.total }
      }
    }
    return items
  }
  for (const it of items) {
    // LA ESCALA DEL PROVEEDOR VIAJA COMO EVIDENCIA, NO COMO VEREDICTO. `faltantes.mjs` compara el
    // total contra ella cada vez que se evalúa el ítem: guardar acá el "es sospechoso" haría que
    // corregir el importe no volviera a mirarlo, y el control quedaría opinando sobre un número que
    // ya nadie usa. Se lee de la MISMA pasada por Compras que busca el duplicado.
    it.escala = escalaDelProveedor(it.comprobante ?? {}, indice)
    const r = buscarEnCompras(it.comprobante ?? {}, indice)

    // ═══ EL REGISTRO PROPIO NO PRUEBA NADA: LA PRUEBA ES LA FILA EN COMPRAS (04/08) ═══
    //
    // `marcarYaCargados` marca contra `comunicacion.comprobantes_cargados`, que es lo que ESTE
    // sistema anotó cuando escribió. Si el dueño borra esa fila de Compras —cosa que hace todo el
    // tiempo— el registro sigue diciendo "cargado en la 810" y el bot contesta "ya está cargado, no
    // hay nada que cargar" sobre una fila que no existe. El comprobante queda imposible de cargar
    // para siempre, y encima con un mensaje que suena a que todo está bien.
    //
    // Pasó en producción: fila 810 borrada, el registro intacto, el tique inentrable.
    //
    // La regla del OS es explícita: un control no se valida contra la información que él mismo
    // produce, y la evidencia es el dato leído en su DESTINO. Así que cuando la pestaña SÍ se pudo
    // leer, ella manda: si no está, no está, y el registro se da por vencido. Cuando no se pudo leer
    // no se toca nada — no poder mirar no es haber mirado.
    //
    // ═══ UN "PROBABLE" TAMPOCO ES HABER MIRADO (13/08) ═══
    //
    // La condición era `r?.que !== CARGADO`, y con eso un hallazgo PROBABLE —"puede que sea esta
    // fila"— alcanzaba para dar el registro por vencido y BORRAR la clave de idempotencia. Es la
    // combinación exacta que duplica un gasto: el bot duda de si ya está, y por dudar se saca el
    // único freno que tenía para no cargarlo dos veces. Un desmentido tiene que ser un NO, no un
    // "no sé": sólo se olvida la clave cuando la pestaña no devolvió NINGUNA candidata.
    if (it.yaCargado && it.yaCargado.fuente !== 'Compras' && !r) {
      it.registroObsoleto = { fila: it.yaCargado.fila ?? null, clave: it.clave ?? null }
      delete it.yaCargado
    }

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
    // LA REGLA NO VIVE ACÁ (14/08). Vive en `lib/comprobantes/imputacion-historial.mjs`, y el
    // cargador de línea de comandos llama a la MISMA función: antes esto escribía y el cargador sólo
    // imprimía, así que el mismo comprobante quedaba imputado distinto según por dónde entrara.
    const { aplicado, sugerencia } = completarUno(c, perfiles)
    // Lo que NO se aplicó viaja igual —con sus opciones, sus conteos y sus notas—: es con lo que el
    // mensaje pregunta sin preguntar en blanco, y de donde salen los botones. Tirarlo acá era la
    // causa del "Obra: falta — ¿a qué obra va?" que no decía nada, con 126 cargas de ese proveedor
    // ya contadas dos líneas más arriba.
    //
    // El RUBRO viaja aunque no se pregunte nunca: es la línea del Cash Flow donde va a caer esta
    // plata, o sea la consecuencia de la imputación que el dueño está por elegir.
    if (sugerencia) it.sugerencia = sugerencia
    if (Object.keys(aplicado).length) it.aprendido = aplicado
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
  // EL RECUENTO ACOMPAÑA A TODAS LAS SALIDAS, incluidas las que fallan antes de leer un byte. La
  // tanda publica UN mensaje sumando lo de varios posts: un post que se va sin `parte` desaparece de
  // ese total, que es el defecto de la rendición otra vez pero un nivel más arriba.
  const conParte = (salida, parte) => ({ ...salida, parte: { ...parteVacia(), recibidos: fileIds.length, ...(parte ?? {}) } })
  if (!fileIds.length) return conParte({ texto: TEXTO.SIN_ADJUNTOS, estado: 'sin_adjuntos' })
  if (fileIds.length > MAX_ADJUNTOS) return conParte({ texto: TEXTO.DEMASIADOS, estado: 'demasiados' }, { avisos: [TEXTO.DEMASIADOS] })

  // 1) ¿Existe el esquema? Antes que nada: sin las tablas no hay idempotencia, y sin idempotencia
  //    esto no se enciende. Cargar sin barrera de duplicados es peor que no cargar.
  if (!await repo.tablasListas(port)) return conParte({ texto: TEXTO.SIN_ESQUEMA, estado: 'sin_esquema' }, { avisos: [TEXTO.SIN_ESQUEMA] })

  // 2) LA PUERTA. Antes de bajar un byte y antes de gastar un token de visión.
  const permitido = await puedeCargarComprobantes({
    port, actor: m.actor ?? {}, channelId: m.channelId, plataforma: m.plataforma ?? 'mattermost',
    mattermost, // segunda vía del permiso: estar en el canal oficial habilita
  })
  if (!permitido.ok) {
    log?.info?.('comprobantes: rechazado en la puerta', { motivo: permitido.motivo, detalle: permitido.detalle })
    return conParte({ texto: permitido.texto, estado: `rechazado_${permitido.motivo}` }, { avisos: [permitido.texto] })
  }

  // 3) Bajar. En serie: son pocos archivos y Mattermost es local; el paralelo acá sólo compra
  //    complejidad y riesgo de rate limit.
  const bajados = []
  const problemas = []
  for (const id of fileIds) {
    const a = await bajarAdjunto(mattermost, id)
    // Los problemas viajan como OBJETOS con su `fileId`, no como renglones ya formateados: el
    // renglón se puede escribir al final, pero aparear un adjunto con su motivo exige el id.
    if (a.ok) bajados.push(a); else problemas.push({ fileId: a.fileId ?? id, nombre: a.nombre, error: a.error })
  }

  // 4) Leer con el modelo. Una llamada por adjunto.
  //    Compras VIVO se lee una sola vez y sirve para dos cosas: el vocabulario de la columna K con el
  //    que se resuelve lo escrito a mano, y el índice contra el que se busca el duplicado.
  const [listasVivas, indiceCompras] = await Promise.all([
    listas(),
    typeof comprasDe === 'function' ? comprasDe().catch(() => null) : Promise.resolve(null),
  ])
  const vocabulario = {
    ...listasVivas,
    // ═══ LA OBRA SALE DEL DESPLEGABLE Y, SI NO SE PUDO LEER, DE LA COLUMNA J VIVA (05/08) ═══
    obras: obrasCanonicas(listasVivas?.obras, indiceCompras),
    detalles: indiceCompras?.detalles ?? {},
    // El vocabulario FIRME de la columna K —lo que cada obra ya usó más de una vez— es con lo que se
    // imputa solo. La lista completa sigue siendo la que se ofrece en el menú.
    detallesFirmes: detallesFirmes(indiceCompras?.usosDeDetalle ?? {}),
  }
  const items = []
  for (const a of bajados) {
    // EL VOCABULARIO VIAJA A LA LECTURA. El modelo mira la foto CON las listas de las tres columnas
    // delante: es la misma información que tiene una persona cuando decide a qué obra va el gasto.
    // Sin esto transcribía "HW DX 2018" y ahí terminaba — nadie sabe que eso es un vehículo si no le
    // dijiste que existe una obra "Vehiculos / Maquinas".
    const r = await leer(a, vocabulario)
    if (!r?.ok) { problemas.push({ fileId: a.fileId, nombre: a.nombre, error: r?.error ?? 'no pude leerlo' }); continue }
    // El texto del post vale para TODOS sus adjuntos: mandar cinco fotos con un solo "ARCOR" arriba
    // es la forma en que se manda un fajo de una misma obra.
    // `ahora` es el momento en que llegó la foto, y es el reloj contra el que se juzga si la fecha
    // del comprobante puede ser cierta. Va con el ítem, no se toma al renderizar.
    items.push(armarItem({ lectura: r.crudo, adjunto: a, listas: vocabulario, textoPost: m.texto ?? null, ahora: m.ahora ?? new Date() }))
  }
  if (!items.length) {
    const rend = rendicionDeAdjuntos({ fileIds, items: [], problemas })
    return {
      texto: [TEXTO.NADA_LEGIBLE, '', textoRendicion(rend)].join('\n'),
      estado: 'ilegible',
      parte: parteDeRendicion(rend, { seCargaron: false }),
    }
  }

  // 5) ARCA, ANTES de colapsar: corrige el número mal leído, que es justo con lo que se deduplica.
  await conciliarItems(items, arcaDe)

  // 6) ¿Ya estaban cargados? En el registro del chat Y en la pestaña Compras VIVA: el comprobante
  //    pudo haber entrado por Claude Code o a mano, que es exactamente lo que pasó.
  //    ESTO CORRE SIEMPRE, con ARCA o sin ARCA. Que un tique no esté en el Libro IVA no dice nada
  //    sobre si ya está cargado; es justo cuando más falta hace mirar el destino.
  //
  // ═══ VA ANTES DEL COLAPSO, Y ESE ORDEN ES EL ARREGLO (14/08) ═══
  //
  // Cuando dos fotos del mismo papel se leen distinto, hay que elegir CUÁL de las dos lecturas se
  // queda, y esa elección se toma con la evidencia sobre la mesa: cuál de las dos ya está en Compras,
  // y cuál tiene un total cien veces más grande que todo lo que ese proveedor facturó nunca
  // (`escala`). Colapsando primero, esa evidencia todavía no existía y se quedaba la que llegó
  // primero — que en la tanda real del 13/08 fue la que decía $220.540.034.
  await marcarYaCargados(port, items, repo)
  marcarEnCompras(items, indiceCompras)

  // 7) Colapsar los repetidos del propio envío (la misma factura fotografiada dos veces) y quedarse
  //    con la MEJOR lectura de cada papel. Ver `mejor-lectura.mjs`.
  let { items: unicos } = colapsarRepetidos(items, { ahora: m.ahora ?? undefined })
  // Lo que la pestaña desmintió se BORRA del registro, no se ignora una vez: si quedara, la próxima
  // foto del mismo comprobante volvería a chocar contra el mismo fantasma.
  await olvidarObsoletos(port, unicos, repo)

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
    // ═══ EL FAJO SE CIERRA; EL GASTO NO SE TIRA (05/08) ═══
    //
    // Antes acá decía "el mensaje viejo queda como quedó" y el fajo se cerraba DESCARTADO con sus
    // ítems adentro. Eso no dejaba el mensaje viejo: borraba el gasto. Medido en producción sobre
    // los primeros quince fajos: OCHO terminaron `descartado` con `error='vencido por ventana'` y
    // CERO filas, y entre ellos DUPEC 00009-00003204 por $469.564,70 y Corralon Progreso
    // 0004-00036542 por $62.000. Nadie se enteró: el bot preguntaba algo, la persona tardaba más de
    // cinco minutos, mandaba la foto siguiente, y con ella el comprobante anterior desaparecía.
    //
    // La ventana decide UNA sola cosa —si este post se agrupa con el anterior— y esa decisión sigue
    // igual: se abre un fajo nuevo. Lo que no se puede derivar de ella es tirar lo que quedó
    // pendiente. El índice único parcial obliga a que haya un solo fajo abierto por (persona,
    // canal), así que la única forma de no perder nada es que los pendientes SE MUDEN al fajo nuevo.
    //
    // Se mudan sólo los que siguen pendiendo de una respuesta: lo ya cargado no vuelve (`yaCargado`
    // marca lo que se encontró en Compras o en el registro) y `colapsarRepetidos` evita que el mismo
    // comprobante se duplique al mudarse. Los viejos van PRIMERO porque son los que llevan más
    // tiempo esperando.
    if (abierto) {
      const mudados = (abierto.items ?? []).filter((it) => it && !it.yaCargado)
      if (mudados.length) unicos = colapsarRepetidos([...mudados, ...unicos]).items
      await repo.cerrarFajo(port, {
        id: abierto.id,
        estado: ESTADO.DESCARTADO,
        error: mudados.length ? `reemplazado: ${mudados.length} pendiente(s) mudados al fajo nuevo` : 'vencido por ventana',
      })
      // Y EL MENSAJE VIEJO NO PUEDE QUEDAR CON BOTONES MUERTOS. Apretarlos ahora contesta
      // "ya cerrado", que le dice a la persona que su comprobante se perdió justo cuando NO se
      // perdió. Se reescribe para que apunte al mensaje nuevo. Que no se pueda reescribir no
      // cambia nada de lo importante: el gasto ya viajó.
      if (mudados.length) await avisarQueSeMudo(mattermost, abierto, mudados.length, log)
    }
    fajo = await repo.abrirFajo(port, nuevoFajo(m, unicos))
  }
  if (!fajo) return conParte({ texto: 'No pude abrir la carga. Probá de nuevo en un minuto.', estado: 'error' }, { avisos: ['No pude abrir la carga. Mandalos de nuevo en un minuto.'] })

  // ═══ 9) LA RENDICIÓN DE CUENTAS DE ESTE POST (05/08) ═══
  //
  // Se calcula ANTES de cargar y sobre `fileIds` —lo que ENTRÓ—, no sobre lo que sobrevivió. Es la
  // única forma de que un adjunto que se cae por un camino nuevo aparezca igual en el mensaje. Los
  // ítems se filtran a los de ESTE post: el fajo puede traer pendientes mudados de uno anterior, y
  // rendir cuenta de ellos acá diría que llegaron fotos que nadie mandó.
  const rendicion = rendicionDeAdjuntos({ fileIds, items: (fajo.items ?? []).filter(deEstePost(fileIds)), problemas })
  if (!rendicion.cuadra) {
    log?.error?.('comprobantes: hay adjuntos sin destino', {
      post: m.postId, fajo: fajo.id, total: rendicion.total, cuenta: rendicion.cuenta,
    })
  }
  // 10) SE CARGA SOLO. Ver `cargarSolo`. Le viaja la rendición ENTERA y no su texto: allá se sabe si
  //     la escritura ocurrió de verdad, y sólo entonces el renglón puede hablar en pasado.
  const solo = await cargarSolo(d, fajo, repo, rendicion)
  if (solo) return solo

  const msg = mensajeFajo(fajo, { url })
  return {
    texto: msg.texto + ['', textoRendicion(rendicion)].join('\n'),
    attachments: msg.attachments,
    estado: 'confirmar',
    fajoId: fajo.id,
    // Nada se escribió: lo que estaba listo queda trabado y se NOMBRA. Sin `seCargaron` la rendición
    // diría «listo» sobre un gasto que no entró a ningún lado.
    parte: parteDeRendicion(rendicion, { seCargaron: false }),
  }
}

/** ¿Este ítem entró con alguna de las fotos de ESTE post? Por `origen` o por cualquiera de sus copias. */
function deEstePost(fileIds = []) {
  const set = new Set(fileIds.map(String))
  return (it) => set.has(String(it?.origen?.fileId)) || (it?.copias ?? []).some((c) => set.has(String(c?.fileId)))
}

/**
 * LAS OBRAS CANÓNICAS: el desplegable estricto MANDA, la columna J viva lo respalda.
 *
 * ═══ EL DEFECTO (05/08) ═══
 *
 * En la columna J se escribió «Estrella» donde el desplegable dice «LA ESTRELLA». Un valor que no
 * está en el desplegable deja la celda EN ROJO y rompe los cruces de Proveedores y Cash Flow — y,
 * peor, parte la obra en dos: los reportes suman «LA ESTRELLA» por un lado y «Estrella» por el otro,
 * y el margen de la obra deja de existir sin que nada falle.
 *
 * La lista del desplegable se lee pidiendo la METADATA de validación de un rango chico, y esa
 * llamada puede volver vacía sin que nada explote. Con la lista vacía `matchUnico` no puede afirmar
 * nada y la obra se pierde. Pero la columna J tiene 293 filas escritas por el dueño: ahí está el
 * valor canónico REAL, y sale de la MISMA lectura que ya se hace para buscar el duplicado.
 *
 * ═══ EL ORDEN, QUE ES TODA LA REGLA ═══
 *
 * 1. Primero el DESPLEGABLE: es lo único que la celda acepta sin quedar en rojo.
 * 2. Después, de las obras FIRMES de la columna J, sólo las que el desplegable **no puede
 *    representar** — o sea las que `matchUnico` no resuelve contra él. Si la J dice «Estrella» y el
 *    desplegable dice «LA ESTRELLA», no se agrega una rival: se deja que el matcheo la resuelva.
 *    Sin esta condición, el error de ayer se convertiría en la segunda opción de mañana y la
 *    anotación «Estrella» pasaría a ser AMBIGUA — que es como se apaga un arreglo con su propio
 *    resultado.
 * 3. Y si el desplegable no se pudo leer, las firmes de la columna J son toda la lista.
 */
export function obrasCanonicas(delDesplegable = [], indice = null) {
  const base = (delDesplegable ?? []).map((o) => String(o).trim()).filter(Boolean)
  const firmes = obrasFirmes(indice?.usosDeObra ?? {})
  if (!base.length) return firmes
  const ya = new Set(base)
  const extra = firmes.filter((o) => !ya.has(o) && !matchUnico(o, base))
  return [...base, ...extra]
}

/**
 * ¿La imputación que no se pudo deducir se PREGUNTA, o se carga con la celda vacía y se declara?
 *
 * ═══ LA DECISIÓN DEL DUEÑO (13/08) ═══
 *
 * Textual: «no quiero q pregunte nada, quiero q el mismo mecanismo de carga por esta via sea el q se
 * usa por la via de mattermost». El cargador que corre Claude Code nunca preguntó nada: escribe la
 * fila con Categoría, Unidad, Obra y Detalle vacías y el dueño las completa en el Sheet. El bot, en
 * cambio, frenaba en un menú apenas alguna de esas cuatro columnas quedara sin resolver — y como las
 * cuatro tienen desplegable, eso era CASI SIEMPRE. Ésa era la falencia: dos caras del mismo motor con
 * dos umbrales distintos para escribir la misma fila.
 *
 * ═══ Y POR QUÉ ESTO NO REVIVE LO QUE ÉL YA RECHAZÓ EL 04/08 ═══
 *
 * El 04/08 rechazó cargar con la imputación vacía **y avisar en genérico**: «completalas vos en
 * Compras» no le dice cuáles ni dónde, así que no las completa nadie. Lo que cambia ahora no es que
 * se cargue: es que el aviso nombra CADA fila y CADA columna que quedó en blanco (ver
 * `imputacionVacia` y `textoCargado`). Cargar y declarar es distinto de cargar en silencio.
 *
 * Lo que NO afloja: el proveedor fuera del desplegable, el duplicado PROBABLE y cualquier dato que la
 * visión no pudo leer siguen preguntando, porque ahí no hay celda vacía que completar después — hay
 * un gasto que entraría mal o dos veces. Eso lo decide `estaCompleto`, que no se toca.
 *
 * Se puede volver atrás sin desplegar: `ORQ_COMPROBANTES_PREGUNTAR_IMPUTACION=1`.
 */
export const PREGUNTAR_IMPUTACION = String(process.env.ORQ_COMPROBANTES_PREGUNTAR_IMPUTACION ?? '') === '1'

/**
 * MANDAR LA FOTO ES EL PEDIDO — no hay que confirmar nada. (04/08, decisión del dueño)
 *
 * Antes toda foto paraba en un mensaje con botones esperando un Confirmar. Con un fajo de veinte
 * comprobantes eso son veinte clicks, y cada uno es una oportunidad de que el flujo se abandone a
 * mitad: el gasto queda sin cargar en ningún lado, que es el peor resultado posible. El pedido del
 * dueño es explícito: "mandar una foto y que se cargue perfecto sin fallas", igual que cuando la
 * pasa por Claude Code, donde nunca hubo un paso de confirmación.
 *
 * SE CARGA SOLO CUANDO NO HAY NADA QUE PREGUNTAR. `estaCompleto` es exactamente esa condición y ya
 * existía: proveedor conocido, total, fecha, número, y ningún duplicado probable sin contestar. Lo
 * que le falta a un comprobante para ser cargable no cambió — cambió que, cuando no le falta nada,
 * no se le hace perder el tiempo a nadie.
 *
 * LO QUE SIGUE PREGUNTANDO, y tiene que seguir haciéndolo: un proveedor que no está en el
 * desplegable (lo agrega una persona), un PROBABLE duplicado (cargarlo o descartarlo solo son las
 * dos salidas caras), y cualquier dato que la visión no pudo leer. Ahí el mensaje con botones
 * aparece igual que siempre.
 *
 * LA OBRA NO BLOQUEA, y esto no lo cambia: se sigue resolviendo por lo escrito a mano y por la
 * historia de Compras, y si no se puede, la fila entra SIN obra y el mensaje lo dice con la fila
 * para completarla. Adivinar la obra por el proveedor sería fabricar imputación contable.
 *
 * @returns {Promise<object|null>} la respuesta ya cargada, o null si hay que preguntar algo
 */
async function cargarSolo(d, fajo, repo, rendicion = null) {
  const { port, escribir } = d
  if (typeof escribir !== 'function') return null      // sin escritor inyectado: el flujo viejo
  const items = fajo?.items ?? []

  // ═══ UN COMPROBANTE QUE NO SE PUEDE CARGAR NO PUEDE FRENAR A LOS OTROS ONCE (13/08) ═══
  //
  // Acá decía `items.every(estaCompleto)`: con una sola foto ilegible en una tanda de doce, las once
  // buenas se quedaban esperando un click. En una carga fuerte —que es lo que el dueño va a hacer—
  // esa es la diferencia entre cargar todo y no cargar nada. Se cargan las que están listas y las que
  // de verdad necesitan una respuesta se mudan a un fajo nuevo con sus botones.
  const listos = items.filter((it) => estaCompleto(it))
  const trabados = items.filter((it) => !estaCompleto(it))
  if (!listos.length) return null

  // La política vieja, apagada por defecto desde el 13/08. Ver `PREGUNTAR_IMPUTACION`.
  if (PREGUNTAR_IMPUTACION && listos.some((it) => imputacionPendiente(it).length)) return null

  // COMPARE-AND-SET igual que el botón. No es ceremonia: dos posts casi simultáneos de la misma
  // persona pueden llegar acá con el mismo fajo, y el que pierde tiene que no escribir nada.
  const tomado = await repo.tomarParaConfirmar(port, { id: fajo.id })
  if (!tomado) return null

  let r
  try {
    r = await escribir(tomado)
  } catch (e) {
    // La escritura no puede tumbar el post. Se reabre el fajo para poder reintentar y se dice.
    await repo.reabrirFajo(port, { id: fajo.id, error: String(e?.message ?? e).slice(0, 200) }).catch(() => {})
    d.log?.error?.('comprobantes: la carga automática falló', { fajo: fajo.id, error: String(e?.message ?? e) })
    return {
      texto: `No pude cargarlo: ${String(e?.message ?? e).slice(0, 200)}.`,
      estado: 'error',
      fajoId: fajo.id,
      parte: sumarPartes(parteDeRendicion(rendicion, { seCargaron: false }), {
        avisos: [`No pude cargar: ${String(e?.message ?? e).slice(0, 160)}.`],
      }),
    }
  }

  // LA RENDICIÓN VIAJA TAMBIÉN EN EL CAMINO QUE CARGA SOLO. Es justo donde más falta hace: acá no
  // hay botones ni tabla que revisar, y el único renglón contra el que el dueño puede comparar
  // cuántas fotos mandó es éste.
  //
  // Habla en pasado SÓLO si la escritura ocurrió. `escribirFajo` también devuelve `encolado` (freno
  // de mano puesto) y `error` sin lanzar: decir «2 cargados ahora» arriba de «no cargué nada» sería
  // el mensaje contradiciéndose a sí mismo en dos renglones seguidos.
  const estado = r?.estado ?? ESTADO.CARGADO
  const cola = rendicion ? `\n\n${textoRendicion(rendicion, { seCargaron: estado === ESTADO.CARGADO })}` : ''
  const tanda = estado === ESTADO.CARGADO ? await textoAcumulado(port, repo, fajo, (r?.filas ?? []).length) : ''
  // EL RECUENTO. La rendición cuenta los adjuntos (lo que ya estaba, lo ilegible, las copias) y la
  // escritura cuenta las filas y la plata. Se suman una sola vez y con `seCargaron` puesto en lo que
  // de verdad pasó: si la escritura no ocurrió, lo que estaba «listo» pasa a trabado y se nombra.
  const parte = sumarPartes(
    parteDeRendicion(rendicion, { seCargaron: estado === ESTADO.CARGADO }),
    parteDeEscritura(estado === ESTADO.CARGADO ? r : { ...r, filas: [], suma: 0 }))

  // ═══ LO QUE QUEDÓ TRABADO SE MUDA A UN FAJO NUEVO, CON SUS BOTONES ═══
  //
  // Sólo cuando la escritura CERRÓ el fajo. Si falló, `escribirFajo` ya lo reabrió con su error: abrir
  // otro chocaría contra el índice único parcial (un solo fajo abierto por persona y canal) y
  // devolvería el mismo, duplicando los ítems trabados dentro de él.
  if (trabados.length && (estado === ESTADO.CARGADO || estado === ESTADO.ENCOLADO)) {
    const nuevo = await repo.abrirFajo(port, {
      plataforma: fajo.plataforma ?? 'mattermost',
      userId: fajo.plataforma_user_id,
      username: fajo.plataforma_username ?? null,
      channelId: fajo.channel_id,
      rootPostId: fajo.root_post_id ?? null,
      postId: (fajo.post_ids ?? [])[0] ?? null,
      items: trabados,
    }).catch(() => null)
    if (nuevo) {
      const msg = mensajeFajo(nuevo, { url: d.url })
      const encabezado = trabados.length === 1
        ? '\n\n⚠ Uno no lo pude cargar solo — necesito que me contestes esto:'
        : `\n\n⚠ ${trabados.length} no los pude cargar solos — necesito que me contestes esto:`
      return {
        texto: (r?.texto ?? '✔ Cargado.') + tanda + cola + encabezado + '\n' + msg.texto + arrastrados(trabados, rendicion),
        attachments: msg.attachments,
        estado,
        fajoId: nuevo.id,
        parte,
      }
    }
  }
  return { texto: (r?.texto ?? '✔ Cargado.') + tanda + cola, estado, fajoId: fajo.id, parte }
}

/**
 * LOS QUE VIENEN ARRASTRADOS DE ANTES — «2 de estos vienen de tandas anteriores».
 *
 * ═══ POR QUÉ (14/08) ═══
 *
 * Un comprobante que queda pendiente se MUDA al fajo siguiente y sigue esperando. La rendición de
 * cada post cuenta sólo los adjuntos de ESE post, así que un pendiente que viene de hace tres tandas
 * no aparece en ningún renglón que lo nombre: existe, ocupa lugar y es invisible. Es lo que pasó con
 * los siete del 05/08, que estuvieron una semana dando vueltas, y con los nueve del fajo abierto del
 * 14/08 — el dueño no tenía forma de saber que estaban ahí.
 *
 * Se nombran POR SU CONTENIDO, igual que todo lo demás (ver `identidad.mjs`).
 */
function arrastrados(trabados = [], rendicion = null) {
  const deEsteEnvio = new Set((rendicion?.porAdjunto ?? []).map((a) => String(a.fileId)))
  const viejos = trabados.filter((it) => {
    const ids = [it?.origen?.fileId, ...(it?.copias ?? []).map((c) => c?.fileId)].filter(Boolean).map(String)
    return ids.length > 0 && !ids.some((id) => deEsteEnvio.has(id))
  })
  if (!viejos.length) return ''
  const l = [viejos.length === 1
    ? '\n_Uno de éstos viene de una tanda anterior:_'
    : `\n_${viejos.length} de éstos vienen de tandas anteriores:_`]
  for (const it of viejos.slice(0, 8)) {
    const falta = rotulosDe(it)
    l.push(`· ${identificar(it).texto ?? 'un comprobante que no pude leer'} — falta ${falta.join(' y ') || 'un dato'}`)
  }
  return `\n${l.join('\n')}`
}

/**
 * EL RENGLÓN DEL ACUMULADO — «llevás 23 comprobantes por $4.128.900 en esta tanda».
 *
 * Sólo aparece cuando la tanda es MÁS GRANDE que este post: si el número fuera igual al que acaba de
 * decir el renglón de arriba, sería el mismo dato dos veces, y un mensaje que se repite se deja de
 * leer. Con treinta fotos —que son tres o cuatro posts, porque Mattermost limita los adjuntos— es el
 * único número contra el que el dueño puede comparar el fajo de papeles que tiene en la mano.
 *
 * Nunca lanza y nunca bloquea: es informativo. Si el repositorio no sabe contestarlo (el doble en
 * memoria de los tests, una base que no responde) devuelve cadena vacía y el mensaje sale igual.
 */
async function textoAcumulado(port, repo, fajo, cuantasAhora = 0) {
  if (typeof repo?.acumuladoDeLaTanda !== 'function') return ''
  const t = await repo.acumuladoDeLaTanda(port, {
    plataforma: fajo?.plataforma ?? 'mattermost',
    userId: fajo?.plataforma_user_id,
    channelId: fajo?.channel_id,
  }).catch(() => null)
  if (!t || !(t.cuantos > Math.max(1, cuantasAhora))) return ''
  const plata = t.suma ? ` por **$${Math.round(t.suma).toLocaleString('es-AR')}**` : ''
  return `\n\n📊 **En esta tanda llevás ${t.cuantos} comprobantes${plata}.** (última hora, este canal)`
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

/**
 * Reescribe el aviso del fajo que se cerró para decir que lo pendiente se mudó, y le saca los
 * botones.
 *
 * NO LANZA NUNCA: llega después de que los ítems ya viajaron. Que Mattermost no conteste deja un
 * mensaje viejo con botones que contestan "ya cerrado" —molesto—, pero el gasto está a salvo en el
 * fajo nuevo. Tumbar la carga por no poder editar un mensaje sería cambiar lo barato por lo caro.
 */
export async function avisarQueSeMudo(mattermost, fajo, cuantos = 0, log) {
  const id = fajo?.aviso_post_id
  if (!id || typeof mattermost?.actualizarPost !== 'function') return false
  const que = cuantos === 1 ? 'El comprobante que quedaba pendiente acá sigue' : `Los ${cuantos} comprobantes que quedaban pendientes acá siguen`
  try {
    await mattermost.actualizarPost({
      id,
      message: `⤴ ${que} sin cargar y **no se perdieron**: los pasé al mensaje de abajo, contestame ahí.`,
      props: { attachments: [] },
    })
    return true
  } catch (e) {
    log?.warn?.('comprobantes: no pude reescribir el aviso del fajo mudado', { detalle: String(e?.message ?? e).slice(0, 200) })
    return false
  }
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

/**
 * Borra del registro las claves que la pestaña VIVA desmintió (`registroObsoleto`).
 *
 * Sólo se llama después de haber podido LEER Compras: sin esa lectura no hay desmentido, hay
 * ignorancia. Que falle el borrado no puede tumbar la carga — el ítem ya está desmarcado en memoria
 * y se va a cargar igual; lo único que se pierde es la limpieza.
 */
export async function olvidarObsoletos(port, items = [], repo = repoReal) {
  const claves = items.map((it) => it?.registroObsoleto?.clave).filter(Boolean)
  if (!claves.length || typeof repo.olvidarCargados !== 'function') return 0
  try { return await repo.olvidarCargados(port, claves) } catch { return 0 }
}

/** Cuánto pueden diferir dos importes y seguir siendo el mismo comprobante. Arriba de esto, no lo son. */
export const TOLERANCIA_IMPORTE = 0.5

/**
 * Le cuelga a cada ítem el `yaCargado` que corresponda. Muta los ítems a propósito: son de acá.
 *
 * ═══ EL MISMO NÚMERO CON OTRO IMPORTE NO ES EL MISMO COMPROBANTE (14/08) ═══
 *
 * Medido en la pestaña viva: `Con-Sec 00003-00004295` aparece TRES veces, con fechas e importes
 * distintos ($1.191.294,61 · $436.294,54 · $72.410,03); `MASS CONSULTORA 0001-00000025`, dos veces.
 * Con la clave sola, el segundo y el tercero se rechazaban con un mensaje de ÉXITO —«ya estaban
 * cargados, no los dupliqué»— y el gasto no entraba a ningún lado. Es el peor resultado posible: el
 * dueño no tiene forma de enterarse de que le falta plata en Compras.
 *
 * El registro guarda el importe con el que se cargó. Cuando el que se está leyendo difiere, la clave
 * no alcanza para afirmar que es el mismo papel, y la afirmación se suspende: el ítem sigue vivo y
 * **decide la pestaña Compras**, que es el destino y la única evidencia real (`marcarEnCompras`
 * contesta CARGADO si el importe cierra, y PROBABLE —o sea, pregunta— si no).
 *
 * FAIL-CLOSED: si Compras NO se pudo leer, no hay quién decida y el registro vuelve a mandar. Se
 * repone en `marcarEnCompras`. Levantar el freno sin nadie mirando el destino es como se duplica un
 * gasto, y eso cuesta más que preguntar de más.
 */
export async function marcarYaCargados(port, items = [], repo = repoReal) {
  const mapa = await repo.yaCargados(port, items.map((i) => i.clave))
  for (const it of items) {
    const y = it.clave ? mapa.get(it.clave) : null
    if (!y) continue
    const marca = { fila: y.fila, hoja: y.hoja, post_id: y.post_id, creado_at: y.creado_at, fuente: 'registro', total: y.total ?? null }
    const leido = it.comprobante?.total
    const difiere = y.total != null && typeof leido === 'number' && Number.isFinite(leido)
      && Math.abs(Math.abs(y.total) - Math.abs(leido)) > TOLERANCIA_IMPORTE
    if (difiere) {
      // No se marca como cargado: se DECLARA la discrepancia, con los dos importes, para que el
      // mensaje pueda decir contra qué fila coincidió y con qué dato no.
      it.registroOtroImporte = { fila: y.fila ?? null, clave: it.clave, total: y.total, leido, numero: y.numero ?? null }
      continue
    }
    it.yaCargado = marca
  }
  return items
}
