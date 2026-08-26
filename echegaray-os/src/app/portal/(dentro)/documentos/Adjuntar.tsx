'use client'

import { useActionState } from 'react'
import { registrarAdjunto } from './acciones'
import { IconoClip } from '../../iconos'

// ADJUNTAR — foto, plano o PDF.
//
// El archivo NO se manda al Drive desde el navegador: se registra el pedido y administración recibe
// el aviso. Subir a Drive desde el cliente exigiría darle un token con permiso de escritura sobre la
// carpeta de la obra, y ese token vive en el navegador de alguien que no es de la empresa.

export function Adjuntar({ obraId }: { obraId: string }) {
  const [estado, enviar, pendiente] = useActionState(registrarAdjunto, { hecho: false } as { hecho: boolean; error?: string })

  if (estado.hecho) {
    return <p className="text-[12.5px] text-pos">Recibido. Administración ya está avisada.</p>
  }
  return (
    <form action={enviar} className="flex items-center gap-2">
      <input type="hidden" name="obraId" value={obraId} />
      <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-[6px] border border-line-strong bg-surface px-3.5 text-[13px] text-ink hover:border-faint">
        <IconoClip tamano={17} />
        <span>Adjuntar</span>
        <input type="file" name="archivo" accept="image/*,application/pdf,.dwg" className="sr-only" required />
      </label>
      <button
        type="submit"
        disabled={pendiente}
        className="min-h-11 rounded-[6px] bg-marca px-4 text-[13px] font-semibold text-ink disabled:opacity-60"
      >
        {pendiente ? 'Enviando…' : 'Enviar'}
      </button>
      {estado.error ? <span className="text-[12.5px] text-warn">{estado.error}</span> : null}
    </form>
  )
}
