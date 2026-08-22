// LA SEMANA DE ASISTENCIA — la derivación, sin base y sin pantalla.
//
// La pantalla 21 pide una grilla L-V por persona. Todo lo que decide qué dice cada celda vive acá,
// como funciones puras: probar «qué muestra el jueves cuando falta la salida» no puede depender de
// que hoy sea jueves ni de que alguien se haya olvidado de marcar.
//
// ═══ UN DÍA SIN MARCAS NO ES UNA FALTA ═══
//
// Es la regla de la casa y acá se vuelve código: `sin_registrar` y `falta` son celdas distintas. La
// FALTA es un hecho DECLARADO —una fila de `registros_hh` con `tipo_hora = 'ausencia'`, que alguien
// cargó—; la ausencia de marcas es ignorancia: el que no tiene teléfono, el que no le dio permiso al
// GPS y el que faltó se ven exactamente igual desde acá. Pintarlos a todos de rojo sería fabricar
// novedades de liquidación, que es justo lo que este módulo no puede hacer.
//
// ═══ Y UN DÍA QUE TODAVÍA NO PASÓ NO ES NADA ═══
//
// El viernes de la semana en curso no es «sin registrar» el miércoles: es futuro. Sin ese estado, la
// pantalla acusaría a media empresa de no fichar todos los lunes.

import { ventanaDe, type Ventana } from './periodoHH.ts'

export type EstadoCelda =
  | 'jornada' | 'extra' | 'en_curso' | 'sin_cerrar'
  | 'falta' | 'licencia' | 'no_laborable' | 'futuro' | 'sin_registrar'

/** Las dos puntas del día, tal como las publica `presencia_del_dia`. */
export interface DiaMarcado {
  fecha: string
  entrada: string | null
  salida: string | null
  obra_id: string | null
}

/** Lo DECLARADO en `registros_hh` para ese día: es lo único que puede afirmar una ausencia. */
export interface DeclaracionDia {
  fecha: string
  tipo_hora: string
}

export interface Celda {
  fecha: string
  estado: EstadoCelda
  /** Horas de la jornada CERRADA. `null` mientras no haya dos puntas: una jornada abierta no tiene
   *  duración, tiene un reloj corriendo — y ese reloj vive en la pantalla «En obra ahora». */
  horas: number | null
}

const iso = (d: Date) => d.toISOString().slice(0, 10)

export function correrDias(fecha: string, n: number): string {
  const d = new Date(`${fecha}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return iso(d)
}

/**
 * La semana que se mira. `offset` en semanas: −1 es la anterior, +1 la siguiente.
 *
 * Reusa `ventanaDe('semana')` —la misma que usa la ficha de la persona— para que «la semana» empiece
 * el lunes en un solo lugar del repo. Una segunda definición acá haría que la ficha y esta grilla
 * discreparan un día cada domingo, y nadie lo vería hasta que los totales no cerraran.
 */
export function semanaDe(hoy: string, offset = 0): Ventana {
  const base = ventanaDe('semana', hoy)
  const desde = correrDias(base.desde, offset * 7)
  return { desde, hasta: correrDias(desde, 6) }
}

/**
 * Los días que se dibujan: lunes a viernes, y el sábado SÓLO si hay algo que mostrar en él.
 *
 * Una columna de sábado vacía todas las semanas ocuparía un sexto del ancho de la grilla para no
 * decir nada. El domingo no entra ni con marcas: si aparece trabajo un domingo, eso no es una
 * columna más, es una conversación.
 */
export function diasDe(semana: Ventana, fechasConDato: string[] = []): string[] {
  const dias = [0, 1, 2, 3, 4].map((n) => correrDias(semana.desde, n))
  const sabado = correrDias(semana.desde, 5)
  if (fechasConDato.includes(sabado)) dias.push(sabado)
  return dias
}

/** `2026-08-17T11:00:00Z` → `2026-08-17`. Las marcas son `timestamptz`; la grilla es por día. */
export const diaDe = (momento: string) => momento.slice(0, 10)

/**
 * Las horas de una jornada cerrada, redondeadas a dos decimales.
 *
 * `null` si falta una punta o si la salida es anterior a la entrada: una jornada de −2 horas es un
 * dato roto, y publicarla como número la mete en el total como si fuera trabajo negativo.
 */
export function horasEntre(entrada: string | null, salida: string | null): number | null {
  if (!entrada || !salida) return null
  const a = new Date(entrada).getTime()
  const b = new Date(salida).getTime()
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return null
  return Math.round(((b - a) / 3_600_000) * 100) / 100
}

export interface ContextoCelda {
  hoy: string
  /** El día está en `calendario_no_laborable` (feriado nacional, provincial o de la obra). */
  noLaborable?: boolean
  /** La jornada pactada de la obra donde se marcó (`obra_canonica.jornada_horas`). `null` cuando no
   *  se conoce: sin ella NO se declara «extra», porque el umbral sería una constante inventada. */
  jornadaHoras?: number | null
}

/**
 * QUÉ DICE UNA CELDA. El orden de las preguntas es la regla:
 *
 * 1 · si hay jornada cerrada, manda el HECHO — incluso en feriado: alguien trabajó y eso es lo que
 *     hay que ver (y es, casi siempre, la hora al 100% que después se liquida).
 * 2 · entrada sin salida: hoy es una jornada en curso; ayer es una salida que falta, que es el
 *     caso que la bandeja de correcciones existe para resolver.
 * 3 · sin marcas, manda lo DECLARADO: ausencia o licencia.
 * 4 · sin marcas ni declaración: feriado, futuro, o ignorancia declarada como tal.
 */
export function derivarCelda(
  fecha: string,
  dia: DiaMarcado | undefined,
  declaracion: DeclaracionDia | undefined,
  ctx: ContextoCelda,
): Celda {
  const horas = horasEntre(dia?.entrada ?? null, dia?.salida ?? null)
  if (horas !== null) {
    const jornada = ctx.jornadaHoras ?? null
    return { fecha, estado: jornada !== null && horas > jornada ? 'extra' : 'jornada', horas }
  }
  if (dia?.entrada) {
    return { fecha, estado: fecha === ctx.hoy ? 'en_curso' : 'sin_cerrar', horas: null }
  }
  if (declaracion?.tipo_hora === 'ausencia') return { fecha, estado: 'falta', horas: null }
  if (declaracion?.tipo_hora === 'licencia') return { fecha, estado: 'licencia', horas: null }
  if (ctx.noLaborable) return { fecha, estado: 'no_laborable', horas: null }
  if (fecha > ctx.hoy) return { fecha, estado: 'futuro', horas: null }
  return { fecha, estado: 'sin_registrar', horas: null }
}

/** El TOTAL de la fila: sólo jornadas cerradas. Una jornada abierta no suma — sumar la entrada sola
 *  daría un total que crece solo hasta que alguien marque, y ese número se liquida. */
export function totalDeLaSemana(celdas: Celda[]): number {
  return Math.round(celdas.reduce((s, c) => s + (c.horas ?? 0), 0) * 100) / 100
}

export type ClaveEstadoFila =
  | 'correccion' | 'sin_cerrar' | 'sin_fichar_hoy' | 'faltas' | 'sin_registrar' | 'completa' | 'sin_datos'

export interface EstadoFila {
  clave: ClaveEstadoFila
  texto: string
  tono: 'pos' | 'neg' | 'warn' | 'nulo'
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

/**
 * EL ESTADO DE LA SEMANA DE UNA PERSONA — una sola frase, con la prioridad declarada.
 *
 * Primero lo que TODAVÍA SE PUEDE ARREGLAR (un pedido de corrección esperando, una salida sin
 * marcar, el fichaje de hoy), después lo que ya es un hecho cerrado (las faltas declaradas). Una
 * columna de estado existe para decidir qué hacer ahora, no para resumir el pasado.
 *
 * Las faltas no se pierden por quedar segundas: se agregan al texto del estado que ganó.
 */
export function estadoDeLaFila(
  celdas: Celda[],
  ctx: { hoy: string; correccionPendiente?: boolean },
): EstadoFila {
  const cuenta = (e: EstadoCelda) => celdas.filter((c) => c.estado === e).length
  const faltas = cuenta('falta')
  const cola = faltas > 0 ? ` · ${plural(faltas, 'falta', 'faltas')}` : ''

  if (ctx.correccionPendiente) return { clave: 'correccion', texto: `Corrección pend.${cola}`, tono: 'warn' }
  if (cuenta('sin_cerrar') > 0) {
    return { clave: 'sin_cerrar', texto: `${plural(cuenta('sin_cerrar'), 'día', 'días')} sin cerrar${cola}`, tono: 'warn' }
  }
  const hoyEnLaSemana = celdas.find((c) => c.fecha === ctx.hoy)
  if (hoyEnLaSemana?.estado === 'sin_registrar') {
    return { clave: 'sin_fichar_hoy', texto: `Sin fichar hoy${cola}`, tono: 'neg' }
  }
  if (faltas > 0) return { clave: 'faltas', texto: plural(faltas, 'falta', 'faltas'), tono: 'warn' }

  const sinRegistrar = cuenta('sin_registrar')
  if (sinRegistrar > 0) {
    return { clave: 'sin_registrar', texto: `${plural(sinRegistrar, 'día', 'días')} sin registrar`, tono: 'nulo' }
  }
  if (celdas.some((c) => c.estado === 'jornada' || c.estado === 'extra' || c.estado === 'en_curso')) {
    return { clave: 'completa', texto: 'Completa', tono: 'pos' }
  }
  // Ni marcas, ni faltas, ni huecos: la semana entera es feriado, futuro o licencia. No es
  // «completa» —no se trabajó— y tampoco es un problema.
  return { clave: 'sin_datos', texto: 'Sin actividad', tono: 'nulo' }
}

// ═══ DE LAS CUATRO FUENTES A LA GRILLA ═══
//
// Nada se consulta acá: entra todo armado y sale la grilla. Es lo que permite probar una semana con
// feriado, una jornada abierta y una corrección pendiente sin base y sin esperar al jueves.

export interface PersonaSemana {
  persona_id: string
  nombre_completo: string
  categoria: string | null
}

export type MarcaDia = DiaMarcado & { persona_id: string }
export type DeclaracionPersona = DeclaracionDia & { persona_id: string }

export interface EntradaSemana {
  personas: PersonaSemana[]
  dias: string[]
  marcas: MarcaDia[]
  declaraciones: DeclaracionPersona[]
  /** Fechas de `calendario_no_laborable` que valen para todos (nacional, provincial, gremial). */
  noLaborables: string[]
  /** `persona_id` con al menos un pedido de corrección PENDIENTE dentro de la semana. */
  correccionesPendientes: string[]
  hoy: string
  /** `obra_canonica.jornada_horas` por obra. Lo que falte acá no inventa umbral de horas extra. */
  jornadaPorObra: Record<string, number>
}

export interface FilaSemana {
  persona: PersonaSemana
  celdas: Celda[]
  total: number
  estado: EstadoFila
}

/**
 * DOS MARCAS DEL MISMO DÍA SON UN DÍA. `presencia_del_dia` agrupa por (persona, fecha, OBRA): quien
 * fichó en dos obras el mismo día vuelve en dos filas, y tomar una sola le borraría media jornada.
 * Se toma la entrada más temprana y la salida más tardía — el día de esa persona.
 */
function fusionarDia(a: MarcaDia | undefined, b: MarcaDia): MarcaDia {
  if (!a) return b
  const menor = (x: string | null, y: string | null) => (x && y ? (x < y ? x : y) : x ?? y)
  const mayor = (x: string | null, y: string | null) => (x && y ? (x > y ? x : y) : x ?? y)
  const entrada = menor(a.entrada, b.entrada)
  return {
    ...a,
    entrada,
    salida: mayor(a.salida, b.salida),
    obra_id: entrada === a.entrada ? a.obra_id : b.obra_id,
  }
}

export function armarFilas(e: EntradaSemana): FilaSemana[] {
  const porDia = new Map<string, MarcaDia>()
  for (const m of e.marcas) {
    const k = `${m.persona_id}|${m.fecha}`
    porDia.set(k, fusionarDia(porDia.get(k), m))
  }
  const declarado = new Map(e.declaraciones.map((d) => [`${d.persona_id}|${d.fecha}`, d]))
  const feriados = new Set(e.noLaborables)
  const conPedido = new Set(e.correccionesPendientes)

  return e.personas.map((persona) => {
    const celdas = e.dias.map((fecha) => {
      const marca = porDia.get(`${persona.persona_id}|${fecha}`)
      return derivarCelda(fecha, marca, declarado.get(`${persona.persona_id}|${fecha}`), {
        hoy: e.hoy,
        noLaborable: feriados.has(fecha),
        jornadaHoras: marca?.obra_id ? e.jornadaPorObra[marca.obra_id] ?? null : null,
      })
    })
    return {
      persona,
      celdas,
      total: totalDeLaSemana(celdas),
      estado: estadoDeLaFila(celdas, {
        hoy: e.hoy,
        correccionPendiente: conPedido.has(persona.persona_id),
      }),
    }
  })
}

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]
const DIAS = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB']

/** `LUN 17`. El número del día a la vista: sin él, «LUN» no dice de qué semana se está hablando. */
export function etiquetaDia(fecha: string): string {
  const d = new Date(`${fecha}T00:00:00Z`)
  return `${DIAS[d.getUTCDay()]} ${fecha.slice(8, 10)}`
}

/** `Semana del 17 al 21 de agosto`. Cuando cruza de mes, los dos meses: `del 31 de agosto al 4 de
 *  septiembre`, porque «del 31 al 4 de septiembre» hace calcular a quien lee. */
export function rotuloSemana(dias: string[]): string {
  if (dias.length === 0) return 'Semana sin días'
  const a = dias[0]
  const b = dias[dias.length - 1]
  const mesA = MESES[Number(a.slice(5, 7)) - 1]
  const mesB = MESES[Number(b.slice(5, 7)) - 1]
  const dA = Number(a.slice(8, 10))
  const dB = Number(b.slice(8, 10))
  return mesA === mesB
    ? `Semana del ${dA} al ${dB} de ${mesB}`
    : `Semana del ${dA} de ${mesA} al ${dB} de ${mesB}`
}
