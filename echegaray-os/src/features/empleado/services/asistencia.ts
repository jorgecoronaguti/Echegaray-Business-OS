// ASISTENCIA — la presencia, que NO son las horas imputadas a la obra.
//
// ═══ DOS HECHOS QUE SE PARECEN Y NO SE DERIVAN UNO DEL OTRO ═══
//
// La PRESENCIA la registra la persona: entré a las 07:58, salí a las 17:20. Las HH IMPUTADAS las
// carga la obra contra una actividad: 8 horas de mampostería en el muro sur. Que alguien esté ocho
// horas en la obra no significa que la obra haya imputado ocho horas a su nombre, y al revés
// tampoco. El diseño enfrenta las dos puntas y muestra la diferencia como PENDIENTE DE IMPUTAR —
// nunca completa el faltante con la otra.
//
// ═══ EL DÍA EN CURSO NO TIENE TOTAL ═══
//
// Con entrada y sin salida hay dos situaciones que se ven igual en la base y no son lo mismo: hoy es
// «en curso» —la persona sigue trabajando— y ayer es «falta salida» —nadie la registró—. Poner la
// hora actual como salida provisoria fabricaría horas que nadie trabajó, y esas horas terminan en
// una discusión de sueldo. La base ya distingue los dos casos; acá se los nombra.

import type { DiaDeAsistencia, EstadoAsistencia } from '../types'

/** El verbo es el del mockup: «Marcar entrada» / «Marcar salida» (M02 `fichajeT`, M05 `txtBtn`), no
 *  «Registrar». Se ficha, no se registra: es la palabra que usa la obra. */
export const ACCION: Record<EstadoAsistencia, { texto: string; tipo: 'entrada' | 'salida' | null }> = {
  sin_registrar: { texto: 'Marcar entrada', tipo: 'entrada' },
  en_curso: { texto: 'Marcar salida', tipo: 'salida' },
  falta_salida: { texto: 'Marcar salida', tipo: 'salida' },
  completo: { texto: 'Ya marcaste entrada y salida', tipo: null },
}

/** UNA SOLA ACCIÓN PRIMARIA, siempre. El diseño: «Registrar entrada → Registrar salida». Dos
 *  botones a la vez obligan a elegir, y a las siete de la mañana la respuesta correcta es una sola. */
export function siguienteAccion(dia: DiaDeAsistencia | null) {
  return ACCION[dia?.estado ?? 'sin_registrar']
}

/** Qué se dice del día, con su tono. `falta_salida` es `warn` y no `neg`: no es un error de la
 *  persona, es un dato que falta y que corrige Administración. */
export function lecturaDelDia(dia: DiaDeAsistencia | null): {
  texto: string
  tono: 'warn' | 'curso' | 'pos' | 'nulo'
} {
  switch (dia?.estado ?? 'sin_registrar') {
    case 'completo': return { texto: 'Entrada y salida registradas', tono: 'pos' }
    case 'en_curso': return { texto: 'Entrada registrada · en curso', tono: 'curso' }
    case 'falta_salida': return { texto: 'Falta la salida', tono: 'warn' }
    default: return { texto: 'Todavía no registraste tu entrada', tono: 'nulo' }
  }
}

/** `2026-08-20T07:58:12-03:00` → `07:58`. Sin segundos: nadie ficha al segundo y la precisión
 *  falsa invita a discutir un minuto que el reloj del teléfono no garantiza. */
export function hora(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** 460 → `7 h 40 min`. En horas y minutos y no en decimal: la presencia se lee en el reloj. Las HH
 *  imputadas sí van en decimal, porque así se liquidan — son dos unidades a propósito. */
export function duracion(minutos: number | null): string | null {
  if (minutos == null || !Number.isFinite(minutos) || minutos < 0) return null
  const h = Math.floor(minutos / 60)
  const m = Math.round(minutos % 60)
  if (h === 0) return `${m} min`
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

/** El total del período: SÓLO los días cerrados. Un día sin salida no suma cero ni suma "hasta
 *  ahora": no suma, y `sinCerrar` dice cuántos quedaron afuera para que el total no mienta callado. */
export function totalDelPeriodo(dias: DiaDeAsistencia[]): { minutos: number; sinCerrar: number } {
  let minutos = 0
  let sinCerrar = 0
  for (const d of dias) {
    if (d.minutos == null) { if (d.estado !== 'sin_registrar') sinCerrar += 1; continue }
    minutos += d.minutos
  }
  return { minutos, sinCerrar }
}

/**
 * PRESENCIA vs HH IMPUTADAS, y lo que falta imputar.
 *
 * Devuelve `null` cuando falta alguna de las dos puntas: el diseño es explícito —«sólo si existen
 * ambas»—. Mostrar «pendiente de imputar: 148 h» porque no hay una sola marca de asistencia sería
 * acusar a la obra de no imputar cuando lo que falta es la otra mitad del dato.
 */
export function pendienteDeImputar(
  minutosDePresencia: number,
  hhImputadas: number,
): { presencia: number; imputadas: number; pendiente: number } | null {
  if (minutosDePresencia <= 0 || hhImputadas <= 0) return null
  const pendiente = minutosDePresencia - Math.round(hhImputadas * 60)
  return { presencia: minutosDePresencia, imputadas: hhImputadas, pendiente }
}

/**
 * EL ENCABEZADO GRANDE DE M05 — el estado en dos renglones, y ninguno inventa una hora.
 *
 * La nota del mockup: «Un estado grande, un botón grande». El primer renglón dice EN QUÉ ESTADO
 * está —«En obra»— y el segundo lo justifica con el hecho que lo produjo —«fichaste hoy a las
 * 07:12»—. Sin el segundo, el estado es una afirmación del sistema sin evidencia a la vista.
 *
 * `detalle` es `null` cuando no hay marca: «fichaste hoy a las 00:00» sería una hora que nadie
 * marcó, y una hora falsa en la pantalla de asistencia termina en una discusión de sueldo.
 */
export function encabezadoDelDia(dia: DiaDeAsistencia | null): {
  titulo: string
  detalle: string | null
  tono: 'pos' | 'curso' | 'warn' | 'nulo'
} {
  const entrada = hora(dia?.entrada ?? null)
  const salida = hora(dia?.salida ?? null)
  switch (dia?.estado ?? 'sin_registrar') {
    case 'en_curso':
      return { titulo: 'En obra', detalle: entrada ? `fichaste hoy a las ${entrada}` : null, tono: 'curso' }
    case 'completo':
      return {
        titulo: 'Jornada cerrada',
        detalle: entrada && salida ? `${entrada} a ${salida}` : null,
        tono: 'pos',
      }
    case 'falta_salida':
      return {
        titulo: 'Falta la salida',
        detalle: entrada ? `entraste ${entrada} y no marcaste la salida` : null,
        tono: 'warn',
      }
    default:
      return { titulo: 'Todavía no fichaste', detalle: null, tono: 'nulo' }
  }
}

/**
 * LO TRABAJADO HOY, PARA EL AZULEJO DE M05 — y por qué el día en curso NO tiene número.
 *
 * El mockup dibuja «TRABAJADO 2,5 h» sobre un día que sigue abierto. Acá devuelve `null` mientras
 * falte la salida, y es una desviación DELIBERADA del dibujo: la regla del OS —escrita en el
 * encabezado de este archivo y en la migración de asistencia— es que un día sin cerrar no publica
 * total. El elapsed desde la entrada parece la jornada trabajada, se lee como la jornada trabajada,
 * y no lo es: nadie descontó el almuerzo ni la salida a buscar material. Publicarlo es fabricar
 * horas que después alguien cobra o reclama.
 */
export function trabajadoHoy(dia: DiaDeAsistencia | null): string | null {
  if (dia?.minutos == null) return null
  return duracion(dia.minutos)
}

/**
 * QUÉ SE PUEDE DECIR DE UN DÍA DE LA SEMANA QUE NO TIENE NINGUNA MARCA.
 *
 * ═══ EL DEFECTO QUE ARREGLA (25/08/2026, auditoría móvil con datos, hallazgo 3) ═══
 *
 * La semana se dibuja entera, y los días que la base no devuelve se rellenaban TODOS como
 * `sin_registrar` con la ✕ en `warn`. Medido el martes 25: la pantalla acusaba de «sin fichar» al
 * miércoles, al jueves, al viernes, al sábado y al domingo. Los tres primeros son días que TODAVÍA
 * NO PASARON —nadie puede haber faltado a un día que no ocurrió— y los dos últimos no son hábiles
 * para la obra (`obra_canonica.dias_habiles = {1..5}`, isodow). El mockup M05 corta la lista en el
 * día de hoy y M06 escribe «Domingo 24 · descanso»: ninguna de las dos pantallas juzga esos días.
 *
 * `diasHabiles` vacío = NO SE INVENTA UNA SEMANA LABORAL. Una obra que trabaja los sábados existe,
 * y suponerle lunes a viernes le pintaría de descanso el día que su cuadrilla estuvo en obra. Es la
 * misma regla que ya aplica el sombreado del cronograma (`bandaCronograma.ts`), con la misma
 * numeración isodow: 1 lunes … 7 domingo, y `getUTCDay() || 7` para que el domingo sea 7 y no 0.
 */
export type DiaSinMarca = 'sin_fichar' | 'futuro' | 'no_laborable'

export function lecturaDelDiaSinMarca(
  fecha: string, hoy: string, diasHabiles: readonly number[] | null,
): DiaSinMarca {
  const iso = fecha.slice(0, 10)
  // Primero lo que el día ES —un sábado es no laborable se lo mire cuando se lo mire—, y después
  // cuándo se lo mira. Al revés, el sábado que viene diría «todavía no pasó» y el pasado «faltaste».
  if (diasHabiles && diasHabiles.length > 0) {
    const d = new Date(`${iso}T00:00:00Z`)
    if (!Number.isNaN(d.getTime()) && !diasHabiles.includes(d.getUTCDay() || 7)) return 'no_laborable'
  }
  if (iso > hoy.slice(0, 10)) return 'futuro'
  return 'sin_fichar'
}

/** Una fila de la semana de M05: el día de la base, o el que falta con el motivo por el que falta. */
export interface FilaDeSemana extends DiaDeAsistencia {
  /** `null` cuando la fila SÍ tiene marcas: ahí manda `estado`, que lo dice la base. */
  sinMarca: DiaSinMarca | null
}

/**
 * LOS SIETE DÍAS DE LA SEMANA, con los que la base no devolvió clasificados por qué les pasa.
 *
 * La fila sintética lleva `minutos: null` a propósito: no es un día de cero horas, es un día del
 * que no se sabe nada, y `totalDelPeriodo` ya distingue esos dos casos. Un día NO LABORABLE en el
 * que igual se fichó vuelve de la base con sus marcas y se dibuja como cualquier otro: el hecho le
 * gana al calendario.
 */
export function completarSemana(
  lunes: string, dias: readonly DiaDeAsistencia[], hoy: string, diasHabiles: readonly number[] | null,
): FilaDeSemana[] {
  const porFecha = new Map(dias.map((d) => [d.fecha, d]))
  const base = new Date(`${lunes}T00:00:00Z`).getTime()
  return Array.from({ length: 7 }, (_, i) => {
    const fecha = new Date(base + i * 86400000).toISOString().slice(0, 10)
    const real = porFecha.get(fecha)
    if (real) return { ...real, sinMarca: null }
    return {
      fecha, entrada: null, salida: null, incidencias: 0, motivo: null,
      estado: 'sin_registrar' as const, minutos: null, obra_id: null,
      sinMarca: lecturaDelDiaSinMarca(fecha, hoy, diasHabiles),
    }
  })
}
