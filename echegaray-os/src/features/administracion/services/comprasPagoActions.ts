'use server'

// MARCAR UN PAGO DE UNA FILA DE COMPRAS DESDE LA APP — por la ÚNICA puerta: `compra_pago_registrar`.
//
// ═══ LA ARITMÉTICA NO SE ESCRIBE ACÁ, Y TAMPOCO EN LA BASE ═══
//
// La cuenta de los dos tramos de pago y el estado que la planilla calcula sola
// (`IF(ABS(T+W-O)<1;"Pagado";…)`) viven UNA vez, en `orquestador/lib/pagos-de-compra.mjs`, que es el
// núcleo puro con tests. Esta acción lo ejecuta; la base verifica los INVARIANTES que ese mismo
// código no puede verificar sobre sí mismo (que no se pague más que el total, que el rótulo sea de
// entrada, que la fila no haya cambiado desde que la pantalla la miró). Reescribir la cuenta en
// TypeScript o en plpgsql sería una segunda definición del mismo concepto.
//
// ═══ LO QUE ESTA ACCIÓN NO PROMETE ═══
//
// Que la celda del Sheet ya lo diga. Queda guardado en el OS y ENCOLADO; el worker
// (`compras-obra-cola.mjs`) relee la fila, prueba que sigue siendo la misma compra, escribe las
// celdas en un solo batch y las relee. La pantalla dice «pendiente de Sheet» hasta que eso ocurre.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import {
  planDePago, planDeDeshacerCompleto,
} from '../../../../orquestador/lib/pagos-de-compra.mjs'

const RUTA = '/administracion/compras'
/** Los seis del desplegable estricto de «Tipo pago» (`carga-comprobantes.mjs · TIPOS_PAGO`). */
export const MEDIOS_DE_PAGO = ['Efectivo', 'Transferencia', 'Débito', 'Tarjeta Crédito', 'Echeq', 'Cheque'] as const

export type ResultadoPago = { ok: true; pendiente: true; cambioId: string | null } | { ok: false; error: string }

const ISO = /^\d{4}-\d{2}-\d{2}$/

const Pedido = z.object({
  fila: z.number().int().min(4),
  tipo: z.enum(['total', 'parcial']),
  // En un pago total el monto lo pone el saldo: pedirlo sería dejar que la pantalla decida cuánto falta.
  monto: z.number().positive().max(1_000_000_000).nullish(),
  fecha: z.string().regex(ISO, 'la fecha del pago tiene que ser un día'),
  fechaResto: z.string().regex(ISO).nullish(),
  medio: z.enum(MEDIOS_DE_PAGO).nullish(),
  proveedorId: z.string().uuid().nullish(),
})

/** Los campos de pago de la fila. Es lo que se lee, lo que se proyecta y lo que se compara. */
const CAMPOS = 'fila, clave, total, monto_pagado, monto_parcial_1, monto_parcial_2, '
  + 'pago_total_o_parcial, tipo_pago, estado, estado_pago, fecha_prevista, fecha_prevista_2, '
  + 'saldo_pendiente, anulada'

interface FilaDePago {
  fila: number; clave: string | null; total: number | null; monto_pagado: number | null
  monto_parcial_1: number | null; monto_parcial_2: number | null
  pago_total_o_parcial: string | null; tipo_pago: string | null; estado: string | null
  estado_pago: string | null; fecha_prevista: string | null; fecha_prevista_2: string | null
  saldo_pendiente: number | null; anulada: boolean
}

/** Lo que la pantalla dijo haber visto, para el control optimista de la base. */
const esperadoDe = (f: FilaDePago) => ({
  monto_pagado: f.monto_pagado ?? 0,
  monto_parcial_2: f.monto_parcial_2 ?? 0,
  monto_parcial_1: f.monto_parcial_1 ?? 0,
  pago_total_o_parcial: f.pago_total_o_parcial ?? '',
  tipo_pago: f.tipo_pago ?? null,
  estado: f.estado ?? '',
  estado_pago: f.estado_pago ?? null,
  fecha_prevista_2: f.fecha_prevista_2 ?? null,
  saldo_pendiente: f.saldo_pendiente ?? null,
})

/** ¿La base todavía no tiene la RPC? PostgREST responde PGRST202 cuando la función no existe. */
const faltaLaRpc = (e: { code?: string; message?: string }, nombre: string) =>
  e.code === 'PGRST202' || new RegExp(nombre).test(e.message ?? '')

const hoyISO = () => new Date().toISOString().slice(0, 10)

/** Refresca las dos pantallas donde se ve la MISMA fila. Sin esto, una muestra lo viejo bajo su ✓. */
function refrescar(proveedorId?: string | null) {
  revalidatePath(RUTA)
  revalidatePath('/administracion/proveedores')
  if (proveedorId) revalidatePath(`/administracion/proveedores/${proveedorId}`)
}

/**
 * REGISTRAR UN PAGO —total o parcial— DE UNA FILA DE COMPRAS.
 *
 * La fila se lee ACÁ y no llega por parámetro: los importes con los que se hace la cuenta tienen que
 * salir de la base, no de lo que mande el navegador. Lo que sí llega de la pantalla es `esperado`,
 * que se arma con esa misma lectura y sirve para que la RPC rechace el pedido si el sync trajo un
 * cambio del Sheet en el medio.
 */
export async function registrarPagoDeCompra(p: z.input<typeof Pedido>): Promise<ResultadoPago> {
  const v = Pedido.safeParse(p)
  if (!v.success) return { ok: false, error: v.error.issues[0]?.message ?? 'Pedido inválido.' }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('compra_sheet').select(CAMPOS).eq('fila', v.data.fila).maybeSingle()
  if (error) return { ok: false, error: 'No pude leer esa compra. No se guardó nada.' }
  if (!data) return { ok: false, error: 'Esa fila ya no está en Compras.' }
  const compra = data as unknown as FilaDePago

  const plan = planDePago({
    compra,
    accion: { tipo: v.data.tipo, monto: v.data.monto ?? undefined, fecha: v.data.fecha, fechaResto: v.data.fechaResto ?? undefined, medio: v.data.medio ?? null },
    hoy: hoyISO(),
  }) as { error?: string; celdas?: unknown[]; proyeccion?: unknown }
  if (plan.error || !plan.celdas) return { ok: false, error: plan.error ?? 'No pude armar el pago.' }

  return await encolar(supabase, v.data.tipo, v.data.fila, plan, esperadoDe(compra), v.data.proveedorId)
}

/** El pedido a la base, con la traducción de errores. Es el mismo para pagar y para deshacer. */
async function encolar(
  supabase: Awaited<ReturnType<typeof createClient>>,
  accion: string, fila: number,
  plan: { celdas?: unknown[]; proyeccion?: unknown },
  esperado: unknown, proveedorId?: string | null,
): Promise<ResultadoPago> {
  const { data, error } = await supabase.rpc('compra_pago_registrar', {
    p_fila: fila, p_accion: accion, p_celdas: plan.celdas, p_proyeccion: plan.proyeccion, p_esperado: esperado,
  })
  if (error) {
    return {
      ok: false,
      error: faltaLaRpc(error, 'compra_pago_registrar')
        ? 'La base todavía no sabe registrar pagos (migración 20260916T1700 sin aplicar). No se guardó nada.'
        : 'No pude registrar el pago. No se guardó nada.',
    }
  }
  const r = data as { ok?: boolean; error?: string; cambio_id?: string } | null
  if (!r?.ok) return { ok: false, error: r?.error ?? 'La base rechazó el pago.' }
  refrescar(proveedorId)
  return { ok: true, pendiente: true, cambioId: r.cambio_id ?? null }
}

const Deshacer = z.object({ fila: z.number().int().min(4), proveedorId: z.string().uuid().nullish() })

/**
 * DESHACER EL ÚLTIMO PAGO DE LA FILA.
 *
 * Son dos situaciones distintas y sólo una necesita tocar el Sheet:
 *   · el pago todavía está en cola → no hay nada que revertir allá: se cancela el pedido y la réplica
 *     vuelve a `previo` (`compra_pago_cancelar`);
 *   · el pago ya se aplicó → se encola el plan INVERSO, armado con las mismas celdas que se
 *     escribieron. Las que antes estaban vacías no se pueden devolver desde un worker (`no-borrar`
 *     revierte toda escritura vacía sobre una celda con contenido) y eso se DICE, no se calla.
 */
export async function deshacerPagoDeCompra(p: z.input<typeof Deshacer>): Promise<ResultadoPago & { aviso?: string }> {
  const v = Deshacer.safeParse(p)
  if (!v.success) return { ok: false, error: 'Pedido inválido.' }
  const supabase = await createClient()

  const cola = await supabase
    .from('compra_obra_cambio')
    .select('id, estado, celdas')
    .eq('fila', v.data.fila).eq('tipo', 'pago')
    .in('estado', ['pendiente', 'procesando', 'aplicado'])
    .order('creado_at', { ascending: false }).limit(1).maybeSingle()
  if (cola.error) return { ok: false, error: 'No pude leer el pago de esa fila.' }
  const ultimo = cola.data as { id: string; estado: string; celdas: unknown[] } | null
  if (!ultimo) return { ok: false, error: 'Esa compra no tiene ningún pago registrado desde la app.' }

  if (ultimo.estado === 'pendiente') {
    const { data, error } = await supabase.rpc('compra_pago_cancelar', { p_fila: v.data.fila })
    if (error) return { ok: false, error: 'No pude cancelar el pago.' }
    const r = data as { ok?: boolean; error?: string } | null
    if (!r?.ok) return { ok: false, error: r?.error ?? 'La base rechazó la cancelación.' }
    refrescar(v.data.proveedorId)
    return { ok: true, pendiente: true, cambioId: null }
  }
  if (ultimo.estado === 'procesando') {
    return { ok: false, error: 'El worker está escribiendo ese pago en el Sheet justo ahora. Probá de nuevo en un minuto.' }
  }

  const { data, error } = await supabase
    .from('compra_sheet').select(CAMPOS).eq('fila', v.data.fila).maybeSingle()
  if (error || !data) return { ok: false, error: 'No pude leer esa compra.' }
  const compra = data as unknown as FilaDePago
  const plan = planDeDeshacerCompleto({ compra, celdas: ultimo.celdas, hoy: hoyISO() }) as {
    error?: string; celdas?: unknown[]; proyeccion?: unknown; sinDeshacer?: { rotulo: string }[]
  }
  if (plan.error || !plan.celdas) return { ok: false, error: plan.error ?? 'No pude deshacer ese pago.' }

  const r = await encolar(supabase, 'deshacer', v.data.fila, plan, esperadoDe(compra), v.data.proveedorId)
  if (!r.ok) return r
  const sin = plan.sinDeshacer ?? []
  return sin.length
    ? { ...r, aviso: `No se puede vaciar desde acá: ${sin.map((s) => `«${s.rotulo}»`).join(' · ')}. Se borra a mano en el Sheet.` }
    : r
}
