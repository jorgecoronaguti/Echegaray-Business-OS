'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { Aviso, Boton, CAMPO, Campo, ErrorCampo } from '@/shared/components/ds'
import { UNIDADES, URGENCIAS, type Urgencia } from '../logica/pedidos'
import { pedirMaterialAction, type EstadoForm } from '../services/acciones'

// PEDIR MATERIAL — el MISMO formulario en las dos caras; lo que cambia es dónde vive y cuánto mide.
//
// En el teléfono es una pantalla entera (`/campo/material/pedir`): la obra ya está elegida, los campos
// miden 48 (`CAMPO` lo hace solo bajo `lg`), las tres urgencias son tres objetivos de 56 y la primaria
// es un bloque de 48 al final, como el parte y el impedimento. En la computadora vive en el panel
// lateral de `/herramientas/material`: la obra se elige, los campos miden 34 y la primaria va en el
// pie del panel (`form=`), que es donde el sistema pone la acción de un panel.
//
// ═══ UNA FILA POR MATERIAL, Y LA FILA VACÍA NO ES UN ERROR ═══
//
// El pedido real de obra es «cemento, hierro del 8 y alambre»: tres filas. Se agregan con un botón
// y se sacan con otro; la que quedó vacía se ignora al guardar (`normalizarItems`). Lo que SÍ se
// rechaza es la fila a medias, con el motivo, antes de mandar nada.

export interface ObraElegible {
  id: string
  nombre: string
}

interface Item {
  k: number
  material: string
  cantidad: string
  unidad: string
}

const INICIAL: EstadoForm = { error: null }
const nuevoItem = (k: number): Item => ({ k, material: '', cantidad: '', unidad: 'un' })

export function FormPedirMaterial({
  obras,
  obraFija,
  obraInicial,
  cara,
  id = 'form-pedir-material',
  sinBoton = false,
  alGuardar,
}: {
  /** Las obras que se pueden elegir (escritorio). */
  obras: ObraElegible[]
  /** La obra ya elegida (teléfono): no se pregunta. */
  obraFija?: ObraElegible | null
  /** La obra que viene elegida en el selector (escritorio, `?obra=`): se puede cambiar. */
  obraInicial?: string | null
  cara: 'telefono' | 'escritorio'
  id?: string
  /** `true` cuando la primaria la dibuja el contenedor (el pie del panel) con `form={id}`. */
  sinBoton?: boolean
  alGuardar?: (mensaje: string) => void
}) {
  const [state, action, guardando] = useActionState(pedirMaterialAction, INICIAL)
  const [items, setItems] = useState<Item[]>([nuevoItem(1)])
  const [urgencia, setUrgencia] = useState<Urgencia>('semana')
  const siguiente = useRef(2)
  const formRef = useRef<HTMLFormElement>(null)
  const telefono = cara === 'telefono'

  // Al guardar bien, el formulario vuelve a cero: el que pide tres veces en la mañana no borra a mano.
  useEffect(() => {
    if (!state.ok) return
    setItems([nuevoItem(siguiente.current++)])
    setUrgencia('semana')
    formRef.current?.reset()
    if (state.mensaje) alGuardar?.(state.mensaje)
  }, [state, alGuardar])

  const cambiar = (k: number, campo: keyof Omit<Item, 'k'>, valor: string) =>
    setItems((xs) => xs.map((x) => (x.k === k ? { ...x, [campo]: valor } : x)))
  const agregar = () => setItems((xs) => [...xs, nuevoItem(siguiente.current++)])
  const quitar = (k: number) => setItems((xs) => (xs.length === 1 ? xs : xs.filter((x) => x.k !== k)))

  const altoUrgencia = telefono ? 'min-h-[56px]' : 'min-h-[40px]'
  const altoAgregar = telefono ? 'min-h-[48px]' : 'min-h-[34px]'

  return (
    <form ref={formRef} id={id} action={action} className="space-y-5" data-testid="form-pedir-material">
      {obraFija ? (
        <input type="hidden" name="obra_id" value={obraFija.id} />
      ) : (
        <Campo rotulo="Obra">
          <select name="obra_id" required defaultValue={obraInicial && obras.some((o) => o.id === obraInicial) ? obraInicial : ""} className={CAMPO} data-testid="pedir-obra">
            <option value="">Elegí la obra</option>
            {obras.map((o) => (
              <option key={o.id} value={o.id}>{o.nombre}</option>
            ))}
          </select>
        </Campo>
      )}

      <fieldset className="space-y-3">
        <legend className="mb-1 block text-[12.5px] text-ink-soft">Materiales</legend>
        {items.map((it, i) => (
          <div key={it.k} className="rounded-card border border-line p-3" data-testid="item-pedido">
            <div className="flex items-center gap-2">
              <input
                name="material"
                value={it.material}
                onChange={(e) => cambiar(it.k, 'material', e.target.value)}
                placeholder={i === 0 ? 'Qué material (ej.: Cemento)' : 'Otro material'}
                aria-label={`Material ${i + 1}`}
                maxLength={160}
                autoFocus={telefono && i === 0}
                className={CAMPO}
                data-testid="item-material"
              />
              {items.length > 1 && (
                <button
                  type="button"
                  onClick={() => quitar(it.k)}
                  aria-label={`Quitar el material ${i + 1}`}
                  className={`shrink-0 rounded-control px-2 text-[15px] leading-none text-faint hover:bg-surface-quiet hover:text-ink ${telefono ? 'h-[48px] min-w-[44px]' : 'h-control'}`}
                  data-testid="item-quitar"
                >
                  ✕
                </button>
              )}
            </div>
            <div className="mt-2 grid grid-cols-[1fr_minmax(96px,120px)] gap-2">
              <input
                name="cantidad"
                value={it.cantidad}
                onChange={(e) => cambiar(it.k, 'cantidad', e.target.value)}
                type="number"
                step="0.001"
                min="0"
                inputMode="decimal"
                placeholder="Cantidad"
                aria-label={`Cantidad ${i + 1}`}
                className={`${CAMPO} font-mono tabular-nums`}
                data-testid="item-cantidad"
              />
              <select
                name="unidad"
                value={it.unidad}
                onChange={(e) => cambiar(it.k, 'unidad', e.target.value)}
                aria-label={`Unidad ${i + 1}`}
                className={CAMPO}
                data-testid="item-unidad"
              >
                {UNIDADES.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={agregar}
          className={`flex w-full items-center justify-center gap-1.5 rounded-control border border-dashed border-line-strong text-[13px] text-ink-soft hover:bg-surface-quiet ${altoAgregar}`}
          data-testid="agregar-material"
        >
          <span aria-hidden className="text-[15px] leading-none">+</span> Agregar otro material
        </button>
      </fieldset>

      <fieldset>
        <legend className="mb-1 block text-[12.5px] text-ink-soft">Para cuándo</legend>
        <input type="hidden" name="urgencia" value={urgencia} />
        <div className={telefono ? 'space-y-2' : 'grid grid-cols-3 gap-2'} role="radiogroup" aria-label="Urgencia">
          {URGENCIAS.map((u) => {
            const on = u.id === urgencia
            return (
              <button
                key={u.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setUrgencia(u.id)}
                data-testid={`urgencia-${u.id}`}
                className={`flex w-full flex-col justify-center rounded-control border px-3 text-left transition-colors ${altoUrgencia} ${
                  on ? 'border-accent bg-accent text-white' : 'border-line bg-surface text-ink-soft hover:bg-surface-quiet'
                }`}
              >
                <span className={telefono ? 'text-[15px] font-medium' : 'text-[12.5px] font-medium'}>{u.label}</span>
                {telefono && <span className={`text-[12px] ${on ? 'text-white/80' : 'text-faint'}`}>{u.bajada}</span>}
              </button>
            )
          })}
        </div>
      </fieldset>

      <Campo rotulo="Nota" ayuda="Marca, medida, para qué actividad: lo que no entra en la fila.">
        <textarea name="nota" rows={telefono ? 3 : 2} maxLength={500} className={`${CAMPO} h-auto min-h-[72px] py-2`} data-testid="pedir-nota" />
      </Campo>

      {state.ok && state.mensaje && !alGuardar && (
        <Aviso tono="info" titulo="Cargado" testid="pedir-ok">
          {state.mensaje}
        </Aviso>
      )}
      {state.error && <ErrorCampo>{state.error}</ErrorCampo>}

      {!sinBoton && (
        <div className="border-t border-line pt-3">
          <Boton type="submit" variante="primaria" tamano={telefono ? 'bloque' : 'normal'} disabled={guardando} data-testid="guardar-pedido">
            {guardando ? 'Guardando…' : obraFija ? `Pedir para ${obraFija.nombre}` : 'Pedir material'}
          </Boton>
        </div>
      )}
    </form>
  )
}
