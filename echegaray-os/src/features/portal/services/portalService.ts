// LO QUE VE EL CLIENTE — pantallas 29 y 30.
//
// ═══ DOS CERRADURAS, Y NINGUNA SOBRA ═══
//
// 1. LA BASE decide QUÉ FILAS. `cliente_de_sesion()` y las policies filtran por cliente y por obra:
//    eso vale aunque alguien consulte PostgREST directo, sin pasar por ninguna pantalla.
// 2. ESTA CAPA decide QUÉ CAMPOS. `puede_ver_montos` no se puede expresar como una policy —RLS
//    filtra filas, no columnas— así que el enmascarado de importes vive acá.
//
// LÍMITE CONOCIDO Y DECLARADO: la segunda cerradura es de aplicación, no de base. Un cliente con
// `puede_ver_montos = false` que consultara PostgREST con su propio token VERÍA los importes de sus
// propias filas. Cerrarlo del todo exige mover estas lecturas a funciones `security definer` que
// enmascaren en Postgres. Está declarado en el informe y no se dio por resuelto.
//
// Cuando no se pueden ver, los importes van en `null` y NUNCA en 0: un 0 es un número y el cliente
// leería «este certificado no vale nada».

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  CertificadoPortal, DocumentoPortal, MiObra, PagoPortal, PermisosPortal,
} from '../types'

type Resultado<T> = { data: T; error: null } | { data: null; error: string }

/**
 * LOS PERMISOS DE QUIEN ESTÁ MIRANDO. Es lo primero que hay que resolver: todo lo demás depende.
 *
 * Devuelve `null` sin error cuando quien consulta no es un cliente del portal (un empleado, por
 * ejemplo). No es un fallo — es la respuesta correcta a «¿qué cliente sos?» cuando no sos ninguno.
 */
export async function getPermisos(
  supabase: SupabaseClient,
): Promise<Resultado<PermisosPortal | null>> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: null, error: 'No hay sesión' }

  const { data, error } = await supabase
    .from('cliente_acceso')
    .select('cliente_id, puede_ver_obra, puede_ver_montos, puede_aprobar, obras, revocado_at')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (error) return { data: null, error: error.message }
  if (!data || data.revocado_at) return { data: null, error: null }

  return {
    data: {
      puedeVerObra: Boolean(data.puede_ver_obra),
      puedeVerMontos: Boolean(data.puede_ver_montos),
      puedeAprobar: Boolean(data.puede_aprobar),
      obras: (data.obras as string[] | null) ?? null,
    },
    error: null,
  }
}

/** El id del cliente de la sesión. La misma pregunta que responde `cliente_de_sesion()` en Postgres. */
export async function getClienteDeSesion(supabase: SupabaseClient): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from('cliente_acceso')
    .select('cliente_id')
    .eq('auth_user_id', user.id)
    .is('revocado_at', null)
    .maybeSingle()
  return data?.cliente_id ?? null
}

/**
 * LA OBRA DEL CLIENTE (pantalla 29, bloque «Mi obra»).
 *
 * Si el acceso no habilita ver la obra, devuelve una lista vacía — no un error. La pantalla dibuja
 * su estado vacío, que es la verdad para esa persona: no es que la obra falle, es que no la ve.
 */
export async function getMiObra(supabase: SupabaseClient): Promise<Resultado<MiObra[]>> {
  const { data: permisos, error: errPerm } = await getPermisos(supabase)
  if (errPerm) return { data: null, error: errPerm }
  if (!permisos || !permisos.puedeVerObra) return { data: [], error: null }

  const clienteId = await getClienteDeSesion(supabase)
  if (!clienteId) return { data: [], error: null }

  let q = supabase
    .from('obra_canonica')
    .select('id, nombre, estado, fecha_inicio_real, fecha_fin_plan')
    .eq('cliente_id', clienteId)
  // `obras` null = todas las del cliente. Un array vacío significa NINGUNA y ya lo cortó `.in([])`.
  if (permisos.obras !== null) q = q.in('id', permisos.obras)

  const { data, error } = await q.order('nombre')
  if (error) return { data: null, error: error.message }

  return {
    data: (data ?? []).map((o): MiObra => ({
      id: String(o.id),
      nombre: String(o.nombre ?? ''),
      estado: o.estado == null ? null : String(o.estado),
      // El avance no sale de acá y no se inventa: la pantalla lo pide aparte si corresponde.
      avancePct: null,
      fechaInicio: o.fecha_inicio_real == null ? null : String(o.fecha_inicio_real),
      fechaFinPlan: o.fecha_fin_plan == null ? null : String(o.fecha_fin_plan),
    })),
    error: null,
  }
}

/**
 * El importe, o null si esta persona no tiene derecho a verlo. NUNCA 0.
 *
 * Se exporta para poder probarlo: es la regla que decide si un tercero ve la economía de una obra, y
 * la diferencia entre `null` y `0` acá es la diferencia entre «no te lo mostramos» y «no vale nada».
 */
export const enmascararMonto = (v: unknown, puede: boolean): number | null =>
  (puede && v != null ? Number(v) : null)

const monto = enmascararMonto

/**
 * LOS CERTIFICADOS DEL CLIENTE (pantalla 29, «Certificados y pagos»).
 *
 * El RLS ya limitó las filas al cliente y a sus obras. Acá sólo se enmascaran los importes.
 */
export async function getMisCertificados(
  supabase: SupabaseClient,
): Promise<Resultado<CertificadoPortal[]>> {
  const { data: permisos, error: errPerm } = await getPermisos(supabase)
  if (errPerm) return { data: null, error: errPerm }
  if (!permisos) return { data: [], error: null }

  const { data, error } = await supabase
    .from('certificado_cliente')
    .select('id, numero, factura, obra_id, periodo_desde, periodo_hasta, avance_periodo, monto,'
      + ' reparo, emitido_at, vence, estado, observacion, detalle_rubros')
    .order('emitido_at', { ascending: false, nullsFirst: false })

  if (error) return { data: null, error: error.message }

  const filas = (data ?? []) as unknown as Record<string, unknown>[]
  return {
    data: filas.map((c): CertificadoPortal => ({
      id: String(c.id),
      numero: String(c.numero ?? ''),
      factura: c.factura == null ? null : String(c.factura),
      obraId: c.obra_id == null ? null : String(c.obra_id),
      periodoDesde: c.periodo_desde == null ? null : String(c.periodo_desde),
      periodoHasta: c.periodo_hasta == null ? null : String(c.periodo_hasta),
      avancePeriodo: c.avance_periodo == null ? null : Number(c.avance_periodo),
      monto: monto(c.monto, permisos.puedeVerMontos),
      reparo: monto(c.reparo, permisos.puedeVerMontos),
      emitidoAt: c.emitido_at == null ? null : String(c.emitido_at),
      vence: c.vence == null ? null : String(c.vence),
      estado: c.estado as CertificadoPortal['estado'],
      observacion: c.observacion == null ? null : String(c.observacion),
      // El detalle de rubros lleva importes adentro: si no puede ver montos, no viaja.
      detalleRubros: permisos.puedeVerMontos ? c.detalle_rubros : null,
    })),
    error: null,
  }
}

/** El esquema de pagos publicado. El RLS ya filtró por `visible_portal` y `publicado_at`. */
export async function getMisPagos(supabase: SupabaseClient): Promise<Resultado<PagoPortal[]>> {
  const { data: permisos, error: errPerm } = await getPermisos(supabase)
  if (errPerm) return { data: null, error: errPerm }
  if (!permisos) return { data: [], error: null }

  const { data, error } = await supabase
    .from('esquema_pago')
    .select('id, concepto, fecha, monto, estado, medio, reprogramaciones, mostrar_reprogramaciones')
    .order('fecha', { ascending: true, nullsFirst: false })

  if (error) return { data: null, error: error.message }

  const filas = (data ?? []) as unknown as Record<string, unknown>[]
  return {
    data: filas.map((p): PagoPortal => ({
      id: String(p.id),
      concepto: String(p.concepto ?? ''),
      fecha: p.fecha == null ? null : String(p.fecha),
      monto: monto(p.monto, permisos.puedeVerMontos),
      estado: p.estado as PagoPortal['estado'],
      medio: (p.medio ?? null) as PagoPortal['medio'],
      // El historial de fechas se guarda siempre; que el cliente lo vea es una decisión del admin.
      reprogramaciones: p.mostrar_reprogramaciones ? p.reprogramaciones : null,
    })),
    error: null,
  }
}

/**
 * LOS DOCUMENTOS DEL CLIENTE (pantalla 29, «Documentos»).
 *
 * LÍMITE DECLARADO: hoy devuelve vacío. `cliente_documento` existe, pero no tiene ninguna columna
 * que diga si un documento es COMPARTIBLE con el cliente, y todo lo que hay ahí adentro se cargó
 * bajo el supuesto de que sólo lo ve Administración: contratos, notas internas y documentación
 * fiscal. Publicarlos entero al portal sería una decisión de Nivel E que no toma un service.
 *
 * Se devuelve el vacío HONESTO —la pantalla dibuja su estado vacío— en lugar de exponer de más o de
 * inventar una lista. Cuando el dueño defina qué documento ve el cliente, se agrega la marca a
 * `cliente_documento` y esta función la lee.
 */
export async function getMisDocumentos(): Promise<Resultado<DocumentoPortal[]>> {
  return { data: [], error: null }
}
