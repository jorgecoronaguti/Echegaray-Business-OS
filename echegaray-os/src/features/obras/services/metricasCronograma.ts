// LAS CINCO MÉTRICAS DEL PIE DE LA 07 — Design 23/08, patrón «Status bar».
//
// ═══ POR QUÉ ES UN ARCHIVO Y NO CINCO LÍNEAS EN LA PANTALLA ═══
//
// Cada una de las cinco puede decir una mentira distinta y ninguna daría error:
//
//   · «en fecha» sobre una obra que nadie selló                → sin base sellada no hay promesa
//   · «0 atrasadas» sin decir sobre cuántas se pudo medir      → un 0 sobre una muestra de 3
//   · «sin forecast» dicho como «en fecha»                     → lo no medido leído como cumplido
//
// Las tres se ven bien en la pantalla. Acá viven donde un test las alcanza.

import type { ResumenDelCronograma } from './cronogramaPlan.ts'

/** Lo que la `Franja` del design system consume. Se declara acá para que este archivo no dependa de
 *  un componente: la regla no tiene por qué recompilarse cuando el pie cambie de forma. */
export interface MetricaPlazo {
  etiqueta: string
  valor: string
  contexto?: string
  tono?: 'neg' | 'warn' | 'pos'
}

const fmt = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : null)

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// EL PIE DEL CRONOGRAMA CARGADO (la 07 del workspace)
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// Las cinco celdas del mockup son «Fin de línea base · Fin proyectado · Camino crítico ·
// Actividades atrasadas · Holgura del crítico». DOS de ellas no se pueden publicar sobre el plan
// cargado y no se inventan: camino crítico y holgura exigen precedencias declaradas, y hoy hay CERO
// en todas las obras. En su lugar van las otras dos capas del propio dibujo —el fin de PLAN, que
// está entre lo prometido y lo proyectado— y la cobertura: cuántas actividades no tienen fecha.
// Sin ese último número, «3 atrasadas» sobre una obra con 25 filas sin planificar se lee como una
// obra sana. Ver `cronogramaPlan.ts`.


export function metricasDelCronogramaCargado(
  r: ResumenDelCronograma, selladaEn: string | null,
): MetricaPlazo[] {
  const desvio = r.desvioDelFin
  return [
    {
      etiqueta: 'Fin de línea base',
      valor: fmt(r.finBase) ?? 'sin sellar',
      ...(selladaEn ? { contexto: `sellada ${fmt(selladaEn)}` } : {}),
    },
    { etiqueta: 'Fin de plan', valor: fmt(r.finPlan) ?? 'sin plan' },
    {
      etiqueta: 'Fin proyectado',
      valor: fmt(r.finForecast) ?? 'sin forecast',
      ...(desvio == null ? {} : { contexto: desvio > 0 ? `+${desvio} d` : 'en fecha' }),
      ...(desvio != null && desvio > 0 ? { tono: 'neg' as const } : {}),
    },
    {
      // SIN FORECAST NO ES «NINGUNA ATRASADA»: es que no se pudo medir ninguna. El denominador va
      // siempre — «1 de 2» y «1 de 200» son dos obras distintas.
      etiqueta: 'Actividades atrasadas',
      valor: r.medidas === 0 ? 'sin forecast' : String(r.atrasadas),
      ...(r.medidas === 0 ? {} : { contexto: `de ${r.medidas} medidas` }),
      ...(r.atrasadas > 0 ? { tono: 'warn' as const } : {}),
    },
    {
      etiqueta: 'Sin fecha',
      valor: String(r.sinPlan),
      contexto: `de ${r.actividades} actividades`,
      ...(r.sinPlan > 0 ? { tono: 'warn' as const } : {}),
    },
  ]
}
