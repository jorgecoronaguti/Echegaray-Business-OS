'use client'

import { useActionState, useRef, useState } from 'react'
import { Boton, CAMPO, Campo, ErrorCampo, Estado, Eyebrow, Nulo, Timeline } from '@/shared/components/ds'
import {
  deleteHerramientaAction,
  registrarMovimientoAction,
  setEstadoHerramientaAction,
  setUbicacionAction,
  uploadFotoAction,
  type ActionState,
} from '../services/herramientasActions'
import { ESTADOS_HERRAMIENTA, lecturaHerramienta } from '../services/estados'
import type { HerramientaGlobal } from '../services/operacionGlobalService'
import type { MovimientoConHerramienta } from '../services/movimientosService'
import { dmHora } from './formato'

// LA FICHA DEL EQUIPO — bloque 3c del handoff.
//
// Es la mitad derecha del split: la lista contesta «qué hay y dónde», la ficha contesta «qué le pasa
// a ésta». Todo lo que se edita se edita ACÁ, que es donde vive el dato (regla 5), y cada campo se
// guarda solo — no hay un botón «guardar la ficha» que confunda qué quedó escrito.
//
// EL RESPONSABLE NO SE EDITA: sale del último movimiento. Un campo editable al lado de un dato
// derivado son dos versiones del mismo hecho, y la que se edita a mano gana sin haber pasado por
// ningún traslado.

const INICIAL: ActionState = { error: null }

export function FichaHerramienta({
  h,
  ubicaciones,
  movimientos,
}: {
  h: HerramientaGlobal
  ubicaciones: string[]
  movimientos: MovimientoConHerramienta[]
}) {
  const [moviendo, setMoviendo] = useState(false)
  const l = lecturaHerramienta(h.estado)

  return (
    <div className="space-y-5">
      <FotoHerramienta h={h} />

      <dl className="space-y-2.5">
        <Fila k="Categoría">{h.categoria ?? <Nulo>sin categoría</Nulo>}</Fila>
        <Fila k="Estado">
          <EstadoConNota h={h} />
        </Fila>
        <Fila k="Ubicación actual">
          <UbicacionEditable h={h} ubicaciones={ubicaciones} />
        </Fila>
        <Fila k="Obra">{h.obra_nombre ?? <Nulo>fuera de obra</Nulo>}</Fila>
        <Fila k="Responsable">
          {h.responsable_actual ? (
            <span className="text-[12.5px] text-ink">{h.responsable_actual}</span>
          ) : (
            <Nulo>sin responsable</Nulo>
          )}
        </Fila>
        <Fila k="Origen">{h.origen ?? <Nulo>sin origen</Nulo>}</Fila>
        <Fila k="Identificador">
          <span className="font-mono text-[12.5px] tabular-nums text-muted">{h.id_herramienta}</span>
        </Fila>
      </dl>
      <p className="text-[11.5px] text-faint">
        El responsable no se escribe: es quien figura en el último movimiento registrado.
      </p>

      <div>
        <Eyebrow className="mb-2">Movimientos</Eyebrow>
        <Timeline
          testid="timeline-herramienta"
          eventos={movimientos.slice(0, 6).map((m) => ({
            id: m.id_movimiento,
            fecha: dmHora(m.fecha) ?? 'sin fecha',
            tipo: 'traslado',
            texto: m.destino ? `→ ${m.destino}` : 'destino sin registrar',
            derecha: m.responsable ?? undefined,
          }))}
          total={movimientos.length}
          verTodo={
            <a href="/integraciones/movimientos" className="text-muted hover:text-ink">
              Ver todo ({movimientos.length}) →
            </a>
          }
          vacio="Esta herramienta no tiene traslados registrados: el primero se anota con «Registrar movimiento»."
        />
      </div>

      {moviendo ? (
        <FormMovimiento h={h} ubicaciones={ubicaciones} onListo={() => setMoviendo(false)} />
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Boton variante="primaria" onClick={() => setMoviendo(true)} data-testid="registrar-movimiento">
            Registrar movimiento
          </Boton>
          <BorrarHerramienta h={h} />
        </div>
      )}
      {l.clave === 'sin_estado' && (
        <p className="text-[11.5px] text-faint">
          Nadie declaró en qué estado está. Se elige arriba; hasta entonces no se asume que esté disponible.
        </p>
      )}
    </div>
  )
}

function Fila({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="shrink-0 text-[12px] text-muted">{k}</dt>
      <dd className="min-w-0 text-right text-[12.5px] text-ink">{children}</dd>
    </div>
  )
}

/** La foto: lo que hace reconocible una herramienta en una lista de 149. Se saca del teléfono. */
function FotoHerramienta({ h }: { h: HerramientaGlobal }) {
  const [state, subir, subiendo] = useActionState(uploadFotoAction, INICIAL)
  const archivo = useRef<HTMLInputElement>(null)
  const form = useRef<HTMLFormElement>(null)
  return (
    <form ref={form} action={subir} className="space-y-1.5">
      <input type="hidden" name="id_herramienta" value={h.id_herramienta} />
      <div className="flex items-center gap-3">
        <div className="h-[72px] w-[72px] shrink-0 overflow-hidden rounded-card bg-surface-sunken">
          {h.imagen_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={h.imagen_url} alt={h.nombre} className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-[11px] text-faint">sin foto</span>
          )}
        </div>
        <div className="min-w-0">
          <input
            ref={archivo}
            type="file"
            name="foto"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={() => form.current?.requestSubmit()}
          />
          <Boton type="button" variante="secundaria" disabled={subiendo} onClick={() => archivo.current?.click()}>
            {subiendo ? 'Subiendo…' : h.imagen_url ? 'Cambiar foto' : 'Subir foto'}
          </Boton>
          <p className="mt-1 text-[11.5px] text-faint">Hasta 6 MB. Se saca del teléfono y queda cargada.</p>
        </div>
      </div>
      {state.error && <ErrorCampo>{state.error}</ErrorCampo>}
    </form>
  )
}

/**
 * ESTADO + SU NOTA, EN UN SOLO FORMULARIO. «En reparación» sin motivo no le sirve a nadie.
 *
 * ═══ EL DEFECTO QUE ARREGLA ═══
 *
 * El control anterior mandaba SÓLO el estado, y la acción escribe `estado_nota: parsed.estado_nota
 * ?? null`: cada cambio de estado BORRABA la nota que alguien había escrito («la trajo el taller,
 * falta el repuesto»), sin avisar y sin manera de recuperarla. Acá los dos campos viajan juntos
 * siempre: el select guarda al elegir y la nota al salir del campo.
 */
function EstadoConNota({ h }: { h: HerramientaGlobal }) {
  const [state, guardar, guardando] = useActionState(setEstadoHerramientaAction, INICIAL)
  const form = useRef<HTMLFormElement>(null)
  const l = lecturaHerramienta(h.estado)
  return (
    <form ref={form} action={guardar} className="flex flex-col items-end gap-1">
      <input type="hidden" name="id_herramienta" value={h.id_herramienta} />
      <Estado tono={l.tono} clave={l.clave} testid="estado-ficha">
        {l.label}
      </Estado>
      <select
        name="estado"
        defaultValue={h.estado ?? ''}
        disabled={guardando}
        aria-label="Cambiar el estado"
        data-testid="cambiar-estado-herramienta"
        onChange={() => form.current?.requestSubmit()}
        className={`${CAMPO} h-[30px] w-auto border-line py-0 text-[12.5px] max-lg:h-control-movil`}
      >
        <option value="" disabled>
          sin estado
        </option>
        {ESTADOS_HERRAMIENTA.map((e) => (
          <option key={e.clave} value={e.clave}>
            {e.label}
          </option>
        ))}
      </select>
      <input
        name="estado_nota"
        defaultValue={h.estado_nota ?? ''}
        maxLength={160}
        placeholder="sin nota de estado"
        aria-label="Nota de estado"
        data-testid="nota-estado"
        disabled={guardando}
        onBlur={(e) => {
          if (e.target.value !== (h.estado_nota ?? '')) form.current?.requestSubmit()
        }}
        className={`${CAMPO} h-[30px] w-[220px] border-line py-0 text-right text-[11.5px] max-lg:h-control-movil`}
      />
      {state.error && <ErrorCampo>{state.error}</ErrorCampo>}
    </form>
  )
}

function UbicacionEditable({ h, ubicaciones }: { h: HerramientaGlobal; ubicaciones: string[] }) {
  const [state, guardar, guardando] = useActionState(setUbicacionAction, INICIAL)
  const [editando, setEditando] = useState(false)
  if (!editando) {
    return (
      <button
        type="button"
        onClick={() => setEditando(true)}
        className="text-[12.5px] text-ink underline decoration-line underline-offset-4 hover:decoration-ink"
        data-testid="editar-ubicacion"
      >
        {h.ubicacion_actual || 'sin ubicación'}
      </button>
    )
  }
  return (
    <form action={guardar} className="flex flex-col items-end gap-1">
      <input type="hidden" name="id_herramienta" value={h.id_herramienta} />
      <input
        name="ubicacion_actual"
        list="ubicaciones-list"
        defaultValue={h.ubicacion_actual ?? ''}
        required
        className={`${CAMPO} w-[200px]`}
      />
      <datalist id="ubicaciones-list">
        {ubicaciones.map((u) => (
          <option key={u} value={u} />
        ))}
      </datalist>
      <div className="flex items-center gap-2">
        <Boton type="submit" variante="secundaria" disabled={guardando}>
          {guardando ? 'Guardando…' : 'Guardar'}
        </Boton>
        <Boton type="button" variante="discreta" onClick={() => setEditando(false)}>
          Cancelar
        </Boton>
      </div>
      <p className="text-[11.5px] text-faint">Corregir la ubicación no es un traslado: no deja movimiento.</p>
      {state.error && <ErrorCampo>{state.error}</ErrorCampo>}
    </form>
  )
}

/**
 * REGISTRAR UN MOVIMIENTO es lo único que mueve la herramienta de verdad: escribe el traslado Y
 * actualiza la ubicación en una transacción (RPC `registrar_movimiento_herramienta`).
 */
function FormMovimiento({
  h,
  ubicaciones,
  onListo,
}: {
  h: HerramientaGlobal
  ubicaciones: string[]
  onListo: () => void
}) {
  const [state, mover, guardando] = useActionState(registrarMovimientoAction, INICIAL)
  return (
    <form action={mover} className="space-y-3 border-t border-line pt-4" data-testid="form-movimiento">
      <input type="hidden" name="id_herramienta" value={h.id_herramienta} />
      <Campo rotulo="Destino">
        <input name="destino" list="ubicaciones-list" required placeholder="Obra, depósito o taller" className={CAMPO} />
      </Campo>
      <Campo rotulo="Responsable" ayuda="Quién se la lleva. Es de quien queda a cargo la herramienta.">
        <input name="responsable" className={CAMPO} />
      </Campo>
      <datalist id="ubicaciones-list">
        {ubicaciones.map((u) => (
          <option key={u} value={u} />
        ))}
      </datalist>
      <div className="flex flex-wrap items-center gap-3">
        <Boton type="submit" variante="primaria" disabled={guardando}>
          {guardando ? 'Registrando…' : 'Registrar el movimiento'}
        </Boton>
        <Boton type="button" variante="discreta" onClick={onListo}>
          Cancelar
        </Boton>
        {state.error && <ErrorCampo>{state.error}</ErrorCampo>}
      </div>
    </form>
  )
}

function BorrarHerramienta({ h }: { h: HerramientaGlobal }) {
  const [state, borrar, borrando] = useActionState(deleteHerramientaAction, INICIAL)
  return (
    <form
      action={borrar}
      onSubmit={(e) => {
        if (!window.confirm(`¿Borrar «${h.nombre}» del inventario?`)) e.preventDefault()
      }}
    >
      <input type="hidden" name="id_herramienta" value={h.id_herramienta} />
      <Boton type="submit" variante="destructiva" disabled={borrando}>
        {borrando ? 'Borrando…' : 'Borrar del inventario'}
      </Boton>
      {state.error && <ErrorCampo>{state.error}</ErrorCampo>}
    </form>
  )
}
