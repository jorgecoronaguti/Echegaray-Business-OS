import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUsuarioActual } from '@/features/auth/services/authService'
import { Aviso } from '@/shared/components/ds'
import { RemitoImprimible } from '@/features/materiales/components/RemitoImprimible'
import { numeroRemito } from '@/features/materiales/logica/stock'
import { leerStock } from '@/features/materiales/services/stockService'
import { MarcoCampo } from '../../../marco'

// UN REMITO · TELÉFONO — se lee de la base (la copia guardada al emitir) y se imprime o guarda como PDF.
// Un remito que la policy no deja ver es igual a uno que no existe: 404, no «sin permiso».

export const dynamic = 'force-dynamic'

export default async function RemitoCampoPage({ params }: { params: Promise<{ remito: string }> }) {
  const supabase = await createClient()
  const user = await getUsuarioActual(supabase)
  if (!user) redirect('/login')
  const { remito: id } = await params
  const stock = await leerStock(supabase)
  const volver = (
    <Link href="/campo/material/remitos" data-testid="volver" className="-ml-1 inline-flex min-h-[44px] items-center px-1 text-[12px] text-muted hover:text-ink">← Remitos</Link>
  )
  if (stock.estado === 'error') {
    return (
      <MarcoCampo titulo="Remito" volver={volver}>
        <Aviso tono="neg" titulo="No se pudo leer el remito." testid="stock-error">{stock.mensaje}</Aviso>
      </MarcoCampo>
    )
  }
  const remito = stock.estado === 'ok' ? stock.remitos.find((r) => r.id === id) : undefined
  if (!remito) notFound()
  return (
    <MarcoCampo titulo={`Remito ${numeroRemito(remito.numero)}`} subtitulo={`${remito.origen_rotulo} → ${remito.destino_rotulo}`} volver={volver}>
      <RemitoImprimible remito={remito} />
    </MarcoCampo>
  )
}
