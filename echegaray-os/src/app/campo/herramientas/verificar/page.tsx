import { leerParque } from '@/features/herramientas/services/datos'
import { FilaTelefono, MarcoTelefono } from '@/features/herramientas/components/campo/MarcoTelefono'
import { SinBaseTelefono } from '@/features/herramientas/components/campo/SinBaseTelefono'
import { V } from '@/features/herramientas/components/estilo'
import { conLugar } from '@/features/herramientas/logica/lugar'
import { rotuloUbicacion } from '@/features/herramientas/logica/parque'
import { seVerifica, textoVerificacion, verificacionDe } from '@/features/herramientas/logica/verificacion'

// Elegir qué verificar (M10 / M13): los rodados y equipos vivos, primero los que no se verificaron hoy.
// Se llega desde el inicio de campo (M01) cuando el rodado no está en el lugar elegido.
export const dynamic = 'force-dynamic'

export default async function ElegirVerificacion({ searchParams }: { searchParams: Promise<{ en?: string }> }) {
  const { en } = await searchParams
  const volver = conLugar('/campo/herramientas', en)
  const lectura = await leerParque()
  if (lectura.estado !== 'ok') return <SinBaseTelefono lectura={lectura} volver={volver} />
  const p = lectura.parque
  const lista = p.activos.filter(seVerifica)
    .map((a) => ({ a, v: verificacionDe(p, a.id) }))
    .sort((x, y) => Number(x.v.tipo === 'hoy') - Number(y.v.tipo === 'hoy') || x.a.nombre.localeCompare(y.a.nombre, 'es'))
  return (
    <MarcoTelefono titulo="Verificar antes de usar" volver={volver}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <h1 style={{ fontSize: '19px', fontWeight: 600 }}>¿Qué vas a usar?</h1>
        <div style={{ fontSize: '13px', color: V.apagado }}>Rodados y equipos que se operan con gente.</div>
      </div>
      {!p.lecturas && (
        <div style={{ fontSize: '13px', color: V.warn }}>Falta aplicar la migración 20260922T1200 de la verificación de uso: todavía no se puede registrar.</div>
      )}
      {lista.length === 0 ? (
        <div style={{ fontSize: '14px', color: V.apagado }}>No hay rodados ni equipos cargados.</div>
      ) : (
        <div data-testid="lista-verificar">
          {lista.map(({ a, v }, i) => (
            <FilaTelefono key={a.id} href={conLugar(`/campo/herramientas/a/${encodeURIComponent(a.codigo)}/verificar`, en)}
              titulo={a.nombre}
              bajada={`${rotuloUbicacion(p, a.ubicacion_id)} · ${v.tipo === 'hoy' ? `verificada ${textoVerificacion(v)}` : `sin verificar hoy · última: ${textoVerificacion(v)}`}`}
              tonoBajada={v.tipo === 'hoy' ? V.pos : undefined}
              ultima={i === lista.length - 1} testid="verificable" />
          ))}
        </div>
      )}
    </MarcoTelefono>
  )
}
