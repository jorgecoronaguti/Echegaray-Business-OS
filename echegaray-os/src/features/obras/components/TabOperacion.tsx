// OPERACIÓN DE LA OBRA — qué pidió, qué compró, qué recursos se movieron y qué la está frenando.
//
// ═══ LA FORMA LA FIJA EL HANDOFF APROBADO (design/screens/obras.md §1f) ═══
//
//   Cinco sublistas con contador —Pedidos · Compras · Herramientas · Movimientos · Impedimentos—
//   como SubTabs de nivel 3: texto con contador mono y subrayado en el activo. Eran pastillas
//   rellenas dentro de una caja, o sea una tercera barra de navegación disfrazada, y el sistema
//   permite dos.
//
// LAS CINCO LISTAS SON LO MISMO CON DISTINTO CONTENIDO, y por eso salen todas de la misma `Tabla`
// del design system: cinco tablas escritas a mano se desalinean en el primer cambio de densidad. La
// sub-vista viaja por query string igual que `vista`, así que cada lista es una URL que se comparte
// y el servidor renderiza sin estado de cliente.
//
// LO QUE NO ESTÁ ES LO QUE NO EXISTE. Pedidos no muestra «solicitante»: ni el Sheet de respaldo ni
// la tabla espejo lo tienen, y una columna vacía o rellenada con el responsable de otra cosa sería
// un dato fabricado. Compras no suma su propio total: muestra el que declara la fuente única del
// costo real, y si el detalle no llega a ese total lo dice en una línea en vez de disimularlo.

'use client'

import { useState } from 'react'
import { Aviso, Estado, FilaTotal, Nulo, SubTabs, Tabla, Td, Th, THead, Tr, Vacio } from '@/shared/components/ds'
import { estadoInfo } from '@/features/integraciones/services/herramientasService'
import type {
  HerramientaOperacion, MovimientoOperacion, PedidoOperacion,
} from '../services/operacionService'
import type { ComprasObra, SubOperacion } from '../services/operacionService'
import { BloqueImpedimentos } from './BloqueImpedimentos'
import type { AccionFormulario, ResultadoAccion } from '@/shared/components/ui'
import type { Actividad, Restriccion } from '../types'
import { fecha, plata } from './formato'

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
const TONO_HERRAMIENTA = { ok: 'pos', info: 'pendiente', amber: 'warn', red: 'neg' } as const

/**
 * LOS PEDIDOS, Y PARA QUÉ ACTIVIDAD SON.
 *
 * La columna ACTIVIDAD sólo aparece cuando la ficha pasa la lista de actividades y la acción: un
 * selector que no persiste es peor que no tenerlo.
 *
 * ES OPCIONAL Y SE VE QUE LO ES: «sin asignar» en gris, no un hueco. La obra sigue siendo el eje del
 * pedido; esto contesta «¿qué está esperando esta actividad?» cuando alguien lo sabe.
 */
function Pedidos({
  pedidos, actividades = [], asignar,
}: {
  pedidos: PedidoOperacion[]
  actividades?: Actividad[]
  asignar?: (idPedido: string, actividadId: string) => Promise<ResultadoAccion>
}) {
  if (!pedidos.length) {
    return <Vacio>Los pedidos de material se registran a nombre de la obra, y ninguno quedó a nombre de ésta.</Vacio>
  }
  const elegibles = actividades.filter((a) => a.tipo !== 'resumen' && !a.archivada && !a.actividad_padre_id)
  const conActividad = Boolean(asignar) && elegibles.length > 0
  return (
    <Tabla testid="tabla-pedidos" minWidth={640}>
      <THead>
        <Th num>Fecha</Th><Th>Material</Th><Th num>Cantidad</Th><Th>Estado</Th>
        {conActividad && <Th>Para</Th>}
      </THead>
      <tbody>
        {pedidos.map((p) => (
          <Tr key={p.id_pedido} compacta {...{ 'data-obra': p.obra_canonica_id ?? undefined }}>
            <Td num className="whitespace-nowrap text-muted">{fecha(p.fecha)}</Td>
            <Td fuerte>{p.material ?? <Nulo>sin material declarado</Nulo>}</Td>
            <Td num>{cantidad(p.cantidad)}</Td>
            <Td>
              {p.estado
                ? <Estado tono={entregado(p.estado) ? 'pos' : 'pendiente'} clave={p.estado}>{p.estado}</Estado>
                : <Nulo>sin estado</Nulo>}
            </Td>
            {conActividad && (
              <Td>
                <SelectActividad
                  actividades={elegibles}
                  valor={p.actividad_id}
                  alElegir={(id) => asignar!(p.id_pedido, id)}
                />
              </Td>
            )}
          </Tr>
        ))}
      </tbody>
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
        className="w-full max-w-[220px] rounded-control border border-line-strong bg-surface px-1.5 py-1 text-[12px] text-muted"
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
      <Aviso tono="warn">
        Esta obra tiene {plata(compras.total)} en compras registradas, pero acá no se pudo listar ninguna.
      </Aviso>
    )
  }
  return (
    <div className="flex flex-col gap-2.5">
      <Tabla testid="tabla-compras" minWidth={820}>
        <THead>
          <Th num>Fecha</Th><Th>Proveedor</Th><Th>Concepto</Th><Th>Comprobante</Th><Th num>Importe</Th>
        </THead>
        <tbody>
          {compras.filas.map((c) => (
            <Tr key={c.id} compacta {...{ 'data-obra': c.obra_canonica_id ?? undefined }}>
              <Td num className="whitespace-nowrap text-muted">{fecha(c.fecha)}</Td>
              <Td fuerte>{c.proveedor ?? <Nulo>sin proveedor</Nulo>}</Td>
              <Td>{c.concepto ?? <Nulo>sin concepto</Nulo>}</Td>
              <Td num className="text-muted">{c.comprobante ?? <Nulo>sin comprobante</Nulo>}</Td>
              <Td num fuerte>{plata(c.total)}</Td>
            </Tr>
          ))}
          {/* EL TOTAL NO SE SUMA ACÁ: es el que declara `obra_costo_real`, la fuente única del costo
              de la obra. Sumar la columna daría un número que coincide sólo mientras el detalle esté
              completo, y el día que no lo esté nadie sabría cuál de los dos mirar. */}
          <FilaTotal>
            <Td colSpan={4}>Costo real de la obra</Td>
            <Td num fuerte>{plata(compras.total)}</Td>
          </FilaTotal>
        </tbody>
      </Tabla>
      {!compras.completo && (
        <p className="text-[11.5px] text-warn" data-testid="cobertura-compras">
          Se listan {compras.filas.length} de {compras.nComprobantes ?? 0} comprobantes. El total lo
          declara la fuente del costo real; el detalle se lista aparte.
        </p>
      )}
    </div>
  )
}

function Herramientas({ herramientas }: { herramientas: HerramientaOperacion[] }) {
  if (!herramientas.length) return <Vacio>Ninguna herramienta figura hoy en esta obra.</Vacio>
  return (
    <Tabla testid="tabla-herramientas" minWidth={600}>
      <THead><Th>Herramienta</Th><Th>Categoría</Th><Th>Estado</Th><Th>Responsable</Th></THead>
      <tbody>
        {herramientas.map((h) => {
          const e = estadoInfo(h.estado)
          return (
            <Tr key={h.id_herramienta} compacta {...{ 'data-obra': h.obra_canonica_id ?? undefined }}>
              <Td fuerte>{h.nombre}</Td>
              <Td>{h.categoria ?? <Nulo>sin categoría</Nulo>}</Td>
              <Td><Estado tono={TONO_HERRAMIENTA[e.tone]} clave={e.label}>{e.label}</Estado></Td>
              <Td>{h.responsable_actual ?? <Nulo>sin responsable</Nulo>}</Td>
            </Tr>
          )
        })}
      </tbody>
    </Tabla>
  )
}

function Movimientos({ movimientos }: { movimientos: MovimientoOperacion[] }) {
  if (!movimientos.length) return <Vacio>Todavía no se movió ninguna herramienta hacia esta obra.</Vacio>
  return (
    <Tabla testid="tabla-movimientos" minWidth={520}>
      <THead><Th num>Fecha</Th><Th>Herramienta</Th><Th>Responsable</Th></THead>
      <tbody>
        {movimientos.map((m) => (
          <Tr key={m.id_movimiento} compacta {...{ 'data-obra': m.obra_canonica_id ?? undefined }}>
            <Td num className="whitespace-nowrap text-muted">{fecha(m.fecha)}</Td>
            <Td fuerte>{m.herramienta_nombre ?? <Nulo>sin herramienta</Nulo>}</Td>
            <Td>{m.responsable ?? <Nulo>sin responsable</Nulo>}</Td>
          </Tr>
        ))}
      </tbody>
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
  /** Decir para qué actividad es un pedido. Sin ella la columna no se dibuja. */
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
  const abiertos = impedimentos.filter((r) => r.estado !== 'liberada').length
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
    impedimentos: abiertos,
  }

  return (
    <div className="flex flex-col gap-4">
      <SubTabs
        testid="subs-operacion"
        items={SUBS.map((s) => ({
          href: `/obras/${obraId}?vista=operacion&sub=${s.id}`,
          label: s.label,
          cuenta: cuenta[s.id],
          activo: s.id === sub,
          testid: `sub-${s.id}`,
        }))}
      />

      {/* CUATRO LISTAS VACÍAS NO SON «no hay nada»: son «no pude leer». Se dice cuál es, con el
          mensaje de la fuente, y sólo sobre los bloques que dependen de ella — Impedimentos sale de
          Postgres y no se entera de que el Sheet está caído. */}
      {errorFuente && sub !== 'impedimentos' && (
        <Aviso tono="neg" titulo="No pude leer esta información de su fuente">{errorFuente}</Aviso>
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
