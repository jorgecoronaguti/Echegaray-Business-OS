// LA LECTURA DE «EFECTIVO A RENDIR» — una sola para la lista, la ficha y sus paneles.
//
// Es chica (decenas de entregas, no miles) y se lee entera: las tarjetas de D01, la ficha de D03 y el
// aviso de D02 («ya tiene $ X sin rendir») miran la misma lectura, así que no pueden contradecirse.
//
// ═══ SIN LA MIGRACIÓN, NO HAY CERO ═══
// Mientras `20260922T1500` no esté aplicada, `efectivo_entrega_saldo` no existe: el resultado es
// `falta_migracion` y la pantalla lo dice. Nunca `ok` con listas vacías — «nadie tiene efectivo de la
// empresa» sería una afirmación falsa sobre la caja.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { getPerfilActual } from '@/features/auth/services/authService'
import { esAdministracion } from '@/features/auth/types/areas'
import { conteosDeCampanita, diaAR } from '../logica/entregas'
import { faltaMigracion } from '../logica/formularios'
import {
  COLUMNAS_COMPROBANTE, COLUMNAS_ENTREGA,
  type Comprobante, type Devolucion, type Entrega, type FilaDeCompras, type ObraOpcion, type PersonaOpcion, type Rendicion,
} from '../types'

const TOPE = 5_000
/** Lo que dura el enlace firmado a una foto o al papel: se abre en el momento, no se comparte. */
const VIGENCIA = 60 * 10

export interface DatosEfectivo {
  entregas: Entrega[]
  comprobantes: Comprobante[]
  rendiciones: Rendicion[]
  devoluciones: Devolucion[]
  personas: PersonaOpcion[]
  obras: ObraOpcion[]
  /** El cliente de cada obra (por id), para la segunda línea del destino. */
  clienteDeObra: Record<string, string>
  /** La persona del plantel que es el usuario de la sesión (D06 «quién la recibe»). */
  miPersona: string | null
  hoy: string
}

export type LecturaEfectivo =
  | { estado: 'ok'; datos: DatosEfectivo }
  | { estado: 'sin_permiso' }
  | { estado: 'falta_migracion' }
  | { estado: 'error'; mensaje: string }

async function leerObras(supabase: SupabaseClient): Promise<ObraOpcion[]> {
  const [obras, clientes] = await Promise.all([
    supabase.from('obra_canonica').select('id, nombre, estado, cliente_id').is('fusionada_en', null),
    supabase.from('clientes').select('id, nombre_comercial'),
  ])
  const cliente = new Map(((clientes.data ?? []) as { id: string; nombre_comercial: string | null }[]).map((c) => [c.id, c.nombre_comercial]))
  return ((obras.data ?? []) as { id: string; nombre: string | null; estado: string | null; cliente_id: string | null }[])
    .map((o) => ({ id: o.id, nombre: o.nombre ?? o.id, cliente: o.cliente_id ? (cliente.get(o.cliente_id) ?? null) : null, activa: o.estado === 'activa' }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}

export async function leerEfectivo(): Promise<LecturaEfectivo> {
  try {
    const supabase = await createClient()
    const [perfil, entregas, comprobantes, rendiciones, devoluciones, personas, obras, mia] = await Promise.all([
      getPerfilActual(supabase),
      supabase.from('efectivo_entrega_saldo').select(COLUMNAS_ENTREGA).order('fecha', { ascending: false }).limit(TOPE),
      supabase.from('efectivo_comprobante_estado').select(COLUMNAS_COMPROBANTE).order('enviado_en', { ascending: false }).limit(TOPE),
      supabase.from('efectivo_rendicion').select('id, entrega_id, compra_clave, monto, imputada_en, comprobante_id').limit(TOPE),
      supabase.from('efectivo_devolucion').select('id, entrega_id, monto, fecha, recibida_por, registrada_en, nota').limit(TOPE),
      supabase.from('personas').select('id, nombre_completo, puesto').eq('en_la_empresa', true).eq('es_prueba', false)
        .order('nombre_completo').limit(1000),
      leerObras(supabase),
      supabase.rpc('mi_persona_id'),
    ])
    // LA PUERTA, no la cerradura: la RLS de las tablas es la que decide qué filas salen.
    if (!esAdministracion(perfil.data?.rol ?? null)) return { estado: 'sin_permiso' }
    for (const r of [entregas, comprobantes, rendiciones, devoluciones]) {
      if (faltaMigracion(r.error)) return { estado: 'falta_migracion' }
      if (r.error) return { estado: 'error', mensaje: r.error.message }
    }
    const clienteDeObra: Record<string, string> = {}
    for (const o of obras) if (o.cliente) clienteDeObra[o.id] = o.cliente
    const num = (v: unknown) => Number(v ?? 0)
    return {
      estado: 'ok',
      datos: {
        entregas: ((entregas.data ?? []) as unknown as Entrega[]).map((e) => ({
          ...e, entregado: num(e.entregado), rendido: num(e.rendido), devuelto: num(e.devuelto),
          en_su_poder: num(e.en_su_poder), filas_rendidas: num(e.filas_rendidas),
        })),
        comprobantes: (comprobantes.data ?? []) as unknown as Comprobante[],
        rendiciones: ((rendiciones.data ?? []) as unknown as Rendicion[]).map((r) => ({ ...r, monto: num(r.monto) })),
        devoluciones: ((devoluciones.data ?? []) as unknown as Devolucion[]).map((d) => ({ ...d, monto: num(d.monto) })),
        personas: ((personas.data ?? []) as { id: string; nombre_completo: string | null; puesto: string | null }[])
          .filter((p) => p.nombre_completo).map((p) => ({ id: p.id, nombre: p.nombre_completo as string, puesto: p.puesto })),
        obras,
        clienteDeObra,
        miPersona: typeof mia.data === 'string' ? mia.data : null,
        hoy: diaAR(new Date().toISOString()),
      },
    }
  } catch (err) {
    return { estado: 'error', mensaje: err instanceof Error ? err.message : 'Error al conectar con Supabase' }
  }
}

export interface ExtraDeFicha {
  creadaEn: string | null
  entregadaPor: string | null
  /** Enlace firmado al papel de conformidad, si se subió. */
  papelUrl: string | null
  /** Las filas de Compras que rinden esta entrega, por clave. */
  compras: Map<string, FilaDeCompras>
}

/**
 * LO QUE SÓLO LA FICHA ABIERTA NECESITA: quién entregó y cuándo (la vista no lo trae), el papel firmado y
 * las filas de Compras que la rinden. Se pide para UNA entrega, no para la lista.
 */
export async function leerExtraDeFicha(entregaId: string, claves: string[]): Promise<ExtraDeFicha> {
  const supabase = await createClient()
  const [fila, compras] = await Promise.all([
    supabase.from('efectivo_entrega').select('creada_en, entregada_por, conformidad_papel_url').eq('id', entregaId).maybeSingle(),
    claves.length
      ? supabase.from('compra_sheet').select('fila, clave, fecha, proveedor, concepto, tipo, comprobante, total, tipo_pago').in('clave', claves)
      : Promise.resolve({ data: [] as unknown[], error: null }),
  ])
  const f = fila.data as { creada_en: string | null; entregada_por: string | null; conformidad_papel_url: string | null } | null
  const [quien, papel] = await Promise.all([
    f?.entregada_por ? supabase.from('perfiles').select('nombre').eq('id', f.entregada_por).maybeSingle() : Promise.resolve({ data: null }),
    f?.conformidad_papel_url ? firmar(supabase, f.conformidad_papel_url) : Promise.resolve(null),
  ])
  const mapa = new Map<string, FilaDeCompras>()
  for (const c of (compras.data ?? []) as FilaDeCompras[]) if (c.clave) mapa.set(c.clave, { ...c, total: c.total == null ? null : Number(c.total) })
  return {
    creadaEn: f?.creada_en ?? null,
    entregadaPor: (quien.data as { nombre: string | null } | null)?.nombre ?? null,
    papelUrl: papel,
    compras: mapa,
  }
}

async function firmar(supabase: SupabaseClient, ruta: string): Promise<string | null> {
  const { data } = await supabase.storage.from('comprobantes').createSignedUrl(ruta, VIGENCIA)
  return data?.signedUrl ?? null
}

/** El enlace firmado a la foto de UN ticket (D04). `null` si no hay archivo o Storage no lo firma. */
export async function urlDeFoto(ruta: string | null): Promise<string | null> {
  if (!ruta) return null
  try {
    return await firmar(await createClient(), ruta)
  } catch {
    return null
  }
}

export type LecturaEnManos =
  | { estado: 'ok'; entregas: Entrega[]; hoy: string }
  | { estado: 'falta_migracion' }
  | { estado: 'error'; mensaje: string }

/**
 * D09 / D10 — LAS ENTREGAS ABIERTAS CON SALDO, para Caja y la Economía de la obra. La misma vista que D01:
 * la cifra «En manos de la gente» tiene una sola definición. Con `obra`, sólo las de esa obra.
 */
export async function leerEnManos(obra?: string): Promise<LecturaEnManos> {
  try {
    const supabase = await createClient()
    let q = supabase.from('efectivo_entrega_saldo').select(COLUMNAS_ENTREGA).eq('estado', 'abierta').gt('en_su_poder', 0).limit(TOPE)
    if (obra) q = q.eq('obra_id', obra)
    const { data, error } = await q
    if (faltaMigracion(error)) return { estado: 'falta_migracion' }
    if (error) return { estado: 'error', mensaje: error.message }
    const num = (v: unknown) => Number(v ?? 0)
    return {
      estado: 'ok',
      hoy: diaAR(new Date().toISOString()),
      entregas: ((data ?? []) as unknown as Entrega[]).map((e) => ({
        ...e, entregado: num(e.entregado), rendido: num(e.rendido), devuelto: num(e.devuelto), en_su_poder: num(e.en_su_poder),
      })),
    }
  } catch (err) {
    return { estado: 'error', mensaje: err instanceof Error ? err.message : 'Error al conectar con Supabase' }
  }
}

/**
 * D14 — LO QUE EL FLUJO LE SUMA A LA CAMPANITA. Sin la migración, `undefined` (no se mide, no se dibuja);
 * con un error de lectura, `null` («no pude mirar», nunca cero). Sólo los tickets que esperan.
 */
export async function leerCampanitaEfectivo(supabase: SupabaseClient): Promise<{ efectivoPorImputar?: number | null; efectivoSinCuit?: number | null }> {
  try {
    const { data, error } = await supabase.from('efectivo_comprobante_estado').select('estado, resultado')
      .not('estado', 'in', '(en_compras,descartado)').limit(TOPE)
    if (faltaMigracion(error)) return {}
    if (error) return { efectivoPorImputar: null, efectivoSinCuit: null }
    const c = conteosDeCampanita((data ?? []) as unknown as Pick<Comprobante, 'estado' | 'resultado'>[])
    return { efectivoPorImputar: c.porImputar, efectivoSinCuit: c.sinCuit }
  } catch {
    return { efectivoPorImputar: null, efectivoSinCuit: null }
  }
}

/**
 * D07 — EL NÚMERO DE ENTREGA DE CADA FILA «A RENDIR» DE COMPRAS, por la clave de la fila.
 *
 * Sin la migración (o sin permiso) el mapa queda vacío y la fila dice «A rendir» a secas: el número es un
 * agregado, no una condición para listar Compras.
 */
export async function entregaPorClave(supabase: SupabaseClient): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  try {
    const { data, error } = await supabase.from('efectivo_rendicion').select('compra_clave, entrega:efectivo_entrega(codigo)').limit(TOPE)
    if (error) return out
    for (const r of (data ?? []) as unknown as { compra_clave: string; entrega: { codigo: string } | { codigo: string }[] | null }[]) {
      const e = Array.isArray(r.entrega) ? r.entrega[0] : r.entrega
      if (r.compra_clave && e?.codigo) out.set(r.compra_clave, e.codigo)
    }
  } catch {
    // Mismo criterio: sin el dato, la fila sigue listándose.
  }
  return out
}
