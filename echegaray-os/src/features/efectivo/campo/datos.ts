// LAS LECTURAS DEL TELÉFONO — con la sesión de la persona, nunca con la service key.
//
// Las vistas `efectivo_entrega_saldo` y `efectivo_comprobante_estado` son `security_invoker`: la base
// deja ver las entregas propias (`persona_id = mi_persona_id()`). Igual se filtra por la persona de
// forma EXPLÍCITA, y no es redundante: a Dirección y Administración la RLS les muestra las de todos
// (`ve_economia()`), y a cualquiera le muestra además las que ÉL entregó. «Mi efectivo» es el mío, lo
// mire quien lo mire. Lo que ya NO depende de este filtro es la cerradura: hasta el 22/09/2026 el Jefe
// de obra entraba por `es_administracion()` y PostgREST le devolvía el efectivo de toda la empresa;
// lo cerró la migración `20260922T2700`.
//
// ═══ LA MIGRACIÓN PUEDE NO ESTAR APLICADA ═══
//
// 20260922T1500 la aplica el dueño. Hasta entonces las vistas no existen y PostgREST contesta
// PGRST205. Eso NO es «no tenés efectivo»: es «el módulo todavía no está publicado», y cada pantalla
// lo dice así en vez de pintar un cero.

import type { SupabaseClient } from '@supabase/supabase-js'
import { faltaMigracion } from '../../herramientas/logica/falta-migracion'
import type { EntregaSaldo, TicketRendicion } from './tipos'

export type Lectura<T> =
  | { estado: 'ok'; dato: T }
  | { estado: 'sin-publicar' }
  | { estado: 'error'; error: string }

const COLS_ENTREGA =
  'id, codigo, persona_id, persona, obra_id, obra, estructura, fecha, entregado, rendido, filas_rendidas, devuelto, ' +
  'en_su_poder, conformidad, estado, para_que, conformidad_en'

const COLS_TICKET =
  'id, entrega_id, entrega, canal, enviado_en, storage_path, nombre_archivo, media_type, motivo, resultado, ' +
  'monto_rendido, observacion, observado_en, respuesta, respondido_en, descartado_motivo, estado'

/** `numeric` llega como texto desde PostgREST: se pasa a número una vez, acá. */
function numerosDeEntrega(e: Record<string, unknown>): EntregaSaldo {
  const n = (k: string) => Number(e[k] ?? 0)
  return {
    ...(e as unknown as EntregaSaldo),
    entregado: n('entregado'), rendido: n('rendido'), filas_rendidas: n('filas_rendidas'),
    devuelto: n('devuelto'), en_su_poder: n('en_su_poder'),
  }
}

/** Las entregas de UNA persona (las anuladas no existen para ella: nunca salió plata). */
export async function getMisEntregas(supabase: SupabaseClient, personaId: string): Promise<Lectura<EntregaSaldo[]>> {
  const { data, error } = await supabase
    .from('efectivo_entrega_saldo')
    .select(COLS_ENTREGA)
    .eq('persona_id', personaId)
    .neq('estado', 'anulada')
    .order('fecha', { ascending: true })
  if (error) return faltaMigracion(error) ? { estado: 'sin-publicar' } : { estado: 'error', error: error.message }
  const entregas = ((data ?? []) as unknown as Record<string, unknown>[]).map(numerosDeEntrega)
  return { estado: 'ok', dato: await conQuienEntrego(supabase, entregas) }
}

/**
 * QUIÉN LE DIO LA PLATA — «De Jorge Echegaray» en M01, y a quién devolverla en M08.
 *
 * `entregada_por` es un usuario (no una persona) y no está en la vista. Se lee de la tabla (la RLS deja
 * ver la entrega propia) y el nombre de `perfiles`. Si la base no deja leer ese perfil, queda `null`
 * y la pantalla dice «Administración»: un nombre adivinado es peor que uno genérico.
 */
async function conQuienEntrego(supabase: SupabaseClient, entregas: EntregaSaldo[]): Promise<EntregaSaldo[]> {
  if (!entregas.length) return entregas
  const { data: filas } = await supabase
    .from('efectivo_entrega').select('id, entregada_por').in('id', entregas.map((e) => e.id))
  const porEntrega = new Map(((filas ?? []) as { id: string; entregada_por: string }[]).map((f) => [f.id, f.entregada_por]))
  const usuarios = [...new Set(porEntrega.values())]
  const nombres = await nombresDeUsuarios(supabase, usuarios)
  return entregas.map((e) => ({ ...e, entregada_por_nombre: nombres.get(porEntrega.get(e.id) ?? '') ?? null }))
}

/** Nombre de cada usuario que se pueda leer. Lo que no se puede leer, no está en el mapa. */
export async function nombresDeUsuarios(supabase: SupabaseClient, ids: readonly string[]): Promise<Map<string, string>> {
  const limpios = ids.filter(Boolean)
  if (!limpios.length) return new Map()
  const { data, error } = await supabase.from('perfiles').select('id, nombre').in('id', limpios)
  if (error) return new Map()
  return new Map(((data ?? []) as { id: string; nombre: string | null }[])
    .filter((p) => p.nombre?.trim())
    .map((p) => [p.id, p.nombre!.trim()]))
}

/** Los tickets de esas entregas, el más nuevo primero. */
export async function getMisTickets(supabase: SupabaseClient, entregaIds: readonly string[]): Promise<Lectura<TicketRendicion[]>> {
  if (!entregaIds.length) return { estado: 'ok', dato: [] }
  const { data, error } = await supabase
    .from('efectivo_comprobante_estado')
    .select(COLS_TICKET)
    .in('entrega_id', entregaIds as string[])
    .order('enviado_en', { ascending: false })
  if (error) return faltaMigracion(error) ? { estado: 'sin-publicar' } : { estado: 'error', error: error.message }
  return { estado: 'ok', dato: (data ?? []) as unknown as TicketRendicion[] }
}

/** Quién pidió el dato (M07: «Lo pidió Lucía Quiroga»). `null` si no se puede leer. */
export async function quienObservo(supabase: SupabaseClient, ticketId: string): Promise<string | null> {
  const { data } = await supabase.from('efectivo_comprobante').select('observado_por').eq('id', ticketId).maybeSingle()
  const uid = (data as { observado_por: string | null } | null)?.observado_por
  if (!uid) return null
  return (await nombresDeUsuarios(supabase, [uid])).get(uid) ?? null
}

/**
 * La foto del ticket, por un rato. La policy `comprobantes_lee_rendicion` deja leer sólo la carpeta
 * propia; si no se puede, `null` y la pantalla dibuja el recuadro sin foto.
 */
export async function urlDeLaFoto(supabase: SupabaseClient, ruta: string | null): Promise<string | null> {
  if (!ruta) return null
  const { data, error } = await supabase.storage.from('comprobantes').createSignedUrl(ruta, 10 * 60)
  return error ? null : data?.signedUrl ?? null
}

/** Las dos lecturas juntas, que es lo que piden casi todas las pantallas. */
export async function getMiEfectivo(supabase: SupabaseClient, personaId: string): Promise<
  Lectura<{ entregas: EntregaSaldo[]; tickets: TicketRendicion[] }>
> {
  const entregas = await getMisEntregas(supabase, personaId)
  if (entregas.estado !== 'ok') return entregas
  const tickets = await getMisTickets(supabase, entregas.dato.map((e) => e.id))
  if (tickets.estado !== 'ok') return tickets
  return { estado: 'ok', dato: { entregas: entregas.dato, tickets: tickets.dato } }
}
