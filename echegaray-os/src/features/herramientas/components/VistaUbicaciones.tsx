// D04 · UBICACIONES — el parque por dónde está.
//
// «Control físico» es la acción «Recuento del lugar» de `DetalleLugar` (23/09); sin la columna «Último
// control» por fila: en su lugar va quién lo trajo, que sale del último movimiento. «Depósito» no existe: Taller y almacén
// son un solo lugar. Las obras se nombran por el índice (`rotuloDeObra`).
//
// El árbol de la izquierda es el «¿Dónde estás?» del teléfono (M01); el lugar elegido (`DetalleLugar`)
// trae las mismas acciones que el teléfono parado ahí. Paridad funcional, dueño 23/09/2026.

import Link from 'next/link'
import { Fragment } from 'react'
import { ETIQUETA_TIPO, ORDEN_TIPO, activosEn, rotuloUbicacion, vivo, type Parque } from '../logica/parque'
import type { TipoUbicacion, Ubicacion } from '../types'
import { DetalleLugar, type FiltroLugar } from './DetalleLugar'
import { IconoLugar } from './iconos'
import { NuevaUbicacion } from './NuevaUbicacion'
import { MONO, SUPERFICIE, V } from './estilo'

export type { FiltroLugar }

export function elegirUbicacion(p: Parque, u: string | null, tipo: string | null): Ubicacion | null {
  if (u) return p.ubicacionPorId.get(u) ?? null
  const conAlgo = (x: Ubicacion) => activosEn(p, x.id).length > 0
  const deTipo = p.ubicaciones.filter((x) => !x.archivada && (!tipo || x.tipo === tipo))
  return deTipo.find(conAlgo) ?? deTipo.find((x) => x.tipo === 'taller') ?? deTipo[0] ?? null
}

export function VistaUbicaciones({ parque, ubicacion, filtro }: {
  parque: Parque
  ubicacion: Ubicacion | null
  filtro: FiltroLugar
}) {
  const sinUbic = parque.activos.filter((a) => vivo(a) && !a.ubicacion_id).length
  return (
    <div style={{ display: 'flex', alignItems: 'stretch', minHeight: 620 }}>
      <div style={{ width: 330, maxWidth: '100%', flexShrink: 0, padding: '22px 20px 28px', borderRight: `1px solid ${V.linea}`, display: 'flex', flexDirection: 'column', gap: 16 }} data-testid="arbol-ubicaciones">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h1 style={{ fontSize: '14px', fontWeight: 600 }}>Ubicaciones</h1>
          <NuevaUbicacion />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', fontSize: '13px' }}>
          {ORDEN_TIPO.map((tipo, i) => <Grupo key={tipo} parque={parque} tipo={tipo} primero={i === 0} actual={ubicacion?.id ?? null} />)}
          {sinUbic > 0 && (
            <Link href="/herramientas/inventario?clase=todo&ubicacion=sin" prefetch={false} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 38, color: V.warn, marginTop: 8 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><IconoLugar tipo="sin_ubicacion" />Sin ubicación cargada</span>
              <span>{sinUbic}</span>
            </Link>
          )}
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 0, padding: '22px 26px 28px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {ubicacion ? <DetalleLugar ubicacionId={ubicacion.id} filtro={filtro} /> : (
          <div style={{ fontSize: '13px', color: V.tenue }}>Todavía no hay ubicaciones con activos.</div>
        )}
      </div>
    </div>
  )
}

function Grupo({ parque, tipo, primero, actual }: { parque: Parque; tipo: TipoUbicacion; primero: boolean; actual: string | null }) {
  const lugares = parque.ubicaciones
    .filter((u) => u.tipo === tipo && !u.archivada)
    .map((u) => ({ u, n: activosEn(parque, u.id).length }))
    .filter((x) => x.n > 0 || x.u.tipo === 'taller' || x.u.tipo === 'servicio_tecnico' || x.u.tipo === 'tercero')
    .sort((a, b) => b.n - a.n || rotuloUbicacion(parque, a.u.id).localeCompare(rotuloUbicacion(parque, b.u.id)))
  if (lugares.length === 0) return null
  const total = lugares.reduce((s, x) => s + x.n, 0)
  return (
    <Fragment>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 38, borderBottom: `1px solid ${V.linea}`, marginTop: primero ? 0 : 8 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 500 }}><IconoLugar tipo={tipo} />{ETIQUETA_TIPO[tipo]}</span>
        <span style={{ color: V.apagado }}>{total}</span>
      </div>
      {lugares.map(({ u, n }) => {
        const on = u.id === actual
        return (
          <Link
            key={u.id} href={`/herramientas/ubicaciones?u=${u.id}`} prefetch={false} data-testid="lugar" className="hover:bg-surface-quiet"
            aria-current={on ? 'page' : undefined}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, minHeight: 34, paddingLeft: 14, borderBottom: `1px solid ${V.linea}`,
              color: on ? V.tinta : V.tintaSuave, fontWeight: on ? 500 : 400, background: on ? SUPERFICIE : undefined, boxShadow: on ? `inset 2px 0 0 ${V.marca}` : undefined,
            }}
          >
            <span style={{ ...(u.tipo === 'rodado' ? { fontFamily: MONO, fontSize: '12.5px' } : {}), minWidth: 0 }} className="truncate">{rotuloUbicacion(parque, u.id)}</span>
            <span style={{ color: on ? V.apagado : V.tenue }}>{n}</span>
          </Link>
        )
      })}
    </Fragment>
  )
}
