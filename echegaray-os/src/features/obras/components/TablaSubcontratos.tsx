'use client'

// ═══ LA TABLA DE PAQUETES — PORTE LITERAL DE `erp-obras/07.html` Y `M09.html` (dueño, 23/09/2026) ═══
//
// Paquete (nombre + «Rubro · N actividades») · Subcontratista · Actividades · Contratado · Certificado
// · Papeles, en la grilla `minmax(0,1.2fr) minmax(0,1fr) 108px 132px 132px 116px` con 22px de
// separación; encabezado de 34px, filas de 62px. En el teléfono (M09): filas de 64px con nombre,
// «Tercero · N personas» y a la derecha el estado y el importe.
//
// LA PLATA NO SE ESCONDE: NO SE PIDE. Sin `economia` las dos columnas de importes no se dibujan —un
// lugar vacío donde va la plata invita a preguntar por qué—; con permiso, «sin precio cargado» y
// «—» son la ausencia escrita, nunca un $ 0.
//
// EL ESTADO QUE SE MUESTRA ES EL EFECTIVO, no el guardado: un paquete «en curso» sin ART dice el
// papel que lo frena. Ver `papelesDe` y `estadoTelefono` en `subcontratosReglas.ts`.

import { Ico, P } from './canon/Ico'
import { C, MONO } from './canon/tokens'
import { Hover } from './canon/Piezas'
import { plata } from './formato'
import { estadoTelefono, papelesDe, sublineaPaquete, sublineaTelefonoPaquete } from '../services/subcontratosReglas'
import type { Paquete } from '../services/subcontratosService'

const GRID_CON = 'minmax(0,1.2fr) minmax(0,1fr) 108px 132px 132px 116px'
const GRID_SIN = 'minmax(0,1.2fr) minmax(0,1fr) 108px 116px'
/** Por debajo de esto la grilla scrollea POR DENTRO: 488px de columnas fijas + 110px de gaps. */
const MIN_TABLA = 860

const TONO: Record<string, string> = {
  neg: C.neg, warn: C.warn, pos: C.pos, faint: C.tenue, curso: C.curso, muted: C.tintaSuave,
}

/** «$ 38,40 M» del diseño: dos decimales en millones. */
const millones = (v: number) => `$ ${(v / 1_000_000).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} M`
const importe = (v: number | null) => (v == null ? null : Math.abs(v) >= 1_000_000 ? millones(v) : plata(v))

export function TablaSubcontratos({
  paquetes, seleccionado, economia, onSeleccionar, telefono = false,
}: {
  paquetes: Paquete[]
  seleccionado: string | null
  economia: boolean
  onSeleccionar: (id: string) => void
  telefono?: boolean
}) {
  if (paquetes.length === 0) {
    return (
      <div style={{ fontSize: '12.5px', color: C.tintaSuave, padding: '18px 0' }} data-testid="sin-paquetes">
        Ningún paquete subcontratado. Se carga con «Nuevo paquete».
      </div>
    )
  }

  if (telefono) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column' }} data-testid="tabla-subcontratos">
        {paquetes.map((p) => {
          const e = estadoTelefono(p)
          const monto = economia ? importe(p.precio_contratado) : null
          return (
            <div key={p.id} data-testid={`fila-paquete-${p.id}`} data-seleccionada={p.id === seleccionado ? '1' : undefined}
              onClick={() => onSeleccionar(p.id)} role="button" tabIndex={0}
              onKeyDown={(ev) => { if (ev.key === 'Enter') onSeleccionar(p.id) }}
              style={{
                minHeight: '64px', display: 'flex', alignItems: 'center', gap: '10px', borderBottom: `1px solid ${C.borde}`,
                cursor: 'pointer', background: p.id === seleccionado ? C.tenueFondo : undefined,
              }}>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <div style={{ fontSize: '14px', fontWeight: 500, color: C.tinta }}>{p.nombre}</div>
                <div style={{ fontSize: '12px', color: C.tintaSuave, display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <Ico d={P.cuadrilla} s={11} />{sublineaTelefonoPaquete(p)}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                <span style={{ fontSize: '12px', color: TONO[e.tono], fontWeight: 500 }} data-testid="estado-paquete">{e.texto}</span>
                {economia && (
                  <span style={{ fontSize: '12px', color: C.tenue, fontVariantNumeric: 'tabular-nums' }}>
                    {monto ?? 'sin precio cargado'}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  const grid = economia ? GRID_CON : GRID_SIN
  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: `${MIN_TABLA}px` }} data-testid="tabla-subcontratos">
        <div style={{
          display: 'grid', gridTemplateColumns: grid, gap: '22px', height: '34px', alignItems: 'center',
          borderBottom: `1px solid ${C.borde}`, fontFamily: MONO,
          fontSize: '10.5px', letterSpacing: '.06em', color: C.tenue, textTransform: 'uppercase',
        }}>
          <div>Paquete</div><div>Subcontratista</div><div>Actividades</div>
          {economia && <div style={{ textAlign: 'right' }}>Contratado</div>}
          {economia && <div style={{ textAlign: 'right' }}>Certificado</div>}
          <div>Papeles</div>
        </div>
        {paquetes.map((p, i) => {
          const papeles = papelesDe(p)
          return (
            <Hover key={p.id} data-testid={`fila-paquete-${p.id}`} data-seleccionada={p.id === seleccionado ? '1' : undefined}
              onClick={() => onSeleccionar(p.id)}
              base={{
                display: 'grid', gridTemplateColumns: grid, gap: '22px', height: '62px', alignItems: 'center',
                borderBottom: i === paquetes.length - 1 ? undefined : `1px solid ${C.borde}`, fontSize: '13.5px',
                cursor: 'pointer', color: C.tinta, background: p.id === seleccionado ? C.tenueFondo : undefined,
              }}
              hover={{ background: C.tenueFondo }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nombre}</div>
                <div style={{ fontSize: '12px', color: C.tintaSuave }}>{sublineaPaquete(p)}</div>
              </div>
              <div style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {p.proveedor ?? <span style={{ color: C.tenue }} data-nulo="">sin subcontratista</span>}
              </div>
              <div style={{ color: C.tintaSuave, fontVariantNumeric: 'tabular-nums' }}>{p.vinculos.length}</div>
              {economia && (
                <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: p.precio_contratado == null ? C.tenue : C.tinta }}>
                  {importe(p.precio_contratado) ?? <span data-nulo="">sin precio cargado</span>}
                </div>
              )}
              {economia && (
                <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: p.certificado == null ? C.tenue : C.tinta }}>
                  {importe(p.certificado) ?? <span data-nulo="">—</span>}
                </div>
              )}
              <div style={{ color: TONO[papeles.tono], fontSize: '12.5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                data-testid="papeles-paquete" title={papeles.texto}>{papeles.texto}</div>
            </Hover>
          )
        })}
      </div>
    </div>
  )
}
