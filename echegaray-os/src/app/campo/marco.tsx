import Link from 'next/link'
import type { ReactNode } from 'react'
import { Vacio } from '@/shared/components/ds'
import type { ObraDelCampo } from './datos'

// EL MARCO DE LAS PANTALLAS DE CAMPO. Una columna, 16px de padding, sin nada que sobre.
//
// No usa `PageShell` a propósito: ese marco está calibrado para escritorio (40px de padding, título
// de 22px, header global de dos áreas). Acá la pantalla mide 390px, no hay navegación de áreas y el
// título tiene que competir con nada. Lo que sí se comparte es la escala tipográfica y los tokens.

export function MarcoCampo({
  titulo,
  subtitulo,
  volver,
  children,
}: {
  titulo: string
  subtitulo?: string
  volver?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="min-h-screen bg-surface">
      <div className="mx-auto w-full max-w-[560px] px-4 py-5">
        {volver ?? (
          <Link href="/campo" className="text-[12px] text-muted hover:text-ink">
            ← Campo
          </Link>
        )}
        <h1 className="mt-2 text-[20px] font-semibold tracking-[-0.01em] text-ink">{titulo}</h1>
        {subtitulo && <p className="mt-1 text-[12.5px] text-muted">{subtitulo}</p>}
        <div className="mt-5">{children}</div>
      </div>
    </div>
  )
}

/**
 * Elegir la obra cuando la persona tiene más de una. Es una LISTA de objetivos de 56px, no un
 * desplegable: en el teléfono, tocar una fila grande es más rápido y no se equivoca.
 */
export function ElegirObra({ obras, hrefBase }: { obras: ObraDelCampo[]; hrefBase: string }) {
  if (obras.length === 0) {
    return (
      <Vacio>
        No tenés ninguna obra asignada. Las asigna Administración desde Usuarios; hasta entonces no hay dónde cargar.
      </Vacio>
    )
  }
  return (
    <div>
      <p className="mb-3 text-[12.5px] text-muted">¿De qué obra?</p>
      <ul>
        {obras.map((o, i) => (
          <li key={o.id} className={i === obras.length - 1 ? '' : 'border-b border-[#EFEEEA]'}>
            <Link
              href={`${hrefBase}?obra=${encodeURIComponent(o.id)}`}
              data-testid="elegir-obra"
              className="flex min-h-[56px] items-center gap-3 py-2 text-[15px] text-ink active:bg-surface-quiet"
            >
              <span className="min-w-0 flex-1">{o.nombre}</span>
              <span aria-hidden className="text-[15px] text-line-strong">
                ›
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
