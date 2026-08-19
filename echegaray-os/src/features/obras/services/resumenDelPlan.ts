// LAS CIFRAS DE UNA OBRA, EN UNA LÍNEA.
//
// Son las respuestas a lo que se pregunta al abrir la obra: cómo viene, cuántas horas lleva, si se
// está pasando, cuánto trabajo hay, qué está trabado y qué viene. Nada más.
//
// ═══ SE CALCULAN DE LAS ACTIVIDADES QUE YA ESTÁN EN PANTALLA ═══
//
// No hay una consulta nueva: entra el mismo array que dibujan el Gantt, la Lista y el Tablero. Una
// consulta propia para la franja sería la manera de que el titular diga 53% mientras la fila de
// abajo dice 40% — los dos «bien» según su propia cuenta.
//
// ═══ LO QUE FALTA NO ES CERO ═══
//
// Un desvío de HH sin plan cargado no es 0%: es desconocido, y devuelve `null`. Publicarlo como cero
// diría «vamos justo» sobre una obra que nadie presupuestó en horas.

import type { Actividad, Restriccion } from '../types'

export interface ResumenDelPlan {
  /** Promedio de las actividades con fecha. Es el MISMO criterio que `obra_avance`, que es lo que
   *  lee el portafolio: si acá se ponderara por HH, la obra tendría dos avances. */
  avance: number | null
  hhReal: number | null
  hhPlan: number | null
  /** `hh_real − hh_plan` en horas. `null` si falta cualquiera de las dos puntas. */
  desvioHH: number | null
  actividades: number
  enCurso: number
  impedimentosAbiertos: number
  /** Impedimentos abiertos cuya fecha de compromiso ya pasó. Ésos son los que duelen. */
  impedimentosVencidos: number
  /** Actividades que arrancan o terminan dentro de la ventana. */
  proximas: number
}

const suma = (xs: (number | null | undefined)[]) => {
  const validos = xs.filter((x): x is number => typeof x === 'number')
  return validos.length === 0 ? null : validos.reduce((a, b) => a + b, 0)
}

export function resumenDelPlan(
  actividades: Actividad[], impedimentos: Restriccion[], hoy: string, semanas = 2,
): ResumenDelPlan {
  const vivas = actividades.filter((a) => a.tipo !== 'resumen' && !a.archivada)
  const conAvance = vivas.filter((a) => a.inicio_plan && a.avance_pct != null)
  const avance = conAvance.length === 0
    ? null
    : Math.round(conAvance.reduce((s, a) => s + (a.avance_pct as number), 0) / conAvance.length)

  const hhReal = suma(vivas.map((a) => a.hh_real))
  const hhPlan = suma(vivas.map((a) => a.hh_plan))

  const hasta = new Date(`${hoy}T00:00:00Z`)
  hasta.setUTCDate(hasta.getUTCDate() + semanas * 7)
  const limite = hasta.toISOString().slice(0, 10)
  const dentro = (f: string | null) => f != null && f >= hoy && f <= limite

  const abiertos = impedimentos.filter((i) => !i.fecha_liberacion)

  return {
    avance,
    hhReal,
    hhPlan,
    desvioHH: hhReal == null || hhPlan == null ? null : Math.round((hhReal - hhPlan) * 10) / 10,
    actividades: vivas.length,
    enCurso: vivas.filter((a) => a.estado_operativo === 'en_curso').length,
    impedimentosAbiertos: abiertos.length,
    impedimentosVencidos: abiertos.filter((i) => i.fecha_compromiso != null && i.fecha_compromiso < hoy).length,
    // Una actividad «próxima» es la que arranca o termina en la ventana: las dos cosas obligan a
    // mirarla esta quincena. Contar sólo los inicios esconde lo que hay que cerrar.
    proximas: vivas.filter((a) => a.estado_operativo !== 'hecha' && (dentro(a.inicio_plan) || dentro(a.fin_plan))).length,
  }
}
