// LAS SECCIONES DE COMPRAS — la fila de nivel 3 que comparten la pestaña Compras y Proveedores.
//
// ═══ QUÉ PIDIÓ EL DUEÑO (16/09/2026) ═══
//
// «Quiero que pongas todo el módulo proveedores dentro de "compras" como sección». Proveedores deja
// de ser un destino de la barra de Administración —que queda en Clientes · Personal · Compras— y
// pasa a ser una sección de Compras, con el patrón que Personal ya usa (Plantel · Horas ·
// Liquidación, `personas/page.tsx · vistasDe`).
//
// ═══ POR QUÉ LA FILA ES PLANA Y TIENE CUATRO ═══
//
// La regla de diseño es MÁXIMO DOS NIVELES SIMULTÁNEOS: el área (la barra de Administración) y la
// solapa de la entidad. En esta app el nivel 3 ya existe como TEXTO CON SUBRAYADO y no como una
// tercera barra (ver `CabeceraSeccion`), y ése es el único lugar que hay.
//
// Por eso las tres sub-vistas que Proveedores tenía —maestro, «A quién le debo», «Nombres sin
// resolver»— NO se cuelgan de una sección «Proveedores»: eso sería un cuarto nivel (área → Compras →
// Proveedores → deuda) y obligaría a decodificar antes de leer. Suben a hermanas de Compras en la
// MISMA fila. El efecto secundario es bueno: la deuda y la cola de nombres pasan de dos clics a uno.
//
//   Compras               el libro de comprobantes — lo que se compró.
//   Proveedores           el maestro, identidad por CUIT — a quién se le compra.
//   A quién le debo       lo impago y cuándo vence — con qué se decide un pago.
//   Nombres sin resolver  los textos que Compras trae y todavía no son nadie.
//
// «A quién le debo» ES SECCIÓN PROPIA Y NO SUB-VISTA DEL MAESTRO. Contesta otra pregunta: el maestro
// es una pantalla de mantenimiento que casi no se toca, y la deuda es una pantalla de DECISIÓN que se
// mira cada semana para elegir qué se paga. Además su dato no sale del padrón sino de los
// comprobantes impagos —es de Compras, no de la ficha del proveedor—, así que su padre natural es
// Compras. Enterrarla un nivel más abajo la escondía detrás de la lista que menos se usa.
//
// ═══ LAS URLs NO SE MUEVEN, Y ESO ES LA DECISIÓN ═══
//
// Podría haberse mudado todo a `/administracion/compras/proveedores` con un redirect permanente. Se
// descartó por lo que rompe en silencio: hay diez `revalidatePath('/administracion/proveedores…')`
// en `proveedoresActions.ts`, `documentosProveedorActions.ts` y `obraDeCompraActions.ts`, y
// `revalidatePath` con una ruta que ya no existe NO falla — deja de refrescar la pantalla y nadie se
// entera. Se suman los enlaces que el bot ya mandó por Mattermost (`comunicacion/comprobantes/
// escritura.mjs`), ocho specs de Playwright y ~40 `href` internos. Cambiar la CABECERA cuesta tres
// archivos; cambiar la RUTA cuesta todo eso y deja el riesgo del que se olvide.
//
// Lo que se paga por elegir así: la URL no dice «compras». Es un costo de lectura de la barra de
// direcciones, no de navegación, y el área ya lo hacía antes (`/clientes` vive en Administración y
// `/administracion/pendientes` enciende Compras).
//
// Sin imports de React ni de Supabase: se prueba con `node --test` y lo lee un componente de
// servidor sin arrastrar nada.

/** Las cuatro. `deuda` y `resolver` viven en la misma ruta que `proveedores`, con `?vista=`. */
export type SeccionCompras = 'compras' | 'proveedores' | 'deuda' | 'resolver'

export interface SeccionDeCompras {
  clave: SeccionCompras
  titulo: string
  /** La ruta canónica. Una pantalla puede estrecharla para conservar lo que ya tiene puesto. */
  href: string
}

/** Lo que `CabeceraSeccion` dibuja. Se declara acá para no importar el componente en un servicio. */
export interface VistaDeSeccion {
  clave: string
  titulo: string
  /** `null` = no se pudo contar, o esta pantalla no lo leyó. Nunca 0 por defecto. */
  cuenta: number | null
  activa: boolean
  href: string
}

/**
 * EL ORDEN ES EL ARGUMENTO y por eso vive en un solo lugar.
 *
 * Primero el libro —es a lo que se entra—, después con quién se comercia, después lo que se le debe,
 * y último la cola de mantenimiento. Es el mismo orden relativo que Proveedores ya tenía entre sus
 * tres sub-vistas (16/09/2026: la deuda va entre el maestro y la cola porque es lo que se mira para
 * decidir un pago); lo único nuevo es Compras al frente.
 */
export const SECCIONES_COMPRAS: readonly SeccionDeCompras[] = [
  { clave: 'compras', titulo: 'Compras', href: '/administracion/compras' },
  { clave: 'proveedores', titulo: 'Proveedores', href: '/administracion/proveedores' },
  { clave: 'deuda', titulo: 'A quién le debo', href: '/administracion/proveedores?vista=deuda' },
  { clave: 'resolver', titulo: 'Nombres sin resolver', href: '/administracion/proveedores?vista=resolver' },
] as const

/**
 * LA FILA DE SECCIONES PARA UNA PANTALLA.
 *
 * `cuentas` — CADA PANTALLA PONE SÓLO LOS NÚMEROS QUE YA LEYÓ. La regla del repo es «donde no se
 * pagó, no se dibuja, y `null` no se dibuja como 0» (`BarraAreas`): contar las 947 filas de Compras
 * desde Proveedores sería un viaje más a PostgREST por cada carga de una pantalla que no los usa —y
 * eso es exactamente lo que `viajes-por-pantalla.test.ts` existe para impedir—. Un número que no se
 * leyó se omite; nunca se inventa.
 *
 * `hrefs` — UNA PANTALLA PUEDE ESTRECHAR EL DESTINO DE SUS PROPIAS SECCIONES. Dentro de Proveedores,
 * moverse entre maestro, deuda y cola conserva el buscador y los recortes puestos (`armarHref`), que
 * la ruta canónica no sabe armar. Lo que NO puede cambiar es el rótulo ni el orden: eso es el
 * contrato y por eso no se pasa por parámetro.
 */
export function seccionesDeCompras(
  activa: SeccionCompras,
  cuentas: Partial<Record<SeccionCompras, number | null>> = {},
  hrefs: Partial<Record<SeccionCompras, string>> = {},
): VistaDeSeccion[] {
  return SECCIONES_COMPRAS.map((s) => ({
    clave: s.clave,
    titulo: s.titulo,
    cuenta: cuentas[s.clave] ?? null,
    activa: s.clave === activa,
    href: hrefs[s.clave] ?? s.href,
  }))
}

/**
 * QUÉ SECCIÓN ABRE UN `?vista=` DE LA PANTALLA DE PROVEEDORES.
 *
 * La pantalla tiene su propio `vista` en la URL y el maestro es lo que contesta cuando no hay
 * ninguno o el valor no se reconoce: cambiar el destino por defecto le movería el piso a quien entra
 * a buscar una ficha.
 */
export function seccionDeProveedores(vista: string | null | undefined): SeccionCompras {
  if (vista === 'deuda') return 'deuda'
  if (vista === 'resolver') return 'resolver'
  return 'proveedores'
}
