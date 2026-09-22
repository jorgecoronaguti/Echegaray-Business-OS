'use client'

// EL CONTROL DE HERRAMIENTAS DE LA OBRA, PARA IMPRIMIR — ver `logica/planilla.ts`.
//
// No es la hoja de papel copiada (dueño, 22/09): es lo que el sistema sabe de esa obra, puesto para
// controlarlo en el lugar. Lo que hay hoy por categoría con casilleros «está / falta», lo que ya tiene
// un problema, lo que entró y salió en 30 días, y las firmas. Al imprimir se ocultan menú y botones.
//
// La columna «Observación» se escribe en pantalla antes de imprimir (dueño, 22/09: «q la columna
// observacion pueda ser editable para hacer anotaciones e imprimir»). Son notas de la hoja, no un dato
// del activo: quedan en ESTE navegador para esa obra (sobreviven a una recarga) y no van a la base.

import Link from 'next/link'
import { useSyncExternalStore, type CSSProperties } from 'react'
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
  return <Planilla parque={parque} u={u} />
}

function Planilla({ parque, u }: { parque: Parque; u: NonNullable<ReturnType<Parque['ubicacionPorId']['get']>> }) {
  const [notas, anotar] = useNotas(u.id)
  const hayNotas = Object.values(notas).some((t) => t.trim())
  const hoy = new Date()
  const c = controlDeUbicacion(parque, u.id, hoy)
  const obra = u.obra_id ? parque.obraPorId.get(u.obra_id) : null

  return (
    <div style={{ ...pagina, maxWidth: 1100 }} data-testid="planilla">
      <style>{`@media print {
        header, nav, [data-no-imprimir] { display: none !important; }
        [data-nota-pantalla] { display: none !important; }
        [data-nota-papel] { display: block !important; }
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
          {hayNotas && (
            <button type="button" data-testid="borrar-notas" style={{ fontSize: '13px', color: V.apagado }}
              onClick={() => { if (window.confirm('¿Borrar todas las observaciones escritas en esta planilla?')) anotar(null, '') }}>
              Borrar observaciones
            </button>
          )}
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
        <div data-no-imprimir style={{ fontSize: '12px', color: V.apagado }}>La columna «Observación» se puede escribir acá antes de imprimir. Queda guardada en esta computadora para esta obra.</div>
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
                ...g.filas.map((f) => <FilaImpresa key={f.activo.id} f={f} nota={notas[f.activo.id] ?? ''} onNota={(t) => anotar(f.activo.id, t)} />),
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

function FilaImpresa({ f, nota, onNota }: { f: FilaControl; nota: string; onNota: (t: string) => void }) {
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
      <td style={{ ...celda, padding: '3px 4px' }}>
        <textarea
          data-nota-pantalla data-testid="observacion-planilla" aria-label={`Observación de ${a.codigo}`}
          value={nota} onChange={(e) => onNota(e.target.value)} maxLength={300} rows={1}
          style={{ width: '100%', minHeight: 26, border: `1px solid ${nota ? V.lineaFuerte : V.linea}`, borderRadius: 4, padding: '4px 6px', fontSize: '12px', fontFamily: 'inherit', resize: 'vertical', background: '#FFFFFF', fieldSizing: 'content' } as CSSProperties}
        />
        <div data-nota-papel data-testid="observacion-papel" style={{ display: 'none', whiteSpace: 'pre-wrap', fontSize: '12px', padding: '3px 4px' }}>{nota}</div>
      </td>
    </tr>
  )
}

// ── LAS NOTAS DE LA HOJA, EN ESTE NAVEGADOR ──────────────────────────────────────────────────────
// Por obra: `planilla-notas:<ubicación>` → { activo_id: texto }. Si el navegador no deja guardar
// (ventana privada, almacenamiento bloqueado), se escribe e imprime igual: sólo no sobrevive a una recarga.

const avisos = new Set<() => void>()
const memoria = new Map<string, string>()
const clave = (u: string) => `planilla-notas:${u}`

function leerCrudo(u: string): string {
  try { return window.localStorage.getItem(clave(u)) ?? memoria.get(u) ?? '{}' } catch { return memoria.get(u) ?? '{}' }
}

function useNotas(u: string): [Record<string, string>, (activo: string | null, texto: string) => void] {
  const crudo = useSyncExternalStore(
    (cb) => { avisos.add(cb); return () => { avisos.delete(cb) } },
    () => leerCrudo(u),
    () => '{}',
  )
  let notas: Record<string, string> = {}
  try { notas = JSON.parse(crudo) as Record<string, string> } catch { notas = {} }
  const anotar = (activo: string | null, texto: string) => {
    const nuevas = activo ? { ...notas, [activo]: texto } : {}
    for (const k of Object.keys(nuevas)) if (!nuevas[k]) delete nuevas[k]
    const json = JSON.stringify(nuevas)
    memoria.set(u, json)
    try { window.localStorage.setItem(clave(u), json) } catch { /* sin almacenamiento: queda en memoria */ }
    for (const cb of avisos) cb()
  }
  return [notas, anotar]
}
