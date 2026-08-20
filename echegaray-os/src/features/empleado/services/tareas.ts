// MIS TAREAS — clasificarlas, ordenarlas y decir su estado sin inventarle una fecha a ninguna.
//
// ═══ TRES SOLAPAS, Y LA DEL MEDIO ES LA QUE SE LLENA DE BASURA ═══
//
// «Hoy» es lo que se trabaja hoy. «Próximas» es lo que viene. «Completadas» es lo hecho. La trampa
// está en las actividades SIN PLAN —212 de las 349 de este OS no tienen fecha— : si «sin fecha»
// cayera en Hoy, la pantalla del lunes a la mañana mostraría doscientas tareas y ninguna sería la
// del muro sur. Van a Próximas y se escriben como lo que son: «sin plan», en `faint`.
//
// Y NO SE LES PONE UNA FECHA DERIVADA. Suponer que una actividad sin inicio empieza hoy porque su
// predecesora terminó ayer es planificar desde la pantalla, y la planificación la hace el Gantt.

import type { MiTarea } from '../types'

export type Solapa = 'hoy' | 'proximas' | 'completadas'

export const SOLAPA_LABEL: Record<Solapa, string> = {
  hoy: 'Hoy', proximas: 'Próximas', completadas: 'Completadas',
}

/** ¿Está terminada? El estado manda sobre el porcentaje: una actividad marcada `hecha` al 90% la
 *  cerró alguien a propósito, y una al 100% que nadie cerró todavía está abierta. */
export const estaCompleta = (t: MiTarea) => t.estado === 'hecha'

/** ¿Se trabaja hoy? En curso, o el plan la cruza. Ni antes ni después: `fin_plan` de ayer con la
 *  actividad abierta es una tarea VENCIDA y también se trabaja hoy — más que ninguna. */
export function esDeHoy(t: MiTarea, hoy: string): boolean {
  if (estaCompleta(t)) return false
  if (t.estado === 'en_curso') return true
  if (!t.inicio_plan) return false
  return t.inicio_plan <= hoy
}

export function clasificar(tareas: MiTarea[], hoy: string): Record<Solapa, MiTarea[]> {
  const r: Record<Solapa, MiTarea[]> = { hoy: [], proximas: [], completadas: [] }
  for (const t of tareas) {
    if (estaCompleta(t)) r.completadas.push(t)
    else if (esDeHoy(t, hoy)) r.hoy.push(t)
    else r.proximas.push(t)
  }
  r.hoy = ordenar(r.hoy)
  r.proximas = ordenar(r.proximas)
  r.completadas = [...r.completadas].sort((a, b) =>
    (b.fin_plan ?? '').localeCompare(a.fin_plan ?? ''))
  return r
}

/** Lo bloqueado primero —es lo único que alguien puede destrabar—, después lo que vence antes, y lo
 *  que no tiene plan al final: sin fecha no compite con una fecha. */
export function ordenar(tareas: MiTarea[]): MiTarea[] {
  return [...tareas].sort((a, b) => {
    if ((b.impedimentos > 0 ? 1 : 0) !== (a.impedimentos > 0 ? 1 : 0)) {
      return (b.impedimentos > 0 ? 1 : 0) - (a.impedimentos > 0 ? 1 : 0)
    }
    return (a.fin_plan ?? '9999-12-31').localeCompare(b.fin_plan ?? '9999-12-31')
  })
}

/** El estado con su tono, tal como lo define el Design System. Un impedimento abierto NO reemplaza
 *  al estado: la tarea sigue en curso y además está frenada. Son dos señales y el diseño las pone en
 *  dos lugares — el estado a la derecha, el bloqueo debajo en `neg`. */
export function lecturaDeEstado(t: MiTarea): { texto: string; tono: 'pos' | 'curso' | 'pendiente' } {
  if (estaCompleta(t)) return { texto: 'Completada', tono: 'pos' }
  if (t.estado === 'en_curso') return { texto: 'En curso', tono: 'curso' }
  return { texto: 'Pendiente', tono: 'pendiente' }
}

/** Cómo se escribe la fecha de una tarea, incluida la ausencia. `hoy` entra por parámetro para que
 *  «vence hoy» se pueda probar sin esperar a mañana. */
export function lecturaDeFecha(t: MiTarea, hoy: string): { texto: string; vencida: boolean } {
  if (estaCompleta(t)) return { texto: t.fin_plan ? `terminada ${dm(t.fin_plan)}` : 'terminada', vencida: false }
  if (!t.fin_plan) return { texto: t.inicio_plan ? `desde ${dm(t.inicio_plan)}` : 'sin plan', vencida: false }
  if (t.fin_plan < hoy) return { texto: `vencía el ${dm(t.fin_plan)}`, vencida: true }
  if (t.fin_plan === hoy) return { texto: 'vence hoy', vencida: false }
  return { texto: `vence ${dm(t.fin_plan)}`, vencida: false }
}

/** `2026-08-20` → `20/08`. El año sólo cuando no es el de la fecha de referencia: en una lista de
 *  tareas de esta semana, repetir 2026 en cada fila es ruido. */
export function dm(iso: string, hoy?: string): string {
  const [a, m, d] = iso.slice(0, 10).split('-')
  if (!d) return iso
  return hoy && hoy.slice(0, 4) !== a ? `${d}/${m}/${a}` : `${d}/${m}`
}
