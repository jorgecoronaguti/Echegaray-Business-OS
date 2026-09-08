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

import { esTrabajada } from '../../obras/services/tipoHora.ts'
import { porObra } from './hhPersonaService.ts'
import { etiquetaDeMotivo } from './motivoDeAusencia.ts'
import {
  correrQuincena, diasDeQuincena, esFinDeSemana, etiquetaDiaCorta, nombreDia, quincenaDe,
  type Quincena,
} from './quincena.ts'
import type { ImputacionHH } from '../types/index.ts'

export type EstadoDia =
  | 'trabajado' | 'ausencia' | 'licencia' | 'no_laborable' | 'sin_registrar' | 'futuro'

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

/** Los quince o dieciséis días de la quincena, con lo que cada uno tiene declarado. */
export function diasDeLaQuincena(
  filas: ImputacionHH[],
  q: Quincena,
  opciones: { feriados?: string[]; hoy: string },
): DiaDeQuincena[] {
  const feriados = new Set(opciones.feriados ?? [])
  return diasDeQuincena(q).map((fecha) => {
    const delDia = filas.filter((f) => f.fecha === fecha)
    const trabajadas = delDia.filter((f) => esTrabajada(f.tipo_hora))
    const base = {
      fecha,
      etiqueta: etiquetaDiaCorta(fecha),
      nombre: nombreDia(fecha),
      finDeSemana: esFinDeSemana(fecha),
      esHoy: fecha === opciones.hoy,
      // El nombre REAL de la obra, nunca un slug ni un uuid. Un día con dos nombres es un día
      // repartido entre dos obras, y eso la ficha lo tiene que decir.
      obras: [...new Set(trabajadas.map((f) => f.obra_nombre).filter(Boolean))] as string[],
      extras: redondear(delDia.filter((f) => esExtra(f.tipo_hora)).reduce((s, f) => s + f.horas, 0)),
    }
    if (trabajadas.length > 0) {
      return {
        ...base,
        horas: redondear(trabajadas.reduce((s, f) => s + f.horas, 0)),
        estado: 'trabajado' as const,
        motivo: null,
      }
    }
    if (delDia.length > 0) {
      // LICENCIA GANA SOBRE AUSENCIA cuando el día trae las dos: la licencia tiene respaldo
      // documental y alguien la autorizó — degradarla a falta le saca un derecho al legajo.
      const estado = delDia.some((f) => f.tipo_hora === 'licencia') ? 'licencia' : 'ausencia'
      return { ...base, horas: null, estado: estado as EstadoDia, motivo: motivoDelDia(delDia) }
    }
    return {
      ...base,
      horas: null,
      estado: estadoSinRegistro(fecha, feriados, opciones.hoy),
      motivo: null,
    }
  })
}

export interface CifrasQuincena {
  trabajadas: number
  diasTrabajados: number
  /** Días YA TRANSCURRIDOS que no son feriado ni fin de semana. El futuro no se cuenta: diría que
   *  esta persona ya debería haber trabajado días que todavía no llegaron. */
  diasHabiles: number
  /** `diasHabiles × jornada de la obra`. `null` sin jornada pactada — no se inventa una. */
  referencia: number | null
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
 * `jornada` es `obra_canonica.jornada_horas` de la obra donde estuvo. Cero o `null` significan que
 * la obra no la tiene cargada, y entonces NO hay referencia contra la cual comparar.
 */
export function cifrasDeQuincena(dias: DiaDeQuincena[], jornada: number | null): CifrasQuincena {
  const trabajados = dias.filter((d) => d.estado === 'trabajado')
  const habiles = dias.filter((d) => d.estado !== 'futuro' && d.estado !== 'no_laborable').length
  const j = jornada != null && Number.isFinite(jornada) && jornada > 0 ? jornada : null
  return {
    trabajadas: redondear(trabajados.reduce((s, d) => s + (d.horas ?? 0), 0)),
    diasTrabajados: trabajados.length,
    diasHabiles: habiles,
    referencia: j === null ? null : redondear(habiles * j),
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
