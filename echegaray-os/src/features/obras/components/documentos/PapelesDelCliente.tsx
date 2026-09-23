// 14 · M17 — «Papeles del cliente»: lo que el cliente mandó por mail y vive en el OS, no en Drive.
//
// Escritorio: título 14/600 con «bajados del mail · viven en el OS, no en Drive», y filas de 48 en
// grilla 150 / 1fr / 120 / 150 / 150: tipo · número (500) con «· retención N adjunta» · fecha entera
// mono · importe a la derecha · «PDF en Drive» / «PDF en el OS». Teléfono: eyebrow «Papeles del
// cliente» con «en el OS», filas de 46 con número y «fecha · dónde vive» debajo, importe mono a la derecha.
//
// El importe es precio de venta: sólo para quien ve economía. `null` = la lectura falló, y eso NO se
// dibuja como «no hay ninguna». Sin `'use client'`.

import { agruparPapeles, hrefDelPapel, type Orden } from '@/features/clientes/services/papelesCliente'
import type { OrdenDetallada } from '@/features/clientes/services/ordenesCliente'
import { C, MONO } from '../canon/tokens'
import { cifraM } from '../../services/operacionCanon'
import { ROTULO_ORDEN, dondeVive, fechaPapel, numeroOrden, retencionAdjunta } from '../../services/documentosCanon'
import { Eyebrow, GridFila, TituloBloque } from '../operacion/piezas'

const COLS = '150px minmax(0,1fr) 120px 150px 150px'

/** Las órdenes de esta obra ya agrupadas: OC primero, después OP. El certificado cuelga de su OP. */
export function ordenesDeLaObra(ordenes: OrdenDetallada[]): Orden[] {
  const g = agruparPapeles(ordenes.map((o) => ({ ...o, obra_id: null })))
  return [...g.oc, ...g.op]
}

export function PapelesDelCliente({ ordenes, veEconomia }: { ordenes: OrdenDetallada[] | null; veEconomia: boolean }) {
  if (ordenes === null) {
    return (
      <p data-testid="papeles-no-leidos" style={{ fontSize: '12.5px', color: C.warn }}>
        No pude leer los papeles del cliente. Esta pantalla no puede afirmar que no haya ninguno.
      </p>
    )
  }
  const filas = ordenesDeLaObra(ordenes)
  // Sin ninguna orden y con lectura buena, el bloque no se dibuja: sería ruido en cada obra sin OC.
  if (filas.length === 0) return null
  const importe = (o: Orden) => (veEconomia ? (o.importe == null ? 'sin importe' : cifraM(o.importe)) : null)

  return (
    <>
      <div className="hidden md:flex" style={{ flexDirection: 'column', gap: '10px' }} data-testid="papeles-del-cliente">
        <TituloBloque titulo="Papeles del cliente" meta="bajados del mail · viven en el OS, no en Drive" />
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {filas.map((o, i) => {
            const ret = retencionAdjunta(o.numeroCorto, o.retenciones.length)
            return (
              <GridFila key={o.clave} columnas={COLS} alto={48} ultima={i === filas.length - 1} sangria={0} testid={`papel-${o.clave}`}>
                <div style={{ color: C.tintaSuave, fontSize: '12.5px' }}>{ROTULO_ORDEN[o.clase]}</div>
                <div style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <a href={hrefDelPapel({ driveFileId: o.driveFileId, archivoId: o.archivoId })} target="_blank" rel="noreferrer"
                    style={{ fontWeight: 500, color: C.tinta }} data-testid="papel-enlace">{numeroOrden(o.clase, o.numeroCorto)}</a>
                  {ret && <span style={{ color: C.tintaSuave, fontSize: '12.5px' }}> {ret}</span>}
                </div>
                <div style={{ color: C.tintaSuave, fontFamily: MONO, fontSize: '12.5px' }}>{fechaPapel(o.fecha)}</div>
                <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{importe(o) ?? <span style={{ color: C.tenue }}>—</span>}</div>
                <div style={{ color: C.tintaSuave, fontSize: '12.5px', textAlign: 'right' }}>{dondeVive(o.driveFileId)}</div>
              </GridFila>
            )
          })}
        </div>
      </div>

      <div className="flex md:hidden" style={{ flexDirection: 'column', gap: '6px' }} data-testid="papeles-del-cliente-telefono">
        <Eyebrow derecha="en el OS">Papeles del cliente</Eyebrow>
        {filas.map((o, i) => {
          const ret = retencionAdjunta(o.numeroCorto, o.retenciones.length)
          return (
            <div key={o.clave} style={{
              minHeight: '46px', display: 'flex', alignItems: 'center', gap: '12px', fontSize: '14px',
              borderBottom: i === filas.length - 1 ? 'none' : `1px solid ${C.borde}`,
            }}>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <div>
                  <a href={hrefDelPapel({ driveFileId: o.driveFileId, archivoId: o.archivoId })} target="_blank" rel="noreferrer" style={{ fontWeight: 500, color: C.tinta }}>
                    {numeroOrden(o.clase, o.numeroCorto)}
                  </a>
                  {ret && <span style={{ fontSize: '12px', color: C.tintaSuave }}> {ret.replace(` ${o.numeroCorto ?? 's/n'} `, ' ')}</span>}
                </div>
                <div style={{ fontSize: '12px', color: C.tintaSuave }}>{fechaPapel(o.fecha)} · {dondeVive(o.driveFileId)}</div>
              </div>
              {importe(o) != null && <span style={{ fontFamily: MONO, flexShrink: 0 }}>{importe(o)}</span>}
            </div>
          )
        })}
      </div>
    </>
  )
}
