// LA SEMANA DE UNA PERSONA, DÍA POR DÍA — el bloque que el canónico 20 pone arriba del Resumen.
//
// NO ES `asistenciaSemana.ts`, y la diferencia importa: ese archivo arma la GRILLA de asistencia de
// una cuadrilla —quién declaró qué día, para cargar—. Éste lee `registros_hh` de UNA persona ya
// imputada y devuelve las siete barras de su ficha. Fuentes distintas, preguntas distintas.
//
// ═══ EL DÍA SIN REGISTRO NO ES UN DÍA DE CERO HORAS ═══
//
// La barra de un martes sin imputar y la de un martes en que la persona no trabajó se dibujarían
// idénticas si las dos valieran 0. No son lo mismo: una dice «nadie cargó las horas todavía» y la
// otra dice «este día no vino». Por eso `horas` es `number | null`, y el `null` se escribe «—».
//
// ═══ AUSENCIA NO SUMA HH PERO TAMPOCO ES UN HUECO ═══
//
// Una ausencia o una licencia son un HECHO cargado: el día tiene registro. Se devuelve con
// `horas: 0` y `estado: 'ausencia'`, que es lo que deja pintar la barra distinta —el canónico la
// dibuja con marco rosado, no vacía—.

import { esTrabajada } from '../../obras/services/tipoHora.ts'
import type { ImputacionHH } from '../types'

export type EstadoDia = 'trabajado' | 'ausencia' | 'sin_registro'

export interface DiaDeSemana {
  /** ISO `AAAA-MM-DD`. */
  fecha: string
  /** Lun · Mar · … tal como los rotula el canónico. */
  rotulo: string
  /** HH trabajadas del día. `null` cuando NO hay ningún registro: no es cero. */
  horas: number | null
  estado: EstadoDia
}

const ROTULOS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'] as const

function sumarDias(iso: string, n: number): string {
  const t = new Date(`${iso}T00:00:00Z`)
  t.setUTCDate(t.getUTCDate() + n)
  return t.toISOString().slice(0, 10)
}

/** Los siete días de la semana que arranca en `lunes`, con las HH que tiene cada uno. */
export function semanaDePersona(filas: ImputacionHH[], lunes: string): DiaDeSemana[] {
  return ROTULOS.map((rotulo, i) => {
    const fecha = sumarDias(lunes, i)
    const delDia = filas.filter((f) => f.fecha === fecha)
    if (delDia.length === 0) return { fecha, rotulo, horas: null, estado: 'sin_registro' as const }
    const trabajadas = delDia.filter((f) => esTrabajada(f.tipo_hora))
    if (trabajadas.length === 0) return { fecha, rotulo, horas: 0, estado: 'ausencia' as const }
    return {
      fecha,
      rotulo,
      horas: trabajadas.reduce((s, f) => s + f.horas, 0),
      estado: 'trabajado' as const,
    }
  })
}

/** El total de la semana, para el renglón mono de la derecha del encabezado. `null` si nadie cargó
 *  nada: un «0,0 h» sobre una semana sin imputar afirma que la persona no trabajó. */
export function totalDeLaSemana(dias: DiaDeSemana[]): number | null {
  const conRegistro = dias.filter((d) => d.horas != null)
  if (conRegistro.length === 0) return null
  return conRegistro.reduce((s, d) => s + (d.horas ?? 0), 0)
}
