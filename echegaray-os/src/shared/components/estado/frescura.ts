// LA HORA DEL ÚLTIMO DATO BUENO — `design/screens/gestion-obras-v5.md` §13.
//
// El contrato pide que el error diga «la hora del último dato bueno», y la razón es operativa: no
// es lo mismo una pantalla que se cayó recién —los números que quedaron en la cabeza siguen
// sirviendo— que una que no trae dato desde ayer a la mañana. Sin esa hora, quien mira no sabe si
// puede seguir trabajando con lo que ya vio.
//
// EL SELLO LO PONE LA PANTALLA QUE SÍ SE DIBUJÓ, y por eso vive en `PageShell`: si la página lanza,
// `PageShell` nunca se renderiza y el sello queda con la hora de la última vez que hubo datos de
// verdad. Un sello puesto por el propio error diría siempre «ahora» y sería una mentira prolija.
//
// Y CUANDO NO HAY SELLO NO SE INVENTA UNO. Es el `NULL nunca es cero` del sistema: «sin lectura
// previa en esta sesión» dice exactamente lo que pasa —se entró directo a una pantalla rota— y no
// se parece a «hace un rato».
//
// `sessionStorage` y no `localStorage`: el dato vale para la sesión que está pasando. Una hora de
// la semana pasada no sirve para decidir nada y sí para confundir.

const PREFIJO = 'os:dato-bueno:'

const dosDigitos = (n: number) => String(n).padStart(2, '0')
const hhmm = (d: Date) => `${dosDigitos(d.getHours())}:${dosDigitos(d.getMinutes())}`
const mismoDia = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

export type Frescura = { texto: string; hubo: boolean }

/**
 * Texto del último dato bueno. Función pura: recibe el sello y el ahora, no consulta el reloj ni el
 * navegador — es lo que la deja verificable.
 */
export function textoDatoBueno(sello: string | null | undefined, ahora: Date): Frescura {
  if (!sello) return { texto: 'sin lectura previa en esta sesión', hubo: false }
  const d = new Date(sello)
  if (Number.isNaN(d.getTime())) return { texto: 'sin lectura previa en esta sesión', hubo: false }

  const minutos = Math.floor((ahora.getTime() - d.getTime()) / 60_000)
  // Un sello ADELANTADO no es un dato del futuro: es el reloj de la máquina que se movió. Se muestra
  // la hora sola antes que «hace -3 min», que haría dudar de todo lo demás que dice la pantalla.
  if (minutos < 0) return { texto: hhmm(d), hubo: true }
  if (minutos < 1) return { texto: `${hhmm(d)} · recién`, hubo: true }
  if (minutos < 60) return { texto: `${hhmm(d)} · hace ${minutos} min`, hubo: true }
  if (mismoDia(d, ahora)) return { texto: `hoy ${hhmm(d)}`, hubo: true }

  const ayer = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() - 1)
  if (mismoDia(d, ayer)) return { texto: `ayer ${hhmm(d)}`, hubo: true }
  return { texto: `${dosDigitos(d.getDate())}/${dosDigitos(d.getMonth() + 1)} ${hhmm(d)}`, hubo: true }
}

/** Marca que esta ruta llegó a dibujarse con datos. Silencioso: el sello nunca rompe una pantalla. */
export function sellarDatoBueno(ruta: string, ahora: Date = new Date()): void {
  try {
    sessionStorage.setItem(PREFIJO + ruta, ahora.toISOString())
  } catch {
    // Navegación privada o almacenamiento lleno. Se pierde la hora, no la pantalla.
  }
}

export function leerSelloDatoBueno(ruta: string): string | null {
  try {
    return sessionStorage.getItem(PREFIJO + ruta)
  } catch {
    return null
  }
}
