'use client'

import { useActionState, useEffect, useRef } from 'react'
import { Boton, CAMPO, Campo, ErrorCampo } from '@/shared/components/ds'
import { createPedidoAction, updatePedidoAction, type ActionState } from '../services/pedidosActions'
import type { PedidoGlobal } from '../services/operacionGlobalService'

// EL ALTA Y LA EDICIÓN DE UN PEDIDO — la capacidad nativa que ya existía, con el vestido del DS.
//
// El alta vive PEGADA a la lista (no en otra pantalla) porque el pedido se carga mirando lo que ya
// se pidió: la mitad de las veces lo que hace falta es corregir uno, no agregar otro.
//
// La edición reemplaza la FILA en su lugar, por la misma razón: sacar a alguien de la tabla para
// cambiar una cantidad le hace perder de vista las otras veintinueve.

const INICIAL: ActionState = { error: null }

export function AltaPedido({ onListo }: { onListo: () => void }) {
  const [state, action, guardando] = useActionState(createPedidoAction, INICIAL)
  const form = useRef<HTMLFormElement>(null)
  useEffect(() => {
    if (state.ok) {
      form.current?.reset()
      onListo()
    }
  }, [state, onListo])

  return (
    <form
      ref={form}
      action={action}
      data-testid="form-nuevo-pedido"
      className="border-y border-line bg-surface-quiet px-4 py-4"
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Campo rotulo="Obra">
          <input name="obra_texto" list="obras-list" required placeholder="Comedor La Estrella" className={CAMPO} />
        </Campo>
        <Campo rotulo="Material" className="lg:col-span-2">
          <input name="material" required placeholder="Cemento CP40" className={CAMPO} />
        </Campo>
        <Campo rotulo="Cantidad">
          <input name="cantidad" type="number" step="0.01" min="0" required className={CAMPO} />
        </Campo>
        <Campo rotulo="Estado">
          <select name="estado" defaultValue="PENDIENTE" className={CAMPO}>
            <option value="PENDIENTE">Pendiente</option>
            <option value="PEDIDO">Pedido</option>
            <option value="ENTREGADO">Entregado</option>
          </select>
        </Campo>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Boton type="submit" variante="primaria" disabled={guardando}>
          {guardando ? 'Guardando…' : 'Guardar pedido'}
        </Boton>
        <Boton type="button" variante="discreta" onClick={onListo}>
          Cancelar
        </Boton>
        {state.error && <ErrorCampo>{state.error}</ErrorCampo>}
      </div>
    </form>
  )
}

/**
 * La fila en edición. La `key` del componente cuelga de los valores editables: cuando el guardado
 * revalida y el pedido vuelve cambiado, la fila se remonta y sale del modo edición sola, sin un
 * efecto sincrónico que adivine cuándo terminó.
 */
export function FilaEnEdicion({ p, onListo }: { p: PedidoGlobal; onListo: () => void }) {
  const [state, action, guardando] = useActionState(updatePedidoAction, INICIAL)
  useEffect(() => {
    if (state.ok) onListo()
  }, [state, onListo])

  return (
    <tr className="border-b border-[#EFEEEA] bg-surface-quiet" data-testid="fila-edicion">
      <td colSpan={7} className="py-2.5">
        <form action={action} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="id_pedido" value={p.id_pedido} />
          <Campo rotulo="Material" className="min-w-[220px] flex-1">
            <input name="material" defaultValue={p.material ?? ''} required className={CAMPO} />
          </Campo>
          <Campo rotulo="Obra" className="w-[200px]">
            <input name="obra_texto" list="obras-list" defaultValue={p.obra_texto ?? ''} required className={CAMPO} />
          </Campo>
          <Campo rotulo="Cantidad" className="w-[110px]">
            <input
              name="cantidad"
              type="number"
              step="0.01"
              min="0"
              defaultValue={p.cantidad ?? ''}
              required
              className={CAMPO}
            />
          </Campo>
          <Boton type="submit" variante="primaria" disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </Boton>
          <Boton type="button" variante="discreta" onClick={onListo}>
            Cancelar
          </Boton>
          {state.error && <ErrorCampo>{state.error}</ErrorCampo>}
        </form>
      </td>
    </tr>
  )
}
