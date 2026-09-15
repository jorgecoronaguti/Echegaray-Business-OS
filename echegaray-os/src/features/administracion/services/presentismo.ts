// PRESENTISMO — llegar tarde o irse antes pierde el 20 % del básico (dueño, 15/09/2026).
//
// Parte de lo que hoy cobra un obrero pasa a llamarse presentismo: 20 % × (horas de la quincena ÷ 2)
// × básico UOCRA de su categoría (art. 52 CCT 76/75). Sin ninguna tardanza ni salida temprana en la
// quincena cobra lo mismo que hoy; con UNA sola pierde el presentismo entero. No hay plata nueva.
//
// Ejemplo aprobado: Agüero, oficial, 16–31/08, 105 h → 0,2 × 52,5 × 6.348 = $66.654. Cobra $627.000
// sin marcas; $560.346 con una.
//
// ═══ LA REGLA VIVE ACÁ Y EN NINGÚN OTRO LADO ═══
//
// La cadena de pago (`aplicarOverrides`) la llama con las horas que quedaron —manuales o de la app—,
// el cuadro de la quincena la muestra y el sello la congela. Ninguno de los tres recalcula un número:
// si mañana el porcentaje cambia, cambia acá y los tres lo siguen.
//
// ═══ CUÁNDO NO RIGE ═══
//
//   · Antes de la quincena 16–30/09/2026 (`PRESENTISMO_DESDE`): lo sellado no se toca, y una quincena
//     abierta anterior tampoco cambia de reglas a mitad de camino.
//   · Los jefes de obra y quien cobra por mes: el presentismo es del convenio de obreros.
//   · Un cuadro cerrado: es una foto (R6) y su presentismo es el que quedó sellado, no éste.
//   · Sin categoría en el legajo o sin básico cargado: se dice «sin categoría» y NO se inventa un
//     importe ni queda como pendiente del cierre (dueño: «sin categoría, 0, sin pendiente»).

import type { ModalidadDeLiquidacion } from './liquidacionQuincena.ts'

export const PRESENTISMO_PCT = 0.2
/** La primera quincena que liquida con presentismo. Se compara contra `quincena.desde`. */
export const PRESENTISMO_DESDE = '2026-09-16'

/** La marca de un día, tal como la guardó el jefe en `asistencia_dia`. */
export interface TardanzaDelDia {
  fecha: string
  llegoTarde: boolean
  salioAntes: boolean
}

export type EstadoPresentismo =
  /** Rige y no lo perdió: cobra lo de siempre; el importe es la parte que se llama presentismo. */
  | 'aplica'
  /** Rige y hay al menos una marca: se descuenta el importe entero. */
  | 'perdido'
  /** Rige pero el legajo no tiene categoría o la escala no tiene su básico: 0, sin pendiente. */
  | 'sin_categoria'
  /** Rige pero no hay horas con qué calcularlo. */
  | 'sin_horas'
  /** No rige: jefe, mensual, quincena anterior al 16/09/2026 o cuadro cerrado. */
  | 'no_rige'

export interface PresentismoDeLinea {
  estado: EstadoPresentismo
  /** 20 % × (horas ÷ 2) × básico. `null` cuando no se puede calcular; nunca 0 por defecto. */
  importe: number | null
  /** Las fechas (ISO) con marca, ordenadas. Vacío = no lo perdió. */
  perdido: string[]
  basico: number | null
  categoria: string | null
}

/** Lo que la cadena de pago sabe de la persona ANTES de conocer sus horas finales. */
export interface EntradaDePresentismo {
  categoria: string | null
  /** El básico por hora de su categoría (`pisoVigente`), o `null` si la escala no lo tiene. */
  basico: number | null
  tardanzas: readonly TardanzaDelDia[]
  /** `quincena.desde` (ISO). Decide si la regla ya rige. */
  quincenaDesde: string
  modalidad: ModalidadDeLiquidacion
  esJefe: boolean
  cerrada: boolean
}

const r2 = (n: number): number => Math.round(n * 100) / 100

export function rigePresentismo(e: Pick<EntradaDePresentismo, 'quincenaDesde' | 'modalidad' | 'esJefe' | 'cerrada'>): boolean {
  return e.quincenaDesde >= PRESENTISMO_DESDE && e.modalidad === 'hora' && !e.esJefe && !e.cerrada
}

/** Las fechas con marca, ordenadas y sin repetir. UNA basta: el presentismo se pierde entero. */
export function fechasPerdidas(tardanzas: readonly TardanzaDelDia[]): string[] {
  return [...new Set(tardanzas.filter((t) => t.llegoTarde || t.salioAntes).map((t) => t.fecha))].sort()
}

/** El importe: 20 % × (horas ÷ 2) × básico. `null` sin horas o sin básico. */
export function importeDePresentismo(horas: number | null, basico: number | null): number | null {
  if (horas == null || !Number.isFinite(horas) || basico == null || !(basico > 0)) return null
  return r2(PRESENTISMO_PCT * (horas / 2) * basico)
}

export function presentismoDeLinea(e: EntradaDePresentismo, horas: number | null): PresentismoDeLinea {
  const base = { basico: e.basico, categoria: e.categoria }
  if (!rigePresentismo(e)) return { ...base, estado: 'no_rige', importe: null, perdido: [] }
  const perdido = fechasPerdidas(e.tardanzas)
  if (e.basico == null || !(e.basico > 0) || !e.categoria) return { ...base, estado: 'sin_categoria', importe: null, perdido }
  const importe = importeDePresentismo(horas, e.basico)
  if (importe == null) return { ...base, estado: 'sin_horas', importe: null, perdido }
  return { ...base, estado: perdido.length > 0 ? 'perdido' : 'aplica', importe, perdido }
}

/** Lo que cobra: lo de hoy, o lo de hoy menos el presentismo si lo perdió. Sin plata nueva. */
export function cobraConPresentismo(cobra: number | null, p: PresentismoDeLinea | null): number | null {
  if (cobra == null || p == null || p.estado !== 'perdido' || p.importe == null) return cobra
  return r2(cobra - p.importe)
}

/** «17/09» · «17/09, 23/09». Para la celda y para la columna sellada. */
export function fechasCortas(fechas: readonly string[]): string {
  return fechas.map((f) => `${f.slice(8, 10)}/${f.slice(5, 7)}`).join(', ')
}

export interface TotalesDePresentismo {
  /** La suma del importe de quien lo tiene (aplica o perdido): lo que está en juego. */
  enJuego: number
  /** La suma de lo descontado. */
  perdido: number
  /** Cuántas líneas lo perdieron. */
  perdidos: number
  sinCategoria: number
}

export function totalesDePresentismo(lineas: readonly { presentismo: PresentismoDeLinea | null }[]): TotalesDePresentismo {
  const t: TotalesDePresentismo = { enJuego: 0, perdido: 0, perdidos: 0, sinCategoria: 0 }
  for (const { presentismo: p } of lineas) {
    if (!p) continue
    if (p.estado === 'sin_categoria') t.sinCategoria++
    if (p.importe == null) continue
    t.enJuego += p.importe
    if (p.estado === 'perdido') { t.perdido += p.importe; t.perdidos++ }
  }
  t.enJuego = r2(t.enJuego)
  t.perdido = r2(t.perdido)
  return t
}
