// 10 · M13 — PEDIDOS: qué se pidió, cuánto, quién, en qué estado y en qué se convirtió.
//
// Escritorio (10): grilla Fecha · Qué se pidió · Cant. · Quién lo pidió · Estado · Se convirtió en, filas
// de 58. Teléfono (M13): filas de 60 con el icono de material, cantidad · actividad debajo, y a la derecha
// el estado en minúscula sobre la fecha en mono; el pie dice de dónde nacen.
//
// Sin `'use client'`: no hay estado. Lo que se dice de cada fila lo decide `operacionCanon.ts`.

import { Ico, P } from '../canon/Ico'
import type { Actividad } from '../../types'
import type { PedidoOperacion } from '../../services/operacionService'
import {
  cantidadPedido, diaMes, estadoPedidoEscritorio, estadoPedidoTelefono, pieDePedidos, seConvirtioEn,
} from '../../services/operacionCanon'
import { Celda, DerechaM, Falta, FilaM, GridCab, GridFila, PieM } from './piezas'
import { C } from '../canon/tokens'

const COLS = '94px minmax(0,1.6fr) 90px 130px 128px 132px'

export function Pedidos({ pedidos, actividades, actividadDe }: {
  pedidos: PedidoOperacion[]
  actividades: Actividad[]
  /** El selector de actividad del pedido (superficie del deshacer, vive en `TabOperacion`). */
  actividadDe?: (p: PedidoOperacion) => React.ReactNode
}) {
  const nombreDe = (id: string | null) => (id ? actividades.find((a) => a.id === id)?.nombre ?? null : null)
  const vacio = pedidos.length === 0 && (
    <div style={{ padding: '18px 0', fontSize: '13px', color: C.tenue }} data-testid="pedidos-vacio">
      Ningún pedido de material a nombre de esta obra.
    </div>
  )
  return (
    <>
      {/* ═══ ESCRITORIO (10) ═══ */}
      <div className="hidden md:flex" style={{ flexDirection: 'column', gap: '24px' }} data-testid="pedidos-escritorio">
        <div style={{ overflowX: 'auto' }}><div style={{ display: 'flex', flexDirection: 'column', minWidth: '900px' }} data-testid="tabla-pedidos">
          <GridCab columnas={COLS} celdas={[{ t: 'Fecha' }, { t: 'Qué se pidió' }, { t: 'Cant.', der: true }, { t: 'Quién lo pidió' }, { t: 'Estado' }, { t: 'Se convirtió en' }]} />
          {vacio}
          {pedidos.map((p, i) => {
            const e = estadoPedidoEscritorio(p.estado)
            const c = seConvirtioEn(p.estado)
            return (
              <GridFila key={p.id_pedido} columnas={COLS} alto={58} ultima={i === pedidos.length - 1} sangria={0}
                testid={`pedido-${p.id_pedido}`}>
                <Celda tono="suave">{diaMes(p.fecha) ?? <Falta>sin fecha</Falta>}</Celda>
                <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <Celda>{p.material ?? <Falta>sin material declarado</Falta>}</Celda>
                  {actividadDe?.(p)}
                </div>
                <Celda der>{p.cantidad == null ? <Falta>sin cantidad</Falta> : cantidadPedido(p.cantidad, p.unidad)}</Celda>
                <Celda tono="media">{p.quien ?? <Falta>sin registrar</Falta>}</Celda>
                <Celda tono={e.tono}>{e.texto}</Celda>
                <Celda tono={c.tono === 'tenue' ? 'tenue' : 'media'} sub>{c.texto}</Celda>
              </GridFila>
            )
          })}
        </div></div>
      </div>

      {/* ═══ TELÉFONO (M13) ═══ */}
      <div className="flex md:hidden" style={{ flexDirection: 'column', gap: '14px' }} data-testid="pedidos-telefono">
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {vacio}
          {pedidos.map((p, i) => {
            const e = estadoPedidoTelefono(p.estado)
            const act = nombreDe(p.actividad_id)
            return (
              <FilaM key={p.id_pedido} icono={<Ico d={P.material} s={15} />} titulo={p.material ?? <Falta>sin material declarado</Falta>}
                sub={<>{cantidadPedido(p.cantidad, p.unidad)} · {act ?? <Falta>sin actividad</Falta>}</>}
                derecha={<DerechaM texto={e.texto} tono={e.tono} fecha={diaMes(p.fecha) ?? 'sin fecha'} />}
                ultima={i === pedidos.length - 1} testid={`pedido-telefono-${p.id_pedido}`} />
            )
          })}
        </div>
        <PieM testid="pie-pedidos">{pieDePedidos(pedidos)}</PieM>
      </div>
    </>
  )
}
