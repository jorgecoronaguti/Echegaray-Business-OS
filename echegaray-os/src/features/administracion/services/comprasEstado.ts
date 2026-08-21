// LAS REGLAS DE LA PANTALLA 24 · COMPRAS, SIN PANTALLA Y SIN BASE.
//
// Dos cosas viven acá y en ningún otro lado:
//
//   1 · QUÉ DICE LA COLUMNA CONTROL. Es una derivación de cuatro datos —lo que decidió una persona,
//       si hay un parecido, si el papel se pudo clasificar y si tiene obra—, no una columna. Un
//       estado guardado que repitiera lo que ya se puede calcular se desincroniza el día que alguien
//       imputa el comprobante por otra puerta.
//
//   2 · QUÉ SIGNIFICA CADA KPI. Los cuatro números de arriba son el filtro de la lista: si el conteo
//       y el filtro se escribieran por separado, la pantalla podría decir «7 sin imputar» y mostrar
//       nueve filas. `aplicarFiltro` es el único lugar donde ese predicado existe, y lo usan los dos.
//
// Sin `any` y sin cliente de Supabase importado: esto se prueba con `node --test` sin red.

export type EstadoControl = 'sin_revisar' | 'confirmado' | 'en_revision'

/** Las cuatro claves de KPI/filtro. Viajan en la URL (`?f=`), así que se escriben con guion. */
export type FiltroCompras = 'capturadas' | 'por-revisar' | 'sin-imputar' | 'duplicados'

export const FILTROS: FiltroCompras[] = ['capturadas', 'por-revisar', 'sin-imputar', 'duplicados']

export const ROTULO_FILTRO: Record<FiltroCompras, string> = {
  capturadas: 'capturadas',
  'por-revisar': 'por revisar',
  'sin-imputar': 'sin imputar',
  duplicados: 'duplicados',
}

/** Un valor de `?f=` que no reconocemos NO vacía la lista: cae en «capturadas». */
export function filtroDe(valor: string | undefined | null): FiltroCompras {
  return (FILTROS as string[]).includes(String(valor)) ? (valor as FiltroCompras) : 'capturadas'
}

/** Lo mínimo que hace falta para decidir el estado. Es un subconjunto de `comprobante_compra`. */
export interface ControlEntrada {
  estado_control: string | null
  tiene_posible_duplicado: boolean | null
  /** `null` = el código de ARCA no está en la tabla: el papel no se pudo clasificar. */
  signo: number | null
  emisor_cuit: string | null
  comprobante: string | null
  obra_texto: string | null
}

export type ClaveControl =
  | 'por-revisar' | 'duplicado' | 'sin-clasificar' | 'sin-imputar' | 'confirmada' | 'sincronizada'

export interface Control {
  clave: ClaveControl
  etiqueta: string
  /** El tono del `Estado` del design system. `neg` sólo para el problema real. */
  tono: 'pos' | 'neg' | 'warn'
}

/**
 * EL ORDEN NO ES ESTÉTICO, ES LA POLÍTICA DE LA PANTALLA.
 *
 * · Lo que una persona marcó para volver gana sobre todo: es un pedido explícito de atención.
 * · El parecido se avisa mientras nadie lo haya resuelto. Confirmar es una persona diciendo «este
 *   papel está bien», y con eso el aviso deja de pedir trabajo — la evidencia sigue en la vista, lo
 *   que cambia es que ya no reclama.
 * · CONFIRMAR NO ES IMPUTAR. Un comprobante confirmado sin obra sigue diciendo «Sin imputar»: si
 *   «Confirmada» tapara la falta de obra, el trabajo se daría por hecho por haber mirado el papel.
 *   Ése es el defecto que este orden impide y el que prueba `comprasEstado.test.ts`.
 */
export function controlDe(c: ControlEntrada): Control {
  if (c.estado_control === 'en_revision') return { clave: 'por-revisar', etiqueta: 'Por revisar', tono: 'warn' }
  if (c.tiene_posible_duplicado && c.estado_control !== 'confirmado') {
    // «Posible», no «duplicado»: dos comprobantes con números distintos son dos papeles fiscales
    // legítimos, y dos compras iguales de verdad existen. Lo decide una persona.
    return { clave: 'duplicado', etiqueta: 'Posible duplicado', tono: 'neg' }
  }
  if (c.signo === null || !c.emisor_cuit?.trim() || !c.comprobante?.trim()) {
    return { clave: 'sin-clasificar', etiqueta: 'Sin clasificar', tono: 'neg' }
  }
  if (!c.obra_texto?.trim()) return { clave: 'sin-imputar', etiqueta: 'Sin imputar', tono: 'warn' }
  if (c.estado_control === 'confirmado') return { clave: 'confirmada', etiqueta: 'Confirmada', tono: 'pos' }
  return { clave: 'sincronizada', etiqueta: 'Sincronizada', tono: 'pos' }
}

/** Lo que este módulo necesita de un query de PostgREST: dos métodos que devuelven el mismo query. */
export interface Filtrable<T> {
  eq(columna: string, valor: unknown): T
  is(columna: string, valor: null): T
}

/**
 * EL PREDICADO DE CADA KPI, ESCRITO UNA VEZ.
 *
 * Lo usan el conteo (`head: true`) y la lista. Escribirlos por separado es el defecto clásico: el
 * número de arriba y las filas de abajo salen de dos cuentas parecidas, nadie las compara, y la
 * pantalla se contradice consigo misma sin un solo error.
 *
 * `duplicados` cuenta los SIN RESOLVER. Un parecido que alguien ya confirmó o mandó a revisión no es
 * trabajo pendiente, y dejarlo en el número haría que el KPI nunca baje por más que se trabaje.
 */
export function aplicarFiltro<T extends Filtrable<T>>(query: T, filtro: FiltroCompras): T {
  if (filtro === 'por-revisar') return query.eq('estado_control', 'en_revision')
  if (filtro === 'sin-imputar') return query.is('obra_texto', null)
  if (filtro === 'duplicados') {
    return query.eq('tiene_posible_duplicado', true).eq('estado_control', 'sin_revisar')
  }
  return query
}
