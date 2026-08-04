// DEL ARCHIVO SOLTADO EN EL CHAT A ALGO QUE EL OS ENTIENDE — el flujo entero, sin una línea de SQL.
//
// ═══ EL PEDIDO, TEXTUAL ═══
//
// «crea la capacidad de recibir cualquier tipo de archivo de cualquier formato por acá porque es algo
// que ya hacías bien». El caso que lo destapó: el dueño subió el CSV del extracto bancario al bot, el
// bot no lo procesó, y el CSV terminó bajándose a mano desde la API de Mattermost.
//
// ═══ EL ORDEN, Y POR QUÉ ES ÉSTE ═══
//
//   1. ¿está aplicada la migración?  → si no, se dice; no se revienta.
//   2. la METADATA antes que los BYTES → un archivo de 200 MB se rechaza sin bajarlo.
//   3. bajar                          → un archivo que no se puede bajar no tumba a los otros tres.
//   4. DETECTAR EL FORMATO REAL       → por los bytes. El nombre lo escribe quien sube.
//   5. derivar según lo que ES:
//        imagen   → el camino de comprobantes, que ya existe y no se toca
//        planilla → ¿es un extracto? se lo pregunta al motor que ya existe (banco-importar)
//        pdf      → texto extraído localmente (0 API), y se dice qué se encontró
//        otro     → se guarda, se dice qué es y cuánto pesa, y se declara que no se sabe qué hacer
//   6. PREVISUALIZAR SIEMPRE, APLICAR NUNCA. Importar movimientos cambia el saldo de CAJA: es efecto
//      económico y lo autoriza una persona, con un botón, después de ver qué se leyó.
//
// TODO ENTRA INYECTADO (`port`, `mattermost`, `repo`, `leerPdf`) porque así este archivo se prueba
// completo con dobles: un Mattermost falso que devuelve bytes conocidos, un repositorio en memoria, y
// se verifica el mensaje que sale. Si armara sus propias dependencias, probarlo exigiría Postgres,
// Mattermost y una VM — o sea, no se probaría.
//
// NO LLAMA A NINGÚN MODELO, y eso no es una casualidad: detectar un formato, parsear un extracto y
// extraer el texto de un PDF son operaciones determinísticas. Un test recorre el árbol de imports de
// este archivo y se pone rojo si alguna vez alcanza al cliente de Anthropic.

import { detectarFormato, FAMILIA, MAX_BYTES, MAX_ARCHIVOS, tamanoLegible } from '../../lib/archivos/deteccion.mjs'
import { leerPlanilla, filasDeTexto, filasATexto, pareceExtractoBancario } from '../../lib/archivos/planilla.mjs'
import { bloqueArchivo, previsualizacionBanco, botonesBanco, AVISO_CONFIRMACION, TEXTO } from '../../lib/archivos/mensaje.mjs'
import { novedades } from '../../lib/banco-importar.mjs'
import * as repoReal from './repositorio.mjs'

export { TEXTO }

/** Cuántos caracteres de un texto o un PDF se muestran. Suficiente para reconocerlo, no para inundar. */
export const MAX_MUESTRA = 1200

/** Destinos posibles de un archivo. `ninguno` es un destino legítimo y se dice en voz alta. */
export const DESTINO = Object.freeze({
  COMPROBANTES: 'comprobantes',
  BANCO: 'banco',
  PDF: 'pdf',
  TEXTO: 'texto',
  PLANILLA: 'planilla',
  NINGUNO: 'ninguno',
})

/**
 * Baja un archivo de Mattermost. Devuelve `{ok:false, error}` en vez de lanzar.
 *
 * PIDE LA METADATA PRIMERO. `archivoInfo` cuesta un GET de 200 bytes y dice el tamaño: preguntar
 * antes evita traerse 200 MB al worker para después decir que no se podían leer. Es la misma
 * secuencia que ya usa `comprobantes/flujo.mjs`, por la misma razón.
 */
export async function bajarArchivo(mattermost, fileId) {
  if (typeof mattermost?.archivo !== 'function') {
    return { ok: false, fileId, nombre: fileId, error: TEXTO.SIN_CLIENTE }
  }
  let info = null
  try {
    info = typeof mattermost.archivoInfo === 'function' ? await mattermost.archivoInfo(fileId) : null
  } catch (e) {
    return { ok: false, fileId, nombre: fileId, error: `no pude consultar el archivo: ${corto(e)}` }
  }
  const nombre = info?.name ?? fileId
  const tamano = Number(info?.size ?? 0)
  const mimeDeclarado = String(info?.mime_type ?? '').split(';')[0].trim().toLowerCase() || null
  if (tamano > MAX_BYTES) {
    return {
      ok: false, fileId, nombre, tamano, mimeDeclarado,
      error: `pesa ${tamanoLegible(tamano)} y mi techo es ${tamanoLegible(MAX_BYTES)}: no lo bajé. Mandámelo partido o más liviano.`,
    }
  }
  try {
    const buf = await mattermost.archivo(fileId)
    const bytes = Buffer.isBuffer(buf) ? buf : Buffer.from(buf ?? [])
    // El tamaño REAL es el de los bytes que llegaron. Si la metadata decía otra cosa, manda lo que
    // se bajó: es lo único que se puede leer.
    return { ok: true, fileId, nombre, tamano: bytes.length || tamano, mimeDeclarado, bytes }
  } catch (e) {
    return { ok: false, fileId, nombre, tamano, mimeDeclarado, error: `no pude bajar el archivo: ${corto(e)}` }
  }
}

const corto = (e) => String(e?.message ?? e).slice(0, 140)

/** Extrae el texto de un PDF LOCALMENTE (0 API: el PDF no se le manda a ningún modelo). */
async function textoDePdfReal(bytes, { maxChars = 20000 } = {}) {
  const { PDFParse } = await import('pdf-parse')
  const parser = new PDFParse({ data: new Uint8Array(bytes) })
  try {
    const r = await parser.getText()
    const text = String(r.text ?? '')
    return {
      paginas: r.total ?? null,
      caracteres: text.length,
      texto: text.slice(0, maxChars),
      truncado: text.length > maxChars,
      // Un PDF escaneado es una imagen adentro de un PDF: no tiene texto. Se declara en vez de
      // devolver dos líneas de basura como si fueran el contenido.
      escaneado: text.trim().length < 40,
    }
  } finally {
    try { await parser.destroy() } catch { /* noop */ }
  }
}

/**
 * Qué es este archivo y qué se pudo leer de él. NO escribe nada en ningún lado.
 *
 * @param {{ok:boolean, fileId:string, nombre:string, bytes?:Buffer, tamano?:number, mimeDeclarado?:string, error?:string}} d
 * @param {{leerPdf?:Function}} [dep]
 */
export async function leerArchivo(d, { leerPdf = textoDePdfReal } = {}) {
  if (!d?.ok) {
    return {
      fileId: d?.fileId ?? null, nombre: d?.nombre ?? d?.fileId ?? '(sin nombre)', tamano: d?.tamano ?? 0,
      familia: FAMILIA.OTRO, formato: null, mime: d?.mimeDeclarado ?? null, discrepancia: null,
      destino: DESTINO.NINGUNO, error: d?.error ?? 'no pude leer el archivo',
    }
  }
  const f = detectarFormato({
    bytes: d.bytes, nombre: d.nombre, mimeDeclarado: d.mimeDeclarado, tamano: d.tamano,
  })
  const base = {
    fileId: d.fileId, nombre: f.nombre || d.fileId, tamano: f.tamano, familia: f.familia,
    formato: f.formato, mime: f.mime, mimeDeclarado: d.mimeDeclarado ?? null,
    discrepancia: f.discrepancia, motivo: f.motivo, error: null,
  }

  if (f.familia === FAMILIA.IMAGEN) {
    // NO SE LEE ACÁ. Las imágenes tienen su camino entero construido (foto → visión → fila de
    // Compras con botones de obra) y ese camino no se toca: se deriva.
    return { ...base, destino: DESTINO.COMPROBANTES }
  }

  if (f.familia === FAMILIA.PDF) {
    try {
      const r = await leerPdf(d.bytes)
      return {
        ...base,
        destino: DESTINO.PDF,
        resumen: {
          paginas: r.paginas, caracteres: r.caracteres, escaneado: r.escaneado, truncado: r.truncado,
          texto: r.texto ?? '',
          extracto: r.escaneado ? null : muestra(r.texto ?? ''),
        },
      }
    } catch (e) {
      return { ...base, destino: DESTINO.NINGUNO, error: `es un PDF pero no pude extraer su texto: ${corto(e)}` }
    }
  }

  if (f.familia === FAMILIA.PLANILLA) return leerComoPlanilla(base, d, f)

  if (f.familia === FAMILIA.TEXTO) {
    const texto = d.bytes.toString('utf8')
    // UN TXT TAMBIÉN PUEDE SER UN EXTRACTO: el dueño pega el listado de la banca online en un
    // archivo de texto. Se le pregunta al mismo motor, con el mismo criterio.
    const ex = pareceExtractoBancario(texto)
    if (ex.esExtracto) return { ...base, destino: DESTINO.BANCO, resumen: resumenBanco(ex, texto) }
    return {
      ...base,
      destino: DESTINO.TEXTO,
      resumen: {
        caracteres: texto.length,
        lineas: texto.split('\n').length,
        extracto: muestra(texto),
        esExtracto: false,
        motivoExtracto: ex.motivo,
        texto,
      },
    }
  }

  // VACÍO, ILEGIBLE Y "OTRO" no se adivinan. Se guardan y se declaran.
  return { ...base, destino: DESTINO.NINGUNO }
}

function leerComoPlanilla(base, d, f) {
  const esTextoPlano = f.formato === 'csv' || f.formato === 'tsv'
  const cargar = esTextoPlano
    ? Promise.resolve(planillaDeTexto(d.bytes))
    : leerPlanilla(d.bytes).then((r) => (r.ok
      ? { ok: true, hojas: r.hojas, hoja: r.hoja, filas: r.filas, texto: filasATexto(r.filas) }
      : r))
  return cargar.then((p) => {
    if (!p.ok) return { ...base, destino: DESTINO.NINGUNO, resumen: { error: p.error }, error: p.error }
    const ex = pareceExtractoBancario(p.texto)
    const comun = {
      hojas: p.hojas ?? null, hoja: p.hoja ?? null, filas: p.filas.length,
      encabezado: (p.filas[0] ?? []).map((c) => String(c ?? '').slice(0, 24)).filter(Boolean),
    }
    if (ex.esExtracto) return { ...base, destino: DESTINO.BANCO, resumen: { ...comun, ...resumenBanco(ex, p.texto) } }
    return { ...base, destino: DESTINO.PLANILLA, resumen: { ...comun, esExtracto: false, motivo: ex.motivo, texto: p.texto } }
  })
}

function planillaDeTexto(bytes) {
  const texto = bytes.toString('utf8')
  return { ok: true, hojas: null, hoja: null, filas: filasDeTexto(texto), texto }
}

function resumenBanco(ex, texto) {
  return {
    esExtracto: true,
    movimientos: ex.movimientos,
    rechazos: ex.rechazos,
    cadena: ex.cadena,
    motivo: ex.motivo,
    texto,
  }
}

const muestra = (t) => {
  const s = String(t ?? '').trim()
  return s.length > MAX_MUESTRA ? `${s.slice(0, MAX_MUESTRA)}…` : s
}

/**
 * EL PUNTO DE ENTRADA. Procesa los adjuntos de un post.
 *
 * @param {object} dep
 * @param {{query:Function}} dep.port
 * @param {object} dep.mattermost           cliente con `archivoInfo` y `archivo`
 * @param {string} [dep.url]                URL de callback de los botones (con su secreto)
 * @param {Function} [dep.existentesBanco]  () => movimientos ya cargados, para decir cuántos son nuevos
 * @param {Function} [dep.puedeImportar]    () => {ok, texto} — la puerta, evaluada ANTES de ofrecer el botón
 * @param {Function} [dep.leerPdf]
 * @param {object} [dep.repo]
 * @param {object} [dep.log]
 * @param {{fileIds:string[], texto?:string, actor?:object, channelId?:string, rootPostId?:string,
 *          postId?:string, commEventId?:string}} entrada
 * @returns {Promise<{texto:string, attachments?:Array, estado:string, lecturas:Array, derivar:string|null}>}
 */
export async function procesarArchivos(dep, entrada = {}) {
  const {
    port, mattermost, url = null, existentesBanco = null, puedeImportar = null,
    leerPdf = textoDePdfReal, repo = repoReal, log = null,
  } = dep ?? {}
  const fileIds = Array.isArray(entrada.fileIds) ? entrada.fileIds : []

  if (!fileIds.length) return { texto: TEXTO.SIN_ARCHIVOS, estado: 'sin_archivos', lecturas: [], derivar: null }
  if (fileIds.length > MAX_ARCHIVOS) {
    return { texto: TEXTO.DEMASIADOS(MAX_ARCHIVOS), estado: 'demasiados', lecturas: [], derivar: null }
  }

  // 1) Bajar y leer todo. Un archivo que falla no tumba a los demás: cada uno trae su propio error.
  const lecturas = []
  for (const id of fileIds) {
    const d = await bajarArchivo(mattermost, id)
    lecturas.push(await leerArchivo(d, { leerPdf }))
  }

  // 2) ¿TODO ES IMAGEN? Entonces esto es el camino de comprobantes y no hay nada más que decidir acá.
  //    Se deriva sin escribir nada: el que atiende comprobantes tiene su propia puerta y su propio
  //    registro, y duplicarlos sería crear una segunda verdad de la carga de gastos.
  const imagenes = lecturas.filter((l) => l.destino === DESTINO.COMPROBANTES)
  if (imagenes.length === lecturas.length) {
    return { texto: '', estado: 'derivado', lecturas, derivar: DESTINO.COMPROBANTES }
  }

  // 3) Registrar lo que llegó. Si la migración no está aplicada se sigue igual: describir un archivo
  //    no necesita la tabla — lo único que se pierde es poder confirmar una importación después.
  const hayTablas = await repo.tablasListas(port)
  const bloques = []
  let attachments = null
  let estado = 'descripto'

  for (const l of lecturas) {
    // UNA FOTO EN UN POST MIXTO NO SE DERIVA, Y SE DICE POR QUÉ.
    //
    // La derivación es del POST entero (arriba, cuando todo es imagen): Compras IA abre un fajo con
    // sus botones de obra y se queda con la conversación. Un post con una foto Y un CSV no puede
    // derivarse sin perder la previsualización del CSV, ni procesarse sin perder la foto. Antes esto
    // decía "la derivo a comprobantes" y no la derivaba nadie: una afirmación falsa es peor que la
    // limitación que tapaba.
    if (l.destino === DESTINO.COMPROBANTES) {
      bloques.push(bloqueArchivo({
        ...l,
        nota: 'Las fotos de comprobantes las carga Compras IA: mandámela **sola**, en un mensaje aparte, y la proceso. Junto con otros archivos no la puedo tomar.',
      }))
      continue
    }

    if (l.destino === DESTINO.BANCO) {
      const prev = await previewBanco(l, existentesBanco)
      // LA PUERTA SE PREGUNTA ACÁ, no al apretar. Un botón que existe sólo para contestar "no podés"
      // manda a diagnosticar el lado equivocado. Si no está cableada, no se regala el permiso: se
      // trata como denegado y se dice — fail-closed.
      const puerta = typeof puedeImportar === 'function'
        ? await puedeImportar().catch(() => ({ ok: false, texto: 'No pude verificar si podés cargar movimientos, así que no habilito el botón.' }))
        : { ok: false, texto: 'La carga a la base no está habilitada por este canal.' }
      let fila = null
      if (hayTablas && puerta.ok) {
        fila = await repo.registrar(port, {
          userId: entrada.actor?.plataforma_user_id ?? null,
          username: entrada.actor?.plataforma_username ?? null,
          channelId: entrada.channelId ?? null,
          rootPostId: entrada.rootPostId ?? null,
          postId: entrada.postId ?? null,
          commEventId: entrada.commEventId ?? null,
          fileId: l.fileId, nombre: l.nombre, familia: l.familia, formato: l.formato,
          mimeDeclarado: l.mimeDeclarado, tamano: l.tamano, destino: DESTINO.BANCO,
          // Se guarda LO QUE SE LEYÓ, no el archivo: el botón importa exactamente lo que el dueño
          // vio, aunque el archivo se borre del canal entre la propuesta y el click.
          propuesta: { movimientos: prev.movimientos, rechazos: l.resumen.rechazos, cadena: l.resumen.cadena },
          estado: 'propuesto',
        }).catch((e) => { log?.warn?.('archivos: no pude registrar la propuesta', { detalle: corto(e) }); return null })
      }
      bloques.push([
        `**${l.nombre}** · \`${l.formato}\` · ${tamanoLegible(l.tamano)}${l.discrepancia ? ` ⚠️ ${l.discrepancia}` : ''}`,
        previsualizacionBanco({ ...l.resumen, nuevos: prev.nuevos }),
      ].join('\n'))

      if (fila?.id && url) {
        attachments = botonesBanco({ id: fila.id, url })
        bloques.push(AVISO_CONFIRMACION)
        estado = 'propuesto'
      } else if (!puerta.ok) {
        bloques.push(`_${puerta.texto} Lo de arriba es lo que leí: no cargué nada._`)
      } else {
        bloques.push(hayTablas
          ? '_No pude dejar preparada la importación, así que no hay botón. Lo leído es lo de arriba y no cargué nada._'
          : `_${TEXTO.SIN_ESQUEMA} Leí el extracto y te lo muestro, pero no puedo cargarlo todavía._`)
      }
      continue
    }

    // Todo lo demás: describir con honestidad. Y registrar que llegó, si se puede.
    if (hayTablas) {
      await repo.registrar(port, {
        userId: entrada.actor?.plataforma_user_id ?? null,
        username: entrada.actor?.plataforma_username ?? null,
        channelId: entrada.channelId ?? null,
        rootPostId: entrada.rootPostId ?? null,
        postId: entrada.postId ?? null,
        commEventId: entrada.commEventId ?? null,
        fileId: l.fileId, nombre: l.nombre, familia: l.familia, formato: l.formato,
        mimeDeclarado: l.mimeDeclarado, tamano: l.tamano, destino: l.destino,
        propuesta: null, estado: 'recibido',
      }).catch(() => null)
    }
    bloques.push(bloqueArchivo(l))
  }

  const texto = bloques.join('\n\n')
  // `derivar: null` SIEMPRE en este punto: si se llegó acá es porque NO todo era imagen, y derivar un
  // post mixto tiraría a la basura todo lo que se leyó de los demás archivos.
  return { texto, ...(attachments ? { attachments } : {}), estado, lecturas, derivar: null }
}

/**
 * Cuántos de los movimientos leídos son NUEVOS. Se calcula con `novedades`, la misma función que usa
 * el importador de la terminal: si acá se contara distinto, el número que ve el dueño antes de
 * apretar y el que se carga después serían dos números distintos.
 */
async function previewBanco(l, existentesBanco) {
  const movimientos = l.resumen?.movimientos ?? []
  if (typeof existentesBanco !== 'function') return { movimientos, nuevos: null }
  try {
    const existentes = await existentesBanco()
    return { movimientos, nuevos: novedades(movimientos, existentes ?? []).length }
  } catch {
    // No poder mirar la base no es "no estaba cargado": se omite el número en vez de inventarlo.
    return { movimientos, nuevos: null }
  }
}
