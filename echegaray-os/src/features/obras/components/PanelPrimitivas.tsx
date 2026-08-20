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
    // EL RÓTULO ES UN TÍTULO DE SECCIÓN, no una etiqueta micro en versalitas. En el objetivo
    // «Plan», «Real», «Cuadrilla / Personal», «Ejecución reciente» se leen como encabezados del
    // panel —texto normal, en el color del texto— y son lo que deja recorrerlo de un vistazo.
    <p className="mb-1.5 flex items-baseline gap-1.5 text-[0.98em] font-semibold text-ink">
      {children}
      {cuenta != null && cuenta > 0 && <span className="text-[0.85em] font-normal tabular-nums text-muted">{cuenta}</span>}
      {/* EL DETALLE NO SE REIMPLEMENTA EN EL PANEL: lleva a la solapa donde ese dato se edita. Un
          segundo lugar para asignar personal sería un segundo lugar donde se escriben horas. */}
      {verMas && (
        <a
          href={verMas}
          title={verMasTitulo}
          data-testid="ver-mas-bloque"
          className="ml-auto text-[0.92em] normal-case tracking-normal text-muted hover:text-ink"
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
export function Plegable({ titulo, cuenta, testid, abierto, children }: {
  titulo: string
  cuenta?: number | null
  testid?: string
  /** Abierto de entrada. Lo usa el panel cuando el bloque ES la pestaña: ahí no hay nada que
   *  desplegar, ya se eligió mirarlo. */
  abierto?: boolean
  children: ReactNode
}) {
  return (
    <details className="rounded-card border border-line bg-surface px-3 py-2" data-testid={testid} open={abierto}>
      <summary className="cursor-pointer text-[0.92em] text-muted">
        {titulo}
        {cuenta != null && cuenta > 0 && <span className="ml-2 tabular-nums text-ink">{cuenta}</span>}
      </summary>
      <div className="mt-2">{children}</div>
    </details>
  )
}
