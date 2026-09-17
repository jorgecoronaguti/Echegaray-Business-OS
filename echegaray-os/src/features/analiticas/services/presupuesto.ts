// EL PRESUPUESTO DE CADA OBRA, POR RUBRO — desde UNA sola fuente.
//
// ═══ POR QUÉ EL CONTRATO NO ES EL PRESUPUESTO ═══
//
// El dueño (17/09/2026) pidió controlar lo presupuestado contra lo consumido. El contrato es el PRECIO
// de venta; el presupuesto es el COSTO que se previó gastar. Medir el gasto contra el precio da un
// «queda» que incluye el margen: una obra que ya se comió toda su ganancia se ve «dentro». Por eso el
// contrato queda como referencia al lado, y el semáforo sólo compara contra esto.
//
// ═══ DE DÓNDE VIENE ═══
//
// De las cotizaciones internas (.xlsm) de cada obra: costo por rubro con la celda citada. Todavía no
// está en la base (`costo_objetivo` es NULL en las 10 obras activas), así que `leerPresupuestos`
// devuelve vacío CON SU MOTIVO. Cuando la migración lo publique, se conecta acá y en ningún otro lado.
//
// Un monto sin fuente no entra: un número que nadie puede rastrear hasta la celda no es un presupuesto.
import { z } from 'zod'

export type Rubro = 'manoObra' | 'materiales' | 'subcontratos' | 'otros'

export const RUBROS: { clave: Rubro; rotulo: string }[] = [
  { clave: 'manoObra', rotulo: 'Mano de obra' },
  { clave: 'subcontratos', rotulo: 'Subcontratos' },
  { clave: 'materiales', rotulo: 'Materiales' },
  { clave: 'otros', rotulo: 'Otros' },
]

export interface PresupuestoDeObra {
  obraId: string
  rubro: Rubro
  /** Pesos. */
  monto: number
  /** La cita: archivo y celda de donde salió el número. */
  fuente: string
}

export interface LecturaPresupuestos {
  filas: PresupuestoDeObra[]
  /** Por qué no hay filas (`null` si las hay). La pantalla lo dice tal cual. */
  motivo: string | null
}

export const SIN_PRESUPUESTO = 'sin presupuesto cargado'

/**
 * LA ÚNICA PUERTA DEL PRESUPUESTO. Hoy no hay fuente en la base: vacío con motivo, nunca un número.
 * Recibe las filas crudas para que la conexión futura sea pasarle lo que lea la consulta.
 */
export async function leerPresupuestos(crudas: unknown[] | null = null): Promise<LecturaPresupuestos> {
  if (crudas == null) return { filas: [], motivo: SIN_PRESUPUESTO }
  const filas = validarPresupuestos(crudas)
  return { filas, motivo: filas.length ? null : SIN_PRESUPUESTO }
}

const FILA = z.object({
  obraId: z.string().min(1),
  rubro: z.enum(['manoObra', 'materiales', 'subcontratos', 'otros']),
  monto: z.number().finite().nonnegative(),
  fuente: z.string().trim().min(1),
})

/** Descarta lo que no es un presupuesto con fuente: monto no numérico, negativo o sin cita. */
export function validarPresupuestos(crudas: unknown[]): PresupuestoDeObra[] {
  return crudas.flatMap((c) => {
    const r = FILA.safeParse(c)
    return r.success ? [r.data] : []
  })
}

export interface PresupuestoArmado {
  /** `null` = ese rubro no tiene presupuesto (no es cero). */
  porRubro: Record<Rubro, number | null>
  /** Σ de los rubros presupuestados. */
  total: number
  fuentes: string[]
}

/** Las filas agrupadas por obra. Una obra sin filas NO está en el mapa: no tiene presupuesto. */
export function presupuestoPorObra(filas: PresupuestoDeObra[]): Map<string, PresupuestoArmado> {
  const m = new Map<string, PresupuestoArmado>()
  for (const f of filas) {
    const p = m.get(f.obraId) ?? { porRubro: { manoObra: null, materiales: null, subcontratos: null, otros: null }, total: 0, fuentes: [] }
    p.porRubro[f.rubro] = (p.porRubro[f.rubro] ?? 0) + f.monto
    p.total += f.monto
    if (!p.fuentes.includes(f.fuente)) p.fuentes.push(f.fuente)
    m.set(f.obraId, p)
  }
  return m
}
