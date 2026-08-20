# Color

Los dos colores de marca salen de contar píxeles del logo oficial: grafito `#30302F` (37,4%) y amarillo `#FDC900` (37,2%). No hay un tercero.

## Tokens (canónicos en `echegaray-os/src/app/globals.css`)
| Token | Hex | Uso |
| --- | --- | --- |
| `--os-marca` | #FDC900 | Identidad: navegación activa (regla de 2px), selección, acción primaria, línea de HOY. Nunca estado. |
| `--os-marca-soft` | #FEF4CF | Realce de fondo muy puntual. |
| `--os-accent` | #30302F | Grafito: estructura, barras de avance, superficie oscura, acción alternativa. |
| `--os-accent-hover` | #454543 | Hover del grafito. |
| `--os-canvas` | #F7F7F5 | Fondo de la aplicación. |
| `--os-surface` | #FFFFFF | Superficie de contenido. |
| `--os-surface-quiet` | #FAFAF8 | Hover de fila y fila seleccionada. |
| `--os-surface-sunken` | #EFEEEA | Pista/hover apagado; se usa como divisor interno de lista (más liviano que `line`). |
| `--os-line` | #E7E6E2 | Borde y divisor de bloque. |
| `--os-line-strong` | #D7D5CF | Campo editable, fila de total. |
| `--os-ink` | #1F1F1E | Títulos y valores. |
| `--os-ink-soft` | #3A3A38 | Etiquetas fuertes. |
| `--os-muted` | #6B6B67 | Texto secundario. |
| `--os-faint` | #91918B | Metadatos, eyebrows, texto de NULL. |
| `--os-pos` / `-soft` | #067647 / #E7F6EE | Completado, dentro de objetivo real. |
| `--os-neg` / `-soft` | #B42318 / #FBEAE8 | Impedimento, vencido, atraso crítico. |
| `--os-warn` / `-soft` | #B54708 / #FDF0E4 | Dato faltante que bloquea (sin CUIT, sin imputar). |
| `--os-info` / `-soft` | #175CD3 / #E9F0FD | Informativo, excepcional. |
| `--os-focus` | #2F6DF6 | Anillo de foco de teclado. Único azul del sistema. |

## Reglas
1. Predominan blanco y neutros cálidos; el color aparece por significado, nunca por decoración.
2. **Amarillo con texto grafito `#1F1F1E` siempre** (1,6:1 sobre blanco: no admite texto claro). Si la primaria cae sobre superficie amarilla, degrada a grafito sólido con texto blanco.
3. Rojo sólo problema real. Verde sólo estado positivo real. Estar por debajo del plan **no** es verde.
4. Sin gradientes, sin grandes superficies coloreadas, sin pastillas de color para estados (punto + palabra).
5. Un color que aparece en una pantalla y no está en esta tabla es un error.
