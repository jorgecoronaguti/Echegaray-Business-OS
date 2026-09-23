import { leerParque } from '@/features/herramientas/services/datos'
import { MarcoTelefono } from '@/features/herramientas/components/campo/MarcoTelefono'
import { SinBaseTelefono } from '@/features/herramientas/components/campo/SinBaseTelefono'
import { CodigoDesconocido } from '@/features/herramientas/components/campo/CodigoDesconocido'
import { RevisionTelefono } from '@/features/herramientas/components/campo/RevisionTelefono'
import { normalizarCodigo } from '@/features/herramientas/logica/codigo'
import { conLugar } from '@/features/herramientas/logica/lugar'
import { historialDe, MIGRACION_REVISION, seRevisa, vigenteDe, TIPOS_POR_CLASE } from '@/features/herramientas/logica/revision'

// LA FICHA DE REVISIÓN EN EL TELÉFONO — RTO, service, seguro, inspección de un rodado o máquina (23/09).
// Se llega desde la ficha (M03). El mismo formulario que Mantenimiento, con campos grandes.
export const dynamic = 'force-dynamic'

export default async function RevisionCampo({ params, searchParams }: { params: Promise<{ codigo: string }>; searchParams: Promise<{ en?: string }> }) {
  const [{ codigo }, { en }] = await Promise.all([params, searchParams])
  let crudo = codigo
  try { crudo = decodeURIComponent(codigo) } catch { /* tal cual */ }
  const c = normalizarCodigo(crudo) ?? crudo
  const ficha = conLugar(`/campo/herramientas/a/${encodeURIComponent(c)}`, en)
  const lectura = await leerParque()
  if (lectura.estado !== 'ok') return <SinBaseTelefono lectura={lectura} volver={ficha} />
  const p = lectura.parque
  const a = p.activos.find((x) => x.codigo === c)
  if (!a) return <CodigoDesconocido codigo={c} en={en ?? null} />
  const titulo = a.patente && !a.nombre.includes(a.patente) ? `${a.nombre} ${a.patente}` : a.nombre

  const aviso = (texto: string) => (
    <MarcoTelefono titulo={titulo} volver={ficha}>
      <div style={{ fontSize: '14px', lineHeight: 1.5 }} data-testid="no-se-revisa">{texto}</div>
    </MarcoTelefono>
  )
  if (a.estado === 'baja') return aviso(`${a.nombre} está dado de baja: no se le cargan revisiones.`)
  if (!seRevisa(a)) return aviso('La ficha de revisión es para rodados y máquinas, no para herramientas de mano.')
  if (p.revisionesVigentes == null) {
    return aviso(`Falta aplicar la migración ${MIGRACION_REVISION} de la ficha de revisión: todavía no se puede cargar. El resto del módulo anda igual.`)
  }
  const vigentes = TIPOS_POR_CLASE[a.clase].map((tipo) => ({ tipo, revision: vigenteDe(p.revisionesVigentes, a.id, tipo) }))
  return (
    <MarcoTelefono titulo={titulo} volver={ficha}>
      <RevisionTelefono
        activo={{ id: a.id, clase: a.clase, nombre: a.nombre }}
        vigentes={vigentes}
        historial={historialDe(p.revisiones, a.id)}
        volverA={ficha}
      />
    </MarcoTelefono>
  )
}
