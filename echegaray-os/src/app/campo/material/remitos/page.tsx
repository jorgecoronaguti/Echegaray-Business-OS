import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUsuarioActual } from '@/features/auth/services/authService'
import { Aviso } from '@/shared/components/ds'
import { ListaRemitos } from '@/features/materiales/components/ListaRemitos'
import { HREF_MATERIAL_TELEFONO } from '@/features/materiales/logica/pedidos'
import { MIGRACION_STOCK, leerStock } from '@/features/materiales/services/stockService'
import { MarcoCampo } from '../../marco'

// REMITOS · TELÉFONO — los que se emitieron en mis obras. Cada fila abre su remito.

export const dynamic = 'force-dynamic'

export default async function RemitosCampoPage() {
  const supabase = await createClient()
  const user = await getUsuarioActual(supabase)
  if (!user) redirect('/login')
  const stock = await leerStock(supabase)
  const volver = (
    <Link href={HREF_MATERIAL_TELEFONO} data-testid="volver" className="-ml-1 inline-flex min-h-[44px] items-center px-1 text-[12px] text-muted hover:text-ink">← Material</Link>
  )
  return (
    <MarcoCampo titulo="Remitos" volver={volver}>
      {stock.estado === 'falta_migracion' && (
        <Aviso tono="warn" titulo="Todavía no hay remitos." testid="falta-migracion-stock">Falta la migración {MIGRACION_STOCK}.</Aviso>
      )}
      {stock.estado === 'error' && <Aviso tono="neg" titulo="No se pudieron leer los remitos." testid="stock-error">{stock.mensaje}</Aviso>}
      {stock.estado === 'ok' && <ListaRemitos remitos={stock.remitos} cara="telefono" />}
    </MarcoCampo>
  )
}
