import { leerParque } from '@/features/herramientas/services/datos'
import { MarcoTelefono } from '@/features/herramientas/components/campo/MarcoTelefono'
import { SinBaseTelefono } from '@/features/herramientas/components/campo/SinBaseTelefono'
import { CodigoDesconocido } from '@/features/herramientas/components/campo/CodigoDesconocido'
import { LibroDeVida } from '@/features/herramientas/components/LibroDeVida'
import { normalizarCodigo } from '@/features/herramientas/logica/codigo'
import { conLugar } from '@/features/herramientas/logica/lugar'
import { MIGRACION_EVENTO } from '@/features/herramientas/logica/evento'

// NOVEDAD DEL RODADO EN EL TELÉFONO — «hay que llevarlo», «en el mecánico», «ya hecho» (30/09).
// Los mismos permisos que el resto de la ficha: la base decide con el usuario logueado, sin nivel aparte.
export const dynamic = 'force-dynamic'

export default async function NovedadCampo({ params, searchParams }: { params: Promise<{ codigo: string }>; searchParams: Promise<{ en?: string }> }) {
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
      <div style={{ fontSize: '14px', lineHeight: 1.5 }} data-testid="no-hay-novedad">{texto}</div>
    </MarcoTelefono>
  )
  if (a.estado === 'baja') return aviso(`${a.nombre} está dado de baja: no se le cargan novedades.`)
  if (a.clase !== 'rodado') return aviso('La novedad de taller es para rodados.')
  if (p.eventos == null) return aviso(`Falta aplicar la migración ${MIGRACION_EVENTO} del libro de vida: todavía no se puede cargar. El resto del módulo anda igual.`)
  return (
    <MarcoTelefono titulo={titulo} volver={ficha}>
      <LibroDeVida
        variante="telefono"
        activo={{ id: a.id, estado: a.estado, nombre: a.nombre }}
        eventos={p.eventos}
        proveedores={(p.proveedores ?? []).map((x) => ({ id: x.id, nombre: x.nombre }))}
      />
    </MarcoTelefono>
  )
}
