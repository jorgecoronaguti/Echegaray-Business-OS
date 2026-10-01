// EL RECIBO FIRMADO DE UN GASTO MANUAL DE EFECTIVO — `/administracion/compras/recibo-efectivo/<rendición>`.
//
// Es el PDF de lo que el proveedor firmó en la pantalla (01/10/2026: «algo digital como la firma de
// conformidad», no un papel para imprimir). SIN FIRMA NO HAY PDF: 404 con la frase de por qué.
//
// El permiso se decide ACÁ, en el servidor, con la sesión de quien pide (no alcanza con ocultar el botón):
//   1. la misma puerta que la ficha: `esAdministracion`;
//   2. la misma cerradura: la RLS de `efectivo_recibo_firma` («quien ve la entrega»). Si la sesión no ve la
//      firma, la lectura vuelve vacía y la respuesta es 404, igual que una que no existe.
// El documento sale de la FOTO que la firma guardó (monto, fecha, concepto, proveedor), no de la rendición
// viva: si después se edita el gasto, lo firmado no cambia. De la entrega sólo se leen la obra y quien pagó.

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getPerfilActual } from '@/features/auth/services/authService'
import { esAdministracion } from '@/features/auth/types/areas'
import { armarRecibo } from '@/features/efectivo/logica/recibo'
import { pdfDeReciboFirmado } from '@/features/efectivo/services/reciboPdf'
import { leerObraDelGasto, leerReciboFirmado } from '@/features/efectivo/services/reciboDatos'
import { COLUMNAS_ENTREGA, type Entrega } from '@/features/efectivo/types'
import { codigosDeObra } from '@/shared/services/codigosDeObra'
import { nombresDePersonas } from '@/shared/personas/nombresDePersonas'

export const dynamic = 'force-dynamic'

const noHay = (t = 'No encontrado') => new Response(t, { status: 404 })

export async function GET(_req: Request, { params }: { params: Promise<{ rendicion: string }> }) {
  const { rendicion: id } = await params
  if (!z.string().uuid().safeParse(id).success) return noHay()
  const supabase = await createClient()
  const { data: usuario } = await supabase.auth.getUser()
  if (!usuario?.user) return noHay()
  const perfil = await getPerfilActual(supabase)
  if (!esAdministracion(perfil.data?.rol ?? null)) return new Response('Sin permiso', { status: 403 })

  const firma = await leerReciboFirmado(supabase, id)
  if (!firma) return noHay('Este gasto todavía no tiene el recibo firmado')
  const { data: en } = await supabase.from('efectivo_entrega_saldo').select(COLUMNAS_ENTREGA).eq('id', firma.entrega_id).maybeSingle()
  const entrega = en as unknown as Entrega | null
  if (!entrega) return noHay()

  const [codigos, nombres, gasto] = await Promise.all([
    codigosDeObra(supabase, [entrega.obra_id]), nombresDePersonas(supabase, [entrega.persona_id]), leerObraDelGasto(supabase, id),
  ])
  const recibo = armarRecibo({
    rendicion: { monto: firma.monto, fecha: firma.fecha, imputada_en: firma.firmado_en, concepto: firma.concepto, proveedor: firma.proveedor },
    entrega, gasto,
    codigoObra: entrega.obra_id ? codigos.get(entrega.obra_id) ?? null : null,
    pagador: nombres.get(entrega.persona_id) ?? entrega.persona,
  })
  if (!recibo) return new Response('El recibo firmado no tiene un importe válido', { status: 422 })

  let bytes: Uint8Array
  try {
    bytes = await pdfDeReciboFirmado(recibo, firma)
  } catch (err) {
    return new Response(err instanceof Error ? err.message : 'No se pudo armar el recibo', { status: 422 })
  }
  return new Response(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Length': String(bytes.length),
      'Content-Disposition': `inline; filename="recibo-${entrega.codigo}-${id.slice(0, 8)}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
