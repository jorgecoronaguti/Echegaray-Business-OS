// LOS VALORES MEDIDOS EN LOS MOCKUPS DEL TELÉFONO — no una reinterpretación del Design System.
//
// ═══ POR QUÉ ESTE ARCHIVO EXISTE Y NO SE USA `globals.css` ═══
//
// El dueño rechazó cuatro entregas del rediseño con la misma frase: «estructura parecida, aspecto
// distinto». La causa fue siempre la misma: las pantallas se dibujaban con los tokens del sistema
// de ESCRITORIO (`--os-*`, `ds/*`) y los mockups del teléfono usan otra escala de grises, otros
// radios y otros fondos de estado. Dos ejemplos medidos:
//
//   · la pista de una barra de avance es `#EAE7E6` en los quince `.dc.html`; `--os-surface-sunken`
//     es otro gris, y la diferencia se ve al lado del azul `#175CD3` del relleno.
//   · el fondo del estado «parado» es `#FEF6F5` con borde `#F3DDDA`; `--os-neg-soft` es más saturado
//     y en 390px la tarjeta entera se lee como una alarma.
//
// Cada constante de acá salió de leer un `style="…"` de `/home/jorge/echegaray-design/*.dc.html`.
// Si mañana cambia el mockup, cambia esto y no doce pantallas.
//
// NO SE TOCA `globals.css`: el escritorio sigue con sus tokens. Estas quince pantallas son el
// producto que se abre parado en el frente, y su contrato visual es el `.dc.html`, no el ERP.

/** La paleta literal de los mockups J01–J06 y M01–M09. */
export const C = {
  /** Fondo de la pantalla del teléfono. `background:#F7F7F5` en el marco de todos los mockups. */
  canvas: '#F7F7F5',
  /** La tarjeta y las barras fija de arriba y de abajo. */
  surface: '#FFFFFF',
  /** El pie de tabla y la fila marcada como hecha (J06 «Pasos»). */
  quiet: '#FAFAF8',
  /** Hairline de tarjeta y de las dos barras del marco. */
  linea: '#E7E6E2',
  /** Hairline fuerte: el borde del teléfono, el input sin foco, el check apagado. */
  lineaFuerte: '#D7D5CF',
  /** El divisor ENTRE filas de una misma tarjeta. Más claro que el borde de la tarjeta. */
  divisor: '#F5F4F0',
  /** El divisor interno de una tarjeta que se parte en dos (J04 pasos, M03 aviso). */
  divisorSuave: '#F1F0EC',

  ink: '#1F1F1E',
  inkSuave: '#3A3A38',
  muted: '#6B6B67',
  faint: '#91918B',
  /** El gris del chevron de fila y del icono «por empezar». */
  tenue: '#C9C4C2',

  /** Amarillo de marca: selección y acción primaria. Texto grafito encima, nunca blanco. */
  marca: '#FDC900',
  /** El amarillo al presionar (`style-hover` de M04). */
  marcaOscura: '#EEBE00',
  /** El fondo de la pestaña activa de la barra y de la fila seleccionada. */
  marcaSuave: '#FEF9E6',
  /** Aún más rebajado: la fila de un documento nuevo en M08. */
  marcaTenue: '#FEFCF2',

  /** Grafito: la pastilla de filtro ELEGIDA y el paso elegido de J04. */
  grafito: '#30302F',
  /** El contador dentro de una pastilla grafito. */
  grafitoTenue: '#B9B7B1',

  pos: '#067647',
  posFondo: '#F1F9F4',
  posBorde: '#D6EBDF',

  neg: '#B42318',
  negFondo: '#FEF6F5',
  negBorde: '#F3DDDA',
  /** El divisor entre filas del panel «Resolver ahora» de J01. */
  negDivisor: '#F7E4E1',

  warn: '#B54708',
  warnFondo: '#FDF6EE',
  warnBorde: '#F0E1CD',

  info: '#175CD3',
  infoFondo: '#EFF5FF',
  infoBorde: '#D6E4FB',

  /** La pista de toda barra de avance. */
  pista: '#EAE7E6',
  /** El fondo del objetivo circular al pasar el dedo (`style-hover`). */
  hover: '#F2F1ED',
  /** El botón apagado: fondo inerte con texto `faint`. Nunca gris del sistema. */
  inerte: '#EFEEEA',
} as const

/** Los radios del teléfono. Tarjeta 14, control 10–12, pastilla 16. */
export const R = {
  tarjeta: 14,
  tarjetaGrande: 16,
  control: 12,
  controlChico: 10,
  pastilla: 16,
} as const

/**
 * El alto de la barra inferior de contextos, con su `padding` incluido.
 *
 * Medido en J01/M02/M09: `padding:6px 4px 10px` sobre celdas de `minHeight:48px` = 64px. El
 * contenido de la pantalla le deja exactamente este hueco; sin él la última fila queda tapada y
 * nadie la puede tocar — la misma trampa que ya pagó el perfil empleado.
 */
export const ALTO_BARRA = 64

/** El alto del topbar de las pantallas de detalle: `padding:10px 12px` sobre un objetivo de 44. */
export const ALTO_TOPBAR = 64

/** `null` nunca es cero: el mockup escribe «—» y la explicación baja al renglón de abajo. */
export const SIN_DATO = '—'

/** `47.5` → `47 %`. El mockup escribe el porcentaje con espacio duro antes del signo. */
export function pct(v: number | null | undefined): string {
  if (v == null) return SIN_DATO
  return `${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 }).format(v)}%`
}

/** El ancho de una barra de avance. `null` → `0%`, y quien la dibuja decide si la pinta. */
export function ancho(v: number | null | undefined): string {
  return `${Math.max(0, Math.min(100, v ?? 0))}%`
}

/** `2026-08-23` → `23/08`. En el teléfono el año sobra. */
export function diaMes(iso: string | null | undefined): string {
  if (!iso || iso.length < 10) return SIN_DATO
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// EL HOVER, QUE NO PUEDE SER UN ESTILO EN LÍNEA
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// El mockup escribe `style-hover="background:#F2F1ED"`. Un pseudo-estado no existe como propiedad
// de `style={{…}}`, así que va por clase de Tailwind con valor arbitrario — y Tailwind sólo genera
// las clases que puede LEER en el fuente, o sea que el valor tiene que estar escrito, no
// interpolado. Se escribe UNA vez, acá, al lado de la constante que lo declara: si mañana el tono
// cambia, cambia en un lugar y no en los seis archivos que lo usan.

/** El fondo del objetivo circular del topbar al pasar el dedo (`C.hover`). */
export const HOVER_SUAVE = 'hover:bg-[#F2F1ED]'

/** El amarillo al presionar la primaria circular de M04 (`C.marcaOscura`). */
export const HOVER_MARCA = 'hover:bg-[#EEBE00]'

/** El canvas al presionar un control de contorno (`C.canvas`). */
export const HOVER_CANVAS = 'hover:bg-[#F7F7F5]'
