import type { CSSProperties, ReactNode } from 'react'
import { anchoMinimoDeGrilla } from './ancho-minimo'

// LO QUE HACE QUE UNA TABLA DEL CANON SE PUEDA USAR EN UN TELÉFONO.
//
// Lo usan las DOS cajas del canon —`TarjetaTabla` (Tabla.tsx) y `ListaCanon`— y por eso vive en su
// propio archivo: que una importara de la otra sólo para esto ataría dos portes literales que no
// tienen nada más en común.
//
// El defecto que arregla está medido a 390×844 el 25/08/2026 y descrito entero en `ancho-minimo.ts`:
// las columnas en px no ceden, las `minmax(0, N fr)` caen a cero, y `body { overflow-x: clip }` hace
// que lo que sobra no se corra sino que se CORTE — «PRESUPUESTOCLIENTE» en el encabezado, «B» donde
// dice «Messina». Acá la caja se vuelve su propio contenedor de scroll.

/**
 * Las dos capas que hacen scrollear la tabla por dentro.
 *
 * Van con `role="presentation"` para que el árbol de accesibilidad las ignore y las filas sigan
 * colgando directo del `role="table"` de la caja: una tabla cuyas filas cuelgan de un `div` genérico
 * deja de ser una tabla para el lector de pantalla.
 *
 * Y el ancho viaja como VARIABLE CSS, no como `min-width` inline: un estilo inline le gana a
 * cualquier media query, y el escritorio de 1280/1440 —donde el porte literal manda— dejaría de
 * medir lo que mide el `.dc.html`. La regla que consume la variable está en `globals.css`, bajo
 * `@media (max-width: 1023px)`. `data-ancho-canonico` deja el número leíble desde el navegador para
 * quien vaya a verificar esto con un viewport real.
 */
export function EnvoltorioAncho({ cols, children }: { cols: string; children: ReactNode }) {
  const ancho = anchoMinimoDeGrilla(cols)
  // Sin columnas medibles no hay ancho que reservar, y una capa de scroll de más sería una capa que
  // recorta un menú abierto sin que nadie sepa por qué.
  if (ancho === 0) return <>{children}</>
  return (
    <div role="presentation" className="canon-scroll-x">
      <div
        role="presentation"
        className="canon-ancho-canonico"
        data-ancho-canonico={ancho}
        style={{ '--canon-ancho': `${ancho}px` } as CSSProperties}
      >
        {children}
      </div>
    </div>
  )
}
