import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { normalizarCodigo } from '@/features/herramientas/logica/codigo'
import { esTelefono } from '@/features/herramientas/logica/dispositivo'
import { createClient } from '@/lib/supabase/server'

// LA PUERTA DEL QR — `https://app.ecsas.com.ar/h/<CÓDIGO>` es lo que codifica cada etiqueta.
//
// Abierta con la cámara del teléfono cae en la ficha de campo (M03); desde una computadora, en la
// ficha del inventario (D02). Si el código no existe, la pantalla de destino lo dice y ofrece salidas
// (M12): nunca un error sin salida.
//
// Un código ANTERIOR (HER-0042 del primer esquema, o uno que se cambió después) sigue sirviendo: la
// etiqueta pegada no se tira. `activo_por_codigo` lo resuelve y se redirige al código de hoy.
export const dynamic = 'force-dynamic'

export default async function PuertaQR({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params
  let crudo = codigo
  try { crudo = decodeURIComponent(codigo) } catch { /* se usa tal cual */ }
  const leido = normalizarCodigo(crudo)
  if (!leido) redirect('/herramientas')
  const c = (await codigoVigente(leido)) ?? leido
  const ua = (await headers()).get('user-agent') ?? ''
  redirect(esTelefono(ua) ? `/campo/herramientas/a/${encodeURIComponent(c)}` : `/herramientas/inventario?clase=todo&activo=${encodeURIComponent(c)}`)
}

async function codigoVigente(codigo: string): Promise<string | null> {
  try {
    const supabase = await createClient()
    const { data: id, error } = await supabase.rpc('activo_por_codigo', { p_codigo: codigo })
    if (error || !id) return null
    const { data } = await supabase.from('activo').select('codigo').eq('id', id as string).maybeSingle()
    return (data as { codigo: string } | null)?.codigo ?? null
  } catch {
    return null
  }
}
