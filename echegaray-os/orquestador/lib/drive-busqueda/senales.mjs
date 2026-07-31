// QUÉ CLASE DE DOCUMENTO ES ESTE — todo lo que no es parecido de nombre.
//
// El buscador viejo devolvía el primer archivo con el nombre más parecido. Pedir "el flujo de
// fondos" traía `Flujo de Fondos.xlsx`, adentro de `AÑO 2025`, tocado por última vez en enero
// —el nombre coincidía perfecto— cuando el documento que la empresa usa todos los días es el
// Sheet vivo `Flujo de Caja - Cash Flow ECSAS`. El nombre coincidía y la respuesta era inútil.
//
// Parecerse de nombre es UNA señal. Faltaban las otras: si el documento está vivo, si el OS lo
// usa, si está enterrado en una carpeta de archivo muerto, si hace un año que nadie lo abre.
// Este módulo las calcula. No decide nada — le pone nombre a lo que después el ranking pesa.
//
// ── DE DÓNDE SALE "DOCUMENTO ACTIVO" ────────────────────────────────────────────────
//
// No de una lista escrita a mano acá. Sale de `public.fuentes_datos`, el registro que el OS ya
// mantiene de sus propias fuentes de negocio: nombre, área, proceso, vigencia, estado,
// criticidad y última lectura. Ahí ya están declarados el Flujo de Caja, Compras, Daily
// Meeting, IVA, Vehículos, Control de Gastos, Cotizaciones, Fondo de Cese y Facturas.
//
// Es la diferencia entre resolver un caso y construir un motor: el día que Dirección registre
// una fuente nueva, el buscador la prioriza sin que nadie toque una línea de código. Y si
// alguien marca una fuente como reemplazada (`duplicada_de`), el buscador deja de proponerla
// primero — sin una segunda verdad que envejece sola.
//
// Determinístico de punta a punta: no hay ningún modelo acá.

import { plano, canonico, tokenizar } from './normalizar.mjs'

const DIA_MS = 86_400_000

/** Carpetas que dicen "esto ya no se usa". Salen de los nombres REALES del Drive de la
 *  empresa —"Archivos Viejos" ×10, "AÑO 2025", "Viejo"— no de una lista imaginada. */
const MARCAS_HISTORICAS = [
  'viejo', 'vieja', 'viejos', 'viejas', 'historico', 'historica', 'historicos', 'historicas',
  'backup', 'respaldo', 'obsoleto', 'obsoleta', 'anterior', 'anteriores', 'desuso', 'descartado',
]

/** "Copia de 5) BALANCE ECSAS - 2023.pdf" es un duplicado, no el documento. */
const RE_COPIA = /^(copia|copy)\s+(de|of)\s+|\(\d+\)\s*$|[-_\s](copia|copy|bak)\s*$/i

/** Los formatos que Google mantiene vivos: se editan en el navegador y se guardan solos. Un
 *  .xlsx en Drive es una foto de una planilla; un Sheet es la planilla. */
const VIVOS = new Set([
  'application/vnd.google-apps.spreadsheet',
  'application/vnd.google-apps.document',
  'application/vnd.google-apps.presentation',
])

const segmentos = (path) => String(path ?? '').split('/').map((s) => s.trim()).filter(Boolean)

/**
 * ¿Este tramo de ruta es un año ya cerrado?
 *
 * Se pide que el año sea el tramo ENTERO ("2024", "AÑO 2025") y no que aparezca adentro de un
 * nombre: "OBRA OSSE 16:9:2022" es el nombre de una obra, no una carpeta de archivo, y
 * penalizarla escondería un presupuesto que alguien puede estar buscando.
 */
export function esAnioCerrado(segmento, ahora = Date.now()) {
  const m = plano(segmento).match(/^(?:a[nñ]o\s+(?:de\s+)?)?((?:19|20)\d{2})$/)
  if (!m) return false
  return Number(m[1]) < new Date(ahora).getUTCFullYear()
}

/** ¿El archivo vive en una carpeta de archivo muerto? Mira la ruta entera: basta con que UN
 *  tramo lo diga, porque lo que cuelga de "Archivos Viejos" es viejo aunque se llame lindo. */
export function esHistorico(path, ahora = Date.now()) {
  for (const seg of segmentos(path).slice(0, -1)) {
    if (esAnioCerrado(seg, ahora)) return true
    const palabras = plano(seg).split(' ')
    if (palabras.some((p) => MARCAS_HISTORICAS.includes(p))) return true
  }
  return false
}

export const esCopia = (name) => RE_COPIA.test(String(name ?? '').trim())

export const esDocumentoVivo = (mime) => VIVOS.has(String(mime ?? ''))

/** Días sin tocar. `null` si no hay fecha: no se inventa una antigüedad. */
export function diasSinTocar(modified, ahora = Date.now()) {
  if (!modified) return null
  const t = new Date(modified).getTime()
  if (Number.isNaN(t)) return null
  return Math.max(0, (ahora - t) / DIA_MS)
}

// ── El registro de fuentes del OS ────────────────────────────────────────────

/** Cómo se lee `public.fuentes_datos`. Se piden sólo las columnas que el ranking mira. */
export const SQL_FUENTES = `select drive_file_id, nombre, area, proceso_negocio, vigencia, estado,
  criticidad, duplicada_de, ultima_lectura, ultima_sincronizacion_exitosa
  from public.fuentes_datos where drive_file_id is not null`

/**
 * Las filas del registro → un mapa por `drive_file_id`, ya interpretado.
 *
 * `texto` junta nombre + área + proceso: son maneras legítimas de pedir el documento que no
 * están en el nombre del archivo. "el padrón de flota" es VEHICULOS; "tesorería" es el Flujo.
 */
export function crearRegistro(filas = []) {
  const m = new Map()
  for (const f of filas ?? []) {
    const id = f?.drive_file_id
    if (!id) continue
    const usadoEn = f.ultima_sincronizacion_exitosa ?? f.ultima_lectura ?? null
    m.set(id, {
      nombre: f.nombre ?? null,
      area: f.area ?? null,
      vigente: String(f.vigencia ?? '').toLowerCase() === 'vigente',
      actualizada: String(f.estado ?? '').toLowerCase() === 'actualizado',
      critica: String(f.criticidad ?? '').toLowerCase() === 'alta',
      reemplazada: Boolean(f.duplicada_de),
      usadoEn,
      tokens: tokenizar([f.nombre, f.area, f.proceso_negocio].filter(Boolean).join(' ')),
    })
  }
  return m
}

/**
 * La naturaleza de un candidato, en una sola forma.
 *
 * @param {{name:string, path?:string, mime_type?:string, modified_time?:string}} e
 * @param {{ahora?:number, fuente?:object|null}} [opts]
 */
export function naturalezaDe(e, { ahora = Date.now(), fuente = null, estado = null } = {}) {
  const declarado = estado?.estado ?? null
  return {
    // `historico` es SIEMPRE la inferencia por carpeta. Quien decide si se aplica es el
    // ranking: cuando hay estado declarado, ese reemplaza a la inferencia (ver puntuarNaturaleza).
    historico: esHistorico(e.path, ahora),
    copia: esCopia(e.name),
    vivo: esDocumentoVivo(e.mime_type),
    dias: diasSinTocar(e.modified_time, ahora),
    fuente: fuente ?? null,
    declarado,
  }
}

// ── LO QUE LA EMPRESA DECLARA ────────────────────────────────────────────────
//
// Todo lo de arriba es INFERENCIA: que un archivo cuelgue de "AÑO 2025" sugiere que está
// archivado, no lo demuestra. `drive_documento_estado` existe para que una persona pueda
// decirlo y que su palabra gane — sin tocar código, y sin que el buscador tenga una lista de
// documentos especiales escrita adentro.

/** Los seis estados que el negocio puede declarar. El orden no es alfabético: va de "este es
 *  EL documento" a "esto ya no se usa". */
export const ESTADO = Object.freeze({
  CANONICO: 'canonico',
  OPERATIVO: 'operativo',
  HISTORICO: 'historico',
  ARCHIVADO: 'archivado',
  REEMPLAZADO: 'reemplazado',
  DUPLICADO: 'duplicado',
})

/** Los que dicen "esto ya no es lo que buscás". */
const APAGADOS = new Set([ESTADO.HISTORICO, ESTADO.ARCHIVADO, ESTADO.REEMPLAZADO, ESTADO.DUPLICADO])

export const SQL_ESTADOS = `select drive_file_id, estado, motivo, reemplazado_por
  from public.drive_documento_estado`

/** Filas de `drive_documento_estado` → mapa por archivo. */
export function crearEstados(filas = []) {
  const m = new Map()
  for (const f of filas ?? []) {
    if (!f?.drive_file_id || !f?.estado) continue
    m.set(f.drive_file_id, {
      estado: String(f.estado).toLowerCase(),
      motivo: f.motivo ?? null,
      reemplazadoPor: f.reemplazado_por ?? null,
    })
  }
  return m
}

export const estaApagado = (estado) => APAGADOS.has(String(estado ?? '').toLowerCase())

/** ¿Alguno de los tokens pedidos aparece en el texto del registro? Es lo que habilita el pase
 *  de rescate: un documento operativo no puede quedar afuera por la etapa. */
export function fuenteCoincide(fuente, tokens = []) {
  if (!fuente?.tokens?.length || !tokens.length) return false
  const suyos = fuente.tokens.map(canonico)
  return tokens.some((t) => suyos.includes(t))
}
