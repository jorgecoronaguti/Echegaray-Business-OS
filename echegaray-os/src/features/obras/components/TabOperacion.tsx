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

'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Badge } from '@/shared/components/ui'
import { estadoInfo } from '@/features/integraciones/services/herramientasService'
import type {
  HerramientaOperacion, MovimientoOperacion, PedidoOperacion,
} from '../services/operacionService'
import type { ComprasObra, SubOperacion } from '../services/operacionService'
import { BloqueImpedimentos } from './BloqueImpedimentos'
import { Callout, type AccionFormulario, type ResultadoAccion } from '@/shared/components/ui'
import type { Actividad, Restriccion } from '../types'
import { fecha, plata } from './formato'
// LAS MISMAS PIEZAS QUE LA VISTA GLOBAL. Eran privadas de este archivo; se mudaron a `tablas.tsx`
// cuando apareció `/obras/operacion`, para que las dos pantallas no se separen por copia.
import { C, Fila, Tabla, Vacio } from './tablas'

const SUBS: { id: SubOperacion; label: string }[] = [
  { id: 'pedidos', label: 'Pedidos' },
  { id: 'compras', label: 'Compras' },
  { id: 'herramientas', label: 'Herramientas' },
  { id: 'movimientos', label: 'Movimientos' },
  { id: 'impedimentos', label: 'Impedimentos' },
]

const cantidad = (n: number | null) => (n == null ? '—' : n.toLocaleString('es-AR', { maximumFractionDigits: 2 }))

/** Un pedido está ENTREGADO o no; "pendiente" no es un problema y no lleva color de problema. */
const entregado = (estado: string | null) => (estado ?? '').toLowerCase().includes('entreg')

/** El tono de estado de una herramienta, traducido a los tonos del sistema visual. */
const TONO_HERRAMIENTA = { ok: 'pos', info: 'neutral', amber: 'warn', red: 'neg' } as const

/**
 * LOS PEDIDOS, Y PARA QUÉ ACTIVIDAD SON.
 *
 * La columna ACTIVIDAD sólo aparece cuando la ficha pasa la lista de actividades y la acción: en la
 * vista global de Operación —donde las filas son de ocho obras distintas— un selector de actividades
 * no tendría de qué obra elegirlas.
 *
 * ES OPCIONAL Y SE VE QUE LO ES: «sin asignar» en gris, no un hueco. La obra sigue siendo el eje del
 * pedido; esto contesta «¿qué está esperando esta actividad?» cuando alguien lo sabe.
 */
function Pedidos({
  pedidos, actividades = [], asignar,
}: {
  pedidos: PedidoOperacion[]
  /** Decir para qué actividad es un pedido. Sin ella la columna no se dibuja: un selector que no
   *  persiste es peor que no tenerlo. */
  asignarActividadAPedido?: (idPedido: string, actividadId: string) => Promise<ResultadoAccion>
  actividades?: Actividad[]
  asignar?: (idPedido: string, actividadId: string) => Promise<ResultadoAccion>
}) {
  if (!pedidos.length) {
    return <Vacio>Los pedidos de material se registran a nombre de la obra, y ninguno quedó a nombre de ésta.</Vacio>
  }
  const elegibles = actividades.filter((a) => a.tipo !== 'resumen' && !a.archivada && !a.actividad_padre_id)
  const conActividad = Boolean(asignar) && elegibles.length > 0
  const cols = [{ k: 'Fecha' }, { k: 'Material' }, { k: 'Cantidad', num: true }, { k: 'Estado' }]
  return (
    <Tabla testid="tabla-pedidos" cols={conActividad ? [...cols, { k: 'Para' }] : cols}>
      {pedidos.map((p) => (
        <Fila key={p.id_pedido} obra={p.obra_canonica_id}>
          <C num>{fecha(p.fecha)}</C>
          <C fuerte>{p.material ?? '—'}</C>
          <C num>{cantidad(p.cantidad)}</C>
          <C>{p.estado ? entregado(p.estado) ? <Badge tono="pos">{p.estado}</Badge> : p.estado : '—'}</C>
          {conActividad && (
            <C>
              <SelectActividad
                actividades={elegibles}
                valor={p.actividad_id}
                alElegir={(id) => asignar!(p.id_pedido, id)}
              />
            </C>
          )}
        </Fila>
      ))}
    </Tabla>
  )
}

/** El selector guarda al elegir: un botón «guardar» por fila en una lista de treinta pedidos es
 *  treinta clics de más para un dato que es un solo campo. */
function SelectActividad({
  actividades, valor, alElegir,
}: {
  actividades: Actividad[]
  valor: string | null
  alElegir: (actividadId: string) => Promise<ResultadoAccion>
}) {
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <span className="flex flex-col gap-0.5">
      <select
        defaultValue={valor ?? ''}
        disabled={guardando}
        data-testid="pedido-actividad"
        className="w-full max-w-[220px] rounded border border-line bg-surface px-1.5 py-1 text-[12px] text-muted"
        onChange={async (e) => {
          setGuardando(true)
          setError(null)
          const r = await alElegir(e.target.value)
          if (!r.ok) setError(r.error ?? 'No se pudo guardar.')
          setGuardando(false)
        }}
      >
        <option value="">sin asignar</option>
        {actividades.map((a) => (
          <option key={a.id} value={a.id}>{a.rubro ? `${a.rubro} · ` : ''}{a.nombre}</option>
        ))}
      </select>
      {error && <span className="text-[11px] text-neg">{error}</span>}
    </span>
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
          <Fila key={c.id} obra={c.obra_canonica_id}>
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

function Herramientas({ herramientas }: { herramientas: HerramientaOperacion[] }) {
  if (!herramientas.length) {
    return <Vacio>Ninguna herramienta figura hoy en esta obra.</Vacio>
  }
  return (
    <Tabla testid="tabla-herramientas" cols={[{ k: 'Herramienta' }, { k: 'Categoría' }, { k: 'Estado' }, { k: 'Responsable' }]}>
      {herramientas.map((h) => {
        const e = estadoInfo(h.estado)
        return (
          <Fila key={h.id_herramienta} obra={h.obra_canonica_id}>
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

function Movimientos({ movimientos }: { movimientos: MovimientoOperacion[] }) {
  if (!movimientos.length) {
    return <Vacio>Todavía no se movió ninguna herramienta hacia esta obra.</Vacio>
  }
  return (
    <Tabla testid="tabla-movimientos" cols={[{ k: 'Fecha' }, { k: 'Herramienta' }, { k: 'Responsable' }]}>
      {movimientos.map((m) => (
        <Fila key={m.id_movimiento} obra={m.obra_canonica_id}>
          <C num>{fecha(m.fecha)}</C>
          <C fuerte>{m.herramienta_nombre ?? '—'}</C>
          <C>{m.responsable ?? '—'}</C>
        </Fila>
      ))}
    </Tabla>
  )
}

export function TabOperacion({
  sub, obraId, errorFuente = null, pedidos, compras, herramientas, movimientos, asignarActividadAPedido,
  impedimentos, actividades, crearImpedimento, liberarImpedimento,
}: {
  sub: SubOperacion
  obraId: string
  /** Lo que dijo la fuente externa cuando no se pudo leer. `null` = se leyó bien. Sólo afecta a los
   *  cuatro bloques que salen de ahí: los impedimentos son del OS y siguen funcionando. */
  errorFuente?: string | null
  pedidos: PedidoOperacion[]
  /** Decir para qué actividad es un pedido. Sin ella la columna no se dibuja: un selector que no
   *  persiste es peor que no tenerlo. */
  asignarActividadAPedido?: (idPedido: string, actividadId: string) => Promise<ResultadoAccion>
  compras: ComprasObra
  herramientas: HerramientaOperacion[]
  movimientos: MovimientoOperacion[]
  /** TODOS los de la obra. Los cuatro bloques de arriba se leen; éste se escribe. */
  impedimentos: Restriccion[]
  /** Para poder colgar el impedimento de la actividad que frena. */
  actividades: Actividad[]
  crearImpedimento: AccionFormulario
  liberarImpedimento: (restriccionId: string) => Promise<ResultadoAccion>
}) {
  const cuenta: Record<SubOperacion, number> = {
    pedidos: pedidos.length,
    // La cobertura del costo real la declara la fuente; el largo de la lista es lo que se ve.
    compras: compras.nComprobantes ?? compras.filas.length,
    herramientas: herramientas.length,
    movimientos: movimientos.length,
    // EL CONTADOR DE IMPEDIMENTOS CUENTA LOS ABIERTOS, no el total: los otros cuatro cuentan filas
    // porque una fila de compra o de pedido no se «cierra», y un impedimento liberado ya no frena
    // nada. Publicar el total pondría un número que sube para siempre al lado de cuatro que
    // describen trabajo pendiente.
    impedimentos: impedimentos.filter((r) => r.estado !== 'liberada').length,
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

      {/* CUATRO LISTAS VACÍAS NO SON «no hay nada»: son «no pude leer». Se dice cuál es, y se dice
          sólo sobre los bloques que dependen de esa fuente — Impedimentos sale de Postgres y no se
          entera de que el Sheet está caído. */}
      {errorFuente && sub !== 'impedimentos' && (
        <Callout tono="neg">No pude leer esta información de su fuente: {errorFuente}</Callout>
      )}
      {!errorFuente && sub === 'pedidos' && (
        <Pedidos pedidos={pedidos} actividades={actividades} asignar={asignarActividadAPedido} />
      )}
      {!errorFuente && sub === 'compras' && <Compras compras={compras} />}
      {!errorFuente && sub === 'herramientas' && <Herramientas herramientas={herramientas} />}
      {!errorFuente && sub === 'movimientos' && <Movimientos movimientos={movimientos} />}
      {sub === 'impedimentos' && (
        <BloqueImpedimentos
          impedimentos={impedimentos}
          actividades={actividades}
          crear={crearImpedimento}
          liberar={liberarImpedimento}
        />
      )}
    </div>
  )
}
