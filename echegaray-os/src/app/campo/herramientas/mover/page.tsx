import { redirect } from 'next/navigation'
import { leerParque } from '@/features/herramientas/services/datos'
import { MarcoTelefono } from '@/features/herramientas/components/campo/MarcoTelefono'
import { SinBaseTelefono } from '@/features/herramientas/components/campo/SinBaseTelefono'
import { MoverTelefono } from '@/features/herramientas/components/campo/MoverTelefono'
import { conLugar } from '@/features/herramientas/logica/lugar'
import { advertencias, claveDestino, destinos, origenes } from '@/features/herramientas/logica/mover'
import { ETIQUETA_ESTADO, conProblema, rotuloUbicacion } from '@/features/herramientas/logica/parque'

// M06 · MOVER — `?ids=<uuid>,<uuid>`: lo que viene de M03 (uno), M05 (marcados) o M02 (escaneados).
export const dynamic = 'force-dynamic'

export default async function MoverCampo({ searchParams }: { searchParams: Promise<{ ids?: string; en?: string }> }) {
  const sp = await searchParams
  const pedidos = (sp.ids ?? '').split(',').map((x) => x.trim()).filter(Boolean)
  const volver = conLugar('/campo/herramientas', sp.en)
  if (!pedidos.length) redirect(volver)
  const lectura = await leerParque()
  if (lectura.estado !== 'ok') return <SinBaseTelefono lectura={lectura} volver={volver} />
  const p = lectura.parque
  const activos = pedidos.map((id) => p.activoPorId.get(id)).filter((a) => a && a.estado !== 'baja') as NonNullable<ReturnType<typeof p.activoPorId.get>>[]
  const w = advertencias(p, activos, null)
  const opciones = destinos(p, lectura.obras)
    // Un rodado no se ofrece como destino de sí mismo.
    .filter((o) => !(o.tipo === 'ubicacion' && o.grupo === 'rodado' && activos.some((a) => p.ubicaciones.find((u) => u.id === o.ubicacionId)?.activo_id === a.id)))
    .map((o) => ({ clave: claveDestino(o), rotulo: o.rotulo, grupo: o.grupo }))
  const volverA = activos.length === 1 ? conLugar(`/campo/herramientas/a/${encodeURIComponent(activos[0].codigo)}`, sp.en) : volver
  const titulo = activos.length === 1 ? `Mover ${activos[0].nombre}` : `Mover ${activos.length} herramientas`
  return (
    <MarcoTelefono titulo={titulo} volver={volverA}>
      {activos.length === 0 ? (
        <div style={{ fontSize: '14px' }}>Nada para mover: lo elegido no existe o está dado de baja.</div>
      ) : (
        <MoverTelefono
          ids={activos.map((a) => a.id)}
          desde={origenes(p, activos).map((g) => ({ rotulo: g.rotulo, cuenta: g.cuenta }))}
          nombres={activos.map((a) => ({ nombre: a.nombre, problema: conProblema(a) ? ETIQUETA_ESTADO[a.estado].toLowerCase() : null }))}
          opciones={opciones}
          cargas={w.rodadosConCarga.map((c) => ({ rodado: c.rodado.nombre, carga: c.carga }))}
          bajaCargaEn={w.rodadosConCarga.length === 1 ? rotuloUbicacion(p, w.rodadosConCarga[0].rodado.ubicacion_id) : null}
          volverA={volverA}
        />
      )}
    </MarcoTelefono>
  )
}
