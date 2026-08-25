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

import { avanceAgregado } from './avance.ts'
import type { Actividad, Restriccion } from '../types'

export interface ResumenDelPlan {
  /** El avance de las actividades con fecha, por la ÚNICA regla del OS (`avanceAgregado`):
   *  ponderado por `hh_plan`, promedio simple sólo cuando ninguna declara HH. Entero, porque es lo
   *  que publica `obra_avance` —la vista que lee el portafolio— y la ficha no puede decir otro
   *  número que el listado de obras sobre las mismas actividades. */
  avance: number | null
  hhReal: number | null
  hhPlan: number | null
  /** `hh_real − hh_plan` en horas. `null` si falta cualquiera de las dos puntas. */
  desvioHH: number | null
  actividades: number
  /** Las que no tienen NINGUNA fecha —ni plan, ni línea base sellada, ni un parte encima—, según
   *  `actividad_fechas.tiene_fecha`. Es lo que falta programar, y es el MISMO número que publica
   *  `obra_plan_vs_real.actividades_sin_fecha`: la regla vive en la vista, acá sólo se cuenta lo
   *  que la vista marcó. Cuando cada pantalla decidía sola qué era «sin fecha» —una miraba
   *  `inicio_plan`, otra dibujaba con `fin_plan`—, la misma actividad tenía y no tenía fecha. */
  sinFecha: number
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
  // UNA SOLA REGLA DE AVANCE AGREGADO para todo el OS: `avanceAgregado` en `avance.ts`. Acá se
  // promediaba simple mientras `obra_avance` ponderaba por HH: la misma obra podía decir 50 % en la
  // ficha y 10 % en el portafolio, sin un solo error. El set es el mismo que mide la vista —viva,
  // con fecha de inicio— y el redondeo a entero también.
  const { pct } = avanceAgregado(
    vivas.filter((a) => a.inicio_plan).map((a) => ({ avance_pct: a.avance_pct, hh_plan: a.hh_plan })),
  )
  const avance = pct == null ? null : Math.round(pct)

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
    sinFecha: vivas.filter((a) => a.tiene_fecha === false).length,
    enCurso: vivas.filter((a) => a.estado_operativo === 'en_curso').length,
    impedimentosAbiertos: abiertos.length,
    impedimentosVencidos: abiertos.filter((i) => i.fecha_compromiso != null && i.fecha_compromiso < hoy).length,
    // Una actividad «próxima» es la que arranca o termina en la ventana: las dos cosas obligan a
    // mirarla esta quincena. Contar sólo los inicios esconde lo que hay que cerrar.
    proximas: vivas.filter((a) => a.estado_operativo !== 'hecha' && (dentro(a.inicio_plan) || dentro(a.fin_plan))).length,
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// LO QUE EL RESUMEN DE LA OBRA DECIDE — la regla que vivía dentro del `.tsx`.
//
// `node --test` sabe borrar los tipos de un `.ts` pero no de un `.tsx`, así que una regla metida
// adentro de un componente sólo se puede ejercitar levantando un navegador — y entonces no se
// ejercita. Ésta decide QUÉ TRABAJO entra en la ventana de las próximas dos semanas, que es la
// mitad de lo que contesta el Resumen. La pantalla sólo la dibuja.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/** Una actividad de la ventana «Próximas 2 semanas» del Resumen. */
export interface ProximaActividad {
  id: string
  nombre: string
  rubro: string | null
  inicio_plan: string | null
  fin_plan: string | null
  hito: boolean
  /** La fecha por la que entró a la ventana. Es la que ordena, y la que se muestra primero. */
  ancla: string
}

/**
 * LO QUE HAY QUE MIRAR ESTA QUINCENA: lo que arranca o lo que termina dentro de la ventana.
 *
 * Las dos cosas obligan a mirarla, y contar sólo los inicios esconde lo que hay que cerrar — es el
 * mismo criterio que usa `resumenDelPlan().proximas`, a propósito: si acá se contara distinto, el
 * titular diría «4 próximas» sobre una lista de 6.
 *
 * Lo HECHO no entra aunque su fecha caiga adentro: ya no es trabajo por venir.
 */
export function proximasDeLaObra(
  actividades: Actividad[], hoy: string, semanas = 2,
): ProximaActividad[] {
  const hasta = new Date(`${hoy}T00:00:00Z`)
  hasta.setUTCDate(hasta.getUTCDate() + semanas * 7)
  const limite = hasta.toISOString().slice(0, 10)
  const dentro = (f: string | null) => f != null && f >= hoy && f <= limite

  return actividades
    .filter((a) => !a.archivada && a.tipo !== 'resumen' && a.estado_operativo !== 'hecha')
    .filter((a) => dentro(a.inicio_plan) || dentro(a.fin_plan))
    .map((a) => ({
      id: a.id,
      nombre: a.nombre,
      rubro: a.rubro,
      inicio_plan: a.inicio_plan,
      fin_plan: a.fin_plan,
      hito: a.tipo === 'hito',
      // Si arranca en la ventana manda el arranque; si ya venía en curso, manda su cierre.
      ancla: (dentro(a.inicio_plan) ? a.inicio_plan : a.fin_plan) as string,
    }))
    .sort((x, y) => x.ancla.localeCompare(y.ancla) || x.nombre.localeCompare(y.nombre, 'es'))
}
