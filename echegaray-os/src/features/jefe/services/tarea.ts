// LOS TRES NÚMEROS DE J06 — rendimiento, plazo y producción. PUROS.
//
// El mockup `J06 · Jefe Frente.dc.html` pone tres azulejos arriba de los pasos: «HH REALES 19 de 37
// plan», «RENDIMIENTO 1,32× · 32 % arriba» y «PLAZO +2 d · proyectado», y debajo del avance escribe
// «0,43 de 1,08 m³». Los cuatro son CÁLCULOS, no columnas: se escriben acá, con su test, porque un
// cálculo metido en el JSX no se puede verificar sin abrir un navegador.
//
// ═══ LA REGLA QUE LOS TRES COMPARTEN: SIN LAS DOS PUNTAS NO HAY NÚMERO ═══
//
// Un rendimiento necesita horas reales Y horas plan Y avance. Con una sola punta se puede escribir
// algo que PARECE un dato —«1,00×» cuando no hay plan, «+0 d» cuando no hay proyección— y ninguna
// de las dos mentiras es verificable mirando la pantalla. Devuelven `null`, y `null` se dibuja «—».

import { diasEntre } from './frentes.ts'

export interface Rendimiento {
  /** Horas reales sobre horas que el plan asigna a lo YA HECHO. `null` sin alguna de las puntas. */
  valor: number | null
  /** `1,32×`, o `—`. */
  texto: string
  /** `32 % arriba` / `18 % abajo` / `en el plan`. `null` cuando no hay valor. */
  detalle: string | null
  /** Arriba de 1 consume más horas de las previstas: eso se avisa, no se celebra. */
  alerta: boolean
}

/**
 * CUÁNTAS HORAS CONSUME ESTA TAREA CONTRA LAS QUE EL PLAN LE DA A LO QUE YA SE HIZO.
 *
 * No es `hh_real / hh_plan`: eso compara lo consumido con el plan ENTERO y una tarea a medio hacer
 * siempre daría «rinde bien». Se compara contra la parte del plan que corresponde al avance
 * declarado — que es la única lectura honesta mientras la tarea sigue abierta.
 *
 * Con avance en 0 no hay nada contra qué comparar: `null`. Cero avance con horas gastadas no es
 * «rendimiento infinito», es una tarea que arrancó y todavía no midió.
 */
export function rendimientoDe(t: {
  hh_real: number | null
  hh_plan: number | null
  avance_pct: number | null
}): Rendimiento {
  const sin: Rendimiento = { valor: null, texto: '—', detalle: null, alerta: false }
  if (t.hh_real == null || t.hh_plan == null || t.avance_pct == null) return sin
  if (t.hh_plan <= 0 || t.avance_pct <= 0) return sin
  const planDeLoHecho = t.hh_plan * (t.avance_pct / 100)
  if (planDeLoHecho <= 0) return sin
  const valor = Math.round((t.hh_real / planDeLoHecho) * 100) / 100
  const desvio = Math.round((valor - 1) * 100)
  return {
    valor,
    texto: `${new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(valor)}×`,
    detalle: desvio === 0 ? 'en el plan' : desvio > 0 ? `${desvio} % arriba` : `${Math.abs(desvio)} % abajo`,
    alerta: desvio > 0,
  }
}

export interface Plazo {
  /** Días entre el fin de plan y el fin proyectado. Positivo = se pasa. `null` sin una de las dos. */
  dias: number | null
  texto: string
  detalle: string
  alerta: boolean
}

/** El plazo proyectado contra el de plan. `forecast_fin` YA lo calcula la base: no se recalcula. */
export function plazoDe(t: { fin_plan: string | null; forecast_fin: string | null }): Plazo {
  if (!t.fin_plan) return { dias: null, texto: '—', detalle: 'sin fin de plan', alerta: false }
  if (!t.forecast_fin) return { dias: null, texto: '—', detalle: 'sin proyección', alerta: false }
  const dias = diasEntre(t.fin_plan, t.forecast_fin)
  if (dias == null) return { dias: null, texto: '—', detalle: 'sin proyección', alerta: false }
  return {
    dias,
    texto: dias > 0 ? `+${dias} d` : dias === 0 ? 'en fecha' : `${dias} d`,
    detalle: 'proyectado',
    alerta: dias > 0,
  }
}

/**
 * LA PRODUCCIÓN EN SU UNIDAD — «0,43 de 1,08 m³».
 *
 * Se usa `cantidad_ejecutada` cuando existe: es lo que se hizo, medido. Si no existe pero hay
 * objetivo y porcentaje, se DERIVA — y la derivación se declara devolviendo `derivado: true`, para
 * que la pantalla no presente una cuenta como una medición.
 *
 * Sin objetivo no hay frase posible: `null`, y el mockup escribe «sin medición».
 */
export function produccionDe(t: {
  cantidad_objetivo: number | null
  cantidad_ejecutada: number | null
  avance_pct: number | null
  unidad: string | null
}): { texto: string; derivado: boolean } | null {
  if (t.cantidad_objetivo == null) return null
  const unidad = t.unidad ? ` ${t.unidad}` : ''
  if (t.cantidad_ejecutada != null) {
    return { texto: `${n2(t.cantidad_ejecutada)} de ${n2(t.cantidad_objetivo)}${unidad}`, derivado: false }
  }
  if (t.avance_pct == null) return null
  const hecho = (t.cantidad_objetivo * t.avance_pct) / 100
  return { texto: `${n2(hecho)} de ${n2(t.cantidad_objetivo)}${unidad}`, derivado: true }
}

const n2 = (v: number) =>
  new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)

/**
 * `2026-08-23` → `34`. J03 escribe «semana 34» al lado de la obra: es cómo el jefe ubica la lectura
 * dentro del año de obra.
 *
 * Semana ISO 8601 —lunes a domingo, la primera del año es la del primer jueves—, que es la misma
 * que usa el resto del sistema para agrupar producción. La ingenua («día del año / 7») corre el
 * número medio año en cualquier año que no arranque lunes, y ahí la pantalla del jefe y el reporte
 * semanal hablan de semanas distintas con el mismo número.
 */
export function semanaISO(iso: string): number {
  const [a, m, d] = iso.split('-').map(Number)
  const f = new Date(Date.UTC(a, m - 1, d))
  // Al jueves de esa semana: el año ISO es el del jueves.
  f.setUTCDate(f.getUTCDate() + 4 - (f.getUTCDay() || 7))
  const enero = new Date(Date.UTC(f.getUTCFullYear(), 0, 1))
  return Math.ceil(((f.getTime() - enero.getTime()) / 86_400_000 + 1) / 7)
}
