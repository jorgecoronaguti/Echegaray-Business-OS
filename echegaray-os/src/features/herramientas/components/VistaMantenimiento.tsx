'use client'

// D07 · MANTENIMIENTO, etapa 1 — la cola con datos reales; al costado, la ficha del elegido con sus
// acciones (mover al taller, reparación externa como estado, marcar operativa).
//
// Lo que el diseño pone al costado —la orden de reparación externa con remito, presupuesto y fecha
// prometida— es etapa 2, igual que el plan de service: no se dibujan. «Se operan con gente» sí: lee la
// verificación de uso (migración 20260922T1200). Sin habilitación del operador: no existe en la base.

import { usePathname, useRouter } from 'next/navigation'
import { colaDeMantenimiento, TITULO_GRUPO, type GrupoMant } from '../logica/mantenimiento'
import { ETIQUETA_ESTADO, rotuloUbicacion, type Parque } from '../logica/parque'
import { operadorDe } from '../logica/historial'
import {
  UNIDAD, seVerifica, textoLectura, textoVerificacion, ultimaLectura, ultimaVerificacion, verificacionDe,
} from '../logica/verificacion'
import { useHerramientas } from './Espacio'
import { Ficha } from './Ficha'
import { FichaRevision } from './FichaRevision'
import { RevisionesMantenimiento } from './RevisionesMantenimiento'
import { SUPERFICIE, V, bajadaPagina, eyebrow, tituloPagina } from './estilo'

const COLS = 'minmax(0,1.3fr) minmax(0,1fr) minmax(0,1.2fr) 80px'
const ORDEN: GrupoMant[] = ['en_obra', 'en_taller', 'externa', 'otros']

export function VistaMantenimiento({ activo, revision }: { activo: string | null; revision: string | null }) {
  const { parque, abierto: panel } = useHerramientas()
  // Con un panel abierto (mover, alta, reportar…) el panel ocupa la derecha: la ficha se esconde para
  // que el listado no quede apretado entre las dos columnas.
  const conPanel = !!panel && panel.tipo !== 'baja'
  const router = useRouter()
  const ruta = usePathname()
  const cola = colaDeMantenimiento(parque)
  const total = ORDEN.reduce((s, g) => s + cola[g].length, 0)
  const viejo = Math.max(0, ...ORDEN.flatMap((g) => cola[g].map((x) => x.dias)))
  const elegido = activo ? parque.activos.find((a) => a.codigo === activo) ?? null : null
  // `?revision=<código>` abre la ficha de revisión (RTO, service, seguro, inspección) en vez de la del activo.
  const revisado = revision ? parque.activos.find((a) => a.codigo === revision) ?? null : null

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
        <RevisionesMantenimiento parque={parque} elegido={revisado?.codigo ?? null} />
        <SeOperanConGente parque={parque} />
      </div>
      <div style={{ width: 2, background: V.linea }} />
      {!conPanel && (elegido || revisado) && (
      <div style={{ width: 430, flexShrink: 0, padding: '22px 24px 28px', background: '#FFFFFF', position: 'sticky', top: 83, alignSelf: 'flex-start', maxHeight: 'calc(100vh - 83px)', overflowY: 'auto', borderLeft: `1px solid ${V.linea}` }}>
        {elegido
          ? <Ficha id={elegido.id} onCerrar={() => router.replace(ruta, { scroll: false })} />
          : <FichaRevision id={revisado!.id} onCerrar={() => router.replace(ruta, { scroll: false })} />}
      </div>
      )}
    </div>
  )
}

/** D07 «Se operan con gente»: rodados y equipos vivos con su última verificación y su lectura. */
function SeOperanConGente({ parque }: { parque: Parque }) {
  const lista = parque.activos.filter(seVerifica).map((a) => ({ a, v: verificacionDe(parque, a.id) }))
    .sort((x, y) => Number(x.v.tipo === 'hoy') - Number(y.v.tipo === 'hoy') || x.a.nombre.localeCompare(y.a.nombre, 'es'))
  if (lista.length === 0) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }} data-testid="se-operan-con-gente">
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <h2 style={{ fontSize: '14px', fontWeight: 600 }}>Se operan con gente</h2>
        <span style={{ fontSize: '12.5px', color: V.apagado }}>{lista.length} · verificación antes de usar</span>
      </div>
      <div style={{ ...eyebrow, display: 'grid', gridTemplateColumns: COLS, gap: 18, height: 30, alignItems: 'center', borderBottom: `1px solid ${V.linea}` }}>
        <div>Activo</div><div>Dónde está</div><div>Verificación</div><div style={{ textAlign: 'right' }}>Lectura</div>
      </div>
      {lista.map(({ a, v }) => {
        const ult = ultimaVerificacion(parque, a.id)
        const quien = ult ? operadorDe(parque, ult) : null
        const que = v.tipo === 'sin_base' ? 'sin la migración'
          : v.tipo === 'hoy' ? `Verificada ${textoVerificacion(v)}${quien ? ` · ${quien}` : ''}`
            : `Sin verificar hoy · última: ${textoVerificacion(v)}${quien ? ` · ${quien}` : ''}`
        const l = ultimaLectura(parque, a.id)
        return (
          <div key={a.id} style={{ display: 'grid', gridTemplateColumns: COLS, gap: 18, minHeight: 42, alignItems: 'center', borderBottom: `1px solid ${V.linea}`, fontSize: '13.5px' }} data-testid="item-verificacion">
            <div style={{ fontWeight: 500 }}>{a.nombre}</div>
            <div style={{ color: a.ubicacion_id ? V.tintaSuave : V.tenue, fontStyle: a.ubicacion_id ? undefined : 'italic' }}>{rotuloUbicacion(parque, a.ubicacion_id)}</div>
            <div style={{ color: v.tipo === 'hoy' ? V.apagado : V.warn }}>{que}</div>
            <div style={{ textAlign: 'right', color: l ? V.tintaSuave : V.tenue, fontStyle: l ? undefined : 'italic' }}>{parque.lecturas ? textoLectura(l, UNIDAD[a.clase]) : '—'}</div>
          </div>
        )
      })}
      <div style={{ fontSize: '12.5px', color: V.apagado }}>Sin verificar no traba el uso: se avisa. Un «Mal» crítico lo deja fuera de servicio y aparece arriba, en la cola.</div>
    </div>
  )
}
