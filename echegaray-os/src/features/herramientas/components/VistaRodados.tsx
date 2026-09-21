// D11 · RODADOS, etapa 1 — una fila por unidad con lo que hay: patente, dónde está, estado, qué lleva
// encima y quién lo movió por última vez (el «a cargo de» del diseño sale del último movimiento).
//
// Km, papeles, service y verificación NO existen todavía en la base: se dicen «sin cargar», nunca un
// número. El listado «Máquinas con operador» es etapa 2 (verificación de uso).

import Link from 'next/link'
import {
  ETIQUETA_ESTADO_CORTA, TONO_ESTADO, activosEn, quienLaMovio, rotuloUbicacion, ubicacionDelRodado, vivo, type Parque,
} from '../logica/parque'
import { COLOR_TONO, MONO, V, bajadaPagina, eyebrow, pagina, tituloPagina, vacio } from './estilo'

const COLS = 'minmax(0,1.3fr) minmax(0,1.2fr) 150px 110px 130px 90px 90px 90px 100px'

export function VistaRodados({ parque }: { parque: Parque }) {
  const rodados = parque.activos.filter((a) => a.clase === 'rodado' && vivo(a)).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  const sinUbic = rodados.filter((r) => !r.ubicacion_id).length
  return (
    <div style={pagina} data-testid="rodados">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <h1 style={tituloPagina}>Rodados</h1>
        <div style={bajadaPagina}>
          {rodados.length} {rodados.length === 1 ? 'unidad' : 'unidades'}
          {sinUbic ? ` · ${sinUbic} sin ubicación cargada` : ''} · km, papeles y service sin cargar
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', overflowX: 'auto' }}>
        <div style={{ ...eyebrow, display: 'grid', gridTemplateColumns: COLS, gap: 16, height: 34, alignItems: 'center', borderBottom: `1px solid ${V.linea}`, minWidth: 1100 }}>
          <div>Unidad</div><div>Dónde está</div><div>Estado</div><div>Lleva encima</div><div>Lo movió</div>
          <div style={{ textAlign: 'right' }}>Km</div><div>Service</div><div>Papeles</div><div style={{ textAlign: 'right' }}>Verificación</div>
        </div>
        {rodados.length === 0 && <div style={{ fontSize: '13.5px', color: V.apagado, padding: '16px 0' }}>Todavía no hay rodados cargados.</div>}
        {rodados.map((r, i) => {
          const u = ubicacionDelRodado(parque, r.id)
          const lleva = u ? activosEn(parque, u.id).length : 0
          const quien = quienLaMovio(parque, r.id)
          const tono = COLOR_TONO[TONO_ESTADO[r.estado]]
          return (
            <Link key={r.id} href={`/herramientas/inventario?clase=rodado&activo=${encodeURIComponent(r.codigo)}`} prefetch={false} className="hover:bg-surface-quiet" data-testid="fila-rodado"
              style={{ display: 'grid', gridTemplateColumns: COLS, gap: 16, minHeight: 52, alignItems: 'center', borderBottom: i < rodados.length - 1 ? `1px solid ${V.linea}` : undefined, fontSize: '13.5px', minWidth: 1100 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 9 }}>
                <span style={{ fontWeight: 500 }}>{r.nombre}</span>
                <span style={{ fontFamily: MONO, fontSize: '11px', color: V.tenue }}>{r.patente ?? r.codigo}</span>
              </div>
              <div style={r.ubicacion_id ? { color: V.tintaSuave } : vacio}>{rotuloUbicacion(parque, r.ubicacion_id)}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: tono }}>
                {r.estado !== 'fuera_servicio' && <span style={{ width: 7, height: 7, borderRadius: '50%', background: tono, flexShrink: 0 }} />}
                {ETIQUETA_ESTADO_CORTA[r.estado]}{r.estado_asumido ? <span style={{ color: V.tenue, fontSize: '11.5px' }}> · asumido</span> : null}
              </div>
              <div style={lleva ? { color: V.tintaSuave } : { color: V.tenue }}>{lleva ? `${lleva} ${lleva === 1 ? 'activo' : 'activos'}` : 'nada'}</div>
              <div style={quien ? { color: V.tintaSuave } : vacio}>{quien ?? 'sin registro'}</div>
              <div style={{ ...vacio, textAlign: 'right' }}>sin cargar</div>
              <div style={vacio}>sin cargar</div>
              <div style={vacio}>sin cargar</div>
              <div style={{ ...vacio, textAlign: 'right' }}>nunca</div>
            </Link>
          )
        })}
      </div>
      <div style={{ fontSize: '12.5px', color: V.apagado }}>
        Km, papeles (VTV, seguro), plan de service y verificación de uso se cargan en la próxima etapa. Hasta entonces no se muestra ningún número.
      </div>
    </div>
  )
}
