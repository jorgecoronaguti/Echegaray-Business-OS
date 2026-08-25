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

/**
 * DÓNDE ESTÁ IMPUTADA LA COMPRA. Lo calcula `comprobante_compra.imputacion` (20260822T6220) con el
 * diccionario de `obra_alias`, que es el MISMO que resuelve el costo por obra. No se deriva acá: el
 * día que se derivara en TypeScript habría dos definiciones de «a qué obra pertenece este gasto».
 *
 * · `obra`            → una obra concreta, y la vista publica su `obra_id`.
 * · `estructura`      → imputada a Estructura (sueldos, UOCRA, administración): NO es de una obra,
 *                       y tampoco es trabajo pendiente. El binario viejo no las distinguía.
 * · `sin_resolver`    → alguien escribió un rótulo que el diccionario no conoce. El gasto no llega a
 *                       ninguna obra y NADIE se entera: es la fuga silenciosa del costo por obra.
 * · `sin_identificar` → nadie dijo nada. Esto sí es «sin imputar».
 */
export type Imputacion = 'obra' | 'estructura' | 'sin_resolver' | 'sin_identificar'

export const ROTULO_IMPUTACION: Record<Imputacion, string> = {
  obra: 'obra identificada',
  estructura: 'Estructura',
  sin_resolver: 'obra sin resolver',
  sin_identificar: 'sin imputar',
}

/** Las claves de KPI/filtro. Viajan en la URL (`?f=`), así que se escriben con guion. */
export type FiltroCompras =
  | 'capturadas' | 'por-revisar' | 'sin-imputar' | 'sin-resolver' | 'estructura' | 'duplicados'

export const FILTROS: FiltroCompras[] = [
  'capturadas', 'por-revisar', 'sin-imputar', 'sin-resolver', 'estructura', 'duplicados',
]

export const ROTULO_FILTRO: Record<FiltroCompras, string> = {
  capturadas: 'capturadas',
  'por-revisar': 'por revisar',
  'sin-imputar': 'sin imputar',
  'sin-resolver': 'obra sin resolver',
  estructura: 'Estructura',
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
  /** El estado FINO, calculado en la base. `null` = la vista no lo trajo. */
  imputacion: Imputacion | null
}

export type ClaveControl =
  | 'por-revisar' | 'duplicado' | 'sin-clasificar' | 'sin-imputar' | 'sin-resolver'
  | 'confirmada' | 'sincronizada'

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
 *
 * ═══ LO QUE CAMBIÓ EL 22/08/2026 ═══
 *
 * El estado de imputación era binario —`obra_texto is null`— y con eso metía en la misma bolsa
 * cuatro situaciones que piden cosas distintas. Ahora sólo `sin_identificar` reclama trabajo de
 * imputación; ESTRUCTURA no es un pendiente (el gasto ya está donde va) y `sin_resolver` es un
 * pendiente DISTINTO: no hay que averiguar la obra, hay que declarar el alias.
 *
 * Cuando `imputacion` no llega —una fuente vieja que no publica la columna— se cae al criterio
 * anterior: sin `obra_texto`, «Sin imputar». Fallar al estado que PIDE trabajo, nunca al que lo da
 * por hecho.
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
  const imputacion = c.imputacion ?? (c.obra_texto?.trim() ? 'obra' : 'sin_identificar')
  if (imputacion === 'sin_identificar') return { clave: 'sin-imputar', etiqueta: 'Sin imputar', tono: 'warn' }
  if (imputacion === 'sin_resolver') {
    // El rótulo existe y el gasto NO llega a ninguna obra. No se arregla eligiendo obra en el
    // panel: se arregla declarando el alias, que es otra decisión y otra pantalla.
    return { clave: 'sin-resolver', etiqueta: 'Obra sin resolver', tono: 'warn' }
  }
  if (c.estado_control === 'confirmado') return { clave: 'confirmada', etiqueta: 'Confirmada', tono: 'pos' }
  return { clave: 'sincronizada', etiqueta: 'Sincronizada', tono: 'pos' }
}

/**
 * LOS ATAJOS DEL SELECTOR DE IMPUTACIÓN — hasta tres, y NINGUNO es una recomendación.
 *
 * `COMPONENTS.md` §Imputation selector pide «hasta tres atajos como pastillas con las obras
 * probables». Acá «probable» se resuelve con un HECHO y no con un modelo: las obras a las que ya se
 * imputaron otros comprobantes DE ESTE MISMO PROVEEDOR, ordenadas por cuántas veces pasó. No hay
 * puntaje, no hay umbral y no hay preselección — el atajo ahorra dos clics, no decide.
 *
 * Eso es a propósito. El OS ya tiene UNA definición de «obra sugerida»
 * (`orquestador/lib/imputacion-pendiente.mjs` · `sugerirObra`), que corre sobre `costos_obra` con el
 * diccionario de alias y declara su evidencia. Escribir acá una segunda con otra fuente y otro
 * criterio daría dos respuestas distintas a la misma pregunta, que es exactamente lo que la regla de
 * realidad única prohíbe. Por eso esto NO se llama sugerencia: es historial.
 *
 * Lo que se descarta y por qué:
 * · el texto vacío — no es una obra, es la ausencia de imputación;
 * · la obra que el comprobante YA tiene — un atajo que no cambia nada gasta un lugar de tres.
 *
 * `Estructura` y los rótulos que el diccionario no conoce nunca llegan hasta acá: quien lee filtra
 * por `imputacion = 'obra'`, que es la única clasificación que significa «llegó a una obra».
 */
export function obrasFrecuentes(
  textos: (string | null | undefined)[],
  { excluir, tope = 3 }: { excluir?: string | null; tope?: number } = {},
): string[] {
  const fuera = excluir?.trim() ?? ''
  const veces = new Map<string, number>()
  for (const crudo of textos) {
    const t = crudo?.trim()
    if (!t || t === fuera) continue
    veces.set(t, (veces.get(t) ?? 0) + 1)
  }
  return [...veces.entries()]
    // El desempate por nombre existe para que dos obras con la misma cuenta no se turnen de lugar
    // entre recargas: un atajo que se mueve solo se toca por error.
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'))
    .slice(0, tope)
    .map(([obra]) => obra)
}

/** Lo mínimo para sumar una vista: el importe y si suma o resta. */
export interface Sumable {
  imp_total: number | null
  signo: number | null
}

export interface TotalVista {
  /** La suma de los que SÍ se pueden sumar. `null` cuando ninguno se pudo. */
  total: number | null
  /** Los que llegaron sin importe. No valen $ 0: quedan afuera y se cuentan. */
  sinImporte: number
  /** Los que tienen importe pero el código de ARCA no está en la tabla: no se sabe si suman o restan. */
  sinSigno: number
}

/**
 * LO QUE SUMA LO QUE HAY EN PANTALLA — la fila de total de la tabla de Compras.
 *
 * Tres cosas que este total NO hace, y cada una es un defecto que ya costó plata en este repo:
 *
 * 1 · NO TRATA `null` COMO CERO. Un comprobante sin importe cargado no es una compra de $ 0: sale
 *     de la suma y se cuenta aparte, para que la fila pueda decir cuántos quedaron afuera.
 * 2 · NO ASUME EL SIGNO. Una nota de crédito RESTA, y un código de ARCA que la tabla no conoce no
 *     se puede sumar en ninguna dirección. Sumar de prepo es literalmente el bug de $41.953.276 del
 *     21/07 (`orquestador/lib/comprobante-arca.mjs`) vestido de fila de total.
 * 3 · NO SE PRESENTA COMO EL TOTAL DEL LIBRO. Suma lo que la pantalla trajo, que con el tope o con
 *     un filtro puesto es un subconjunto. Quien lo dibuja tiene que rotularlo como tal.
 */
export function totalDeLaVista(filas: Sumable[]): TotalVista {
  let total: number | null = null
  let sinImporte = 0
  let sinSigno = 0
  for (const f of filas) {
    if (f.imp_total == null) { sinImporte += 1; continue }
    if (f.signo == null) { sinSigno += 1; continue }
    total = (total ?? 0) + f.signo * f.imp_total
  }
  return { total, sinImporte, sinSigno }
}

/** Lo que este módulo necesita de un query de PostgREST: dos métodos que devuelven el mismo query. */
export interface Filtrable<T> {
  eq(columna: string, valor: unknown): T
  is(columna: string, valor: null): T
}

/**
 * EL PREDICADO DE CADA KPI, ESCRITO UNA VEZ — y ahora DECLARADO, no programado.
 *
 * Lo usan tres consumidores: la lista de la pantalla 24, su conteo contra la base (`aplicarFiltro`)
 * y el conteo en memoria de la entrada de Administración (`cumpleFiltro`), que cuenta los cuatro
 * números de Compras sobre UNA sola lectura en vez de cuatro. Escribirlos por separado es el
 * defecto clásico: el número de arriba y las filas de abajo salen de dos cuentas parecidas, nadie
 * las compara, y la pantalla se contradice consigo misma sin un solo error.
 *
 * `imputacion` Y NO `obra_texto is null`: el predicado viejo contaba como pendiente a los gastos de
 * Estructura que sí tenían rótulo, y dejaba fuera del conteo a los que tienen un rótulo que el
 * diccionario no conoce — que son los que de verdad no llegan a ninguna obra.
 *
 * `duplicados` cuenta los SIN RESOLVER. Un parecido que alguien ya confirmó o mandó a revisión no es
 * trabajo pendiente, y dejarlo en el número haría que el KPI nunca baje por más que se trabaje.
 */
const PREDICADO: Record<FiltroCompras, readonly { columna: string; valor: unknown }[]> = {
  capturadas: [],
  'por-revisar': [{ columna: 'estado_control', valor: 'en_revision' }],
  'sin-imputar': [{ columna: 'imputacion', valor: 'sin_identificar' }],
  'sin-resolver': [{ columna: 'imputacion', valor: 'sin_resolver' }],
  estructura: [{ columna: 'imputacion', valor: 'estructura' }],
  duplicados: [
    { columna: 'tiene_posible_duplicado', valor: true },
    { columna: 'estado_control', valor: 'sin_revisar' },
  ],
}

/** El predicado contra la base: PostgREST lo resuelve y devuelve las filas o el conteo. */
export function aplicarFiltro<T extends Filtrable<T>>(query: T, filtro: FiltroCompras): T {
  return PREDICADO[filtro].reduce((q, c) => q.eq(c.columna, c.valor), query)
}

/**
 * EL MISMO predicado contra una fila ya leída.
 *
 * `=== valor` y no una comparación laxa: `tiene_posible_duplicado` llega `true`, `false` o `null`, y
 * `= true` en SQL tampoco toma los `null`. Las dos formas cuentan lo mismo o este test miente.
 */
export function cumpleFiltro(fila: Record<string, unknown>, filtro: FiltroCompras): boolean {
  return PREDICADO[filtro].every((c) => fila[c.columna] === c.valor)
}
