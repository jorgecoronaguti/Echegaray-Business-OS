// "PASAME EL CONTRATO DE QUATTROPANI" → el enlace del archivo, no su contenido.
//
// La capacidad es TRAER EL ARCHIVO. No lo lee, no lo resume, no lo interpreta: devuelve
// nombre, tipo, fecha y enlace. Leer un Sheet de finanzas para contestar un "pasámelo" sería
// gastar API y, peor, meter en el chat datos que la persona no pidió.
//
// PERMISOS. No hay un modelo de permisos propio acá: el archivo se ve si la cuenta de Google
// con la que se busca lo ve. Duplicar el compartir de Drive en una tabla del OS sería crear
// una segunda verdad que envejece sola.
//
// ELEGIR ENTRE VARIOS. Drive devuelve todo lo que "contiene" el texto. Si uno gana claro
// (nombre exacto, o empieza con lo pedido y ningún otro lo hace) se devuelve directo; si hay
// empate se pregunta UNA vez con cinco opciones como máximo. Adivinar acá es mandar el
// presupuesto de otra obra.

import { CAPACIDAD, ERROR, errorAsistente, resultadoOk, resultadoError, resultadoAclaracion, zDriveBuscar } from '../contratos.mjs'
import { paredAR } from '../tiempo.mjs'
import { clasificarErrorGoogle, googleDisponible, errorSinCuenta } from '../google-cliente.mjs'

const MAX_OPCIONES = 5
/** Techo de archivos que se enriquecen con una llamada a Drive cada uno (searchFile trae 10). */
const MAX_CANDIDATOS = 10
const VENTANA_CACHE_MS = 60_000
const MAX_CACHE = 60

const CARPETA = 'application/vnd.google-apps.folder'

/** Tipo legible desde el mimeType (mismo criterio que las tools de Drive del motor). */
function tipoLegible(mime = '') {
  const m = String(mime)
  if (m === CARPETA) return 'carpeta'
  if (m.includes('spreadsheet') || m.includes('excel')) return 'planilla'
  if (m.includes('document') || m.includes('word')) return 'documento'
  if (m.includes('pdf')) return 'pdf'
  if (m.includes('image')) return 'imagen'
  if (m.includes('presentation')) return 'presentación'
  return 'archivo'
}

const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
const sinExtension = (s) => String(s ?? '').replace(/\.[a-z0-9]{2,5}$/i, '')
const dosDig = (n) => String(n).padStart(2, '0')

/** ISO de Drive → "27/07/2026" en hora de la empresa. null si Drive no dio la fecha: se
 *  muestra el archivo sin fecha antes que con una fecha inventada. */
function fechaCorta(iso) {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const p = paredAR(d)
  return `${dosDig(p.d)}/${dosDig(p.m)}/${p.y}`
}

/** 3 = el nombre ES lo pedido, 2 = empieza con lo pedido, 1 = lo contiene, 0 = ni eso. */
function puntaje(nombre, terminos) {
  const t = norm(terminos)
  const candidatos = [norm(nombre), norm(sinExtension(nombre))]
  if (candidatos.includes(t)) return 3
  if (candidatos.some((c) => c.startsWith(t))) return 2
  if (candidatos.some((c) => c.includes(t))) return 1
  return 0
}

function coincideTipo(mime, tipo) {
  if (tipo === 'cualquiera') return true
  return tipoLegible(mime) === tipo
}

// ── Anti-ruido ───────────────────────────────────────────────────────────────
// La misma pregunta dos veces seguidas (el pedido que se reenvía, el "¿lo encontraste?")
// no vuelve a pegarle a Drive. Cache en memoria del proceso: si el worker se reinicia se
// pierde y no pasa nada — no es un dato, es un eco.

const cache = new Map()

function deCache(clave, ahora) {
  const hit = cache.get(clave)
  if (!hit) return null
  if (ahora - hit.t > VENTANA_CACHE_MS) { cache.delete(clave); return null }
  return hit.valor
}

function aCache(clave, valor, ahora) {
  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value)
  cache.set(clave, { t: ahora, valor })
}

/** Sólo para tests: la cache es del proceso y no debe filtrarse entre casos. */
export function _limpiarCache() { cache.clear() }

// ── Búsqueda ─────────────────────────────────────────────────────────────────

/**
 * Metadata completa de un archivo. `searchFile` devuelve id/nombre/mime y `getMeta` no pide
 * `modifiedTime`, así que la fecha se lee por el GET crudo del cliente (mismo auth, una sola
 * llamada). Si esa puerta no existe se cae a `getMeta`: queda sin fecha, nunca con una falsa.
 */
async function metaCompleta(google, id) {
  const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}`
    + '?fields=id,name,mimeType,modifiedTime,webViewLink&supportsAllDrives=true'
  if (typeof google.apiGetSheets === 'function') {
    try {
      const j = await google.apiGetSheets(url)
      if (j?.id) return j
    } catch { /* la puerta cruda puede no estar habilitada: se intenta la formal */ }
  }
  return google.getMeta(id)
}

const enlaceDe = (meta) => meta.webViewLink
  || (String(meta.mimeType ?? '').includes('folder')
    ? `https://drive.google.com/drive/folders/${meta.id}`
    : `https://drive.google.com/file/d/${meta.id}/view`)

/**
 * Los candidatos que REALMENTE compiten, ya con enlace y fecha.
 *
 * Sólo se enriquece el grupo del mejor puntaje: si "Contrato Quattropani" existe exacto, los
 * que apenas lo contienen no entran a la elección y no vale una llamada a Drive por cada uno.
 * Y el desempate por fecha se hace DESPUÉS de tener a todos los empatados: recortar a cinco
 * antes de mirar las fechas dejaba afuera al archivo más reciente sin que nadie lo notara.
 */
async function candidatos(google, { terminos, tipo }) {
  const crudos = (await google.searchFile(terminos)) || []
  const puntuados = crudos
    .filter((f) => f?.id && coincideTipo(f.mimeType, tipo))
    .map((f) => ({ ...f, score: puntaje(f.name, terminos) }))
    .filter((f) => f.score > 0)
  if (!puntuados.length) return []
  const mejor = Math.max(...puntuados.map((f) => f.score))
  const compiten = puntuados.filter((f) => f.score === mejor).slice(0, MAX_CANDIDATOS)
  const out = []
  for (const f of compiten) {
    const meta = await metaCompleta(google, f.id).catch(() => null)
    out.push({
      id: f.id,
      nombre: meta?.name ?? f.name,
      tipo: tipoLegible(meta?.mimeType ?? f.mimeType),
      modificado: meta?.modifiedTime ?? null,
      enlace: enlaceDe({ ...f, ...(meta ?? {}) }),
    })
  }
  // Manda el más reciente: entre dos "Contrato Quattropani" el que se tocó la semana pasada
  // es casi siempre el que están pidiendo.
  return out.sort((a, b) => String(b.modificado ?? '').localeCompare(String(a.modificado ?? '')))
}

const lineaArchivo = (a) => {
  const f = fechaCorta(a.modificado)
  return `${a.nombre} (${a.tipo})${f ? ` — ${f}` : ''}`
}

function textoUno(a) {
  const f = fechaCorta(a.modificado)
  return `Encontré este archivo: ${a.nombre}${f ? ` — modificado el ${f}` : ''}. [Abrir archivo](${a.enlace})`
}

function respuestaDesde(lista, terminos) {
  if (!lista.length) {
    return resultadoError(CAPACIDAD.DRIVE_BUSCAR, errorAsistente(
      ERROR.NO_ENCONTRADO,
      `No encontré ningún archivo que se llame "${terminos}" en el Drive.`,
    ))
  }
  // Uno solo en el grupo del mejor puntaje = ganador claro. Si quedaron varios empatados,
  // ninguno es "el" archivo: se pregunta antes que mandar el presupuesto de otra obra.
  if (lista.length === 1) {
    const a = lista[0]
    return resultadoOk(CAPACIDAD.DRIVE_BUSCAR, textoUno(a), {
      archivo: { id: a.id, nombre: a.nombre, tipo: a.tipo, modificado: a.modificado, enlace: a.enlace, ubicacion: null },
    })
  }
  const opciones = lista.slice(0, MAX_OPCIONES).map((a) => ({ valor: a.id, etiqueta: lineaArchivo(a) }))
  const pregunta = ['Encontré varios. ¿Cuál te paso?', ...opciones.map((o, i) => `${i + 1}. ${o.etiqueta}`)].join('\n')
  return resultadoAclaracion(CAPACIDAD.DRIVE_BUSCAR, pregunta, opciones, { terminos })
}

export const capacidad = {
  id: CAPACIDAD.DRIVE_BUSCAR,
  nombre: 'Buscar un archivo en Drive',
  descripcion: 'buscarte un archivo en el Drive y pasarte el enlace para abrirlo',
  version: '1.0.0',
  permisos: ['drive.read'],
  efectoExterno: false,
  ejemplos: ['pasame el contrato de Quattropani', 'buscame el flujo de caja', '¿dónde está el presupuesto de Messina?'],
  entrada: zDriveBuscar,
  habilitada: (ctx) => googleDisponible(ctx, ctx?.googleDeps),

  async ejecutar(params, ctx = {}) {
    const p = zDriveBuscar.safeParse(params)
    if (!p.success) {
      return resultadoError(CAPACIDAD.DRIVE_BUSCAR, errorAsistente(
        ERROR.DATO_FALTANTE, '¿Qué archivo busco? Decime el nombre o parte del nombre.', p.error.message,
      ))
    }
    const { terminos, tipo } = p.data
    if (!ctx.google) return resultadoError(CAPACIDAD.DRIVE_BUSCAR, errorSinCuenta())

    const ahora = (ctx.ahora?.() ?? new Date()).getTime()
    const quien = ctx.identidad?.plataformaUserId ?? ctx.identidad?.email ?? 'anon'
    const clave = `${quien}|${norm(terminos)}|${tipo}`

    const cacheado = deCache(clave, ahora)
    if (cacheado) return respuestaDesde(cacheado, terminos)

    let lista
    try {
      lista = await candidatos(ctx.google, { terminos, tipo })
    } catch (e) {
      return resultadoError(CAPACIDAD.DRIVE_BUSCAR, clasificarErrorGoogle(e, { que: `"${terminos}" en el Drive` }))
    }
    // También se cachea el "no hay nada": repetir el pedido no cambia el Drive en 60 segundos.
    aCache(clave, lista, ahora)
    return respuestaDesde(lista, terminos)
  },
}
