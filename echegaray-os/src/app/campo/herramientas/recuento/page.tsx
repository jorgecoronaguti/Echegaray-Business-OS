import Link from 'next/link'
import { redirect } from 'next/navigation'
import { leerParque } from '@/features/herramientas/services/datos'
import { MarcoTelefono } from '@/features/herramientas/components/campo/MarcoTelefono'
import { SinBaseTelefono } from '@/features/herramientas/components/campo/SinBaseTelefono'
import { RecuentoDelLugar } from '@/features/herramientas/components/RecuentoDelLugar'
import { V } from '@/features/herramientas/components/estilo'
import { ACCION } from '@/features/herramientas/logica/acciones-lugar'
import { conLugar, resolverLugar } from '@/features/herramientas/logica/lugar'
import { itemsDeRecuento, recuentoAbierto } from '@/features/herramientas/logica/recuento'

// M05 · RECUENTO DEL LUGAR («Control físico», etapa 2) — contar lo que hay acá contra lo que la base
// dice, y cerrar ajustando el inventario o guardando la evidencia. La misma pieza que el panel de
// escritorio (`PanelRecuento`).
export const dynamic = 'force-dynamic'

export default async function RecuentoCampo({ searchParams }: { searchParams: Promise<{ en?: string }> }) {
  const { en } = await searchParams
  if (!en) redirect('/campo/herramientas')
  const volver = conLugar('/campo/herramientas/lugar', en)
  const lectura = await leerParque()
  if (lectura.estado !== 'ok') return <SinBaseTelefono lectura={lectura} volver={volver} />
  const p = lectura.parque
  const lugar = resolverLugar(p, lectura.obras, en)
  if (!lugar) redirect('/campo/herramientas')
  if (!lugar.ubicacionId) {
    return (
      <MarcoTelefono titulo={ACCION.recuento} volver={volver}>
        <div style={{ fontSize: '14px', lineHeight: 1.5 }} data-testid="recuento-sin-lugar">
          Todavía no llegó nada a {lugar.rotulo}: no hay qué contar. <Link href={conLugar('/campo/herramientas/mover', lugar.clave)} prefetch={false} style={{ color: V.tinta, textDecoration: 'underline' }}>Mover algo acá</Link> primero.
        </div>
      </MarcoTelefono>
    )
  }
  return (
    <MarcoTelefono titulo={ACCION.recuento} volver={volver}>
      <RecuentoDelLugar
        ubicacionId={lugar.ubicacionId}
        rotulo={lugar.rotulo}
        items={itemsDeRecuento(p, lugar.ubicacionId)}
        sinBase={p.recuentos == null}
        abiertoDesde={recuentoAbierto(p.recuentos, lugar.ubicacionId)?.iniciado_en ?? null}
        variante="telefono"
        volverA={volver}
      />
    </MarcoTelefono>
  )
}
