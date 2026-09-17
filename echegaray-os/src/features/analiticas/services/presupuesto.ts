// EL PRESUPUESTO DE CADA OBRA, POR RUBRO — desde UNA sola fuente: `presupuestos` + `partidas_presupuesto`.
//
// ═══ POR QUÉ EL CONTRATO NO ES EL PRESUPUESTO ═══
//
// El dueño (17/09/2026) pidió controlar lo presupuestado contra lo consumido. El contrato es el PRECIO
// de venta; el presupuesto es el COSTO que se previó gastar. Medir el gasto contra el precio da un
// «queda» que incluye el margen. Por eso el contrato queda como referencia al lado.
//
// ═══ DE DÓNDE VIENE ═══
//
// De la cotización interna (.xlsm) de cada obra, cargada con cita de celda (migración 20260917T1700,
// `orquestador/lib/presupuestos-cotizados.mjs`). SÓLO el presupuesto `aprobado`: 'reemplazado' y
// 'cotizado' no son la línea de base de nadie. Un aprobado sin costo trae su motivo escrito
// (messina-bsa: «recotización 2026 sin costo cotizado; pedido al dueño») y se muestra tal cual.
//
// ═══ LOS RUBROS DE LA COTIZACIÓN NO SON LOS DEL GASTO ═══
//
// La plantilla separa MO (mano de obra), CS (cargas sociales), MA (materiales, equipos, fletes y
// subcontratos: no los separa) y SC (sin clasificar). El gasto separa mano de obra, subcontratos y
// materiales. La comparación es RUBRO CONTRA RUBRO: MO+CS contra mano de obra, MA contra materiales.
// Lo que no tiene presupuesto propio dice «sin presupuesto de este rubro»; nunca se compara el gasto
// total contra un presupuesto de un solo rubro (Quattropani y entrepiso sólo cotizaron MO+CS).
//
// Un número que la carga marcó INFERENCIA (no está escrito en una celda) se rotula «estimado».
import { z } from 'zod'

export type Rubro = 'manoObra' | 'materiales' | 'subcontratos' | 'otros'

export const RUBROS: { clave: Rubro; rotulo: string }[] = [
  { clave: 'manoObra', rotulo: 'Mano de obra' },
  { clave: 'subcontratos', rotulo: 'Subcontratos' },
  { clave: 'materiales', rotulo: 'Materiales' },
  { clave: 'otros', rotulo: 'Otros' },
]

/** Los rubros que tienen un consumo con el que compararse. Subcontratos y otros no tienen pareja. */
export const RUBROS_COMPARABLES: readonly Rubro[] = ['manoObra', 'materiales']

export interface PresupuestoDeObra {
  obraId: string
  rubro: Rubro
  /** Pesos. */
  monto: number
  /** La cita: archivo y celda de donde salió el número. */
  fuente: string
  /** `true` = la carga lo marcó INFERENCIA: no está escrito en una celda. */
  estimado: boolean
}

/** La cabecera del presupuesto aprobado: el costo cotizado total, o por qué no hay. */
export interface CabeceraDePresupuesto {
  obraId: string
  /** Costo directo cotizado (MO + CS + materiales). `null` → `motivo`. */
  costoTotal: number | null
  motivo: string | null
  fuente: string
  estimado: boolean
  /** Horas hombre que estimó la cotización. `null` = no las estimó o no son confiables. */
  hh: number | null
}

export interface LecturaPresupuestos {
  cabeceras: CabeceraDePresupuesto[]
  filas: PresupuestoDeObra[]
  /** Por qué no hay ningún presupuesto (`null` si hay). */
  motivo: string | null
}

export const SIN_PRESUPUESTO = 'sin presupuesto cargado'
export const SIN_PRESUPUESTO_RUBRO = 'sin presupuesto de este rubro'

const esInferencia = (s: string | null | undefined): boolean => /INFERENCIA/i.test(s ?? '')

/**
 * EL CÓDIGO DE PARTIDA → RUBRO. `ADIC-` (adicional) y `RAMPA-` (segunda parte de la obra) son
 * prefijos de la misma plantilla. EQ (equipos) va con materiales, como en la columna P de la plantilla.
 * Un código que no se reconoce va a «otros»: no se inventa a qué rubro pertenece.
 */
export function rubroDeCodigo(codigo: string | null | undefined): Rubro {
  const c = (codigo ?? '').toUpperCase().split('-').at(-1) ?? ''
  if (c === 'MO' || c === 'CS' || c === 'MOCS') return 'manoObra'
  if (c === 'MA' || c === 'EQ') return 'materiales'
  return 'otros'
}

const NUM = z.union([z.number(), z.string()]).transform((v) => Number(v)).pipe(z.number().finite())

const CABECERA = z.object({
  id: z.string().min(1),
  obra_canonica_id: z.string().min(1),
  estado: z.literal('aprobado'),
  costo_directo_presupuestado: NUM.nullable(),
  costo_pendiente_motivo: z.string().nullable(),
  fuente_legacy: z.string().nullable(),
  hh_estimada: NUM.nullable().optional(),
})

const PARTIDA = z.object({
  presupuesto_id: z.string().min(1),
  codigo: z.string().nullable(),
  descripcion: z.string().nullable(),
  monto: NUM,
})

/**
 * LA ÚNICA PUERTA DEL PRESUPUESTO: filas crudas de `presupuestos` y `partidas_presupuesto`.
 * `null` = no se pudo leer. Lo que no es un aprobado válido no entra: un costo NULL sin motivo, o un
 * monto no numérico, no es un presupuesto.
 */
export function leerPresupuestos(presupuestos: unknown[] | null, partidas: unknown[] | null): LecturaPresupuestos {
  if (presupuestos == null) return { cabeceras: [], filas: [], motivo: 'no se pudo leer el presupuesto' }
  const obraDe = new Map<string, { obraId: string; fuente: string }>()
  const cabeceras = presupuestos.flatMap((c): CabeceraDePresupuesto[] => {
    const r = CABECERA.safeParse(c)
    if (!r.success) return []
    const x = r.data
    const motivo = x.costo_pendiente_motivo?.trim() || null
    if (x.costo_directo_presupuestado == null && !motivo) return []
    const fuente = x.fuente_legacy ?? ''
    obraDe.set(x.id, { obraId: x.obra_canonica_id, fuente })
    return [{
      obraId: x.obra_canonica_id, costoTotal: x.costo_directo_presupuestado ?? null,
      motivo: x.costo_directo_presupuestado == null ? motivo : null, fuente, estimado: esInferencia(fuente),
      hh: x.hh_estimada != null && x.hh_estimada > 0 ? x.hh_estimada : null,
    }]
  })
  const filas = (partidas ?? []).flatMap((c): PresupuestoDeObra[] => {
    const r = PARTIDA.safeParse(c)
    const obra = r.success ? obraDe.get(r.data.presupuesto_id) : undefined
    if (!r.success || !obra || r.data.monto < 0) return []
    return [{
      obraId: obra.obraId, rubro: rubroDeCodigo(r.data.codigo), monto: r.data.monto,
      // ESTIMADO ES LA PARTIDA QUE LO DICE: Quattropani escribe INFERENCIA en la cabecera por sus gastos
      // generales, pero su MO y sus cargas salen de celdas.
      fuente: r.data.descripcion ?? obra.fuente, estimado: esInferencia(r.data.descripcion),
    }]
  })
  return { cabeceras, filas, motivo: cabeceras.length ? null : SIN_PRESUPUESTO }
}

export interface PresupuestoArmado {
  /** `null` = ese rubro no tiene presupuesto (no es cero). */
  porRubro: Record<Rubro, number | null>
  /** Rubros cuyo número es estimado. */
  estimados: Rubro[]
  /** El costo cotizado total de la cabecera. `null` → `motivo`. */
  costoTotal: number | null
  motivo: string | null
  estimado: boolean
  fuente: string
  hh: number | null
}

/** Cabeceras y partidas juntas por obra. Una obra sin cabecera aprobada NO está en el mapa. */
export function presupuestoPorObra(lectura: Pick<LecturaPresupuestos, 'cabeceras' | 'filas'>): Map<string, PresupuestoArmado> {
  const m = new Map<string, PresupuestoArmado>()
  for (const c of lectura.cabeceras) {
    m.set(c.obraId, {
      porRubro: { manoObra: null, materiales: null, subcontratos: null, otros: null }, estimados: [],
      costoTotal: c.costoTotal, motivo: c.motivo, estimado: c.estimado, fuente: c.fuente, hh: c.hh,
    })
  }
  for (const f of lectura.filas) {
    const p = m.get(f.obraId)
    if (!p) continue
    p.porRubro[f.rubro] = (p.porRubro[f.rubro] ?? 0) + f.monto
    if (f.estimado && !p.estimados.includes(f.rubro)) p.estimados.push(f.rubro)
  }
  // SIN PARTIDAS, la cabecera decide; CON partidas, lo estimado es lo que marcan ellas.
  const conPartidas = new Set(lectura.filas.map((f) => f.obraId))
  for (const [id, p] of m) p.estimado = conPartidas.has(id) ? p.estimados.length > 0 : p.estimado
  return m
}
