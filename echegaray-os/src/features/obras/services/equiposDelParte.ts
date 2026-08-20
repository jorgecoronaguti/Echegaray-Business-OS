// LOS EQUIPOS DE UN PARTE — leer el formulario. Aritmética pura, fuera de la acción.
//
// Vive acá por la misma razón mecánica que `repartoHH`: un archivo `'use server'` sólo puede exportar
// funciones async. Y por la misma razón buena: se prueba sin base y sin sesión.
//
// PERSONA ≠ EQUIPO. Las horas de una persona van a `registros_hh` —de donde sale la liquidación— y
// las de una máquina a `obra_ejecucion_equipo`. Si compartieran tabla, el costo de mano de obra
// incluiría a la hormigonera.

/** Un equipo que trabajó en la jornada. Las horas son opcionales: «se usó» ya es información. */
export interface EquipoDelParte {
  equipo: string
  horas: number | null
}

const NOMBRE = /^equipo_(\d+)$/
const HORAS = /^equipo_horas_(\d+)$/

/**
 * Los equipos de un parte, leídos del formulario.
 *
 * Cada fila viaja como `equipo_<n>` y `equipo_horas_<n>`. Una fila SIN NOMBRE no existe, aunque
 * traiga horas: son las filas vacías que deja el formulario cuando alguien agregó un renglón de más.
 * Un nombre repetido en dos renglones se une en uno solo sumando las horas — dos renglones
 * «Hormigonera» son un error de carga, no dos máquinas.
 */
export function leerEquipos(entradas: Iterable<[string, FormDataEntryValue]>): EquipoDelParte[] {
  const todas = [...entradas]
  const horas = new Map<string, number>()
  for (const [clave, valor] of todas) {
    const m = HORAS.exec(clave)
    if (!m || typeof valor !== 'string' || !valor.trim()) continue
    const h = Number(valor.trim().replace(',', '.'))
    if (Number.isFinite(h) && h > 0) horas.set(m[1], h)
  }
  const porNombre = new Map<string, EquipoDelParte>()
  for (const [clave, valor] of todas) {
    const m = NOMBRE.exec(clave)
    if (!m || typeof valor !== 'string') continue
    const equipo = valor.trim()
    if (!equipo) continue
    const h = horas.get(m[1]) ?? null
    const previo = porNombre.get(equipo.toLowerCase())
    if (previo) previo.horas = (previo.horas ?? 0) + (h ?? 0) || null
    else porNombre.set(equipo.toLowerCase(), { equipo, horas: h })
  }
  return [...porNombre.values()]
}

/** Cómo se cuenta un equipo en el resumen del parte: «Hormigonera 4 h» o «Hormigonera». */
export const rotuloEquipo = (e: EquipoDelParte): string =>
  e.horas == null ? e.equipo : `${e.equipo} ${e.horas.toLocaleString('es-AR', { maximumFractionDigits: 1 })} h`
