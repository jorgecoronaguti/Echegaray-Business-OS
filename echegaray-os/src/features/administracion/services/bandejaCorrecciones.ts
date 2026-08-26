// 19c v2 · LA ARITMÉTICA DE LA BANDEJA DE CORRECCIONES.
//
// Qué pide cada pedido y CUÁNTAS HORAS mueve. La columna «Diferencia» del mockup es lo que hace que
// la bandeja se pueda priorizar: un pedido que suma media hora y uno que suma seis no se atienden
// igual, y hasta hoy los dos se veían idénticos.
//
// ═══ LA DIFERENCIA SE CALCULA, NO SE GUARDA ═══
//
// `solicitud_correccion_asistencia` guarda la hora propuesta, no el delta. Calcularlo acá —sobre la
// entrada real que ya viaja en la fila— evita una columna que habría que mantener de acuerdo con la
// marca para siempre.
//
// ═══ SIN EL OTRO EXTREMO NO HAY DIFERENCIA ═══
//
// Un pedido de SALIDA sobre un día sin entrada registrada no mueve «0 horas»: no se puede saber
// cuántas mueve. `null`, y la pantalla lo escribe con palabras. Un cero ahí haría que el pedido
// pareciera irrelevante justo cuando es el más raro de los dos.

/** Lo mínimo que hace falta de un pedido para poder medirlo. */
export interface PedidoMedible {
  tipo: 'entrada' | 'salida'
  /** `17:30:00` o `17:30`. Lo que la persona propone. */
  hora_propuesta: string
  /** Marca real de entrada, en ISO. `null` = ese día no tiene entrada registrada. */
  entrada: string | null
  /** Marca real de salida, en ISO. `null` = ese día no cerró. */
  salida: string | null
  fecha: string
}

/** `17:30:00` → minutos desde medianoche. `null` si no se puede leer. */
export function minutosDeHora(t: string | null): number | null {
  if (!t) return null
  const m = /^(\d{1,2}):(\d{2})/.exec(t)
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (!Number.isInteger(h) || !Number.isInteger(min) || h > 23 || min > 59) return null
  return h * 60 + min
}

/** Minutos desde medianoche de una marca ISO, en el huso de quien la escribió. */
function minutosDeMarca(iso: string | null): number | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.getHours() * 60 + d.getMinutes()
}

/**
 * Cuántas HORAS agrega o saca el pedido. `null` cuando falta el otro extremo de la jornada.
 *
 * Un pedido de SALIDA agrega desde la entrada hasta la hora propuesta; uno de ENTRADA corre el
 * arranque, así que la diferencia contra la salida real puede ser negativa —entrar más tarde de lo
 * que se creía RESTA horas— y eso se dice con el signo.
 */
export function diferenciaEnHoras(p: PedidoMedible): number | null {
  const propuesta = minutosDeHora(p.hora_propuesta)
  if (propuesta === null) return null

  if (p.tipo === 'salida') {
    const entrada = minutosDeMarca(p.entrada)
    if (entrada === null) return null
    // Ya HABÍA una salida: lo que mueve el pedido es la diferencia contra esa, no la jornada entera.
    const salida = minutosDeMarca(p.salida)
    const base = salida ?? entrada
    return Math.round(((propuesta - base) / 60) * 100) / 100
  }

  const salida = minutosDeMarca(p.salida)
  if (salida === null) return null
  const entrada = minutosDeMarca(p.entrada)
  const base = entrada ?? salida
  // Correr la ENTRADA hacia adelante saca horas: por eso el signo sale invertido respecto de arriba.
  return Math.round(((base - propuesta) / 60) * 100) / 100
}

/** `1.5` → `+1,5 h`. `null` → «sin medir»: no se sabe cuántas mueve, que no es que no mueva ninguna. */
export function textoDeDiferencia(h: number | null): string {
  if (h === null) return 'sin medir'
  const signo = h > 0 ? '+' : ''
  return `${signo}${h.toLocaleString('es-AR', { maximumFractionDigits: 2 })} h`
}

/** Qué está pidiendo, en una frase. Nunca «corrección»: se dice cuál de las dos marcas se toca. */
export function quePide(p: PedidoMedible): string {
  const hhmm = /^(\d{1,2}:\d{2})/.exec(p.hora_propuesta)?.[1] ?? p.hora_propuesta
  if (p.tipo === 'salida') {
    return p.salida ? `Cambiar la salida a ${hhmm}` : `Cargar la salida a las ${hhmm}`
  }
  return p.entrada ? `Cambiar la entrada a ${hhmm}` : `Cargar la entrada a las ${hhmm}`
}

/** El titular: cuántos pedidos quedan y cuántas horas están en juego. */
export function titularDeLaBandeja(pedidos: PedidoMedible[]): { titular: string; subtitular: string } {
  if (pedidos.length === 0) {
    return {
      titular: 'sin pedidos por resolver',
      subtitular: 'Los pedidos salen de «Mi información · Asistencia» o del parte del jefe de obra.',
    }
  }
  const medidos = pedidos.map(diferenciaEnHoras).filter((h): h is number => h !== null)
  const horas = medidos.reduce((a, h) => a + Math.abs(h), 0)
  const titular = pedidos.length === 1 ? 'pedido sin resolver' : 'pedidos sin resolver'
  // CON ALGUNO SIN MEDIR el total es un PISO y se dice que lo es: publicar el número a secas diría
  // que están todos contados.
  const piso = medidos.length !== pedidos.length ? 'al menos ' : ''
  const sub = medidos.length === 0
    ? 'Ninguno se puede medir: les falta el otro extremo de la jornada.'
    : `${piso}${horas.toLocaleString('es-AR', { maximumFractionDigits: 1 })} h en juego sobre la liquidación.`
  return { titular, subtitular: sub }
}
