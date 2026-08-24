import type { ReactNode } from 'react'

// LAS PIEZAS QUE FALTABAN PARA M05, M07 Y M08 — las que `Bloques.tsx` no tiene.
//
// Viven aparte y no dentro de `Bloques.tsx` porque ése ya está construido y probado: agregarle
// cuatro componentes lo empujaba contra el techo de 500 líneas del repo y mezclaba lo que la
// tarjeta sabe (contener) con lo que estas piezas saben (el pie fijo, el grupo, el azulejo táctil).

/**
 * EL PIE FIJO DE LAS PANTALLAS DE ACCIÓN (M04, M05, M07, M08).
 *
 * Los mockups dejan la primaria pegada abajo, sobre una barra blanca con su borde. No es estética:
 * en 390px, con una lista de quince filas, una primaria al final del documento exige desplazar
 * hasta el fondo para hacer lo único que la pantalla vino a hacer. Fija, se toca sin buscar.
 *
 * EL HUECO LO PONE ESTA PIEZA (`h-[76px]` en el flujo). Sin él, la última fila de la lista queda
 * tapada por la barra y nadie la puede tocar — que es el mismo defecto que ya pagó la barra de
 * contextos del shell.
 */
export function PieFijo({ children, testid }: { children: ReactNode; testid?: string }) {
  return (
    <>
      <div aria-hidden className="h-[76px]" />
      <div
        data-testid={testid}
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface px-4 py-3 lg:static lg:mt-6 lg:border-0 lg:bg-transparent lg:px-0 lg:py-0"
      >
        <div className="mx-auto w-full max-w-[1100px] lg:px-8">{children}</div>
      </div>
    </>
  )
}

/**
 * EL BOTÓN DE ACCIÓN DEL PIE. 52px, un solo verbo, y APAGADO DICE QUÉ FALTA.
 *
 * «Guardar avance» en gris se lee como un sistema roto; «Elegí qué pasa» se lee como la instrucción
 * que queda. Es la misma regla que ya aplica `FormProblema`, subida a una pieza para que M04, M05 y
 * M07 no la reimplementen cada una a su manera.
 */
export function BotonPie({
  children, tono = 'ink', disabled, type = 'submit', testid,
}: {
  children: ReactNode
  tono?: 'ink' | 'marca'
  disabled?: boolean
  type?: 'submit' | 'button'
  testid?: string
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      data-testid={testid}
      className={`flex h-[52px] w-full items-center justify-center rounded-[12px] text-[14.5px] font-semibold disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-faint ${
        tono === 'marca' ? 'bg-marca text-[color:var(--os-on-marca)]' : 'bg-ink text-white'
      }`}
    >
      {children}
    </button>
  )
}

/** El encabezado de grupo de M08: el para-qué-sirve a la izquierda y cuántos hay a la derecha. No
 *  es una sección plegable: los tres grupos entran en una pantalla y plegarlos escondería el apto
 *  médico vencido detrás de un toque. */
export function Grupo({ titulo, cuenta, children, testid }: {
  titulo: string
  cuenta: number
  children: ReactNode
  testid?: string
}) {
  return (
    <section className="mt-5 first:mt-0" data-testid={testid}>
      <div className="flex items-baseline gap-3 px-1">
        <h2 className="text-[13px] font-semibold text-ink">{titulo}</h2>
        <span className="ml-auto font-mono text-[12px] tabular-nums text-faint">{cuenta}</span>
      </div>
      <div className="mt-2 overflow-hidden rounded-[14px] border border-line bg-surface">{children}</div>
    </section>
  )
}

/** Una fila DENTRO de un grupo de M08: título, su estado escrito con el color que le corresponde, y
 *  la acción a la derecha. La ausencia se nombra —«sin cargar»— y nunca se deja el renglón en
 *  blanco: un hueco se lee como que la pantalla todavía está cargando. */
export function FilaGrupo({
  titulo, nota, tono = 'faint', href, accion, marca, testid, destacada,
}: {
  titulo: ReactNode
  nota: ReactNode
  tono?: 'faint' | 'warn' | 'neg' | 'pos'
  href?: string
  accion?: ReactNode
  /** La pastilla «nuevo» del mockup, a la derecha del título. */
  marca?: string
  testid?: string
  destacada?: boolean
}) {
  const color = tono === 'neg' ? 'text-neg' : tono === 'warn' ? 'text-warn' : tono === 'pos' ? 'text-pos' : 'text-faint'
  const cuerpo = (
    <>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-[14.5px] text-ink">{titulo}</span>
          {marca && (
            <span className="shrink-0 rounded-full bg-marca px-2 py-[1px] text-[10.5px] font-semibold text-[color:var(--os-on-marca)]">
              {marca}
            </span>
          )}
        </span>
        <span className={`mt-0.5 block truncate text-[12px] ${color}`}>{nota}</span>
      </span>
      {accion}
    </>
  )
  const clases = `flex min-h-[60px] items-center gap-3 border-b border-[#EFEEEA] px-4 py-2.5 last:border-b-0 ${
    destacada ? 'bg-marca-soft' : ''
  }`
  return href ? (
    <a href={href} data-testid={testid} className={`${clases} active:bg-surface-quiet`}>{cuerpo}</a>
  ) : (
    <div data-testid={testid} className={clases}>{cuerpo}</div>
  )
}
