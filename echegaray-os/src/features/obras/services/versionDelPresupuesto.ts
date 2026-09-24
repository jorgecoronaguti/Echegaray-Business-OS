// QUÉ VERSIÓN DEL PRESUPUESTO SE CONVIERTE EN PLAN (23/09/2026).
//
// La que se VENDIÓ, no la última que se editó: QP tiene la v3 adjudicada y una v4 borrador vigente
// (recotización en curso), y tomar la vigente bloqueaba la conversión con «no está adjudicado». Sin
// ninguna adjudicada, la vigente (o la última): la pantalla y la acción dicen por qué no convierte.
// Una sola regla para la pantalla (C02) y para la acción que convierte.

export function versionQueVale<T extends { estado: string | null; vigente: boolean | null; version: number }>(versiones: readonly T[]): T | null {
  const orden = [...versiones].sort((a, b) => b.version - a.version)
  return orden.find((v) => v.estado === 'adjudicada') ?? orden.find((v) => v.vigente) ?? orden[0] ?? null
}
