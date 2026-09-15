// A QUÉ OBRAS SE LE PUEDEN CARGAR HORAS DE UN DÍA — la regla, una sola vez.
//
// El dueño, 15/09/2026, cargando la quincena: *«no existe la posibilidad de marcarle hs en una obra
// determinada de días anteriores a ninguna persona»*. Ese mismo día tuvo que pedir que se REACTIVARA
// «LE - OFICINA Y FÁBRICA DE PALITOS» para cargar dos días: la pantalla y la acción sólo aceptaban
// obras `activa`, y una obra que se cerró la semana pasada estaba abierta el día que se trabajó.
//
// ═══ LA FECHA DEL DÍA, NO LA DE HOY ═══
//
// Las horas son un HECHO con fecha y obra. Si la obra estaba en marcha ese día, el costo es de esa
// obra aunque hoy esté cerrada; reactivarla para cargar es cambiar el estado de la cartera para
// poder escribir un dato, y deja la obra abierta reclamando horas que ya nadie va a trabajar.
//
// ═══ SIN FECHA DE INICIO NO SE ADMITE UNA OBRA CERRADA ═══
//
// Una obra cerrada sin inicio cargado no dice cuándo estuvo abierta: admitirla aceptaría horas de
// cualquier día de la historia. El fin vacío sí se lee como «sin fin» (pedido explícito): la obra
// pausada no tiene fin real, y es justo la que vuelve a recibir horas.
//
// VIVE FUERA DE LA ACCIÓN Y DEL COMPONENTE por lo mismo que `planDeJornada`: un archivo
// `'use server'` no exporta funciones puras, y la pantalla y la puerta tienen que leer la misma regla.

export interface ObraConVentana {
  id: string
  nombre: string
  estado: string | null
  fecha_inicio_real: string | null
  fecha_inicio_plan: string | null
  fecha_fin_real: string | null
}

export interface ObraElegibleDelDia {
  id: string
  nombre: string
  /** No está `activa` hoy, pero su ventana cubre el día. La lista la marca «(cerrada)». */
  cerrada: boolean
}

/** Los estados que pueden haber tenido horas en una fecha pasada. `presupuestada`, `perdida` o
 *  `cancelada` nunca se ejecutaron: no hay ventana que las habilite. */
const CON_VENTANA = new Set(['cerrada', 'pausada'])

/** `2026-09-08T00:00:00Z` y `2026-09-08` son el mismo día: se compara la parte de la fecha. */
const dia = (v: string | null): string | null => (v && v.length >= 10 ? v.slice(0, 10) : null)

/** ¿Esa obra admite horas trabajadas el `fecha` (ISO `AAAA-MM-DD`)? */
export function admiteHorasEl(obra: Omit<ObraConVentana, 'id' | 'nombre'>, fecha: string): boolean {
  if (obra.estado === 'activa') return true
  if (!CON_VENTANA.has(obra.estado ?? '')) return false
  const inicio = dia(obra.fecha_inicio_real) ?? dia(obra.fecha_inicio_plan)
  if (inicio === null || inicio > fecha) return false
  const fin = dia(obra.fecha_fin_real)
  return fin === null || fecha <= fin
}

/** Las obras de la lista de un día, en el orden del catálogo: activas y cerradas mezcladas por nombre,
 *  porque quien carga busca la obra por cómo se llama, no por su estado. */
export function obrasElegiblesEl(catalogo: ObraConVentana[], fecha: string): ObraElegibleDelDia[] {
  return catalogo
    .filter((o) => admiteHorasEl(o, fecha))
    .map((o) => ({ id: o.id, nombre: o.nombre, cerrada: o.estado !== 'activa' }))
}
