# Interacción y estados

| Estado | Tratamiento |
| --- | --- |
| Hover de fila | fondo `#FAFAF8`, sin borde ni sombra |
| Fila seleccionada | fondo `#FAFAF8` + regla `#FDC900` de 2px a la izquierda (`inset 2px 0 0`) |
| Nav activa | regla inferior `#FDC900` de 2px + weight 500/600 |
| Filtro/vista activa | subrayado `#1F1F1E` de 1,5px (nivel 3, nunca otra barra) |
| Foco de teclado | `:focus-visible` → `box-shadow: 0 0 0 2px var(--os-surface), 0 0 0 4px color-mix(in srgb, var(--os-focus) 55%, transparent)`, radio 6px. Ya declarado en globals.css: no reimplementar por componente ni anular con `outline:none`. |
| Disabled | fondo `#EFEEEA`, texto `#91918B`, sin cursor de acción |
| Loading | barra indeterminada `animate-barra-carga` (única animación del sistema, bajo `motion-safe`) + esqueleto de header/tabla. Nunca un porcentaje inventado. |
| Error | texto `neg` con el mensaje real de la fuente. Una lista vacía por error NO se dibuja como "no hay datos". |
| Éxito | confirmación breve junto a la acción; sin toasts decorativos. |
| Acciones de fila | sólo en hover o menú contextual (···). Nunca una fila llena de botones. |

## Acciones
Una primaria por contexto (amarillo + texto grafito). Secundaria con borde `#E7E6E2` o texto `muted`. Destructiva en texto `neg`. Las acciones viven cerca del objeto sobre el que actúan.
