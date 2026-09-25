// D06 · MOVIMIENTOS — el libro de todo lo que se movió, con origen, destino y autor.
//
// Desvío: sin «Exportar» en esta etapa (el diseño no dice a qué formato ni para quién; se agrega cuando
// haya una decisión que lo pida).

import Link from 'next/link'
import { libroDeMovimientos, resumenLibro, type FiltrosMov } from '../logica/movimientos'
import type { Parque } from '../logica/parque'
import { MONO, V, bajadaPagina, eyebrow, pagina, tituloPagina, vacio } from './estilo'
import { cuando, diaMes } from './formato'

const COLS = '120px minmax(0,1.4fr) minmax(0,1fr) minmax(0,1fr) 150px'
const MAX = 400

export function VistaMovimientos({ parque, filtros, hoy = new Date() }: { parque: Parque; filtros: FiltrosMov; hoy?: Date }) {
  const todos = libroDeMovimientos(parque, filtros, hoy)
  const r = todos.slice(0, MAX)
  const n = resumenLibro(todos, parque, filtros, hoy)
  const ventana = filtros.dias == null ? 'en total' : `en ${filtros.dias} días`
  return (
    <div style={pagina} data-testid="movimientos">
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <h1 style={tituloPagina}>Movimientos</h1>
          <div style={bajadaPagina}>
            {n.movimientos} {ventana} · {n.lotes} {n.lotes === 1 ? 'lote' : 'lotes'} · {n.personas} {n.personas === 1 ? 'persona' : 'personas'}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ ...eyebrow, display: 'grid', gridTemplateColumns: COLS, gap: 18, height: 34, alignItems: 'center', borderBottom: `1px solid ${V.linea}` }}>
          <div>Cuándo</div><div>Qué se movió</div><div>Desde</div><div>Hacia</div><div>Quién</div>
        </div>
        {r.length === 0 && <div style={{ fontSize: '13.5px', color: V.apagado, padding: '16px 0' }} data-testid="sin-movimientos">No hay movimientos con estos filtros.</div>}
        {r.map((m, i) => {
          const rodado = m.activos.find((a) => a.clase === 'rodado')
          const varios = m.activos.length > 1
          return (
            <div key={m.clave} data-testid="renglon-movimiento" style={{ display: 'grid', gridTemplateColumns: COLS, gap: 18, minHeight: 50, alignItems: 'center', borderBottom: i < r.length - 1 ? `1px solid ${V.linea}` : undefined, fontSize: '13.5px', padding: '6px 0' }}>
              <div style={{ color: V.apagado }}>{cuando(m.fecha, hoy)}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                <div>
                  {varios && rodado ? (
                    <><span style={{ fontWeight: 500 }}>{rodado.nombre}</span><span style={{ color: V.apagado }}> + {m.activos.length - 1} a bordo</span></>
                  ) : varios ? (
                    <><span style={{ fontWeight: 500 }}>{m.activos.length} activos</span><span style={{ color: V.apagado }}> · lote</span></>
                  ) : (
                    <Link href={`/herramientas/inventario?clase=todo&activo=${encodeURIComponent(m.activos[0].codigo)}`} prefetch={false} style={{ fontWeight: 500 }}>{m.activos[0].nombre}</Link>
                  )}
                </div>
                {varios && (
                  <div style={{ fontSize: '11.5px', color: V.apagado }} className="truncate">
                    {m.activos.filter((a) => a !== rodado).slice(0, 3).map((a) => a.nombre).join(', ')}{m.activos.length > 4 ? `, +${m.activos.length - 4}` : ''}
                  </div>
                )}
                {m.corregidoPor && (
                  <div style={{ fontSize: '11.5px', color: V.warn }}>corregido el {diaMes(m.corregidoPor.fecha_hora)}{m.corregidoPor.nota ? `: ${m.corregidoPor.nota}` : ''}</div>
                )}
                {m.nota && !m.corregidoPor && <div style={{ fontSize: '11.5px', color: V.apagado }}>{m.nota}</div>}
              </div>
              <div style={m.desde.length ? { color: V.tintaSuave } : vacio}>
                {m.desde.length ? m.desde.join(' · ') : m.alta ? 'sin origen · alta' : 'origen desconocido'}
              </div>
              <div style={{ color: V.tintaSuave }}>
                {m.hacia}
                {m.reimputacion && <div style={{ fontSize: '11.5px', color: V.apagado }} data-testid="reimputacion">reimputación · mismo cliente, no se movió</div>}
              </div>
              <div style={m.quien ? { color: V.tintaSuave } : vacio}>{m.quien ?? 'sin registro'}</div>
            </div>
          )
        })}
      </div>
      <div style={{ fontSize: '12.5px', color: V.apagado }}>
        {todos.length > MAX ? <>Se muestran los <span style={{ fontFamily: MONO }}>{MAX}</span> más nuevos de {todos.length}. </> : null}
        Un movimiento no se borra: se corrige con otro. El alta es un movimiento sin origen.
      </div>
    </div>
  )
}
