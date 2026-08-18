// OPERACIÓN DE LA OBRA — qué pidió, qué compró y qué recursos se movieron.
//
// LAS CUATRO LISTAS SON LO MISMO CON DISTINTO CONTENIDO, y por eso hay una sola `Tabla`: cuatro
// tablas escritas a mano se desalinean en el primer cambio de densidad. La sub-vista viaja por
// query string igual que `vista`, así que cada lista es una URL que se comparte y el servidor
// renderiza sin estado de cliente.
//
// LO QUE NO ESTÁ ES LO QUE NO EXISTE. Pedidos no muestra "solicitante": ni el Sheet de respaldo ni
// la tabla espejo lo tienen, y una columna vacía o rellenada con el responsable de otra cosa sería
// un dato fabricado. Compras no suma su propio total: muestra el que declara la fuente única del
// costo real, y si el detalle no llega a ese total lo dice en una línea en vez de disimularlo.

import Link from 'next/link'
import type { ReactNode } from 'react'
import { Badge } from '@/shared/components/ui'
import { estadoInfo, type Herramienta } from '@/features/integraciones/services/herramientasService'
import type { MovimientoConHerramienta } from '@/features/integraciones/services/movimientosService'
import type { PedidoMaterial } from '@/features/integraciones/services/pedidosMaterialesService'
import type { ComprasObra, SubOperacion } from '../services/operacionService'
import { fecha, plata } from './formato'

const SUBS: { id: SubOperacion; label: string }[] = [
  { id: 'pedidos', label: 'Pedidos' },
  { id: 'compras', label: 'Compras' },
  { id: 'herramientas', label: 'Herramientas' },
  { id: 'movimientos', label: 'Movimientos' },
]

const cantidad = (n: number | null) => (n == null ? '—' : n.toLocaleString('es-AR', { maximumFractionDigits: 2 }))

/** Un pedido está ENTREGADO o no; "pendiente" no es un problema y no lleva color de problema. */
const entregado = (estado: string | null) => (estado ?? '').toLowerCase().includes('entreg')

/** El tono de estado de una herramienta, traducido a los tonos del sistema visual. */
const TONO_HERRAMIENTA = { ok: 'pos', info: 'neutral', amber: 'warn', red: 'neg' } as const

function Vacio({ children }: { children: ReactNode }) {
  return <p className="px-4 py-6 text-[12px] leading-relaxed text-faint">{children}</p>
}

/** El contenedor scrollea por dentro: a 390px la página no puede correrse a lo ancho. */
function Tabla({ testid, cols, children }: { testid: string; cols: { k: string; num?: boolean }[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-card border border-line bg-surface">
      <table data-testid={testid} className="w-full min-w-[560px] text-left">
        <thead>
          <tr className="border-b border-line text-[10px] uppercase tracking-wide text-faint">
            {cols.map((c) => (
              <th key={c.k} className={`px-3 py-2 font-medium first:pl-4 last:pr-4 ${c.num ? 'text-right' : ''}`}>{c.k}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

function Fila({ children }: { children: ReactNode }) {
  return <tr className="border-b border-line/60 last:border-0">{children}</tr>
}

function C({ children, num, fuerte }: { children: ReactNode; num?: boolean; fuerte?: boolean }) {
  return (
    <td className={`px-3 py-2 first:pl-4 last:pr-4 ${num ? 'text-right tabular-nums' : ''} ${fuerte ? 'text-[13px] text-ink' : 'text-[12px] text-muted'}`}>
      {children}
    </td>
  )
}

function Pedidos({ pedidos }: { pedidos: PedidoMaterial[] }) {
  if (!pedidos.length) {
    return <Vacio>Los pedidos de material se registran a nombre de la obra, y ninguno quedó a nombre de ésta.</Vacio>
  }
  return (
    <Tabla testid="tabla-pedidos" cols={[{ k: 'Fecha' }, { k: 'Material' }, { k: 'Cantidad', num: true }, { k: 'Estado' }]}>
      {pedidos.map((p) => (
        <Fila key={p.id_pedido}>
          <C num>{fecha(p.fecha)}</C>
          <C fuerte>{p.material ?? '—'}</C>
          <C num>{cantidad(p.cantidad)}</C>
          <C>{p.estado ? entregado(p.estado) ? <Badge tono="pos">{p.estado}</Badge> : p.estado : '—'}</C>
        </Fila>
      ))}
    </Tabla>
  )
}

function Compras({ compras }: { compras: ComprasObra }) {
  if (!compras.filas.length) {
    // NO HAY COMPRAS y NO PUDE TRAERLAS son cosas distintas. Si la fuente del costo real declara
    // plata para esta obra y el detalle vino vacío, decir "no hay ninguna" sería tapar un agujero
    // con una frase tranquilizadora.
    return compras.completo ? (
      <Vacio>Todavía no hay ninguna compra imputada a esta obra.</Vacio>
    ) : (
      <p className="px-4 py-6 text-[12px] leading-relaxed text-warn">
        Esta obra tiene {plata(compras.total)} en compras registradas, pero acá no se pudo listar ninguna.
      </p>
    )
  }
  return (
    <div className="space-y-2">
      <Tabla
        testid="tabla-compras"
        cols={[{ k: 'Fecha' }, { k: 'Proveedor' }, { k: 'Concepto' }, { k: 'Comprobante' }, { k: 'Importe', num: true }]}
      >
        {compras.filas.map((c) => (
          <Fila key={c.id}>
            <C num>{fecha(c.fecha)}</C>
            <C fuerte>{c.proveedor ?? '—'}</C>
            <C>{c.concepto ?? '—'}</C>
            <C>{c.comprobante ?? '—'}</C>
            <C num fuerte>{plata(c.total)}</C>
          </Fila>
        ))}
        <tr className="border-t border-line-strong">
          <td colSpan={4} className="px-3 py-2 pl-4 text-[12px] text-muted">Costo real de la obra</td>
          <td className="px-3 py-2 pr-4 text-right text-[13px] font-semibold tabular-nums text-ink">{plata(compras.total)}</td>
        </tr>
      </Tabla>
      {/* El total lo declara la fuente del costo real; el detalle se lista aparte. Cuando no
          coinciden se dice cuánto se está viendo, en vez de dejar creer que la lista es todo. */}
      {!compras.completo && (
        <p className="text-[11px] text-warn">
          Se listan {compras.filas.length} de {compras.nComprobantes ?? 0} comprobantes.
        </p>
      )}
    </div>
  )
}

function Herramientas({ herramientas }: { herramientas: Herramienta[] }) {
  if (!herramientas.length) {
    return <Vacio>Ninguna herramienta figura hoy en esta obra.</Vacio>
  }
  return (
    <Tabla testid="tabla-herramientas" cols={[{ k: 'Herramienta' }, { k: 'Categoría' }, { k: 'Estado' }, { k: 'Responsable' }]}>
      {herramientas.map((h) => {
        const e = estadoInfo(h.estado)
        return (
          <Fila key={h.id_herramienta}>
            <C fuerte>{h.nombre}</C>
            <C>{h.categoria ?? '—'}</C>
            <C><Badge tono={TONO_HERRAMIENTA[e.tone]}>{e.label}</Badge></C>
            <C>{h.responsable_actual ?? '—'}</C>
          </Fila>
        )
      })}
    </Tabla>
  )
}

function Movimientos({ movimientos }: { movimientos: MovimientoConHerramienta[] }) {
  if (!movimientos.length) {
    return <Vacio>Todavía no se movió ninguna herramienta hacia esta obra.</Vacio>
  }
  return (
    <Tabla testid="tabla-movimientos" cols={[{ k: 'Fecha' }, { k: 'Herramienta' }, { k: 'Responsable' }]}>
      {movimientos.map((m) => (
        <Fila key={m.id_movimiento}>
          <C num>{fecha(m.fecha)}</C>
          <C fuerte>{m.herramienta_nombre ?? '—'}</C>
          <C>{m.responsable ?? '—'}</C>
        </Fila>
      ))}
    </Tabla>
  )
}

export function TabOperacion({
  sub, obraId, pedidos, compras, herramientas, movimientos,
}: {
  sub: SubOperacion
  obraId: string
  pedidos: PedidoMaterial[]
  compras: ComprasObra
  herramientas: Herramienta[]
  movimientos: MovimientoConHerramienta[]
}) {
  const cuenta: Record<SubOperacion, number> = {
    pedidos: pedidos.length,
    // La cobertura del costo real la declara la fuente; el largo de la lista es lo que se ve.
    compras: compras.nComprobantes ?? compras.filas.length,
    herramientas: herramientas.length,
    movimientos: movimientos.length,
  }

  return (
    <div className="space-y-3">
      {/* Cuatro sub-vistas entran en 390px sólo si el conmutador se desplaza en vez de envolverse. */}
      <nav className="-mx-0.5 overflow-x-auto px-0.5 pb-0.5">
        <div className="inline-flex gap-0.5 rounded-control border border-line bg-surface p-0.5">
          {SUBS.map((s) => {
            const activa = s.id === sub
            return (
              <Link
                key={s.id}
                href={`/obras/${obraId}?vista=operacion&sub=${s.id}`}
                aria-current={activa ? 'page' : undefined}
                className={`flex shrink-0 items-center gap-1.5 rounded-[5px] px-3 py-1.5 text-[13px] font-medium transition ${
                  activa ? 'bg-accent text-white' : 'text-muted hover:bg-surface-sunken hover:text-ink'
                }`}
              >
                {s.label}
                <span className={`text-[11px] tabular-nums ${activa ? 'text-white/60' : 'text-faint'}`}>{cuenta[s.id]}</span>
              </Link>
            )
          })}
        </div>
      </nav>

      {sub === 'pedidos' && <Pedidos pedidos={pedidos} />}
      {sub === 'compras' && <Compras compras={compras} />}
      {sub === 'herramientas' && <Herramientas herramientas={herramientas} />}
      {sub === 'movimientos' && <Movimientos movimientos={movimientos} />}
    </div>
  )
}
