// LA BIBLIOTECA TÉCNICA — lo que XSAS YA ESTUDIÓ, no lo que XSAS guardó.
//
// ═══ LA DIFERENCIA, QUE ES TODO ═══
//
// Guardar un PDF no es saber. Un repositorio de PDFs obliga a releerlos en cada cotización: cuesta
// tokens, tarda, y da una respuesta distinta cada vez. Estudiar es otra cosa: del documento sale
// una AFIRMACIÓN con su cita textual, su procedencia y su confianza, y a partir de ahí la respuesta
// se contesta con un `find`, no con una llamada a un modelo.
//
//   primera vez:   documento → investigación/modelo → conocimiento estructurado
//   las siguientes: conocimiento estructurado → cálculo
//
// ═══ TRES EJES QUE NO SE MEZCLAN ═══
//
// El pedido nombra dieciséis etiquetas en una sola lista. No son una sola lista: son tres preguntas
// distintas, y aplastarlas hace imposible contestar cualquiera de las tres.
//
//   PROCEDENCIA — ¿de dónde salió?          BASE_MAESTRA, NORMA, WEB, CALCULADO…
//   ESTADO      — ¿en qué punto del ciclo?  CANDIDATO, VALIDADO, RECHAZADO, REEMPLAZADO
//   HUECO       — ¿por qué NO hay dato?     FALTA_DATO, AMBIGUO, CONFLICTO
//
// Un mismo conocimiento puede ser `WEB` (procedencia) y `CANDIDATO` (estado) a la vez, y eso es
// exactamente lo que hay que poder decir. «WEB validado» y «WEB candidato» son cosas opuestas.
//
// ═══ LA REGLA QUE NO SE PUEDE EVADIR ═══
//
// La procedencia de un conocimiento NO LA CAMBIA NINGUNA OPERACIÓN DE ESTE ARCHIVO. Ni estudiar de
// nuevo, ni validar, ni promover. Lo que valida el dueño es el ESTADO —«esto se puede usar»—, nunca
// el origen: un dato leído en internet sigue siendo un dato leído en internet después de aprobado.
// Por eso `validar()` toca `estado` y jamás `procedencia`, y hay un test que lo prueba al revés.
import fs from 'node:fs'
import path from 'node:path'
import { huella } from './cache.mjs'

/** DE DÓNDE SALIÓ. Es un HECHO sobre el dato y no cambia nunca. */
export const PROCEDENCIA = Object.freeze({
  HECHO_PROYECTO: 'HECHO_PROYECTO',         // lo dice el plano/pliego de ESTA obra
  EXPERIENCIA_ECSAS: 'EXPERIENCIA_ECSAS',   // lo medimos nosotros ejecutando
  BASE_MAESTRA: 'BASE_MAESTRA',             // está en nuestro catálogo con análisis vigente
  NORMA: 'NORMA',                           // reglamento o norma, con número y año
  REFERENCIA_TECNICA: 'REFERENCIA_TECNICA', // manual, guía, publicación técnica
  REFERENCIA_CIRCOT: 'REFERENCIA_CIRCOT',   // estándares zonales de San Juan — cerca, pero no nuestros
  FABRICANTE: 'FABRICANTE',                 // ficha técnica de quien fabrica
  INVESTIGACION: 'INVESTIGACION',           // paper: un método publicado y verificable
  WEB: 'WEB',                               // una página, con su URL y su fecha
  CALCULADO: 'CALCULADO',                   // aritmética sobre entradas que sí tienen procedencia
  INFERIDO: 'INFERIDO',                     // se dedujo; el razonamiento va declarado
  SUPUESTO: 'SUPUESTO',                     // lo puso alguien; no se verifica, se define
})

/** EN QUÉ PUNTO DEL CICLO ESTÁ. Es lo único que se mueve. */
export const ESTADO = Object.freeze({
  CANDIDATO: 'CANDIDATO',       // extraído y con evidencia; todavía no se usa para cotizar
  VALIDADO: 'VALIDADO',         // alguien que no lo extrajo lo firmó
  RECHAZADO: 'RECHAZADO',       // se miró y no sirve; queda para no volver a proponerlo
  REEMPLAZADO: 'REEMPLAZADO',   // hay una versión posterior
})

/** POR QUÉ NO HAY DATO. Un hueco declarado vale más que un número inventado. */
export const HUECO = Object.freeze({
  FALTA_DATO: 'FALTA_DATO',   // nadie lo dice
  AMBIGUO: 'AMBIGUO',         // dos lecturas igual de válidas
  CONFLICTO: 'CONFLICTO',     // dos fuentes dicen cosas distintas
})

/** Las procedencias que NO pueden sostener un número en una cotización cerrada. */
export const NO_CONFIRMADAS = Object.freeze([PROCEDENCIA.INFERIDO, PROCEDENCIA.SUPUESTO, PROCEDENCIA.WEB])

/**
 * LOS ASCENSOS PROHIBIDOS. Segunda defensa, no la primera.
 *
 * La primera es estructural: ninguna función de este archivo escribe `procedencia`. Ésta es la red
 * por si mañana alguien agrega una que sí lo haga — y está nombrada para que el error diga por qué.
 */
export const ASCENSOS_PROHIBIDOS = Object.freeze([
  [PROCEDENCIA.WEB, PROCEDENCIA.HECHO_PROYECTO], [PROCEDENCIA.WEB, PROCEDENCIA.EXPERIENCIA_ECSAS],
  [PROCEDENCIA.WEB, PROCEDENCIA.NORMA], [PROCEDENCIA.WEB, PROCEDENCIA.BASE_MAESTRA],
  [PROCEDENCIA.REFERENCIA_CIRCOT, PROCEDENCIA.EXPERIENCIA_ECSAS],
  [PROCEDENCIA.INVESTIGACION, PROCEDENCIA.NORMA],
  [PROCEDENCIA.FABRICANTE, PROCEDENCIA.NORMA],
  [PROCEDENCIA.INFERIDO, PROCEDENCIA.HECHO_PROYECTO], [PROCEDENCIA.SUPUESTO, PROCEDENCIA.HECHO_PROYECTO],
  [PROCEDENCIA.WEB, PROCEDENCIA.FABRICANTE],
])

/** ¿Este cambio de procedencia está prohibido? PURA. */
export const ascensoProhibido = (de, a) => ASCENSOS_PROHIBIDOS.some(([x, y]) => x === de && y === a)

export const RUTA_POR_DEFECTO = path.join(
  path.dirname(new URL(import.meta.url).pathname), '..', '..', 'datos', 'conocimiento', 'biblioteca.json',
)

/** El ciclo de un documento. `ESTUDIADO` es el único que significa que salió conocimiento de él. */
export const ETAPA = Object.freeze({
  ADQUIRIDO: 'ADQUIRIDO', PARSEADO: 'PARSEADO', CLASIFICADO: 'CLASIFICADO',
  EXTRAIDO: 'EXTRAIDO', ESTUDIADO: 'ESTUDIADO', NO_LEIDO: 'NO_LEIDO',
})

/**
 * LA FICHA DE UN DOCUMENTO ESTUDIADO. PURA.
 *
 * `hash` es del CONTENIDO, no de la URL: es lo que contesta «¿cambió?» sin releer, y lo que evita
 * que el mismo documento entre dos veces con dos direcciones distintas.
 */
export function documento({ fuenteId, url, titulo, hash, formato = null, version = null, paginas = null, obtenidoEn = null, etapa = ETAPA.ADQUIRIDO, porQue = null } = {}) {
  if (!hash) throw new Error('un documento sin hash de contenido no se puede versionar ni deduplicar')
  return { id: `doc:${String(hash).slice(0, 16)}`, fuenteId: fuenteId ?? null, url: url ?? null, titulo: titulo ?? null, hash, formato, version, paginas, obtenidoEn, etapa, porQue }
}

/**
 * UNA UNIDAD DE CONOCIMIENTO. PURA.
 *
 * Sin `evidencia.textoLiteral` no entra: si no se puede citar la frase que lo dice, no se extrajo
 * de un documento — se dedujo, y entonces la procedencia honesta es INFERIDO. Es la misma regla que
 * gobierna `plano/fuente.mjs`, y está acá otra vez porque es la que hace defendible una cotización.
 */
export function conocimiento({
  clave, afirmacion, procedencia, evidencia = null, valor = null, unidad = null,
  condicion = null, jurisdiccion = null, vigencia = null, confianza = 'MEDIA',
  estado = ESTADO.CANDIDATO, version = 1, fecha = null, reemplazaA = null, area = null,
} = {}) {
  if (!clave || !afirmacion) throw new Error('un conocimiento necesita clave y afirmación')
  if (!PROCEDENCIA[procedencia]) throw new Error(`procedencia desconocida: ${procedencia}`)
  const citable = [PROCEDENCIA.NORMA, PROCEDENCIA.REFERENCIA_TECNICA, PROCEDENCIA.REFERENCIA_CIRCOT, PROCEDENCIA.INVESTIGACION, PROCEDENCIA.FABRICANTE, PROCEDENCIA.WEB]
  if (citable.includes(procedencia) && !evidencia?.textoLiteral) {
    throw new Error(`«${clave}» dice venir de ${procedencia} y no trae la frase que lo dice: sin cita literal la procedencia honesta es INFERIDO`)
  }
  return {
    id: `k:${huella({ clave, procedencia, version }).slice(0, 16)}`,
    clave: String(clave), afirmacion: String(afirmacion), procedencia,
    valor, unidad, condicion, jurisdiccion, vigencia, area,
    evidencia: evidencia ?? null, confianza, estado, version, fecha, reemplazaA,
  }
}

/** Un hueco declarado. Ocupa el mismo lugar que un conocimiento y dice por qué no hay número. PURA. */
export function hueco({ clave, tipo, porQue, quienLoTiene = null, opciones = null, fuentesEnConflicto = null } = {}) {
  if (!HUECO[tipo]) throw new Error(`tipo de hueco desconocido: ${tipo}`)
  return { id: `h:${huella({ clave, tipo }).slice(0, 16)}`, clave: String(clave), tipo, porQue: String(porQue), quienLoTiene, opciones, fuentesEnConflicto }
}

/** Carga la biblioteca del disco. Vacía es un estado legítimo: es cómo arranca. */
export function cargar({ ruta = RUTA_POR_DEFECTO } = {}) {
  try {
    const d = JSON.parse(fs.readFileSync(ruta, 'utf8'))
    return { version: d.version ?? 0, documentos: d.documentos ?? [], conocimientos: d.conocimientos ?? [], huecos: d.huecos ?? [] }
  } catch { return { version: 0, documentos: [], conocimientos: [], huecos: [] } }
}

/** Guarda y sube la versión. La versión es lo que permite volver: cada escritura queda en git. */
export function guardar(bib, { ruta = RUTA_POR_DEFECTO } = {}) {
  fs.mkdirSync(path.dirname(ruta), { recursive: true })
  const version = (bib.version ?? 0) + 1
  const orden = (a, b) => String(a.id).localeCompare(String(b.id))
  fs.writeFileSync(ruta, `${JSON.stringify({
    version,
    documentos: [...(bib.documentos ?? [])].sort(orden),
    conocimientos: [...(bib.conocimientos ?? [])].sort(orden),
    huecos: [...(bib.huecos ?? [])].sort(orden),
  }, null, 1)}\n`)
  return version
}

/** ¿Ya estudiamos este contenido? Se pregunta por HASH, no por URL: la misma norma publicada en dos
 *  direcciones es un solo documento, y la misma dirección con contenido nuevo es otro. PURA. */
export const yaEstudiado = (bib, hash) => (bib.documentos ?? []).some((d) => d.hash === hash && d.etapa === ETAPA.ESTUDIADO)

/** El documento anterior de la misma fuente, si el contenido cambió. Es cómo se detecta una versión
 *  nueva sin suscribirse a nada. PURA. */
export function cambioDeVersion(bib, { fuenteId, hash }) {
  const previos = (bib.documentos ?? []).filter((d) => d.fuenteId === fuenteId)
  if (!previos.length) return { cambio: false, previo: null, porQue: 'no hay versión anterior de esta fuente' }
  const igual = previos.find((d) => d.hash === hash)
  if (igual) return { cambio: false, previo: igual, porQue: 'el contenido es idéntico al que ya estudiamos' }
  const ultimo = previos[previos.length - 1]
  return { cambio: true, previo: ultimo, porQue: `el contenido de «${fuenteId}» cambió respecto de ${ultimo.id}` }
}

/** Incorpora documentos y conocimientos sin duplicar. PURA sobre la biblioteca (devuelve una nueva). */
export function incorporar(bib, { documentos = [], conocimientos = [], huecos = [] } = {}) {
  const porId = (lista, nuevos) => {
    const m = new Map(lista.map((x) => [x.id, x]))
    for (const n of nuevos) if (!m.has(n.id)) m.set(n.id, n)
    return [...m.values()]
  }
  return {
    ...bib,
    documentos: porId(bib.documentos ?? [], documentos),
    conocimientos: porId(bib.conocimientos ?? [], conocimientos),
    huecos: porId(bib.huecos ?? [], huecos),
  }
}

/**
 * VALIDAR UN CONOCIMIENTO. Mueve el ESTADO y NUNCA la procedencia.
 *
 * `firmante` es obligatorio y no puede ser el mismo que lo extrajo: la regla de cierre del repo
 * —«nadie cierra su propio trabajo»— vale igual para un dato que para un módulo.
 */
export function validar(bib, id, { firmante, extraidoPor = null, cuando = null, porQue = null } = {}) {
  if (!firmante) throw new Error('validar necesita un firmante: un dato que se valida solo no está validado')
  if (extraidoPor && firmante === extraidoPor) throw new Error(`«${firmante}» extrajo este conocimiento y no puede firmarlo: nadie cierra su propio trabajo`)
  let tocado = false
  const conocimientos = (bib.conocimientos ?? []).map((k) => {
    if (k.id !== id) return k
    tocado = true
    // `procedencia` NO se toca. Es el hecho de dónde salió, y validarlo no lo cambia.
    return { ...k, estado: ESTADO.VALIDADO, validacion: { firmante, cuando, porQue } }
  })
  if (!tocado) throw new Error(`no hay conocimiento con id «${id}»`)
  return { ...bib, conocimientos }
}

/** Marca un conocimiento como reemplazado por otro. El viejo NO se borra: sin él no se puede
 *  explicar una cotización firmada con el criterio anterior. PURA. */
export function reemplazar(bib, id, { porId, cuando = null } = {}) {
  return {
    ...bib,
    conocimientos: (bib.conocimientos ?? []).map((k) => (k.id === id ? { ...k, estado: ESTADO.REEMPLAZADO, reemplazadoPor: porId, reemplazadoEn: cuando } : k)),
  }
}

/**
 * BUSCAR CONOCIMIENTO — el camino rápido, sin modelo y sin red.
 *
 * Devuelve lo VALIDADO primero y lo CANDIDATO después, cada uno marcado: quien consume decide si un
 * candidato le alcanza. Nunca devuelve lo RECHAZADO ni lo REEMPLAZADO. PURA.
 */
export function saber(bib, clave, { jurisdiccion = null, incluirCandidatos = true } = {}) {
  const c = String(clave).toLowerCase()
  const usables = (bib.conocimientos ?? [])
    .filter((k) => k.estado === ESTADO.VALIDADO || (incluirCandidatos && k.estado === ESTADO.CANDIDATO))
    .filter((k) => k.clave.toLowerCase() === c || k.clave.toLowerCase().startsWith(`${c}.`))
    .filter((k) => !jurisdiccion || !k.jurisdiccion || k.jurisdiccion === jurisdiccion)
  const orden = { [ESTADO.VALIDADO]: 0, [ESTADO.CANDIDATO]: 1 }
  const encontrados = usables.sort((a, b) => orden[a.estado] - orden[b.estado] || b.version - a.version || a.id.localeCompare(b.id))
  const huecosDe = (bib.huecos ?? []).filter((h) => h.clave.toLowerCase() === c)
  return { encontrados, huecos: huecosDe, hay: encontrados.length > 0, sinModelo: true, sinRed: true }
}

/** El resumen que consume el reporte: cuántos documentos, en qué etapa, cuánto conocimiento y en qué
 *  estado. No inventa un puntaje: cuenta. PURA. */
export function inventario(bib) {
  const cuenta = (lista, campo) => lista.reduce((a, x) => { a[x[campo]] = (a[x[campo]] ?? 0) + 1; return a }, {})
  return {
    version: bib.version ?? 0,
    documentos: (bib.documentos ?? []).length,
    porEtapa: cuenta(bib.documentos ?? [], 'etapa'),
    conocimientos: (bib.conocimientos ?? []).length,
    porEstado: cuenta(bib.conocimientos ?? [], 'estado'),
    porProcedencia: cuenta(bib.conocimientos ?? [], 'procedencia'),
    huecos: (bib.huecos ?? []).length,
    porHueco: cuenta(bib.huecos ?? [], 'tipo'),
  }
}
