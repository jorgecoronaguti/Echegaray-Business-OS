'use client'

import { useActionState, useState } from 'react'
import { useRouter } from 'next/navigation'
import { subirDocumento } from '../services/acciones'

// SUBIR UN DOCUMENTO — «Sacar una foto» y «Elegir un archivo» son DOS objetivos, no un input.
//
// En un teléfono, un `<input type=file>` desnudo abre un menú del sistema donde «cámara» es una de
// cinco opciones. El handoff separa las dos porque el caso real es uno: el operario tiene el papel
// en la mano y le saca una foto. `capture="environment"` abre la cámara trasera directo.
//
// EL BOTÓN NACE DESHABILITADO. «Se habilita cuando adjuntás el archivo», dice el handoff: un
// «Enviar» que se puede tocar sin archivo enseña que el formulario no sabe lo que le falta.

type EstadoForm = { error: string | null }

export function FormSubirDocumento({
  documentacionId, tipoDocumento, volverA,
}: {
  documentacionId: string
  tipoDocumento: string
  volverA: string
}) {
  const router = useRouter()
  const [nombre, setNombre] = useState<string | null>(null)
  const [estado, accion, enviando] = useActionState(
    async (_prev: EstadoForm, form: FormData): Promise<EstadoForm> => {
      const r = await subirDocumento(form)
      if (!r.ok) return { error: r.error }
      router.push(volverA)
      router.refresh()
      return { error: null }
    },
    { error: null },
  )

  return (
    <form action={accion} data-testid="form-subir-documento">
      <input type="hidden" name="documentacion_id" value={documentacionId} />
      <input type="hidden" name="tipo_documento" value={tipoDocumento} />

      <h2 className="text-[10.5px] font-semibold tracking-[0.14em] text-faint">VOLVER A SUBIR</h2>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <label className="flex h-[52px] flex-1 cursor-pointer items-center justify-center rounded-control border border-line text-[14px] text-ink active:bg-surface-quiet">
          Sacar una foto
          <input
            type="file" name="archivo" accept="image/*" capture="environment" className="hidden"
            data-testid="sacar-foto"
            onChange={(e) => setNombre(e.target.files?.[0]?.name ?? null)}
          />
        </label>
        <label className="flex h-[52px] flex-1 cursor-pointer items-center justify-center rounded-control border border-line text-[14px] text-ink active:bg-surface-quiet">
          Elegir un archivo
          <input
            type="file" name="archivo" accept="image/*,application/pdf" className="hidden"
            data-testid="elegir-archivo"
            onChange={(e) => setNombre(e.target.files?.[0]?.name ?? null)}
          />
        </label>
      </div>
      <p className="mt-2 text-[11.5px] leading-relaxed text-faint">
        Que se lea la fecha y entre completo en la foto. JPG o PDF, hasta 10 MB.
      </p>

      {nombre && <p className="mt-2 text-[12.5px] text-ink" data-testid="archivo-elegido">{nombre}</p>}
      {estado.error && <p className="mt-3 text-[12.5px] text-neg" data-testid="subir-error">{estado.error}</p>}

      {/* APAGADO, EL BOTÓN DICE QUÉ FALTA. «Enviar» en gris obliga a buscar la explicación abajo;
          «Adjuntá el archivo» ES la explicación, en el único lugar donde el dedo ya está mirando. */}
      <button
        type="submit"
        disabled={enviando || !nombre}
        data-testid="enviar-documento"
        className="mt-6 flex h-[52px] w-full items-center justify-center rounded-control bg-marca text-[15px] font-semibold text-[color:var(--os-on-marca)] disabled:opacity-50 lg:w-auto lg:px-6"
      >
        {enviando ? 'Enviando…' : nombre ? 'Enviar' : 'Adjuntá el archivo'}
      </button>
    </form>
  )
}
