import { redirect } from 'next/navigation'
import { barraDeSesion } from '@/features/herramientas/services/barraDeSesion'
import Link from 'next/link'
import { leerParque } from '@/features/herramientas/services/datos'
import { FilaTelefono, MarcoTelefono } from '@/features/herramientas/components/campo/MarcoTelefono'
import { IcoLista } from '@/features/herramientas/components/iconos'
import { ACCION } from '@/features/herramientas/logica/acciones-lugar'
import { recuentoAbierto, recuentosDelLugar } from '@/features/herramientas/logica/recuento'
import { SinBaseTelefono } from '@/features/herramientas/components/campo/SinBaseTelefono'
import { ListaDelLugar, type ItemLugar } from '@/features/herramientas/components/campo/ListaDelLugar'
import { V } from '@/features/herramientas/components/estilo'
import { diaMes } from '@/features/herramientas/components/formato'
import { rotuloConTalle } from '@/features/herramientas/logica/vestimenta'
import { conLugar, resolverLugar } from '@/features/herramientas/logica/lugar'
import { ETIQUETA_ESTADO, activosEn, cantidadEn, conProblema, llegoEn, ubicacionDelRodado } from '@/features/herramientas/logica/parque'

// M05 · QUÉ HAY EN ESTA OBRA (o en el Taller) — ver por ubicación, marcar qué mover, y entrar al
// «Recuento del lugar» («Control físico»): contar todo contra lo esperado.
export const dynamic = 'force-dynamic'

export default async function LugarCampo({ searchParams }: { searchParams: Promise<{ en?: string }> }) {
  const { en } = await searchParams
  if (!en) redirect('/campo/herramientas')
  const [lectura, barra] = await Promise.all([leerParque(), barraDeSesion()])
  if (lectura.estado !== 'ok') return <SinBaseTelefono lectura={lectura} volver="/campo/herramientas" />
  const p = lectura.parque
  const lugar = resolverLugar(p, lectura.obras, en)
  if (!lugar) redirect('/campo/herramientas')
  const aca = (lugar.ubicacionId ? activosEn(p, lugar.ubicacionId) : [])
    .sort((a, b) => Number(conProblema(b)) - Number(conProblema(a)) || a.nombre.localeCompare(b.nombre, 'es'))
  const items: ItemLugar[] = aca.map((a) => {
    const llego = llegoEn(p, a, lugar.ubicacionId)
    const aqui = cantidadEn(p, a.id, lugar.ubicacionId)
    const u = a.clase === 'rodado' ? ubicacionDelRodado(p, a.id) : null
    return {
      id: a.id, codigo: a.codigo, nombre: a.cantidad > 1 ? `${rotuloConTalle(a)} × ${aqui}` : rotuloConTalle(a), clase: a.clase, patente: a.patente,
      problema: conProblema(a),
      detalle: conProblema(a) ? ETIQUETA_ESTADO[a.estado].toLowerCase() : llego ? `acá desde el ${diaMes(llego)}` : 'acá, sin fecha de llegada',
      lleva: u ? activosEn(p, u.id).length : 0,
    }
  })
  const ultimoRec = recuentosDelLugar(p.recuentos, lugar.ubicacionId ?? '')[0] ?? null
  const abiertoRec = lugar.ubicacionId ? recuentoAbierto(p.recuentos, lugar.ubicacionId) : null
  return (
    <MarcoTelefono titulo={lugar.rotulo} volver={conLugar('/campo/herramientas', lugar.clave)} barra={barra}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <h1 style={{ fontSize: '18px', fontWeight: 600 }} data-testid="cuenta-lugar">{aca.length} {aca.length === 1 ? 'activo' : 'activos'}</h1>
        <Link href="/campo/herramientas" prefetch={false} style={{ fontSize: '13px', color: V.apagado }}>Cambiar ubicación</Link>
      </div>
      {aca.length > 0 && (
        <FilaTelefono href={conLugar('/campo/herramientas/recuento', lugar.clave)} icono={<IcoLista tam={18} color={abiertoRec ? V.warn : V.apagado} />}
          titulo={ACCION.recuento}
          bajada={p.recuentos == null ? 'sin la migración' : abiertoRec ? `abierto desde el ${diaMes(abiertoRec.iniciado_en)}` : ultimoRec ? `último: ${diaMes(ultimoRec.cerrado_en!)}${ultimoRec.aplicado ? ' · ajustó el inventario' : ' · sin ajustar'}` : 'contar todo contra lo esperado'}
          ultima testid="ir-recuento" />
      )}
      <ListaDelLugar items={items} en={lugar.clave} />
    </MarcoTelefono>
  )
}
