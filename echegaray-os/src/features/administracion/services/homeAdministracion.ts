// 00 · LA ENTRADA DE ADMINISTRACIÓN — cuánto hay detrás de cada destino y qué pide trabajo.
//
// ═══ LA BANDA DE CHIPS ES AHORA UN LIBRO MAYOR (00 · Home Navegación v2, zip 25/08/2026) ═══
//
// Los chips contaban: «14 proveedores sin CUIT». Un número y un destino. Lo que no decían es lo
// único que hace que alguien deje lo que está haciendo: QUÉ SE ROMPE si eso queda así. Ahora cada
// señal es una fila con su cifra, qué bloquea, dónde se arregla y el VERBO que lo arregla.
//
// ═══ SIN LECTURA NO HAY CONTADOR — NUNCA UN CERO ═══
//
// `null` es «no se pudo contar». Un «0» ahí afirmaría que no hay ninguno, cuando lo que pasó fue
// que la consulta falló: es una afirmación sobre la empresa hecha con un error de red. Una señal en
// `null` NO desaparece de la lista: se dibuja diciendo que no se pudo leer. Callarla la haría
// idéntica a «no hay nada que resolver», que es el defecto de «un control que no pudo mirar».
//
// ═══ OCHO LECTURAS DONDE HABÍA QUINCE (25/08/2026, medido) ═══
//
// Medido como `authenticated` contra la base real, con EXPLAIN ANALYZE (mejor de 3, caché caliente):
//
//   count(*) comprobante_compra ................   0,6 ms
//   count(*) … where tiene_posible_duplicado ... 250,0 ms   ← el caro es la columna, no el conteo
//   select imputacion, tiene_posible_duplicado, estado_control … 250,8 ms  ← lo MISMO, y da los 4
//
// O sea: los cuatro conteos de Compras cuestan más que traer las tres columnas que los deciden. Lo
// mismo con Proveedores (dos conteos → una lectura de 36 `cuit`). Se cuenta en memoria con
// `cumpleFiltro`, que sale del MISMO predicado que `aplicarFiltro` usa contra la base: no son dos
// definiciones, es una tabla de condiciones con dos consumidores (ver `comprasEstado.ts`).
//
// Y se fueron tres lecturas enteras: `clientes` (el contador de la barra sale de la cartera que la
// página ya trae), `cotizacion_cascada` y `perfiles` (Presupuestos subió a nivel 1 y Usuarios bajó
// al menú de la cuenta: ninguno de los dos está en la barra).

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Rol } from '@/features/auth/types'
import { puedeVerRuta } from '../../auth/types/areas.ts'
import { cumpleFiltro } from './comprasEstado.ts'
import { destinosVisibles, type AreaAdmin } from './areasAdmin.ts'

export type { AreaAdmin } from './areasAdmin.ts'

/** Las siete señales del libro mayor. Son las únicas que hoy tienen una fuente que las mida. */
export interface ConteosAtencion {
  proveedoresSinCuit: number | null
  nombresSinResolver: number | null
  comprasSinImputar: number | null
  comprasSinResolver: number | null
  comprasDuplicadas: number | null
  pendientes: number | null
  correcciones: number | null
}

/** Lo que `getConteosHome` lee. `clientes` NO está: sale de la cartera que la página ya trajo. */
export interface ConteosLeidos extends ConteosAtencion {
  personas: number | null
  proveedores: number | null
  compras: number | null
  tareasTipo: number | null
  documentos: number | null
}

export interface ConteosHome extends ConteosLeidos {
  /** Los clientes activos que la página dibuja abajo. Contarlos aparte sería contarlos dos veces. */
  clientes: number | null
}

/** Una fila del libro mayor: la cifra, qué falta, qué bloquea, y el verbo que lo resuelve. */
export interface SenalTrabajo {
  clave: string
  /** `null` = no se pudo leer. La fila se dibuja igual y lo dice. Nunca 0: eso no se dibuja. */
  numero: number | null
  /** Qué falta, ya en singular o plural según la cifra. */
  texto: string
  /** Qué se rompe si queda así. Es la columna que convierte un número en una decisión. */
  bloquea: string
  /** Dónde se arregla, tal como se llama la pantalla y su filtro. */
  donde: string
  /** El verbo. Un botón que no nombra la acción es un enlace disfrazado. */
  accion: string
  href: string
  /** `neg` sólo para lo que YA está mal; `warn` para el dato que falta. */
  tono: 'warn' | 'neg'
  icono: IconoSenal
}

/** Los cinco iconos que esta pantalla usa, del §11 del Design System. No se dibujan nuevos. */
export type IconoSenal = 'bloqueo' | 'proveedor' | 'compra' | 'obra' | 'tiempo'

/** Una línea accionable, para la campanita del header. Es el libro mayor sin las columnas de texto. */
export interface ChipAtencion {
  clave: string
  numero: number
  texto: string
  href: string
  tono: 'warn' | 'neg'
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// LAS LECTURAS — una sola tanda
// ─────────────────────────────────────────────────────────────────────────────────────────────

const head = { count: 'exact' as const, head: true }

// EL TRUCO DE `Contador` YA NO HACE FALTA. Encadenarle `aplicarFiltro` al tipo que devuelve
// `select(..., { head: true })` hacía explotar al compilador (TS2589) y obligaba a declarar un tipo
// mínimo a mano. Los cuatro conteos de Compras que lo necesitaban se fueron: ahora se cuentan en
// memoria sobre una sola lectura.

/**
 * `null` cuando la lectura falló. Un conteo que no se pudo hacer NO es cero.
 *
 * Se exporta sólo para poder probar eso sin base: es la línea donde un `?? 0` de más convertiría un
 * permiso negado en la afirmación «no hay ninguno».
 */
export async function cuenta(
  consulta: PromiseLike<{ count: number | null; error: unknown }>,
): Promise<number | null> {
  const { count, error } = await consulta
  return error ? null : count ?? null
}

/** Las filas, o `null` si la lectura falló. Una lista vacía por error NO es una lista vacía. */
async function filas<T>(
  consulta: PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[] | null> {
  const { data, error } = await consulta
  return error ? null : data ?? null
}

/** Lo que decide los cuatro números de Compras. Es un subconjunto de `comprobante_compra`. */
type FilaCompra = { imputacion: string | null; tiene_posible_duplicado: boolean | null; estado_control: string | null }

/** Cuenta en memoria con el MISMO predicado que la lista de la pantalla 24. */
const contar = (fs: FilaCompra[] | null, f: 'sin-imputar' | 'sin-resolver' | 'duplicados') =>
  fs === null ? null : fs.filter((x) => cumpleFiltro(x, f)).length

/**
 * LOS ONCE NÚMEROS, EN OCHO LECTURAS Y UNA SOLA TANDA.
 *
 * NO recibe el rol a propósito: pedirle el perfil primero para decidir qué contar convertiría la
 * pantalla en dos viajes encadenados. Lo que el rol no puede ver lo cierra la base, y quien arma la
 * barra descarta esos destinos.
 */
export async function getConteosHome(supabase: SupabaseClient): Promise<ConteosLeidos> {
  const [
    personas, proveedores, nombresSinResolver, compras, pendientes, correcciones, tareasTipo, documentos,
  ] = await Promise.all([
    // EL PLANTEL SALE DE LA PERTENENCIA, NO DE LA FECHA: hay bajas sin `fecha_egreso`.
    cuenta(supabase.from('persona_directorio').select('*', head).eq('en_la_empresa', true)),
    // UNA lectura para dos números: 36 filas de una columna cuestan menos que dos conteos.
    filas<{ cuit: string | null }>(supabase.from('proveedores').select('cuit').eq('activo', true)),
    cuenta(supabase.from('proveedor_nombre_pendiente').select('*', head)),
    // UNA lectura para cuatro números. Las tres columnas son las que deciden los tres filtros.
    filas<FilaCompra>(
      supabase.from('comprobante_compra').select('imputacion, tiene_posible_duplicado, estado_control'),
    ),
    cuenta(supabase.from('imputacion_pendiente').select('*', head)),
    // La bandeja de correcciones puede no existir todavía en una base sin la migración aplicada: eso
    // llega como error y queda en `null`, no en 0.
    cuenta(supabase.from('correccion_asistencia_bandeja').select('*', head).eq('estado', 'pendiente')),
    cuenta(supabase.from('tarea_tipo').select('*', head).eq('activo', true)),
    // ARCHIVOS, no carpetas: la pantalla /documentos cuenta `is_folder=false` y el badge tiene que
    // decir EL MISMO número (QA 24/08: 3599 vs 3128 — los 471 de diferencia eran carpetas).
    cuenta(supabase.from('drive_index').select('*', head).eq('is_folder', false)),
  ])
  return {
    personas,
    proveedores: proveedores?.length ?? null,
    proveedoresSinCuit: proveedores === null ? null : proveedores.filter((p) => !p.cuit).length,
    nombresSinResolver,
    compras: compras?.length ?? null,
    comprasSinImputar: contar(compras, 'sin-imputar'),
    comprasSinResolver: contar(compras, 'sin-resolver'),
    comprasDuplicadas: contar(compras, 'duplicados'),
    pendientes,
    correcciones,
    tareasTipo,
    documentos,
  }
}

/**
 * SÓLO LO QUE ENCIENDE LA CAMPANITA — las siete señales, sin las cinco de navegación.
 *
 * La campanita del header vive en TODAS las pantallas del OS. Colgarla de los once números le
 * sumaría a cada carga cinco lecturas que nadie mira: cuántos clientes hay no cambia si algo pide
 * trabajo. Las que quedan son EXACTAMENTE las del libro mayor, así que la campanita y la entrada de
 * Administración no pueden decir números distintos.
 */
export async function getConteosDeAtencion(supabase: SupabaseClient): Promise<ConteosAtencion> {
  const [proveedores, nombresSinResolver, compras, pendientes, correcciones] = await Promise.all([
    filas<{ cuit: string | null }>(supabase.from('proveedores').select('cuit').eq('activo', true)),
    cuenta(supabase.from('proveedor_nombre_pendiente').select('*', head)),
    filas<FilaCompra>(
      supabase.from('comprobante_compra').select('imputacion, tiene_posible_duplicado, estado_control'),
    ),
    cuenta(supabase.from('imputacion_pendiente').select('*', head)),
    cuenta(supabase.from('correccion_asistencia_bandeja').select('*', head).eq('estado', 'pendiente')),
  ])
  return {
    proveedoresSinCuit: proveedores === null ? null : proveedores.filter((p) => !p.cuit).length,
    nombresSinResolver,
    comprasSinImputar: contar(compras, 'sin-imputar'),
    comprasSinResolver: contar(compras, 'sin-resolver'),
    comprasDuplicadas: contar(compras, 'duplicados'),
    pendientes,
    correcciones,
  }
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// LA BARRA DE DESTINOS — lo puro, para poder probarlo sin base
// ─────────────────────────────────────────────────────────────────────────────────────────────

const CUENTA: Record<string, (c: ConteosHome) => number | null> = {
  // Trabajo no cuenta una tabla: cuenta las señales VIVAS del libro mayor de abajo. Un contador
  // escrito dos veces se contradice el día que uno cambie.
  trabajo: () => null,
  clientes: (c) => c.clientes,
  personas: (c) => c.personas,
  proveedores: (c) => c.proveedores,
  compras: (c) => c.compras,
  'base-maestra': (c) => c.tareasTipo,
  documentos: (c) => c.documentos,
}

/**
 * Los destinos que ESTE rol puede abrir, con lo que hay del otro lado.
 *
 * EL ⚠ SE FUE DE LA BARRA (v2). Lo que decía —«14 sin CUIT · 1 nombre sin resolver»— lo dice ahora
 * el libro mayor de abajo, con qué bloquea y con el verbo al lado, y en las demás pantallas del
 * área lo dice la campanita del header, que lee las MISMAS siete señales. Un triángulo repetido en
 * dos lugares de la misma pantalla no agrega un bit: agrega una segunda cosa que mantener.
 */
export function areasDeAdministracion(
  c: ConteosHome, rol: Rol | null | undefined, senalesVivas?: number | null,
): AreaAdmin[] {
  return destinosVisibles(rol).map((d) => ({
    clave: d.clave,
    titulo: d.titulo,
    href: d.href,
    grupo: d.grupo,
    cuenta: d.clave === 'trabajo' ? senalesVivas ?? null : CUENTA[d.clave](c),
    aviso: null,
  }))
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// EL LIBRO MAYOR — la cifra, qué bloquea, y el verbo
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * LAS SIETE SEÑALES. Cada una tiene una fuente que la mide y una pantalla donde se resuelve.
 *
 * El orden NO es el de las tablas: arriba va lo que ya está MAL —el duplicado, que se paga dos
 * veces si nadie lo compara— y debajo lo que FALTA. Es el único rojo de la pantalla; pintar de rojo
 * los datos que faltan haría que el rojo dejara de significar algo.
 *
 * ═══ LO QUE NO ESTÁ, Y NO ES UN OLVIDO ═══
 *
 * · «1 pendiente vencido»: nada en la base tiene fecha de vencimiento para una tarea administrativa
 *   —`imputacion_pendiente` no la tiene y `documentacion_legajo` sólo guarda `fecha_documento`—.
 * · «personas sin obra asignada»: es un estado NORMAL entre dos obras (19/08). Una señal encendida
 *   para siempre deja de leerse a la semana. Si alguien la agrega, un test se pone rojo.
 *
 * Cada `href` es el FILTRO que produjo el número, no la pantalla en general: «14 proveedores sin
 * CUIT» que aterriza en una lista de 36 obliga a buscar a mano los 14 que el chip acaba de contar.
 * El `?f=` es el MISMO valor que `aplicarFiltro` usa para contarlos.
 */
const SENALES: {
  clave: string
  de: (c: ConteosAtencion) => number | null
  singular: string
  plural: string
  bloquea: string
  donde: string
  accion: string
  href: string
  tono: 'warn' | 'neg'
  icono: IconoSenal
}[] = [
  {
    clave: 'duplicados', de: (c) => c.comprasDuplicadas,
    singular: 'posible duplicado en compras', plural: 'posibles duplicados en compras',
    bloquea: 'Se paga dos veces si nadie lo compara',
    donde: 'Compras · duplicados', accion: 'Comparar',
    href: '/administracion/compras?f=duplicados', tono: 'neg', icono: 'bloqueo',
  },
  {
    clave: 'sin-cuit', de: (c) => c.proveedoresSinCuit,
    singular: 'proveedor sin CUIT', plural: 'proveedores sin CUIT',
    bloquea: 'No cruzan con ARCA ni con el banco',
    donde: 'Proveedores', accion: 'Cargar CUIT',
    href: '/administracion/proveedores?cuit=falta', tono: 'warn', icono: 'proveedor',
  },
  {
    clave: 'nombres', de: (c) => c.nombresSinResolver,
    singular: 'nombre de proveedor sin resolver', plural: 'nombres de proveedor sin resolver',
    bloquea: 'El gasto queda fuera de la cuenta del proveedor',
    donde: 'Proveedores · resolver', accion: 'Resolver',
    href: '/administracion/proveedores?vista=resolver', tono: 'warn', icono: 'proveedor',
  },
  {
    clave: 'compras-sin-imputar', de: (c) => c.comprasSinImputar,
    singular: 'compra sin obra', plural: 'compras sin obra',
    bloquea: 'El costo no impacta en ninguna obra',
    donde: 'Compras · sin imputar', accion: 'Imputar',
    href: '/administracion/compras?f=sin-imputar', tono: 'warn', icono: 'compra',
  },
  {
    clave: 'compras-sin-resolver', de: (c) => c.comprasSinResolver,
    singular: 'compra con obra sin resolver', plural: 'compras con obra sin resolver',
    bloquea: 'El texto de obra no coincide con ninguna',
    donde: 'Compras · sin resolver', accion: 'Resolver',
    href: '/administracion/compras?f=sin-resolver', tono: 'warn', icono: 'compra',
  },
  {
    clave: 'imputacion', de: (c) => c.pendientes,
    singular: 'texto de obra sin imputar', plural: 'textos de obra sin imputar',
    bloquea: 'Frena el cierre del mes',
    donde: 'Pendientes', accion: 'Resolver',
    href: '/administracion/pendientes', tono: 'warn', icono: 'obra',
  },
  {
    clave: 'correcciones', de: (c) => c.correcciones,
    singular: 'corrección de asistencia sin resolver', plural: 'correcciones de asistencia sin resolver',
    bloquea: 'Las HH del legajo quedan mal',
    donde: 'Asistencia', accion: 'Revisar',
    href: '/administracion/asistencia', tono: 'warn', icono: 'tiempo',
  },
]

/**
 * EL LIBRO MAYOR DE HOY: lo que reclama trabajo, más lo que no se pudo mirar.
 *
 * Tres estados y sólo dos se dibujan:
 *   n > 0    → la fila con su cifra y su verbo.
 *   n = 0    → NO se dibuja. Un cero no es una alerta, es ruido.
 *   n = null → SE DIBUJA, sin cifra, diciendo que no se pudo leer. Ésta es la diferencia con los
 *              chips viejos, que la descartaban igual que al cero: «no pude contar los duplicados»
 *              y «no hay duplicados» se veían idénticos, y el segundo es una afirmación que esta
 *              pantalla no puede hacer si no pudo mirar.
 */
export function senalesDeTrabajo(c: ConteosAtencion, rol: Rol | null | undefined): SenalTrabajo[] {
  return SENALES
    .filter((s) => puedeVerRuta(rol, s.href.split('?')[0]))
    .map((s) => ({ s, n: s.de(c) }))
    .filter(({ n }) => n === null || n > 0)
    .map(({ s, n }) => ({
      clave: s.clave,
      numero: n,
      texto: n === 1 ? s.singular : s.plural,
      bloquea: n === null ? 'No pude leerlo: esta fila no dice que no haya nada' : s.bloquea,
      donde: s.donde,
      accion: s.accion,
      href: s.href,
      tono: s.tono,
      icono: s.icono,
    }))
}

/**
 * EL RESUMEN DE LA CABECERA. Cuenta lo que hay, y dice aparte lo que no se pudo contar.
 *
 * Nunca escribe «0 urgentes»: un cero no es una noticia. Y si alguna señal no se pudo leer, el
 * total de registros va con «al menos», porque los que faltan podrían ser muchos o ninguno.
 */
export function resumenDeTrabajo(senales: SenalTrabajo[]): string {
  const medidas = senales.filter((s) => s.numero !== null)
  const sinLeer = senales.length - medidas.length
  const registros = medidas.reduce((a, s) => a + (s.numero ?? 0), 0)
  const urgentes = medidas.filter((s) => s.tono === 'neg').length
  const partes = [
    `${senales.length} ${senales.length === 1 ? 'señal' : 'señales'}`,
    `${sinLeer ? 'al menos ' : ''}${registros} ${registros === 1 ? 'registro' : 'registros'}`,
  ]
  if (urgentes) partes.push(`${urgentes} urgente${urgentes === 1 ? '' : 's'}`)
  if (sinLeer) partes.push(`${sinLeer} sin leer`)
  return partes.join(' · ')
}


/** Lo accionable de HOY para la campanita. Es el libro mayor sin lo que no se pudo leer. */
export function chipsDeAtencion(c: ConteosAtencion, rol: Rol | null | undefined): ChipAtencion[] {
  return senalesDeTrabajo(c, rol)
    .filter((s): s is SenalTrabajo & { numero: number } => s.numero !== null)
    .map((s) => ({ clave: s.clave, numero: s.numero, texto: s.texto, href: s.href, tono: s.tono }))
}

/**
 * ¿NI UNA de las fuentes de atención se pudo leer?
 *
 * Sin esto, una base caída y un área sin pendientes se dibujan igual. Y «no hay nada que resolver»
 * es una afirmación que esta pantalla no puede hacer si no pudo mirar.
 */
export function atencionNoLeida(c: ConteosAtencion): boolean {
  return SENALES.every((s) => s.de(c) === null)
}

/** Cuántas señales están vivas HOY. Es el contador de «Trabajo» en la barra. */
export function senalesVivas(c: ConteosAtencion, rol: Rol | null | undefined): number | null {
  return atencionNoLeida(c) ? null : senalesDeTrabajo(c, rol).length
}
