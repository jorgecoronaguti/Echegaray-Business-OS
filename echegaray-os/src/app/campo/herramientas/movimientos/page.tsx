import { redirect } from 'next/navigation'
import { barraDeSesion } from '@/features/herramientas/services/barraDeSesion'
import Link from 'next/link'
import { leerParque } from '@/features/herramientas/services/datos'
import { MarcoTelefono } from '@/features/herramientas/components/campo/MarcoTelefono'
import { SinBaseTelefono } from '@/features/herramientas/components/campo/SinBaseTelefono'
import { MONO, V } from '@/features/herramientas/components/estilo'
import { cuando, diaMes } from '@/features/herramientas/components/formato'
import { conLugar, resolverLugar } from '@/features/herramientas/logica/lugar'
import { libroDeMovimientos } from '@/features/herramientas/logica/movimientos'

// MOVIMIENTOS DEL LUGAR, EN EL TELÉFONO — la lectura que le faltaba al que está parado en la obra:
// «¿qué se llevaron de acá, quién y cuándo?». Es el mismo libro de D06 (`libroDeMovimientos`) filtrado
// por este lugar, sólo lectura: los filtros por persona y ventana, y la corrección de un movimiento,
// quedan en la computadora (Movimientos), que es donde se administra. Paridad inversa, dueño 23/09/2026.
export const dynamic = 'force-dynamic'

const DIAS = 90
const MAX = 80

export default async function MovimientosCampo({ searchParams }: { searchParams: Promise<{ en?: string }> }) {
  const { en } = await searchParams
  if (!en) redirect('/campo/herramientas')
  const [lectura, barra] = await Promise.all([leerParque(), barraDeSesion()])
  if (lectura.estado !== 'ok') return <SinBaseTelefono lectura={lectura} volver="/campo/herramientas" />
  const p = lectura.parque
  const lugar = resolverLugar(p, lectura.obras, en)
  if (!lugar) redirect('/campo/herramientas')
  const hoy = new Date()
  const todos = lugar.ubicacionId ? libroDeMovimientos(p, { dias: DIAS, ubicacion: lugar.ubicacionId, usuario: null }, hoy) : []
  const lista = todos.slice(0, MAX)
  return (
    <MarcoTelefono titulo="Movimientos" volver={conLugar('/campo/herramientas', lugar.clave)} barra={barra}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <h1 style={{ fontSize: '18px', fontWeight: 600 }} data-testid="cuenta-movimientos">{lugar.rotulo}</h1>
        <div style={{ fontSize: '13px', color: V.apagado }}>{todos.length} {todos.length === 1 ? 'movimiento' : 'movimientos'} en {DIAS} días · entradas y salidas</div>
      </div>
      <div data-testid="lista-movimientos">
        {lista.length === 0 && <div style={{ fontSize: '13.5px', color: V.apagado }}>Nada entró ni salió de acá en {DIAS} días.</div>}
        {lista.map((m, i) => {
          const rodado = m.activos.find((a) => a.clase === 'rodado')
          const varios = m.activos.length > 1
          // El libro ya está filtrado por este lugar: si no llegó acá, salió de acá.
          const sale = m.hacia !== lugar.rotulo
          const que = varios && rodado ? `${rodado.nombre} + ${m.activos.length - 1} a bordo` : varios ? `${m.activos.length} activos · lote` : m.activos[0].nombre
          return (
            <div key={m.clave} data-testid="renglon-movimiento"
              style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '12px 0', borderBottom: i < lista.length - 1 ? `1px solid ${V.linea}` : undefined }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                {varios ? <span style={{ fontSize: '15px', fontWeight: 500, flex: 1 }}>{que}</span> : (
                  <Link href={conLugar(`/campo/herramientas/a/${encodeURIComponent(m.activos[0].codigo)}`, lugar.clave)} prefetch={false} style={{ fontSize: '15px', fontWeight: 500, flex: 1 }}>{que}</Link>
                )}
                <span style={{ fontSize: '12.5px', color: V.apagado, whiteSpace: 'nowrap' }}>{cuando(m.fecha, hoy)}</span>
              </div>
              <div style={{ fontSize: '12.5px', color: sale ? V.warn : V.tintaSuave }}>
                {sale ? `salió → ${m.hacia}` : m.desde.length ? `llegó ← ${m.desde.join(' · ')}` : m.alta ? 'alta acá' : 'llegó · origen desconocido'}
                {m.quien ? ` · ${m.quien}` : ''}
              </div>
              {varios && (
                <div style={{ fontSize: '12px', color: V.apagado }}>
                  {m.activos.filter((a) => a !== rodado).slice(0, 3).map((a) => a.nombre).join(', ')}{m.activos.length > 4 ? `, +${m.activos.length - 4}` : ''}
                </div>
              )}
              {m.corregidoPor && <div style={{ fontSize: '12px', color: V.warn }}>corregido el {diaMes(m.corregidoPor.fecha_hora)}</div>}
              {m.nota && !m.corregidoPor && <div style={{ fontSize: '12px', color: V.apagado, fontFamily: MONO }}>{m.nota}</div>}
            </div>
          )
        })}
        {todos.length > MAX && <div style={{ fontSize: '12.5px', color: V.apagado, paddingTop: 10 }}>Se muestran los {MAX} más nuevos. El libro completo está en la computadora.</div>}
      </div>
    </MarcoTelefono>
  )
}
