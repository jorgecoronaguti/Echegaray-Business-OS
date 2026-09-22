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

export interface Cifra {
  rotulo: string; valor: string | null; falta?: string; tono?: Tono
  /**
   * UNA LÍNEA, NO UNA ORACIÓN. En el diseño la nota es corta («en esos rubros», «48 % consumido»,
   * «alcanza 2,7 meses»): con dos renglones la cifra se corre hacia arriba —la fila alinea por
   * abajo— y las cinco dejan de estar a la misma altura. Lo que no entra va en `detalle`.
   */
  nota?: ReactNode
  /** El porqué largo de la nota, para el `title`. Ahí se busca cuando la línea no alcanza. */
  detalle?: string
}

/**
 * LA CIFRA SE IDENTIFICA POR SU LUGAR, NO POR SU RÓTULO (22/09/2026).
 *
 * Dos cifras de la misma fila pueden llamarse igual —Nómina publica «en negro» dos veces, la plata y
 * su porcentaje— y con `key={c.rotulo}` eso son DOS HERMANAS CON LA MISMA LLAVE. En el servidor no se
 * nota: cada vista se dibuja entera. Se nota al cambiar de solapa sin recargar, que es lo que hacen
 * los `<Link>` de la barra: del lado del cliente las vistas son componentes de servidor ya resueltos
 * —lo que queda es un `div` de cabecera en el mismo lugar del árbol—, así que React RECONCILIA las
 * cifras viejas contra las nuevas por su llave en vez de rehacerlas. Con una llave repetida el mapeo
 * se rompe y un nodo sobrante queda pegado: de Nómina a Caja, la cabecera de Caja amanecía con «en
 * negro · $ 80,69 M · lo que el recibo no paga» al lado de SALDO AL CIERRE (dueño, 22/09/2026:
 * *«quitar ese valor de "en negro" … no tiene nada que ver con lo que debe mostrar ahí»*).
 *
 * El índice es la llave correcta acá: la fila es una lista fija que se dibuja en orden y nunca se
 * reordena ni se filtra, y así dos cifras homónimas no pueden volver a pisarse. Se arregla en la
 * pieza y no en la vista: cualquier cabecera futura con dos rótulos iguales tendría el mismo defecto.
 */
/** Una fila de cifras suelta (fuera de la cabecera): mismo dibujo, para una sección que tiene sus propios números. */
export function FilaDeCifras({ cifras }: { cifras: Cifra[] }) {
  return <div className="grid grid-cols-2 items-end gap-x-6 gap-y-5 lg:flex lg:flex-nowrap lg:gap-x-10 xl:gap-x-14">{cifras.map((c, i) => <UnaCifra key={i} c={c} />)}</div>
}

export function UnaCifra({ c }: { c: Cifra }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="text-[11px] text-faint">{c.rotulo}</div>
      <div className={`text-[22px] font-semibold leading-[1.05] tracking-[-0.02em] tabular-nums lg:text-[28px] ${c.valor == null ? 'text-faint' : c.tono ? TONO_TEXTO[c.tono] : 'text-ink'}`}>
        {c.valor ?? c.falta ?? 'sin registrar'}
      </div>
      {c.nota ? <div className="text-[11.5px] text-muted" title={c.detalle}>{c.nota}</div> : null}
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
      {/* ═══ LAS CIFRAS SE APOYAN ABAJO, NO ARRIBA ═══
          Medido en el diseño renderizado (marco D02, 21/09/2026): «presupuestado» —la única sin
          nota— tiene su rótulo en y=244 y las otras tres en y=228. Esos 16 px son exactamente lo
          que produce `align-items: end`: el bloque sin nota baja hasta apoyar en la misma línea que
          los que la tienen. Alinearlas arriba las deja a todas en la misma y, que se ve más
          prolijo y NO es el diseño: la referencia visual de la fila es el borde de abajo.

          CINCO COLUMNAS SIEMPRE, TENGA TRES CIFRAS O CINCO (`gCifras: repeat(5,minmax(0,1fr))`).
          Quedaba un caso especial para cuatro que las repartía en cuatro columnas: en Obras el
          «presupuestado» caía en la misma x que en Resumen pero los otros tres no, así que al
          cambiar de solapa los números se movían. Con cinco columnas fijas, la quinta queda vacía y
          las cuatro cifras aterrizan donde el diseño las pone. */}
      <div className="grid grid-cols-2 items-end gap-x-6 gap-y-5 lg:grid-cols-5 lg:gap-6">
        {/* LA LLAVE ES EL LUGAR, NO EL RÓTULO: ver `FilaDeCifras`. Dos cifras homónimas con la misma
            llave dejaban una tarjeta de Nómina pegada en la cabecera de Caja al cambiar de solapa. */}
        {cifras.map((c, i) => <UnaCifra key={i} c={c} />)}
      </div>
      {derecha ? <div className="min-w-0 lg:justify-self-end">{derecha}</div> : null}
    </div>
  )
}

/** Una sección: el título (y su leyenda) en la columna izquierda, el gráfico o la lista a la derecha. */
export function Seccion({ titulo, aclaracion, detalle, leyenda, children, arriba = 'pt-7', filo = false }: {
  titulo: string
  /**
   * Una línea en tenue bajo el título: qué muestra el gráfico, cuando el título no alcanza. UNA, no
   * un párrafo: la columna mide 180 px y tres renglones empujan todo el bloque hacia abajo. El v9
   * deja varias en blanco a propósito. Lo que no entra va en `detalle`.
   */
  aclaracion?: ReactNode
  /** El porqué largo, para el `title` del encabezado. Ahí se busca cuando la línea no alcanza. */
  detalle?: string
  leyenda?: { color: string; rotulo: string }[]
  children: ReactNode
  arriba?: string
  /** `true` = filo arriba de la sección (entre gráfico y lista). */
  filo?: boolean
}) {
  return (
    <section className={`grid gap-4 lg:grid-cols-[180px_minmax(0,1fr)] lg:gap-6 ${filo ? 'mt-8 border-t border-line pt-6' : arriba}`}>
      <div className="flex flex-col gap-3 pt-0.5">
        <h2 className="text-[13px] font-semibold text-ink" title={detalle}>{titulo}</h2>
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
