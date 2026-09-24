'use client'

// LA LISTA DE ÍTEMS DEL TELÉFONO — PORTE LITERAL DE «M05 · Obra · Trabajo · Tareas» (390).
//
//   buscador   44px con lupa, «Buscar tarea», borde `#D7D5CF`, radio 6 · al lado el botón de
//              filtros de 44×44 con el globo amarillo (mono 10,5/600) que cuenta los activos
//   grupo      40px: chevron faint · nombre 13/600 · conteo mono 11 faint · % a la derecha 12 muted
//              («sin avance» en itálica faint cuando no hay nada medido)
//   ítem       56px, sangría 20, línea abajo: nombre 14 (+ «bloqueada» en rojo con el ícono),
//              bajada 12 muted («Cantidad · 890/1.100 m³» · «sin método de medición» en warn);
//              el % 13 a la derecha —rojo si bloqueada, ámbar si manual— o «no se puede medir» en
//              itálica faint; chevron a la derecha
//
// Tocar un ítem abre el panel de la tarea (misma pantalla, mismo estado que en escritorio).

import { useState } from 'react'
import { C, MONO } from '../canon/tokens'
import { Ico, P } from '../canon/Ico'
import { gruposTelefono, type FilaItem } from './filasDeItems'

const pct = (n: number | null) => n == null ? null : `${n.toLocaleString('es-AR', { maximumFractionDigits: 0 })}%`

export function ListaItems({ filas, query, alBuscar, filtrosActivos, alAbrirFiltros, alAbrir, vacio }: {
  filas: FilaItem[]
  query: string
  alBuscar: (q: string) => void
  filtrosActivos: number
  alAbrirFiltros: () => void
  alAbrir: (id: string) => void
  vacio: React.ReactNode
}) {
  const grupos = gruposTelefono(filas)
  const [plegados, setPlegados] = useState<ReadonlySet<string>>(new Set())
  const plegar = (id: string) => setPlegados((p) => { const s = new Set(p); if (s.has(id)) s.delete(id); else s.add(id); return s })

  return (
    <div style={{ padding: '16px 16px 100px', display: 'flex', flexDirection: 'column', gap: '14px' }} data-testid="lista-items">
      <div style={{ display: 'flex', gap: '8px' }}>
        <label style={{
          flex: 1, height: '44px', display: 'flex', alignItems: 'center', gap: '8px', padding: '0 12px',
          border: `1px solid ${C.bordeFuerte}`, borderRadius: '6px', fontSize: '13.5px', color: C.tenue, background: C.superficie,
        }}>
          <Ico d={P.buscar} s={14} />
          <input value={query} onChange={(e) => alBuscar(e.target.value)} placeholder="Buscar tarea" data-testid="buscar-tarea-telefono"
            style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', font: 'inherit', color: C.tinta }} />
        </label>
        <button type="button" onClick={alAbrirFiltros} aria-label="Filtros" data-testid="abrir-filtros-telefono" style={{
          width: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: `1px solid ${C.bordeFuerte}`, borderRadius: '6px', position: 'relative', flexShrink: 0,
          background: C.superficie, color: C.tinta, cursor: 'pointer',
        }}>
          <Ico d={P.filtro} s={15} />
          {filtrosActivos > 0 && (
            <span style={{
              position: 'absolute', top: '-6px', right: '-6px', minWidth: '18px', height: '18px', padding: '0 5px',
              borderRadius: '9px', background: C.marca, color: C.grafito, fontFamily: MONO, fontSize: '10.5px', fontWeight: 600,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>{filtrosActivos}</span>
          )}
        </button>
      </div>

      {grupos.length === 0 && <div style={{ fontSize: '12.5px', color: C.tintaSuave, padding: '12px 0' }}>{vacio}</div>}

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {grupos.map((g, gi) => {
          const abierto = !plegados.has(g.id)
          return (
            <div key={g.id} data-testid={`grupo-${g.id}`}>
              <button type="button" onClick={() => plegar(g.id)} style={{
                font: 'inherit', width: '100%', height: '40px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px',
                borderBottom: abierto || gi < grupos.length - 1 ? `1px solid ${C.borde}` : 'none',
                background: 'none', border: 'none', borderBottomStyle: 'solid', padding: 0, cursor: 'pointer', color: C.tinta,
              }}>
                <span style={{ color: C.tenue, display: 'flex' }}><Ico d={abierto ? P.abajo : P.derecha} s={13} /></span>
                <span style={{ fontWeight: 600 }}>{g.nombre}</span>
                <span style={{ fontFamily: MONO, fontSize: '11px', color: C.tenue }}>{g.n}</span>
                <span style={{ marginLeft: 'auto', fontSize: '12px', color: g.pct == null ? C.tenue : C.tintaSuave, fontStyle: g.pct == null ? 'italic' : 'normal' }}>
                  {g.pct == null ? 'sin avance' : pct(g.pct)}
                </span>
              </button>
              {abierto && g.filas.map((f) => (
                <button key={f.id} type="button" onClick={() => alAbrir(f.id)} data-testid={`item-telefono-${f.id}`} style={{
                  width: '100%', minHeight: '56px', display: 'flex', alignItems: 'center', gap: '10px', paddingLeft: '20px',
                  borderBottom: `1px solid ${C.borde}`, background: 'none', border: 'none', borderBottomStyle: 'solid',
                  padding: '0 0 0 20px', cursor: 'pointer', font: 'inherit', textAlign: 'left', color: C.tinta,
                }}>
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px', padding: '8px 0' }}>
                    <div style={{ fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {f.nombre}
                      {f.bloqueada && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '11px', color: C.neg, fontWeight: 500 }}>
                          <Ico d={P.bloqueo} s={11} />bloqueada
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '12px', color: f.medicion.tono === 'warn' ? C.warn : C.tintaSuave }}>{f.medicion.texto}</div>
                  </div>
                  <div style={{ fontSize: '13px', whiteSpace: 'nowrap', color: f.bloqueada ? C.neg : f.medicion.tono === 'warn' && f.puedeMedir ? C.warn : C.tinta }}>
                    {!f.puedeMedir
                      ? <span style={{ color: C.tenue, fontStyle: 'italic', fontSize: '12px' }}>no se puede medir</span>
                      : f.pctItem == null
                        ? <span style={{ color: C.tenue, fontStyle: 'italic', fontSize: '12px' }}>sin parte</span>
                        : pct(f.pctItem)}
                  </div>
                  <span style={{ color: C.tenue, display: 'flex' }}><Ico d={P.derecha} s={13} /></span>
                </button>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
