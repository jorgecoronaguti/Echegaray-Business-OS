import Link from 'next/link'
import { leerParque } from '@/features/herramientas/services/datos'
import { MarcoTelefono, primarioTelefono } from '@/features/herramientas/components/campo/MarcoTelefono'
import { SinBaseTelefono } from '@/features/herramientas/components/campo/SinBaseTelefono'
import { IcoEscanear } from '@/features/herramientas/components/iconos'
import { V } from '@/features/herramientas/components/estilo'
import { diaMes } from '@/features/herramientas/components/formato'
import { filtrar, filtrosDeURL } from '@/features/herramientas/logica/inventario'
import { conLugar, resolverLugar } from '@/features/herramientas/logica/lugar'
import { ETIQUETA_ESTADO, MOTIVO_BAJA, conProblema, rotuloUbicacion } from '@/features/herramientas/logica/parque'

// M04 · BUSCAR — el camino sin QR. Por nombre o por código tipeado («her 42» encuentra HER-0042).
// `?para=reportar` lleva cada resultado directo a M07.
export const dynamic = 'force-dynamic'

const TOPE = 60

export default async function BuscarCampo({ searchParams }: { searchParams: Promise<{ q?: string; f?: string; en?: string; para?: string }> }) {
  const sp = await searchParams
  const lectura = await leerParque()
  const volver = conLugar('/campo/herramientas', sp.en)
  if (lectura.estado !== 'ok') return <SinBaseTelefono lectura={lectura} volver={volver} />
  const p = lectura.parque
  const lugar = resolverLugar(p, lectura.obras, sp.en)
  const taller = p.ubicaciones.find((u) => u.tipo === 'taller' && !u.archivada)
  const f = sp.f === 'lugar' && lugar ? 'lugar' : sp.f === 'taller' && taller ? 'taller' : 'todas'
  const q = (sp.q ?? '').trim()
  const ubicacion = f === 'lugar' ? (lugar?.ubicacionId ?? 'ninguna') : f === 'taller' ? taller!.id : null
  const hay = q || f !== 'todas'
  const res = hay ? filtrar(p, { ...filtrosDeURL({}), clase: 'todo', q, ubicacion }).slice(0, TOPE) : []
  const reportar = sp.para === 'reportar'
  const chips = [
    { v: 'todas', t: 'Todas' },
    ...(lugar ? [{ v: 'lugar', t: lugar.esObra ? 'En esta obra' : 'Acá' }] : []),
    ...(taller && lugar?.ubicacionId !== taller.id ? [{ v: 'taller', t: 'Taller' }] : []),
  ]
  const href = (extra: Record<string, string>) => {
    const u = new URLSearchParams({ ...(q ? { q } : {}), ...(reportar ? { para: 'reportar' } : {}), ...extra })
    if (sp.en) u.set('en', sp.en)
    return `/campo/herramientas/buscar?${u}`
  }
  return (
    <MarcoTelefono
      titulo={reportar ? 'Reportar: ¿cuál?' : 'Buscar'}
      volver={volver}
      pie={<Link href={conLugar('/campo/herramientas/escanear', sp.en)} prefetch={false} style={primarioTelefono}><IcoEscanear tam={17} />Escanear</Link>}
    >
      <form action="/campo/herramientas/buscar" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input
          name="q" defaultValue={q} autoFocus placeholder="Nombre o código" aria-label="Nombre o código" data-testid="buscar"
          style={{ height: 50, padding: '0 14px', border: `1px solid ${V.grafito}`, borderRadius: 6, fontSize: '16px' }}
        />
        {sp.en && <input type="hidden" name="en" value={sp.en} />}
        {reportar && <input type="hidden" name="para" value="reportar" />}
        {f !== 'todas' && <input type="hidden" name="f" value={f} />}
      </form>
      <div style={{ display: 'flex', gap: 8 }}>
        {chips.map((c) => (
          <Link key={c.v} href={href(c.v === 'todas' ? {} : { f: c.v })} prefetch={false}
            style={{ height: 36, padding: '0 12px', display: 'inline-flex', alignItems: 'center', borderRadius: 6, fontSize: '13px', border: `1px solid ${c.v === f ? V.grafito : V.linea}`, fontWeight: c.v === f ? 600 : 400, color: c.v === f ? V.tinta : V.apagado }}>
            {c.t}
          </Link>
        ))}
      </div>
      <div data-testid="resultados">
        {!hay && <div style={{ fontSize: '13.5px', color: V.apagado }}>Escribí parte del nombre o el código que está en la etiqueta.</div>}
        {hay && res.length === 0 && <div style={{ fontSize: '13.5px', color: V.apagado }}>Nada con «{q}». Probá con otra palabra, o escaneá.</div>}
        {res.map((a, i) => {
          const baja = a.estado === 'baja'
          const destino = reportar && !baja ? `/campo/herramientas/a/${encodeURIComponent(a.codigo)}/reportar` : `/campo/herramientas/a/${encodeURIComponent(a.codigo)}`
          return (
            <Link key={a.id} href={conLugar(destino, sp.en)} prefetch={false} data-testid="resultado"
              style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '12px 0', borderBottom: i < res.length - 1 ? `1px solid ${V.linea}` : undefined, opacity: baja ? 0.6 : 1 }}>
              <span style={{ fontSize: '15px', fontWeight: 500 }}>{a.nombre}</span>
              <span style={{ fontSize: '12.5px', color: V.apagado }}>
                {baja ? `baja por ${MOTIVO_BAJA[a.baja_motivo ?? ''] ?? '—'}${a.baja_en ? ` · ${diaMes(a.baja_en)}` : ''}` : (
                  <>
                    <span style={a.ubicacion_id ? undefined : { fontStyle: 'italic', color: V.tenue }}>{rotuloUbicacion(p, a.ubicacion_id)}</span>
                    {' · '}
                    <span style={{ color: conProblema(a) ? V.warn : V.apagado }}>{ETIQUETA_ESTADO[a.estado].toLowerCase()}</span>
                  </>
                )}
              </span>
            </Link>
          )
        })}
        {res.length === TOPE && <div style={{ fontSize: '12.5px', color: V.apagado, paddingTop: 10 }}>Se muestran los primeros {TOPE}: afiná la búsqueda.</div>}
      </div>
    </MarcoTelefono>
  )
}
