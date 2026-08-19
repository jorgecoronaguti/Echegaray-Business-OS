'use client'

// LAS PRIMITIVAS DEL PANEL DE ACTIVIDAD — rótulo, dato y plegable.
//
// Tres piezas y un formateador, usados por los ocho bloques. Si cada bloque trajera el suyo, la
// columna se leería como ocho pantallas apiladas en vez de una, y el día que el rótulo cambie de
// tamaño lo haría en seis de los ocho.
//
// NULL NO ES CERO, NUNCA. `Dato` sin valor escribe «sin cargar»: un panel que dibuja 0 HH donde
// nadie imputó horas convierte un dato que falta en un dato malo, y después alguien decide con eso.

import type { ReactNode } from 'react'

export const n2 = (v: number | null | undefined) =>
  (v == null ? null : Number(v).toLocaleString('es-AR', { maximumFractionDigits: 2 }))

/** El rótulo de un bloque del panel. Uno solo para los ocho: si cada uno trajera el suyo, la
 *  columna se leería como ocho pantallas apiladas en vez de una. */
export function Rotulo({ children, cuenta, verMas, verMasTitulo }: {
  children: ReactNode
  cuenta?: number | null
  /** A dónde lleva el bloque cuando hay un detalle que el panel no puede contener. */
  verMas?: string
  verMasTitulo?: string
}) {
  return (
    <p className="mb-1 flex items-baseline gap-1.5 text-[10px] uppercase tracking-wide text-faint">
      {children}
      {cuenta != null && cuenta > 0 && <span className="tabular-nums text-muted">{cuenta}</span>}
      {/* EL DETALLE NO SE REIMPLEMENTA EN EL PANEL: lleva a la solapa donde ese dato se edita. Un
          segundo lugar para asignar personal sería un segundo lugar donde se escriben horas. */}
      {verMas && (
        <a
          href={verMas}
          title={verMasTitulo}
          data-testid="ver-mas-bloque"
          className="ml-auto text-[12px] normal-case tracking-normal text-muted hover:text-ink"
          aria-label={verMasTitulo}
        >›</a>
      )}
    </p>
  )
}

/** Una línea de la lista Plan/Real. FUERA del componente a propósito: definida adentro, React la
 *  vuelve a crear en cada render y remonta el subárbol. */
export function Dato({ k, v }: { k: string; v: ReactNode }) {
  return (
    <>
      <dt className="truncate text-faint">{k}</dt>
      <dd className="text-right tabular-nums text-ink">{v ?? <span className="text-faint">sin cargar</span>}</dd>
    </>
  )
}

/** El plegable de los bloques secundarios. Compacto y con el conteo a la vista: lo que hay adentro
 *  se sabe sin abrirlo, que es lo que hace que abrirlo valga la pena. */
export function Plegable({ titulo, cuenta, testid, children }: {
  titulo: string
  cuenta?: number | null
  testid?: string
  children: ReactNode
}) {
  return (
    <details className="rounded-md border border-line bg-surface px-2.5 py-1.5" data-testid={testid}>
      <summary className="cursor-pointer text-[12px] text-muted">
        {titulo}
        {cuenta != null && cuenta > 0 && <span className="ml-2 tabular-nums text-ink">{cuenta}</span>}
      </summary>
      <div className="mt-2">{children}</div>
    </details>
  )
}
