// SCORECARD DE ADMIN/FINANZAS + KPIs DEL PROPIO OS (F6).
//
// Tablero vivo que junta "cómo está el área" (posición, colchón, obligaciones — fuente única
// finanzas_modelo_liquidez) con "cuánto aprende el propio OS" (precisión del forecast desde
// finanzas_caja_negra, frescura de fuentes desde fuentes_datos). La Web SÓLO LEE la tabla materializada
// public.finanzas_scorecard; todo el cálculo vive en orquestador/scripts/sync-scorecard-finanzas.mjs.
//
// PLANTILLA REPLICABLE: la columna `area` deja este mismo modelo listo para las otras 6 áreas.
//
// OJO CON LOS TIPOS: Postgres `numeric` llega por PostgREST como STRING, y `detalle` es jsonb (objeto).
// Nunca renderizar `valor` ni `detalle` crudos como nodo React — se coercionan con los helpers de acá.

export type SeccionScorecard = 'salud_area' | 'metricas_os'
export type UnidadScorecard = 'pesos' | 'porcentaje' | 'dias' | 'cantidad' | 'texto'
export type EstadoScorecard = 'ok' | 'sin_datos'

// Detalle es jsonb libre; sólo tipamos los campos que la Web usa. Todo opcional.
export interface DetalleScorecard {
  valor_anterior?: number | null
  variacion?: number | null
  de_donde_saldria?: string
  motivo?: string
  datos_al?: string
  n_pares?: number
  mape_pct?: number
  total?: number
  actualizadas?: number
  nota?: string
  [k: string]: unknown
}

export interface FilaScorecard {
  id: number
  corrida_id: string
  area: string
  seccion: SeccionScorecard
  metrica: string
  etiqueta: string
  valor: string | number | null
  unidad: UnidadScorecard
  estado: EstadoScorecard
  fuente_unica: string
  orden: number
  detalle: DetalleScorecard | null
  capturado_en: string
}

// Una métrica lista para pintar: valor ya coercionado a número, tendencia resuelta y su mini-serie.
export interface MetricaVista {
  metrica: string
  etiqueta: string
  valor: number | null
  unidad: UnidadScorecard
  estado: EstadoScorecard
  fuente_unica: string
  variacion: number | null
  valorAnterior: number | null
  deDondeSaldria: string | null
  motivo: string | null
  serie: number[] // valores históricos (viejo→nuevo) para la mini-tendencia; sólo valores ya guardados
}

// numeric de Postgres puede venir string; lo pasamos a number sin inventar (null si no es finito).
export function aNumero(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * Arma las MetricaVista de una sección: toma el snapshot vigente y le pega la serie histórica por
 * métrica (viejo→nuevo) para la mini-tendencia. Es SÓLO presentación (agrupar filas ya calculadas) —
 * ningún número se recalcula acá.
 */
export function armarVista(
  vigentes: FilaScorecard[],
  historia: FilaScorecard[],
  seccion: SeccionScorecard,
): MetricaVista[] {
  const serie = new Map<string, number[]>()
  for (const f of [...historia].sort((a, b) => a.capturado_en.localeCompare(b.capturado_en))) {
    if (f.seccion !== seccion) continue
    const v = aNumero(f.valor)
    if (v === null) continue
    const arr = serie.get(f.metrica) ?? []
    arr.push(v)
    serie.set(f.metrica, arr)
  }
  return vigentes
    .filter((f) => f.seccion === seccion)
    .sort((a, b) => a.orden - b.orden)
    .map((f) => ({
      metrica: f.metrica,
      etiqueta: f.etiqueta,
      valor: aNumero(f.valor),
      unidad: f.unidad,
      estado: f.estado,
      fuente_unica: f.fuente_unica,
      variacion: aNumero(f.detalle?.variacion ?? null),
      valorAnterior: aNumero(f.detalle?.valor_anterior ?? null),
      deDondeSaldria: typeof f.detalle?.de_donde_saldria === 'string' ? f.detalle.de_donde_saldria : null,
      motivo: typeof f.detalle?.motivo === 'string' ? f.detalle.motivo : null,
      serie: serie.get(f.metrica) ?? [],
    }))
}

// La marca de datos de la fuente (cuándo el modelo calculó), si viaja en alguna fila de salud.
export function datosAlDe(vigentes: FilaScorecard[]): string | null {
  for (const f of vigentes) {
    const d = f.detalle?.datos_al
    if (typeof d === 'string') return d
  }
  return null
}
