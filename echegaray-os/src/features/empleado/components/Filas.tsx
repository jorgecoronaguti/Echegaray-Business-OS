import Link from 'next/link'
import type { ReactNode } from 'react'

// LAS FILAS DEL PERFIL EMPLEADO — listas legibles, no una tabla de escritorio comprimida.
//
// El handoff, sobre Mis documentos: «Mobile: lista legible (nombre, categoría, punto + estado,
// vencimiento, acción a la derecha) — NO una tabla desktop comprimida». Vale para todas: en 390px
// una tabla de seis columnas se lee con lupa o se desplaza de costado, y las dos cosas se abandonan.
//
// OBJETIVOS DE 60px. Se toca con el dedo, en obra, muchas veces con guante. El Design System pide
// 44px como mínimo; acá se usa 60 porque cada fila lleva dos líneas de texto.

export function Fila({
  href, titulo, detalle, senal, senalTono = 'faint', accion, testid,
}: {
  href?: string
  titulo: ReactNode
  detalle?: ReactNode
  senal?: ReactNode
  senalTono?: 'faint' | 'warn' | 'neg'
  accion?: ReactNode
  testid?: string
}) {
  const cuerpo = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] text-ink">{titulo}</span>
        {detalle != null && <span className="mt-0.5 block text-[12px] text-faint">{detalle}</span>}
      </span>
      {senal != null && (
        <span
          className={`whitespace-nowrap text-[12px] ${
            senalTono === 'neg' ? 'text-neg' : senalTono === 'warn' ? 'text-warn' : 'text-faint'
          }`}
        >
          {senal}
        </span>
      )}
      {accion}
      {href && <span aria-hidden className="pl-1 text-[15px] text-line-strong">›</span>}
    </>
  )
  const clases = 'flex min-h-[60px] items-center gap-3 border-b border-[#EFEEEA] py-2.5'
  return href ? (
    <Link href={href} data-testid={testid} className={`${clases} active:bg-surface-quiet`}>
      {cuerpo}
    </Link>
  ) : (
    <div data-testid={testid} className={clases}>{cuerpo}</div>
  )
}

/** El renglón `rótulo · valor` de las fichas de sólo lectura. La ausencia se escribe con su nombre:
 *  «sin cargar» y no un guión, porque un guión no distingue «no tiene» de «nadie lo cargó». */
export function Dato({ rotulo, valor, falta = 'sin cargar' }: { rotulo: string; valor: ReactNode; falta?: string }) {
  const vacio = valor == null || valor === ''
  return (
    <div className="flex items-baseline gap-4 border-b border-[#EFEEEA] py-2.5">
      <span className="w-[150px] shrink-0 text-[12.5px] text-muted">{rotulo}</span>
      <span className={`min-w-0 flex-1 text-[13.5px] ${vacio ? 'text-faint' : 'text-ink'}`}>
        {vacio ? falta : valor}
      </span>
    </div>
  )
}

/** El vacío que EXPLICA. Nunca «no hay datos»: qué falta, y quién lo carga. */
export function Nada({ children, testid }: { children: ReactNode; testid?: string }) {
  return (
    <p data-testid={testid ?? 'nada'} className="py-3 text-[12.5px] leading-relaxed text-faint">
      {children}
    </p>
  )
}
