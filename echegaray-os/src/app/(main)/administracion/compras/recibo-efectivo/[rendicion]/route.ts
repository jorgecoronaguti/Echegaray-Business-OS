// «RECIBO PARA FIRMAR» de una rendición manual de Efectivo — `/administracion/compras/recibo-efectivo/<rendición>`.
//
// El permiso se decide ACÁ, en el servidor, con la sesión de quien pide (no alcanza con ocultar el botón):
//   1. la misma puerta que la ficha: `esAdministracion`;
//   2. la misma cerradura: la RLS de `efectivo_rendicion` y de `efectivo_entrega_saldo`. Si la sesión no ve la
//      rendición o su entrega, la lectura vuelve vacía y la respuesta es 404, igual que una que no existe.
// Sólo rendiciones MANUALES: un ticket ya tiene su comprobante y no se firma un recibo por él.

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getPerfilActual } from '@/features/auth/services/authService'
import { esAdministracion } from '@/features/auth/types/areas'
import { armarRecibo } from '@/features/efectivo/logica/recibo'
import { pdfDeRecibo } from '@/features/efectivo/services/reciboPdf'
import { COLUMNAS_ENTREGA, COLUMNAS_RENDICION, type Entrega, type Rendicion } from '@/features/efectivo/types'
import { codigosDeObra } from '@/shared/services/codigosDeObra'
import { nombresDePersonas } from '@/shared/personas/nombresDePersonas'

export const dynamic = 'force-dynamic'

const noHay = () => new Response('No encontrado', { status: 404 })

export async function GET(_req: Request, { params }: { params: Promise<{ rendicion: string }> }) {
  const { rendicion: id } = await params
  if (!z.string().uuid().safeParse(id).success) return noHay()
  const supabase = await createClient()
  const { data: usuario } = await supabase.auth.getUser()
  if (!usuario?.user) return noHay()
  const perfil = await getPerfilActual(supabase)
  if (!esAdministracion(perfil.data?.rol ?? null)) return new Response('Sin permiso', { status: 403 })

  const { data: r } = await supabase.from('efectivo_rendicion').select(COLUMNAS_RENDICION).eq('id', id).maybeSingle()
  const rendicion = r as unknown as Rendicion | null
  if (!rendicion || rendicion.origen !== 'manual') return noHay()
  const { data: en } = await supabase.from('efectivo_entrega_saldo').select(COLUMNAS_ENTREGA).eq('id', rendicion.entrega_id).maybeSingle()
  const entrega = en as unknown as Entrega | null
  if (!entrega) return noHay()

  const [codigos, nombres] = await Promise.all([
    codigosDeObra(supabase, [entrega.obra_id]), nombresDePersonas(supabase, [entrega.persona_id]),
  ])
  const recibo = armarRecibo({
    rendicion, entrega,
    codigoObra: entrega.obra_id ? codigos.get(entrega.obra_id) ?? null : null,
    pagador: nombres.get(entrega.persona_id) ?? entrega.persona,
  })
  if (!recibo) return new Response('El gasto no tiene un importe válido para un recibo', { status: 422 })

  const bytes = await pdfDeRecibo(recibo)
  return new Response(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Length': String(bytes.length),
      'Content-Disposition': `inline; filename="recibo-${entrega.codigo}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
