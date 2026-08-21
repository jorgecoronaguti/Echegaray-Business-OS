// EL ERROR QUE SE PIERDE EN UN `?? []`.
//
// Media docena de pantallas leen así: `const partes = (await getPartes(...)).data ?? []`. Cuando la
// consulta falla, `data` viene `null`, el `?? []` lo convierte en una lista vacía y la pantalla
// dibuja «todavía no se cargó ningún parte». Es LITERALMENTE lo que el contrato de diseño prohíbe
// —*«una lista vacía por error NO se dibuja como no hay datos»*—, y en una obra eso se lee como que
// nadie trabajó, que es la peor conclusión posible sacada del peor dato posible.
//
// El lector conserva la lista vacía —la pantalla tiene que poder dibujarse igual: media ficha rota
// es peor que una ficha con un cartel— pero SE QUEDA CON EL ERROR, para que arriba de todo se diga
// qué no se pudo leer y con el mensaje de la fuente.
//
// Los mensajes repetidos se dicen UNA vez: seis lecturas contra la misma base caída dan seis veces
// «fetch failed», y un cartel que repite seis veces lo mismo se deja de leer.

export type Lectura<T> = { data: T | null; error: string | null }

export function resumenDeFallas(fallas: readonly string[]): string | null {
  const limpias = fallas.map((f) => f.trim()).filter((f) => f.length > 0)
  if (limpias.length === 0) return null
  return [...new Set(limpias)].join(' · ')
}

export type Lector = {
  /** Devuelve el dato o el vacío que se le pase, y se guarda el error si lo hubo. */
  leer<T>(lectura: Lectura<T>, vacio: T): T
  /** El mensaje para el cartel, o `null` si todo se leyó bien. */
  falla(): string | null
}

export function crearLector(): Lector {
  const fallas: string[] = []
  return {
    leer<T>(lectura: Lectura<T>, vacio: T): T {
      if (lectura.error) fallas.push(lectura.error)
      return lectura.data ?? vacio
    },
    falla: () => resumenDeFallas(fallas),
  }
}
