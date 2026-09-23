// LA FICHA DE REVISIÓN DE RODADOS Y MÁQUINAS (migración 20260923T1510) — puro: sin Supabase, sin React.
//
// Dueño, 23/09: «rodados y maquinarias tienen que tener una ficha de revisión para ir cargando los datos
// de revisión técnica; sería todo en la sección Mantenimiento». Acá está lo que la pantalla necesita
// decidir: qué tipos de revisión lleva cada clase, qué decir de un vencimiento (semáforo) y en qué orden
// listar el parque para que lo vencido esté arriba.
//
// ═══ LO QUE DICE LA RTO (argentina.gob.ar/seguridadvial/revisiontecnica, leído el 23/09/2026) ═══
// El resultado es apto, apto condicional o rechazado. El condicional se emite una sola vez y lleva el
// plazo de la nueva verificación; vencido ese plazo se considera rechazado. Un rechazado no circula.
// Por eso un `condicional` sin vencimiento no se acepta y un `rechazado` se pinta como vencido aunque
// tenga fecha por delante: la fecha del certificado no lo habilita.
//
// ═══ VACÍO NO ES CERO ═══
// Sin la migración no hay «al día»: hay «sin la migración». Sin revisión cargada, el estado es «sin
// cargar», que no es un vencimiento en verde.

import type { Activo, Clase } from '../types.ts'

export type TipoRevision = 'rto' | 'service' | 'seguro' | 'inspeccion'
export type ResultadoRevision = 'apto' | 'condicional' | 'rechazado'
export type ClaseRevisable = Extract<Clase, 'rodado' | 'equipo'>

export interface Revision {
  id: string
  activo_id: string
  tipo: TipoRevision
  /** ISO yyyy-mm-dd. */
  fecha: string
  vencimiento: string | null
  /** km (rodado) u horas (equipo). null = no se cargó. */
  lectura: number | null
  resultado: ResultadoRevision | null
  lugar: string | null
  numero: string | null
  costo: number | null
  observaciones: string | null
  adjunto_url: string | null
  creado_en: string
  creado_por: string | null
}

/** Una fila de `activo_revision_vigente`: la última por tipo, con los días que le quedan (los calcula la vista). */
export interface RevisionVigente extends Revision {
  /** Negativo = vencida; null = no vence o no se cargó. */
  dias: number | null
}

/** La migración que crea `activo_revision`; la pantalla la nombra cuando falta. */
export const MIGRACION_REVISION = '20260923T1510'
export const COLUMNAS_REVISION =
  'id, activo_id, tipo, fecha, vencimiento, lectura, resultado, lugar, numero, costo, observaciones, adjunto_url, creado_en, creado_por'
export const COLUMNAS_REVISION_VIGENTE = `${COLUMNAS_REVISION}, dias`

export const NOMBRE_REVISION: Record<TipoRevision, string> = {
  rto: 'RTO', service: 'Service', seguro: 'Seguro', inspeccion: 'Inspección',
}

export const NOMBRE_RESULTADO: Record<ResultadoRevision, string> = {
  apto: 'Apto', condicional: 'Apto condicional', rechazado: 'Rechazado',
}

/** Qué revisiones lleva cada clase, en el orden en que se leen. Una máquina no tiene RTO ni patente. */
export const TIPOS_POR_CLASE: Record<ClaseRevisable, TipoRevision[]> = {
  rodado: ['rto', 'seguro', 'service', 'inspeccion'],
  equipo: ['service', 'inspeccion'],
}

/** Sólo la RTO y la inspección tienen resultado apto/condicional/rechazado; el service y el seguro, no. */
export const CON_RESULTADO: TipoRevision[] = ['rto', 'inspeccion']

export const UNIDAD_LECTURA: Record<ClaseRevisable, 'km' | 'h'> = { rodado: 'km', equipo: 'h' }

/** A cuántos días de vencer se empieza a avisar: una RTO se saca con turno, un mes es el aviso útil. */
export const AVISO_DIAS = 30

export function seRevisa<T extends Pick<Activo, 'clase' | 'estado'>>(a: T): a is T & { clase: ClaseRevisable } {
  return a.estado !== 'baja' && (a.clase === 'rodado' || a.clase === 'equipo')
}

export type TonoSemaforo = 'neg' | 'warn' | 'pos' | 'tenue'
export interface Semaforo { tono: TonoSemaforo; texto: string; alerta: boolean }

const plural = (n: number, a: string, b: string) => `${n} ${n === 1 ? a : b}`
const ddmmaa = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`

/** Días entre hoy y una fecha ISO, en días enteros de calendario. Negativo = ya pasó. */
export function diasHasta(iso: string, hoy: Date): number {
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number)
  const objetivo = Date.UTC(a, m - 1, d)
  const h = Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())
  return Math.round((objetivo - h) / 86_400_000)
}

/**
 * Qué decir de la revisión vigente de un tipo. Cuatro estados, no tres: vencida (rojo), por vencer
 * (ámbar), al día (verde) y SIN CARGAR (tenue), que es el que siempre se pierde y no es «al día».
 * `hoy` manda sobre `dias` de la vista cuando se pasa: la vista lo calculó al leer y la pantalla puede
 * quedar abierta.
 */
export function semaforo(r: Pick<RevisionVigente, 'vencimiento' | 'resultado' | 'dias'> | null | undefined, hoy?: Date): Semaforo {
  if (!r) return { tono: 'tenue', texto: 'sin cargar', alerta: false }
  if (r.resultado === 'rechazado') return { tono: 'neg', texto: 'rechazada · no circula', alerta: true }
  if (r.vencimiento == null) return { tono: 'tenue', texto: 'sin vencimiento', alerta: false }
  const dias = hoy ? diasHasta(r.vencimiento, hoy) : r.dias
  if (dias == null) return { tono: 'tenue', texto: 'sin vencimiento', alerta: false }
  if (dias < 0) return { tono: 'neg', texto: `vencida hace ${plural(-dias, 'día', 'días')}`, alerta: true }
  if (dias === 0) return { tono: 'warn', texto: 'vence hoy', alerta: true }
  if (dias <= AVISO_DIAS) return { tono: 'warn', texto: `vence en ${plural(dias, 'día', 'días')}`, alerta: true }
  return { tono: 'pos', texto: `al día · ${ddmmaa(r.vencimiento)}`, alerta: false }
}

/** La vigente de un tipo para un activo, si está. */
export function vigenteDe(vigentes: readonly RevisionVigente[] | null | undefined, activoId: string, tipo: TipoRevision): RevisionVigente | null {
  return (vigentes ?? []).find((r) => r.activo_id === activoId && r.tipo === tipo) ?? null
}

/** El historial de un activo, de la más nueva a la más vieja. */
export function historialDe(revisiones: readonly Revision[] | null | undefined, activoId: string): Revision[] {
  return (revisiones ?? []).filter((r) => r.activo_id === activoId)
    .sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : a.creado_en < b.creado_en ? 1 : -1))
}

export interface ProximoVencimiento { tipo: TipoRevision; revision: RevisionVigente; semaforo: Semaforo }

/**
 * Lo más urgente de un activo: la vigente que vence antes (una rechazada cuenta como vencida hoy).
 * `null` = ninguna vigente con vencimiento: la fila dice «sin cargar».
 */
export function proximoVencimiento(a: Pick<Activo, 'id' | 'clase'>, vigentes: readonly RevisionVigente[] | null | undefined, hoy: Date): ProximoVencimiento | null {
  if (a.clase !== 'rodado' && a.clase !== 'equipo') return null
  let mejor: (ProximoVencimiento & { orden: number }) | null = null
  for (const tipo of TIPOS_POR_CLASE[a.clase]) {
    const r = vigenteDe(vigentes, a.id, tipo)
    if (!r) continue
    const s = semaforo(r, hoy)
    const orden = r.resultado === 'rechazado' ? -1 : r.vencimiento ? diasHasta(r.vencimiento, hoy) : Number.POSITIVE_INFINITY
    if (!Number.isFinite(orden) && orden > 0) continue
    if (!mejor || orden < mejor.orden) mejor = { tipo, revision: r, semaforo: s, orden }
  }
  return mejor
}

export interface FilaRevision { activo: Activo; proximo: ProximoVencimiento | null; orden: number }

/**
 * Rodados y máquinas vivos, lo vencido primero, después lo por vencer, después lo al día y al final lo
 * sin cargar (que no está «bien»: está sin mirar). `vigentes === null` = sin la migración: todos «sin cargar».
 */
export function listaDeRevision(activos: readonly Activo[], vigentes: readonly RevisionVigente[] | null | undefined, hoy: Date): FilaRevision[] {
  const filas: FilaRevision[] = activos.filter(seRevisa).map((activo) => {
    const proximo = proximoVencimiento(activo, vigentes, hoy)
    const orden = !proximo ? Number.POSITIVE_INFINITY
      : proximo.revision.resultado === 'rechazado' ? -1_000_000
        : diasHasta(proximo.revision.vencimiento as string, hoy)
    return { activo, proximo, orden }
  })
  return filas.sort((x, y) => x.orden - y.orden || x.activo.nombre.localeCompare(y.activo.nombre, 'es'))
}

/** Cuántos rodados y máquinas tienen algo vencido o por vencer. `null` sin la migración: nunca «0». */
export function cuantosConAlerta(filas: readonly FilaRevision[], sinMigracion: boolean): number | null {
  if (sinMigracion) return null
  return filas.filter((f) => f.proximo?.semaforo.alerta).length
}

/** El texto de la lectura: «84.320 km», «1.240 h», o «sin cargar». */
export function textoLecturaRevision(lectura: number | null | undefined, unidad: 'km' | 'h'): string {
  if (lectura == null) return 'sin cargar'
  return `${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 }).format(lectura)} ${unidad}`
}
