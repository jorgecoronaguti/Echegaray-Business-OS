// LA CLASE DE HORA — una definición, la misma en la base, en la carga y en la ficha.
//
// El dueño: *"La misma hora se carga UNA SOLA VEZ. NO quiero HH para obra por un lado + HH para
// liquidación por otro."* Lo único que le faltaba al registro para servir a los dos era decir QUÉ
// CLASE de hora es.
//
// ═══ LAS HORAS SE GUARDAN REALES: EL RECARGO NO SE MULTIPLICA ═══
//
// Dos horas al 50% se guardan como 2, no como 3. Multiplicar al cargar entierra el recargo adentro
// de un número del que después no se puede sacar, y además infla las HH de OBRA —que son las que se
// trabajaron—. El coeficiente lo aplica quien liquida, sobre horas que siguen siendo horas.
//
// ═══ Y EL SISTEMA NO ADIVINA CUÁL ES CUÁL ═══
//
// *"No inventar automáticamente qué hora es 50% o 100% si no existe regla/evidencia suficiente"*.
// Depende del convenio, del día, de feriados y de la jornada pactada. Lo elige quien carga.

export const TIPOS_HORA = ['normal', 'extra_50', 'extra_100', 'ausencia', 'licencia'] as const
export type TipoHora = (typeof TIPOS_HORA)[number]

export const TIPO_HORA_LABEL: Record<TipoHora, string> = {
  normal: 'Normal',
  extra_50: 'Extra 50%',
  extra_100: 'Extra 100%',
  ausencia: 'Ausencia',
  licencia: 'Licencia',
}

/** Las que SON trabajo. Una ausencia tiene horas y no es trabajo: no consume plan de obra. */
export const TRABAJADAS: readonly TipoHora[] = ['normal', 'extra_50', 'extra_100']

export function esTipoHora(v: unknown): v is TipoHora {
  return typeof v === 'string' && (TIPOS_HORA as readonly string[]).includes(v)
}

export function esTrabajada(t: string): boolean {
  return (TRABAJADAS as readonly string[]).includes(t)
}

/** Lo que se cuenta como trabajado de un conjunto de registros. */
export function horasTrabajadas(rs: { tipo_hora: string; horas: number }[]): number {
  return rs.filter((r) => esTrabajada(r.tipo_hora)).reduce((s, r) => s + r.horas, 0)
}

/** El total por clase de hora. Devuelve las cinco claves siempre: un cero explícito es una
 *  respuesta, y una clave ausente obliga a quien lee a preguntarse si hubo o no. */
export function porTipo(rs: { tipo_hora: string; horas: number }[]): Record<TipoHora, number> {
  const t = { normal: 0, extra_50: 0, extra_100: 0, ausencia: 0, licencia: 0 }
  for (const r of rs) if (esTipoHora(r.tipo_hora)) t[r.tipo_hora] += r.horas
  return t
}
