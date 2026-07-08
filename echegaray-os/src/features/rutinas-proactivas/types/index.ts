import type { AlertaDashboard, CategoriaAlerta } from '@/features/dashboard/types'
import type { Accion } from '@/features/acciones/types'
import { clasificarParaDireccion } from '@/features/acciones/types'
import type { BacklogItem } from '@/features/backlog-autonomo/types'

// Rutinas Proactivas (Track B / B7, OLA 2) -- versión ON-DEMAND: "qué mostraría la
// rutina si corriera ahora", sobre dominios ya confiables (ver /preguntas-negocio).
// La automatización real (que corra sola, sin que alguien abra esta página) requiere
// una decisión de infraestructura (Vercel Cron / Supabase pg_cron / externo) que no
// se toma acá -- ver backlog_autonomo. Solo se activan rutinas sobre dominios con
// datos confiables, tal como pidió el usuario.
export type ResultadoRutina = 'sin_novedad' | 'observacion' | 'recomendacion'

export interface SeccionRutina {
  titulo: string
  resultado: ResultadoRutina
  cantidad: number
  detalle: string[]
}

function seccionDeAlertas(titulo: string, items: AlertaDashboard[]): SeccionRutina {
  const resultado: ResultadoRutina =
    items.length === 0 ? 'sin_novedad' : items.some((i) => i.severidad === 'critica' || i.severidad === 'alta') ? 'recomendacion' : 'observacion'
  return { titulo, resultado, cantidad: items.length, detalle: items.map((i) => i.titulo) }
}

const CATEGORIAS_SEMANALES: { categoria: CategoriaAlerta; titulo: string }[] = [
  { categoria: 'actividad_obra', titulo: 'Plan vs. avance de obra' },
  { categoria: 'hh', titulo: 'HH y productividad' },
  { categoria: 'exposicion_financiera', titulo: 'Capital de trabajo / concentración' },
  { categoria: 'control_economico', titulo: 'Control económico' },
  { categoria: 'ejecucion_financiera', titulo: 'Ejecución financiera' },
  { categoria: 'riesgo_operacion_financiero', titulo: 'Riesgo operación → finanzas' },
]

export function construirRutinaDiaria(alertas: AlertaDashboard[], acciones: Accion[]): SeccionRutina[] {
  const caja = alertas.filter((a) => a.categoria === 'posicion_caja')
  const vencimientos = alertas.filter((a) => a.categoria === 'obligaciones')
  const accionesVencidas = acciones.filter((acc) => clasificarParaDireccion(acc) === 'accion_vencida')

  return [
    seccionDeAlertas('Caja y déficit proyectado', caja),
    seccionDeAlertas('Vencimientos (cobranzas/pagos)', vencimientos),
    {
      titulo: 'Acciones vencidas',
      resultado: accionesVencidas.length === 0 ? 'sin_novedad' : 'recomendacion',
      cantidad: accionesVencidas.length,
      detalle: accionesVencidas.map((a) => a.titulo),
    },
  ]
}

export function construirRutinaSemanal(alertas: AlertaDashboard[], backlogAbierto: BacklogItem[]): SeccionRutina[] {
  const backlogPrioritario = backlogAbierto.filter((b) => b.estado === 'abierto' && b.impacto === 'alta')

  return [
    ...CATEGORIAS_SEMANALES.map(({ categoria, titulo }) =>
      seccionDeAlertas(titulo, alertas.filter((a) => a.categoria === categoria))
    ),
    {
      titulo: 'Backlog prioritario (impacto alto)',
      resultado: backlogPrioritario.length === 0 ? 'sin_novedad' : 'recomendacion',
      cantidad: backlogPrioritario.length,
      detalle: backlogPrioritario.map((b) => b.titulo),
    },
  ]
}
