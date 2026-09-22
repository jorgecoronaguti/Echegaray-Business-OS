'use client'

// EL CONTROL DE HERRAMIENTAS DE LA OBRA, PARA IMPRIMIR — ver `logica/planilla.ts`.
//
// No es la hoja de papel copiada (dueño, 22/09): es lo que el sistema sabe de esa obra, puesto para
// controlarlo en el lugar. Lo que hay hoy por categoría con casilleros «está / falta», lo que ya tiene
// un problema, lo que entró y salió en 30 días, y las firmas. Al imprimir se ocultan menú y botones.

import Link from 'next/link'
import { controlDeUbicacion, textoEstado, type FilaControl } from '../logica/planilla'
import { rotuloUbicacion, type Parque } from '../logica/parque'
import { MONO, V, bajadaPagina, pagina, tituloPagina } from './estilo'
import { diaMes, diaMesAnio } from './formato'

const celda = { borderBottom: '1px solid #D7D5CF', padding: '6px 8px', fontSize: '12.5px', textAlign: 'left' as const, verticalAlign: 'top' as const }
const rotulo = { ...celda, fontSize: '10.5px', letterSpacing: '.06em', textTransform: 'uppercase' as const, color: '#6B6B67', fontWeight: 500, borderBottom: '1px solid #1F1F1E' }
const casilla = { display: 'inline-block', width: 13, height: 13, border: '1.3px solid #1F1F1E', borderRadius: 2 }

export function VistaPlanilla({ parque, ubicacionId }: { parque: Parque; ubicacionId: string | null }) {
  const u = ubicacionId ? parque.ubicacionPorId.get(ubicacionId) : undefined
  if (!u) {
    return (
      <div style={pagina}>
        <div style={tituloPagina}>Control de herramientas</div>
        <div style={bajadaPagina}>Elegí una obra o un lugar desde <Link href="/herramientas/ubicaciones" style={{ textDecoration: 'underline' }}>Ubicaciones</Link>.</div>
      </div>
    )
  }
  const hoy = new Date()
  const c = controlDeUbicacion(parque, u.id, hoy)
  const obra = u.obra_id ? parque.obraPorId.get(u.obra_id) : null

  return (
    <div style={{ ...pagina, maxWidth: 1100 }} data-testid="planilla">
      <style>{`@media print {
        header, nav, [data-no-imprimir] { display: none !important; }
        body { background: #fff; }
        @page { size: A4; margin: 12mm; }
        [data-planilla-bloque] { break-inside: avoid; }
      }`}</style>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20, borderBottom: '2px solid #1F1F1E', paddingBottom: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ fontSize: '11px', letterSpacing: '.08em', textTransform: 'uppercase', color: V.apagado }}>Echegaray Construcciones · Control de herramientas</div>
          <div style={tituloPagina}>{rotuloUbicacion(parque, u.id)}</div>
          <div style={bajadaPagina}>
            {obra?.cliente ? `${obra.cliente} · ` : ''}{c.activos} {c.activos === 1 ? 'activo' : 'activos'}
            {c.unidades !== c.activos ? ` · ${c.unidades} unidades` : ''} · {c.conProblema.length} con problema · impreso el {diaMesAnio(hoy.toISOString())}
          </div>
        </div>
        <div data-no-imprimir style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Link href={`/herramientas/ubicaciones?u=${u.id}`} style={{ fontSize: '13px', color: V.apagado }}>Volver</Link>
          <button type="button" onClick={() => window.print()} data-testid="imprimir-planilla"
            style={{ height: 32, padding: '0 14px', borderRadius: 6, background: V.marca, color: V.grafito, fontWeight: 600, fontSize: '13px' }}>
            Imprimir
          </button>
        </div>
      </div>

      <section data-planilla-bloque style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: '14px', fontWeight: 600 }}>1 · Lo que tiene que estar hoy</div>
        <div style={{ fontSize: '12px', color: V.apagado }}>Tildar lo que se ve. Lo que falte se reporta después como «No la encuentro» en el teléfono, con el código.</div>
        {c.activos === 0 ? (
          <div style={bajadaPagina}>El sistema no tiene nada registrado acá.</div>
        ) : (
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <th style={{ ...rotulo, width: 80 }}>Código</th>
                <th style={rotulo}>Herramienta</th>
                <th style={{ ...rotulo, width: 44, textAlign: 'right' }}>Cant.</th>
                <th style={{ ...rotulo, width: 120 }}>Estado</th>
                <th style={{ ...rotulo, width: 110 }}>Llegó</th>
                <th style={{ ...rotulo, width: 110 }}>La trajo</th>
                <th style={{ ...rotulo, width: 44, textAlign: 'center' }}>Está</th>
                <th style={{ ...rotulo, width: 44, textAlign: 'center' }}>Falta</th>
                <th style={{ ...rotulo, width: 170 }}>Observación</th>
              </tr>
            </thead>
            <tbody>
              {c.porCategoria.map((g) => [
                <tr key={`g-${g.categoria}`}>
                  <td colSpan={9} style={{ ...celda, paddingTop: 12, fontWeight: 600, fontSize: '12px', color: V.tinta, borderBottom: '1px solid #91918B' }}>
                    {g.categoria} <span style={{ color: V.tenue, fontWeight: 400 }}>· {g.filas.length}</span>
                  </td>
                </tr>,
                ...g.filas.map((f) => <FilaImpresa key={f.activo.id} f={f} />),
              ])}
            </tbody>
          </table>
        )}
      </section>

      {c.conProblema.length > 0 && (
        <section data-planilla-bloque style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: '14px', fontWeight: 600 }}>2 · Ya tienen un problema reportado</div>
          <div style={{ fontSize: '12px', color: V.apagado }}>No hace falta volver a reportarlas: decidir si se retiran al Taller.</div>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <tbody>
              {c.conProblema.map((f) => (
                <tr key={f.activo.id}>
                  <td style={{ ...celda, width: 80, fontFamily: MONO, fontSize: '11.5px' }}>{f.activo.codigo}</td>
                  <td style={celda}>{f.activo.nombre}</td>
                  <td style={{ ...celda, width: 160, color: V.warn }}>{textoEstado(f.activo)}</td>
                  <td style={{ ...celda, width: 300, color: V.tintaSuave }}>{f.activo.estado_nota ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section data-planilla-bloque style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: '14px', fontWeight: 600 }}>{c.conProblema.length > 0 ? '3' : '2'} · Entró y salió en los últimos 30 días</div>
        {c.ultimos.length === 0 ? (
          <div style={bajadaPagina}>Sin movimientos en 30 días.</div>
        ) : (
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <th style={{ ...rotulo, width: 70 }}>Fecha</th>
                <th style={{ ...rotulo, width: 70 }}></th>
                <th style={rotulo}>Herramienta</th>
                <th style={{ ...rotulo, width: 190 }}>Desde / hacia</th>
                <th style={{ ...rotulo, width: 130 }}>Quién</th>
                <th style={{ ...rotulo, width: 200 }}>Nota</th>
              </tr>
            </thead>
            <tbody>
              {c.ultimos.map((m, i) => (
                <tr key={i}>
                  <td style={celda}>{diaMes(m.fecha)}</td>
                  <td style={{ ...celda, color: m.sentido === 'entró' ? V.pos : V.warn, fontWeight: 500 }}>{m.sentido}</td>
                  <td style={celda}>{m.activo.nombre} <span style={{ fontFamily: MONO, fontSize: '11px', color: V.tenue }}>{m.activo.codigo}</span></td>
                  <td style={celda}>{m.sentido === 'entró' ? 'desde ' : 'a '}{m.otroLado}</td>
                  <td style={celda}>{m.quien ?? ''}</td>
                  <td style={{ ...celda, color: V.tintaSuave }}>{m.nota ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section data-planilla-bloque style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 28, paddingTop: 26, fontSize: '12.5px' }}>
        {['Controló (nombre y firma)', 'Recibió en obra (jefe)', 'Fecha del control'].map((t) => (
          <div key={t} style={{ borderTop: '1px solid #1F1F1E', paddingTop: 6, color: V.apagado }}>{t}</div>
        ))}
      </section>
    </div>
  )
}

function FilaImpresa({ f }: { f: FilaControl }) {
  const a = f.activo
  return (
    <tr>
      <td style={{ ...celda, fontFamily: MONO, fontSize: '11.5px' }}>{a.codigo}</td>
      <td style={celda}>{a.nombre}</td>
      <td style={{ ...celda, textAlign: 'right' }}>{f.cantidad}</td>
      <td style={{ ...celda, color: a.estado === 'operativo' ? V.tintaSuave : V.warn }}>{textoEstado(a)}</td>
      <td style={celda}>{f.llego ? `${diaMes(f.llego)} · ${f.dias} d` : 'sin registro'}</td>
      <td style={celda}>{f.trajo ?? ''}</td>
      <td style={{ ...celda, textAlign: 'center' }}><span style={casilla} /></td>
      <td style={{ ...celda, textAlign: 'center' }}><span style={casilla} /></td>
      <td style={celda} />
    </tr>
  )
}
