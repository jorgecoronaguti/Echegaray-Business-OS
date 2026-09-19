import { leerPresupuestos, presupuestoPorObra } from './presupuesto.ts'

// Un presupuesto armado desde filas crudas de la base, con las MISMAS funciones que usa el servicio.
export const presupuestoDe = (obra: string, partidas: [codigo: string, monto: number, descripcion?: string][], cabecera: Record<string, unknown> = {}) =>
  presupuestoPorObra(leerPresupuestos(
    [{ id: `p-${obra}`, obra_canonica_id: obra, estado: 'aprobado', costo_directo_presupuestado: partidas.reduce((a, x) => a + x[1], 0) || null,
      costo_pendiente_motivo: null, fuente_legacy: 'cot.xlsm drive 1 · Presupuesto!H79', ...cabecera }],
    partidas.map(([codigo, monto, descripcion]) => ({ presupuesto_id: `p-${obra}`, codigo, monto, descripcion: descripcion ?? `${codigo} · Presupuesto!O` })),
  )).get(obra) ?? null
