// QUÉ ES UNA COMPRA DE OBRA — LA ÚNICA DEFINICIÓN, Y POR ESO PURA Y PROBADA.
//
// ═══ EL PEDIDO (08/09/2026, textual) ═══
//
// «de la sección de compras de app.ecsas.com.ar quitá todos los conceptos o proveedores que no sean
// de obra civil, mantenimiento, estructura; es decir, sacar bancos, sueldos, sindicatos,
// financieros, etc., tal como debés haber hecho en pestaña Compras del Sheet».
//
// La pestaña Compras es el ledger de TODO lo que sale de la empresa: ahí conviven la bolsa de
// cemento, el F931, la cuota del crédito prendario de la camioneta y la quincena. Para la caja eso
// está bien —todo eso sale plata— pero la pantalla que se llama «Compras» tiene otra pregunta:
// QUÉ LE COMPRAMOS A UN PROVEEDOR PARA HACER OBRA. Un sueldo no se le compra a nadie, y el F931 no
// tiene proveedor: tiene organismo. Mezclarlos infla el conteo de comprobantes, mete en «Sin
// comprobante» filas que nunca van a tener factura, y pone a la nómina a competir por atención con
// el corralón.
//
// ═══ POR QUÉ NO ALCANZA CON EL RUBRO ═══
//
// Medido el 08/09/2026 sobre las 955 filas de `compra_sheet` (`select unidad_negocio, count(*)`):
//
//   Civil 580 · Estructura 236 · Impuestos 72 · Mantenimiento 55 · Financiero 12
//
// El rubro saca los 84 de Impuestos y Financiero, pero las 62 filas de «Sueldos» y las 6 de «SAC»
// están cargadas como Civil (19), Estructura (42) y Mantenimiento (1) — porque el dueño imputa la
// mano de obra a la obra que la consumió, que para el costo de obra es correcto. Por eso hacen falta
// las DOS listas: el rubro y el proveedor. Sacar sólo por rubro dejaría los sueldos adentro; sacar
// sólo por proveedor dejaría adentro los 35 de ARCA y los 12 del Banco.
//
// ═══ EL TALLER ENTRA (precisión del dueño, 08/09) ═══
//
// «dejar solo lo que va a obra o TALLER. Lo demás se maneja por Sheet Flujo de Fondos en las
// pestañas correspondientes». El taller —herramientas, vehículos, máquinas, su mantenimiento— no es
// un rubro: es un DESTINO de la columna Cliente/Asignación, y sus filas ya vienen con rubro
// Estructura o Mantenimiento, así que entran por la puerta de siempre. Medido el 08/09 por destino:
// Taller 73 + TALLER 5 + Almacen 24 + «Vehiculos / Maquinas» 1 entran; la única de Taller que sale
// es la fila 884, proveedor «Sueldos» — mano de obra, y el dueño dijo «nada de sueldos».
//
// Lo que el destino NO hace es rescatar una fila: «Banco · Crédito Prendario» imputado al taller
// sigue siendo una cuota, no una compra. Por eso el destino no es una excepción escrita en el
// código, y sí hay un test que fija las dos mitades de esa frase.
//
// Del otro lado, los destinos que se van enteros —medidos, 0 filas adentro— son F931 15, Plan de
// pago 20, Crédito Prendario 12, FCL 12, UOCRA 12, IERIC 6, FODECO 6, Obras 17 y Sueldos 2: todos
// salen por su rubro o por su proveedor, sin necesitar una lista de destinos.
//
// ═══ LO DESCONOCIDO ENTRA Y SE DECLARA ═══
//
// Un rubro que no esté en ninguna de las dos listas ENTRA, y `esDudosa` lo marca para que la
// pantalla lo diga. Esconder una compra porque el rubro llegó con un nombre nuevo sería el defecto
// caro: la lista mostraría menos de lo que hay sin que nadie se entere. Mostrar de más se ve; ocultar
// de menos, no.

/** Lo que hace falta mirar de una fila para decidir. Subconjunto de `CompraSheet`. */
export interface Clasificable {
  proveedor: string | null
  concepto: string | null
  detalle_obra?: string | null
  unidad_negocio: string | null
  estado: string | null
}

/** Sin tildes, en minúsculas, sin puntuación y con los espacios colapsados. */
function normalizar(v: string | null | undefined): string {
  return String(v ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * LOS RUBROS QUE SON OBRA. Valores REALES de `compra_sheet.unidad_negocio`, no una lista inventada:
 * Civil 580, Estructura 236, Mantenimiento 55. Son los tres que nombró el dueño.
 */
export const RUBROS_DE_OBRA = new Set(['civil', 'obra civil', 'estructura', 'mantenimiento'])

/**
 * LOS RUBROS QUE NO SON OBRA. Impuestos 72 y Financiero 12 son los dos que hoy tiene la pestaña; el
 * resto está escrito para el día que el dueño abra un rubro nuevo con el mismo sentido (una fila de
 * «Nómina» o «Cargas sociales» no puede entrar por no estar prevista).
 */
export const RUBROS_FUERA = new Set([
  'impuestos', 'impositivo', 'fiscal',
  'financiero', 'financiacion', 'financiero bancario', 'banco', 'bancos', 'bancario',
  'nomina', 'sueldos', 'jornales', 'personal', 'laboral',
  'cargas sociales', 'seguridad social', 'gremiales', 'gremial', 'sindicatos', 'sindical',
])

/**
 * PROVEEDORES QUE NUNCA SON UNA COMPRA DE OBRA, aunque el rubro venga de obra o vacío.
 *
 * Se compara el nombre COMPLETO normalizado. Es a propósito: «SAC» y «FCL» son siglas de tres letras
 * y buscarlas dentro del nombre sacaría «Goldstein Automores SACI», que es una concesionaria y una
 * compra real. Lo que sí se busca palabra por palabra está en `PALABRAS_FUERA`, y ahí sólo entran
 * nombres que no pueden significar otra cosa.
 */
export const PROVEEDORES_FUERA = new Set([
  'sueldos', 'sueldo', 'sac', 'fcl', 'fondo de cese', 'fondo de cese laboral',
  'sindicatos', 'sindicato', 'banco', 'bancos', 'arca', 'afip', 'dgr', 'anses', 'jornales',
])

/**
 * PALABRAS QUE DELATAN AL ORGANISMO aunque venga con apellido («Banco Santander», «ARCA · F931»,
 * «UOCRA Seccional San Juan»). Todas son inequívocas: ninguna empresa que le venda materiales a
 * Echegaray se llama así.
 */
export const PALABRAS_FUERA = new Set([
  'banco', 'arca', 'afip', 'uocra', 'ieric', 'sindicatos', 'sindicato', 'anses', 'dgr',
])

/** Por qué una fila no es una compra de obra. `null` = sí lo es. */
export type MotivoFuera = 'rubro' | 'proveedor' | 'cancelada' | 'sale-por-otro-lado'

/**
 * EL MOTIVO POR EL QUE UNA FILA NO ES UNA COMPRA DE OBRA.
 *
 * Devuelve el motivo y no un booleano porque la pantalla tiene que poder DECIR cuántas filas sacó y
 * por qué. Un filtro que descuenta 152 filas sin explicar cuáles es indistinguible de un bug.
 *
 * El orden es el de la evidencia más fuerte: el rubro lo escribe el dueño en la columna, el
 * proveedor es el nombre, y «Cancelado» / «sale por …» son la marca explícita que él mismo puso en
 * la pestaña para decir «esto no se paga acá, sale por Jornales por Quincena / Cargas Sociales» —
 * 28 filas medidas el 08/09, 19 de sueldos y 9 de ARCA/FCL/SINDICATOS.
 */
export function motivoFuera(f: Clasificable): MotivoFuera | null {
  const rubro = normalizar(f.unidad_negocio)
  if (rubro && RUBROS_FUERA.has(rubro)) return 'rubro'
  const proveedor = normalizar(f.proveedor)
  if (proveedor) {
    if (PROVEEDORES_FUERA.has(proveedor)) return 'proveedor'
    if (proveedor.split(' ').some((p) => PALABRAS_FUERA.has(p))) return 'proveedor'
  }
  if (normalizar(f.estado) === 'cancelado') return 'cancelada'
  const textos = `${normalizar(f.concepto)} ${normalizar(f.detalle_obra)}`
  if (textos.includes('sale por')) return 'sale-por-otro-lado'
  return null
}

/** ¿Esta fila es una compra de obra civil, mantenimiento o estructura? */
export function esCompraDeObra(f: Clasificable): boolean {
  return motivoFuera(f) === null
}

/**
 * ¿ESTA FILA ENTRÓ SIN QUE SU RUBRO LO CONFIRME? Entra —no se esconde— pero se puede contar y
 * mostrar. Hoy son 0: los cinco rubros de la pestaña están clasificados. Existe para el rubro nuevo.
 */
export function esDudosa(f: Clasificable): boolean {
  if (!esCompraDeObra(f)) return false
  const rubro = normalizar(f.unidad_negocio)
  return !RUBROS_DE_OBRA.has(rubro)
}

export interface Corte<T> {
  deObra: T[]
  /** Cuántas quedaron afuera por cada motivo. Es lo que la pantalla declara al pie. */
  fuera: Record<MotivoFuera, number>
  /** Las que entraron con un rubro no clasificado, para que el dueño decida. */
  dudosas: T[]
}

/** La población partida en dos, con la cuenta de lo que salió y por qué. */
export function separarComprasDeObra<T extends Clasificable>(filas: T[]): Corte<T> {
  const fuera: Record<MotivoFuera, number> = {
    rubro: 0, proveedor: 0, cancelada: 0, 'sale-por-otro-lado': 0,
  }
  const deObra: T[] = []
  for (const f of filas) {
    const motivo = motivoFuera(f)
    if (motivo) fuera[motivo] += 1
    else deObra.push(f)
  }
  return { deObra, fuera, dudosas: deObra.filter(esDudosa) }
}

/** Cuántas filas salieron en total. */
export function totalFuera(fuera: Record<MotivoFuera, number>): number {
  return Object.values(fuera).reduce((s, n) => s + n, 0)
}
