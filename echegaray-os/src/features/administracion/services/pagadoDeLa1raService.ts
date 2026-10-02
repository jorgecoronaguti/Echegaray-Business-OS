// LO PAGADO EN LA 1ª QUINCENA A QUIEN COBRA POR MES, LEÍDO PARA SU 2ª (dueño, 02/10/2026).
//
// El mes del mensual se liquida una vez, en la 2ª quincena (`recibosDelEstudio.seLiquidaEnLa2da`). Lo que se le pagó
// en la 1ª —un adelanto anotado, el giro de su recibo— queda registrado en la línea de la 1ª y ahí se sigue viendo;
// para que la 2ª no lo vuelva a pedir, la 2ª lo lee acá y lo descuenta (`pagoDelMensual`). Sólo lectura.

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { CONCEPTO_DEL_GIRO, type FilaTarifa } from './liquidacionCuadros.ts'
import { mismoCuil } from './cuil.ts'
import { quincenaDe, type Quincena } from './quincena.ts'
import { modalidadDeCobroAl, pagadoDeLa1ra, type PagadoDeLa1ra } from './recibosDelEstudio.ts'

const Monto = z.coerce.number().finite().nullable().catch(null)
const LineaDeLa1ra = z.object({ persona_id: z.string(), pagado_banco: Monto, pagado_efectivo: Monto })
const Cabecera = z.object({ liquidacion_linea: z.array(z.unknown()).nullable().catch([]) })
const Giro = z.object({ cuil: z.string().nullable(), fecha: z.string(), importe: z.coerce.number().finite(), concepto: z.string() })

export interface PagadosDeLa1ra {
  porPersona: Map<string, PagadoDeLa1ra>
  error: { message: string } | null
}

const NADA: PagadosDeLa1ra = { porPersona: new Map(), error: null }

/**
 * En la 2ª quincena, para cada persona que cobra por mes TANTO en la 1ª como en la 2ª (tarifa vigente a cada una):
 * lo registrado en su línea de la 1ª y, si no hay registro por banco, lo girado en esa ventana. En la 1ª, nada.
 */
export async function leerPagadosDeLa1ra(
  supabase: SupabaseClient, q: Quincena,
  personas: readonly { id: string; cuil: string | null }[], tarifas: readonly FilaTarifa[],
): Promise<PagadosDeLa1ra> {
  if (Number(q.desde.slice(8, 10)) === 1) return NADA
  const q1 = quincenaDe(`${q.desde.slice(0, 8)}01`)
  const tarifasDe = (id: string) => tarifas.filter((t) => t.persona_id === id)
    .map((t) => ({ desde: String(t.desde).slice(0, 10), netoMensual: t.neto_mensual == null ? null : Number(t.neto_mensual) }))
  const mensuales = personas.filter((p) =>
    modalidadDeCobroAl(tarifasDe(p.id), q.hasta) === 'mensual' && modalidadDeCobroAl(tarifasDe(p.id), q1.hasta) === 'mensual')
  if (mensuales.length === 0) return NADA
  const [cab, giros] = await Promise.all([
    supabase.from('liquidacion_quincena').select('grupo, liquidacion_linea(persona_id, pagado_banco, pagado_efectivo)')
      .eq('desde', q1.desde).eq('hasta', q1.hasta),
    supabase.from('nomina_adelanto').select('cuil, fecha, importe, concepto').gte('fecha', q1.desde).lte('fecha', q1.hasta),
  ])
  // SIN LECTURA NO SE DESCUENTA NADA, Y SE DICE: la pantalla publica el error junto al saldo.
  if (cab.error || giros.error) return { porPersona: new Map(), error: cab.error ?? giros.error }
  const lineas = (cab.data ?? []).flatMap((c) => {
    const h = Cabecera.safeParse(c)
    return h.success ? (h.data.liquidacion_linea ?? []).flatMap((x) => { const l = LineaDeLa1ra.safeParse(x); return l.success ? [l.data] : [] }) : []
  })
  const girados = (giros.data ?? []).flatMap((x) => { const g = Giro.safeParse(x); return g.success ? [g.data] : [] })
    // El rango ya lo pidió la consulta; se repite acá porque es la regla, no un detalle de PostgREST.
    .filter((g) => g.concepto === CONCEPTO_DEL_GIRO.oficina && g.fecha >= q1.desde && g.fecha <= q1.hasta)
  const porPersona = new Map<string, PagadoDeLa1ra>()
  for (const p of mensuales) {
    const linea = lineas.find((l) => l.persona_id === p.id)
    const girado = p.cuil ? girados.filter((g) => mismoCuil(g.cuil, p.cuil)).reduce((a, g) => a + g.importe, 0) : 0
    const pagado = pagadoDeLa1ra({
      registradoBanco: linea?.pagado_banco ?? null, registradoEfectivo: linea?.pagado_efectivo ?? null, giradoEnLa1ra: girado,
    })
    if (pagado) porPersona.set(p.id, pagado)
  }
  return { porPersona, error: null }
}
