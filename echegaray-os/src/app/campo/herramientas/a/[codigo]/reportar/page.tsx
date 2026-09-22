import { leerParque } from '@/features/herramientas/services/datos'
import { MarcoTelefono } from '@/features/herramientas/components/campo/MarcoTelefono'
import { SinBaseTelefono } from '@/features/herramientas/components/campo/SinBaseTelefono'
import { CodigoDesconocido } from '@/features/herramientas/components/campo/CodigoDesconocido'
import { ReportarTelefono } from '@/features/herramientas/components/campo/ReportarTelefono'
import { normalizarCodigo } from '@/features/herramientas/logica/codigo'
import { conLugar } from '@/features/herramientas/logica/lugar'

// M07 · REPORTAR UN PROBLEMA.
export const dynamic = 'force-dynamic'

export default async function ReportarCampo({ params, searchParams }: { params: Promise<{ codigo: string }>; searchParams: Promise<{ en?: string }> }) {
  const [{ codigo }, { en }] = await Promise.all([params, searchParams])
  let crudo = codigo
  try { crudo = decodeURIComponent(codigo) } catch { /* tal cual */ }
  const c = normalizarCodigo(crudo) ?? crudo
  const ficha = conLugar(`/campo/herramientas/a/${encodeURIComponent(c)}`, en)
  const lectura = await leerParque()
  if (lectura.estado !== 'ok') return <SinBaseTelefono lectura={lectura} volver={ficha} />
  const a = lectura.parque.activos.find((x) => x.codigo === c)
  if (!a) return <CodigoDesconocido codigo={c} en={en ?? null} />
  return (
    <MarcoTelefono titulo="Reportar" volver={ficha}>
      {a.estado === 'baja'
        ? <div style={{ fontSize: '14px' }}>{a.nombre} está dado de baja: no admite reportes nuevos.</div>
        : <ReportarTelefono activo={a.id} nombre={a.nombre} volverA={ficha} />}
    </MarcoTelefono>
  )
}
