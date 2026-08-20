// LA ENTRADA DEL ÁREA — los maestros con su contador, y lo que quedó sin resolver.
//
// ═══ DOS COLUMNAS, NO UN MENÚ DE TARJETAS ═══
//
// El handoff (`design/screens/administracion.md` §2a): *"No es un menú de tarjetas ni repite la
// barra"*. A la izquierda los MAESTROS —a dónde se va—, a la derecha lo ACCIONABLE —qué hay que
// hacer—. Son dos preguntas distintas y mezclarlas en cinco tarjetas iguales obliga a leer las cinco
// para descubrir que sólo una pide trabajo.
//
// ═══ UN CONTADOR ES DE NAVEGACIÓN; UNA SEÑAL ES DE TRABAJO ═══
//
// El contador dice cuánto hay del otro lado, para que nadie entre a una lista vacía sin saberlo. La
// SEÑAL dice qué falta resolver, y sólo se pinta en ámbar cuando de verdad hay algo que resolver:
// una señal siempre encendida deja de leerse a la semana.
//
// Y SIN LECTURA NO HAY CONTADOR — NUNCA UN CERO. Si la consulta falla, el número no aparece. Un «0»
// ahí diría «no hay ninguno», que es una afirmación sobre la empresa hecha con un error de red.

import type { SupabaseClient } from '@supabase/supabase-js'

export interface Maestro {
  clave: string
  titulo: string
  detalle: string
  href: string
  /** `null` = no se pudo contar. Nunca 0 por defecto. */
  cuenta: number | null
  senal: string | null
  /** Ámbar SÓLO si hay algo que resolver. */
  resolver: boolean
}

export interface Atencion {
  clave: string
  texto: string
  donde: string
  numero: number
  href: string
  /** Rojo SÓLO si es crítico. Hoy nada lo es: son datos que faltan, no impedimentos. */
  critico: boolean
}

export interface Movimiento {
  texto: string
  cuando: string
}

export interface Conteos {
  clientes: number | null
  personas: number | null
  personasSinAsignar: number | null
  proveedores: number | null
  proveedoresSinCuit: number | null
  nombresSinResolver: number | null
  textosSinImputar: number | null
  invitacionesSinUsar: number | null
}

/** `count` de una consulta ya armada, sin traer filas. `null` cuando la lectura falló. */
async function cuenta(
  consulta: PromiseLike<{ count: number | null; error: unknown }>,
): Promise<number | null> {
  const { count, error } = await consulta
  return error ? null : count ?? null
}

const head = { count: 'exact' as const, head: true }

export async function getConteos(supabase: SupabaseClient): Promise<Conteos> {
  const [
    clientes, personas, personasSinAsignar, proveedores, proveedoresSinCuit,
    nombresSinResolver, textosSinImputar,
  ] = await Promise.all([
    cuenta(supabase.from('clientes').select('*', head)),
    // EL PLANTEL SALE DE LA PERTENENCIA, NO DE LA FECHA: hay bajas sin `fecha_egreso`, y contar por
    // la fecha devolvería al plantel a gente que ya no está.
    cuenta(supabase.from('persona_directorio').select('*', head).eq('en_la_empresa', true)),
    cuenta(supabase.from('persona_directorio').select('*', head)
      .eq('en_la_empresa', true).is('obra_actual_id', null)),
    cuenta(supabase.from('proveedores').select('*', head).eq('activo', true)),
    cuenta(supabase.from('proveedores').select('*', head).eq('activo', true).is('cuit', null)),
    cuenta(supabase.from('proveedor_nombre_pendiente').select('*', head)),
    cuenta(supabase.from('imputacion_pendiente').select('*', head)),
  ])
  // Las invitaciones sin usar viven en `auth.users` y sólo se leen con la clave de servicio, que
  // esta pantalla no tiene. No se inventa el número: la fila de Usuarios va sin señal.
  return {
    clientes, personas, personasSinAsignar, proveedores, proveedoresSinCuit,
    nombresSinResolver, textosSinImputar, invitacionesSinUsar: null,
  }
}

/** Un número que sólo se dice cuando es mayor que cero: «0 sin resolver» no es una señal, es ruido. */
export function senal(n: number | null, singular: string, plural: string): string | null {
  if (n === null || n <= 0) return null
  return `${n} ${n === 1 ? singular : plural}`
}

/** Los cinco maestros del área, en el orden de la barra de nivel 2. */
export function maestrosDe(c: Conteos): Maestro[] {
  const sinAsignar = senal(c.personasSinAsignar, 'sin asignar', 'sin asignar')
  const sinCuit = senal(c.proveedoresSinCuit, 'sin CUIT', 'sin CUIT')
  const sinResolver = senal(c.nombresSinResolver, 'sin resolver', 'sin resolver')
  return [
    {
      clave: 'clientes', titulo: 'Clientes', href: '/clientes',
      detalle: 'Ficha, contactos, actividad, documentos y sus obras',
      cuenta: c.clientes, senal: null, resolver: false,
    },
    {
      clave: 'usuarios', titulo: 'Usuarios', href: '/administracion/usuarios',
      detalle: 'Quién entra, con qué nivel y a qué obras',
      cuenta: null, senal: senal(c.invitacionesSinUsar, 'invitación sin usar', 'invitaciones sin usar'),
      resolver: false,
    },
    {
      clave: 'personas', titulo: 'Personas', href: '/administracion/personas',
      detalle: 'El plantel: categoría, cuadrilla y obra actual',
      cuenta: c.personas, senal: sinAsignar,
      // Estar sin asignar NO es un problema a resolver: es un estado normal entre dos obras. Se
      // dice, en gris, y no enciende el ámbar.
      resolver: false,
    },
    {
      clave: 'proveedores', titulo: 'Proveedores', href: '/administracion/proveedores',
      detalle: 'Identidad única por CUIT',
      cuenta: c.proveedores, senal: sinCuit, resolver: sinCuit !== null,
    },
    {
      clave: 'pendientes', titulo: 'Pendientes de imputación', href: '/administracion/pendientes',
      detalle: 'Textos de obra sin dueño en compras, herramientas y movimientos',
      cuenta: c.textosSinImputar,
      senal: senal(c.textosSinImputar, 'sin resolver', 'sin resolver') ?? sinResolver,
      resolver: (c.textosSinImputar ?? 0) > 0,
    },
  ]
}

/**
 * Lo accionable, con su número. Cada línea lleva a donde se resuelve.
 *
 * NO ESTÁ LA DOCUMENTACIÓN VENCIDA que dibuja el mockup, y no por olvido: `documentacion_legajo` no
 * tiene fecha de vencimiento —sólo `fecha_documento`—, así que hoy nadie puede decir qué venció.
 * Inventar la línea con el dato que hay sería publicar una alerta que no mide nada. Lo que sí se
 * puede medir es qué papel FALTA, y eso ya lo dice el legajo de cada persona.
 */
export function atencionesDe(c: Conteos): Atencion[] {
  const filas: (Atencion | null)[] = [
    c.nombresSinResolver && c.nombresSinResolver > 0
      ? {
          clave: 'nombres', texto: 'Nombres de proveedor sin resolver',
          donde: 'Proveedores · llegan de Compras', numero: c.nombresSinResolver,
          href: '/administracion/proveedores?vista=resolver', critico: false,
        }
      : null,
    c.textosSinImputar && c.textosSinImputar > 0
      ? {
          clave: 'imputacion', texto: 'Textos de obra sin imputar',
          donde: 'Compras, herramientas y movimientos', numero: c.textosSinImputar,
          href: '/administracion/pendientes', critico: false,
        }
      : null,
    c.proveedoresSinCuit && c.proveedoresSinCuit > 0
      ? {
          clave: 'sin-cuit', texto: 'Proveedores sin CUIT',
          donde: 'No cruzan con ARCA ni con el banco', numero: c.proveedoresSinCuit,
          href: '/administracion/proveedores', critico: false,
        }
      : null,
  ]
  return filas.filter((f): f is Atencion => f !== null)
}

// ═══ EL BUSCADOR GLOBAL ═══
//
// «Buscar cliente, persona o proveedor» del handoff. Es UNA caja para las tres entidades porque
// quien la usa no está pensando en tablas: tiene un nombre en la mano —de un papel, de un WhatsApp,
// de una factura— y quiere llegar a su ficha. Obligarlo a elegir primero la sección es pedirle que
// clasifique antes de buscar.
//
// Cada resultado lleva a su ficha, y se dice de qué maestro salió: dos personas y un proveedor
// pueden llamarse parecido, y sin el rótulo la lista sería adivinanza.

export interface Hallazgo {
  clave: string
  nombre: string
  detalle: string | null
  maestro: 'Cliente' | 'Persona' | 'Proveedor'
  href: string
}

/** Un término seguro para el `or` de PostgREST: la coma separa condiciones y partiría el filtro. */
export function terminoSeguro(q: string | undefined): string {
  return (q ?? '').replace(/[,()*]/g, ' ').trim()
}

export async function buscarGlobal(
  supabase: SupabaseClient,
  q: string | undefined,
  tope = 6,
): Promise<Hallazgo[]> {
  const t = terminoSeguro(q)
  if (t.length < 2) return []

  const [clientes, personas, proveedores] = await Promise.all([
    supabase.from('clientes').select('slug, nombre_comercial, razon_social')
      .or(`nombre_comercial.ilike.%${t}%,razon_social.ilike.%${t}%`).limit(tope),
    supabase.from('persona_directorio').select('id, nombre_completo, especialidad, en_la_empresa')
      .ilike('nombre_completo', `%${t}%`).limit(tope),
    supabase.from('proveedores').select('id, nombre, razon_social')
      .or(`nombre.ilike.%${t}%,razon_social.ilike.%${t}%`).limit(tope),
  ])

  type C = { slug: string; nombre_comercial: string; razon_social: string | null }
  type P = { id: string; nombre_completo: string; especialidad: string | null; en_la_empresa: boolean }
  type V = { id: string; nombre: string; razon_social: string | null }

  return [
    ...((clientes.data ?? []) as C[]).map((c) => ({
      clave: `cliente-${c.slug}`, nombre: c.nombre_comercial, detalle: c.razon_social,
      maestro: 'Cliente' as const, href: `/clientes/${c.slug}`,
    })),
    ...((personas.data ?? []) as P[]).map((p) => ({
      clave: `persona-${p.id}`, nombre: p.nombre_completo,
      // Que alguien ya no esté en el plantel es lo primero que hay que saber al encontrarlo.
      detalle: p.en_la_empresa ? p.especialidad : 'ya no está en el plantel',
      maestro: 'Persona' as const, href: `/administracion/personas/${p.id}`,
    })),
    ...((proveedores.data ?? []) as V[]).map((v) => ({
      clave: `proveedor-${v.id}`, nombre: v.nombre, detalle: v.razon_social,
      maestro: 'Proveedor' as const, href: `/administracion/proveedores?p=${v.id}`,
    })),
  ]
}

// ═══ EL ÚLTIMO MOVIMIENTO ═══
//
// Se DERIVA de las marcas de tiempo que ya existen; no hay —ni se inventa— una bitácora del área.
// Sólo entran las tres fuentes que tienen una: el alta de un proveedor, el alta de un cliente y la
// resolución de un nombre de Compras. `obra_alias`, que es donde se escribe una imputación
// resuelta, NO tiene columna de fecha: por eso una imputación resuelta no puede aparecer acá, y
// decirlo es más honesto que ordenar por otra cosa y llamarlo «último».

const FUENTES_MOVIMIENTO = [
  { relacion: 'proveedores', columnas: 'nombre, created_at', fecha: 'created_at', verbo: 'Alta de' },
  { relacion: 'clientes', columnas: 'nombre_comercial, created_at', fecha: 'created_at', verbo: 'Alta de' },
  { relacion: 'proveedor_alias', columnas: 'nombre_origen, creado_en', fecha: 'creado_en', verbo: 'Nombre resuelto:' },
] as const

export async function getUltimoMovimiento(supabase: SupabaseClient): Promise<Movimiento | null> {
  const lecturas = await Promise.all(
    FUENTES_MOVIMIENTO.map(async (f) => {
      const { data } = await supabase.from(f.relacion).select(f.columnas)
        .order(f.fecha, { ascending: false, nullsFirst: false }).limit(1).maybeSingle()
      if (!data) return null
      const fila = data as unknown as Record<string, string | null>
      const cuando = fila[f.fecha]
      const nombre = fila.nombre ?? fila.nombre_comercial ?? fila.nombre_origen
      if (!cuando || !nombre) return null
      return { texto: `${f.verbo} ${nombre}`, cuando }
    }),
  )
  const vivas = lecturas.filter((l): l is Movimiento => l !== null)
  if (vivas.length === 0) return null
  return vivas.sort((a, b) => (a.cuando < b.cuando ? 1 : -1))[0]
}

// ═══ CUÁNDO PASÓ, EN LA HORA DE LA EMPRESA ═══
//
// «hoy 09:12» sólo significa algo si «hoy» es el día de San Juan. El servidor de Vercel corre en
// UTC, tres horas adelante: un alta de las 21:30 de un martes cae el miércoles a las 00:30 UTC, y
// calculado con el reloj del proceso se anunciaría como «hoy» a alguien que todavía está en martes
// —o como «ayer» a la mañana siguiente—. La zona se fija a la de la empresa y no al proceso.
const ZONA = 'America/Argentina/Buenos_Aires'

const enZona = (d: Date) =>
  new Intl.DateTimeFormat('es-AR', {
    timeZone: ZONA, day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d).reduce<Record<string, string>>((a, p) => ({ ...a, [p.type]: p.value }), {})

export function cuandoCorto(iso: string, ahora: Date = new Date()): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'sin fecha'
  const e = enZona(d)
  const hoy = enZona(ahora)
  const ayer = enZona(new Date(ahora.getTime() - 86_400_000))
  const dia = `${e.day}/${e.month}/${e.year}`
  const hora = `${e.hour}:${e.minute}`
  if (dia === `${hoy.day}/${hoy.month}/${hoy.year}`) return `hoy ${hora}`
  if (dia === `${ayer.day}/${ayer.month}/${ayer.year}`) return `ayer ${hora}`
  return `${e.day}/${e.month} ${hora}`
}
