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
import { DetalleCliente } from './DetalleCliente'
import { clientesConObras, SIN_CLIENTE, type ClienteLugar } from '../logica/clientes-lugar'
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

export function VistaUbicaciones({ parque, ubicacion, filtro, cliente = null }: {
  parque: Parque
  ubicacion: Ubicacion | null
  filtro: FiltroLugar
  /** `?cliente=`: el cliente elegido (el lugar físico), con todo lo de sus obras. */
  cliente?: string | null
}) {
  const sinUbic = parque.activos.filter((a) => vivo(a) && !a.ubicacion_id && a.clase !== 'epp' && a.clase !== 'ropa').length
  const clientes = clientesConObras(parque)
  const elegido = cliente ? clientes.find((c) => c.clave === cliente) ?? null : null
  return (
    <div style={{ display: 'flex', alignItems: 'stretch', minHeight: 620 }}>
      <div style={{ width: 330, maxWidth: '100%', flexShrink: 0, padding: '22px 20px 28px', borderRight: `1px solid ${V.linea}`, display: 'flex', flexDirection: 'column', gap: 16 }} data-testid="arbol-ubicaciones">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h1 style={{ fontSize: '14px', fontWeight: 600 }}>Ubicaciones</h1>
          <NuevaUbicacion />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', fontSize: '13px' }}>
          {ORDEN_TIPO.map((tipo, i) => (tipo === 'obra'
            ? <GrupoClientes key={tipo} clientes={clientes} actual={elegido ? null : ubicacion?.id ?? null} clienteActual={elegido?.clave ?? null} />
            : <Grupo key={tipo} parque={parque} tipo={tipo} primero={i === 0} actual={elegido ? null : ubicacion?.id ?? null} />))}
          {sinUbic > 0 && (
            <Link href="/herramientas/inventario?clase=todo&ubicacion=sin" prefetch={false} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 38, color: V.warn, marginTop: 8 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><IconoLugar tipo="sin_ubicacion" />Sin ubicación cargada</span>
              <span>{sinUbic}</span>
            </Link>
          )}
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 0, padding: '22px 26px 28px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {elegido ? <DetalleCliente key={elegido.clave} cliente={elegido} /> : ubicacion ? <DetalleLugar ubicacionId={ubicacion.id} filtro={filtro} /> : (
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

/**
 * OBRAS → CLIENTES (dueño, 25/09/2026): como la cartera de Obras y el CRM, el cliente es el encabezado y
 * sus obras van debajo. El cliente es el lugar físico (el mismo predio) y se elige entero; la obra es a qué
 * se imputa y se elige sola.
 */
function GrupoClientes({ clientes, actual, clienteActual }: { clientes: ClienteLugar[]; actual: string | null; clienteActual: string | null }) {
  if (!clientes.length) return null
  const total = clientes.reduce((s, c) => s + c.n, 0)
  return (
    <Fragment>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 38, borderBottom: `1px solid ${V.linea}`, marginTop: 8 }} data-testid="grupo-clientes">
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 500 }}><IconoLugar tipo="obra" />Clientes</span>
        <span style={{ color: V.apagado }}>{total}</span>
      </div>
      {clientes.map((c) => {
        const on = c.clave === clienteActual
        return (
          <Fragment key={c.clave}>
            <Link
              href={`/herramientas/ubicaciones?cliente=${c.clave}`} prefetch={false} data-testid="cliente-lugar" data-cliente={c.clave}
              className="hover:bg-surface-quiet" aria-current={on ? 'page' : undefined}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, minHeight: 36, paddingLeft: 14, borderBottom: `1px solid ${V.linea}`,
                color: c.clave === SIN_CLIENTE ? V.apagado : V.tinta, fontWeight: 600, background: on ? SUPERFICIE : undefined, boxShadow: on ? `inset 2px 0 0 ${V.marca}` : undefined,
              }}
            >
              <span className="truncate" style={{ minWidth: 0 }}>{c.nombre ?? (c.clave === SIN_CLIENTE ? 'Sin cliente cargado' : 'Cliente')}</span>
              <span style={{ color: V.apagado, fontWeight: 400 }}>{c.n}</span>
            </Link>
            {c.obras.map((o) => {
              const onO = o.ubicacionId === actual
              return (
                <Link
                  key={o.ubicacionId} href={`/herramientas/ubicaciones?u=${o.ubicacionId}`} prefetch={false} data-testid="lugar" className="hover:bg-surface-quiet"
                  aria-current={onO ? 'page' : undefined}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, minHeight: 34, paddingLeft: 28, borderBottom: `1px solid ${V.linea}`,
                    color: onO ? V.tinta : V.tintaSuave, fontWeight: onO ? 500 : 400, background: onO ? SUPERFICIE : undefined, boxShadow: onO ? `inset 2px 0 0 ${V.marca}` : undefined,
                  }}
                >
                  <span className="truncate" style={{ minWidth: 0 }}>{o.rotulo}</span>
                  <span style={{ color: onO ? V.apagado : V.tenue }}>{o.n}</span>
                </Link>
              )
            })}
          </Fragment>
        )
      })}
    </Fragment>
  )
}
