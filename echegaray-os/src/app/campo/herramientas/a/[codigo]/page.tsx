import Link from 'next/link'
import { leerParque } from '@/features/herramientas/services/datos'
import { MarcoTelefono, primarioTelefono } from '@/features/herramientas/components/campo/MarcoTelefono'
import { SinBaseTelefono } from '@/features/herramientas/components/campo/SinBaseTelefono'
import { CodigoDesconocido } from '@/features/herramientas/components/campo/CodigoDesconocido'
import { SacarFoto } from '@/features/herramientas/components/campo/SacarFoto'
import { COLOR_TONO, MONO, SUPERFICIE, V } from '@/features/herramientas/components/estilo'
import { diaMes, diaMesAnio } from '@/features/herramientas/components/formato'
import { normalizarCodigo } from '@/features/herramientas/logica/codigo'
import { historial } from '@/features/herramientas/logica/historial'
import { conLugar } from '@/features/herramientas/logica/lugar'
import {
  UNIDAD, seVerifica, textoLectura, textoVerificacion, ultimaLectura, verificacionDe,
} from '@/features/herramientas/logica/verificacion'
import {
  ETIQUETA_ESTADO, MOTIVO_BAJA, TONO_ESTADO, autorDe, rotuloUbicacion, ultimoMovimiento,
} from '@/features/herramientas/logica/parque'

// M03 · UNA HERRAMIENTA — dónde está, cómo está, qué hacer. Es lo que abre el QR en el teléfono.
// Si el código no existe, M12: tres salidas, ningún error.
export const dynamic = 'force-dynamic'

export default async function UnaHerramienta({ params, searchParams }: {
  params: Promise<{ codigo: string }>
  searchParams: Promise<{ en?: string }>
}) {
  const [{ codigo }, { en }] = await Promise.all([params, searchParams])
  let crudo = codigo
  try { crudo = decodeURIComponent(codigo) } catch { /* tal cual */ }
  const c = normalizarCodigo(crudo) ?? crudo
  const lectura = await leerParque()
  const volver = conLugar('/campo/herramientas', en)
  if (lectura.estado !== 'ok') return <SinBaseTelefono lectura={lectura} volver={volver} />
  const p = lectura.parque
  const a = p.activos.find((x) => x.codigo === c)
  if (!a) return <CodigoDesconocido codigo={c} en={en ?? null} />

  const m = ultimoMovimiento(p, a.id)
  const quien = m ? autorDe(p, m) : null
  const inc = p.incDe.get(a.id)?.find((i) => !i.cerrada_en)
  const baja = a.estado === 'baja'
  const renglones = historial(p, a.id)
  const verificable = seVerifica(a)
  const verif = verificable ? verificacionDe(p, a.id) : null

  return (
    <MarcoTelefono
      titulo={<span style={{ fontFamily: MONO }}>{a.codigo}</span>}
      volver={volver}
      pie={baja ? undefined : <Link href={conLugar(`/campo/herramientas/mover?ids=${a.id}`, en)} prefetch={false} className="min-h-[52px]" style={primarioTelefono} data-testid="mover">Mover</Link>}
    >
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }} data-testid="una-herramienta">
        <div style={{ width: 88, height: 70, border: `1px solid ${V.linea}`, borderRadius: 6, background: SUPERFICIE, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11.5px', color: V.tenue, overflow: 'hidden', flexShrink: 0 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- foto pública del bucket `herramientas` */}
          {a.foto_url ? <img src={a.foto_url} alt={a.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : 'sin foto'}
        </div>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <h1 style={{ fontSize: '18px', fontWeight: 600, letterSpacing: '-.01em', lineHeight: 1.25, color: baja ? V.tenue : V.tinta }}>{a.nombre}</h1>
          <div style={{ fontSize: '13px', color: a.categoria ? V.apagado : V.tenue, fontStyle: a.categoria ? undefined : 'italic' }}>
            {a.clase === 'rodado' ? `Rodado · ${a.patente ?? 'sin patente'}` : a.categoria ?? 'sin categoría'}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '14px 0', borderTop: `1px solid ${V.linea}`, borderBottom: `1px solid ${V.linea}` }}>
        <Dato rotulo="Dónde está">
          <span style={{ fontSize: '15px', fontWeight: 500, fontStyle: a.ubicacion_id ? undefined : 'italic', color: a.ubicacion_id ? V.tinta : V.tenue }}>{rotuloUbicacion(p, a.ubicacion_id)}</span>
        </Dato>
        <Dato rotulo="Estado">
          <span style={{ fontSize: '15px', fontWeight: 500, color: COLOR_TONO[TONO_ESTADO[a.estado]] }}>
            {baja ? `Baja por ${MOTIVO_BAJA[a.baja_motivo ?? ''] ?? '—'}` : ETIQUETA_ESTADO[a.estado]}
          </span>
        </Dato>
        {verificable && (
          <Dato rotulo={a.clase === 'rodado' ? 'Kilómetros' : 'Horómetro'}>
            {p.lecturas ? (
              <span style={{ fontSize: '14px', ...(ultimaLectura(p, a.id) ? {} : { fontStyle: 'italic', color: V.tenue }) }} data-testid="lectura-actual">
                {textoLectura(ultimaLectura(p, a.id), UNIDAD[a.clase])}
              </span>
            ) : <span style={{ fontSize: '14px', fontStyle: 'italic', color: V.tenue }}>sin la migración</span>}
          </Dato>
        )}
        <Dato rotulo="La movió">
          <span style={{ fontSize: '14px', fontStyle: quien ? undefined : 'italic', color: quien ? V.tinta : V.tenue }}>
            {m ? `${quien ?? 'sin registro'} · ${diaMes(m.fecha_hora)}` : 'nunca'}
          </span>
        </Dato>
      </div>

      {inc?.texto && (
        <div style={{ fontSize: '13.5px', color: V.tintaSuave, lineHeight: 1.5, borderLeft: `2px solid ${V.linea}`, paddingLeft: 12 }}>
          «{inc.texto}»{inc.usuario_id && p.nombres[inc.usuario_id] ? ` — ${p.nombres[inc.usuario_id]}` : ''}, {diaMes(inc.creado_en)}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {verificable && verif && (
          <Link href={conLugar(`/campo/herramientas/a/${encodeURIComponent(a.codigo)}/verificar`, en)} prefetch={false} className="min-h-[52px]" data-testid="ir-verificar"
            style={{ minHeight: 52, display: 'flex', alignItems: 'center', gap: 10, borderBottom: `1px solid ${V.linea}`, fontSize: '14.5px' }}>
            {a.clase === 'rodado' ? 'Verificar antes de salir' : 'Verificar antes de arrancar'}
            <span style={{ marginLeft: 'auto', fontSize: '12.5px', color: verif.tipo === 'hoy' ? V.pos : V.apagado }}>
              {verif.tipo === 'hoy' ? `hecha ${textoVerificacion(verif)}` : verif.tipo === 'sin_base' ? 'sin la migración' : `última: ${textoVerificacion(verif)}`}
            </span>
            <span style={{ color: V.tenue }}>›</span>
          </Link>
        )}
        {!baja && (
          <Link href={conLugar(`/campo/herramientas/a/${encodeURIComponent(a.codigo)}/reportar`, en)} prefetch={false} className="min-h-[52px]" data-testid="ir-reportar"
            style={{ minHeight: 52, display: 'flex', alignItems: 'center', borderBottom: `1px solid ${V.linea}`, fontSize: '14.5px' }}>
            Reportar un problema <span style={{ marginLeft: 'auto', color: V.tenue }}>›</span>
          </Link>
        )}
        <details style={{ borderBottom: baja ? undefined : `1px solid ${V.linea}` }}>
          <summary style={{ minHeight: 52, display: 'flex', alignItems: 'center', fontSize: '14.5px', cursor: 'pointer', listStyle: 'none' }}>
            Ver historial <span style={{ marginLeft: 'auto', color: V.tenue }}>›</span>
          </summary>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 14, fontSize: '13px' }} data-testid="historial">
            {renglones.map((r, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '84px minmax(0,1fr)', gap: 10 }}>
                <span style={{ color: V.tenue }}>{diaMesAnio(r.fecha)}</span>
                <span style={{ color: V.tintaSuave }}>{r.texto}{r.tipo === 'reporte' ? ' · no se movió' : ''}</span>
              </div>
            ))}
          </div>
        </details>
        {!baja && <SacarFoto activo={a.id} />}
      </div>
    </MarcoTelefono>
  )
}

function Dato({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
      <span style={{ fontSize: '13px', color: V.apagado, flexShrink: 0 }}>{rotulo}</span>
      <span style={{ textAlign: 'right' }}>{children}</span>
    </div>
  )
}
