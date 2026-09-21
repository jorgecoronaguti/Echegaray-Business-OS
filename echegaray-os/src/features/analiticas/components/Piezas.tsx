// LAS PIEZAS QUE TODAS LAS VISTAS COMPARTEN, con las medidas del diseño aprobado (Analíticas v6).
//
// El dueño rechazó la primera versión (17/09/2026: «respetá el diseño»). Por eso las medidas NO son
// las de la escala de la app sino las del archivo aprobado: título 22 px, cifra 28 px, rótulo 11 px,
// una columna de 180 px a la izquierda con el título de cada sección y el contenido a la derecha.
// Los colores sí son tokens: todos los del diseño existen en `globals.css` con el mismo valor.
//
// Sin cards y sin sombras: una cifra es un rótulo chico arriba y un número tabular abajo; las
// secciones se separan con aire y un filo.
import type { ReactNode } from 'react'

/** Ancho de una barra: `x` sobre la escala, recortado a 0–100 %. Una escala nula dibuja nada. */
export const ancho = (x: number | null | undefined, escala: number | null | undefined): string =>
  `${Math.min(Math.max(((x ?? 0) / (escala || 1)) * 100, 0), 100).toFixed(2)}%`

export const ENCABEZADO = 'font-mono text-[10.5px] uppercase tracking-[.06em] text-faint'

/** Una ausencia: su palabra, en tenue. Nunca `$ 0`. */
export function Ausente({ children }: { children: ReactNode }) {
  return <span className="font-normal text-faint">{children}</span>
}

/** El valor o la palabra que dice por qué no hay. */
export function Valor({ v, falta }: { v: string | null; falta: string }) {
  return v == null ? <Ausente>{falta}</Ausente> : <>{v}</>
}

export type Tono = 'neg' | 'warn' | 'pos' | 'muted' | 'faint'
export const TONO_TEXTO: Record<Tono, string> = { neg: 'text-neg', warn: 'text-warn', pos: 'text-pos', muted: 'text-muted', faint: 'text-faint' }

export interface Cifra { rotulo: string; valor: string | null; falta?: string; tono?: Tono; nota?: ReactNode }

/** Una fila de cifras suelta (fuera de la cabecera): mismo dibujo, para una sección que tiene sus propios números. */
export function FilaDeCifras({ cifras }: { cifras: Cifra[] }) {
  return <div className="grid grid-cols-2 items-end gap-x-6 gap-y-5 lg:flex lg:flex-nowrap lg:gap-x-10 xl:gap-x-14">{cifras.map((c) => <UnaCifra key={c.rotulo} c={c} />)}</div>
}

export function UnaCifra({ c }: { c: Cifra }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="text-[11px] text-faint">{c.rotulo}</div>
      <div className={`text-[22px] font-semibold leading-[1.05] tracking-[-0.02em] tabular-nums lg:text-[28px] ${c.valor == null ? 'text-faint' : c.tono ? TONO_TEXTO[c.tono] : 'text-ink'}`}>
        {c.valor ?? c.falta ?? 'sin registrar'}
      </div>
      {c.nota ? <div className="text-[11.5px] text-muted">{c.nota}</div> : null}
    </div>
  )
}

/**
 * LA CABECERA DE UNA VISTA: título y línea de datos en la columna de 180 px, las cifras a la derecha
 * y, si hay, una acción o un control al final. En el teléfono: título arriba, cifras a dos columnas.
 */
export function Cabecera({ titulo, detalle, cifras, repartidas = false, derecha }: {
  titulo: string
  detalle: ReactNode
  cifras: Cifra[]
  /**
   * DEPRECADO Y SIN EFECTO (diseño v9, 21/09/2026). Las cinco vistas comparten la MISMA retícula de
   * cifras —`repeat(5,minmax(0,1fr))`—, tengan tres, cuatro o cinco: por eso en el diseño las cifras
   * de Resumen, Obras, Nómina y Cobranza caen en las mismas x. Con la rama `flex`, Obras, Nómina y
   * Cobranza las apretaban a la izquierda y los números se movían al cambiar de solapa. Se conserva
   * la prop para no tocar las cinco llamadas; ya no decide nada.
   */
  repartidas?: boolean
  derecha?: ReactNode
}) {
  return (
    <div className={`mt-6 grid grid-cols-[minmax(0,1fr)] gap-5 border-b border-line-strong pb-6 lg:mt-9 lg:items-end lg:gap-6 ${derecha ? 'lg:grid-cols-[180px_minmax(0,1fr)_auto]' : 'lg:grid-cols-[180px_minmax(0,1fr)]'} ${repartidas ? 'lg:pb-7' : ''}`}>
      <div className="flex flex-col gap-1.5">
        <h1 className="text-[22px] font-semibold leading-[1.1] tracking-[-0.02em] text-ink">{titulo}</h1>
        <p className="text-xs leading-[1.45] text-muted tabular-nums">{detalle}</p>
      </div>
      <div className={`grid grid-cols-2 items-end gap-x-6 gap-y-5 lg:gap-6 ${cifras.length === 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-5'}`}>
        {cifras.map((c) => <UnaCifra key={c.rotulo} c={c} />)}
      </div>
      {derecha ? <div className="min-w-0 lg:justify-self-end">{derecha}</div> : null}
    </div>
  )
}

/** Una sección: el título (y su leyenda) en la columna izquierda, el gráfico o la lista a la derecha. */
export function Seccion({ titulo, aclaracion, leyenda, children, arriba = 'pt-7', filo = false }: {
  titulo: string
  /** Una línea en tenue bajo el título: qué muestra el gráfico, cuando el título no alcanza. */
  aclaracion?: ReactNode
  leyenda?: { color: string; rotulo: string }[]
  children: ReactNode
  arriba?: string
  /** `true` = filo arriba de la sección (entre gráfico y lista). */
  filo?: boolean
}) {
  return (
    <section className={`grid gap-4 lg:grid-cols-[180px_minmax(0,1fr)] lg:gap-6 ${filo ? 'mt-8 border-t border-line pt-6' : arriba}`}>
      <div className="flex flex-col gap-3 pt-0.5">
        <h2 className="text-[13px] font-semibold text-ink">{titulo}</h2>
        {aclaracion ? <p className="text-[11.5px] leading-normal text-muted">{aclaracion}</p> : null}
        {leyenda ? (
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-muted lg:flex-col">
            {leyenda.map((l) => (
              <div key={l.rotulo} className="flex items-center gap-2"><span className={`size-2.5 rounded-[2px] ${l.color}`} />{l.rotulo}</div>
            ))}
          </div>
        ) : null}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  )
}

export const LEYENDA_GASTO = [
  { color: 'bg-accent', rotulo: 'mano de obra' },
  { color: 'bg-muted', rotulo: 'subcontratos' },
  { color: 'bg-dato-materiales', rotulo: 'materiales' },
]

/** Sin datos legibles: la base no contestó para este rol, o la lectura falló. Se dice, no se dibuja en cero. */
export function SinLectura({ que }: { que: string }) {
  return <p className="mt-9 border-y border-line py-6 text-sm text-muted">No se pudo leer {que}.</p>
}

/** Los meses como en el diseño: `mar`, `abr`. Con el año cuando la serie cruza de año. */
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
export const rotuloMes = (m: string, conAnio = false): string =>
  `${MESES[Number(m.slice(5, 7)) - 1] ?? m}${conAnio ? ` ${m.slice(2, 4)}` : ''}`
