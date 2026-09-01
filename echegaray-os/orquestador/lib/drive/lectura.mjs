// LECTURA DE IDENTIDAD Y ALMACENAMIENTO. No lee CONTENIDO: eso es de los motores.
//
// Todo lo que sale de acá es una referencia de `referencia.mjs` — misma forma siempre — y todo lo
// que falla sale como un `DriveError` con código. Ninguna función devuelve una lista vacía cuando
// lo que pasó es otra cosa: una carpeta en la papelera responde TRASHED, un id inexistente
// responde NOT_FOUND. «No hay nada» y «no pude mirar» son respuestas distintas, y confundirlas ya
// costó seis falsos faltantes en este repo.

import { conDrive, clasificar, argInvalido, noSoportada, enPapelera, CODIGO, DriveError } from './errores.mjs'
import { CAMPOS, PROP_IDEMPOTENCIA, referenciaDe, esCarpeta, MIME_CARPETA } from './referencia.mjs'

/** Conversiones que esta capacidad declara soportadas. Fuera de esta tabla se responde
 *  UNSUPPORTED_OPERATION ANTES de llamar a Google: un 400 de Drive no dice qué se puede. */
export const EXPORTACIONES = Object.freeze({
  'application/vnd.google-apps.spreadsheet': ['application/pdf', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv'],
  'application/vnd.google-apps.document': ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'],
  'application/vnd.google-apps.presentation': ['application/pdf', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  'application/vnd.google-apps.drawing': ['application/pdf', 'image/png', 'image/svg+xml'],
})

/** Alias cortos para no obligar a escribir un MIME a mano. */
export const FORMATOS = Object.freeze({
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  csv: 'text/csv',
  txt: 'text/plain',
  png: 'image/png',
})

export const mimeDeFormato = (f) => FORMATOS[String(f ?? '').toLowerCase()] ?? String(f ?? '')

/** ¿Se puede convertir `mimeOrigen` a `mimeDestino`? Pura: se testea sin red. */
export function conversionSoportada(mimeOrigen, mimeDestino) {
  const destinos = EXPORTACIONES[String(mimeOrigen ?? '')]
  if (!destinos) return false
  return destinos.includes(String(mimeDestino ?? ''))
}

/** Los nativos de Google no tienen bytes propios: `alt=media` les responde 403. */
export const esNativoGoogle = (mime) => String(mime ?? '').startsWith('application/vnd.google-apps.')

const escapar = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'")

export function crearLectura({ google, indice = null, db = null }) {
  if (!google) throw argInvalido('lectura de Drive: falta el cliente Google')

  /** La referencia completa de un archivo por su ID. Incluye `trashed`: no lo esconde. */
  async function referencia(fileId, { displayPath = null } = {}) {
    if (!fileId) throw argInvalido('falta file_id')
    const meta = await conDrive(`el archivo ${fileId}`, () => google.getMeta(fileId, { campos: CAMPOS }))
    const ref = referenciaDe(meta, { displayPath })
    if (!ref) throw new DriveError(CODIGO.NOT_FOUND, `No existe el archivo ${fileId}.`)
    return ref
  }

  /** La referencia de algo que tiene que estar VIVO. Un archivo en la papelera no es un
   *  faltante: es un archivo que alguien mandó a la papelera, y eso se dice. */
  async function referenciaViva(fileId) {
    const ref = await referencia(fileId)
    if (ref.trashed) throw enPapelera(`El archivo "${ref.name}" (${fileId})`, `trashed=true`)
    return ref
  }

  /**
   * EL CONTENIDO DE UNA CARPETA.
   *
   * Devuelve la carpeta como referencia además de sus hijos. Sin eso, «la carpeta está vacía» y
   * «la carpeta que creías que era esa es otra» se ven igual. Si la carpeta está en la papelera
   * NO devuelve `[]`: levanta TRASHED con el motivo.
   */
  async function listarCarpeta(fileId, { tope = 5000 } = {}) {
    const carpeta = await referencia(fileId)
    if (!carpeta.is_folder) throw argInvalido(`${fileId} no es una carpeta (es ${carpeta.mime_type}).`)
    if (carpeta.trashed) throw enPapelera(`La carpeta "${carpeta.name}" (${fileId})`, 'trashed=true')
    const crudos = await conDrive(`la carpeta ${fileId}`, () => google.listarCarpeta(fileId, {
      campos: 'id,name,mimeType,size,modifiedTime,parents,trashed', tope,
    }))
    const items = crudos.map((m) => referenciaDe(m)).filter(Boolean)
    return { carpeta, count: items.length, truncado: items.length >= tope, items }
  }

  /** Resuelve un NOMBRE de carpeta a su referencia. Devuelve todas las coincidencias: que haya
   *  dos carpetas con el mismo nombre es información, no un detalle a esconder. */
  async function buscarCarpetas(nombre, { limite = 10 } = {}) {
    if (!nombre) throw argInvalido('falta el nombre de la carpeta')
    return buscarPorMetadata({ nombreContiene: nombre, mimeType: MIME_CARPETA, limite })
  }

  /** Búsqueda por nombre contra la API de Drive (`name contains`). Es la búsqueda LITERAL:
   *  para «pasame el flujo de fondos» sirve `buscarEnIndice`, que entiende el pedido. */
  async function buscarPorNombre(texto, { limite = 10, mimeType = null, enCarpeta = null } = {}) {
    if (!texto) throw argInvalido('falta el texto a buscar')
    return buscarPorMetadata({ nombreContiene: texto, mimeType, enCarpeta, limite })
  }

  /**
   * Búsqueda por METADATA. Arma el `q` de Drive a partir de criterios tipados en vez de dejar
   * que quien llama concatene una query: una comilla sin escapar en un nombre de cliente
   * («D'Angelo») rompe la consulta y Drive contesta 400 sin decir por qué.
   */
  async function buscarPorMetadata({
    nombreContiene = null, nombreExacto = null, mimeType = null, enCarpeta = null,
    modificadoDesde = null, propiedad = null, incluirPapelera = false, limite = 50,
  } = {}) {
    const partes = []
    if (nombreExacto) partes.push(`name = '${escapar(nombreExacto)}'`)
    if (nombreContiene) partes.push(`name contains '${escapar(nombreContiene)}'`)
    if (mimeType) partes.push(`mimeType = '${escapar(mimeType)}'`)
    if (enCarpeta) partes.push(`'${escapar(enCarpeta)}' in parents`)
    if (modificadoDesde) partes.push(`modifiedTime > '${escapar(modificadoDesde)}'`)
    if (propiedad?.clave) partes.push(`properties has { key='${escapar(propiedad.clave)}' and value='${escapar(propiedad.valor)}' }`)
    // El chequeo va ANTES de sumar `trashed = false`: si no, "no hay ningún criterio" nunca se
    // cumple —el filtro de papelera cuenta como criterio— y la consulta lista el Drive entero.
    if (!partes.length) throw argInvalido('buscarPorMetadata sin ningún criterio: eso lista el Drive entero')
    if (!incluirPapelera) partes.push('trashed = false')
    const q = encodeURIComponent(partes.join(' and '))
    const campos = encodeURIComponent(`files(${CAMPOS})`)
    const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=${campos}`
      + `&pageSize=${Math.min(Number(limite) || 50, 100)}&supportsAllDrives=true&includeItemsFromAllDrives=true`
    const j = await conDrive('los archivos buscados', () => google.apiGetDrive(url))
    return (j?.files || []).map((m) => referenciaDe(m)).filter(Boolean)
  }

  /** Un archivo por su clave de idempotencia. Es lo que hace que un retry no duplique. */
  async function porClaveDeIdempotencia(clave, { enCarpeta = null } = {}) {
    if (!clave) return null
    const encontrados = await buscarPorMetadata({
      propiedad: { clave: PROP_IDEMPOTENCIA, valor: clave }, enCarpeta, limite: 10,
    })
    return encontrados[0] ?? null
  }

  /**
   * BÚSQUEDA POR EL ÍNDICE YA CONSTRUIDO (`public.drive_index` + `lib/drive-busqueda/`).
   *
   * Determinística de punta a punta: normaliza, tokeniza, cinco etapas y ranking explicable, con
   * un test que falla si alguna vez aparece una llamada a un modelo. Es la que entiende
   * «vision/traccion» y la que sabe que «flujo de fondos» es el Sheet vivo y no el xlsx de 2025.
   * Requiere el índice (Postgres): sin él, la capacidad sigue leyendo Drive, pero esta función
   * dice por qué no puede contestar en vez de devolver vacío.
   */
  async function buscarEnIndice(texto, { tipo = null, usuario = '', limite = 5 } = {}) {
    if (!indice) throw new DriveError(CODIGO.UNSUPPORTED_OPERATION,
      'La búsqueda por índice necesita el índice de Drive (Postgres) y esta capacidad se armó sin él.')
    if (!texto) throw argInvalido('falta el texto a buscar')
    const { buscar } = await import('../drive-busqueda/buscar.mjs')
    const r = await buscar({ indice, texto, tipo, limite, usuario })
    return conHomonimos(r)
  }

  /**
   * «CONFIANZA ALTA» NO SIGNIFICABA «NO HAY AMBIGÜEDAD», Y ALGUIEN IBA A CREERLE.
   *
   * `resolver()` devuelve `alta` cuando queda UN candidato después de filtrar, o cuando uno domina
   * el puntaje. Eso no es lo mismo que ser único: medido contra el índice real, «Recibo 2026-05
   * Q2.pdf» colapsaba a una sola opción con `alternativas: []` y confianza `alta` — y hay
   * VEINTIDÓS archivos con ese nombre exacto, uno por empleado. El OS abría el recibo de sueldo de
   * una persona concreta y llamaba a eso certeza.
   *
   * Acá se le pregunta al índice cuántas filas comparten el nombre EXACTO del ganador. Si hay más
   * de una, la confianza baja a `media`: hay un favorito, pero quien decida tiene que elegir. La
   * degradación va acá y no en `drive-busqueda/`, que es compartido con el chat: el que no puede
   * adivinar es el que ABRE el archivo.
   */
  async function conHomonimos(r) {
    if (!db || !r?.ganador?.name) return { ...r, homonimos: null }
    let homonimos = null
    try {
      const { rows } = await db.query(
        'select count(*)::int n from public.drive_index where name = $1', [r.ganador.name])
      homonimos = rows?.[0]?.n ?? null
    } catch { return { ...r, homonimos: null } }   // sin índice legible no se INVENTA certeza ni duda
    if (homonimos !== null && homonimos > 1 && r.confianza === 'alta') {
      return { ...r, homonimos, confianza: 'media', porQue: `hay ${homonimos} archivos con el nombre exacto «${r.ganador.name}»` }
    }
    return { ...r, homonimos }
  }

  /** El historial de versiones, de la más vieja a la más nueva. */
  async function revisiones(fileId) {
    await referencia(fileId)
    return conDrive(`las revisiones de ${fileId}`, () => google.listarRevisiones(fileId))
  }

  /** Los BYTES de un archivo subido. Un nativo de Google no tiene bytes: se dice, no se 403ea. */
  async function descargar(fileId) {
    const ref = await referenciaViva(fileId)
    if (esCarpeta(ref.mime_type)) throw noSoportada('Una carpeta no se descarga.')
    if (esNativoGoogle(ref.mime_type)) {
      throw noSoportada(`"${ref.name}" es un ${ref.tipo} nativo de Google y no tiene bytes propios: exportalo a un formato (pdf, xlsx, docx).`,
        `mimeType=${ref.mime_type}`)
    }
    const bytes = await conDrive(`el archivo ${fileId}`, () => google.descargarBytes(fileId))
    return { referencia: ref, bytes, mime_type: ref.mime_type }
  }

  /** Exporta un nativo de Google a otro formato, EN MEMORIA (no crea nada en Drive). */
  async function exportar(fileId, formato) {
    const ref = await referenciaViva(fileId)
    const destino = mimeDeFormato(formato)
    if (!destino) throw argInvalido('falta el formato de destino')
    if (!conversionSoportada(ref.mime_type, destino)) {
      const posibles = EXPORTACIONES[ref.mime_type] ?? []
      throw noSoportada(
        `No se puede convertir un ${ref.tipo} (${ref.mime_type}) a ${destino}.`,
        posibles.length ? `soportados: ${posibles.join(', ')}` : 'ese tipo de archivo no se exporta',
      )
    }
    const bytes = await conDrive(`el archivo ${fileId}`, () => google.exportarBytesComo(fileId, destino))
    return { referencia: ref, bytes, mime_type: destino }
  }

  return {
    referencia, referenciaViva, listarCarpeta, buscarCarpetas, buscarPorNombre,
    buscarPorMetadata, porClaveDeIdempotencia, buscarEnIndice, revisiones, descargar, exportar,
  }
}

export { clasificar }
