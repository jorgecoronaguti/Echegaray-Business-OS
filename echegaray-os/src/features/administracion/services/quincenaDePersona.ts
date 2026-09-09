// LA QUINCENA DE UNA PERSONA — lo que el Resumen de su ficha contesta de un vistazo.
//
// Reemplaza a `semanaDePersona.ts`, y el motivo no es estético: la empresa trabaja y paga por
// QUINCENA (1 al 15 y 16 a fin de mes). Un bloque semanal obliga a sumar dos semanas y media a
// mano para cerrar contra la liquidación, y el «10,0 / 44,0 h» que mostraba comparaba contra un
// total teórico semanal que no existe como dato en ninguna tabla del OS.
//
// ═══ EL DENOMINADOR SALE DE LA OBRA, NO DE UNA CONSTANTE ═══
//
// Si se compara, se compara contra los días hábiles TRANSCURRIDOS de la quincena por la jornada
// pactada de la obra (`obra_canonica.jornada_horas`). Sin jornada cargada no hay referencia y se
// escribe «—»: inventar 8 o 9 horas por día produce un porcentaje que nadie puede verificar.
//
// ═══ CINCO SILENCIOS DISTINTOS, CINCO ESTADOS ═══
//
//   trabajado      hay horas trabajadas declaradas.
//   ausencia       el día TIENE registro y dice que no vino. Lleva motivo.
//   licencia       el día tiene registro y la empresa lo reconoce (parte médico, vacaciones…).
//   no_laborable   feriado o fin de semana. Nadie tenía que cargar nada.
//   sin_registrar  día hábil ya transcurrido y nadie cargó. NO es ausente.
//   futuro         todavía no pasó. Tampoco es un cero.
//
// LO DECLARADO MANDA SOBRE EL ALMANAQUE: un sábado con horas cargadas es «trabajado», no «no
// laborable». El calendario sólo explica los días de los que no hay ningún registro.

import { combinarCeldaDia } from '../../../shared/components/ds/celdaDia.ts'
import type { PresenciaDeclarada, PresenciaDia } from '../../../shared/components/ds/celdaDia.ts'
import { esTrabajada } from '../../obras/services/tipoHora.ts'
import { porObra } from './hhPersonaService.ts'
import { horasEsperadasDeDias } from './jornadaPorDefecto.ts'
import { etiquetaDeMotivo } from './motivoDeAusencia.ts'
import {
  correrQuincena, diasDeLaQuincenaSinDomingos, esFinDeSemana, etiquetaDiaCorta, nombreDia,
  quincenaDe, type Quincena,
} from './quincena.ts'
import type { ImputacionHH } from '../types/index.ts'

export type EstadoDia =
  | 'trabajado' | 'presente' | 'ausencia' | 'licencia' | 'no_laborable' | 'sin_registrar' | 'futuro'

export interface DiaDeQuincena {
  fecha: string
  /** `L 1` — lo que entra en una casilla de dieciséis columnas. */
  etiqueta: string
  /** `lunes` — viaja al `title`, porque martes y miércoles comparten la letra M. */
  nombre: string
  /** HH TRABAJADAS del día. `null` cuando no hay ninguna hora trabajada: no es cero. */
  horas: number | null
  estado: EstadoDia
  finDeSemana: boolean
  esHoy: boolean
  /** La etiqueta del motivo del catálogo, para ausencia y licencia. Nunca `notas` en crudo. */
  motivo: string | null
  /** Los nombres REALES de las obras del día. Más de uno = el día se repartió. */
  obras: string[]
  /** Horas extra del día (50% y 100%), ya incluidas en `horas`. */
  extras: number
  /** La capa de arriba de la celda, ya decidida por `combinarCeldaDia`. La ficha no la vuelve a
   *  derivar del estado: eso sería una segunda definición de la precedencia entre las fuentes. */
  presencia: PresenciaDia
  /** El jefe declaró que no vino y el día tiene horas cargadas. Se MUESTRA: la ficha no elige cuál
   *  de las dos afirmaciones es la buena, porque una de las dos se liquida. */
  conflicto: boolean
}

const redondear = (n: number): number => Math.round(n * 100) / 100

const esExtra = (t: string): boolean => t === 'extra_50' || t === 'extra_100'

/** El primer motivo del catálogo que traiga el día. `null` si nadie escribió uno reconocible. */
function motivoDelDia(filas: ImputacionHH[]): string | null {
  for (const f of filas) {
    const m = etiquetaDeMotivo(f.notas)
    if (m) return m
  }
  return null
}

function estadoSinRegistro(fecha: string, feriados: Set<string>, hoy: string): EstadoDia {
  if (feriados.has(fecha) || esFinDeSemana(fecha)) return 'no_laborable'
  return fecha > hoy ? 'futuro' : 'sin_registrar'
}

/**
 * Los días de la quincena, con lo que cada uno tiene declarado. SIN DOMINGOS: la franja dibuja lo
 * mismo que la grilla de Administración, y dos definiciones de «los días de la quincena» dejarían
 * a la ficha contando un hábil que la grilla no muestra. Un registro cargado en domingo no se
 * pierde —sigue en la base y la cronología lo lista—: lo que no hace es ocupar una casilla acá.
 */
export function diasDeLaQuincena(
  filas: ImputacionHH[],
  q: Quincena,
  opciones: {
    feriados?: string[]
    hoy: string
    /** Lo declarado en `asistencia_dia` para esa persona en la ventana. Vacío = nadie declaró nada
     *  y la franja se comporta exactamente como antes del 08/09/2026. */
    presencia?: readonly { fecha: string; estado: PresenciaDeclarada; motivo: string | null }[]
  },
): DiaDeQuincena[] {
  const feriados = new Set(opciones.feriados ?? [])
  const declaradaDe = new Map((opciones.presencia ?? []).map((p) => [p.fecha, p]))
  return diasDeLaQuincenaSinDomingos(q).map((fecha) => {
    const delDia = filas.filter((f) => f.fecha === fecha)
    const trabajadas = delDia.filter((f) => esTrabajada(f.tipo_hora))
    const horas = trabajadas.length > 0
      ? redondear(trabajadas.reduce((s, f) => s + f.horas, 0))
      : null
    const declarada = declaradaDe.get(fecha) ?? null
    const calendario = estadoSinRegistro(fecha, feriados, opciones.hoy)
    // LICENCIA GANA SOBRE AUSENCIA cuando la CARGA DE HORAS trae las dos: la licencia tiene respaldo
    // documental y alguien la autorizó — degradarla a falta le saca un derecho al legajo.
    const enHoras: Exclude<PresenciaDeclarada, 'presente'> | undefined = trabajadas.length === 0
      && delDia.length > 0
      ? (delDia.some((f) => f.tipo_hora === 'licencia') ? 'licencia' : 'ausente')
      : undefined
    const motivo = etiquetaDeMotivo(declarada?.motivo ?? null) ?? motivoDelDia(delDia)
    // LAS TRES FUENTES SE COMBINAN UNA SOLA VEZ, en `combinarCeldaDia`. La ficha no puede tener su
    // propia precedencia: la grilla y esta franja dibujan a la misma persona el mismo día, y dos
    // criterios dan dos respuestas de las que se cree la última que alguien miró.
    const c = combinarCeldaDia({
      declarada: declarada?.estado ?? null,
      horas,
      enHoras,
      dia: calendario === 'no_laborable' ? 'no_laborable' : calendario === 'futuro' ? 'futuro' : 'habil',
      motivo,
    })
    return {
      fecha,
      etiqueta: etiquetaDiaCorta(fecha),
      nombre: nombreDia(fecha),
      finDeSemana: esFinDeSemana(fecha),
      esHoy: fecha === opciones.hoy,
      // El nombre REAL de la obra, nunca un slug ni un uuid. Un día con dos nombres es un día
      // repartido entre dos obras, y eso la ficha lo tiene que decir.
      obras: [...new Set(trabajadas.map((f) => f.obra_nombre).filter(Boolean))] as string[],
      extras: redondear(delDia.filter((f) => esExtra(f.tipo_hora)).reduce((s, f) => s + f.horas, 0)),
      horas,
      estado: estadoDelDia(c.entrada.presencia, horas, calendario),
      // El motivo se escribe SÓLO cuando el día no se trabajó: el de una jornada normal no existe.
      motivo: c.entrada.presencia === 'ausente' || c.entrada.presencia === 'licencia' ? motivo : null,
      presencia: c.entrada.presencia,
      conflicto: c.conflicto,
    }
  })
}

/**
 * El estado del día, con la presencia YA combinada. No vuelve a mirar `tipo_hora` ni la declaración:
 * eso ya lo decidió `combinarCeldaDia`, y acá sólo se traduce a las palabras de esta franja.
 *
 * UNA AUSENCIA DECLARADA CON HORAS SIGUE SIENDO AUSENCIA acá, y las horas se siguen viendo en la
 * celda: es el conflicto, y esconder una de las dos mitades lo resolvería por su cuenta.
 */
function estadoDelDia(
  presencia: PresenciaDia, horas: number | null, calendario: EstadoDia,
): EstadoDia {
  if (presencia === 'ausente') return 'ausencia'
  if (presencia === 'licencia') return 'licencia'
  if (horas !== null) return 'trabajado'
  // DECLARADO PRESENTE Y SIN HORAS: alguien lo miró y dijo que estaba. No es «sin registrar», que
  // es el gris de «nadie cargó nada» — y era lo único que esta franja sabía decir hasta hoy.
  if (presencia === 'presente' || presencia === 'ficho') return 'presente'
  return calendario
}

export interface CifrasQuincena {
  trabajadas: number
  diasTrabajados: number
  /** Días YA TRANSCURRIDOS que no son feriado ni fin de semana. El futuro no se cuenta: diría que
   *  esta persona ya debería haber trabajado días que todavía no llegaron. */
  diasHabiles: number
  /**
   * LAS HORAS QUE ESOS DÍAS HÁBILES ESPERABAN, sumadas día por día: 9 de lunes a jueves, 8 el
   * viernes (`jornadaPorDefecto`). Ya no es `días × jornada de la obra`: esa cuenta usaba un
   * promedio uniforme —el 8,8 de `obra_canonica.jornada_horas`— y publicaba «61,6 h» donde la
   * quincena real esperaba 97.
   */
  referencia: number
  ausencias: number
  licencias: number
  /** El motivo más repetido entre los días no trabajados declarados. */
  motivoFrecuente: string | null
  extras: number
  sinRegistrar: number
  /** Días con horas en más de una obra. */
  enDosObras: number
}

/** El motivo que más veces aparece. Empate: el primero en el orden del calendario, que es estable. */
function motivoFrecuente(dias: DiaDeQuincena[]): string | null {
  const cuenta = new Map<string, number>()
  for (const d of dias) if (d.motivo) cuenta.set(d.motivo, (cuenta.get(d.motivo) ?? 0) + 1)
  let ganador: string | null = null
  let max = 0
  for (const [m, n] of cuenta) if (n > max) { ganador = m; max = n }
  return ganador
}

/**
 * Las cuatro cifras de la quincena.
 *
 * LA REFERENCIA NO SALE DE LA OBRA. Hasta el 09/09/2026 era `días hábiles × obra_canonica
 * .jornada_horas`, y con ese promedio la ficha informaba «61,6 h» para una quincena que espera 97:
 * la jornada la fijó el dueño POR DÍA DE LA SEMANA (9 de L a J, 8 los V), así que la referencia se
 * suma día por día y no admite un multiplicador único. Por eso ya no recibe `jornada`: pasarle un
 * número sería volver a la definición vieja sin que nada lo diga.
 */
export function cifrasDeQuincena(dias: DiaDeQuincena[]): CifrasQuincena {
  const trabajados = dias.filter((d) => d.estado === 'trabajado')
  const transcurridos = dias.filter((d) => d.estado !== 'futuro' && d.estado !== 'no_laborable')
  const habiles = transcurridos.length
  return {
    trabajadas: redondear(trabajados.reduce((s, d) => s + (d.horas ?? 0), 0)),
    diasTrabajados: trabajados.length,
    diasHabiles: habiles,
    referencia: horasEsperadasDeDias(transcurridos.map((d) => d.fecha)),
    ausencias: dias.filter((d) => d.estado === 'ausencia').length,
    licencias: dias.filter((d) => d.estado === 'licencia').length,
    motivoFrecuente: motivoFrecuente(dias),
    extras: redondear(dias.reduce((s, d) => s + d.extras, 0)),
    sinRegistrar: dias.filter((d) => d.estado === 'sin_registrar').length,
    enDosObras: dias.filter((d) => d.obras.length > 1).length,
  }
}

export interface BarraQuincena {
  /** El primer día de la quincena, en ISO. Es la clave y sirve para navegar. */
  clave: string
  /** `1ª sep`. */
  rotulo: string
  horas: number
  /** La obra donde puso más horas, con su nombre real. `null` si no trabajó. */
  obra: string | null
  dias: number
  actual: boolean
}

const MES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** `2026-09-01` → `1ª sep`. */
export function rotuloCorto(q: Quincena): string {
  const primera = Number(q.desde.slice(8, 10)) === 1
  return `${primera ? '1ª' : '2ª'} ${MES_CORTO[Number(q.desde.slice(5, 7)) - 1]}`
}

/**
 * La obra donde puso más horas trabajadas, con su NOMBRE REAL — nunca un slug ni un uuid.
 *
 * Se apoya en `porObra`, que ya agrupa por `obra_canonica_id` y ordena de más a menos: escribir acá
 * una segunda agrupación por obra daría dos definiciones de «la obra de esta persona», y el día que
 * una de las dos cambie el criterio nadie sabría cuál mira la pantalla.
 */
export function obraDominante(filas: ImputacionHH[]): string | null {
  const trabajadas = filas.filter((f) => esTrabajada(f.tipo_hora))
  // Las filas SIN obra se agrupan bajo la clave `—`. No compiten por ser «la obra dominante»:
  // rotular un tramo con «sin obra» diría que trabajó en una obra que se llama así.
  return porObra(trabajadas).find((o) => o.clave !== '—')?.etiqueta ?? null
}

/**
 * Las últimas `cuantas` quincenas, de la más vieja a la más nueva — la actual queda última.
 *
 * Se leen en orden de calendario y no de la más reciente hacia atrás porque lo que se mira acá es
 * una TENDENCIA: «cómo viene». Una quincena sin registros aparece igual, con cero: si se omitiera,
 * seis barras parejas taparían que hubo un mes entero sin cargar.
 */
export function ultimasQuincenas(
  filas: ImputacionHH[], hoy: string, cuantas = 6,
): BarraQuincena[] {
  const actual = quincenaDe(hoy)
  const ventanas: Quincena[] = []
  for (let i = cuantas - 1; i >= 0; i--) ventanas.push(correrQuincena(actual, -i))
  return ventanas.map((q) => {
    const enVentana = filas.filter((f) => f.fecha != null && f.fecha >= q.desde && f.fecha <= q.hasta)
    const trabajadas = enVentana.filter((f) => esTrabajada(f.tipo_hora))
    return {
      clave: q.desde,
      rotulo: rotuloCorto(q),
      horas: redondear(trabajadas.reduce((s, f) => s + f.horas, 0)),
      obra: obraDominante(enVentana),
      dias: new Set(trabajadas.map((f) => f.fecha)).size,
      actual: q.desde === actual.desde,
    }
  })
}
