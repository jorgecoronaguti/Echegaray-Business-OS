// LO QUE EL PANEL DE LA TAREA (04) CALCULA — PURO: entran datos, salen filas. Ninguna lectura.
//
// ═══ POR QUÉ ACÁ Y NO ADENTRO DEL COMPONENTE ═══
//
// Las tres cosas de abajo deciden: qué restricción respeta el plazo que se promete, con qué
// rendimiento se está trabajando, y en cuánto queda cada frente cuando una actividad se parte. Un
// cálculo que decide y vive dentro de un JSX no se puede probar sin un navegador, y lo que no se
// prueba se rompe en silencio.
//
// LA MATEMÁTICA DE DOTACIÓN → DURACIÓN NO ESTÁ ACÁ. Vive en `dotacion.ts` (`duracionDias`,
// `dotacionNecesaria`), que a su vez es el puerto de las funciones de Postgres. Este archivo la
// CONSUME; escribir una segunda cuenta para el panel sería la forma más rápida de que la 04 y la 08
// contesten distinto sobre la misma actividad.

import { rendimiento } from './dotacion.ts'

// ── LAS RESTRICCIONES QUE RESPETA EL CÁLCULO ─────────────────────────────────

/** Una restricción se muestra CON SU FUENTE. Un límite sin origen obliga a creerle a la pantalla. */
export interface Restriccion {
  clave: string
  valor: string
  fuente: string
}

export interface InsumosRestricciones {
  topeFrente: number | null
  /** Lo declara la actividad (`obra_actividad.tiempo_tecnico`). No se deduce de tener días de plan. */
  tiempoTecnico: boolean
  diasPlan: number | null
  jornadaHoras: number | null
  /** isodow: 1 = lunes … 7 = domingo. */
  diasHabiles: number[] | null
  /** Capacidad PONDERADA de la cuadrilla asignada (`cuadrilla_capacidad`), no cantidad de cabezas. */
  capacidadCuadrilla: number | null
  cuadrilla: string | null
}

const DIA_CORTO = ['', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom']

/** «lun a vie» cuando los días son corridos; «lun · mié · vie» cuando no. Sin inventar un rango que
 *  la obra no declaró: una obra que trabaja lunes, miércoles y viernes no trabaja «lun a vie». */
export function calendarioLegible(dias: number[] | null): string | null {
  const limpios = [...new Set((dias ?? []).filter((d) => Number.isInteger(d) && d >= 1 && d <= 7))]
    .sort((a, b) => a - b)
  if (!limpios.length) return null
  if (limpios.length === 1) return DIA_CORTO[limpios[0]]
  const corridos = limpios.every((d, k) => k === 0 || d === limpios[k - 1] + 1)
  return corridos
    ? `${DIA_CORTO[limpios[0]]} a ${DIA_CORTO[limpios[limpios.length - 1]]}`
    : limpios.map((d) => DIA_CORTO[d]).join(' · ')
}

/**
 * LAS RESTRICCIONES QUE EL CÁLCULO RESPETA DE VERDAD — sólo las que están en el modelo.
 *
 * ═══ LO QUE EL DESIGN PIDE Y NO SE DIBUJA, POR ESCRITO ═══
 *
 * El contrato visual lista además «Composición del análisis 50/50» y «Disponibilidad real: 2 con
 * licencia». Ninguna de las dos entra hoy en `duracionDias`: la composición de la cuadrilla existe
 * en `cuadrilla_capacidad` como UN número ponderado y no como una proporción por actividad, y la
 * disponibilidad de personal es de la OBRA, no de esta actividad — la 08 la usa para avisar que se
 * pidió más gente de la que hay, que es otra pregunta. Dibujarlas acá sería decir que el plazo las
 * respeta cuando no las mira.
 */
export function restriccionesDe(i: InsumosRestricciones): Restriccion[] {
  const filas: Restriccion[] = []
  if (i.topeFrente != null) {
    filas.push({
      clave: 'Tope del frente',
      valor: `${i.topeFrente} ${i.topeFrente === 1 ? 'persona' : 'personas'}`,
      fuente: 'declarado en la actividad',
    })
  }
  if (i.tiempoTecnico) {
    filas.push({
      clave: 'Tiempo técnico',
      // Curar, fraguar o secar son días fijos: no se comprimen con más gente. Si nadie cargó
      // cuántos, se dice —«sin días cargados»— en vez de asumir cero, que los borraría del plazo.
      valor: i.diasPlan != null && i.diasPlan > 0
        ? `curado o espera · ${i.diasPlan} d fijos`
        : 'curado o espera · sin días cargados',
      fuente: 'lo declaró la plantilla del paso',
    })
  }
  if (i.jornadaHoras != null) {
    filas.push({
      clave: 'Jornada',
      valor: `${i.jornadaHoras.toLocaleString('es-AR', { maximumFractionDigits: 1 })} hs`,
      fuente: 'jornada de la obra',
    })
  }
  const cal = calendarioLegible(i.diasHabiles)
  if (cal) filas.push({ clave: 'Calendario', valor: cal, fuente: 'días hábiles de la obra' })
  if (i.capacidadCuadrilla != null) {
    filas.push({
      clave: 'Capacidad de la cuadrilla',
      // Dos oficiales y dos ayudantes son cuatro personas y 3,2 de capacidad. El número que divide
      // las HH es éste, no la cantidad de cabezas.
      valor: `${i.cuadrilla ? `${i.cuadrilla} · ` : ''}${i.capacidadCuadrilla.toLocaleString('es-AR', { maximumFractionDigits: 2 })}`,
      fuente: 'capacidad ponderada por categoría',
    })
  }
  return filas
}

// ── LA CADENA DE RENDIMIENTO ─────────────────────────────────────────────────

export interface Eslabon {
  clave: string
  /** HH por unidad. `null` = no se puede calcular, y `falta` dice por qué. */
  valor: number | null
  falta: string
  fuente: string
  /** El observado se destaca: es el único que sale de lo que pasó, no de lo que alguien estimó. */
  destacado: boolean
}

export interface InsumosRendimiento {
  /** `rendimiento_recomendado.hs_analisis`: el análisis VIGENTE de la tarea tipo. */
  hsAnalisis: number | null
  tieneTareaTipo: boolean
  /** `cotizacion_partida.hs_unitarias`: la copia CONGELADA. NULL mientras el presupuesto es borrador. */
  hsPresupuestada: number | null
  vieneDeUnaPartida: boolean
  /** Si quien mira no ve economía, la partida ni se leyó. No es que no exista. */
  puedeVerPartida: boolean
  hhPlan: number | null
  cantidadObjetivo: number | null
  hhReal: number | null
  cantidadEjecutada: number | null
  historico: {
    mediana: number | null
    muestra: number
    obras: number
    lectura: string | null
  } | null
}

/**
 * TEÓRICO → PRESUPUESTADO → PLANIFICADO → REAL → HISTÓRICO, en la misma unidad (hs por unidad).
 *
 * Los cinco son el MISMO número medido en cinco momentos distintos, y por eso van uno debajo del
 * otro: la distancia entre el teórico y el observado es lo que la obra está aprendiendo, y la
 * distancia entre el presupuestado y el observado es lo que la obra está perdiendo o ganando.
 *
 * Ninguno se rellena con otro. Cuando falta, dice POR QUÉ falta — «sin análisis vigente» y «el
 * presupuesto no está congelado» son dos ausencias distintas y se arreglan en lugares distintos.
 */
export function cadenaDeRendimiento(i: InsumosRendimiento): Eslabon[] {
  return [
    {
      clave: 'Teórico (base maestra)',
      valor: i.hsAnalisis,
      falta: i.tieneTareaTipo ? 'sin análisis vigente' : 'sin tarea tipo vinculada',
      fuente: 'análisis vigente de la tarea tipo',
      destacado: false,
    },
    {
      clave: 'Presupuestado',
      valor: i.hsPresupuestada,
      falta: !i.vieneDeUnaPartida
        ? 'no viene de un presupuesto'
        : (!i.puedeVerPartida ? 'la partida es dato económico' : 'el presupuesto no está congelado'),
      fuente: 'partida congelada del presupuesto',
      destacado: false,
    },
    {
      clave: 'Planificado',
      valor: rendimiento(i.hhPlan, i.cantidadObjetivo),
      falta: i.hhPlan == null ? 'sin HH plan' : 'sin cantidad objetivo',
      fuente: 'HH plan ÷ cantidad objetivo',
      destacado: false,
    },
    {
      clave: 'Real observado',
      valor: rendimiento(i.hhReal, i.cantidadEjecutada),
      falta: i.hhReal == null ? 'sin horas imputadas' : 'sin producción cargada',
      fuente: 'HH imputadas ÷ cantidad ejecutada',
      destacado: true,
    },
    {
      clave: historicoClave(i.historico),
      valor: i.historico?.mediana ?? null,
      falta: i.historico?.lectura ?? 'sin histórico',
      fuente: 'mediana de las obras ya medidas',
      destacado: false,
    },
  ]
}

function historicoClave(h: InsumosRendimiento['historico']): string {
  if (!h || h.obras === 0) return 'Histórico'
  return `Histórico · ${h.obras} ${h.obras === 1 ? 'obra' : 'obras'} · ${h.muestra} ${h.muestra === 1 ? 'registro' : 'registros'}`
}

// ── DIVIDIR EN FRENTES ───────────────────────────────────────────────────────

/** Los nombres tal como se escribieron: coma o renglón separan, y el orden se respeta. */
export function frentesDelTexto(texto: string): string[] {
  return texto.split(/[\n,;]/).map((t) => t.trim()).filter((t) => t.length > 0)
}

/** Con cuántos decimales se reparte y se compara. Es el MISMO que usa `convertir_partida_a_plan`
 *  para decidir si la cantidad se conserva (`round(…, 4)`): dos tolerancias distintas darían dos
 *  respuestas distintas a la misma pregunta. */
export const DECIMALES_REPARTO = 4

const ESCALA = 10 ** DECIMALES_REPARTO

/**
 * REPARTIR UNA CANTIDAD EN N PARTES SIN PERDER NADA.
 *
 * Se reparte en enteros de la última cifra y el resto se distribuye de a uno entre las primeras
 * partes: 10 en 3 da 3,3334 · 3,3333 · 3,3333. Lo que importa no es el decimal, es que la SUMA
 * vuelva a dar el total — partir una actividad y que la obra pierda 0,02 m³ en el camino es una
 * fuga que no grita.
 */
export function repartirCantidad(total: number, n: number): number[] {
  if (!Number.isFinite(total) || !Number.isInteger(n) || n <= 0) return []
  const enteros = Math.round(total * ESCALA)
  const base = Math.trunc(enteros / n)
  const resto = enteros - base * n
  const paso = Math.sign(resto)
  return Array.from({ length: n }, (_, k) => (base + (k < Math.abs(resto) ? paso : 0)) / ESCALA)
}

/** LA REGLA DE LA CONVERSIÓN, otra vez: si las partes no suman el total, no se genera nada. */
export function conservaLaCantidad(partes: readonly number[], total: number): boolean {
  const suma = partes.reduce((a, b) => a + b, 0)
  return Math.round(suma * ESCALA) === Math.round(total * ESCALA)
}

/** El reparto de una cantidad que puede no estar cargada. `null` se reparte como `null`: una
 *  actividad sin cantidad objetivo genera frentes sin cantidad objetivo, no frentes en cero. */
export function repartirOpcional(total: number | null, n: number): (number | null)[] {
  if (total == null) return Array.from({ length: n }, () => null)
  return repartirCantidad(total, n)
}

/** Lo mínimo que hace falta saber de una actividad para decidir si se puede partir en frentes. */
export interface CandidataADividir {
  esContenedor: boolean
  tieneHijas: boolean
  tipo: string
  /** Con partida de origen la división la manda la conversión, no el panel. */
  cotizacionPartidaId: string | null
  /** Cuántos avances tiene registrados. Con uno solo ya no se puede: quedaría contra un contenedor. */
  nAvances: number
  nPasos: number
  /** El tipo del padre. `'resumen'` o `null` (cuelga de la raíz) habilitan; cualquier otro quiere
   *  decir que ésta es una SUBTAREA, y una subtarea no lleva subtareas. */
  tipoPadre: string | null
}

/**
 * POR QUÉ ESTA ACTIVIDAD NO SE PUEDE PARTIR EN FRENTES. `null` = se puede.
 *
 * Es el espejo de `porQueNoSePuedeDividir` en `actionsEstructura.ts`, que es la que manda: la
 * pantalla evita ofrecer el gesto, el servidor rechaza la escritura. Los dos motivos dicen lo mismo
 * a propósito — una pantalla que impide algo por un motivo y un servidor que lo impide por otro deja
 * a la persona arreglando lo que no era.
 *
 * El orden importa: se contesta el motivo MÁS DE FONDO primero. A una actividad que ya es contenedor
 * no le sirve enterarse de que además tiene avances cargados.
 */
export function motivoNoDividir(a: CandidataADividir): string | null {
  if (a.esContenedor || a.tieneHijas) return 'ya es un contenedor, y sus frentes se agregan adentro.'
  if (a.tipo === 'hito') return 'un hito marca una fecha y no lleva trabajo: no hay nada que repartir.'
  if (a.cotizacionPartidaId) {
    return 'salió de convertir una partida del presupuesto, y los frentes de una partida los declara la conversión — que es la dueña de que la cantidad cierre contra la partida original.'
  }
  if (a.tipoPadre != null && a.tipoPadre !== 'resumen') {
    return 'es una subtarea de otra actividad, y una subtarea no lleva subtareas.'
  }
  if (a.nAvances > 0) {
    return `tiene ${a.nAvances} avance(s) registrados: quedarían colgados de un contenedor y fuera de todo total. Primero hay que reimputarlos.`
  }
  if (a.nPasos > 0) {
    return 'se mide por pasos, y sus pasos quedarían colgados de un contenedor. Primero hay que decidir de qué frente es cada paso.'
  }
  return null
}
