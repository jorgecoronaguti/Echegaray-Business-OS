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
// ═══ LA VENTANA SALE DE LO DECLARADO Y DE LAS HORAS YA CARGADAS ═══
//
// Medido en la base el 15/09/2026: de 20 obras cerradas, 10 no tienen fecha de inicio y 11 no tienen
// fin. Exigir la fecha declarada dejaba afuera a la-estrella, le-mamposteria o messina, que tienen
// cientos de horas cargadas. Y sf-mamposteria declara fin el 02/09 con horas hasta el 14/09.
//
//  · Inicio: la fecha declarada (real, si no plan) o el primer día con horas, EL MÁS TEMPRANO de los
//    dos. Si sólo hay horas, se abre `MARGEN_DIAS` antes: el primer día cargado no suele ser el
//    primero trabajado.
//  · Fin: `fecha_fin_real` o el último día con horas, EL MÁS TARDÍO — la evidencia le gana a una fecha
//    de cierre que quedó vieja. Si sólo hay horas, se cierra `MARGEN_DIAS` después. Sin fin y sin
//    horas, la ventana queda abierta (la obra pausada que retoma).
//  · Sin fecha declarada y sin una sola hora no hay ventana: admitirla aceptaría cualquier día de la
//    historia, y eso es fabricar el período de una obra.
//
// `MARGEN_DIAS` = 16, la quincena más larga: cubre la quincena anterior o siguiente que quedó sin
// cargar, que es la unidad en que se atrasa la carga. Más margen ya no se apoya en ningún dato.
//
// ═══ LAS OBRAS DE PRUEBA NO SE OFRECEN ═══
//
// La suite E2E fabrica obras (`zz-e2e-*`, `prueba-e2e`, código `ZZ-…`, nombre `[PRUEBA E2E]`) y alguna
// queda cerrada en la base. Cerrada, nunca recibe horas. ACTIVA sí: es el fixture de una corrida en
// curso (`tests/asistencia-editar-en-celda.spec.ts` la crea `activa`) y sacarla rompería la prueba.
//
// VIVE FUERA DE LA ACCIÓN Y DEL COMPONENTE por lo mismo que `planDeJornada`: un archivo
// `'use server'` no exporta funciones puras, y la pantalla y la puerta tienen que leer la misma regla.

import { MARCAS_DE_NOMBRE } from './identidadDePrueba.ts'

export interface ObraConVentana {
  id: string
  nombre: string
  estado: string | null
  codigo?: string | null
  fecha_inicio_real: string | null
  fecha_inicio_plan: string | null
  fecha_fin_real: string | null
  /** Primer y último día con `registros_hh` en esa obra. `null`/ausente = sin horas o sin lectura. */
  primera_hh?: string | null
  ultima_hh?: string | null
}

export interface ObraElegibleDelDia {
  id: string
  nombre: string
  /** No está `activa` hoy, pero su ventana cubre el día. La lista la marca «(cerrada)». */
  cerrada: boolean
}

export const MARGEN_DIAS = 16

/** Los estados que pueden haber tenido horas en una fecha pasada. `presupuestada`, `perdida` o
 *  `cancelada` nunca se ejecutaron: no hay ventana que las habilite. */
const CON_VENTANA = new Set(['cerrada', 'pausada'])

/** `2026-09-08T00:00:00Z` y `2026-09-08` son el mismo día: se compara la parte de la fecha. */
const dia = (v: string | null | undefined): string | null => (v && v.length >= 10 ? v.slice(0, 10) : null)

const correr = (iso: string, dias: number): string => {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

export function esObraDePrueba(o: { id: string; nombre: string; codigo?: string | null }): boolean {
  if (/^(zz-e2e|prueba-e2e)/i.test(o.id)) return true
  if (/^ZZ/i.test((o.codigo ?? '').trim())) return true
  return MARCAS_DE_NOMBRE.some((re) => re.test(o.nombre))
}

/** El período en que la obra pudo tener horas. `null` = no hay con qué afirmarlo. `fin: null` = abierta. */
export function ventanaDe(o: ObraConVentana): { inicio: string; fin: string | null } | null {
  const declarado = dia(o.fecha_inicio_real) ?? dia(o.fecha_inicio_plan)
  const primera = dia(o.primera_hh)
  const ultima = dia(o.ultima_hh)
  const inicio = declarado && primera
    ? (primera < declarado ? primera : declarado)
    : declarado ?? (primera ? correr(primera, -MARGEN_DIAS) : null)
  if (inicio === null) return null
  const finReal = dia(o.fecha_fin_real)
  const fin = finReal && ultima
    ? (ultima > finReal ? ultima : finReal)
    : finReal ?? (ultima ? correr(ultima, MARGEN_DIAS) : null)
  return { inicio, fin }
}

/** ¿Esa obra admite horas trabajadas el `fecha` (ISO `AAAA-MM-DD`)? */
export function admiteHorasEl(obra: ObraConVentana, fecha: string): boolean {
  if (obra.estado === 'activa') return true
  if (esObraDePrueba(obra)) return false
  if (!CON_VENTANA.has(obra.estado ?? '')) return false
  const v = ventanaDe(obra)
  return v !== null && v.inicio <= fecha && (v.fin === null || fecha <= v.fin)
}

/** Las obras de la lista de un día, en el orden del catálogo: activas y cerradas mezcladas por nombre,
 *  porque quien carga busca la obra por cómo se llama, no por su estado. */
export function obrasElegiblesEl(catalogo: ObraConVentana[], fecha: string): ObraElegibleDelDia[] {
  return catalogo
    .filter((o) => admiteHorasEl(o, fecha))
    .map((o) => ({ id: o.id, nombre: o.nombre, cerrada: o.estado !== 'activa' }))
}
