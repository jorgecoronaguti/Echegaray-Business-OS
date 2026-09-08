'use client'

// LA TABLA ANCHA SCROLLEA ADENTRO SUYO, NUNCA LA PÁGINA — 08/09/2026.
//
// ═══ EL DEFECTO QUE ATRAPA ═══
//
// Medido en producción en `/administracion/compras` a 390px: `document.body.scrollWidth` = 1046
// contra 390 de pantalla. La fila de la lista declara nueve columnas inelásticas (914px de tracks +
// 112 de `gap` = 1026) y esos 1026 empujaban la PÁGINA: al deslizar para ver el importe se iban de
// pantalla el header, la navegación y los chips, y no había forma de volver sin scrollear de vuelta.
//
// La regla es de la shell y ya tenía test propio (`tests/shell-dos-areas.spec.ts`: «en el teléfono
// el shell no empuja la página de costado»): la página NO se desplaza de costado; el contenido ancho
// se desplaza DENTRO de su contenedor.
//
// ═══ POR QUÉ ES UN COMPONENTE CLIENTE Y LA TABLA NO ═══
//
// La sombra del borde sólo significa algo si aparece cuando queda contenido y se apaga al llegar al
// final, y eso hay que MEDIRLO en el navegador. Envolver la tabla entera en un componente cliente
// para eso mandaría cada fila al bundle; acá el que necesita estado es el contenedor, y las filas
// entran como `children` ya renderizadas en el servidor.
//
// Es el mismo patrón que `GrillaAsistenciaObra` estrenó hoy en Asistencia, extraído acá para que no
// haya dos versiones de la misma cinta.

import { useCallback, useState, type ReactNode } from 'react'

export function CintaHorizontal(
  { children, testid }: { children: ReactNode; testid?: string },
) {
  const [quedaALaDerecha, setQuedaALaDerecha] = useState(false)
  const medir = useCallback((el: HTMLDivElement | null) => {
    if (!el) return
    // Un píxel de tolerancia: con zoom o pantallas fraccionarias `scrollLeft` es decimal y la
    // igualdad exacta dejaría la sombra encendida para siempre en el final del recorrido.
    setQuedaALaDerecha(el.scrollLeft + el.clientWidth < el.scrollWidth - 1)
  }, [])
  // El `ref` mide al MONTAR: un estado que arranca en `false` y sólo se actualiza al scrollear nunca
  // le mostraría la sombra a quien todavía no scrolleó, que es justo a quien hay que avisarle.
  const montar = useCallback((el: HTMLDivElement | null) => { medir(el) }, [medir])

  return (
    <div style={{ position: 'relative' }}>
      <div
        ref={montar}
        onScroll={(e) => medir(e.currentTarget)}
        style={{ overflowX: 'auto' }}
        data-testid={testid}
      >
        {children}
      </div>
      {/* FUERA DEL ELEMENTO QUE SCROLLEA: adentro se arrastraría con el contenido y la sombra
          terminaría en el medio de la tabla. `pointer-events-none` para que no coma clics.
          `from-line-strong` Y NO `from-ink/15`: en este Tailwind los colores del tema son
          `rgb(var(--os-…) / <alpha-value>)` y el gradiente con modificador de opacidad no genera
          regla — la sombra no existiría. */}
      {quedaALaDerecha && (
        <div
          aria-hidden
          data-testid={testid ? `${testid}-hay-mas` : undefined}
          className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-line-strong to-transparent"
        />
      )}
    </div>
  )
}
