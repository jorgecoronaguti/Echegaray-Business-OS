'use client'

// LA BARRA CONTEXTUAL — lo que aparece abajo cuando hay una selección, y sólo entonces.
//
// ═══ POR QUÉ SUBIÓ A `shared/` (21/08/2026) ═══
//
// Vivía en `features/obras/components/AccionesMasivas.tsx` atada a las tres acciones del
// cronograma. La forma —cuántas hay, qué se les hace, con qué valor, y el aviso de lo que se pierde
// al hacerlo en lote— es la misma en Tareas, en Avance masivo, en Compras y en Personal. Acá queda
// la forma; el contenido lo pone cada pantalla.
//
// ═══ TRES REGLAS QUE HACE CUMPLIR ═══
//
// 1. **SIN SELECCIÓN NO SE DIBUJA.** Una barra siempre presente con cuatro botones apagados le suma
//    ruido permanente a la vista más usada para servir a algo que se hace de a ratos.
// 2. **EL BOTÓN DICE A CUÁNTAS.** «Aplicar a 14» y no «Aplicar»: el número es una promesa, y tiene
//    que coincidir con el que después informa el resultado.
// 3. **LA SELECCIÓN NO SE LIMPIA SOLA.** Poner en marcha un frente es cambiar responsable Y fechas Y
//    estado sobre EL MISMO grupo. Se limpia cuando la persona lo dice.

import type { ReactNode } from 'react'

export interface OperacionBarra {
  id: string
  label: string
  /** `false` la deja legible pero apagada: se ve que existe y que ahora no aplica. */
  disponible?: boolean
}

export function BarraContextual({
  titulo, subtitulo, operaciones, activa, alElegirOperacion, children,
  aviso, resultado, alCancelar, aplicarLabel, alAplicar, pendiente = false, testid = 'barra-contextual',
}: {
  titulo: ReactNode
  subtitulo?: ReactNode
  operaciones: OperacionBarra[]
  activa: string
  alElegirOperacion: (id: string) => void
  /** El control del valor de la operación elegida: los chips, un selector, un campo. */
  children?: ReactNode
  aviso?: string | null
  resultado?: ReactNode
  alCancelar: () => void
  aplicarLabel: string
  alAplicar: () => void
  pendiente?: boolean
  testid?: string
}) {
  return (
    <div
      data-testid={testid}
      className="fixed inset-x-0 bottom-0 z-40 bg-accent px-4 py-2.5 shadow-pop"
    >
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-5 gap-y-2">
        <div className="shrink-0">
          <div data-testid={`${testid}-conteo`} className="text-[14px] font-semibold text-white">{titulo}</div>
          {subtitulo && <div className="text-[11.5px] text-faint">{subtitulo}</div>}
        </div>

        <div className="flex flex-wrap items-center gap-4">
          {operaciones.map((o) => (
            <button
              key={o.id}
              type="button"
              disabled={o.disponible === false}
              aria-pressed={activa === o.id}
              data-testid={`${testid}-op-${o.id}`}
              onClick={() => alElegirOperacion(o.id)}
              className={`pb-[3px] text-[13px] transition-colors ${
                activa === o.id
                  ? 'border-b-[1.5px] border-marca font-medium text-white'
                  : 'border-b-[1.5px] border-transparent text-faint hover:text-white disabled:hover:text-faint'
              }`}
            >{o.label}</button>
          ))}
        </div>

        {children && <div className="flex flex-wrap items-center gap-1.5">{children}</div>}

        <div className="ml-auto flex flex-wrap items-center justify-end gap-3">
          {/* EL AVISO NO BLOQUEA: dice qué se pierde y deja decidir. Un aviso que impide seguir se
              vuelve un obstáculo que se aprende a esquivar sin leer. */}
          {aviso && (
            <span data-testid={`${testid}-aviso`} className="max-w-[340px] text-[11.5px] leading-snug text-line">
              <span aria-hidden className="mr-1 text-marca">△</span>{aviso}
            </span>
          )}
          {resultado}
          <button
            type="button"
            onClick={alCancelar}
            data-testid={`${testid}-cancelar`}
            className="text-[12.5px] text-faint transition-colors hover:text-white"
          >Cancelar</button>
          <button
            type="button"
            disabled={pendiente}
            onClick={alAplicar}
            data-testid={`${testid}-aplicar`}
            className="rounded-control bg-marca px-3.5 py-1.5 text-[13px] font-semibold text-ink transition-opacity hover:opacity-90 disabled:opacity-50"
          >{pendiente ? 'Aplicando…' : aplicarLabel}</button>
        </div>
      </div>
    </div>
  )
}

/** Los valores de una operación, en mono. El activo va en la marca; el resto, apagado sobre grafito. */
export function ChipsValor({
  valores, activo, alElegir, testid = 'chip',
}: {
  valores: { valor: string; etiqueta: string }[]
  activo: string
  alElegir: (v: string) => void
  testid?: string
}) {
  return (
    <>
      {valores.map((v) => (
        <button
          key={v.valor}
          type="button"
          aria-pressed={activo === v.valor}
          data-testid={`${testid}-${v.valor}`}
          onClick={() => alElegir(v.valor)}
          className={`rounded-control px-2.5 py-1 font-mono text-[11.5px] font-semibold tabular-nums transition-colors ${
            activo === v.valor ? 'bg-marca text-ink' : 'bg-accent-hover text-white hover:opacity-80'
          }`}
        >{v.etiqueta}</button>
      ))}
    </>
  )
}
