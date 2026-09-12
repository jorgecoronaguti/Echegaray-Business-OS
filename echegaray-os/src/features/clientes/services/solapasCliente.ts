// QUÉ CARAS TIENE LA FICHA DEL CLIENTE Y QUIÉN LAS VE.
//
// ═══ POR QUÉ ES UNA FUNCIÓN Y NO UN ARRAY DENTRO DEL JSX ═══
//
// Tres de las siete caras son ECONÓMICAS y una de ellas —«Acceso al portal»— decide qué ve el
// cliente de la empresa desde afuera. Ofrecerle esa solapa a quien no corresponde no rompe nada
// visible: la RLS le devolvería cero filas y la pantalla se vería vacía, o sea que el defecto se
// descubre el día que alguien habilite un mail que no debía. Una lista adentro del JSX no se puede
// probar; ésta sí, y la prueba está atada al predicado de permiso, no a la costumbre.
//
// El parseo del parámetro también vive acá: `?solapa=` fue el nombre viejo y hay enlaces
// compartidos con él. Que un favorito abra Resumen sin decir por qué es un defecto silencioso.

// ═══ NUEVE CARAS ERAN DEMASIADAS (dueño, 12/09/2026 13:10) ═══
//
// «El CRM admin en cada cliente tiene secciones inútiles y repetitivas con datos que pueden
// unificarse en menos secciones; revisar y mejorar todo eso.»
//
// Quedan CINCO, y las cuatro que se fueron no perdieron ninguna capacidad:
//
//   CUENTA CORRIENTE  era el resumen agregado de la MISMA plata que Cobranzas lista fila por fila,
//                     con su propia barra de solapa: para saber el saldo había que cambiar de cara y
//                     volver. Ahora es un bloque DENTRO de Cobranzas, arriba de las filas.
//   ESQUEMA DE PAGO   es el cronograma de esa misma plata —lo que el cliente ve en el portal—. Va
//                     abajo, en la misma cara, con su ancla `#esquema-de-pago`.
//   ACTIVIDAD         es la historia de la relación, no una sección de trabajo: se lee de reojo
//                     mientras se mira otra cosa. Pasó al COSTADO como «Actividad reciente», con sus
//                     ocho últimos hechos y la nota nueva; la línea entera se abre con `?actividad=todo`.
//   ACCESO AL PORTAL  se consulta («¿quién entra?») mucho más de lo que se edita. El ESTADO vive en
//                     el costado, en el panel «Portal del cliente» que ya existía, y la pantalla
//                     completa —la cascada de permisos, el alta de un mail, el registro de ingresos—
//                     se abre desde ahí con `?portal=1`. Dejó de ser una SOLAPA; no dejó de existir.
//
// ═══ POR QUÉ EL PORTAL NO SE METIÓ ENTERO EN EL COSTADO ═══
//
// Son 300px. La pantalla 31 es un porte LITERAL del handoff del dueño: una tabla de seis pistas que
// pide 958px de ancho medido, el panel de alta de 392px, la cascada de permisos y el registro de
// ingresos. Meterla ahí no era mudarla, era reescribirla en chico y perder la mitad. El costado
// publica lo que se consulta —cuántos entran, cuántos no ingresaron nunca— y la puerta a la pantalla.
//
// ═══ LOS ENLACES VIEJOS NO MUEREN ═══
//
// `?vista=cuenta|esquema|accesos|actividad` están compartidos por mail y en favoritos. `destinoDe()`
// los manda a la cara nueva CON su bloque —no a la ficha genérica—, y la página redirige de verdad
// para que la dirección que queda en la barra sea la que existe hoy.
export const SOLAPAS = ['obras', 'ordenes', 'cobranzas', 'presupuestos', 'documentos'] as const
export type Solapa = (typeof SOLAPAS)[number]

/** Las caras que se dibujan A SANGRE: usan el ancho entero para su propio panel, así que no conviven
 *  con el aside de identidad de la ficha 26.
 *
 *  COBRANZAS VA A SANGRE: son nueve columnas de plata —y ahora además la cuenta corriente y el
 *  esquema— y el costado de identidad le comería 300px, que es justo lo que hace que una tabla densa
 *  deje de leerse. */
export const A_SANGRE: readonly Solapa[] = ['cobranzas']

/** Las que sólo ve quien tiene permiso económico. */
export const ECONOMICAS: readonly Solapa[] = ['ordenes', 'cobranzas', 'presupuestos']

/** A dónde va cada enlace de una cara retirada: la cara nueva y el ANCLA o el parámetro que abre el
 *  bloque exacto. Un enlace viejo que cae en la ficha genérica es un enlace roto que no lo parece. */
export interface Destino {
  solapa: Solapa
  /** El `#ancla` del bloque dentro de la cara. `null` = la cara entera. */
  ancla: string | null
  /** El parámetro que abre la sub-pantalla, cuando el destino no es un bloque de la cara. */
  parametro: { clave: string; valor: string } | null
}

const RETIRADAS: Record<string, Destino> = {
  cuenta: { solapa: 'cobranzas', ancla: 'cuenta-corriente', parametro: null },
  esquema: { solapa: 'cobranzas', ancla: 'esquema-de-pago', parametro: null },
  actividad: { solapa: 'obras', ancla: null, parametro: { clave: 'actividad', valor: 'todo' } },
  accesos: { solapa: 'obras', ancla: null, parametro: { clave: 'portal', valor: '1' } },
}

/** Las cuatro caras retiradas, para que un test pueda recorrerlas sin copiar la lista. */
export const CARAS_RETIRADAS = Object.keys(RETIRADAS) as readonly string[]

/**
 * DÓNDE ABRE LO QUE SE PIDIÓ.
 *
 * `vista` es el nombre de hoy y `solapa` el de ayer — se acepta el que llegue. Una cara retirada
 * devuelve su destino EXACTO; una que no existe abre Trabajos, porque un enlace tipeado a mano no
 * puede dejar la ficha en blanco.
 */
export function destinoDe(vista: string | undefined, legacy?: string | undefined): Destino {
  const pedida = vista ?? legacy ?? ''
  if (RETIRADAS[pedida]) return RETIRADAS[pedida]
  return {
    solapa: (SOLAPAS as readonly string[]).includes(pedida) ? (pedida as Solapa) : 'obras',
    ancla: null,
    parametro: null,
  }
}

/** Sólo la cara. `?vista=resumen` —que fue real hasta el v2 y sigue circulando— cae en Trabajos, que
 *  es lo que ese enlace mostraba arriba de todo. */
export function solapaDe(vista: string | undefined, legacy?: string | undefined): Solapa {
  return destinoDe(vista, legacy).solapa
}

/** `true` = lo que se pidió es una cara retirada y la dirección tiene que CAMBIAR, no sólo dibujar
 *  otra cosa: si la barra sigue diciendo `?vista=esquema`, el enlace sigue circulando roto. */
export function esCaraRetirada(vista: string | undefined, legacy?: string | undefined): boolean {
  return RETIRADAS[vista ?? legacy ?? ''] !== undefined
}

export interface SolapaVisible {
  clave: Solapa
  label: string
  /** `null` cuando contar no aporta: un «0» al lado de «Cuenta corriente» se lee como saldo. */
  cuenta: number | null
}

/** Los rótulos SON los del mockup, palabra por palabra. */
const LABEL: Record<Solapa, string> = {
  // «TRABAJOS» Y NO «OBRAS» (dueño, 10/09/2026 17:15): «Administración es un CRM y Obra un ERP».
  // Lo que el CRM lista son los TRABAJOS que el cliente encargó —con su OC, su facturación y su
  // cobro—; la obra como unidad de ejecución, con su plan y su costo, vive en el ERP. La CLAVE de
  // la solapa sigue siendo `obras` a propósito: cambiarla rompería los enlaces ya compartidos.
  obras: 'Trabajos',
  // EL RÓTULO DICE LAS DOS COSAS (dueño, 11/09/2026 18:42: «la sección Órdenes tiene que ser órdenes
  // de compra y de pago»). «Órdenes» solo no distinguía lo que el cliente nos ENCARGA de lo que
  // ORDENA PAGAR.
  ordenes: 'Órdenes de compra y de pago',
  // COBRANZAS ES LA ENTRADA DE LA PLATA (dueño, 10/09/2026 18:20: «necesito una sección exclusiva
  // por cliente con todo lo que involucre cobranzas»), y desde el 12/09 es la ÚNICA: la cuenta
  // corriente y el esquema de pago son bloques de esta cara.
  cobranzas: 'Cobranzas',
  presupuestos: 'Presupuestos',
  documentos: 'Documentos',
}

export function solapasDeCliente({ veEconomia, obras, presupuestos, documentos, cobranzas = null, ordenes = null }: {
  veEconomia: boolean
  obras: number
  /** Cuántas OC y OP tiene; `null` fuera de su cara, que no se leyó. */
  ordenes?: number | null
  presupuestos: number
  documentos: number
  /** Cuántas filas de la pestaña Cobranzas tiene el cliente. `null` = no se pudieron leer, y
   *  entonces NO se escribe un cero: diría que no tiene ninguna. */
  cobranzas?: number | null
}): SolapaVisible[] {
  const cuentas: Record<Solapa, number | null> = { obras, ordenes, cobranzas, presupuestos, documentos }
  return SOLAPAS
    .filter((s) => veEconomia || !ECONOMICAS.includes(s))
    .map((clave) => ({ clave, label: LABEL[clave], cuenta: cuentas[clave] }))
}
