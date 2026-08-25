// EL REPARTO DE UNA PARTIDA ENTRE FRENTES — la aritmética de la pantalla 13.
//
// ═══ ESTA ES LA REGLA MÁS CARA DEL MÓDULO ═══
//
// «La cantidad se conserva o no genera.» `convertir_partida_a_plan` compara `round(Σ frentes, 4)`
// contra `round(cantidad, 4)` y, si no coinciden, LANZA sin crear nada. Esa es la autoridad. Lo de
// acá es el control que la pantalla dibuja ANTES de llamar —el `Suma → 2,16 m³ ✓` en verde— para
// que nadie llene un formulario de seis frentes y recién al final descubra que le falta un metro.
//
// Los dos números tienen que coincidir SIEMPRE. Si el reparto de la pantalla y el control de la
// base discrepan, gana la base y el usuario ve un error que no entiende. Por eso se reparte en
// ENTEROS de diezmilésimo y no en punto flotante: `2,16 / 3` en coma flotante da tres partes que
// suman `2,1599999999999997`, y `round(...,4)` en Postgres las lee como `2,16` — hasta que la
// cantidad es otra y ya no. Un defecto que aparece una vez cada tantas cantidades es peor que uno
// que aparece siempre.
//
// ═══ POR QUÉ SE BLOQUEA LA PARTIDA SIN CÓMPUTO Y NO LA PARTIDA SIN ANÁLISIS ═══
//
// Son dos ausencias distintas y el modelo las trata distinto. Sin ANÁLISIS se convierte igual, sin
// HH y sin plazo: es deuda de carga declarada (`hh_plan` en NULL, nunca 0). Sin CÓMPUTO no hay
// cantidad contra la cual cerrar el reparto —el control de la base ni siquiera corre— y las
// actividades nacerían con un objetivo que nadie midió. Eso no es deuda declarada: es un plan que
// parece completo y no lo es.

import type { MetodoMedicion } from '../types/index.ts'

/** La escala de comparación: cuatro decimales, los mismos que redondea el control de la base. */
const ESCALA = 10_000

const aEntero = (n: number) => Math.round(n * ESCALA)
const aDecimal = (n: number) => n / ESCALA

export interface Frente {
  nombre: string
  cantidad: number
  /**
   * Cuándo arranca el frente, `YYYY-MM-DD`. OBLIGATORIO para generar: sin fecha, la conversión
   * creaba actividades que PARECEN planificadas y no tienen dimensión temporal — y `obra_avance`,
   * que sólo cuenta las que tienen `inicio_plan`, publicaba «sin actividades medidas» con el plan
   * entero cargado. Es opcional en el tipo porque el formulario lo llena después de repartir.
   */
  inicio?: string
  /** Cuánta gente va a este frente. Sin dotación el plan sale con inicio y SIN fin, declarado. */
  dotacion?: number | null
  /** El tope físico del frente: arriba de él, poner más gente no acorta nada. */
  tope?: number | null
}

/**
 * EL CONTROL DE FECHAS Y DOTACIÓN — el que decide si el botón «Generar» se puede apretar.
 *
 * Va separado de `controlDeCierre` porque son dos preguntas distintas: una es «¿la cantidad se
 * conserva?» y la otra «¿esto se puede ubicar en el tiempo?». La autoridad de las dos es
 * `convertir_partida_a_plan`; acá se comprueban antes para que nadie llene seis frentes y recién al
 * final descubra que le falta una fecha.
 */
export function controlDeFechas(
  frentes: readonly Frente[],
): { ok: boolean; motivo: string | null; sinDotacion: boolean } {
  const sinFecha = frentes.find((f) => !f.inicio)
  if (sinFecha) {
    return {
      ok: false, sinDotacion: false,
      motivo: `El frente «${sinFecha.nombre}» no tiene fecha de inicio: sin fecha no se generan actividades.`,
    }
  }
  const dotacionMala = frentes.find((f) => f.dotacion != null && !(Number.isFinite(f.dotacion) && f.dotacion > 0))
  if (dotacionMala) {
    return {
      ok: false, sinDotacion: false,
      motivo: `El frente «${dotacionMala.nombre}» declara una dotación de cero: no es una dotación.`,
    }
  }
  const sobreTope = frentes.find((f) => f.dotacion != null && f.tope != null && f.dotacion > f.tope)
  if (sobreTope) {
    return {
      ok: false, sinDotacion: false,
      motivo: `El frente «${sobreTope.nombre}» pone ${sobreTope.dotacion} personas sobre un tope de ${sobreTope.tope}: arriba del tope, más gente no acorta nada.`,
    }
  }
  return { ok: true, motivo: null, sinDotacion: frentes.some((f) => f.dotacion == null) }
}

/**
 * REPARTO IGUAL POR RESTO MAYOR. La suma de las partes es EXACTAMENTE el total, por construcción.
 *
 * Los diezmilésimos que sobran del piso van a los primeros frentes, no al último: en una lista de
 * tres, «1,08 / 1,08 / 1,08» con el resto en el último se lee como que el último es distinto. Y en
 * un empate gana el que viene primero, así el resultado es el mismo cada vez que se corre — que es
 * lo que hace posible probarlo.
 *
 * `null` cuando no hay cantidad (partida sin cómputo) o cuando el número de frentes no es válido.
 */
export function repartirIgual(cantidad: number | null, n: number): number[] | null {
  if (cantidad === null || !Number.isFinite(cantidad) || cantidad < 0) return null
  if (!Number.isInteger(n) || n < 1) return null
  const total = aEntero(cantidad)
  const base = Math.floor(total / n)
  const resto = total - base * n
  return Array.from({ length: n }, (_, i) => aDecimal(base + (i < resto ? 1 : 0)))
}

/** La suma de los frentes, con el mismo redondeo que aplica la base antes de comparar. */
export function sumaDeFrentes(frentes: readonly Frente[]): number {
  return aDecimal(frentes.reduce((acc, f) => acc + aEntero(Number.isFinite(f.cantidad) ? f.cantidad : 0), 0))
}

/**
 * EL CONTROL DE CIERRE, con el mismo criterio que la función de Postgres.
 *
 * Una partida SIN cómputo devuelve `cierra: false` con motivo propio: la base la dejaría pasar
 * —su `if` sólo corre cuando `cantidad is not null`— y esta pantalla no la deja, por lo escrito
 * arriba.
 */
export function controlDeCierre(
  frentes: readonly Frente[],
  cantidadPartida: number | null,
): { cierra: boolean; suma: number; falta: number | null; motivo: string | null } {
  const suma = sumaDeFrentes(frentes)
  if (cantidadPartida === null) {
    return { cierra: false, suma, falta: null, motivo: 'La partida no tiene cómputo: cargá la cantidad antes de convertir.' }
  }
  if (frentes.length === 0) {
    return { cierra: false, suma: 0, falta: cantidadPartida, motivo: 'Sin frentes no hay nada que generar.' }
  }
  if (frentes.some((f) => !Number.isFinite(f.cantidad) || f.cantidad <= 0)) {
    return { cierra: false, suma, falta: null, motivo: 'Hay un frente sin cantidad: un frente de 0 no es un frente.' }
  }
  const falta = aDecimal(aEntero(cantidadPartida) - aEntero(suma))
  if (falta !== 0) {
    return {
      cierra: false, suma, falta,
      motivo: `Los frentes suman ${suma} y la partida tiene ${cantidadPartida}: la cantidad no se conserva.`,
    }
  }
  return { cierra: true, suma, falta: 0, motivo: null }
}

/**
 * CUÁNTAS ACTIVIDADES VA A CREAR LA CONVERSIÓN — el número que anuncia el botón primario.
 *
 * Replica `v_n_act` de `convertir_partida_a_plan`. Los contenedores (el rubro y cada frente) son
 * `tipo = 'resumen'` y NO se cuentan: el botón promete tareas ejecutables, no filas del árbol. Si
 * este número y el que devuelve la base no coincidieran, el mensaje de éxito diría una cosa y la
 * obra tendría otra.
 */
export function actividadesPrevistas(nFrentes: number, nPasos: number): number {
  if (nFrentes < 1) return 0
  // REGLA 1 · obra chica sin burocracia: un frente y sin plantilla → UNA sola actividad.
  if (nPasos === 0) return nFrentes
  return nFrentes * nPasos
}

/**
 * EL MÉTODO QUE VA A QUEDAR. Replica el `coalesce` de la función, más la regla de la pantalla:
 * «Sin pasos» no puede quedar en método `pasos` — no habría pasos por los que avanzar, y la
 * actividad quedaría con un método de medición que no se puede registrar.
 */
export function metodoEfectivo(
  elegido: MetodoMedicion | null,
  metodoDeLaPartida: MetodoMedicion | null,
  tienePlantilla: boolean,
): MetodoMedicion {
  const m = elegido ?? metodoDeLaPartida ?? (tienePlantilla ? 'pasos' : 'cantidad')
  if (!tienePlantilla && m === 'pasos') return 'cantidad'
  return m
}

/** Las HH que le tocan a un frente. `null` —nunca 0— si la partida no tiene rendimiento cargado. */
export function hhDelFrente(cantidadFrente: number, hsUnitarias: number | null): number | null {
  if (hsUnitarias === null || !Number.isFinite(hsUnitarias)) return null
  return cantidadFrente * hsUnitarias
}

export interface NodoPlan {
  nivel: number
  texto: string
  /** `tarea` es lo que se va a poder ejecutar; `resumen` es el contenedor del árbol. */
  tipo: 'resumen' | 'tarea'
}

/**
 * EL ÁRBOL QUE SE VA A GENERAR, tal como lo dibuja el bloque «4 · PLAN QUE SE VA A GENERAR».
 *
 * Es la misma decisión que toma la función en Postgres, escrita una segunda vez para poder
 * MOSTRARLA antes de ejecutar. Que sea una segunda escritura es deliberado y acotado: no calcula
 * cantidades ni HH que después se guarden — sólo la FORMA. La cantidad y las HH que se guardan
 * salen de la base.
 */
export function arbolPrevisto(args: {
  obra: string
  rubro: string | null
  descripcion: string
  frentes: readonly Frente[]
  pasos: readonly { nombre: string }[]
}): NodoPlan[] {
  const nodos: NodoPlan[] = [
    { nivel: 0, texto: args.obra, tipo: 'resumen' },
    { nivel: 1, texto: args.rubro ?? 'Sin rubro', tipo: 'resumen' },
  ]
  const unaSola = args.pasos.length === 0 && args.frentes.length === 1
  if (unaSola) {
    nodos.push({ nivel: 2, texto: args.descripcion, tipo: 'tarea' })
    return nodos
  }
  for (const f of args.frentes) {
    nodos.push({ nivel: 2, texto: f.nombre, tipo: 'resumen' })
    if (args.pasos.length === 0) {
      nodos.push({ nivel: 3, texto: args.descripcion, tipo: 'tarea' })
    } else {
      for (const p of args.pasos) nodos.push({ nivel: 3, texto: p.nombre, tipo: 'tarea' })
    }
  }
  return nodos
}

/** Los nombres por defecto: `Frente 1`, `Frente 2`… y `Frente único` cuando hay uno solo. */
export function nombresPorDefecto(n: number): string[] {
  if (n === 1) return ['Frente único']
  return Array.from({ length: n }, (_, i) => `Frente ${i + 1}`)
}
