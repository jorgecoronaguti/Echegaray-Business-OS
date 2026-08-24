// LAS CINCO MÉTRICAS DEL PIE DE LA 07 — Design 23/08, patrón «Status bar».
//
// ═══ POR QUÉ ES UN ARCHIVO Y NO CINCO LÍNEAS EN LA PANTALLA ═══
//
// Cada una de las cinco puede decir una mentira distinta y ninguna daría error:
//
//   · «en fecha» sobre una obra que nadie selló                → sin base sellada no hay promesa
//   · «0 atrasadas» contando sólo las que tienen base          → un 0 sobre una muestra de 3
//   · un desvío en días CORRIDOS presentado como días de obra  → dos días de más por semana
//
// Las tres se ven bien en la pantalla. Acá viven donde un test las alcanza.

export interface FilaConBase {
  nivel: number
  finBase: string | null
  desvio: number | null
}

export interface CronogramaResumido {
  finObra: string | null
  sinSecuencia: boolean
  criticas: readonly string[]
}

/** Lo que la `Franja` del design system consume. Se declara acá para que este archivo no dependa de
 *  un componente: la regla no tiene por qué recompilarse cuando el pie cambie de forma. */
export interface MetricaPlazo {
  etiqueta: string
  valor: string
  contexto?: string
  tono?: 'neg' | 'warn' | 'pos'
}

const fmt = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : null)

/**
 * @param filas       las de la vista, con su desvío ya calculado contra la base.
 * @param crono       el resultado del motor.
 * @param enProyeccion cambia el rótulo del fin: proyectado y calculado no son la misma afirmación.
 * @param desvioDe    días de trabajo entre dos fechas, con el calendario de la obra.
 */
export function metricasDelPlazo(
  filas: readonly FilaConBase[],
  crono: CronogramaResumido,
  enProyeccion: boolean,
  desvioDe: (finBase: string, fin: string) => number | null,
): MetricaPlazo[] {
  // Las cabeceras de frente quedan afuera: su base es la de sus hijas, y contarlas duplicaría cada
  // actividad atrasada una vez más por cada frente.
  const conBase = filas.filter((f) => f.nivel !== 0 && f.finBase)
  const finBase = conBase.map((f) => f.finBase!).sort().at(-1) ?? null
  const atrasadas = conBase.filter((f) => (f.desvio ?? 0) > 0).length
  const desvio = finBase && crono.finObra ? desvioDe(finBase, crono.finObra) : null
  const criticas = crono.criticas.length

  return [
    { etiqueta: 'Fin de línea base', valor: fmt(finBase) ?? 'sin sellar' },
    {
      etiqueta: enProyeccion ? 'Fin proyectado' : 'Fin calculado',
      valor: fmt(crono.finObra) ?? 'sin secuencia',
      tono: desvio != null && desvio > 0 ? 'neg' : undefined,
    },
    {
      // SIN BASE NO ES «EN FECHA». Es que nadie prometió una fecha contra la cual estarlo.
      etiqueta: 'Contra la base',
      valor: desvio == null ? 'sin base' : `${desvio > 0 ? '+' : ''}${desvio} d`,
      contexto: desvio == null ? undefined : 'días de trabajo',
      tono: desvio == null ? undefined : (desvio > 0 ? 'neg' : 'pos'),
    },
    {
      etiqueta: 'Camino crítico',
      valor: crono.sinSecuencia ? 'sin secuencia' : String(criticas),
      contexto: crono.sinSecuencia ? undefined : 'actividades',
      tono: criticas > 0 ? 'warn' : undefined,
    },
    {
      // «0 de 3 con base» y «0 de 300 con base» son dos obras distintas: el denominador va siempre.
      etiqueta: 'Atrasadas',
      valor: conBase.length === 0 ? 'sin base' : String(atrasadas),
      contexto: conBase.length === 0 ? undefined : `de ${conBase.length} con base`,
      tono: atrasadas > 0 ? 'warn' : undefined,
    },
  ]
}
