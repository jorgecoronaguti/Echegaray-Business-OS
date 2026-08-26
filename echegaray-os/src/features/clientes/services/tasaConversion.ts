// LA TASA DE CONVERSIÓN DE UN CLIENTE — ganados sobre CERRADOS, nunca sobre todos.
//
// Vivía adentro de `FichaPresupuestos`, el componente de tarjeta que el v2 retiró. Se mudó a un
// `.ts` sin JSX porque es una REGLA de negocio —qué cuenta como cerrado— y una regla se prueba sin
// montar React.
//
// ═══ EL DENOMINADOR ES LA DECISIÓN ═══
//
// Incluir los presupuestos ABIERTOS daría una tasa que baja sola con cada cotización nueva, que es
// exactamente lo contrario de lo que mide: cotizar más no es perder más. Y sin ningún cerrado no se
// escribe «0 %» —eso diría que se perdieron todos— sino `null`, que la pantalla lee como silencio.

/** Sólo lo que hace falta para contar. No se pide el presupuesto entero: la regla es sobre el estado. */
export interface EstadoDePresupuesto { estado: string | null }

export function tasaDeConversion(ps: EstadoDePresupuesto[]): number | null {
  const ganados = ps.filter((p) => p.estado === 'adjudicada').length
  const perdidos = ps.filter((p) => p.estado === 'perdida').length
  const cerrados = ganados + perdidos
  return cerrados === 0 ? null : Math.round((ganados / cerrados) * 100)
}
