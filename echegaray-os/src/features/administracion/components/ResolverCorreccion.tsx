'use client'

import { useActionState } from 'react'
import { aprobarCorreccion, rechazarCorreccion } from '../services/correccionAsistenciaActions'

// M05 · LAS DOS SALIDAS DE UN PEDIDO, EN UN SOLO FORMULARIO.
//
// Un formulario y dos botones de envío —no dos formularios— porque la NOTA es la misma en los dos
// casos: quien rechaza escribe por qué, y quien aprueba con una salvedad también. Partirlo en dos
// obligaría a duplicar el campo, y el segundo se llenaría la mitad de las veces.
//
// EL BOTÓN QUE SE APRETÓ VIAJA EN EL FormData (`name="decision"`). Es HTML de siempre: el submitter
// aporta su par nombre/valor. Así la decisión la toma el que la tomó, y no un estado de React que
// puede quedar desincronizado del botón que se ve.
//
// APROBAR ES LA PRIMARIA Y ESTÁ A LA DERECHA — pero ninguna de las dos se puede tocar sin querer:
// las dos son objetivos de 44px separados, no dos mitades de la misma barra.

type EstadoForm = { error: string | null; mensaje?: string | null }

export function ResolverCorreccion({ id }: { id: string }) {
  const [estado, accion, enviando] = useActionState(
    async (_prev: EstadoForm, form: FormData): Promise<EstadoForm> => {
      const r = form.get('decision') === 'aprobar'
        ? await aprobarCorreccion(form)
        : await rechazarCorreccion(form)
      return r.ok ? { error: null, mensaje: r.mensaje ?? null } : { error: r.error }
    },
    { error: null },
  )

  if (estado.mensaje && !estado.error) {
    return (
      <p className="text-[12.5px] text-muted" data-testid="correccion-resuelta">{estado.mensaje}</p>
    )
  }

  return (
    <form action={accion} data-testid="resolver-correccion" className="flex flex-col gap-2">
      <input type="hidden" name="id" value={id} />
      <input
        type="text"
        name="nota"
        maxLength={300}
        placeholder="Nota (opcional): por qué se aprueba o se rechaza"
        data-testid="nota-resolucion"
        className="w-full rounded-control border border-line bg-surface px-3 py-2 text-[13px] text-ink outline-none focus:border-ink"
      />
      {estado.error && (
        <p className="text-[12px] leading-relaxed text-neg" data-testid="resolver-error">{estado.error}</p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          name="decision"
          value="rechazar"
          disabled={enviando}
          data-testid="rechazar-correccion"
          className="h-[44px] rounded-control border border-line px-4 text-[13.5px] text-ink disabled:opacity-60"
        >
          Rechazar
        </button>
        <button
          type="submit"
          name="decision"
          value="aprobar"
          disabled={enviando}
          data-testid="aprobar-correccion"
          className="h-[44px] flex-1 rounded-control bg-marca px-4 text-[13.5px] font-semibold text-[color:var(--os-on-marca)] disabled:opacity-60"
        >
          {enviando ? 'Aplicando…' : 'Aprobar y escribir la salida'}
        </button>
      </div>
    </form>
  )
}
