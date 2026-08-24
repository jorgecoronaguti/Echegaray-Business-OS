// 08 · EL IMPACTO DE LA SIMULACIÓN — plan contra simulado, en cuatro celdas.
//
// ═══ POR QUÉ ES UNA COMPARACIÓN Y NO TRES NÚMEROS SUELTOS ═══
//
// El canónico 08 dibuja «Impacto de la simulación» con el valor del PLAN y, al lado, el simulado
// con su flecha. La pantalla tenía tres cifras sueltas —gente total, fin de obra, contra el plan—
// que dicen dónde se llegó pero no de dónde se salió: mover un stepper cambiaba el número y no
// había con qué compararlo salvo la memoria.
//
// ═══ LO QUE ESTA CAPA SE NIEGA A DECIR ═══
//
// · Un fin de obra que el calendario no alcanza. `null` es «fuera del calendario que mandó el
//   servidor», no una fecha inventada.
// · «0 HH» cuando ningún frente tiene análisis cargado. Las HH no cambian con la dotación —es el
//   punto de la pantalla— pero eso no las convierte en cero cuando no están.
// · «igual al plan» cuando la simulación no es ejecutable. Un frente que pide más gente de la que
//   entra no está «igual»: no se puede hacer, y eso le gana a cualquier otra lectura.

export type Direccion = 'sube' | 'baja' | 'igual'

export interface CeldaImpacto {
  clave: string
  rotulo: string
  /** Lo que dice el plan hoy. `null` cuando el plan no lo tiene cargado. */
  plan: string | null
  /** Lo que diría con la simulación puesta. `null` cuando no aplica. */
  simulado: string | null
  direccion: Direccion
  /** `neg` empeora, `pos` mejora, `neutro` no cambia o no se puede juzgar. */
  tono: 'neg' | 'pos' | 'neutro'
  detalle: string
}

export interface EstadoImpacto {
  texto: string
  tono: 'neg' | 'warn' | 'pos'
}

export interface LadoSimulado {
  genteTotal: number
  fin: string | null
  desvioDias: number | null
}

export interface InsumosImpacto {
  plan: LadoSimulado
  simulado: LadoSimulado
  /** HH que faltan en toda la obra. `null` = ningún frente tiene análisis. */
  hhRestantes: number | null
  /** Frentes donde la dotación pedida no entra: el tope del frente la recortó. */
  noEjecutables: number
  /** Cuántos frentes movió la persona. 0 = la pantalla muestra el plan tal cual. */
  tocados: number
  /** Cuánta gente hay de verdad en la obra. `null` cuando no se pudo leer — y ahí no se compara. */
  disponibles: number | null
}

const fecha = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : null)
const n0 = (v: number) => Math.round(v).toLocaleString('es-AR')

/** Hacia dónde se movió un número. Sin uno de los dos lados no hay dirección: es `igual`, que acá
 *  significa «no hay nada que comparar», y por eso el tono queda neutro. */
export function direccionDe(planN: number | null, simN: number | null): Direccion {
  if (planN == null || simN == null || planN === simN) return 'igual'
  return simN > planN ? 'sube' : 'baja'
}

/**
 * EL ESTADO DE LA CABECERA. El orden importa: no ejecutable le gana a todo lo demás.
 *
 * Un frente donde la dotación pedida no entra NO está «sin aplicar»: está mal. Publicar «simulación
 * sin aplicar» ahí invita a aplicarla, y al aplicarla el servidor la recorta al tope — la pantalla
 * mostraría 8 personas y el plan quedaría con 4.
 */
export function estadoDelImpacto(
  { noEjecutables, tocados, disponibles, simulado }: Pick<InsumosImpacto, 'noEjecutables' | 'tocados' | 'disponibles' | 'simulado'>,
): EstadoImpacto {
  if (noEjecutables > 0) {
    return {
      texto: noEjecutables === 1
        ? 'no ejecutable: 1 frente no tiene lugar para esa gente'
        : `no ejecutable: ${noEjecutables} frentes no tienen lugar para esa gente`,
      tono: 'neg',
    }
  }
  if (disponibles != null && simulado.genteTotal > disponibles) {
    return { texto: `pide ${simulado.genteTotal} y la obra tiene ${disponibles}`, tono: 'neg' }
  }
  if (tocados === 0) return { texto: 'igual al plan', tono: 'pos' }
  return { texto: 'simulación sin aplicar', tono: 'warn' }
}

/**
 * LAS CUATRO CELDAS DEL CANÓNICO, con los datos que esta obra tiene.
 *
 * «HH totales» es la celda que el canónico usa para decir lo más importante de la pantalla: la
 * cantidad de trabajo NO cambia con la dotación. Lo que cambia es en cuántos días se hace y con
 * cuánta gente. Por eso su lado simulado dice «iguales» y no repite el número.
 */
export function celdasDelImpacto(i: InsumosImpacto): CeldaImpacto[] {
  const dirGente = direccionDe(i.plan.genteTotal, i.simulado.genteTotal)
  const dirFin = direccionDe(
    i.plan.fin ? Number(i.plan.fin.replaceAll('-', '')) : null,
    i.simulado.fin ? Number(i.simulado.fin.replaceAll('-', '')) : null,
  )
  return [
    {
      clave: 'gente',
      rotulo: 'DOTACIÓN',
      plan: i.plan.genteTotal > 0 ? `${i.plan.genteTotal}` : null,
      simulado: `${i.simulado.genteTotal}`,
      direccion: dirGente,
      // Más gente no es «peor»: es el gesto de la pantalla. Lo que se juzga es el plazo.
      tono: 'neutro',
      detalle: 'plan → simulado',
    },
    {
      clave: 'fin',
      rotulo: 'FIN DE OBRA',
      plan: fecha(i.plan.fin),
      simulado: fecha(i.simulado.fin),
      direccion: dirFin,
      tono: dirFin === 'sube' ? 'neg' : (dirFin === 'baja' ? 'pos' : 'neutro'),
      detalle: i.simulado.fin == null ? 'fuera del calendario simulado' : 'fecha proyectada',
    },
    {
      clave: 'hh',
      rotulo: 'HH QUE FALTAN',
      // NULL NO ES CERO: sin análisis no hay HH, y no es que no quede trabajo.
      plan: i.hhRestantes == null ? null : n0(i.hhRestantes),
      simulado: i.hhRestantes == null ? null : 'iguales',
      direccion: 'igual',
      tono: 'neutro',
      detalle: 'la cantidad de trabajo no cambia',
    },
    {
      clave: 'desvio',
      rotulo: 'CONTRA EL PLAN',
      plan: i.plan.desvioDias == null ? null : `${i.plan.desvioDias > 0 ? '+' : ''}${i.plan.desvioDias} d`,
      simulado: i.simulado.desvioDias == null ? null : `${i.simulado.desvioDias > 0 ? '+' : ''}${i.simulado.desvioDias} d`,
      direccion: direccionDe(i.plan.desvioDias, i.simulado.desvioDias),
      tono: i.simulado.desvioDias == null
        ? 'neutro'
        : (i.simulado.desvioDias > 0 ? 'neg' : (i.simulado.desvioDias < 0 ? 'pos' : 'neutro')),
      detalle: 'días de trabajo contra el fin de plan',
    },
  ]
}
