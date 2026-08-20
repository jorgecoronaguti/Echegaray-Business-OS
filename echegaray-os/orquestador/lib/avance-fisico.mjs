// EL AVANCE FÍSICO DE UNA OBRA — LEÍDO DE DONDE SE CALCULA, NO CALCULADO OTRA VEZ.
//
// ═══ QUÉ HABÍA ACÁ HASTA EL 17/08/2026, Y POR QUÉ SE FUE ═══
//
// Este módulo tenía su propio parser del tracker "Avances de Obra" de Drive. El módulo de Obras
// tiene otro (`obra-cronograma.mjs`), mejor, que además trae las fechas. Los dos leían el MISMO
// archivo y publicaban NÚMEROS DISTINTOS de la misma obra en el mismo minuto: San Francisco al 85%
// por el chat y al 44% por la web.
//
// No era un empate entre dos opiniones. El parser de acá exigía que la fila tuviera algo en la
// columna `#` — y en San Francisco esa columna se llena en las primeras 24 filas y después no —,
// así que promediaba el trabajo de junio y julio, casi todo terminado, y dejaba afuera PISOS,
// ENTREPISO y MEDIANERA: 90 actividades planificadas hasta el 27/08. El 85% era el avance de la
// parte vieja de la obra, publicado como si fuera el de la obra.
//
// Ahora el cálculo vive UNA sola vez, en la vista `obra_avance` de Postgres, y esto es un lector.
// El parser y el sincronizador de aquel camino (`sync-avance-obra.mjs`, tabla `avance_obra`) se
// dieron de baja en el mismo commit. La cadena quedó: Drive → obra-cronograma.mjs → obra_actividad
// → obra_avance → web, chat y briefings.
import { query } from './db.mjs'

const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()

/**
 * Avance de todas las obras, de la fuente única.
 *
 * Conserva la forma de retorno del módulo viejo (`tab`, `estructurado`, `avancePromedio`, `motivo`)
 * porque la consume la vigilancia autónoma, y agrega la COBERTURA: sobre cuántas actividades se
 * tomó el promedio y cuántas quedaron sin planificar. Un promedio sin su cobertura fue justamente
 * el defecto que hizo falta corregir.
 */
export async function avanceTodasLasObras() {
  const { rows } = await query(
    `select obra, avance_pct, n_actividades, n_medidas, n_sin_planificar, n_completas,
            desde, hasta, sincronizado_en
       from public.obra_avance order by obra`)
  return rows.map((r) => ({
    tab: r.obra,
    estructurado: r.avance_pct !== null,
    avancePromedio: r.avance_pct === null ? null : Number(r.avance_pct),
    actividades: Number(r.n_medidas),
    completadas: Number(r.n_completas),
    sinPlanificar: Number(r.n_sin_planificar),
    totalActividades: Number(r.n_actividades),
    desde: r.desde,
    hasta: r.hasta,
    sincronizadoEn: r.sincronizado_en,
    motivo: r.avance_pct === null
      ? (Number(r.n_actividades) > 0
        ? 'tiene actividades cargadas pero ninguna con fecha de inicio: no hay nada que medir todavía'
        : 'la obra no tiene cronograma cargado en el tracker de Drive')
      : null,
  }))
}

/** Línea legible por obra, para el cuadro/briefing. La cobertura va pegada al número. */
export function formatAvance(a) {
  if (!a.estructurado) return `${a.tab}: avance físico sin cargar (${a.motivo})`
  const cola = a.sinPlanificar ? `, ${a.sinPlanificar} sin planificar` : ''
  return `${a.tab}: **${a.avancePromedio}%** físico (${a.completadas}/${a.actividades} actividades planificadas completas${cola})`
}

/**
 * Resumen de avance físico. Sin nombre → todas las obras. Con nombre → la(s) que coincidan.
 * Respuesta lista para el chat, 0 API del modelo.
 */
export async function avanceResumen(nombre) {
  let obras
  try { obras = await avanceTodasLasObras() } catch (e) {
    return `No pude leer el avance de obra: ${String(e?.message ?? e).slice(0, 140)}`
  }
  const q = norm(nombre)
  const elegidas = q ? obras.filter((o) => norm(o.tab).includes(q) || q.includes(norm(o.tab))) : obras
  if (!elegidas.length) {
    return q
      ? `No encontré una obra que se llame "${nombre}". Las que hay: ${obras.map((o) => o.tab).join(', ')}.`
      : 'Todavía no hay ninguna obra cargada.'
  }
  return elegidas.map(formatAvance).join('\n')
}
