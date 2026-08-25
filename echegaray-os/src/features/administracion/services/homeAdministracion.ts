// 00 · LA ENTRADA DE ADMINISTRACIÓN — cuánto hay detrás de cada área y qué pide trabajo.
//
// ═══ EL CONTADOR VIVE EN LA BARRA, NO EN UNA LISTA APARTE (Design 23/08/2026) ═══
//
// Hasta hoy la pantalla dibujaba DOS veces las mismas secciones: la barra de nivel 2 arriba y, abajo,
// una lista de «maestros» con el mismo nombre, el mismo destino y una frase explicando cada uno. El
// contador y el aviso se mudan a la barra —que es el único lugar donde el nombre de la sección ya
// estaba— y la mitad de abajo queda libre para la entidad activa. Menos palabras, un solo destino
// por área.
//
// ═══ SIN LECTURA NO HAY CONTADOR — NUNCA UN CERO ═══
//
// `null` es «no se pudo contar» y no se dibuja. Un «0» ahí afirmaría que no hay ninguno, cuando lo
// que pasó fue que la consulta falló: es una afirmación sobre la empresa hecha con un error de red.
// Es el mismo criterio que ya aplicaba `entradaService`, y por eso `senal` se importa de ahí en vez
// de reescribirse: el día que cambie cómo se dice «14 sin CUIT», cambia en un solo lugar.
//
// ═══ Y UN AVISO APAGADO NO SIGNIFICA «ESTÁ TODO BIEN» ═══
//
// Los chips sólo aparecen cuando el número es mayor que cero. Si TODAS las lecturas de atención
// fallan, la barra queda vacía y se vería idéntica a un área sin pendientes — el defecto de «un
// control que no pudo mirar no dice que no está». Por eso `atencionNoLeida` viaja aparte: la
// pantalla lo dice en vez de callarse.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Rol } from '@/features/auth/types'
import { puedeVerRuta } from '../../auth/types/areas.ts'
import { senal } from './entradaService.ts'
import { aplicarFiltro, type Filtrable } from './comprasEstado.ts'

export interface ConteosHome {
  clientes: number | null
  presupuestos: number | null
  usuarios: number | null
  personas: number | null
  proveedores: number | null
  compras: number | null
  pendientes: number | null
  correcciones: number | null
  tareasTipo: number | null
  documentos: number | null
  // Lo que enciende el ámbar. Cada uno tiene una pantalla donde se resuelve.
  proveedoresSinCuit: number | null
  nombresSinResolver: number | null
  comprasSinImputar: number | null
  comprasSinResolver: number | null
  comprasDuplicadas: number | null
}

/** Un área de la barra de nivel 2, con lo que hay del otro lado y lo que reclama trabajo. */
export interface AreaAdmin {
  clave: string
  titulo: string
  href: string
  /** `null` = no se pudo contar. Nunca 0 por defecto. */
  cuenta: number | null
  /** El texto del ⚠. `null` = nada que resolver: un aviso siempre encendido deja de leerse. */
  aviso: string | null
}

/** Una línea accionable: el número, qué es, y dónde se arregla. */
export interface ChipAtencion {
  clave: string
  numero: number
  texto: string
  href: string
  /** `neg` sólo para lo que YA está mal; `warn` para el dato que falta. */
  tono: 'warn' | 'neg'
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// LAS LECTURAS — una sola tanda, todas `head: true`
// ─────────────────────────────────────────────────────────────────────────────────────────────

const head = { count: 'exact' as const, head: true }

/**
 * UN CONTADOR DE POSTGREST, VISTO POR SU MÍNIMO — el mismo truco que `comprasService`.
 *
 * Encadenarle el filtro genérico al tipo que devuelve `select(..., { head: true })` hace explotar al
 * compilador (TS2589). Acá se lo mira sólo por lo que este módulo usa.
 */
type Contador = Filtrable<Contador> & PromiseLike<{ count: number | null; error: { message: string } | null }>

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

/**
 * Los quince conteos, en UNA tanda. Ninguno trae filas.
 *
 * NO recibe el rol a propósito: pedirle el perfil primero para decidir qué contar convertiría la
 * pantalla en dos viajes encadenados. Las dos lecturas que el jefe de obra no puede ver —presupuestos
 * y documentos— las cierra la base (`ve_economia()`), y quien arma la barra descarta esas áreas.
 *
 * LOS PREDICADOS DE COMPRAS SALEN DE `aplicarFiltro`, que es el mismo que usa la pantalla 24: si se
 * escribieran acá otra vez, el chip diría «7 sin imputar» y la lista de allá mostraría nueve.
 */
export async function getConteosHome(supabase: SupabaseClient): Promise<ConteosHome> {
  const comprobantes = () => supabase.from('comprobante_compra').select('id', head) as unknown as Contador
  const [
    clientes, presupuestos, usuarios, personas, proveedores, proveedoresSinCuit,
    nombresSinResolver, compras, comprasSinImputar, comprasSinResolver, comprasDuplicadas,
    pendientes, correcciones, tareasTipo, documentos,
  ] = await Promise.all([
    // ACTIVOS, no todos: archivar tiene efecto y la lista de abajo tampoco los muestra. Un contador
    // que incluyera los archivados diría 7 al lado de una lista de 5.
    cuenta(supabase.from('clientes').select('*', head).eq('activo', true)),
    // `vigente`: las versiones anteriores existen y se abren desde adentro. Contarlas sumaría cuatro
    // veces el mismo presupuesto — el mismo predicado que `getCartera`.
    cuenta(supabase.from('cotizacion_cascada').select('*', head).eq('vigente', true)),
    cuenta(supabase.from('perfiles').select('*', head)),
    // EL PLANTEL SALE DE LA PERTENENCIA, NO DE LA FECHA: hay bajas sin `fecha_egreso`.
    cuenta(supabase.from('persona_directorio').select('*', head).eq('en_la_empresa', true)),
    cuenta(supabase.from('proveedores').select('*', head).eq('activo', true)),
    cuenta(supabase.from('proveedores').select('*', head).eq('activo', true).is('cuit', null)),
    cuenta(supabase.from('proveedor_nombre_pendiente').select('*', head)),
    cuenta(comprobantes()),
    cuenta(aplicarFiltro(comprobantes(), 'sin-imputar')),
    cuenta(aplicarFiltro(comprobantes(), 'sin-resolver')),
    cuenta(aplicarFiltro(comprobantes(), 'duplicados')),
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
    clientes, presupuestos, usuarios, personas, proveedores, compras, pendientes, correcciones,
    tareasTipo, documentos, proveedoresSinCuit, nombresSinResolver, comprasSinImputar,
    comprasSinResolver, comprasDuplicadas,
  }
}

/**
 * SÓLO LO QUE ENCIENDE LA CAMPANITA — las siete lecturas que alimentan los chips, sin las ocho de
 * navegación.
 *
 * ═══ POR QUÉ NO SE REUSA `getConteosHome` ═══
 *
 * La campanita del header (`00 · Home Navegación.dc.html`) vive en TODAS las pantallas del OS.
 * Colgarla de los quince conteos le sumaría a cada carga ocho consultas que nadie mira: cuántos
 * clientes hay no cambia si algo pide trabajo. Las siete que quedan son EXACTAMENTE las que
 * `CHIPS` consulta, así que la campanita y la banda de atención de `/administracion` no pueden
 * decir números distintos — que es lo único que había que preservar.
 *
 * Los ocho contadores de navegación vuelven en `null`, que ya significa «no se leyó». Nadie los
 * pide desde acá; si alguien lo hiciera, no vería un cero inventado.
 */
export async function getConteosDeAtencion(supabase: SupabaseClient): Promise<ConteosHome> {
  const comprobantes = () => supabase.from('comprobante_compra').select('id', head) as unknown as Contador
  const [
    proveedoresSinCuit, nombresSinResolver, comprasSinImputar, comprasSinResolver,
    comprasDuplicadas, pendientes, correcciones,
  ] = await Promise.all([
    cuenta(supabase.from('proveedores').select('*', head).eq('activo', true).is('cuit', null)),
    cuenta(supabase.from('proveedor_nombre_pendiente').select('*', head)),
    cuenta(aplicarFiltro(comprobantes(), 'sin-imputar')),
    cuenta(aplicarFiltro(comprobantes(), 'sin-resolver')),
    cuenta(aplicarFiltro(comprobantes(), 'duplicados')),
    cuenta(supabase.from('imputacion_pendiente').select('*', head)),
    cuenta(supabase.from('correccion_asistencia_bandeja').select('*', head).eq('estado', 'pendiente')),
  ])
  return {
    clientes: null, presupuestos: null, usuarios: null, personas: null, proveedores: null,
    compras: null, tareasTipo: null, documentos: null,
    proveedoresSinCuit, nombresSinResolver, comprasSinImputar, comprasSinResolver,
    comprasDuplicadas, pendientes, correcciones,
  }
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// LA BARRA DE ÁREAS — lo puro, para poder probarlo sin base
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * LAS DIEZ ÁREAS, EN EL ORDEN DE LA BARRA.
 *
 * Es la misma lista que declara `NavAdministracionTabs` para el resto del área. No se importa de allá
 * porque ese archivo es `'use client'` y arrastra `usePathname`, que `node --test` no puede resolver.
 * Que sean dos listas es exactamente cómo se desincronizan —`nav-secciones.test.ts` ya había quedado
 * con seis mientras la barra tenía diez—, así que `homeAdministracion.test.ts` LEE el código de la
 * barra y compara los destinos: agregar una sección de un solo lado pone el test en rojo.
 */
const AREAS: { clave: string; titulo: string; href: string }[] = [
  { clave: 'clientes', titulo: 'Clientes', href: '/clientes' },
  { clave: 'presupuestos', titulo: 'Presupuestos', href: '/presupuestos' },
  { clave: 'usuarios', titulo: 'Usuarios', href: '/administracion/usuarios' },
  { clave: 'personas', titulo: 'Personas', href: '/administracion/personas' },
  { clave: 'proveedores', titulo: 'Proveedores', href: '/administracion/proveedores' },
  { clave: 'compras', titulo: 'Compras', href: '/administracion/compras' },
  { clave: 'pendientes', titulo: 'Pendientes', href: '/administracion/pendientes' },
  { clave: 'asistencia', titulo: 'Asistencia', href: '/administracion/asistencia' },
  { clave: 'base-maestra', titulo: 'Base maestra', href: '/administracion/base-maestra' },
  { clave: 'documentos', titulo: 'Documentos', href: '/documentos' },
]

/** Junta las señales de un área en una sola frase. Vacío = nada que resolver, y el ⚠ no se dibuja. */
function aviso(...partes: (string | null)[]): string | null {
  const vivas = partes.filter((p): p is string => p !== null)
  return vivas.length ? vivas.join(' · ') : null
}

const CUENTA: Record<string, (c: ConteosHome) => number | null> = {
  clientes: (c) => c.clientes,
  presupuestos: (c) => c.presupuestos,
  usuarios: (c) => c.usuarios,
  personas: (c) => c.personas,
  proveedores: (c) => c.proveedores,
  compras: (c) => c.compras,
  pendientes: (c) => c.pendientes,
  asistencia: (c) => c.correcciones,
  'base-maestra': (c) => c.tareasTipo,
  documentos: (c) => c.documentos,
}

/**
 * EL ⚠ DE CADA ÁREA. Sólo las que hoy tienen una fuente que mida un pendiente real.
 *
 * PERSONAS NO LLEVA AVISO, y no es un olvido: «sin obra asignada» es un estado NORMAL entre dos obras
 * —lo dice `entradaService` desde el 19/08— y encender el ámbar por eso lo dejaría prendido para
 * siempre. El mockup lo pinta; la regla del negocio gana.
 */
const AVISO: Record<string, (c: ConteosHome) => string | null> = {
  proveedores: (c) => aviso(
    senal(c.proveedoresSinCuit, 'sin CUIT', 'sin CUIT'),
    senal(c.nombresSinResolver, 'nombre sin resolver', 'nombres sin resolver'),
  ),
  compras: (c) => aviso(
    senal(c.comprasSinImputar, 'sin imputar', 'sin imputar'),
    senal(c.comprasSinResolver, 'con obra sin resolver', 'con obra sin resolver'),
    senal(c.comprasDuplicadas, 'posible duplicado', 'posibles duplicados'),
  ),
  pendientes: (c) => senal(c.pendientes, 'sin resolver', 'sin resolver'),
  asistencia: (c) => senal(c.correcciones, 'corrección sin resolver', 'correcciones sin resolver'),
}

/**
 * Las áreas que ESTE rol puede abrir, con su contador y su aviso.
 *
 * El filtro es `puedeVerRuta`, el mismo portero que la barra y que el middleware: un área que se
 * dibuja y termina en un redirect mudo es un botón que lleva a nada (QA del 21/08).
 */
export function areasDeAdministracion(c: ConteosHome, rol: Rol | null | undefined): AreaAdmin[] {
  return AREAS
    .filter((a) => puedeVerRuta(rol, a.href))
    .map((a) => ({
      clave: a.clave,
      titulo: a.titulo,
      href: a.href,
      cuenta: CUENTA[a.clave](c),
      aviso: AVISO[a.clave]?.(c) ?? null,
    }))
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// LA BARRA DE ATENCIÓN — el número, y dónde se arregla
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * CADA CHIP LLEVA AL FILTRO QUE LO PRODUJO, no a la pantalla en general.
 *
 * «14 proveedores sin CUIT» que aterriza en una lista de 36 proveedores obliga a buscar a mano los 14
 * que el chip acaba de contar. El `?f=` de compras es el MISMO valor que `aplicarFiltro` usa para
 * contarlos, así que el número de arriba y las filas de abajo no pueden discrepar.
 *
 * NO ESTÁ «1 pendiente vencido» que dibuja el mockup: nada en la base tiene fecha de vencimiento para
 * una tarea administrativa —`imputacion_pendiente` no la tiene y `documentacion_legajo` sólo guarda
 * `fecha_documento`—. Inventar el chip sería publicar una alerta que no mide nada.
 */
const CHIPS: {
  clave: string
  de: (c: ConteosHome) => number | null
  singular: string
  plural: string
  href: string
  tono: 'warn' | 'neg'
}[] = [
  {
    clave: 'sin-cuit', de: (c) => c.proveedoresSinCuit,
    singular: 'proveedor sin CUIT', plural: 'proveedores sin CUIT',
    href: '/administracion/proveedores', tono: 'warn',
  },
  {
    clave: 'nombres', de: (c) => c.nombresSinResolver,
    singular: 'nombre de proveedor sin resolver', plural: 'nombres de proveedor sin resolver',
    href: '/administracion/proveedores?vista=resolver', tono: 'warn',
  },
  {
    clave: 'compras-sin-imputar', de: (c) => c.comprasSinImputar,
    singular: 'compra sin obra', plural: 'compras sin obra',
    href: '/administracion/compras?f=sin-imputar', tono: 'warn',
  },
  {
    clave: 'compras-sin-resolver', de: (c) => c.comprasSinResolver,
    singular: 'compra con obra sin resolver', plural: 'compras con obra sin resolver',
    href: '/administracion/compras?f=sin-resolver', tono: 'warn',
  },
  {
    // EL ÚNICO ROJO. Un comprobante duplicado que nadie mira se paga dos veces; los demás son datos
    // que faltan, y pintarlos de rojo haría que el rojo dejara de significar algo.
    clave: 'duplicados', de: (c) => c.comprasDuplicadas,
    singular: 'posible duplicado', plural: 'posibles duplicados',
    href: '/administracion/compras?f=duplicados', tono: 'neg',
  },
  {
    clave: 'imputacion', de: (c) => c.pendientes,
    singular: 'texto de obra sin imputar', plural: 'textos de obra sin imputar',
    href: '/administracion/pendientes', tono: 'warn',
  },
  {
    clave: 'correcciones', de: (c) => c.correcciones,
    singular: 'corrección de asistencia sin resolver', plural: 'correcciones de asistencia sin resolver',
    href: '/administracion/asistencia', tono: 'warn',
  },
]

/** Lo accionable de HOY. Sin filas fabricadas: un cero no es una alerta, es ruido. */
export function chipsDeAtencion(c: ConteosHome, rol: Rol | null | undefined): ChipAtencion[] {
  return CHIPS
    .filter((x) => puedeVerRuta(rol, x.href.split('?')[0]))
    .map((x) => ({ chip: x, n: x.de(c) }))
    .filter((x): x is { chip: (typeof CHIPS)[number]; n: number } => x.n !== null && x.n > 0)
    .map(({ chip, n }) => ({
      clave: chip.clave,
      numero: n,
      texto: n === 1 ? chip.singular : chip.plural,
      href: chip.href,
      tono: chip.tono,
    }))
}

/**
 * ¿NI UNA de las fuentes de atención se pudo leer?
 *
 * Sin esto, una base caída y un área sin pendientes se dibujan igual: la barra vacía. Y «no hay nada
 * que resolver» es una afirmación que esta pantalla no puede hacer si no pudo mirar.
 */
export function atencionNoLeida(c: ConteosHome): boolean {
  return CHIPS.every((x) => x.de(c) === null)
}
