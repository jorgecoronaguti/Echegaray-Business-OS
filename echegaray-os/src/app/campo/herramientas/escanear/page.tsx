import { leerParque } from '@/features/herramientas/services/datos'
import { MarcoTelefono } from '@/features/herramientas/components/campo/MarcoTelefono'
import { SinBaseTelefono } from '@/features/herramientas/components/campo/SinBaseTelefono'
import { Escaner } from '@/features/herramientas/components/campo/Escaner'
import { conLugar } from '@/features/herramientas/logica/lugar'

// M02 · ESCANEAR — en serie; BarcodeDetector o jsqr, y siempre el código tipeado.
export const dynamic = 'force-dynamic'

export default async function EscanearCampo({ searchParams }: { searchParams: Promise<{ en?: string }> }) {
  const { en } = await searchParams
  const volver = conLugar('/campo/herramientas', en)
  const lectura = await leerParque()
  if (lectura.estado !== 'ok') return <SinBaseTelefono lectura={lectura} volver={volver} />
  const catalogo = lectura.parque.activos.map((a) => ({ id: a.id, codigo: a.codigo, nombre: a.nombre, baja: a.estado === 'baja' }))
  return (
    <MarcoTelefono titulo="Escanear" volver={volver} oscuro>
      <Escaner catalogo={catalogo} en={en ?? null} />
    </MarcoTelefono>
  )
}
