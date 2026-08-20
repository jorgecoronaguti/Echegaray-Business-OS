'use client'

import { useMemo, useState } from 'react'
import { Boton, Buscador, CAMPO, Filtros, MenuContextual, Nulo, Tabla, THead, Th, Tr, Td, Vacio } from '@/shared/components/ds'
import { lecturaPedido } from '../services/estados'
import type { ActividadOpcion, PedidoGlobal as Pedido } from '../services/operacionGlobalService'
import { deletePedidoAction, type ActionState } from '../services/pedidosActions'
import { cantidad, dm } from './formato'
import { AltaPedido, FilaEnEdicion } from './PedidosFormularios'
import { SelectActividad } from './SelectActividad'
import { SelectEstadoPedido } from './SelectEstadoPedido'

// PEDIDOS DE MATERIALES, EN TODAS LAS OBRAS — bloque 3b del handoff.
//
// ═══ LO QUE NO ESTÁ ES LO QUE NO EXISTE ═══
//
// No hay columna de SOLICITANTE: ni el Sheet de respaldo de AppSheet ni la tabla espejo lo tienen.
// Dejarla vacía enseñaría a ignorar la columna, y rellenarla con el responsable de otra cosa sería
// un dato fabricado. Se dice al pie, una vez.
//
// ═══ CADA FILA DICE DE QUÉ OBRA ES ═══
//
// Es la única diferencia con la lista de adentro de la obra, y es la razón de esta pantalla: quien
// mira acá está comparando obras. Cuando el texto del pedido no resuelve a ninguna, se escribe «sin
// obra» — eso es Administración, Taller o una grafía nueva, y colgarlo de una obra sería inventar.

export function PedidosGlobal({
  pedidos,
  obras,
  actividadesPorObra,
  asignarActividad,
}: {
  pedidos: Pedido[]
  /** Los textos de obra tal como los escribe el campo: alimentan el alta y la edición. */
  obras: string[]
  actividadesPorObra: Record<string, ActividadOpcion[]>
  asignarActividad: (idPedido: string, obraId: string, actividadId: string) => Promise<ActionState>
}) {
  const [q, setQ] = useState('')
  const [estadoFiltro, setEstadoFiltro] = useState<string>('')
  const [obraFiltro, setObraFiltro] = useState('')
  const [alta, setAlta] = useState(false)

  const conteo = useMemo(() => {
    const c = new Map<string, number>()
    for (const p of pedidos) {
      const k = lecturaPedido(p.estado).clave
      c.set(k, (c.get(k) ?? 0) + 1)
    }
    return c
  }, [pedidos])

  const filtrados = useMemo(() => {
    const term = q.trim().toLowerCase()
    // Primero lo accionable, después por fecha descendente: quien abre esta lista viene a ver qué
    // falta, no qué llegó.
    const rango: Record<string, number> = { pendiente: 0, pedido: 1, en_camino: 1, sin_estado: 2, entregado: 3 }
    return pedidos
      .filter((p) => (estadoFiltro ? lecturaPedido(p.estado).clave === estadoFiltro : true))
      .filter((p) => (obraFiltro ? p.obra_texto === obraFiltro : true))
      .filter((p) =>
        term ? `${p.material ?? ''} ${p.obra_texto ?? ''} ${p.obra_nombre ?? ''}`.toLowerCase().includes(term) : true,
      )
      .sort((a, b) => {
        const ra = rango[lecturaPedido(a.estado).clave] ?? 2
        const rb = rango[lecturaPedido(b.estado).clave] ?? 2
        return ra !== rb ? ra - rb : (b.fecha ?? '').localeCompare(a.fecha ?? '')
      })
  }, [pedidos, q, estadoFiltro, obraFiltro])

  const opcionesFiltro = [
    { label: 'Todos', activo: !estadoFiltro, onClick: () => setEstadoFiltro('') },
    ...['pendiente', 'pedido', 'en_camino', 'entregado']
      .filter((k) => (conteo.get(k) ?? 0) > 0)
      .map((k) => ({
        label: `${lecturaPedido(k).label} ${conteo.get(k)}`,
        activo: estadoFiltro === k,
        onClick: () => setEstadoFiltro(estadoFiltro === k ? '' : k),
        testid: `filtro-${k}`,
      })),
  ]

  return (
    <div className="space-y-4">
      <datalist id="obras-list">
        {obras.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        {pedidos.length > 1 && <Filtros opciones={opcionesFiltro} cuenta={{ n: filtrados.length, total: pedidos.length }} />}
        <div className="ml-auto flex flex-wrap items-center gap-3">
          {obras.length > 1 && (
            <select
              value={obraFiltro}
              onChange={(e) => setObraFiltro(e.target.value)}
              aria-label="Filtrar por obra"
              data-testid="filtro-obra"
              className={`${CAMPO} w-auto min-w-[180px]`}
            >
              <option value="">Todas las obras</option>
              {obras.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          )}
          <Buscador value={q} onChange={setQ} placeholder="Buscar material u obra" className="w-[230px]" />
          {/* Una primaria por contexto: con el alta abierta, la primaria es «Guardar pedido» y ésta
              baja a discreta. Dos botones amarillos a la vez no son dos acciones importantes. */}
          <Boton
            variante={alta ? 'discreta' : 'primaria'}
            onClick={() => setAlta((v) => !v)}
            aria-expanded={alta}
            data-testid="nuevo-pedido"
          >
            {alta ? 'Cerrar' : 'Nuevo pedido'}
          </Boton>
        </div>
      </div>

      {alta && <AltaPedido onListo={() => setAlta(false)} />}

      {filtrados.length === 0 ? (
        <Vacio>
          {pedidos.length === 0
            ? 'Todavía no hay pedidos de material. El primero se carga con «Nuevo pedido», o llega del AppSheet en la próxima sincronización.'
            : 'Ningún pedido coincide con el filtro.'}
        </Vacio>
      ) : (
        <Tabla testid="tabla-pedidos" minWidth={900}>
          <THead>
            <Th className="w-[80px]">Fecha</Th>
            <Th>Material</Th>
            <Th num className="w-[110px]">
              Cantidad
            </Th>
            <Th className="w-[150px]">Estado</Th>
            <Th className="w-[220px]">Obra</Th>
            <Th className="w-[230px]">Para la actividad</Th>
            <Th className="w-[40px]" aria-label="Acciones" />
          </THead>
          <tbody>
            {filtrados.map((p) => (
              <FilaPedido
                key={p.id_pedido}
                p={p}
                actividades={p.obra_canonica_id ? (actividadesPorObra[p.obra_canonica_id] ?? []) : []}
                asignarActividad={asignarActividad}
              />
            ))}
          </tbody>
        </Tabla>
      )}

      <p className="text-[11.5px] text-faint">
        Pedidos no muestra solicitante: la fuente no lo tiene, y rellenarlo con el responsable de otra cosa sería un
        dato fabricado.
      </p>
    </div>
  )
}

function FilaPedido({
  p,
  actividades,
  asignarActividad,
}: {
  p: Pedido
  actividades: ActividadOpcion[]
  asignarActividad: (idPedido: string, obraId: string, actividadId: string) => Promise<ActionState>
}) {
  const [editando, setEditando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [borrando, setBorrando] = useState(false)
  if (editando) return <FilaEnEdicion p={p} onListo={() => setEditando(false)} />

  // Se confirma con el nombre del material: una fila de esta tabla puede ser un pedido que alguien
  // cargó desde el teléfono y no tiene otra copia en ninguna parte.
  async function borrar() {
    if (!window.confirm(`¿Borrar el pedido de ${p.material || 'material'}?`)) return
    const fd = new FormData()
    fd.set('id_pedido', p.id_pedido)
    setBorrando(true)
    const r = await deletePedidoAction({ error: null }, fd)
    setBorrando(false)
    setError(r.error)
  }

  const c = cantidad(p.cantidad)
  const fecha = dm(p.fecha)
  return (
    <Tr className={borrando ? 'opacity-50' : ''}>
      <Td num>{fecha ?? <Nulo>sin fecha</Nulo>}</Td>
      <Td fuerte>
        {p.material || <Nulo>sin material</Nulo>}
        {error && <span className="mt-0.5 block text-[11.5px] text-neg">{error}</span>}
      </Td>
      <Td num>{c ?? <Nulo>sin cantidad</Nulo>}</Td>
      <Td>
        <SelectEstadoPedido p={p} />
      </Td>
      <Td>
        {p.obra_nombre ? (
          <span className="text-[12.5px] text-muted" data-testid="pedido-obra">
            {p.obra_nombre}
          </span>
        ) : (
          <Nulo>{p.obra_texto ? `sin obra · «${p.obra_texto}»` : 'sin obra'}</Nulo>
        )}
      </Td>
      <Td>
        {p.obra_canonica_id && actividades.length > 0 ? (
          <SelectActividad
            valor={p.actividad_id}
            actividades={actividades}
            alElegir={(actividadId) => asignarActividad(p.id_pedido, p.obra_canonica_id as string, actividadId)}
          />
        ) : (
          <Nulo>sin asignar</Nulo>
        )}
      </Td>
      <Td>
        <MenuContextual
          testid={`menu-${p.id_pedido}`}
          items={[
            { label: 'Editar el pedido', onClick: () => setEditando(true), testid: 'editar-pedido' },
            { label: 'Borrar el pedido', onClick: () => void borrar(), destructiva: true, testid: 'borrar-pedido' },
          ]}
        />
      </Td>
    </Tr>
  )
}
