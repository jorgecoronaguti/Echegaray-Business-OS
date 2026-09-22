'use client'

// D07 · MANTENIMIENTO, etapa 1 — la cola con datos reales; al costado, la ficha del elegido con sus
// acciones (mover al taller, reparación externa como estado, marcar operativa).
//
// Lo que el diseño pone al costado —la orden de reparación externa con remito, presupuesto y fecha
// prometida— es etapa 2, igual que «Se operan con gente» y el plan de service: no se dibujan.

import { usePathname, useRouter } from 'next/navigation'
import { colaDeMantenimiento, TITULO_GRUPO, type GrupoMant } from '../logica/mantenimiento'
import { ETIQUETA_ESTADO, rotuloUbicacion } from '../logica/parque'
import { useHerramientas } from './Espacio'
import { Ficha } from './Ficha'
import { SUPERFICIE, V, bajadaPagina, eyebrow, tituloPagina } from './estilo'

const COLS = 'minmax(0,1.3fr) minmax(0,1fr) minmax(0,1.2fr) 80px'
const ORDEN: GrupoMant[] = ['en_obra', 'en_taller', 'externa', 'otros']

export function VistaMantenimiento({ activo }: { activo: string | null }) {
  const { parque } = useHerramientas()
  const router = useRouter()
  const ruta = usePathname()
  const cola = colaDeMantenimiento(parque)
  const total = ORDEN.reduce((s, g) => s + cola[g].length, 0)
  const viejo = Math.max(0, ...ORDEN.flatMap((g) => cola[g].map((x) => x.dias)))
  const elegido = activo ? parque.activos.find((a) => a.codigo === activo) ?? null : null

  return (
    <div style={{ display: 'flex', alignItems: 'stretch', minHeight: 640 }}>
      <div style={{ flex: 1, minWidth: 0, padding: '22px 26px 30px', display: 'flex', flexDirection: 'column', gap: 26 }} data-testid="mantenimiento">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <h1 style={tituloPagina}>Mantenimiento</h1>
          <div style={bajadaPagina}>
            {total === 0 ? 'Nada abierto: ningún activo tiene un problema reportado.' : `${total} ${total === 1 ? 'abierto' : 'abiertos'} · el más viejo hace ${viejo} ${viejo === 1 ? 'día' : 'días'}`}
          </div>
        </div>
        {ORDEN.filter((g) => cola[g].length > 0).map((g) => (
          <div key={g} style={{ display: 'flex', flexDirection: 'column', gap: 8 }} data-testid={`grupo-${g}`}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <h2 style={{ fontSize: '14px', fontWeight: 600 }}>{TITULO_GRUPO[g].titulo}</h2>
              <span style={{ fontSize: '12.5px', color: V.apagado }}>{cola[g].length} · {TITULO_GRUPO[g].bajada}</span>
            </div>
            <div style={{ ...eyebrow, display: 'grid', gridTemplateColumns: COLS, gap: 18, height: 30, alignItems: 'center', borderBottom: `1px solid ${V.linea}` }}>
              <div>Activo</div><div>Dónde está</div><div>Qué le pasa</div><div style={{ textAlign: 'right' }}>Reportado</div>
            </div>
            {cola[g].map(({ activo: a, incidencia, dias }) => {
              const on = elegido?.id === a.id
              const que = [a.estado === 'requiere_mantenimiento' ? null : ETIQUETA_ESTADO[a.estado], incidencia?.texto ? `«${incidencia.texto}»` : a.estado_nota ? `«${a.estado_nota}»` : null].filter(Boolean).join(' · ')
              return (
                <button
                  key={a.id} type="button" data-testid="item-mantenimiento" className="hover:bg-surface-quiet"
                  onClick={() => router.replace(`${ruta}?activo=${encodeURIComponent(a.codigo)}`, { scroll: false })}
                  style={{ display: 'grid', gridTemplateColumns: COLS, gap: 18, minHeight: 42, alignItems: 'center', borderBottom: `1px solid ${V.linea}`, fontSize: '13.5px', textAlign: 'left', background: on ? SUPERFICIE : undefined }}
                >
                  <div style={{ fontWeight: 500 }}>{a.nombre}</div>
                  <div style={{ color: a.ubicacion_id ? V.tintaSuave : V.tenue, fontStyle: a.ubicacion_id ? undefined : 'italic' }}>{rotuloUbicacion(parque, a.ubicacion_id)}</div>
                  <div style={{ color: que ? V.apagado : V.tenue, fontStyle: que ? undefined : 'italic' }}>{que || 'sin detalle'}</div>
                  <div style={{ textAlign: 'right', color: dias > 30 ? V.neg : dias > 7 ? V.warn : V.apagado, fontWeight: dias > 30 ? 500 : 400 }}>{dias} d</div>
                </button>
              )
            })}
          </div>
        ))}
      </div>
      <div style={{ width: 2, background: V.linea }} />
      <div style={{ width: 430, flexShrink: 0, padding: '22px 24px 28px', background: '#FFFFFF', position: 'sticky', top: 83, alignSelf: 'flex-start', maxHeight: 'calc(100vh - 83px)', overflowY: 'auto' }}>
        {elegido ? <Ficha id={elegido.id} /> : (
          <div style={{ fontSize: '13px', color: V.tenue }}>Elegí uno de la cola para ver qué le pasa y qué hacer.</div>
        )}
      </div>
    </div>
  )
}
