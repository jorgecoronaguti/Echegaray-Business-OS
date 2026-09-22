import { leerParque } from '@/features/herramientas/services/datos'
import { MarcoTelefono } from '@/features/herramientas/components/campo/MarcoTelefono'
import { SinBaseTelefono } from '@/features/herramientas/components/campo/SinBaseTelefono'
import { AltaTelefono } from '@/features/herramientas/components/campo/AltaTelefono'
import { normalizarCodigo } from '@/features/herramientas/logica/codigo'
import { conLugar, lugaresParaElegir, resolverLugar } from '@/features/herramientas/logica/lugar'

// M14 · ALTA RÁPIDA EN OBRA. `?codigo=` viene de un QR desconocido (M12); `?en=` es el lugar.
export const dynamic = 'force-dynamic'

export default async function AltaCampo({ searchParams }: { searchParams: Promise<{ codigo?: string; en?: string }> }) {
  const sp = await searchParams
  const volver = conLugar('/campo/herramientas', sp.en)
  const lectura = await leerParque()
  if (lectura.estado !== 'ok') return <SinBaseTelefono lectura={lectura} volver={volver} />
  const lugar = resolverLugar(lectura.parque, lectura.obras, sp.en)
  const lugares = lugaresParaElegir(lectura.parque, lectura.obras).map(({ clave, rotulo }) => ({ clave, rotulo }))
  return (
    <MarcoTelefono titulo="Nueva herramienta" volver={volver}>
      <AltaTelefono codigo={sp.codigo ? normalizarCodigo(sp.codigo) : null} lugares={lugares} lugarInicial={lugar?.clave ?? null} en={sp.en ?? null} />
    </MarcoTelefono>
  )
}
