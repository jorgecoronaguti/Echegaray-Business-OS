// LA GRILLA DE LA QUINCENA: 13 días × el plantel, y qué falta para poder cerrar.
//
// Pantalla 1 del handoff v2 del dueño («Horas · la quincena del plantel»). Es una función pura por
// el mismo motivo que `liquidacionQuincena.ts`: el número que muestra decide plata, y los casos que
// importan —el que faltó sin motivo, el que no tiene retribución cargada, el día que nadie cargó—
// tienen que poder ponerse en rojo sin levantar una base.
//
// ═══ LO QUE ESTE ARCHIVO NO REDEFINE ═══
//
// Cuánto vale un día es `liquidacionDeAusencias.ts`; cuánto espera la quincena es
// `horasEsperadasDeQuincena`; cuál es la ventana es `quincena.ts`. Acá se ARMA LA VISTA con esas
// definiciones: una segunda tabla motivo → paga sería la segunda definición del mismo concepto.
//
// ═══ UN DÍA VACÍO NO ES UNA FALTA (R3) ═══
//
// Sin horas y sin presencia declarada la celda es `·` y suma a «días sin cargar», que es trabajo
// administrativo pendiente, no una ausencia. Una ausencia la declara una persona.

import {
  hayHorasTrabajadas, horasDeAusencia, horasLiquidablesDelDia, motivoPaga,
} from './liquidacionDeAusencias.ts'
import { jornadaPorDefecto } from './jornadaPorDefecto.ts'
import { diasDeLaQuincenaSinDomingos, type Quincena } from './quincena.ts'
import {
  faltaLaTarifa, horasEsperadasDeQuincena,
  type ModalidadDeLiquidacion, type PresenciaDeQuincena, type RegistroDeQuincena,
} from './liquidacionQuincena.ts'

/** Una persona del plantel, con lo único que la grilla necesita saber de su legajo. */
export interface PersonaDeGrilla {
  id: string
  nombre: string
  /** `null` es «sin retribución cargada», que NO es cero (R1): la fila queda pendiente. */
  valorHora: number | null
  /** El neto mensual acordado de Oficina. XOR con `valorHora`: nunca los dos (CHECK de la base). */
  netoMensual?: number | null
  convenio: string | null
  /**
   * CÓMO SE LE PAGA A ESTA PERSONA — el mismo `modalidadDe(grupo)` que usa la liquidación, no el
   * campo `modalidad_liquidacion` del legajo.
   *
   * Ese campo está VACÍO en las diecisiete personas de la base real, así que el filtro «Quién»
   * publicaba «Modalidad hora 1 · Modalidad mensual sin cargar» sobre un plantel de quince obreros
   * por hora y dos de Oficina por mes. El corte obrero/oficina ya existe y lo decide la tarifa
   * vigente (`armarCuadros`): quien tiene neto mensual es Oficina. Una segunda definición del
   * mismo corte da dos respuestas y se cree la última que alguien miró.
   */
  modalidad?: ModalidadDeLiquidacion | null
  /**
   * SI ES JEFE DE OBRA — el mismo `esJefeDeObra(persona_directorio.puesto)` que separan el plantel
   * y la asistencia. La grilla se dibuja en los mismos dos grupos y en el mismo orden que las otras
   * dos solapas de Personal: el dueño lo pidió (10/09/2026) porque una lista que cambia de orden
   * entre pantallas obliga a buscar a cada persona de nuevo.
   */
  esJefe?: boolean
}

/** Lo que se dibuja en una celda. `horas` viaja para el `tabular-nums`; `texto` para la A y la L. */
export type MarcaDeCelda = 'horas' | 'ausencia' | 'licencia' | 'sin-cargar'

export interface CeldaDeGrilla {
  fecha: string
  marca: MarcaDeCelda
  horas: number | null
  /** Ausencia declarada sin motivo: vale 0 h (R4) y es lo que traba el cierre. */
  sinMotivo: boolean
}

export type EstadoDeFila = 'al-dia' | 'motivo' | 'tarifa' | 'licencia' | 'sin-cargar'

export interface FilaDeGrilla {
  personaId: string
  nombre: string
  celdas: CeldaDeGrilla[]
  cargadas: number
  esperadas: number
  estado: EstadoDeFila
  /** Cuántos días de esta fila esperan una decisión de alguien. */
  diasSinMotivo: number
  diasSinCargar: number
  horasDeLicencia: number
  /** Jefe de obra según `esJefeDeObra(puesto)`: el mismo corte que Plantel y Asistencia. */
  esJefe: boolean
}

/** El orden del plantel y de la asistencia: alfabético por nombre, en español. */
const porNombre = (a: PersonaDeGrilla, b: PersonaDeGrilla) => a.nombre.localeCompare(b.nombre, 'es')

const r2 = (n: number): number => Math.round(n * 100) / 100

/** UNA CELDA. La precedencia es la misma de `horasDeQuincena`: lo trabajado gana a lo declarado. */
function celdaDelDia(
  fecha: string,
  registros: readonly RegistroDeQuincena[],
  presencia: PresenciaDeQuincena | undefined,
): CeldaDeGrilla {
  const delDia = registros.filter((r) => r.fecha === fecha)
  if (hayHorasTrabajadas(delDia)) {
    return { fecha, marca: 'horas', horas: r2(horasLiquidablesDelDia(delDia)), sinMotivo: false }
  }
  // ═══ LA LICENCIA TAMBIÉN SE CARGA EN `registros_hh`, Y ES LA FUENTE QUE ASISTENCIA MIRA ═══
  //
  // Antes esta celda buscaba la licencia SÓLO en `asistencia_dia`. Quiroga tiene los cinco días del
  // 1 al 7 de septiembre cargados como `tipo_hora = 'licencia'` con motivo «enfermedad» en
  // `registros_hh` y ninguna fila en `asistencia_dia`: Asistencia mostraba 62 h y esta grilla 18.
  // Es la misma precedencia que ya usan `horasDeQuincena` y la franja de la ficha —lo trabajado
  // gana; si no hay trabajado, manda lo declarado, y la licencia le gana a la ausencia—, sólo que
  // acá faltaba la mitad que vive en la tabla de horas.
  const declaradoEnHoras = delDia.filter((r) => r.tipo_hora === 'licencia' || r.tipo_hora === 'ausencia')
  if (declaradoEnHoras.length > 0) {
    const esLicencia = declaradoEnHoras.some((r) => r.tipo_hora === 'licencia')
    const notas = declaradoEnHoras.find((r) => r.notas)?.notas ?? null
    return {
      fecha,
      marca: esLicencia ? 'licencia' : 'ausencia',
      horas: r2(horasLiquidablesDelDia(delDia)),
      sinMotivo: !esLicencia && !motivoPaga(notas) && !notas,
    }
  }
  if (presencia?.estado === 'licencia') {
    const h = horasDeAusencia({ tipo: 'licencia', motivo: presencia.motivo, jornada: jornadaPorDefecto(fecha) })
    return { fecha, marca: 'licencia', horas: h, sinMotivo: false }
  }
  if (presencia?.estado === 'ausente') {
    const h = horasDeAusencia({ tipo: 'ausencia', motivo: presencia.motivo, jornada: jornadaPorDefecto(fecha) })
    // Sin motivo la ausencia vale 0 h y queda marcada: es una decisión que alguien tiene que tomar
    // antes de cerrar, no un dato que la pantalla pueda completar sola.
    return { fecha, marca: 'ausencia', horas: h, sinMotivo: !motivoPaga(presencia.motivo) && !presencia.motivo }
  }
  return { fecha, marca: 'sin-cargar', horas: null, sinMotivo: false }
}

/**
 * EL ESTADO DE LA FILA — una sola palabra, y gana el que traba el cierre.
 *
 * Sin retribución cargada la fila no puede liquidarse aunque tenga las horas completas, así que
 * «tarifa» le gana a «al día». La licencia es informativa: explica por qué las horas cargadas son
 * menos que las esperadas sin que nadie tenga que hacer nada.
 */
function estadoDeFila(f: Omit<FilaDeGrilla, 'estado'>, p: PersonaDeGrilla): EstadoDeFila {
  if (f.diasSinMotivo > 0) return 'motivo'
  // LA TARIFA QUE FALTA ES LA DE SU MODALIDAD, y quién lo decide es `faltaLaTarifa` — la misma
  // función que el cierre. Sin modalidad conocida se exige el valor hora, que es el caso de siempre.
  if (faltaLaTarifa(p.modalidad ?? 'hora', p.valorHora, p.netoMensual ?? null)) return 'tarifa'
  if (f.diasSinCargar > 0) return 'sin-cargar'
  if (f.horasDeLicencia > 0) return 'licencia'
  return 'al-dia'
}

export interface DatosDeGrilla {
  quincena: Quincena
  personas: readonly PersonaDeGrilla[]
  registros: readonly RegistroDeQuincena[]
  presencias: readonly PresenciaDeQuincena[]
  /** `persona_id` de cada registro y cada presencia; la vista los trae por persona. */
  personaDeRegistro: (r: RegistroDeQuincena) => string
  personaDePresencia: (p: PresenciaDeQuincena) => string
  /** Hasta qué día ya transcurrió la quincena: después de hoy nada está «sin cargar». */
  hoy: string
}

export function filasDeGrilla(d: DatosDeGrilla): FilaDeGrilla[] {
  const dias = diasDeLaQuincenaSinDomingos(d.quincena)
  const esperadas = horasEsperadasDeQuincena(d.quincena)
  // MISMO ORDEN QUE PLANTEL Y ASISTENCIA. El directorio llegaba en el orden de la base y la grilla
  // lo publicaba tal cual: la misma persona estaba en un lugar distinto en cada solapa.
  return [...d.personas].sort(porNombre).map((p) => {
    const regs = d.registros.filter((r) => d.personaDeRegistro(r) === p.id)
    const pres = new Map(
      d.presencias.filter((x) => d.personaDePresencia(x) === p.id).map((x) => [x.fecha, x]),
    )
    const celdas = dias.map((f) => celdaDelDia(f, regs, pres.get(f)))
    const base = {
      personaId: p.id,
      nombre: p.nombre,
      esJefe: p.esJefe === true,
      celdas,
      cargadas: r2(celdas.reduce((s, c) => s + (c.horas ?? 0), 0)),
      esperadas,
      diasSinMotivo: celdas.filter((c) => c.sinMotivo).length,
      // Un día que todavía no pasó no está sin cargar: está por venir.
      diasSinCargar: celdas.filter((c) => c.marca === 'sin-cargar' && c.fecha <= d.hoy
        && (jornadaPorDefecto(c.fecha) ?? 0) > 0).length,
      horasDeLicencia: r2(celdas.filter((c) => c.marca === 'licencia').reduce((s, c) => s + (c.horas ?? 0), 0)),
    }
    return { ...base, estado: estadoDeFila(base, p) }
  })
}

export interface ResumenDeGrilla {
  dias: string[]
  cargadas: number
  esperadas: number
  /** Total por columna; `null` en los días sin ninguna hora, que no es lo mismo que 0. */
  porDia: (number | null)[]
  personas: number
  sinRetribucion: number
  diasSinCargar: number
  diasSinMotivo: number
  puedeCerrar: boolean
  /** POR QUÉ no se puede cerrar. Un botón gris sin explicación obliga a adivinar. */
  porQueNo: string
}

/** El pie de la grilla y el bloque de cierre. `puedeCerrar` es falso mientras haya un pendiente. */
export function resumenDeGrilla(
  quincena: Quincena,
  filas: readonly FilaDeGrilla[],
): ResumenDeGrilla {
  const dias = diasDeLaQuincenaSinDomingos(quincena)
  const porDia = dias.map((f, i) => {
    const conHoras = filas.filter((fi) => fi.celdas[i]?.horas != null)
    return conHoras.length === 0 ? null : r2(conHoras.reduce((s, fi) => s + (fi.celdas[i].horas ?? 0), 0))
  })
  const sinRetribucion = filas.filter((f) => f.estado === 'tarifa').length
  const diasSinCargar = filas.reduce((s, f) => s + f.diasSinCargar, 0)
  const diasSinMotivo = filas.reduce((s, f) => s + f.diasSinMotivo, 0)
  const trabas: string[] = []
  if (diasSinMotivo > 0) trabas.push(`${diasSinMotivo} ausencia(s) sin motivo`)
  if (sinRetribucion > 0) trabas.push(`${sinRetribucion} sin retribución cargada`)
  if (diasSinCargar > 0) trabas.push(`${diasSinCargar} día(s) sin cargar`)
  return {
    dias,
    cargadas: r2(filas.reduce((s, f) => s + f.cargadas, 0)),
    // ═══ EL PIE SUMA PERSONAS, LAS DOS COLUMNAS ═══
    //
    // Era `horasEsperadasDeQuincena(quincena)`: las 97 h que espera UNA persona, escritas al lado
    // de las horas cargadas por DIECISIETE. El dueño lo leyó como «Cargadas 206 · Esperadas 97» y
    // el porcentaje que sugería —212 %— no significaba nada. Se suma por fila para que el
    // numerador y el denominador cuenten la misma población; la fila sigue publicando las suyas.
    esperadas: r2(filas.reduce((s, f) => s + f.esperadas, 0)),
    porDia,
    personas: filas.length,
    sinRetribucion,
    diasSinCargar,
    diasSinMotivo,
    puedeCerrar: trabas.length === 0,
    porQueNo: trabas.length === 0 ? '' : `Antes de cerrar: ${trabas.join(' · ')}.`,
  }
}
