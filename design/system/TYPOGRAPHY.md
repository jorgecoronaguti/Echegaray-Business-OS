# Tipografía

## Familia — DECISIÓN CANÓNICA (cerrada)
**IBM Plex Sans** para todo el texto de interfaz y **IBM Plex Mono** para números, fechas, importes, %, CUIT y códigos. La escala de abajo está calibrada sobre esa familia y es la que Claude Code debe implementar.

Qué implica, explícito para que no se interprete:
1. Cargar las familias por Google Fonts (pesos 400/500/600/700 de Sans, 400/500/600 de Mono) o por `next/font/google`. No se incluyen archivos de fuente en el handoff: la licencia es abierta y se sirve desde el origen.
2. Actualizar `echegaray-os/tailwind.config.ts → theme.extend.fontFamily`:
   `sans: ['IBM Plex Sans', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'Helvetica Neue', 'Arial', 'sans-serif']`
   `mono: ['IBM Plex Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace']`
3. El stack del sistema queda como fallback, no como decisión.
4. Nada más cambia: los tokens de color, espaciado y radios siguen igual.

## Escala (px / weight / tracking)
| Spec | Uso |
| --- | --- |
| 28 / 600 / -0.02em | Título de documento |
| 22 / 600 / -0.01em | Título de pantalla (h1) |
| 16 / 600 | Título de panel o ficha |
| 14 / 500 | Nav nivel 2, subtítulo |
| 13 / 400 | Cuerpo y celda de tabla |
| 12,5 / 400 · muted | Texto secundario |
| 11 / 500 / 0.04em · faint | Eyebrow de sección |
| 10 / 0.06em · uppercase · faint | Encabezado de tabla |
| mono 12,5 · tabular | Fechas, HH, importes, %, CUIT |

Line-height: 1.5 para párrafos, 1.4 para texto de apoyo, 1 para celdas de una línea.
Números que se comparan: `font-variant-numeric: tabular-nums` (clase `.tnum` ya existe).
No agregar tamaños ni pesos nuevos: hay 9 y alcanzan.
