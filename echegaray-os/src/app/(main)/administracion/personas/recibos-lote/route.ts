// GET /administracion/personas/recibos-lote?ids=<uuid>,<uuid>… — el PDF de un lote de recibos YA GUARDADOS.
//
// Lo llama la vista previa del lote después de guardar («Guardar y descargar PDF»). Lee `recibo_liquidacion` con
// el permiso de quien llama y dibuja esos renglones (`recibosLotePdf.ts`): el archivo es lo que quedó en el
// legajo, en el orden en que se pidió. Sólo Dirección y Administración; a cualquier otro, 404.

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getPerfilActual } from '@/features/auth/services/authService'
import { liquidaSueldos } from '@/shared/auth/areas'
import { pdfDeRecibos, type ReciboParaElPdf } from '@/features/administracion/services/recibosLotePdf'
import type { RenglonesSellados } from '@/features/administracion/services/reciboEmitido'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const Ids = z.array(z.string().uuid()).min(1).max(80)

export async function GET(req: Request) {
  const supabase = await createClient()
  const rol = (await getPerfilActual(supabase)).data?.rol
  if (!liquidaSueldos(rol)) return new Response('Not found', { status: 404 })

  const ids = Ids.safeParse((new URL(req.url).searchParams.get('ids') ?? '').split(',').filter(Boolean))
  if (!ids.success) return Response.json({ error: 'ids inválidos' }, { status: 400 })

  const { data, error } = await supabase
    .from('recibo_liquidacion')
    .select('id, codigo, nombre, categoria, quincena_desde, quincena_hasta, total, renglones')
    .in('id', ids.data)
    // Un reemplazado no se entrega en un PDF: cae en «no encontré» como si no estuviera, que es lo que vale.
    .neq('estado', 'reemplazado')
  if (error) return Response.json({ error: `No pude leer los recibos: ${error.message}` }, { status: 500 })
  const porId = new Map((data ?? []).map((f) => [f.id as string, f]))
  // EN EL ORDEN PEDIDO (el de la grilla). Si falta uno no se entrega un PDF incompleto que parezca entero.
  const faltan = ids.data.filter((id) => !porId.has(id))
  if (faltan.length > 0) return Response.json({ error: `No encontré ${faltan.length} de los recibos pedidos` }, { status: 404 })

  const recibos: ReciboParaElPdf[] = ids.data.map((id) => {
    const f = porId.get(id)!
    return {
      nombre: f.nombre ?? '', categoria: f.categoria ?? null,
      quincenaDesde: f.quincena_desde, quincenaHasta: f.quincena_hasta,
      total: f.total == null ? null : Number(f.total),
      renglones: (f.renglones ?? { horas: [], medios: [] }) as RenglonesSellados,
      codigo: typeof f.codigo === 'string' ? f.codigo : null,
    }
  })
  const q = recibos[0]
  const nombre = `Recibos-${q.quincenaDesde}-al-${q.quincenaHasta}-${recibos.length}.pdf`
  const cuerpo = await pdfDeRecibos(recibos, `Recibos ${q.quincenaDesde} al ${q.quincenaHasta}`)
  return new Response(cuerpo as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${nombre}"`,
      'Cache-Control': 'no-store',
    },
  })
}
