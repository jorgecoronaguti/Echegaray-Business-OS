// EL REPARTO DE UNA CARGA MASIVA DE HORAS — aritmética pura, fuera de la acción.
//
// Vive acá por una razón mecánica: un archivo `'use server'` sólo puede exportar funciones async, y
// exportar una función pura desde ahí rompe el build. Y por una mejor: se prueba sola, sin base y
// sin sesión, que es lo que hace que el defecto que atrapa quede atrapado para siempre.
//
// LA SEMANA YA NO SE CALCULA ACÁ. `registros_hh.fecha_inicio_semana` la deriva el trigger
// `registros_hh_normalizar` desde `fecha`. Tenerla en dos lugares —Postgres y TypeScript— era
// garantizar que algún día dijeran lunes distintos.

/** Lo que una persona trabajó ese día, tal como salió del formulario. */
export interface RepartoPersona {
  persona_id: string
  horas: number
  /** La clase de hora de ESA persona. El dueño pidió poder cambiarla de a uno: en una cuadrilla que
   *  se quedó hasta tarde, dos hicieron extras y el resto no. Sin tipo propio habría que cargar la
   *  cuadrilla dos veces. Vacío = el tipo general del formulario. */
  tipo_hora?: string
}

const CLAVE = /^horas_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i
const CLAVE_TIPO = /^tipo_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i

/**
 * Las horas de cada persona en una carga masiva, leídas del formulario.
 *
 * Cada integrante viaja como `horas_<uuid>`. En blanco, en cero o con un valor que no es un número
 * NO se imputa: ése es el mecanismo de excepción que pidió el dueño —*"permitiendo corregir
 * excepciones antes de guardar"*—. El que faltó se deja vacío y el que hizo media jornada se corrige
 * en su casillero, sin sacar a nadie de la lista ni cargar quince filas iguales para borrar tres.
 *
 * La coma se acepta como separador decimal: en un teclado en español es lo que sale.
 */
export function leerReparto(entradas: Iterable<[string, FormDataEntryValue]>): RepartoPersona[] {
  const filas: RepartoPersona[] = []
  const tipos = new Map<string, string>()
  // DOS PASADAS SOBRE UNA SOLA LECTURA: `FormData` no garantiza que el tipo venga antes que las
  // horas de la misma persona, y recorrer dos veces un iterable ya consumido devuelve vacío.
  const todas = [...entradas]
  for (const [clave, valor] of todas) {
    const t = CLAVE_TIPO.exec(clave)
    if (t && typeof valor === 'string' && valor.trim()) tipos.set(t[1].toLowerCase(), valor.trim())
  }
  for (const [clave, valor] of todas) {
    const m = CLAVE.exec(clave)
    if (!m || typeof valor !== 'string') continue
    const horas = Number(valor.trim().replace(',', '.'))
    // Un negativo o un texto NO se convierten en 0 ni se imputan: se ignoran, igual que el blanco.
    if (!Number.isFinite(horas) || horas <= 0) continue
    filas.push({ persona_id: m[1], horas, tipo_hora: tipos.get(m[1].toLowerCase()) })
  }
  return filas
}

/** El total de una carga masiva, para poder decir cuánto se imputó sin volver a preguntarle a la base. */
export const totalDelReparto = (filas: RepartoPersona[]): number =>
  filas.reduce((s, f) => s + f.horas, 0)
