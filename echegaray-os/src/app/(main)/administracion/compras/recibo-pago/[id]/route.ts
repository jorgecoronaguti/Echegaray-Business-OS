// EL RECIBO DE PAGO EN EFECTIVO A UN TERCERO, PARA IMPRIMIR — `/administracion/compras/recibo-pago/<id>`.
//
// Una copia por defecto; `?duplicado=1` = original y duplicado en una hoja A4 (dueño, 02/10/2026: «no quiero
// duplicado, dame la opción»). Para que quien cobra firme en papel. Sirve igual
// para la primera impresión y para «Volver a imprimir»: el PDF sale de la FOTO guardada en
// `recibo_pago_efectivo`, nunca del formulario, así que dos impresiones del mismo número dicen lo mismo.
//
// El permiso se decide acá con la sesión de quien pide: la puerta (`veEconomia`, la de quien emite) y la
// cerradura (la RLS de la tabla). Si la sesión no lo ve, 404, igual que uno que no existe.

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getPerfilActual } from '@/features/auth/services/authService'
import { veEconomia } from '@/features/auth/types/areas'
import { pdfDeReciboPago } from '@/features/efectivo/services/reciboPagoPdf'
import { MIGRACION_RECIBO_PAGO, leerReciboEmitido } from '@/features/efectivo/services/reciboPagoDatos'

export const dynamic = 'force-dynamic'

const noHay = (t = 'No encontrado') => new Response(t, { status: 404 })

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) return noHay()
  const supabase = await createClient()
  const { data: usuario } = await supabase.auth.getUser()
  if (!usuario?.user) return noHay()
  const perfil = await getPerfilActual(supabase)
  if (!veEconomia(perfil.data?.rol ?? null)) return new Response('Sin permiso', { status: 403 })

  const r = await leerReciboEmitido(supabase, id)
  if (r === 'falta_migracion') {
    return new Response(`El recibo de pago todavía no está publicado en la base (migración ${MIGRACION_RECIBO_PAGO}).`, { status: 503 })
  }
  if (!r) return noHay('Ese recibo no existe')

  let bytes: Uint8Array
  try {
    bytes = await pdfDeReciboPago(r, { duplicado: new URL(req.url).searchParams.get('duplicado') === '1' })
  } catch (err) {
    return new Response(err instanceof Error ? err.message : 'No se pudo armar el recibo', { status: 422 })
  }
  return new Response(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Length': String(bytes.length),
      'Content-Disposition': `inline; filename="recibo-${r.codigo}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
