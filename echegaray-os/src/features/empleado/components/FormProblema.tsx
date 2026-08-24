'use client'

import { useActionState, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PieFijo, BotonPie } from './Piezas'
import { reportarProblema } from '../services/acciones'
import { MOTIVOS, motivoDe } from '../services/problemas'
import type { MiImpedimento, MiTarea } from '../types'

// AVISAR UN PROBLEMA (M07) — seis motivos, y el resto del formulario recién cuando eligió uno.
//
// ═══ PROGRESSIVE DISCLOSURE, Y POR QUÉ NO ES UN CAPRICHO VISUAL ═══
//
// La nota del mockup: «El formulario aparece recién cuando eligió el motivo». Un formulario abierto
// —descripción, foto, ¿frena?— frente a alguien parado en el andamio con guantes es una pared de
// campos, y la pared se abandona. La primera pantalla es UNA pregunta con seis respuestas grandes;
// lo que sigue son dos.
//
// ═══ SEIS CATEGORÍAS CERRADAS, NO UN CAMPO LIBRE ═══
//
// «Se puede contar y comparar entre obras». El texto libre sigue existiendo, pero DEBAJO del
// motivo: el motivo clasifica, la descripción explica. Las claves que viajan a la base las traduce
// `problemas.ts`, y su test las contrasta contra el CHECK real de `obra_restriccion`.
//
// «FRENA EL TRABAJO» ES UNA PREGUNTA, NO UNA CASILLA. La nota del mockup: «Si el frente está
// parado, la HH se detiene: es la pregunta clave». Una casilla sin marcar se lee como «no» sin que
// nadie lo haya dicho.

type EstadoForm = { error: string | null; mensaje?: string | null }

const CAMPO = 'w-full rounded-control border border-line bg-surface px-3 text-[15px] text-ink outline-none focus:border-ink'

export function FormProblema({
  tareas, obraId, tareaId, yaAvisado,
}: {
  tareas: MiTarea[]
  obraId: string
  tareaId: string | null
  /** Lo que esta persona ya reportó. Cierra el círculo: sin esto vuelve a avisar lo mismo. */
  yaAvisado: MiImpedimento[]
}) {
  const router = useRouter()
  const [motivo, setMotivo] = useState('')
  const [elegida, setElegida] = useState(tareaId ?? '')
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

  const m = motivoDe(motivo)
  const tarea = tareas.find((t) => t.id === elegida) ?? null
  const listo = m != null && frena !== ''

  return (
    <form action={accion} data-testid="form-problema">
      <input type="hidden" name="obra_id" value={tarea?.obra_id ?? obraId} />
      <input type="hidden" name="actividad_id" value={elegida} />
      <input type="hidden" name="motivo" value={motivo} />
      <input type="hidden" name="frena" value={frena} />

      <h2 className="text-[15px] font-semibold text-ink">¿Qué está frenando el trabajo?</h2>

      {/* DOS COLUMNAS Y 88px DE ALTO. El mockup los dibuja así y la razón es el pulgar: seis
          objetivos de media pantalla se tocan sin mirar, y una lista de seis renglones no. */}
      <div className="mt-3 grid grid-cols-2 gap-2.5" data-testid="motivos">
        {MOTIVOS.map((o) => {
          const activo = o.id === motivo
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => setMotivo(activo ? '' : o.id)}
              data-testid={`motivo-${o.id}`}
              aria-pressed={activo}
              className={`flex h-[88px] items-center justify-center rounded-[14px] border px-3 text-center text-[13.5px] leading-tight ${
                activo ? 'border-ink bg-surface-quiet font-semibold text-ink' : 'border-line bg-surface text-ink'
              }`}
            >
              {o.label}
            </button>
          )
        })}
      </div>

      {/* EL RESTO DEL FORMULARIO: RECIÉN ACÁ. Sin motivo, una sola línea gris que dice qué pasa
          después — y no un formulario apagado, que se lee como un sistema roto. */}
      {!m ? (
        <p className="mt-3.5 text-[12.5px] text-faint" data-testid="pista-motivos">
          Elegí qué pasa y se abre el resto.
        </p>
      ) : (
        <div data-testid="detalle-problema">
          <section className="mt-6">
            <h3 className="text-[10.5px] font-semibold tracking-[0.14em] text-faint">DÓNDE</h3>
            <select
              value={elegida}
              onChange={(ev) => setElegida(ev.target.value)}
              data-testid="elegir-tarea"
              className={`${CAMPO} mt-2 h-[48px]`}
            >
              <option value="">Sin tarea: es un problema de la obra</option>
              {tareas.map((t) => (
                <option key={t.id} value={t.id}>{t.nombre}</option>
              ))}
            </select>
          </section>

          <section className="mt-5">
            <h3 className="text-[10.5px] font-semibold tracking-[0.14em] text-faint">QUÉ PASA</h3>
            <textarea
              name="descripcion"
              rows={3}
              required
              minLength={5}
              data-testid="descripcion-problema"
              placeholder={m.pista}
              className={`${CAMPO} mt-2 h-auto py-2.5 leading-relaxed`}
            />
          </section>

          <section className="mt-5">
            <h3 className="text-[10.5px] font-semibold tracking-[0.14em] text-faint">FOTO (OPCIONAL)</h3>
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

          <section className="mt-5">
            <h3 className="text-[10.5px] font-semibold tracking-[0.14em] text-faint">¿ESTÁN PARADOS?</h3>
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
        </div>
      )}

      {/* ═══ LO QUE YA AVISASTE — cierra el círculo ═══
          La nota del mockup: «El empleado ve el estado de lo que avisó». Sin esto, el que reportó
          ayer no sabe si alguien lo miró, y vuelve a reportar lo mismo: dos filas para el jefe y
          ninguna señal nueva. */}
      <section className="mt-7" data-testid="ya-avisaste">
        <h3 className="text-[13px] font-semibold text-ink">Lo que ya avisaste</h3>
        <div className="mt-2 overflow-hidden rounded-[14px] border border-line bg-surface">
          {yaAvisado.length === 0 ? (
            <p className="px-4 py-3.5 text-[12.5px] text-faint" data-testid="sin-avisos">
              No avisaste nada todavía. Lo que reportes queda acá con su estado.
            </p>
          ) : (
            yaAvisado.map((i) => (
              <div key={i.id} data-testid="aviso-previo" className="flex min-h-[60px] items-center gap-3 border-b border-[#EFEEEA] px-4 py-2.5 last:border-b-0">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14.5px] text-ink">{i.descripcion ?? 'Sin describir'}</span>
                  <span className="mt-0.5 block truncate text-[12px] text-faint">
                    {i.creado_en.slice(8, 10)}/{i.creado_en.slice(5, 7)} · {i.actividad ?? 'problema de la obra'}
                  </span>
                </span>
                {/* EL ESTADO CON SU PALABRA, NO CON UN PUNTITO. `resuelta` en verde, todo lo demás
                    sigue abierto: un impedimento que nadie cerró está abierto aunque diga otra cosa. */}
                <span className={`shrink-0 text-[12px] ${i.estado === 'resuelta' ? 'text-pos' : 'text-neg'}`}>
                  {i.estado === 'resuelta' ? 'Resuelto' : 'Abierto'}
                </span>
              </div>
            ))
          )}
        </div>
      </section>

      {estado.error && <p className="mt-4 text-[12.5px] text-neg" data-testid="problema-error">{estado.error}</p>}

      <PieFijo testid="pie-problema">
        <BotonPie disabled={enviando || !listo} testid="enviar-problema">
          {enviando ? 'Avisando…' : !m ? 'Elegí qué pasa' : frena === '' ? 'Decí si están parados' : 'Avisar'}
        </BotonPie>
      </PieFijo>
    </form>
  )
}
