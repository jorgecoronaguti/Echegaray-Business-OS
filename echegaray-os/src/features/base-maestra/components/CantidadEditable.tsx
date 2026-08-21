'use client'

// LA CANTIDAD SE EDITA EN LA CELDA Y SE GUARDA AL SALIR DEL CAMPO.
//
// Sin `Ver → Editar → formulario → Guardar`: se hace clic en el número, se escribe, se sale, y
// listo. Enter también guarda; Escape cancela y devuelve el valor que estaba.
//
// ═══ GUARDAR ACÁ NO PISA NADA: CREA UNA VERSIÓN NUEVA ═══
//
// `versionarCantidad` copia la composición entera a una versión nueva y recién ahí aplica el
// cambio. Lo que ya se cotizó y lo que ya está colgado de una obra en ejecución siguen apuntando a
// la versión vieja, intacta. Por eso el aviso de abajo dice «versión N»: quien edita tiene que
// saber que acaba de crear una, no que corrigió un número.
//
// SÓLO SE GUARDA SI EL VALOR CAMBIÓ. Entrar a la celda y salir sin tocar nada no puede generar una
// versión: el historial se llenaría de versiones idénticas y dejaría de servir para saber qué pasó.

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { versionarCantidad } from '../services/analisisActions'
import { numero } from '../services/reglas'

export function CantidadEditable({
  tareaTipoId, analisisId, lineaId, cantidad, unidad,
}: {
  tareaTipoId: string
  analisisId: string
  lineaId: string
  cantidad: number
  unidad: string
}) {
  const router = useRouter()
  const [editando, setEditando] = useState(false)
  const [texto, setTexto] = useState(String(cantidad))
  const [error, setError] = useState<string | null>(null)
  const [guardando, empezar] = useTransition()
  // El valor con el que se entró al campo. Es contra ÉSTE que se compara para decidir si hay
  // cambio — no contra la prop, que puede haberse revalidado mientras se escribía.
  const alEntrar = useRef(String(cantidad))

  function guardar() {
    setEditando(false)
    const limpio = texto.trim().replace(',', '.')
    if (limpio === alEntrar.current.trim().replace(',', '.')) return
    const n = Number(limpio)
    if (!Number.isFinite(n) || n < 0) {
      setError('Cantidad inválida')
      setTexto(alEntrar.current)
      return
    }
    const form = new FormData()
    form.set('lineaId', lineaId)
    form.set('cantidad', String(n))
    empezar(async () => {
      const r = await versionarCantidad(tareaTipoId, analisisId, form)
      if (!r.ok) {
        // EL ERROR REAL, NO UNO AMABLE: «no se pudo guardar» no deja arreglar nada.
        setError(r.error)
        setTexto(alEntrar.current)
        return
      }
      setError(null)
      alEntrar.current = String(n)
      router.refresh()
    })
  }

  if (!editando) {
    return (
      <button
        type="button"
        onClick={() => { alEntrar.current = texto; setEditando(true) }}
        data-testid={`cantidad-${lineaId}`}
        title={error ?? `Editar la cantidad · crea una versión nueva del análisis`}
        className={`w-full rounded-control px-1 py-[3px] text-right font-mono text-[11.5px] tabular-nums transition-colors hover:bg-surface-quiet ${
          error ? 'text-neg' : 'text-ink-soft'
        } ${guardando ? 'opacity-50' : ''}`}
      >
        {numero(cantidad, 2)} <span className="text-[9.5px] text-faint">{unidad}</span>
      </button>
    )
  }

  return (
    <input
      autoFocus
      inputMode="decimal"
      value={texto}
      disabled={guardando}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={guardar}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() }
        if (e.key === 'Escape') { setTexto(alEntrar.current); setEditando(false) }
      }}
      aria-label={`Cantidad en ${unidad}`}
      data-testid={`cantidad-input-${lineaId}`}
      className="w-full rounded-control border border-marca bg-surface px-1 py-[3px] text-right font-mono text-[11.5px] tabular-nums text-ink outline-none"
    />
  )
}
