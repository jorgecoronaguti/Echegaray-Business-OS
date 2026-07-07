'use client'

import { useActionState } from 'react'
import { guardarBorradorPostMortemAction, cerrarPostMortemAction, type ActionState } from '../services/actions'
import type { PostMortem } from '../types'

const initialState: ActionState = { error: null }

export function PostMortemForm({ postMortem, obraId }: { postMortem: PostMortem; obraId: string }) {
  const [stateBorrador, formActionBorrador, pendingBorrador] = useActionState(
    guardarBorradorPostMortemAction,
    initialState
  )
  const [stateCierre, formActionCierre, pendingCierre] = useActionState(cerrarPostMortemAction, initialState)

  return (
    <div className="space-y-3">
      <form action={formActionBorrador} className="flex flex-col gap-2 rounded border p-4">
        <input type="hidden" name="post_mortem_id" value={postMortem.id} />
        <input type="hidden" name="obra_id_para_revalidar" value={obraId} />

        <label className="flex flex-col text-sm">
          Causas del desvío
          <textarea
            name="causas_desvio"
            defaultValue={postMortem.causas_desvio ?? ''}
            className="rounded border px-2 py-1"
          />
        </label>

        <label className="flex flex-col text-sm">
          Aprendizajes
          <textarea
            name="aprendizajes"
            defaultValue={postMortem.aprendizajes ?? ''}
            className="rounded border px-2 py-1"
          />
        </label>

        <label className="flex flex-col text-sm">
          Acciones recomendadas
          <textarea
            name="acciones_recomendadas"
            defaultValue={postMortem.acciones_recomendadas ?? ''}
            className="rounded border px-2 py-1"
          />
        </label>

        <label className="flex flex-col text-sm">
          Cambios sugeridos para la próxima cotización
          <textarea
            name="cambios_sugeridos_cotizacion"
            defaultValue={postMortem.cambios_sugeridos_cotizacion ?? ''}
            className="rounded border px-2 py-1"
          />
        </label>

        <textarea
          name="notas"
          placeholder="Notas (opcional)"
          defaultValue={postMortem.notas ?? ''}
          className="rounded border px-2 py-1"
        />

        {stateBorrador.error && <span className="text-sm text-red-600">{stateBorrador.error}</span>}

        <button
          type="submit"
          disabled={pendingBorrador}
          className="self-start rounded bg-black px-3 py-1 text-white disabled:opacity-50"
        >
          {pendingBorrador ? 'Guardando...' : 'Guardar borrador'}
        </button>
      </form>

      {postMortem.estado === 'borrador' && (
        <form action={formActionCierre} className="rounded border border-dashed p-3">
          <input type="hidden" name="post_mortem_id" value={postMortem.id} />
          <input type="hidden" name="obra_id" value={obraId} />
          <p className="text-sm text-gray-600">
            Cerrar congela el resumen actual como snapshot permanente. Solo se puede cerrar si la Obra está en
            estado &quot;cerrada&quot;.
          </p>
          {stateCierre.error && <p className="mt-1 text-sm text-red-600">{stateCierre.error}</p>}
          <button
            type="submit"
            disabled={pendingCierre}
            className="mt-2 rounded bg-red-700 px-3 py-1 text-white disabled:opacity-50"
          >
            {pendingCierre ? 'Cerrando...' : 'Cerrar Post Mortem'}
          </button>
        </form>
      )}
    </div>
  )
}
