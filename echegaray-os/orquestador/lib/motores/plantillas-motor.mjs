// PLANTILLA + DATOS ESTRUCTURADOS → ARCHIVO TERMINADO. CERO LLAMADAS A UN MODELO.
//
// ═══ POR QUÉ ESTO ES LO IMPORTANTE ═══
//
// El dueño lo dijo así: «si Claude está apagado, el informe estructurado debe poder crearse
// igualmente; puede faltar una narrativa sofisticada, no puede faltar la capacidad de crear el
// archivo». Todo lo que hay en este archivo es sustitución de huecos, repetición de filas y
// armado de estructura: aritmética de texto. No hay nada que interpretar.
//
// Un modelo puede haber redactado el `resumen` o la `lectura` ANTES; llegan acá como un dato más,
// igual que un monto. Si no hay modelo, el documento sale con las secciones estructuradas y sin
// esa narrativa — y eso es un documento, no un error.

import { createHash } from 'node:crypto'
import { CODIGO, fallo } from './errores.mjs'
import { plantilla as buscarPlantilla } from './plantillas-catalogo.mjs'
import { validarDocumento } from './documento-contrato.mjs'
import { crearDocumento } from './documento-motor.mjs'
import { crearPresentacion, prepararPresentacion } from './presentacion-motor.mjs'

const esVacio = (v) => v === undefined || v === null || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && !v.length)
const HUECO = /\{\{\s*([a-z0-9_]+)\s*\}\}/gi

/** Sustituye `{{clave}}`. Devuelve `{texto, faltan}`: los huecos sin dato se informan, no se
 *  esconden — un contrato con `{{plazo_obra}}` a la vista es peor que uno que no se generó. PURA. */
export function sustituir(texto, datos) {
  const faltan = []
  const out = String(texto ?? '').replace(HUECO, (_, k) => {
    if (esVacio(datos?.[k])) { faltan.push(k); return '' }
    return String(datos[k])
  })
  return { texto: out, faltan }
}

/** Un bloque de plantilla con los datos puestos, o `null` si le falta un dato opcional. PURA. */
function renderBloque(b, datos, faltan) {
  if (b.tipo === 'parrafo') {
    const r = sustituir(b.texto, datos)
    if (r.faltan.length) { faltan.push(...r.faltan); return null }
    return r.texto.trim() ? { tipo: 'parrafo', texto: r.texto } : null
  }
  if (b.tipo === 'lista') {
    const items = b.desde ? listaDeTextos(datos?.[b.desde], b.campo) : (b.items ?? []).map((i) => sustituir(i, datos).texto)
    const limpios = items.filter((t) => String(t ?? '').trim())
    if (!limpios.length) { if (b.desde) faltan.push(b.desde); return null }
    return { tipo: 'lista', items: limpios }
  }
  if (b.tipo === 'datos') {
    const pares = b.pares.map((p) => ({ clave: p.clave, valor: sustituir(p.valor, datos) }))
      .filter((p) => !p.valor.faltan.length && p.valor.texto.trim())
      .map((p) => ({ clave: sustituir(p.clave, datos).texto, valor: p.valor.texto }))
    return pares.length ? { tipo: 'datos', pares } : null
  }
  if (b.tipo === 'tabla') return renderTabla(b, datos, faltan)
  return null
}

/** Una fila por elemento de la lista de datos. PURA. */
function renderTabla(b, datos, faltan) {
  if (!b.desde) {
    const filas = (b.filas ?? []).map((f) => f.map((c) => sustituir(c, datos).texto))
    return filas.length ? { tipo: 'tabla', columnas: b.columnas, filas } : null
  }
  const fuente = datos?.[b.desde]
  if (!Array.isArray(fuente) || !fuente.length) { faltan.push(b.desde); return null }
  const celdas = b.celdas ?? []
  const filas = fuente.map((it) => celdas.map((c) => (it && typeof it === 'object' ? String(it[c] ?? '') : String(it ?? ''))))
  return { tipo: 'tabla', columnas: b.columnas, filas }
}

const listaDeTextos = (v, campo) => (Array.isArray(v) ? v : [])
  .map((x) => (x && typeof x === 'object' ? String(x[campo ?? 'texto'] ?? '') : String(x ?? '')))

/**
 * LAS SECCIONES CON LOS DATOS PUESTOS. PURA.
 * Una sección OPCIONAL a la que le falta su dato se omite y se dice. Una OBLIGATORIA a la que le
 * falta un dato es un fallo: un certificado sin sus ítems no es un certificado incompleto, es otro
 * documento.
 */
export function renderSecciones(p, datos) {
  const secciones = []
  const omitidas = []
  const faltantes = new Set()
  for (const s of p.sections) {
    const faltan = []
    const bloques = s.bloques.map((b) => renderBloque(b, datos, faltan)).filter(Boolean)
    const titulo = sustituir(s.titulo, datos)
    if (faltan.length || titulo.faltan.length) {
      const criticos = [...faltan, ...titulo.faltan].filter((k) => p.required_data.includes(k))
      if (criticos.length || s.obligatoria) { criticos.forEach((k) => faltantes.add(k)) }
      if (!s.obligatoria) { omitidas.push({ seccion: s.id, por_falta_de: [...new Set([...faltan, ...titulo.faltan])] }); continue }
    }
    secciones.push({ id: s.id, titulo: titulo.texto, nivel: s.nivel, bloques })
  }
  return { secciones, omitidas, faltantes: [...faltantes] }
}

/** El nombre del archivo según `output_naming`. PURA. */
export function nombreDeSalida(p, datos) {
  const r = sustituir(p.output_naming, datos)
  return { nombre: r.texto.replace(/\s+/g, ' ').trim(), faltan: r.faltan }
}

/** La carpeta destino según `destination_policy`. PURA. */
export function destinoDe(p, { carpeta_id } = {}) {
  const pol = p.destination_policy.politica
  if (pol === 'RAIZ_DEL_DUENO') return { ok: true, carpeta_id: carpeta_id ?? null }
  if (!carpeta_id) {
    return fallo(CODIGO.MISSING_REQUIRED_FIELD, `la plantilla «${p.template_id}» exige carpeta (${pol}) y no se pasó ninguna`, { falta: ['carpeta_id'] })
  }
  return { ok: true, carpeta_id: String(carpeta_id) }
}

/**
 * LA CLAVE DE IDEMPOTENCIA. Misma plantilla + mismos datos de identidad = misma clave, y por lo
 * tanto el mismo archivo. PURA y estable entre corridas: no entra ni la hora ni el azar.
 */
export function claveIdempotente(templateId, datos, { version = 1 } = {}) {
  const p = buscarPlantilla(templateId)
  const claves = p ? p.required_data.filter((k) => typeof datos?.[k] !== 'object') : Object.keys(datos ?? {}).sort()
  const semilla = [templateId, `v${version}`, ...claves.map((k) => `${k}=${String(datos?.[k] ?? '').trim().toLowerCase()}`)].join('|')
  return createHash('sha256').update(semilla).digest('hex').slice(0, 32)
}

/** La plantilla como se cita en un resultado: qué se usó y en qué versión, no sus 200 líneas. PURA. */
const sello = (p) => ({ template_id: p.template_id, version: p.version, file_type: p.file_type, domain: p.domain, source_file_id: p.source_file_id })

/** Los datos obligatorios que faltan. PURA. */
export function faltanRequeridos(p, datos) {
  return p.required_data.filter((k) => esVacio(datos?.[k]))
}

/** ESTRUCTURA DE DOCUMENTO desde la plantilla. PURA. 0 API, 0 modelo. */
export function renderDocumento(templateId, datos) {
  const p = buscarPlantilla(templateId)
  if (!p) return fallo(CODIGO.TEMPLATE_NOT_FOUND, `no existe la plantilla «${templateId}»`)
  const faltan = faltanRequeridos(p, datos)
  if (faltan.length) return fallo(CODIGO.MISSING_REQUIRED_FIELD, `la plantilla «${p.template_id}» exige datos que no llegaron`, { falta: faltan })
  const nombre = nombreDeSalida(p, datos)
  if (nombre.faltan.length) return fallo(CODIGO.MISSING_REQUIRED_FIELD, 'el nombre de salida tiene huecos sin dato', { falta: nombre.faltan })

  const r = renderSecciones(p, datos)
  if (r.faltantes.length) return fallo(CODIGO.MISSING_REQUIRED_FIELD, 'faltan datos obligatorios de la plantilla', { falta: r.faltantes })
  const v = validarDocumento({ titulo: nombre.nombre, secciones: r.secciones })
  if (!v.ok) return fallo(CODIGO.INVALID_CONTENT, 'la plantilla con estos datos no arma un documento válido', { errores: v.errores })
  return { ok: true, plantilla: sello(p), nombre: nombre.nombre, contenido: v.doc, omitidas: r.omitidas }
}

/** Una sección de plantilla → una lámina. El mapeo es FIJO: no hay elección de forma. PURA. */
function laminasDeSeccion(s) {
  const out = []
  for (const b of s.bloques) {
    if (b.tipo === 'lista') out.push({ tipo: 'puntos', titulo: s.titulo, puntos: b.items })
    else if (b.tipo === 'tabla') out.push({ tipo: 'tabla', titulo: s.titulo, columnas: b.columnas, filas: b.filas })
    else if (b.tipo === 'parrafo') out.push({ tipo: 'seccion', titulo: s.titulo, bajada: b.texto })
    else if (b.tipo === 'datos') {
      // 2 a 4 pares entran como indicadores; con uno solo no hay panel que armar y va como puntos.
      out.push(b.pares.length >= 2 && b.pares.length <= 4
        ? { tipo: 'indicadores', titulo: s.titulo, indicadores: b.pares.slice(0, 4).map((p) => ({ rotulo: p.clave, valor: p.valor })) }
        : { tipo: 'puntos', titulo: s.titulo, puntos: b.pares.map((p) => `${p.clave}: ${p.valor}`) })
    }
  }
  return out
}

/** ESTRUCTURA DE PRESENTACIÓN desde la plantilla. PURA. 0 API, 0 modelo. */
export function renderPresentacion(templateId, datos) {
  const p = buscarPlantilla(templateId)
  if (!p) return fallo(CODIGO.TEMPLATE_NOT_FOUND, `no existe la plantilla «${templateId}»`)
  if (p.file_type !== 'slides') return fallo(CODIGO.UNSUPPORTED_OPERATION, `«${p.template_id}» produce ${p.file_type}, no una presentación`)
  const faltan = faltanRequeridos(p, datos)
  if (faltan.length) return fallo(CODIGO.MISSING_REQUIRED_FIELD, `la plantilla «${p.template_id}» exige datos que no llegaron`, { falta: faltan })
  const nombre = nombreDeSalida(p, datos)
  const r = renderSecciones(p, datos)
  if (r.faltantes.length) return fallo(CODIGO.MISSING_REQUIRED_FIELD, 'faltan datos obligatorios de la plantilla', { falta: r.faltantes })

  const deck = {
    tipo: p.tipo_deck, titulo: nombre.nombre,
    ...(datos?.cliente ? { cliente: String(datos.cliente) } : {}),
    ...(datos?.obra ? { obra: String(datos.obra) } : {}),
    ...(datos?.fecha ? { fecha: String(datos.fecha) } : {}),
    laminas: r.secciones.flatMap(laminasDeSeccion),
  }
  const prueba = prepararPresentacion(deck)
  if (!prueba.ok) return prueba
  return { ok: true, plantilla: sello(p), nombre: nombre.nombre, contenido: deck, omitidas: r.omitidas, control_de_calidad: prueba.control_de_calidad }
}

/**
 * CREA EL ARCHIVO desde la plantilla. Idempotente: el reintento devuelve el archivo que ya existe.
 * @returns {Promise<{ok:true, id, link, template_id, reutilizado:boolean, verificacion:object}|object>}
 */
export async function crearDesdePlantilla(google, { template_id, datos, carpeta_id, clave } = {}) {
  const p = buscarPlantilla(template_id)
  if (!p) return fallo(CODIGO.TEMPLATE_NOT_FOUND, `no existe la plantilla «${template_id}»`)
  if (p.estado !== 'VIGENTE' || p.file_type === 'sheet') {
    return fallo(CODIGO.UNSUPPORTED_OPERATION,
      `«${p.template_id}» produce un ${p.file_type} y este motor no escribe Sheets: la escritura de Sheets tiene su propio circuito (guarda, candados, firma) y saltearlo ya borró una pestaña entera`,
      { estado: p.estado, file_type: p.file_type })
  }
  const destino = destinoDe(p, { carpeta_id })
  if (!destino.ok) return destino
  const idem = clave ?? claveIdempotente(p.template_id, datos, { version: p.version })

  if (p.file_type === 'slides') {
    const r = renderPresentacion(template_id, datos)
    if (!r.ok) return r
    const deck = destino.carpeta_id ? { ...r.contenido, carpeta_id: destino.carpeta_id } : r.contenido
    const creada = await crearPresentacion(google, { contenido: deck, nombre: r.nombre, clave: idem })
    return creada.ok ? { ...creada, template_id: p.template_id, omitidas: r.omitidas, clave: idem } : creada
  }
  const r = renderDocumento(template_id, datos)
  if (!r.ok) return r
  const creado = await crearDocumento(google, { contenido: r.contenido, nombre: r.nombre, carpeta_id: destino.carpeta_id, clave: idem })
  return creado.ok ? { ...creado, template_id: p.template_id, omitidas: r.omitidas, clave: idem } : creado
}
