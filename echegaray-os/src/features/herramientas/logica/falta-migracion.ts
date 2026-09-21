// ¿LA BASE TODAVÍA NO TIENE EL MÓDULO? — la migración 20260921T2100 la aplica el dueño, a mano.
//
// Hasta entonces `activo`, `ubicacion`, etc. no existen. PostgREST contesta PGRST205 («Could not find
// the table … in the schema cache») y Postgres, si la consulta llega, 42P01 (relación inexistente);
// una función que no existe es PGRST202 / 42883. Ese caso NO es «no hay herramientas»: la pantalla
// tiene que decir que el módulo espera la migración, nunca pintar un cero.

export const MIGRACION = '20260921T2100'

export interface ErrorBase {
  code?: string | null
  message?: string | null
}

export function faltaMigracion(e: ErrorBase | null | undefined): boolean {
  if (!e) return false
  if (['PGRST205', '42P01', 'PGRST202', '42883'].includes(String(e.code ?? ''))) return true
  const m = String(e.message ?? '')
  return /could not find the (table|function)/i.test(m) || /relation "?[\w.]*"? does not exist/i.test(m)
}
