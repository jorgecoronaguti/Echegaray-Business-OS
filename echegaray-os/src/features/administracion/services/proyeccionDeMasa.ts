// CUÁNTO VA A SALIR ESTA QUINCENA SI TODOS CUMPLEN — la previsibilidad que pidió el dueño.
//
// Pedido textual (10/09/2026): «en la sección de Liquidación de hs, que me vaya diciendo el
// estimado a pagar de masa salarial y de cada uno, proyectando que las personas van a cumplir con
// sus días y hs según día; necesito tener previsibilidad».
//
// ═══ ES UNA ESTIMACIÓN Y SE DECLARA COMO TAL ═══
//
// Nada de lo que sale de acá es un hecho: es lo que costaría la quincena SI cada día que todavía no
// tiene horas cargadas terminara con la jornada por defecto. La pantalla lo rotula «est.» por la
// regla 2 del OS (nunca presentar una estimación como un hecho), y el número convive con el
// liquidado real sin reemplazarlo.
//
// ═══ NO REDEFINE «CUÁNTO COBRA» ═══
//
// El importe lo calcula `liquidarLinea` de `liquidacionQuincena.ts`, la MISMA función que produce
// el cuadro de Pagos, con las horas proyectadas en lugar de las cargadas. Multiplicar acá
// `horas × valorHora` sería la segunda definición del número que se entrega en mano, y de dos
// definiciones se cree la última que alguien miró.
//
// ═══ NULL NO ES CERO, TAMPOCO EN UNA PROYECCIÓN ═══
//
// Sin la tarifa que su modalidad exige, la fila proyecta `null` y la masa la cuenta aparte. Un cero
// sumado al total daría una masa salarial que parece completa y le falta gente: es el mismo defecto
// que «recibo sin liquidación nunca es $ 0», pero escondido dentro de un total.

import { jornadaPorDefecto } from './jornadaPorDefecto.ts'
import type { FilaDeGrilla, PersonaDeGrilla } from './grillaHorasQuincena.ts'
import {
  liquidarLinea, type GrupoLiquidacion, type ModalidadDeLiquidacion,
} from './liquidacionQuincena.ts'

export interface ProyeccionDeFila {
  personaId: string
  modalidad: ModalidadDeLiquidacion
  /** Horas ya cargadas: el dato real de la grilla, sin tocar. */
  horasCargadas: number
  /** Lo que falta para completar la quincena si se cumple la jornada de cada día. ESTIMACIÓN. */
  horasPorCumplir: number
  horasProyectadas: number
  /**
   * DE LAS HORAS POR CUMPLIR, LAS DE DÍAS QUE YA PASARON.
   *
   * Se proyectan igual —un día hábil vencido sin horas casi siempre es trabajo hecho que nadie
   * cargó, no un día que no se trabajó— pero se informan aparte porque no significan lo mismo: lo
   * que falta del futuro se resuelve solo, lo que falta del pasado lo tiene que cargar alguien.
   */
  horasSinCargar: number
  /** Lo que ya se ganó con las horas cargadas. `null` = falta la tarifa; NUNCA cero. */
  importeCargado: number | null
  /** Lo que va a costar la quincena entera si se cumple. `null` = falta la tarifa; NUNCA cero. */
  importeProyectado: number | null
  sinTarifa: boolean
  valorHora: number | null
  netoMensual: number | null
}

/**
 * El cuadro al que pertenece la persona, que es lo que decide POR QUÉ cobra. `modalidadDe` hace el
 * camino de ida (cuadro → modalidad) y esto el de vuelta, para poder llamar a `liquidarLinea` con
 * el mismo grupo con el que la liquidación real la va a liquidar.
 */
function grupoDe(modalidad: ModalidadDeLiquidacion): GrupoLiquidacion {
  if (modalidad === 'mensual') return 'oficina'
  if (modalidad === 'ninguna') return 'final'
  return 'obreros'
}

/** El importe de una línea con un número de horas dado, por la única definición que existe. */
function cobraCon(p: PersonaDeGrilla, horas: number, grupo: GrupoLiquidacion) {
  return liquidarLinea({
    personaId: p.id,
    nombre: p.nombre,
    horas,
    tarifa: { valorHora: p.valorHora, netoMensual: p.netoMensual ?? null, desde: '', origen: 'tarifa vigente' },
    adelanto: 0,
    yaTransferido: 0,
    reciboNeto: null,
    giroEnElLote: false,
  }, grupo)
}

const r2 = (n: number): number => Math.round(n * 100) / 100

/**
 * LA PROYECCIÓN DE UNA PERSONA.
 *
 * Horas proyectadas = las cargadas + la jornada por defecto de cada día `sin-cargar` de la
 * quincena. Un día con ausencia o licencia YA ESTÁ RESUELTO y vale lo que la grilla le dio: la
 * ausencia sin motivo vale 0 y no se proyecta —proyectarle 9 h sería pagarle por decisión de una
 * pantalla—, y la licencia vale lo que su motivo paga. El sábado no tiene jornada por defecto: suma
 * 0, igual que en `horasEsperadasDeQuincena`.
 */
export function proyeccionDeFila(
  fila: FilaDeGrilla, persona: PersonaDeGrilla, hoy: string,
): ProyeccionDeFila {
  const modalidad = persona.modalidad ?? 'hora'
  const grupo = grupoDe(modalidad)
  let porCumplir = 0
  let sinCargar = 0
  for (const c of fila.celdas) {
    if (c.marca !== 'sin-cargar') continue
    const j = jornadaPorDefecto(c.fecha) ?? 0
    porCumplir += j
    if (c.fecha <= hoy) sinCargar += j
  }
  const horasProyectadas = r2(fila.cargadas + porCumplir)
  const proyectada = cobraCon(persona, horasProyectadas, grupo)
  const cargada = cobraCon(persona, fila.cargadas, grupo)
  return {
    personaId: fila.personaId,
    modalidad,
    horasCargadas: fila.cargadas,
    horasPorCumplir: r2(porCumplir),
    horasProyectadas,
    horasSinCargar: r2(sinCargar),
    importeCargado: cargada.cobra,
    importeProyectado: proyectada.cobra,
    sinTarifa: proyectada.sinTarifa,
    valorHora: persona.valorHora,
    netoMensual: persona.netoMensual ?? null,
  }
}

export interface ProyeccionDeQuincena {
  /** Masa salarial estimada de toda la quincena. NO incluye a los que no tienen tarifa. */
  masaProyectada: number
  /** La parte de esa masa que ya está ganada con horas cargadas. */
  masaCargada: number
  /** La diferencia: lo que se va a agregar si cumplen los días que faltan. */
  masaPorCumplir: number
  obreros: number
  oficina: number
  horasProyectadas: number
  horasPorCumplir: number
  horasSinCargar: number
  /** Cuántas filas no se pudieron proyectar. El total de arriba NO las incluye, y hay que decirlo. */
  sinTarifa: number
  personas: number
  porPersona: Record<string, ProyeccionDeFila>
}

/**
 * LA MASA SALARIAL ESTIMADA DE LA QUINCENA.
 *
 * Se desglosa en obreros / oficina porque son dos naturalezas distintas: los obreros proyectan
 * horas y la oficina cobra un neto MENSUAL acordado que no depende de esta quincena. Ese neto
 * aparece entero en las dos quincenas del mes y esta función NO lo parte: si se divide o no es una
 * decisión del dueño que sigue abierta (`desgloseDeQuincena` la deja anotada), y una pantalla no
 * la toma sola.
 */
export function proyeccionDeQuincena(
  filas: readonly FilaDeGrilla[], personas: readonly PersonaDeGrilla[], hoy: string,
): ProyeccionDeQuincena {
  const porId = new Map(personas.map((p) => [p.id, p]))
  const t: ProyeccionDeQuincena = {
    masaProyectada: 0, masaCargada: 0, masaPorCumplir: 0, obreros: 0, oficina: 0,
    horasProyectadas: 0, horasPorCumplir: 0, horasSinCargar: 0,
    sinTarifa: 0, personas: filas.length, porPersona: {},
  }
  for (const f of filas) {
    const p = porId.get(f.personaId)
    if (!p) continue
    const pr = proyeccionDeFila(f, p, hoy)
    t.porPersona[f.personaId] = pr
    t.horasProyectadas += pr.horasProyectadas
    t.horasPorCumplir += pr.horasPorCumplir
    t.horasSinCargar += pr.horasSinCargar
    if (pr.importeProyectado == null) { t.sinTarifa++; continue }
    t.masaProyectada += pr.importeProyectado
    t.masaCargada += pr.importeCargado ?? 0
    if (pr.modalidad === 'mensual') t.oficina += pr.importeProyectado
    else t.obreros += pr.importeProyectado
  }
  t.masaPorCumplir = t.masaProyectada - t.masaCargada
  for (const k of ['masaProyectada', 'masaCargada', 'masaPorCumplir', 'obreros', 'oficina',
    'horasProyectadas', 'horasPorCumplir', 'horasSinCargar'] as const) {
    t[k] = r2(t[k])
  }
  return t
}
