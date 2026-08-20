import type { ReactNode } from 'react'

// LA TIPOGRAFÍA DEL SISTEMA, COMO COMPONENTES — `design/system/TYPOGRAPHY.md`.
//
// La escala tiene NUEVE entradas y ni una más. Escribirlas como clases sueltas en cada pantalla
// («text-[13px]» acá, «text-[13.5px]» allá) es exactamente cómo una escala de nueve tamaños se
// convierte en una de veinte sin que nadie lo decida. Acá viven una vez.

/** 22/600/-0.01em — título de pantalla. Uno por pantalla. */
export function TituloPantalla({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <h1 className={`text-[22px] font-semibold leading-tight tracking-[-0.01em] text-ink ${className}`}>{children}</h1>
}

/** 16/600 — título de panel, de ficha o de bloque. */
export function TituloPanel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <h2 className={`text-[16px] font-semibold leading-tight text-ink ${className}`}>{children}</h2>
}

/** 11/500/0.04em faint — el rótulo de una sección. No es un título: es su etiqueta. */
export function Eyebrow({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`text-[11px] font-medium tracking-[0.04em] text-faint ${className}`}>{children}</div>
  )
}

/** mono 12,5 tabular — TODO lo que se compara con la vista: fechas, HH, importes, %, CUIT. */
export function Num({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`font-mono text-[12.5px] tabular-nums ${className}`}>{children}</span>
}

// ═══ LA AUSENCIA SE ESCRIBE ═══
//
// Regla 8 de `UX_PRINCIPLES.md`: NULL nunca se inventa como 0. «$ 0» es una afirmación —dice que
// alguien contrató por cero— y «sin cargar» es la verdad: nadie lo cargó todavía. La diferencia
// no es de estilo: un desvío calculado contra un cero inventado es un número falso publicado con
// cara de dato.
//
// Se dibuja en `faint` y SIN punto de estado, para que se lea como lo que es: un hueco, no un
// estado del trabajo.
export function Nulo({ children = 'sin cargar', className = '' }: { children?: ReactNode; className?: string }) {
  return <span className={`text-[12.5px] text-faint ${className}`} data-nulo="">{children}</span>
}

/**
 * El valor, o su ausencia dicha por su nombre. Es el guarda que evita que un `?? 0` se cuele:
 * `<Valor v={obra.contratado} falta="sin cargar">{(n) => plata(n)}</Valor>`.
 */
export function Valor<T>({
  v,
  falta = 'sin cargar',
  children,
}: {
  v: T | null | undefined
  falta?: string
  children: (v: T) => ReactNode
}) {
  if (v === null || v === undefined || v === '') return <Nulo>{falta}</Nulo>
  return <>{children(v)}</>
}
