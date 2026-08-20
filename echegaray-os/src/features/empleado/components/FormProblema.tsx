'use client'

import { useActionState, useState } from 'react'
import { useRouter } from 'next/navigation'
import { reportarProblema } from '../services/acciones'
import type { MiTarea } from '../types'

// REPORTAR UN PROBLEMA — cuatro pasos y ni uno más.
//
// El handoff: actividad preseleccionada → descripción → foto opcional → «¿frena el trabajo?» →
// Reportar. NO se pide tipo, responsable ni fecha comprometida: esas tres las decide quien conduce
// la obra, y pedírselas al que está parado frente al muro es la forma más rápida de que no reporte.
//
// «FRENA EL TRABAJO» ES UNA PREGUNTA, NO UNA CASILLA. Dos objetivos grandes, uno de los cuales hay
// que elegir: una casilla sin marcar se lee como «no» sin que nadie lo haya dicho, y la diferencia
// entre «estamos parados» y «va a hacer falta la semana que viene» ordena la lista del jefe.

type EstadoForm = { error: string | null; mensaje?: string | null }

const CAMPO = 'w-full rounded-control border border-line bg-surface px-3 text-[15px] text-ink outline-none focus:border-ink'

export function FormProblema({ tareas, obraId, tareaId }: { tareas: MiTarea[]; obraId: string; tareaId: string | null }) {
  const router = useRouter()
  const [elegida, setElegida] = useState(tareaId ?? '')
  const [cambiando, setCambiando] = useState(!tareaId)
  const [frena, setFrena] = useState<'si' | 'no' | ''>('')
  const [adjunto, setAdjunto] = useState<string | null>(null)

  const [estado, accion, enviando] = useActionState(
    async (_prev: EstadoForm, form: FormData): Promise<EstadoForm> => {
      const r = await reportarProblema(form)
      if (!r.ok) return { error: r.error }
      router.push('/mi-trabajo')
      return { error: null, mensaje: r.mensaje ?? null }
    },
    { error: null },
  )

  const tarea = tareas.find((t) => t.id === elegida) ?? null

  return (
    <form action={accion} data-testid="form-problema">
      <input type="hidden" name="obra_id" value={tarea?.obra_id ?? obraId} />
      <input type="hidden" name="actividad_id" value={elegida} />

      <section>
        <h2 className="text-[10.5px] font-semibold tracking-[0.14em] text-faint">DÓNDE</h2>
        {tarea && !cambiando ? (
          <div className="mt-2 flex items-baseline gap-3">
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] text-ink">{tarea.nombre}</span>
              <span className="block text-[12px] text-faint">{tarea.seccion ?? ''}{tarea.seccion ? ' · ' : ''}{tarea.obra}</span>
            </span>
            <button type="button" onClick={() => setCambiando(true)} data-testid="cambiar-tarea" className="text-[12px] text-muted underline hover:text-ink">
              Cambiar
            </button>
          </div>
        ) : (
          <select
            value={elegida}
            onChange={(ev) => { setElegida(ev.target.value); setCambiando(false) }}
            data-testid="elegir-tarea"
            className={`${CAMPO} mt-2 h-[48px]`}
          >
            <option value="">Sin tarea: es un problema de la obra</option>
            {tareas.map((t) => (
              <option key={t.id} value={t.id}>{t.nombre}</option>
            ))}
          </select>
        )}
      </section>

      <section className="mt-6">
        <h2 className="text-[10.5px] font-semibold tracking-[0.14em] text-faint">QUÉ PASA</h2>
        <textarea
          name="descripcion"
          rows={4}
          required
          minLength={5}
          data-testid="descripcion-problema"
          placeholder="No llegaron los bloques y no podemos seguir el paño…"
          className={`${CAMPO} mt-2 h-auto py-2.5 leading-relaxed`}
        />
      </section>

      <section className="mt-6">
        <h2 className="text-[10.5px] font-semibold tracking-[0.14em] text-faint">FOTO (OPCIONAL)</h2>
        <label className="mt-2 flex h-[72px] w-[72px] cursor-pointer items-center justify-center rounded-control border border-dashed border-line-strong text-[22px] text-line-strong">
          +
          <input
            type="file"
            name="foto"
            accept="image/*"
            capture="environment"
            className="hidden"
            data-testid="foto-problema"
            onChange={(ev) => setAdjunto(ev.target.files?.[0]?.name ?? null)}
          />
        </label>
        {adjunto && <p className="mt-1.5 text-[12px] text-muted" data-testid="foto-adjunta">{adjunto}</p>}
      </section>

      <section className="mt-6">
        <h2 className="text-[10.5px] font-semibold tracking-[0.14em] text-faint">FRENA EL TRABAJO</h2>
        <input type="hidden" name="frena" value={frena} />
        <div className="mt-2 flex gap-2">
          {([['si', 'Sí, estamos parados'], ['no', 'No, podemos seguir']] as const).map(([v, l]) => (
            <button
              key={v}
              type="button"
              onClick={() => setFrena(v)}
              data-testid={`frena-${v}`}
              aria-pressed={frena === v}
              className={`h-[48px] flex-1 rounded-control border text-[13.5px] ${
                frena === v ? 'border-ink bg-surface-quiet font-medium text-ink' : 'border-line text-muted'
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      </section>

      {estado.error && <p className="mt-4 text-[12.5px] text-neg" data-testid="problema-error">{estado.error}</p>}

      <button
        type="submit"
        disabled={enviando || frena === ''}
        data-testid="enviar-problema"
        className="mt-7 flex h-[52px] w-full items-center justify-center rounded-control bg-marca text-[15px] font-semibold text-[color:var(--os-on-marca)] disabled:opacity-50 lg:w-auto lg:px-6"
      >
        {enviando ? 'Reportando…' : 'Reportar'}
      </button>
      <p className="mt-2.5 text-[11.5px] text-faint">
        {frena === '' ? 'Elegí si el trabajo está parado para poder reportar.' : 'Queda como impedimento de la actividad y lo ve el jefe de obra.'}
      </p>
    </form>
  )
}
