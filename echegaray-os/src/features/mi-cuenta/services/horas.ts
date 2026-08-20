// MIS HORAS — el total del período, y de qué está hecho.
//
// ═══ LOS DÍAS SIN REGISTRO NO APARECEN COMO 0 ═══
//
// Es la regla del handoff y la 8 de UX_PRINCIPLES aplicada a una tabla de asistencia. Un renglón
// «14/08 · 0,00 HH» AFIRMA que ese día la persona estuvo y no trabajó. Puede haber sido un feriado,
// un día que la obra todavía no imputó, o un domingo. La tabla lista lo que se imputó; lo que no
// está, no se dibuja, y el pie dice cuántos días distintos tiene el total para que nadie confunda
// «18 días trabajados» con «18 de los 20 días hábiles».
//
// ═══ QUÉ CUENTA COMO TRABAJADO ═══
//
// La definición es UNA y vive en `obras/services/tipoHora`: normal, extra 50% y extra 100%. Una
// ausencia tiene horas y no es trabajo — sumarla diría que la persona trabajó el día que faltó. Acá
// se importa, no se vuelve a escribir: dos definiciones de «hora trabajada» es la forma elegante de
// tener dos totales de sueldo.

import { esTrabajada, porTipo, type TipoHora } from '../../obras/services/tipoHora.ts'
import type { HoraPropia } from '../types'

export interface TotalObra {
  obraId: string
  obra: string
  horas: number
}

export interface ResumenHoras {
  /** Lo que SE TRABAJÓ en la ventana. Sin ausencias ni licencias. */
  trabajadas: number
  /** Días DISTINTOS con al menos una hora trabajada. No es la cantidad de filas: dos imputaciones
   *  del mismo día a dos actividades son un día, no dos. */
  dias: number
  porTipo: Record<TipoHora, number>
  obras: TotalObra[]
  /** Las filas de la ventana, de la más reciente a la más vieja. Es lo que dibuja la tabla. */
  filas: HoraPropia[]
}

/** Las horas de la ventana, ambas puntas inclusive. Una fila sin fecha no se puede ubicar en ningún
 *  período: queda afuera y se cuenta aparte, nunca se la mete en el mes en curso. */
export function enVentana(filas: HoraPropia[], desde: string, hasta: string): HoraPropia[] {
  return filas.filter((f) => f.fecha != null && f.fecha >= desde && f.fecha <= hasta)
}

export function sinFecha(filas: HoraPropia[]): number {
  return filas.filter((f) => f.fecha == null).length
}

export function resumen(filas: HoraPropia[], desde: string, hasta: string): ResumenHoras {
  const dentro = enVentana(filas, desde, hasta)
  const trabajo = dentro.filter((f) => esTrabajada(f.tipo_hora))

  const dias = new Set(trabajo.map((f) => f.fecha as string))

  // Se agrupa por el ID y se rotula con el NOMBRE: agrupar por nombre fusionaría dos obras que se
  // llaman parecido. Una fila sin obra se agrupa aparte y se dice — no se le cuelga a la última.
  const porObra = new Map<string, TotalObra>()
  for (const f of trabajo) {
    const clave = f.obra_id ?? '—'
    const previo = porObra.get(clave)
    if (previo) previo.horas += f.horas
    else porObra.set(clave, { obraId: clave, obra: (f.obra_id && f.obra) || 'sin obra', horas: f.horas })
  }

  return {
    trabajadas: trabajo.reduce((s, f) => s + f.horas, 0),
    dias: dias.size,
    porTipo: porTipo(dentro),
    obras: [...porObra.values()].sort((a, b) => b.horas - a.horas),
    filas: [...dentro].sort((a, b) => (b.fecha ?? '').localeCompare(a.fecha ?? '')),
  }
}

/** Horas con dos decimales y coma: `148,00`. Es como se escriben en el parte y en la liquidación, y
 *  cambiar el separador acá haría que el mismo número se vea distinto según la pantalla. */
export function hh(n: number): string {
  return n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
