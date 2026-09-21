import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { normalizarCodigo } from '@/features/herramientas/logica/codigo'
import { esTelefono } from '@/features/herramientas/logica/dispositivo'

// LA PUERTA DEL QR — `https://app.ecsas.com.ar/h/<CÓDIGO>` es lo que codifica cada etiqueta.
//
// Abierta con la cámara del teléfono cae en la ficha de campo (M03); desde una computadora, en la
// ficha del inventario (D02). Si el código no existe, la pantalla de destino lo dice y ofrece salidas
// (M12): nunca un error sin salida.
export const dynamic = 'force-dynamic'

export default async function PuertaQR({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params
  let crudo = codigo
  try { crudo = decodeURIComponent(codigo) } catch { /* se usa tal cual */ }
  const c = normalizarCodigo(crudo)
  if (!c) redirect('/herramientas')
  const ua = (await headers()).get('user-agent') ?? ''
  redirect(esTelefono(ua) ? `/campo/herramientas/a/${encodeURIComponent(c)}` : `/herramientas/inventario?clase=todo&activo=${encodeURIComponent(c)}`)
}
