// 08 · EL IMPACTO DE LA SIMULACIÓN — plan contra simulado, en las cuatro celdas del canónico.
//
// ═══ QUÉ MIDE CADA CELDA, Y POR QUÉ TRES SON DEL FRENTE Y UNA DE LA OBRA ═══
//
// El canónico 08 dibuja DURACIÓN · FIN DEL FRENTE · HH TOTALES · IMPACTO EN OBRA. Las tres primeras
// hablan del frente que se está simulando; la cuarta traduce eso a lo único que le importa al
// cliente: cuándo termina la obra. Mezclarlas —que era lo que hacía la versión anterior, con las
// cuatro celdas a nivel obra— deja al jefe moviendo un frente y mirando un número que casi nunca se
// mueve, porque el frente que simula no es el que manda el plazo.
//
// ═══ LO QUE ESTA CAPA SE NIEGA A DECIR ═══
//
// · Un fin que el calendario no alcanza. `null` es «fuera del calendario que mandó el servidor»,
//   no una fecha inventada.
// · «0 HH» cuando el frente no tiene análisis cargado. Las HH no cambian con la dotación —es el
//   punto de la pantalla— pero eso no las convierte en cero cuando no están.
// · «igual al plan» cuando la simulación no es ejecutable. Un frente que pide más gente de la que
//   entra no está «igual»: no se puede hacer, y eso le gana a cualquier otra lectura.
// · «sin dato» disfrazado de plan. Hoy NINGUNA actividad del OS tiene `dotacion_prevista` cargada
//   (0 filas en toda la base, medido el 25/08/2026), así que el lado «plan» de esta comparación
//   está vacío en las 17 obras. Se dice vacío; no se rellena con la dotación que la pantalla
//   muestra, que es la simulación mirándose a sí misma.

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

/** Un lado de la comparación, para el frente que se está simulando. */
export interface LadoFrente {
  dias: number | null
  fin: string | null
}

export interface InsumosImpacto {
  /** HH que faltan en el frente simulado. `null` = sin análisis. NUNCA 0 por ausencia. */
  hhFrente: number | null
  planFrente: LadoFrente
  simFrente: LadoFrente
  /** Días de desvío del FIN DE OBRA contra el fin de plan, de los dos lados. `null` sin plan. */
  desvioObraPlan: number | null
  desvioObraSim: number | null
  /** La dotación pedida no entra en el frente: el tope la recortó. */
  noEjecutable: boolean
  /** En modo Duración: no existe dotación que llegue a esa fecha (los días técnicos no se comprimen). */
  imposible: boolean
  /** La simulación difiere del plan. `false` = la pantalla está mostrando el plan tal cual. */
  cambio: boolean
  /** Gente que la simulación pide en TODA la obra, y cuánta hay. `null` = no se pudo leer. */
  genteSimulada: number
  disponibles: number | null
}

const fecha = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : null)
const n0 = (v: number) => Math.round(v).toLocaleString('es-AR')
const dias = (v: number | null) => (v == null ? null : `${v.toLocaleString('es-AR')} d`)
const conSigno = (v: number | null) => (v == null ? null : `${v > 0 ? '+' : ''}${v} d`)

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
 *
 * «pide N y la obra tiene M» no está en el canónico —su fixture tiene 18 de plantel y un stepper que
 * llega a 8, así que nunca se dispara— pero el plantel de la obra sí está entre sus «Límites
 * reales». Una simulación que pide gente que no existe no es ejecutable por la misma razón que la
 * que no entra en el frente, y callarlo para parecerse más al mockup sería mentir por estética.
 */
export function estadoDelImpacto(i: InsumosImpacto): EstadoImpacto {
  if (i.imposible) {
    return { texto: 'no ejecutable: ninguna dotación llega a esa fecha', tono: 'neg' }
  }
  if (i.noEjecutable) return { texto: 'no ejecutable con este frente', tono: 'neg' }
  if (i.disponibles != null && i.genteSimulada > i.disponibles) {
    return { texto: `pide ${i.genteSimulada} y la obra tiene ${i.disponibles}`, tono: 'neg' }
  }
  if (!i.cambio) return { texto: 'igual al plan', tono: 'pos' }
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
  const dirDias = direccionDe(i.planFrente.dias, i.simFrente.dias)
  const dirFin = direccionDe(
    i.planFrente.fin ? Number(i.planFrente.fin.replaceAll('-', '')) : null,
    i.simFrente.fin ? Number(i.simFrente.fin.replaceAll('-', '')) : null,
  )
  const dirObra = direccionDe(i.desvioObraPlan, i.desvioObraSim)
  return [
    {
      clave: 'duracion',
      rotulo: 'DURACIÓN',
      plan: dias(i.planFrente.dias),
      simulado: dias(i.simFrente.dias),
      direccion: dirDias,
      // Alargar el frente es peor; acortarlo es mejor. Es la única celda donde la dirección se
      // juzga sola, sin mirar la fecha.
      tono: dirDias === 'sube' ? 'neg' : (dirDias === 'baja' ? 'pos' : 'neutro'),
      detalle: 'plan → simulado',
    },
    {
      clave: 'fin',
      rotulo: 'FIN DEL FRENTE',
      plan: fecha(i.planFrente.fin),
      simulado: fecha(i.simFrente.fin),
      direccion: dirFin,
      tono: dirFin === 'sube' ? 'neg' : (dirFin === 'baja' ? 'pos' : 'neutro'),
      detalle: i.simFrente.fin == null ? 'fuera del calendario simulado' : 'fecha proyectada',
    },
    {
      clave: 'hh',
      rotulo: 'HH TOTALES',
      // NULL NO ES CERO: sin análisis no hay HH, y no es que no quede trabajo.
      plan: i.hhFrente == null ? null : n0(i.hhFrente),
      simulado: i.hhFrente == null ? null : 'iguales',
      direccion: 'igual',
      tono: 'neutro',
      detalle: 'la cantidad no cambia',
    },
    {
      clave: 'obra',
      rotulo: 'IMPACTO EN OBRA',
      plan: conSigno(i.desvioObraPlan),
      simulado: conSigno(i.desvioObraSim),
      direccion: dirObra,
      tono: dirObra === 'sube' ? 'neg' : (dirObra === 'baja' ? 'pos' : 'neutro'),
      detalle: 'fin de obra proyectado',
    },
  ]
}
