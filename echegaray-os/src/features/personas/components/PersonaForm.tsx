'use client'

import { useActionState } from 'react'
import { createPersonaAction, type ActionState } from '../services/actions'

const initialState: ActionState = { error: null }

export function PersonaForm() {
  const [state, formAction, pending] = useActionState(createPersonaAction, initialState)

  return (
    <form action={formAction} className="flex flex-col gap-2 rounded border p-4" data-testid="persona-alta-form">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label className="col-span-2 flex flex-col text-sm">
          Nombre completo
          <input name="nombre_completo" required className="rounded border px-2 py-1" />
        </label>
        <label className="flex flex-col text-sm">
          DNI
          <input name="dni" className="rounded border px-2 py-1" />
        </label>
        <label className="flex flex-col text-sm">
          CUIL
          <input name="cuil" className="rounded border px-2 py-1" />
        </label>

        <label className="flex flex-col text-sm">
          Fecha de ingreso
          <input name="fecha_ingreso" type="date" required className="rounded border px-2 py-1" />
        </label>
        <label className="flex flex-col text-sm">
          Categoría
          <input name="categoria" placeholder="ej. Oficial" className="rounded border px-2 py-1" />
        </label>
        <label className="flex flex-col text-sm">
          Especialidad
          <input name="especialidad" className="rounded border px-2 py-1" />
        </label>
        <label className="flex flex-col text-sm">
          ART
          <input name="art" className="rounded border px-2 py-1" />
        </label>

        <label className="flex flex-col text-sm">
          Obra social
          <input name="obra_social" className="rounded border px-2 py-1" />
        </label>
        <label className="flex flex-col text-sm">
          Convenio colectivo
          <input name="convenio_colectivo" className="rounded border px-2 py-1" />
        </label>
        <label className="flex flex-col text-sm">
          Retribución pactada
          <input name="retribucion_pactada" type="number" step="0.01" className="rounded border px-2 py-1" />
        </label>
        <label className="flex flex-col text-sm">
          Modalidad de liquidación
          <input name="modalidad_liquidacion" placeholder="ej. mensual, jornal" className="rounded border px-2 py-1" />
        </label>
      </div>

      {state.error && <span className="text-sm text-red-600">{state.error}</span>}

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded bg-black px-3 py-1 text-white disabled:opacity-50"
      >
        {pending ? 'Guardando...' : 'Dar de alta legajo'}
      </button>
    </form>
  )
}
