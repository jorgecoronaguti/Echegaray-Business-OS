// EL CALENDARIO DE PAGOS DEL TELÉFONO — `30 · Portal Cliente Mobile.dc.html`, líneas 128–179.
//
// Seis filas de siete días, LA SEMANA EMPIEZA EL LUNES (el mockup rotula «L M M J V S D»), con los
// días del mes anterior y del siguiente en gris. Cada día puede tener un punto de color: azul lo que
// vence, rojo lo vencido, gris hueco lo estimado.
//
// ═══ POR QUÉ ES UNA FUNCIÓN PURA Y NO UN BUCLE EN EL JSX ═══
//
// Porque las trampas de un calendario no se ven mirando la pantalla en agosto. `getDay()` devuelve 0
// para DOMINGO —no para lunes—, así que la fila arranca corrida un día si no se corrige; un mes que
// empieza lunes NO lleva días del mes anterior; y febrero de un año bisiesto entra en cinco filas
// mientras marzo necesita seis. Se prueba con los meses que rompen, no con el que toca hoy.
//
// ═══ TODO EN UTC ═══
//
// `new Date('2026-09-01')` en Argentina (UTC−3) es el 31/08 a las 21:00, y el calendario empezaría un
// día antes. Se arma con `Date.UTC` y se lee con `getUTC*`: la fecha es un día del calendario, no un
// instante.

export interface DiaCalendario {
  /** `YYYY-MM-DD`. */
  fecha: string
  dia: number
  /** `false` para los días de relleno del mes anterior o el siguiente. */
  del_mes: boolean
  /** Sábado o domingo: el mockup los escribe en gris aunque sean del mes. */
  finde: boolean
}

const iso = (d: Date) => d.toISOString().slice(0, 10)

/**
 * Las seis semanas del mes, de lunes a domingo.
 *
 * @param anio año completo (2026).
 * @param mes 1–12. Se toma 1 = enero: `Date` usa 0 = enero y ése es exactamente el error que este
 *   tipo de código comete en silencio.
 * @param semanas cuántas filas devolver. Seis es lo que dibuja el mockup y lo que hace que la altura
 *   de la caja no salte de mes a mes.
 */
export function grillaDelMes(anio: number, mes: number, semanas = 6): DiaCalendario[] {
  const primero = new Date(Date.UTC(anio, mes - 1, 1))
  // `getUTCDay()`: 0 = domingo. Para una semana que empieza el lunes, el domingo es el día 6.
  const corrimiento = (primero.getUTCDay() + 6) % 7

  const dias: DiaCalendario[] = []
  for (let i = 0; i < semanas * 7; i++) {
    const d = new Date(Date.UTC(anio, mes - 1, 1 - corrimiento + i))
    const diaSemana = d.getUTCDay()
    dias.push({
      fecha: iso(d),
      dia: d.getUTCDate(),
      del_mes: d.getUTCMonth() === mes - 1 && d.getUTCFullYear() === anio,
      finde: diaSemana === 0 || diaSemana === 6,
    })
  }
  return dias
}

/** `2026-09` → `Septiembre`. El rótulo del navegador de mes (`30:114`). */
export function nombreDelMes(anio: number, mes: number): string {
  const nombre = new Date(Date.UTC(anio, mes - 1, 1))
    .toLocaleDateString('es-AR', { month: 'long', timeZone: 'UTC' })
  return nombre.charAt(0).toUpperCase() + nombre.slice(1)
}

/** El mes anterior y el siguiente, sin que diciembre devuelva el mes 13. */
export function mesVecino(anio: number, mes: number, paso: 1 | -1): { anio: number; mes: number } {
  const m = mes + paso
  if (m === 0) return { anio: anio - 1, mes: 12 }
  if (m === 13) return { anio: anio + 1, mes: 1 }
  return { anio, mes: m }
}
