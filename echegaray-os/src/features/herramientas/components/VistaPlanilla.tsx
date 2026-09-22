'use client'

// LA PLANILLA DE LA OBRA — la de papel que hoy se llena a mano (foto del dueño, 22/09), armada sola con
// los movimientos: Herramienta · Ingreso · Salida · Observación. Se imprime con renglones en blanco
// abajo para lo que se anote en obra. Al imprimir se ocultan el menú y los botones.

import Link from 'next/link'
import { planilla } from '../logica/planilla'
import { rotuloUbicacion, type Parque } from '../logica/parque'
import { MONO, V, bajadaPagina, pagina, tituloPagina } from './estilo'
import { diaMes } from './formato'

const EN_BLANCO = 8

export function VistaPlanilla({ parque, ubicacionId }: { parque: Parque; ubicacionId: string | null }) {
  const u = ubicacionId ? parque.ubicacionPorId.get(ubicacionId) : undefined
  if (!u) {
    return (
      <div style={pagina}>
        <div style={tituloPagina}>Planilla</div>
        <div style={bajadaPagina}>Elegí una obra o un lugar desde <Link href="/herramientas/ubicaciones" style={{ textDecoration: 'underline' }}>Ubicaciones</Link>.</div>
      </div>
    )
  }
  const filas = planilla(parque, u.id)
  const hoy = filas.filter((f) => !f.salida).length
  const celda = { border: '1px solid #1F1F1E', padding: '7px 9px', fontSize: '13px', textAlign: 'left' as const, verticalAlign: 'top' as const }
  return (
    <div style={pagina} data-testid="planilla">
      <style>{`@media print { header, nav, [data-no-imprimir] { display: none !important; } body { background: #fff; } }`}</style>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={tituloPagina}>Planilla de herramientas · {rotuloUbicacion(parque, u.id)}</div>
          <div style={bajadaPagina}>{filas.length} ingresos registrados · {hoy} {hoy === 1 ? 'sigue' : 'siguen'} acá · impresa el {diaMes(new Date().toISOString())}</div>
        </div>
        <div data-no-imprimir style={{ display: 'flex', gap: 10 }}>
          <Link href={`/herramientas/ubicaciones?u=${u.id}`} style={{ fontSize: '13px', color: V.apagado, alignSelf: 'center' }}>Volver</Link>
          <button type="button" onClick={() => window.print()} data-testid="imprimir-planilla"
            style={{ height: 32, padding: '0 14px', borderRadius: 6, background: V.marca, color: V.grafito, fontWeight: 600, fontSize: '13px' }}>
            Imprimir
          </button>
        </div>
      </div>
      <table style={{ borderCollapse: 'collapse', width: '100%', maxWidth: 980 }}>
        <thead>
          <tr>
            {['Herramienta', 'Ingreso', 'Salida', 'Observación'].map((t, i) => (
              <th key={t} style={{ ...celda, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.02em', width: i === 0 ? '42%' : i === 3 ? '30%' : '14%', textAlign: i === 1 || i === 2 ? 'center' : 'left' }}>{t}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((f, i) => (
            <tr key={`${f.activo.id}-${i}`}>
              <td style={celda}>{f.activo.nombre} <span style={{ fontFamily: MONO, fontSize: '11px', color: V.tenue }}>{f.activo.codigo}</span></td>
              <td style={{ ...celda, textAlign: 'center' }}>{diaMes(f.ingreso)}</td>
              <td style={{ ...celda, textAlign: 'center' }}>{f.salida ? diaMes(f.salida) : ''}</td>
              <td style={celda}>{f.observacion}</td>
            </tr>
          ))}
          {Array.from({ length: EN_BLANCO }, (_, i) => (
            <tr key={`b${i}`}><td style={{ ...celda, height: 30 }} /><td style={celda} /><td style={celda} /><td style={celda} /></tr>
          ))}
        </tbody>
      </table>
      {filas.length === 0 && <div style={bajadaPagina}>Todavía no entró ninguna herramienta acá. Los renglones en blanco sirven para anotar a mano.</div>}
    </div>
  )
}
