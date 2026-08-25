// LA CARTERA DE LA ENTRADA — el cliente, y sus obras en ejecución COLGANDO de él.
//
// ═══ POR QUÉ NO ES LA MISMA TABLA QUE `/clientes` (00 · Home Navegación v2) ═══
//
// Hasta el 24/08 esta mitad de la pantalla dibujaba `ListaClientes`, la cartera del canónico 25, con
// el argumento de que dos tablas del mismo maestro se contradicen. El mockup v2 dibuja otra cosa: la
// obra en ejecución es una FILA propia, indentada bajo su cliente y compartiendo sus columnas
// —contratado es plata en las dos, últ. mov. es una fecha en las dos—. Eso no es la cartera de
// clientes con una columna más: es la jerarquía del criterio 4 del patrón («jerarquía por
// indentación, no por contenedores»), y con ella la pregunta que contesta la pantalla cambia de
// «qué clientes tengo» a «qué le estoy ejecutando a cada uno».
//
// El maestro sigue viviendo en `/clientes`, con su alta, su archivado y su panel. Acá no se
// administra nada: se mira y se entra.
//
// ═══ CERO N+1 ═══
//
// Cuatro lecturas para TODA la cartera, ninguna por fila: los clientes, las obras `activa` de
// todos, el último parte de cada obra y los certificados de todas. Las cuatro salen en la MISMA
// tanda que los conteos de la barra. Una consulta por cliente serían cinco viajes hoy y treinta el
// día que la empresa crezca, que es exactamente cómo una pantalla de entrada se vuelve inusable.
//
// ═══ LO QUE NO SE INVENTA ═══
//
// · `avance_pct` en `null` NO es 0 %: no hay barra y la celda dice «sin medir».
// · `monto_contratado` en `null` NO es $ 0: dice «sin contrato», en ámbar, porque eso SÍ es trabajo.
// · `jefe_obra` en `null` dice «sin jefe»: medido el 25/08, 13 de las 14 obras activas no lo tienen.
// · El estado de certificación sale de `certificados`, que hoy está VACÍA (0 filas, medido el
//   25/08 con la clave de servicio). Con la tabla vacía toda obra dice «sin certificar», que es
//   cierto —no hay ninguno cargado—; si la LECTURA falla, dice «sin leer», que es otra cosa.
// · «vencido 12 d» del mockup NO se dibuja: ninguna tabla guarda el vencimiento de un certificado.
//   `certificados` tiene fecha de certificación, de facturación y de cobranza, y ninguna es un
//   plazo. Un «vencido» calculado sobre una fecha que no es la de vencimiento es un dato inventado.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ClientePanel } from '@/features/clientes/types'
import { avisoDeDatos } from '../../clientes/services/cartera.ts'

/** Una obra `activa`, tal como la lee la cartera. Es un subconjunto de `obra_panel`. */
export interface ObraDeCartera {
  obra_id: string
  nombre: string
  cliente_id: string | null
  avance_pct: number | null
  jefe_obra: string | null
  monto_contratado: number | null
}

/** El certificado más avanzado de una obra, ya resuelto a una frase. */
export interface EstadoCertificacion {
  texto: string
  /** `true` cuando lo que dice reclama trabajo: se pinta en ámbar. */
  reclama: boolean
}

export interface ObraEnCurso {
  obra_id: string
  nombre: string
  avance: number | null
  jefe: string | null
  contratado: number | null
  certificacion: EstadoCertificacion
  /** El último parte de la obra, `YYYY-MM-DD`. `null` = ninguno registrado. */
  ultimoParte: string | null
}

export interface ClienteEnCartera {
  cliente_id: string
  slug: string | null
  nombre: string
  /** Qué le falta al maestro. `null` = nada. */
  aviso: string | null
  /** El texto corto del aviso, para la etiqueta de la fila. */
  avisoCorto: string | null
  obras: number
  contratado: number | null
  /** El hecho más reciente que el OS conoce de este cliente. `null` = ninguno. */
  ultimoMovimiento: string | null
  enCurso: ObraEnCurso[]
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// LAS LECTURAS
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * LAS OBRAS EN EJECUCIÓN DE TODA LA CARTERA, EN UNA CONSULTA.
 *
 * `estado = 'activa'` y no `estado <> 'cerrada'`: MEDIDO el 24/08/2026 contra la base, la suma de
 * `cliente_panel.n_obras_activas` coincide con las obras en `activa`, no con las que no están
 * cerradas. Con el otro criterio, la fila del cliente y las filas de abajo se contradirían.
 *
 * Un fallo devuelve `null` —no un mapa vacío—: «no pude leer las obras» y «este cliente no tiene
 * ninguna en ejecución» son dos cosas distintas y la pantalla las dice distinto.
 */
export async function getObrasDeLaCartera(
  supabase: SupabaseClient,
): Promise<ObraDeCartera[] | null> {
  const { data, error } = await supabase
    .from('obra_panel')
    .select('obra_id, nombre, cliente_id, avance_pct, jefe_obra, monto_contratado')
    .eq('estado', 'activa')
    .order('orden', { ascending: true })
    .order('nombre', { ascending: true })
  if (error) return null
  return (data ?? []) as ObraDeCartera[]
}

/**
 * EL ÚLTIMO PARTE DE CADA OBRA — `obra_ejecucion` es el hecho, no la vista de avance.
 *
 * Se lee la tabla entera (`obra_id, fecha`) y se reduce en memoria porque PostgREST tiene los
 * agregados APAGADOS en esta base (`PGRST123: Use of aggregate functions is not allowed`, medido el
 * 25/08): no hay forma de pedir un `max(fecha) group by obra_id` sin crear una vista, y una vista
 * es una migración que este trabajo no puede aplicar.
 *
 * ESCALA CONOCIDA: 248 filas hoy (~12 KB) y el índice `obra_ejecucion_por_obra (obra_id, fecha
 * desc)` ya existe. Cuando esta tabla pase de unas decenas de miles, la respuesta correcta es la
 * vista `obra_ultimo_parte` — está escrita en `supabase/migrations`, SIN aplicar, y hasta que
 * alguien la aplique esto sigue siendo correcto, sólo que más caro.
 *
 * NO SE ACOTA CON UN `limit`: cortar las N más recientes haría que una obra cuyo último parte
 * quedó fuera del corte dijera «sin partes», que es una afirmación falsa. Más vale cara que mentirosa.
 */
export async function getUltimoParte(supabase: SupabaseClient): Promise<Map<string, string> | null> {
  const { data, error } = await supabase
    .from('obra_ejecucion')
    .select('obra_id, fecha')
    .order('fecha', { ascending: false })
  if (error) return null
  const por = new Map<string, string>()
  for (const p of data ?? []) {
    const obra = p.obra_id as string
    // Vienen ordenados de más nuevo a más viejo: el primero de cada obra ES el último parte.
    if (obra && !por.has(obra)) por.set(obra, p.fecha as string)
  }
  return por
}

/** Lo mínimo de un certificado para saber en qué punto del circuito está. */
export interface FilaCertificado {
  obra_canonica_id: string | null
  numero: string | null
  fecha_certificacion: string | null
  fecha_facturacion: string | null
  fecha_cobranza: string | null
}

export async function getCertificadosDeLaCartera(
  supabase: SupabaseClient,
): Promise<FilaCertificado[] | null> {
  const { data, error } = await supabase
    .from('certificados')
    .select('obra_canonica_id, numero, fecha_certificacion, fecha_facturacion, fecha_cobranza')
    .order('fecha_certificacion', { ascending: true })
  if (error) return null
  return (data ?? []) as FilaCertificado[]
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// LO PURO — se prueba sin base
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * EN QUÉ PUNTO DEL CIRCUITO ESTÁ LA OBRA. Sólo lo que las fechas prueban.
 *
 * El circuito es certificar → facturar → cobrar, y se lee al revés: la fecha más avanzada que
 * exista es el estado. Un certificado con `fecha_cobranza` ya pasó por las dos anteriores.
 */
export function certificacionDe(
  certificados: FilaCertificado[] | null, obraId: string,
): EstadoCertificacion {
  if (certificados === null) return { texto: 'certificación sin leer', reclama: true }
  const suyos = certificados.filter((c) => c.obra_canonica_id === obraId)
  if (suyos.length === 0) return { texto: 'sin certificar', reclama: false }
  const ultimo = suyos[suyos.length - 1]
  const n = ultimo.numero?.trim() ? `cert. ${ultimo.numero.trim()}` : 'certificado'
  if (ultimo.fecha_cobranza) return { texto: `${n} cobrado`, reclama: false }
  if (ultimo.fecha_facturacion) return { texto: `${n} facturado`, reclama: false }
  if (ultimo.fecha_certificacion) return { texto: `${n} certificado`, reclama: false }
  // Existe la fila y no tiene ni una fecha: nadie puede decir en qué punto está.
  return { texto: `${n} sin fechas`, reclama: true }
}

/** `2026-08-25` con hoy `2026-08-25` → `hoy`. Sin año: en esta columna siempre es éste. */
export function diaRelativo(fecha: string | null, hoy: string): string | null {
  if (!fecha) return null
  if (fecha === hoy) return 'hoy'
  const ayer = new Date(`${hoy}T00:00:00Z`)
  ayer.setUTCDate(ayer.getUTCDate() - 1)
  if (fecha === ayer.toISOString().slice(0, 10)) return 'ayer'
  const [, m, d] = fecha.split('-')
  return m && d ? `${d}/${m}` : fecha
}

/** El día de HOY en la hora de la empresa, no en la del proceso: Vercel corre en UTC. */
export function hoyEnLaEmpresa(ahora: Date = new Date()): string {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(ahora)
  return p
}

const masReciente = (a: string | null, b: string | null) =>
  a === null ? b : b === null ? a : (a > b ? a : b)

/**
 * ARMA LA CARTERA. Puro: cuatro listas entran, las filas que se dibujan salen.
 *
 * «Últ. mov.» del cliente es el HECHO más reciente que el OS registró de él: el último parte de
 * alguna de sus obras, o la fecha más avanzada de alguno de sus certificados. NO es
 * `clientes.updated_at` —eso es la última vez que alguien corrigió un teléfono— y por eso la
 * columna lleva su definición en el `title`: un rótulo de tres letras no puede cargar solo con
 * decir de qué está hablando.
 */
export function armarCartera({
  clientes, obras, partes, certificados,
}: {
  clientes: ClientePanel[]
  obras: ObraDeCartera[] | null
  partes: Map<string, string> | null
  certificados: FilaCertificado[] | null
}): ClienteEnCartera[] {
  const porCliente = new Map<string, ObraDeCartera[]>()
  for (const o of obras ?? []) {
    if (!o.cliente_id) continue
    porCliente.set(o.cliente_id, [...(porCliente.get(o.cliente_id) ?? []), o])
  }

  return clientes.map((c) => {
    const enCurso: ObraEnCurso[] = (porCliente.get(c.cliente_id) ?? []).map((o) => ({
      obra_id: o.obra_id,
      nombre: o.nombre,
      avance: o.avance_pct,
      jefe: o.jefe_obra?.trim() || null,
      contratado: o.monto_contratado,
      certificacion: certificacionDe(certificados, o.obra_id),
      ultimoParte: partes?.get(o.obra_id) ?? null,
    }))

    const fechasCert = (certificados ?? [])
      .filter((x) => enCurso.some((o) => o.obra_id === x.obra_canonica_id))
      .map((x) => masReciente(masReciente(x.fecha_certificacion, x.fecha_facturacion), x.fecha_cobranza))
    const ultimoMovimiento = [...enCurso.map((o) => o.ultimoParte), ...fechasCert]
      .reduce<string | null>((a, b) => masReciente(a, b), null)

    const sinContrato = enCurso.some((o) => o.contratado === null)
    return {
      cliente_id: c.cliente_id,
      slug: c.slug,
      nombre: c.nombre_comercial,
      aviso: avisoDeDatos(c),
      // La etiqueta corta de la fila; la frase entera va en el `title`. El mockup escribe «sin CUIT»
      // y «obra sin contrato» — las dos son ciertas y las dos frenan el cobro.
      avisoCorto: avisoDeDatos(c) ? 'sin CUIT' : sinContrato ? 'obra sin contrato' : null,
      obras: c.n_obras,
      contratado: c.contratado,
      ultimoMovimiento,
      enCurso,
    }
  })
}
