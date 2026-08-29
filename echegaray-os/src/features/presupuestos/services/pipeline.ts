// 13 · EN QUÉ PASO ESTÁ DE VERDAD ESTA CADENA. PURA.
//
// ═══ QUÉ ESTABA MAL ═══
//
// `PipelineConversion.tsx` tenía `const ACTUAL = 3` y una barra fija en 60 %. El dibujo afirmaba
// cinco cosas: que la base maestra está lista, que el presupuesto está hecho, que estamos en la
// conversión, y que el plan de obra y la ejecución NO pasaron. Ninguna de las cinco miraba un dato.
// Un presupuesto sin análisis cargado mostraba el paso 1 con un tilde verde; uno ya convertido
// mostraba el paso 4 en gris.
//
// ═══ LO QUE NO SE PUEDE LEER SE DICE «SIN DATO», NO «PENDIENTE» ═══
//
// «Pendiente» es una afirmación: dice que eso todavía no pasó. Si la pantalla no tiene con qué
// saberlo, la afirmación es inventada — y en el paso 5 (ejecución) esta pantalla no tiene con qué.
// El cuarto estado existe para eso, y es la diferencia entre un pipeline honesto y un adorno.

export type EstadoPaso = 'hecho' | 'actual' | 'pendiente' | 'sin-dato'

export interface Paso {
  n: number
  titulo: string
  sub: string
  estado: EstadoPaso
  /** De qué dato sale el estado. Es lo que hace revisable el dibujo. */
  porQue: string
}

/** Los hechos que la pantalla de conversión SÍ puede leer. `undefined` = no lo pudo mirar. */
export interface HechosDelPipeline {
  /** Cuántas partidas tiene el presupuesto. */
  nPartidas: number
  /** Cuántas de ésas no tienen composición cargada. */
  nSinAnalisis: number
  /** `congelada_en` de la cotización. */
  congelado: boolean
  /** Cuántas partidas ya se convirtieron en frentes/actividades. */
  nConvertidas: number
  /** La obra tiene fecha de inicio de plan: el plan existe como cronograma. */
  planConFechas: boolean
  /**
   * Si hay avance real cargado. `undefined` a propósito: esta pantalla no lee avance, y decir
   * «pendiente» sin haberlo mirado sería afirmar que la obra no arrancó.
   */
  hayAvance?: boolean
}

/**
 * LOS CINCO PASOS CON SU ESTADO REAL. PURA.
 *
 * El paso ACTUAL no es una constante: es el primero que todavía no está hecho. En la pantalla de
 * conversión eso suele dar 3, pero da 4 cuando ya se convirtió todo — y ahí el dibujo tiene que
 * decir que lo que falta es el plan, no seguir señalando la conversión.
 */
export function pasosDelPipeline(h: HechosDelPipeline): Paso[] {
  const base: Omit<Paso, 'estado'>[] = [
    {
      n: 1, titulo: 'Base maestra', sub: 'análisis y rendimientos',
      porQue: h.nPartidas === 0
        ? 'el presupuesto no tiene partidas'
        : `${h.nPartidas - h.nSinAnalisis} de ${h.nPartidas} partidas con análisis cargado`,
    },
    {
      n: 2, titulo: 'Presupuesto', sub: 'cantidad × análisis × precio',
      porQue: h.congelado ? 'el presupuesto está congelado' : 'todavía no se congeló: el precio puede moverse',
    },
    {
      n: 3, titulo: 'Conversión', sub: 'de estructura económica a operativa',
      porQue: h.nPartidas === 0 ? 'no hay partidas que convertir' : `${h.nConvertidas} de ${h.nPartidas} partidas convertidas`,
    },
    {
      n: 4, titulo: 'Plan de obra', sub: 'WBS, frentes, dependencias',
      porQue: h.planConFechas ? 'la obra tiene fecha de inicio de plan' : 'la obra todavía no tiene fecha de inicio de plan',
    },
    {
      n: 5, titulo: 'Ejecución', sub: 'avance y HH reales',
      porQue: h.hayAvance === undefined
        ? 'esta pantalla no lee el avance de la obra: no puede decir si arrancó'
        : h.hayAvance ? 'hay avance cargado' : 'no hay avance cargado',
    },
  ]

  const hecho = [
    h.nPartidas > 0 && h.nSinAnalisis === 0,
    h.congelado,
    h.nPartidas > 0 && h.nConvertidas === h.nPartidas,
    h.planConFechas,
    h.hayAvance === true,
  ]

  // El paso ACTUAL es el primero sin hacer. Si están todos hechos, no hay actual: la cadena terminó.
  const actual = hecho.findIndex((x) => !x)

  return base.map((p, i) => ({
    ...p,
    estado: hecho[i]
      ? 'hecho'
      : i === actual
        ? 'actual'
        // Sólo el paso 5 puede quedar sin dato, y sólo cuando nadie lo miró.
        : (p.n === 5 && h.hayAvance === undefined) ? 'sin-dato' : 'pendiente',
  }))
}

/**
 * CUÁNTO DE LA CADENA ESTÁ HECHO, en fracción. `null` si no se puede afirmar. PURA.
 *
 * La barra vieja estaba clavada en `3/5 = 60 %` y decía «paso 3 de 5» pasara lo que pasara. Ahora
 * cuenta los pasos HECHOS. Los pasos que nadie pudo mirar NO cuentan como no-hechos: se sacan del
 * denominador, porque meterlos ahí publicaría un avance más bajo que el real por una limitación de
 * la pantalla, no de la obra.
 */
export function avanceDelPipeline(pasos: Paso[]): { hechos: number; medibles: number; fraccion: number } | null {
  const medibles = pasos.filter((p) => p.estado !== 'sin-dato')
  if (medibles.length === 0) return null
  const hechos = medibles.filter((p) => p.estado === 'hecho').length
  return { hechos, medibles: medibles.length, fraccion: hechos / medibles.length }
}
