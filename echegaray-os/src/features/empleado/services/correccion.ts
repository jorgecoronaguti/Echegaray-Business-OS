// M05 · LAS REGLAS DE UN PEDIDO DE CORRECCIÓN, COMO FUNCIÓN PURA.
//
// Van acá y no adentro de la acción por lo mismo que el resto de las reglas de este módulo: una
// regla que sólo se puede ejercitar levantando media aplicación no se prueba, y la que no se prueba
// es la que se rompe. La acción las llama; los tests las llaman directo.
//
// ═══ LAS DOS QUE IMPORTAN ═══
//
//   1. NO SE CORRIGE EL DÍA EN CURSO. Un día de hoy con entrada y sin salida es `en_curso`, no
//      `falta_salida`: la persona todavía está trabajando. Dejar pedir una corrección de hoy sería
//      exactamente la puerta de atrás a «ponerle una salida provisoria al día abierto» que toda la
//      pantalla existe para no hacer — sólo que escrita por el propio interesado.
//
//   2. LA SALIDA VA DESPUÉS DE LA ENTRADA. Sin esta regla, una salida propuesta más temprano que la
//      entrada produce una duración NEGATIVA en `mi_asistencia_dia`, y el total del mes se achica
//      sin que nada grite. Un número imposible en la base es un defecto propio, no un dato raro.

import type { DiaDeAsistencia } from '../types'

export type RevisionCorreccion = { ok: true } | { ok: false; error: string }

const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/
const RE_HORA = /^([01]\d|2[0-3]):([0-5]\d)$/

/** `07:58` → 478. Sirve para comparar dos relojes de pared del MISMO día sin construir fechas. */
export function minutosDeHora(hhmm: string): number | null {
  const m = RE_HORA.exec(hhmm)
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

/** `2026-08-20T18:20:00-03:00` → 1100. La hora de la marca ya registrada, para poder compararla. */
export function minutosDeMomento(iso: string | null): number | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.getHours() * 60 + d.getMinutes()
}

/**
 * ¿Se puede pedir corregir la salida de este día?
 *
 * `dia` es la fila de `mi_asistencia_dia`, que es lo único que la pantalla tiene a mano. `hoy` entra
 * como parámetro y no se lee del reloj acá adentro: una regla que consulta la hora del sistema no se
 * puede probar dos veces con el mismo resultado.
 */
export function revisarPedido(
  { fecha, hora, motivo, hoy, dia }: {
    fecha: string
    hora: string
    motivo: string
    hoy: string
    dia?: DiaDeAsistencia | null
  },
): RevisionCorreccion {
  if (!RE_FECHA.test(fecha)) return { ok: false, error: 'La fecha del día a corregir no es válida.' }
  if (fecha >= hoy) {
    return {
      ok: false,
      error: 'La corrección es para un día que ya terminó. El día de hoy se cierra registrando la '
        + 'salida desde «Hoy», no pidiendo una corrección.',
    }
  }

  const propuesta = minutosDeHora(hora)
  if (propuesta == null) return { ok: false, error: 'Escribí la hora de salida, con formato 18:20.' }

  if (motivo.trim().length < 3) return { ok: false, error: 'Contá en una línea qué pasó ese día.' }
  if (motivo.trim().length > 300) return { ok: false, error: 'Máximo 300 caracteres.' }

  const entrada = minutosDeMomento(dia?.entrada ?? null)
  if (entrada != null && propuesta <= entrada) {
    return {
      ok: false,
      error: 'La salida tiene que ser posterior a la entrada de ese día. Si la que está mal es la '
        + 'entrada, decílo en el motivo: eso lo corrige Administración a mano.',
    }
  }

  return { ok: true }
}

/**
 * EL DÍA QUE LA PANTALLA OFRECE CORREGIR — uno solo, el más reciente.
 *
 * El diseño muestra un único aviso («Falta tu salida del 15/08»). Listar los cinco días abiertos del
 * mes convierte un pedido puntual en una tarea de administración, y en 390px empuja el historial
 * fuera de la pantalla. Se ofrece el más reciente; al resolverlo aparece el siguiente.
 *
 * Un día con pedido PENDIENTE ya no se ofrece: ahí lo que corresponde es esperar, no volver a pedir.
 * Uno con pedido RECHAZADO sí vuelve a ofrecerse — el rechazo es «así no», no «nunca más».
 */
export function diaAPedirCorreccion(
  dias: DiaDeAsistencia[],
  correcciones: { fecha: string; estado: string }[],
): DiaDeAsistencia | null {
  const bloqueadas = new Set(
    correcciones.filter((c) => c.estado === 'pendiente' || c.estado === 'aprobada').map((c) => c.fecha),
  )
  const abiertos = dias
    .filter((d) => d.estado === 'falta_salida' && !bloqueadas.has(d.fecha))
    .sort((a, b) => (a.fecha < b.fecha ? 1 : -1))
  return abiertos[0] ?? null
}

/** El pedido pendiente de un día, si lo hay: es lo que la fila del historial muestra como chip. */
export function pendienteDe<T extends { fecha: string; estado: string }>(
  correcciones: T[], fecha: string,
): T | null {
  return correcciones.find((c) => c.fecha === fecha && c.estado === 'pendiente') ?? null
}

/** `18:20:00` → `18:20`. Postgres devuelve `time` con segundos y nadie sale a las 18:20:00. */
export function horaCorta(t: string | null): string | null {
  if (!t) return null
  const m = /^(\d{2}:\d{2})/.exec(t)
  return m ? m[1] : null
}
