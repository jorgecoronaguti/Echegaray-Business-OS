'use client'

import { useActionState, useState } from 'react'
import { pedirCorreccionAsistencia } from '../services/acciones'
import { dm } from '../services/fecha'

// M05 · «FALTA TU SALIDA DEL 15/08 · PEDÍ LA CORRECCIÓN Y LA APRUEBA ADMINISTRACIÓN».
//
// ═══ UN DÍA A LA VEZ ═══
//
// El aviso aparece por UN día —el más reciente sin salida— y no por la lista entera. Es lo que dibuja
// el diseño, y en 390px un aviso por cada día abierto del mes empuja el historial fuera de la
// pantalla justo cuando la persona vino a mirarlo. Resuelto uno, aparece el siguiente.
//
// ═══ EL FORMULARIO ESTÁ PLEGADO ═══
//
// Dos campos abiertos permanentemente compiten con el total del mes, que es el número por el que se
// entra a esta pantalla. Se abre con el botón que el diseño ya dibuja, y sólo entonces se pide la
// hora y el motivo.
//
// ═══ LO QUE ESTE BLOQUE NO HACE ═══
//
// No corrige nada. Manda un PEDIDO, y lo dice: mientras esté pendiente el día sigue marcado sin
// salida y el total del mes lo sigue dejando afuera. Un cartel que dijera «corregido» sobre un día
// que Administración todavía no miró sería exactamente la mentira que la pantalla evita cuando se
// niega a inventarle una salida al día en curso.

type EstadoForm = { error: string | null; mensaje?: string | null }

const CAMPO = 'w-full rounded-control border border-line bg-surface px-3 py-2 text-[15px] text-ink outline-none focus:border-ink'

export function PedirCorreccion({ fecha, entrada }: { fecha: string; entrada: string | null }) {
  const [abierto, setAbierto] = useState(false)
  const [estado, accion, enviando] = useActionState(
    async (_prev: EstadoForm, form: FormData): Promise<EstadoForm> => {
      const r = await pedirCorreccionAsistencia(form)
      return r.ok ? { error: null, mensaje: r.mensaje ?? null } : { error: r.error }
    },
    { error: null },
  )

  if (estado.mensaje && !estado.error) {
    return (
      <div
        data-testid="correccion-enviada"
        className="rounded-card border border-line bg-surface-quiet px-3.5 py-3 text-[12.5px] leading-relaxed text-muted"
      >
        {estado.mensaje}
      </div>
    )
  }

  return (
    <div
      data-testid="pedir-correccion"
      data-fecha={fecha}
      className="rounded-card border border-warn/25 bg-warn-soft px-3.5 py-3"
    >
      <p className="text-[13.5px] font-medium text-ink">Falta tu salida del {dm(fecha)}</p>
      <p className="mt-0.5 text-[12px] leading-relaxed text-muted">
        Pedí la corrección y la aprueba Administración.
      </p>

      {!abierto ? (
        <button
          type="button"
          onClick={() => setAbierto(true)}
          data-testid="abrir-correccion"
          className="mt-3 flex h-[44px] w-full items-center justify-center rounded-control border border-line bg-surface text-[14px] font-medium text-ink"
        >
          Pedir corrección
        </button>
      ) : (
        <form action={accion} className="mt-3 flex flex-col gap-2.5" data-testid="form-correccion">
          <input type="hidden" name="fecha" value={fecha} />
          <label className="flex flex-col gap-1 text-[12px] text-muted">
            ¿A qué hora saliste?
            <input
              type="time"
              name="hora"
              required
              data-testid="correccion-hora"
              className={CAMPO}
            />
          </label>
          {entrada && (
            <p className="text-[11.5px] text-faint">
              Ese día entraste {entrada}. La salida tiene que ser después.
            </p>
          )}
          <label className="flex flex-col gap-1 text-[12px] text-muted">
            ¿Qué pasó?
            <input
              type="text"
              name="motivo"
              required
              minLength={3}
              maxLength={300}
              data-testid="correccion-motivo"
              placeholder="Me quedé sin batería, me fui sin marcar…"
              className={CAMPO}
            />
          </label>

          {estado.error && (
            <p className="text-[12px] leading-relaxed text-neg" data-testid="correccion-error">{estado.error}</p>
          )}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={enviando}
              data-testid="enviar-correccion"
              className="flex h-[44px] flex-1 items-center justify-center rounded-control bg-marca text-[14px] font-semibold text-[color:var(--os-on-marca)] disabled:opacity-60"
            >
              {enviando ? 'Enviando…' : 'Enviar el pedido'}
            </button>
            <button
              type="button"
              onClick={() => setAbierto(false)}
              className="h-[44px] px-3 text-[13px] text-muted"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
