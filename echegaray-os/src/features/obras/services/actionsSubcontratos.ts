'use server'

// LAS ESCRITURAS DE LA PANTALLA 10 — un paquete, sus aportes, sus papeles y su gente.
//
// ═══ EL PRECIO NO ENTRA POR UN PATCH ═══
//
// La migración 3400 revocó el UPDATE de `subcontrato.precio_contratado` y de
// `subcontrato_aporte.monto` para `authenticated`, y dejó dicho cómo tenía que entrar cuando esta
// pantalla existiera: «por una función con portero económico». Son `subcontrato_fijar_precio` y
// `subcontrato_aporte_agregar` (migración 5000). Escribir el precio en el `insert` de la tabla no
// fallaría silenciosamente: fallaría la fila entera — y por eso el alta se hace en dos pasos, con
// el paquete ya creado antes de intentar el precio. Si el precio falla, el paquete queda: es
// preferible un paquete sin precio a perder la carga completa.
//
// ═══ EL BLOQUEO DE INICIO SE VUELVE A CONTROLAR ACÁ ═══
//
// La pantalla apaga el botón, pero el botón no es el control: la misma fila entra por PostgREST con
// una sesión válida. Pasar a `en_curso` relee los papeles del paquete y aplica `puedeIniciar`, que
// es la MISMA función que dibuja el cartel rojo. Dos implementaciones del bloqueo serían dos
// respuestas posibles a «¿este paquete puede arrancar?».

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import type { Resultado } from './actions'
import {
  faltaEnLaBase, mensajeDeObjetoFaltante, puedeIniciar, revisarDocumentacion,
  type DocumentoPaquete,
} from './subcontratosReglas.ts'

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida')
const fechaOpt = z.union([fecha, z.literal('')]).optional()
const numeroOpt = z.union([z.coerce.number().nonnegative('Va en positivo'), z.literal('')]).optional()
const nulo = <T,>(v: T | '' | undefined) => (v === '' || v === undefined ? null : v)
const texto = z.string().trim()

const ESTADOS = ['previsto', 'contratado', 'en_curso', 'terminado', 'anulado'] as const

const paqueteSchema = z.object({
  nombre: texto.min(1, 'El paquete necesita un nombre'),
  proveedor_id: texto.optional(),
  proveedor_texto: texto.optional(),
  actividad_id: texto.optional(),
  alcance: texto.optional(),
  cantidad: numeroOpt,
  unidad: texto.optional(),
  precio_contratado: numeroOpt,
  fecha_inicio_plan: fechaOpt,
  fecha_fin_plan: fechaOpt,
  notas: texto.optional(),
})

/**
 * NUEVO PAQUETE. El proveedor puede venir del maestro o escrito a mano —la base exige uno de los
 * dos con un CHECK— y la actividad que cubre es opcional en el alta pero se pide en la pantalla:
 * un paquete sin actividad no se puede comparar contra hacerlo con gente propia, que es la mitad
 * de para qué existe esta pantalla.
 */
export async function crearPaquete(obraId: string, form: FormData): Promise<Resultado> {
  const parsed = paqueteSchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const d = parsed.data
  if (!d.proveedor_id && !d.proveedor_texto) {
    return { ok: false, error: 'Decí quién lo ejecuta: elegí un proveedor o escribí el nombre.' }
  }
  if (d.fecha_inicio_plan && d.fecha_fin_plan && d.fecha_fin_plan < d.fecha_inicio_plan) {
    return { ok: false, error: 'El fin de plan no puede ser anterior al inicio.' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.from('subcontrato').insert({
    obra_id: obraId,
    proveedor_id: d.proveedor_id || null,
    proveedor_texto: d.proveedor_texto || null,
    nombre: d.nombre,
    alcance: d.alcance || null,
    cantidad: nulo(d.cantidad),
    unidad: d.unidad || null,
    fecha_inicio_plan: nulo(d.fecha_inicio_plan),
    fecha_fin_plan: nulo(d.fecha_fin_plan),
    notas: d.notas || null,
  }).select('id').single()
  if (error) return { ok: false, error: error.message }
  const id = data.id as string

  // El alcance vinculado va después: el trigger `subcontrato_no_excede_la_actividad` puede
  // rechazarlo —lo subcontratado no puede superar lo contratado de la actividad— y su mensaje es
  // información útil, no un motivo para perder el paquete.
  let aviso: string | undefined
  if (d.actividad_id) {
    const vin = await supabase.from('subcontrato_alcance').insert({
      subcontrato_id: id,
      actividad_id: d.actividad_id,
      cantidad: nulo(d.cantidad),
      unidad: d.unidad || null,
    })
    if (vin.error) aviso = `El paquete se creó, pero no quedó vinculado a la actividad: ${vin.error.message}`
  }
  if (nulo(d.precio_contratado) != null) {
    const precio = await fijarPrecio(supabase, id, Number(d.precio_contratado))
    if (precio) aviso = `${aviso ? `${aviso} ` : ''}${precio}`
  }

  revalidar(obraId)
  return { ok: true, id, mensaje: aviso }
}

const aportesSchema = z.object({
  subcontrato_id: texto.uuid('Falta el paquete'),
  tipo: z.enum(['material', 'equipo', 'hh_propia', 'transporte', 'comida', 'epp', 'otro']),
  descripcion: texto.min(1, 'Decí qué se le entregó'),
  cantidad: numeroOpt,
  unidad: texto.optional(),
  monto: numeroOpt,
  fecha: fechaOpt,
})

/**
 * UN APORTE DE ECHEGARAY. Entra por la función con portero: el monto es económico y la columna
 * está revocada. Un aporte SIN monto lo puede anotar el jefe de obra — es justamente el que más se
 * subestima («ayuda de gremio · 8 HH», «el transporte lo pusimos nosotros»), y exigirle permiso
 * económico sería garantizar que no se registre nunca.
 */
export async function registrarAporte(obraId: string, form: FormData): Promise<Resultado> {
  const parsed = aportesSchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const d = parsed.data
  const supabase = await createClient()
  const { error } = await supabase.rpc('subcontrato_aporte_agregar', {
    p_subcontrato: d.subcontrato_id,
    p_tipo: d.tipo,
    p_descripcion: d.descripcion,
    p_cantidad: nulo(d.cantidad),
    p_unidad: d.unidad || null,
    p_monto: nulo(d.monto),
    p_fecha: nulo(d.fecha),
    p_registros_hh: null,
  })
  if (error) {
    return {
      ok: false,
      error: faltaEnLaBase(error.message)
        ? mensajeDeObjetoFaltante('La puerta para cargar el monto de un aporte', error.message)
        : error.message,
    }
  }
  revalidar(obraId)
  return { ok: true }
}

const personaSchema = z.object({
  subcontrato_id: texto.uuid('Falta el paquete'),
  nombre_completo: texto.min(1, 'Falta el nombre'),
  dni: texto.optional(),
  cuil: texto.optional(),
  categoria: texto.optional(),
  art_vigente_hasta: fechaOpt,
  alta_afip: z.union([z.literal('on'), z.literal('')]).optional(),
})

/**
 * ALTA DE UNA PERSONA DEL SUBCONTRATISTA — en `persona_externa`, NUNCA en `personas`.
 *
 * Es la regla §23 y la razón por la que la tabla existe aparte: meterla en la nómina contaminaría
 * las HH propias, las cargas sociales y la capacidad de obra. Lo único que compartimos con su gente
 * es la exigencia documental, porque esa sí es real para los dos.
 */
export async function agregarPersonaExterna(obraId: string, form: FormData): Promise<Resultado> {
  const parsed = personaSchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const d = parsed.data
  const supabase = await createClient()
  const { error } = await supabase.from('persona_externa').insert({
    subcontrato_id: d.subcontrato_id,
    nombre_completo: d.nombre_completo,
    dni: d.dni || null,
    cuil: d.cuil || null,
    categoria: d.categoria || null,
    art_vigente_hasta: nulo(d.art_vigente_hasta),
    alta_afip: d.alta_afip === 'on',
  })
  if (error) return { ok: false, error: error.message }
  revalidar(obraId)
  return { ok: true }
}

const documentoSchema = z.object({
  subcontrato_id: texto.uuid('Falta el paquete'),
  tipo: z.enum(['contrato', 'art', 'seguro_rc', 'alta_personal', 'otro']),
  descripcion: texto.optional(),
  numero: texto.optional(),
  fecha_emision: fechaOpt,
  vence_el: fechaOpt,
  archivo_url: texto.optional(),
})

/** Un papel del subcontratista. La ART va siempre con vencimiento: sin él no se puede afirmar que
 *  hoy cubra a nadie, y la base lo rechaza con un CHECK que nadie entendería. */
export async function registrarDocumento(obraId: string, form: FormData): Promise<Resultado> {
  const parsed = documentoSchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const d = parsed.data
  if (d.tipo === 'art' && !nulo(d.vence_el)) {
    return { ok: false, error: 'La ART necesita hasta cuándo vale: sin eso no cubre a nadie.' }
  }
  const supabase = await createClient()
  const { error } = await supabase.from('subcontrato_documento').insert({
    subcontrato_id: d.subcontrato_id,
    tipo: d.tipo,
    descripcion: d.descripcion || null,
    numero: d.numero || null,
    fecha_emision: nulo(d.fecha_emision),
    vence_el: nulo(d.vence_el),
    archivo_url: d.archivo_url || null,
  })
  if (error) {
    return {
      ok: false,
      error: faltaEnLaBase(error.message)
        ? mensajeDeObjetoFaltante('El registro de documentación del subcontratista', error.message)
        : error.message,
    }
  }
  revalidar(obraId)
  return { ok: true }
}

/**
 * MOVER EL PAQUETE DE ESTADO. Arrancar exige los papeles: es el bloqueo que el contrato pide
 * («documentación faltante bloquea el inicio del paquete») y se controla acá, del lado del
 * servidor, con la misma función que dibuja el cartel.
 */
export async function cambiarEstadoPaquete(
  obraId: string, subcontratoId: string, estado: string,
): Promise<Resultado> {
  const valido = ESTADOS.find((e) => e === estado)
  if (!valido) return { ok: false, error: `Estado desconocido: ${estado}` }
  const supabase = await createClient()

  if (valido === 'en_curso') {
    const { data, error } = await supabase.from('subcontrato_documento')
      .select('id, tipo, descripcion, fecha_emision, vence_el')
      .eq('subcontrato_id', subcontratoId)
    // NO SE ARRANCA A CIEGAS. Si los papeles no se pueden leer, el bloqueo no se puede levantar:
    // el modo de fallar de un «seguí, total no vi nada» es gente sin ART trabajando.
    if (error) {
      return {
        ok: false,
        error: faltaEnLaBase(error.message)
          ? mensajeDeObjetoFaltante('El registro de documentación del subcontratista', error.message)
          : `No pude verificar la documentación: ${error.message}`,
      }
    }
    const revision = revisarDocumentacion((data ?? []) as unknown as DocumentoPaquete[], hoy())
    if (!puedeIniciar(revision)) {
      return { ok: false, error: `${revision.bloqueos.join(' · ')}. El paquete no puede iniciar.` }
    }
  }

  const parche: Record<string, unknown> = { estado: valido }
  if (valido === 'en_curso') parche.fecha_inicio_real = hoy()
  if (valido === 'terminado') parche.fecha_fin_real = hoy()
  const { error } = await supabase.from('subcontrato').update(parche)
    .eq('id', subcontratoId).eq('obra_id', obraId)
  if (error) return { ok: false, error: error.message }
  revalidar(obraId)
  return { ok: true }
}

const precioSchema = z.object({
  subcontrato_id: texto.uuid('Falta el paquete'),
  precio_contratado: z.coerce.number().nonnegative('El precio va en positivo'),
})

/** Fijar o corregir el precio de un paquete ya creado. Misma puerta con portero económico. */
export async function fijarPrecioPaquete(obraId: string, form: FormData): Promise<Resultado> {
  const parsed = precioSchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const supabase = await createClient()
  const problema = await fijarPrecio(supabase, parsed.data.subcontrato_id, parsed.data.precio_contratado)
  if (problema) return { ok: false, error: problema }
  revalidar(obraId)
  return { ok: true }
}

type Cliente = Awaited<ReturnType<typeof createClient>>

/** Devuelve el problema en castellano, o `null` si el precio quedó escrito. */
async function fijarPrecio(supabase: Cliente, id: string, precio: number): Promise<string | null> {
  const { error } = await supabase.rpc('subcontrato_fijar_precio', {
    p_subcontrato: id, p_precio: precio,
  })
  if (!error) return null
  if (faltaEnLaBase(error.message)) {
    return mensajeDeObjetoFaltante('La puerta para escribir el precio del subcontrato', error.message)
  }
  return `El precio no se guardó: ${error.message}`
}

const hoy = () => new Date().toISOString().slice(0, 10)

function revalidar(obraId: string) {
  revalidatePath(`/obras/${obraId}/subcontratos`)
  revalidatePath(`/obras/${obraId}`)
}
