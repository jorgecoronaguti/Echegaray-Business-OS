'use server'

// LAS ESCRITURAS DE «EFECTIVO A RENDIR» — todas por las funciones de la base (migración 20260922T1500).
//
// Nunca un insert/update a `efectivo_*`: las tablas no tienen grant de escritura y las reglas (obra XOR
// estructura, no devolver más de lo que tiene, no anular con rendiciones, no descartar lo que ya está en
// Compras) las hace cumplir la base. Acá se valida la forma (Zod + `formularios.ts`) y se traduce el error.
//
// ═══ LA WEB NO ESCRIBE COMPRAS (dueño, 22/09/2026) ═══
// El ticket rendido lo carga a Compras el worker de la VM, solo, con Tipo pago «A rendir» y la obra de la
// entrega. La única acción que «imputa» (24/09/2026, «Imputar un comprobante ya cargado») tampoco escribe
// el Sheet: la base encola el cambio de Tipo pago en la misma cola por la que la app registra los pagos
// de Compras (`compra_obra_cambio`), y el worker de esa cola lo escribe y lo relee.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { mensajeDeError, validarEntrega, validarMonto } from '../logica/formularios'

export type Resultado<T = null> = { ok: true; dato: T } | { ok: false; error: string }

const uuid = z.string().uuid('Falta la entrega')
const texto = (max: number) => z.string().trim().max(max)

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<Resultado<T>> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc(fn, args)
    if (error) return { ok: false, error: mensajeDeError(error) }
    revalidatePath('/administracion/compras')
    return { ok: true, dato: data as T }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'No se pudo conectar con la base' }
  }
}

const entregarSchema = z.object({
  persona: z.string(),
  destino: z.enum(['obra', 'estructura']).nullable(),
  obra: z.string(),
  monto: z.string(),
  paraQue: texto(400),
})

/** D02 — cuatro datos. Devuelve el código de la entrega (ER-0148). */
export async function entregarEfectivoAction(entrada: z.input<typeof entregarSchema>): Promise<Resultado<string>> {
  const p = entregarSchema.safeParse(entrada)
  if (!p.success) return { ok: false, error: 'El formulario llegó incompleto.' }
  const v = validarEntrega(p.data)
  if (!v.ok) return { ok: false, error: v.error }
  if (!z.string().uuid().safeParse(v.dato.persona).success) return { ok: false, error: 'Elegí a quién se le entrega.' }
  // LA SOBRECARGA DE 7, SIEMPRE. `p_es_prueba` en false hace exactamente lo mismo que la de 6, y con un
  // solo camino no hay manera de que la prueba se cree por una puerta y se lea por otra.
  return rpc<string>('entregar_efectivo', {
    p_persona: v.dato.persona, p_obra: v.dato.obra, p_estructura: v.dato.estructura,
    p_monto: v.dato.monto, p_para_que: v.dato.paraQue, p_fecha: null,
    p_es_prueba: v.dato.esPrueba,
  })
}

const devolucionSchema = z.object({
  entrega: uuid,
  monto: z.string(),
  recibidaPor: z.string().uuid().nullable(),
  cerrar: z.boolean(),
  /** El SVG de la firma de quien recibe el vuelto (D06). `null` = se registra sin firmar. */
  firmaRecibe: z.string().max(60_000).nullable().default(null),
})

export interface DevolucionRegistrada {
  devolucion: string
  resto: number
  cerrada: boolean
  firmada: boolean
}

/**
 * D06 — el vuelto vuelve a Efectivo, con la firma de quien lo recibe.
 *
 * SIEMPRE SE LLAMA A LA DE 7 ARGUMENTOS (migración 20260922T2900), aunque no haya firma: con dos
 * sobrecargas publicadas, mandar los siete nombres es lo que le saca a PostgREST la ambigüedad.
 */
export async function registrarDevolucionAction(entrada: z.input<typeof devolucionSchema>): Promise<Resultado<DevolucionRegistrada>> {
  const p = devolucionSchema.safeParse(entrada)
  if (!p.success) return { ok: false, error: p.error.issues[0].message }
  const m = validarMonto(p.data.monto)
  if (!m.ok) return { ok: false, error: m.error }
  const r = await rpc<{ devolucion: string; resto: number | string; cerrada: boolean }>('registrar_devolucion_efectivo', {
    p_entrega: p.data.entrega, p_monto: m.dato, p_recibida_por: p.data.recibidaPor,
    p_cerrar: p.data.cerrar, p_nota: null, p_fecha: null, p_firma_recibe: p.data.firmaRecibe,
  })
  if (!r.ok) return r
  return {
    ok: true,
    dato: {
      devolucion: r.dato.devolucion,
      resto: Number(r.dato.resto),
      cerrada: r.dato.cerrada === true,
      firmada: !!p.data.firmaRecibe,
    },
  }
}

/**
 * D06 — cerrar una entrega RENDIDA ENTERA (en su poder = 0). Migración 20260922T1700: la base la
 * rechaza si queda plata en su poder o un ticket todavía en camino.
 */
export async function cerrarEntregaAction(entrega: string): Promise<Resultado> {
  const p = uuid.safeParse(entrega)
  if (!p.success) return { ok: false, error: 'Entrega inválida' }
  return rpc<null>('cerrar_entrega_efectivo', { p_entrega: p.data })
}

const motivoSchema = z.object({ id: uuid, motivo: texto(400).min(1, 'Escribí el motivo') })

/** Un error de carga. Desde la 20260923T0100 anular también borra la devolución y descarta los tickets
 *  en camino; lo único que la base sigue negando es anular con un comprobante ya cargado en Compras. */
export async function anularEntregaAction(entrada: z.input<typeof motivoSchema>): Promise<Resultado> {
  const p = motivoSchema.safeParse(entrada)
  if (!p.success) return { ok: false, error: p.error.issues[0].message }
  return rpc<null>('anular_entrega_efectivo', { p_entrega: p.data.id, p_motivo: p.data.motivo })
}

/**
 * QUITAR UN ADELANTO DE SUELDO RENDIDO (20260925T1100). Saca de la celda «Pagado efectivo» lo que el canal le sumó
 * y devuelve el importe al saldo de la entrega. Lo decide la base: sólo quien liquida sueldos, sólo con la quincena
 * abierta. Es la puerta que deja anular una entrega que tuvo adelantos.
 */
export async function quitarAdelantoRendidoAction(entrada: { id: string; motivo: string }): Promise<Resultado<string>> {
  const p = z.object({ id: z.string().uuid('Falta el adelanto'), motivo: texto(400).min(1, 'Escribí el motivo') }).safeParse(entrada)
  if (!p.success) return { ok: false, error: p.error.issues[0].message }
  const r = await rpc<string>('quitar_adelanto_rendido', { p_rendicion: p.data.id, p_motivo: p.data.motivo })
  if (r.ok) revalidatePath('/administracion/personas')
  return r
}

/**
 * BORRAR UNA PRUEBA, ENTERA. Sólo si la entrega se declaró prueba al crearla: la base lo exige y acá no
 * se pregunta de nuevo, se deja que conteste ella (un permiso que se valida en dos lugares se
 * desincroniza en uno). Una entrega real no se borra nunca — se anula, y el rastro queda.
 */
export async function borrarEntregaDePruebaAction(entrada: { id: string }): Promise<Resultado<string>> {
  const p = z.object({ id: uuid }).safeParse(entrada)
  if (!p.success) return { ok: false, error: p.error.issues[0].message }
  return rpc<string>('borrar_entrega_de_prueba', { p_entrega: p.data.id })
}

/**
 * D03 · «Reclamar rendición» — SALE POR EL CANAL, no se queda en la app.
 *
 * La web no tiene el token del bot: `reclamar_rendicion_entrega` encola el pedido en
 * `efectivo_aviso` (migración 20260922T2800) y el orquestador de la VM lo publica en el canal
 * Efectivo. Por eso lo que devuelve esta acción es «encolado», nunca «avisado»: lo segundo lo dice
 * `enviado_en` + `mm_post_id`, que son la evidencia del post leído de vuelta en Mattermost.
 */
export async function reclamarRendicionAction(entrega: string): Promise<Resultado<string>> {
  const p = uuid.safeParse(entrega)
  if (!p.success) return { ok: false, error: 'Entrega inválida' }
  return rpc<string>('reclamar_rendicion_entrega', { p_entrega: p.data })
}

const faltaSchema = z.object({ id: uuid, falta: texto(400).min(1, 'Decí qué falta') })

/** D04/D05 — «Observar y pedir el dato»: queda observado con el motivo, y a la persona le llega el pedido. */
export async function observarComprobanteAction(entrada: z.input<typeof faltaSchema>): Promise<Resultado> {
  const p = faltaSchema.safeParse(entrada)
  if (!p.success) return { ok: false, error: p.error.issues[0].message }
  return rpc<null>('observar_comprobante_rendicion', { p_comprobante: p.data.id, p_falta: p.data.falta })
}

/** D04 — descartar un ticket que no rinde nada (repetido, ilegible sin arreglo). No toca Compras. */
export async function descartarComprobanteAction(entrada: z.input<typeof motivoSchema>): Promise<Resultado> {
  const p = motivoSchema.safeParse(entrada)
  if (!p.success) return { ok: false, error: p.error.issues[0].message }
  return rpc<null>('descartar_comprobante_rendicion', { p_comprobante: p.data.id, p_motivo: p.data.motivo })
}

const papelSchema = z.object({ entrega: uuid, ruta: z.string().min(3).max(300) })

/**
 * D03 · Papeles — la conformidad en papel: la foto ya subida al bucket, en la carpeta de quien la sube
 * (`<uid>/conformidad/…`, la policy `comprobantes_sube_administracion`). La firma con el dedo es del
 * teléfono de quien recibió y no se ofrece acá.
 */
export async function conformidadEnPapelAction(entrada: z.input<typeof papelSchema>): Promise<Resultado> {
  const p = papelSchema.safeParse(entrada)
  if (!p.success) return { ok: false, error: 'Falta el papel firmado.' }
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user || !p.data.ruta.startsWith(`${data.user.id}/conformidad/`)) {
    return { ok: false, error: 'El papel tiene que estar en tu carpeta.' }
  }
  return rpc<null>('firmar_conformidad_entrega', { p_entrega: p.data.entrega, p_trazo: null, p_papel_url: p.data.ruta })
}

const imputarSchema = z.object({ entrega: uuid, fila: z.number().int().min(4), clave: z.string().min(3).max(200) })

/**
 * «IMPUTAR UN COMPROBANTE YA CARGADO» (dueño, 24/09/2026): una compra cargada en Efectivo pasa a «A rendir»,
 * queda atada a la entrega y el saldo baja. La base (`imputar_compra_a_entrega`, migración 20260924T2300)
 * vuelve a verificar todo —la fila sigue siendo esa compra, dice «Efectivo», no está imputada a otra— y
 * encola la celda. Lo que devuelve es «encolado»: el ✓ en el Sheet lo dice la cola.
 */
export async function imputarCompraAction(entrada: z.input<typeof imputarSchema>): Promise<Resultado<{ codigo: string; fila: number }>> {
  const p = imputarSchema.safeParse(entrada)
  if (!p.success) return { ok: false, error: 'Elegí la compra que querés imputar.' }
  return rpc<{ codigo: string; fila: number }>('imputar_compra_a_entrega', { p_entrega: p.data.entrega, p_fila: p.data.fila, p_clave: p.data.clave })
}

/** Deshacer una imputación hecha a mano (o por las iniciales): vuelve el Tipo pago de antes por la misma cola. */
export async function desimputarCompraAction(rendicion: string): Promise<Resultado<string>> {
  const p = uuid.safeParse(rendicion)
  if (!p.success) return { ok: false, error: 'Imputación inválida' }
  return rpc<string>('desimputar_compra_de_entrega', { p_rendicion: p.data })
}
