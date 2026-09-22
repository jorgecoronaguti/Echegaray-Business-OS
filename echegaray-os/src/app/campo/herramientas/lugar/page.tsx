import { redirect } from 'next/navigation'
import Link from 'next/link'
import { leerParque } from '@/features/herramientas/services/datos'
import { MarcoTelefono } from '@/features/herramientas/components/campo/MarcoTelefono'
import { SinBaseTelefono } from '@/features/herramientas/components/campo/SinBaseTelefono'
import { ListaDelLugar, type ItemLugar } from '@/features/herramientas/components/campo/ListaDelLugar'
import { V } from '@/features/herramientas/components/estilo'
import { diaMes } from '@/features/herramientas/components/formato'
import { conLugar, resolverLugar } from '@/features/herramientas/logica/lugar'
import { ETIQUETA_ESTADO, activosEn, conProblema, llegoEn, ubicacionDelRodado } from '@/features/herramientas/logica/parque'

// M05 · QUÉ HAY EN ESTA OBRA (o en el Taller) — ver por ubicación y marcar qué mover.
export const dynamic = 'force-dynamic'

export default async function LugarCampo({ searchParams }: { searchParams: Promise<{ en?: string }> }) {
  const { en } = await searchParams
  if (!en) redirect('/campo/herramientas')
  const lectura = await leerParque()
  if (lectura.estado !== 'ok') return <SinBaseTelefono lectura={lectura} volver="/campo/herramientas" />
  const p = lectura.parque
  const lugar = resolverLugar(p, lectura.obras, en)
  if (!lugar) redirect('/campo/herramientas')
  const aca = (lugar.ubicacionId ? activosEn(p, lugar.ubicacionId) : [])
    .sort((a, b) => Number(conProblema(b)) - Number(conProblema(a)) || a.nombre.localeCompare(b.nombre, 'es'))
  const items: ItemLugar[] = aca.map((a) => {
    const llego = llegoEn(p, a)
    const u = a.clase === 'rodado' ? ubicacionDelRodado(p, a.id) : null
    return {
      id: a.id, codigo: a.codigo, nombre: a.nombre, clase: a.clase, patente: a.patente,
      problema: conProblema(a),
      detalle: conProblema(a) ? ETIQUETA_ESTADO[a.estado].toLowerCase() : llego ? `acá desde el ${diaMes(llego)}` : 'acá, sin fecha de llegada',
      lleva: u ? activosEn(p, u.id).length : 0,
    }
  })
  return (
    <MarcoTelefono titulo={lugar.rotulo} volver={conLugar('/campo/herramientas', lugar.clave)}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <h1 style={{ fontSize: '18px', fontWeight: 600 }} data-testid="cuenta-lugar">{aca.length} {aca.length === 1 ? 'activo' : 'activos'}</h1>
        <Link href="/campo/herramientas" prefetch={false} style={{ fontSize: '13px', color: V.apagado }}>Cambiar ubicación</Link>
      </div>
      <ListaDelLugar items={items} en={lugar.clave} />
    </MarcoTelefono>
  )
}
