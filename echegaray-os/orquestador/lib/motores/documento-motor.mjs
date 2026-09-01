// EL MOTOR DE DOCUMENTOS: de una estructura validada a un Google Doc que existe y que se releyó.
//
// ═══ 0 LLAMADAS A UN MODELO ═══
//
// Este archivo no importa —ni puede importar— un cliente de IA: la transformación «estructura +
// datos → documento» es determinística. Un modelo puede haber escrito la narrativa antes; acá ya
// llegó como texto y no hace falta para nada. Con Claude apagado, el informe se crea igual.
//
// ═══ QUÉ CUENTA COMO PRUEBA ═══
//
// No cuenta que `docsBatchUpdate` devuelva 200. Cuenta el documento RELEÍDO: que la sección exista
// y que su texto contenga lo que se mandó. Mientras eso no se pueda comprobar, el resultado es un
// fallo con nombre y no un «listo».

import { CODIGO, fallo, intentar } from './errores.mjs'
import { puedeEscribir } from './frontera-modelo.mjs'
import { validarDocumento } from './documento-contrato.mjs'
import { leerEstructura, seccionPorId } from './documento-estructura.mjs'
import {
  construirBloques, construirCuerpo, requestsDeCabeceraDeTabla, requestsDeCeldas, requestsDeCuerpo,
  requestsDeTablas, requestsDeVaciadoDeSeccion, requestsDeVariables, textoPlanoDeBloques,
} from './documento-requests.mjs'

const MIME_DOC = 'application/vnd.google-apps.document'
const CLAVE_OS = 'os_clave'

export const FORMATOS = Object.freeze({
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain',
})

const normal = (s) => String(s).replace(/\s+/g, ' ').trim()

/** ¿Hay cliente de Drive? Sin él no se afirma nada: se dice que Drive no está. */
const sinDrive = (google) => !google?.createFile || !google?.docsBatchUpdate || !google?.getDoc

/**
 * ESCRIBE UN PLAN EN EL DOCUMENTO. Tres pasos porque `insertTable` corre los índices y las celdas
 * sólo existen después de que la tabla existe. Devuelve un fallo con nombre o `{ok:true}`.
 */
async function aplicarPlan(google, fileId, plan, base) {
  const cuerpo = await intentar(() => google.docsBatchUpdate(fileId, requestsDeCuerpo(plan, { base }), { comoDueno: true }), 'al escribir el cuerpo')
  if (!cuerpo.ok) return cuerpo
  if (!plan.tablas.length) return { ok: true }

  const tablas = await intentar(() => google.docsBatchUpdate(fileId, requestsDeTablas(plan, { base }), { comoDueno: true }), 'al insertar las tablas')
  if (!tablas.ok) return tablas

  const releido = await intentar(() => google.getDoc(fileId, { comoDueno: true }), 'al releer para llenar las tablas')
  if (!releido.ok) return releido
  const celdas = requestsDeCeldas(releido.valor, plan.tablas, { desde: base })
  if (celdas.error) return fallo(CODIGO.WRITE_NOT_PERSISTED, `las tablas no quedaron como se pidieron: ${celdas.error}`)
  const lleno = await intentar(() => google.docsBatchUpdate(fileId, celdas.requests, { comoDueno: true }), 'al llenar las tablas')
  if (!lleno.ok) return lleno

  const conDatos = await intentar(() => google.getDoc(fileId, { comoDueno: true }), 'al releer para resaltar las cabeceras')
  if (!conDatos.ok) return conDatos
  const negrita = requestsDeCabeceraDeTabla(conDatos.valor, { desde: base, limite: plan.tablas.length })
  if (negrita.length) await intentar(() => google.docsBatchUpdate(fileId, negrita, { comoDueno: true }), 'al resaltar las cabeceras')
  return { ok: true }
}

/**
 * CREA UN DOCUMENTO desde una estructura. Idempotente cuando se le pasa `clave`: el reintento
 * devuelve el mismo archivo en vez de dejar «Informe agosto (1)».
 *
 * @param {object} google cliente de `lib/google.mjs`
 * @param {{contenido:object, nombre?:string, carpeta_id?:string, clave?:string}} pedido
 * @returns {Promise<{ok:true, id:string, link:string, reutilizado:boolean, verificacion:object}|object>}
 */
export async function crearDocumento(google, { contenido, nombre, carpeta_id, clave, actor, archivos_habilitados } = {}) {
  const puerta = puedeEscribir({ operation: 'crear_documento', actor, archivos_habilitados })
  if (!puerta.ok) return puerta
  const v = validarDocumento(contenido)
  if (!v.ok) return fallo(CODIGO.INVALID_CONTENT, 'la estructura del documento no cumple el contrato', { errores: v.errores })
  if (sinDrive(google)) return fallo(CODIGO.DRIVE_UNAVAILABLE, 'no hay cliente de Drive para crear el documento')

  const titulo = String(nombre || v.doc.titulo).slice(0, 200)
  if (clave) {
    const previo = await buscarPorClave(google, clave)
    if (!previo.ok) return previo
    if (previo.archivo) {
      const estructura = await leerDocumento(google, previo.archivo.id)
      return { ok: true, id: previo.archivo.id, link: enlace(previo.archivo.id), nombre: previo.archivo.name, reutilizado: true, verificacion: estructura.ok ? resumen(estructura.estructura) : {} }
    }
  }

  const creado = await intentar(() => google.createFile({
    name: titulo, mimeType: MIME_DOC,
    ...(carpeta_id ? { parents: [carpeta_id] } : {}),
    ...(clave ? { appProperties: { [CLAVE_OS]: String(clave) } } : {}),
  }), 'al crear el documento en Drive')
  if (!creado.ok) return creado

  const id = creado.valor.id
  const escrito = await aplicarPlan(google, id, construirCuerpo(v.doc), 1)
  if (!escrito.ok) return { ...escrito, id, link: enlace(id), aviso: 'el archivo quedó creado y VACÍO o a medias: no se afirma que el documento esté listo' }

  const control = await verificarDocumento(google, id, v.doc)
  if (!control.ok) return control
  const destino = await verificarDestino(google, id, carpeta_id)
  if (!destino.ok) return destino
  return { ok: true, id, link: enlace(id), nombre: titulo, reutilizado: false, verificacion: { ...control.verificacion, ...destino.verificacion } }
}

/**
 * ¿DÓNDE QUEDÓ? Verificar qué dice adentro y no dónde está deja pasar el archivo perfecto en la
 * carpeta equivocada — y una oferta que aparece en la raíz del Drive del dueño en vez de en la
 * carpeta del cliente es un archivo perdido, aunque su contenido sea impecable.
 *
 * `parents` y `trashed` los trae `getMeta` desde main (82fb2bba), y hay que pedirlos con el token
 * del DUEÑO: el archivo lo creó él, el robot no lo ve.
 */
export async function verificarDestino(google, fileId, carpetaEsperada) {
  if (!google?.getMeta) return fallo(CODIGO.DRIVE_UNAVAILABLE, 'no se puede comprobar dónde quedó el archivo: falta getMeta')
  const meta = await intentar(() => google.getMeta(String(fileId), { comoDueno: true }), 'al comprobar dónde quedó el archivo')
  if (!meta.ok) return meta
  const padres = meta.valor?.parents ?? []
  if (meta.valor?.trashed) return fallo(CODIGO.WRITE_NOT_PERSISTED, 'el archivo recién creado está en la papelera', { id: fileId })
  if (carpetaEsperada && !padres.includes(String(carpetaEsperada))) {
    return fallo(CODIGO.WRITE_NOT_PERSISTED, 'el archivo NO quedó en la carpeta que se pidió', { id: fileId, esperada: String(carpetaEsperada), quedó_en: padres })
  }
  return { ok: true, verificacion: { carpeta: padres[0] ?? null, en_la_carpeta_pedida: carpetaEsperada ? true : null, trashed: false } }
}

const enlace = (id) => `https://docs.google.com/document/d/${id}/edit`

/** El archivo que ya lleva esta clave del OS, o `null`. */
async function buscarPorClave(google, clave) {
  if (!google?.buscarPorPropiedad) return { ok: true, archivo: null }
  const r = await intentar(() => google.buscarPorPropiedad(CLAVE_OS, String(clave)), 'al buscar un documento previo')
  if (!r.ok) return r
  return { ok: true, archivo: (r.valor ?? [])[0] ?? null }
}

/** LEE la estructura del documento: secciones direccionables, tablas, texto. */
export async function leerDocumento(google, fileId) {
  if (!fileId) return fallo(CODIGO.FILE_NOT_FOUND, 'falta el file_id')
  if (sinDrive(google)) return fallo(CODIGO.DRIVE_UNAVAILABLE, 'no hay cliente de Drive para leer el documento')
  const r = await intentar(() => google.getDoc(String(fileId), { comoDueno: true }), 'al leer el documento')
  if (!r.ok) return r
  return { ok: true, estructura: leerEstructura(r.valor) }
}

const resumen = (e) => ({ secciones: e.secciones.length, tablas: e.tablas.length, caracteres: e.texto.length })

/** ¿Quedó en el destino lo que se pidió? Relee y busca cada título y cada texto. */
async function verificarDocumento(google, fileId, doc) {
  const leido = await leerDocumento(google, fileId)
  if (!leido.ok) return leido
  const e = leido.estructura
  const cuerpo = normal(e.texto)
  const titulosAusentes = doc.secciones.filter((s) => !e.secciones.some((x) => normal(x.titulo) === normal(s.titulo))).map((s) => s.titulo)
  const textos = doc.secciones.flatMap((s) => textoPlanoDeBloques(s.bloques))
  const ausentes = textos.filter((t) => !cuerpo.includes(normal(t).slice(0, 60)))
  if (titulosAusentes.length || ausentes.length) {
    return fallo(CODIGO.WRITE_NOT_PERSISTED, 'el documento releído no tiene todo lo que se escribió', {
      id: fileId, link: enlace(fileId), titulos_ausentes: titulosAusentes.slice(0, 8), textos_ausentes: ausentes.slice(0, 8),
    })
  }
  return { ok: true, verificacion: { ...resumen(e), titulos_controlados: doc.secciones.length, textos_controlados: textos.length, releido: true, ids: e.secciones.map((s) => s.id) } }
}

/**
 * ACTUALIZA UNA SECCIÓN: borra su contenido y escribe el nuevo. El título no se toca — la sección
 * es la unidad direccionable y su nombre es lo que la hace direccionable.
 */
export async function actualizarSeccion(google, fileId, { seccion_id, bloques, actor, archivos_habilitados } = {}) {
  return escribirEnSeccion(google, fileId, { seccion_id, bloques, actor, archivos_habilitados, vaciar: true })
}

/** INSERTA contenido AL FINAL de una sección, sin borrar lo que ya está. */
export async function insertarEnSeccion(google, fileId, { seccion_id, bloques, actor, archivos_habilitados } = {}) {
  return escribirEnSeccion(google, fileId, { seccion_id, bloques, actor, archivos_habilitados, vaciar: false })
}

async function escribirEnSeccion(google, fileId, { seccion_id, bloques, vaciar, actor, archivos_habilitados }) {
  const puerta = puedeEscribir({
    operation: vaciar ? 'actualizar_seccion' : 'insertar_en_seccion',
    file_id: fileId ? String(fileId) : null, actor, archivos_habilitados,
  })
  if (!puerta.ok) return puerta
  const v = validarDocumento({ titulo: 'x', secciones: [{ titulo: 'x', bloques }] })
  if (!v.ok) return fallo(CODIGO.INVALID_CONTENT, 'los bloques no cumplen el contrato', { errores: v.errores })

  const leido = await leerDocumento(google, fileId)
  if (!leido.ok) return leido
  const seccion = seccionPorId(leido.estructura, seccion_id)
  if (!seccion) {
    return fallo(CODIGO.SECTION_NOT_FOUND, `el documento no tiene la sección «${seccion_id}»`,
      { secciones_disponibles: leido.estructura.secciones.map((s) => s.id) })
  }

  if (vaciar) {
    const borrado = requestsDeVaciadoDeSeccion(seccion)
    if (borrado.length) {
      const r = await intentar(() => google.docsBatchUpdate(fileId, borrado, { comoDueno: true }), 'al vaciar la sección')
      if (!r.ok) return r
    }
  }
  const base = vaciar ? seccion.contenido_inicio : seccion.fin
  const escrito = await aplicarPlan(google, fileId, construirBloques(v.doc.secciones[0].bloques), base)
  if (!escrito.ok) return escrito

  return verificarSeccion(google, fileId, seccion_id, v.doc.secciones[0].bloques)
}

/** RELEE LA SECCIÓN. Es la prueba: lo que dijo la API no cuenta. */
export async function verificarSeccion(google, fileId, seccionId, bloques) {
  const leido = await leerDocumento(google, fileId)
  if (!leido.ok) return leido
  const seccion = seccionPorId(leido.estructura, seccionId)
  if (!seccion) return fallo(CODIGO.SECTION_NOT_FOUND, `tras escribir, la sección «${seccionId}» no está en el documento`)
  const texto = normal(seccion.texto)
  const ausentes = textoPlanoDeBloques(bloques).filter((t) => !texto.includes(normal(t).slice(0, 60)))
  if (ausentes.length) {
    return fallo(CODIGO.WRITE_NOT_PERSISTED, `la sección «${seccionId}» no quedó con lo que se escribió`, { ausentes: ausentes.slice(0, 8) })
  }
  return { ok: true, seccion: seccionId, verificacion: { releido: true, caracteres: seccion.texto.length, texto: seccion.texto.slice(0, 400) } }
}

/**
 * REEMPLAZA VARIABLES `{{clave}}` en todo el documento, tablas incluidas, y VERIFICA que ninguna
 * de las reemplazadas haya quedado. Las que el documento tenía y no se pasaron se informan: un
 * contrato con `{{plazo_obra}}` a la vista es peor que uno que no se generó.
 */
export async function reemplazarVariables(google, fileId, variables, { actor, archivos_habilitados } = {}) {
  const puerta = puedeEscribir({ operation: 'reemplazar_variables', file_id: fileId ? String(fileId) : null, actor, archivos_habilitados })
  if (!puerta.ok) return puerta
  const claves = Object.keys(variables ?? {})
  if (!claves.length) return fallo(CODIGO.INVALID_CONTENT, 'no se pasó ninguna variable para reemplazar')
  const leido = await leerDocumento(google, fileId)
  if (!leido.ok) return leido

  const r = await intentar(() => google.docsBatchUpdate(fileId, requestsDeVariables(variables), { comoDueno: true }), 'al reemplazar las variables')
  if (!r.ok) return r

  const control = await leerDocumento(google, fileId)
  if (!control.ok) return control
  const texto = control.estructura.texto
  const sinReemplazar = claves.filter((c) => texto.includes(`{{${c}}}`))
  if (sinReemplazar.length) {
    return fallo(CODIGO.WRITE_NOT_PERSISTED, 'quedaron variables sin reemplazar después de escribir', { sin_reemplazar: sinReemplazar })
  }
  const otras = [...new Set(texto.match(/\{\{\s*[a-zA-Z0-9_.]+\s*\}\}/g) || [])].map((s) => s.replace(/[{}\s]/g, ''))
  return { ok: true, reemplazadas: claves, pendientes_en_el_documento: otras, verificacion: { releido: true } }
}

/**
 * EXPORTA el documento. Devuelve los BYTES en memoria: no deja una copia en Drive que después nadie
 * borra. `pdf` y `docx` los produce Google; cualquier otro formato es `UNSUPPORTED_OPERATION`.
 */
export async function exportarDocumento(google, fileId, { formato = 'pdf' } = {}) {
  const mime = FORMATOS[String(formato).toLowerCase()]
  if (!mime) return fallo(CODIGO.UNSUPPORTED_OPERATION, `no sé exportar a «${formato}»`, { soportados: Object.keys(FORMATOS) })
  if (!google?.exportarBytesComo) return fallo(CODIGO.DRIVE_UNAVAILABLE, 'no hay cliente de Drive para exportar')
  const r = await intentar(() => google.exportarBytesComo(String(fileId), mime), `al exportar a ${formato}`)
  if (!r.ok) return r
  const bytes = r.valor
  if (!bytes?.length) return fallo(CODIGO.WRITE_NOT_PERSISTED, `la exportación a ${formato} devolvió 0 bytes`)
  return { ok: true, formato, mime, bytes: bytes.length, contenido: bytes }
}
