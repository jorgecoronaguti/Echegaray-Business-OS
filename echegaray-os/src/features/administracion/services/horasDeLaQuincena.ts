// CUÁNTAS HORAS TIENE LA QUINCENA — UNA SOLA RESPUESTA, Y LA RESTA DICHA AL LADO.
//
// ═══ EL DEFECTO, MEDIDO EN PRODUCCIÓN (QA visual, 11/09/2026) ═══
//
// El módulo publicaba TRES números distintos bajo el mismo rótulo, en tres solapas que el dueño abre
// una detrás de otra:
//
//   Horas  · «CARG.»                  1.289
//   Pagos  · «HORAS» y Cierre         1.129     (−160)
//   Costo a la obra · «HH»            1.227     (−62)
//
// Los tres eran CORRECTOS y ninguno mentía. La diferencia tiene nombre y apellido:
//
//   160 h  los dos jefes de Oficina. Cobran un NETO MENSUAL acordado, así que `armarCuadros` les
//          pone `horas: null` a propósito: sus horas existen y no se liquidan POR HORA. Sumarlas al
//          total de Pagos daría un importe que nadie va a pagar.
//    62 h  licencias pagas y ausencias con motivo. Se pagan y NO las paga ninguna obra: son costo de
//          la empresa, no de la obra donde esa persona hubiera estado. Imputarlas infla el costo de
//          mano de obra contra el que se mide el presupuesto.
//
// Pero un mismo rótulo con tres números no se audita: la única lectura posible es «uno de los tres
// está mal», y el dueño no tiene cómo saber cuál. Este archivo existe para que la resta esté
// ESCRITA una vez y las cuatro solapas la consuman — y para que cada una pueda decirla al lado de su
// número en vez de dejarla adivinar.
//
// ═══ LO QUE ESTE ARCHIVO NO REDEFINE ═══
//
// Cuánto vale un día lo decide `celdaDelDia`; qué es una hora trabajada, `esTrabajada`; qué modalidad
// cobra cada uno, `modalidadDe(grupo)`. Acá se SUMA lo que esas definiciones ya produjeron y se
// nombra cada exclusión. Si esto recalculara una hora, habría un CUARTO número.

import type { FilaDeGrilla } from './grillaHorasQuincena.ts'
import type { ModalidadDeLiquidacion } from './liquidacionQuincena.ts'

const r2 = (n: number): number => Math.round(n * 100) / 100

/** Lo que hace falta de cada persona. Sale de `filasDeGrilla` + la modalidad de su cuadro. */
export interface FilaDeHoras {
  personaId: string
  nombre: string
  /** Horas LIQUIDABLES de la quincena: lo que `filasDeGrilla` pinta en la fila (`cargadas`). */
  cargadas: number
  /**
   * De esas horas, las que NO son trabajo: licencias pagas y ausencias con motivo que paga.
   * Se pagan igual y no las paga ninguna obra.
   */
  noTrabajadas: number
  /** Cómo cobra: la del CUADRO (`modalidadDe`), no el campo del legajo, que está vacío. */
  modalidad: ModalidadDeLiquidacion
}

/** Una resta, con su nombre y su tamaño. La pantalla la escribe tal cual. */
export interface ExclusionDeHoras {
  motivo: string
  horas: number
  personas: number
}

export interface HorasDeLaQuincena {
  /** TODO lo cargado y liquidable. Es lo que publica «Horas» y lo que pinta la grilla. */
  cargadas: number
  /** Las que se pagan POR HORA. Es lo que publican «Pagos» y «Cierre». */
  liquidables: number
  /** Las que le cuestan a una obra. Es lo que publica «Costo a la obra». */
  aObra: number
  /** Por qué los tres números no son el mismo. Siempre, aunque estén vacías. */
  excluidas: ExclusionDeHoras[]
  personas: number
}

export const MOTIVO_OFICINA =
  'de Oficina: cobran un neto mensual y no se liquidan por hora'
export const MOTIVO_NO_TRABAJADAS =
  'de licencia o ausencia paga: las paga la empresa, no una obra'

/**
 * LOS TRES NÚMEROS Y LA RESTA QUE LOS SEPARA.
 *
 * ═══ LAS DOS RESTAS SON INDEPENDIENTES, Y POR ESO NO SE ENCADENAN ═══
 *
 * `liquidables` y `aObra` salen las dos de `cargadas`, cada una con su propia exclusión. NO es una
 * escalera: las horas trabajadas de la gente de Oficina SÍ le cuestan a una obra —están en `aObra`—
 * y sus licencias no. Restarlas en cadena daría un tercer número que ninguna pantalla publica y que
 * no significa nada.
 */
export function horasDeLaQuincena(filas: readonly FilaDeHoras[]): HorasDeLaQuincena {
  let cargadas = 0
  let liquidables = 0
  let aObra = 0
  let horasOficina = 0
  let personasOficina = 0
  let horasNoTrabajadas = 0
  const conNoTrabajadas = new Set<string>()

  for (const f of filas) {
    cargadas += f.cargadas
    // LA MODALIDAD DECIDE SI SUS HORAS SE LIQUIDAN, NO SI EXISTEN. `mensual` y `ninguna` (las
    // liquidaciones finales, que salen del recibo del estudio) no multiplican horas por tarifa.
    if (f.modalidad === 'hora') liquidables += f.cargadas
    else { horasOficina += f.cargadas; personasOficina++ }
    // A UNA OBRA SE LE CARGA LO TRABAJADO, venga de quien venga. Un jefe de obra que estuvo en la
    // obra le cuesta a esa obra igual que un oficial.
    aObra += f.cargadas - f.noTrabajadas
    if (f.noTrabajadas > 0) { horasNoTrabajadas += f.noTrabajadas; conNoTrabajadas.add(f.personaId) }
  }

  const excluidas: ExclusionDeHoras[] = []
  if (horasOficina > 0) {
    excluidas.push({ motivo: MOTIVO_OFICINA, horas: r2(horasOficina), personas: personasOficina })
  }
  if (horasNoTrabajadas > 0) {
    excluidas.push({
      motivo: MOTIVO_NO_TRABAJADAS,
      horas: r2(horasNoTrabajadas),
      personas: conNoTrabajadas.size,
    })
  }
  return {
    cargadas: r2(cargadas),
    liquidables: r2(liquidables),
    aObra: r2(aObra),
    excluidas,
    personas: filas.length,
  }
}

/** Horas a la argentina: sin signo de moneda y con un decimal sólo cuando existe. */
const h = (n: number): string => n.toLocaleString('es-AR', { maximumFractionDigits: 1 })

/**
 * LA LEYENDA QUE VA AL LADO DEL NÚMERO, en cada solapa la suya.
 *
 * `cual` es el número que ESA pantalla publica; la leyenda explica por qué no es el de la de al lado.
 * Se devuelve vacía cuando no hay nada que restar: un cartel permanente que dice «0 excluidas» es
 * ruido, y el dueño prohíbe los párrafos que están siempre.
 */
export function leyendaDeHoras(
  q: HorasDeLaQuincena, cual: 'cargadas' | 'liquidables' | 'aObra',
): string {
  if (cual === 'cargadas' || q.excluidas.length === 0) return ''
  const relevante = cual === 'liquidables'
    ? q.excluidas.filter((e) => e.motivo === MOTIVO_OFICINA)
    : q.excluidas.filter((e) => e.motivo === MOTIVO_NO_TRABAJADAS)
  if (relevante.length === 0) return ''
  return `${h(q.cargadas)} h cargadas · `
    + relevante.map((e) => `${h(e.horas)} h ${e.motivo}`).join(' · ')
}

/**
 * LA COMPROBACIÓN DE QUE LA RESTA CIERRA. Es un DATO, no un `assert`.
 *
 * Si alguna vez no cierra, la pantalla lo tiene que poder mostrar en vez de romperse y dejar de
 * mostrar la quincena entera — mismo criterio que `tarjetaDeQuincena.cierra`.
 */
export function cierraLaResta(q: HorasDeLaQuincena): boolean {
  const oficina = q.excluidas.find((e) => e.motivo === MOTIVO_OFICINA)?.horas ?? 0
  const noTrabajadas = q.excluidas.find((e) => e.motivo === MOTIVO_NO_TRABAJADAS)?.horas ?? 0
  return r2(q.cargadas - oficina) === q.liquidables
    && r2(q.cargadas - noTrabajadas) === q.aObra
}

/**
 * LAS FILAS, ARMADAS DE LO QUE LA GRILLA YA CALCULÓ.
 *
 * `noTrabajadas` sale de las celdas marcadas `ausencia` o `licencia` CON horas: son las que se pagan
 * sin que nadie las trabaje. Una ausencia sin motivo vale 0 h (R4) y por lo tanto no resta nada —
 * contarla como exclusión inflaría la resta con horas que no existen.
 */
export function filasDeHoras(
  filas: readonly FilaDeGrilla[],
  modalidadDe: (personaId: string) => ModalidadDeLiquidacion,
): FilaDeHoras[] {
  return filas.map((f) => ({
    personaId: f.personaId,
    nombre: f.nombre,
    cargadas: f.cargadas,
    noTrabajadas: r2(f.celdas
      .filter((c) => c.marca === 'ausencia' || c.marca === 'licencia')
      .reduce((s, c) => s + (c.horas ?? 0), 0)),
    modalidad: modalidadDe(f.personaId),
  }))
}
