// VARIOS RECIBOS DE PAGO EN EFECTIVO EN UNA SOLA IMPRESIÓN — `/administracion/compras/recibo-pago/lote?ids=a,b,c`.
//
// Los recibos por la diferencia salen en lote desde Liquidación (dueño, 02/10/2026): una hoja A4 por recibo, cada
// una con original y duplicado, todas en un PDF. Misma puerta (`veEconomia`) y misma cerradura (RLS) que la ruta de
// a uno; las hojas salen de la foto guardada, en el orden del número.

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getPerfilActual } from '@/features/auth/services/authService'
import { veEconomia } from '@/features/auth/types/areas'
import { pdfDeRecibosPago } from '@/features/efectivo/services/reciboPagoPdf'
import { MIGRACION_RECIBO_PAGO, leerRecibosParaImprimir } from '@/features/efectivo/services/reciboPagoDatos'

export const dynamic = 'force-dynamic'

const idsSchema = z.array(z.string().uuid()).min(1).max(100)

export async function GET(req: Request) {
  const crudo = new URL(req.url).searchParams.get('ids') ?? ''
  const ids = idsSchema.safeParse([...new Set(crudo.split(',').map((x) => x.trim()).filter(Boolean))])
  if (!ids.success) return new Response('No encontrado', { status: 404 })
  const supabase = await createClient()
  const { data: usuario } = await supabase.auth.getUser()
  if (!usuario?.user) return new Response('No encontrado', { status: 404 })
  const perfil = await getPerfilActual(supabase)
  if (!veEconomia(perfil.data?.rol ?? null)) return new Response('Sin permiso', { status: 403 })

  let bytes: Uint8Array
  try {
    const rs = await leerRecibosParaImprimir(supabase, ids.data)
    if (rs === 'falta_migracion') {
      return new Response(`El recibo de pago todavía no está publicado en la base (migración ${MIGRACION_RECIBO_PAGO}).`, { status: 503 })
    }
    // UNO QUE NO APARECE NO SE SALTEA CALLADO: el lote es lo que se va a firmar, y una hoja de menos se notaría tarde.
    if (rs.length !== ids.data.length) return new Response(`Encontré ${rs.length} de ${ids.data.length} recibos.`, { status: 404 })
    bytes = await pdfDeRecibosPago(rs)
  } catch (err) {
    return new Response(err instanceof Error ? err.message : 'No se pudieron armar los recibos', { status: 422 })
  }
  return new Response(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Length': String(bytes.length),
      'Content-Disposition': `inline; filename="recibos-${ids.data.length}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
