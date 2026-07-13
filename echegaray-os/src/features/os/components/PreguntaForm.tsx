'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cargarObjetivo } from '@/features/direccion/services/actions'

// Caja universal de pregunta/pedido al OS. Cualquier usuario escribe lo que
// necesita en lenguaje normal; el OS activa a los especialistas de cada dominio
// (con su conocimiento y las fuentes reales) y responde. Reusa la misma acción del
// Director (cargarObjetivo): el título se deriva del texto, prioridad por defecto.

const EJEMPLOS = [
  'Proponé cómo ordenar mejor la carpeta administración',
  '¿Qué legajos de personal están incompletos y qué falta en cada uno?',
  'Revisá la carpeta de presupuestos y proponé cómo organizarla',
  '¿Qué facturas no tienen comprobante de pago asociado?',
  '¿Cuál es nuestra posición de caja hoy y qué riesgo tenemos?',
  'Dame ideas para reducir el desorden administrativo',
]

export function PreguntaForm() {
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const router = useRouter()

  function enviar(fd: FormData) {
    setMsg(null)
    start(async () => {
      const res = await cargarObjetivo(fd)
      if (res.ok) {
        setMsg({ ok: true, text: 'El OS lo está trabajando con sus especialistas. La respuesta aparece abajo en unos minutos.' })
        formRef.current?.reset()
        router.refresh()
      } else {
        setMsg({ ok: false, text: res.error ?? 'Error' })
      }
    })
  }

  return (
    <form
      ref={formRef}
      onSubmit={(e) => { e.preventDefault(); enviar(new FormData(e.currentTarget)) }}
      className="space-y-3"
    >
      <textarea
        ref={taRef}
        name="goal"
        required
        rows={3}
        placeholder="Preguntale, pedile una mejora sobre los archivos y su organización, una tarea de administración o una idea… (caja, legajos, presupuestos, facturas, orden de la carpeta administración — lo que necesites)"
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? 'Enviando…' : 'Preguntar al OS'}
        </button>
        {msg && <span className={`text-xs ${msg.ok ? 'text-emerald-600' : 'text-red-600'}`}>{msg.text}</span>}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {EJEMPLOS.map((ej) => (
          <button
            key={ej}
            type="button"
            onClick={() => { if (taRef.current) { taRef.current.value = ej; taRef.current.focus() } }}
            className="rounded-full border border-slate-200 px-2.5 py-1 text-[11px] text-slate-500 hover:bg-slate-50"
          >
            {ej}
          </button>
        ))}
      </div>
    </form>
  )
}
