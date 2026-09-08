// CUÁNTAS HORAS SE LIQUIDAN DE UN DÍA QUE NO SE TRABAJÓ.
//
// El dueño, 08/09/2026 18:50, textual: *«no quiero que al momento de hacer una liquidación de hs
// las ausencias y licencias sean un conflicto de hs que se suman y que no. Ausencia sin motivo es
// cero hs. Arreglá eso»*.
//
// Hasta hoy una ausencia SIEMPRE llevaba horas —la jornada de referencia— porque la base no
// aceptaba otra cosa (`registros_hh_horas_check` exigía `horas > 0`). Con eso, el que faltó sin
// avisar cobraba lo mismo que el que estaba con parte médico, y la pantalla resolvía la
// contradicción marcando la celda en rojo para que alguien la mirara. Un número que hay que mirar
// a ojo antes de liquidar no es un número: es una discusión pendiente.
//
// ═══ LAS DOS REGLAS, Y NINGUNA ADMITE EXCEPCIÓN DE PANTALLA ═══
//
//  1. UN DÍA NO SE PAGA POR LA CAUSA, SE PAGA POR LA TABLA. El motivo decide, y sólo el motivo.
//     Sin motivo son cero horas: no se sabe por qué no vino, y nadie paga lo que no puede explicar.
//  2. UN MISMO DÍA NUNCA SUMA DOS VECES. Si esa persona tiene horas TRABAJADAS ese día, se liquidan
//     ésas y la ausencia declarada vale cero. No es que el dato esté mal: la ausencia declarada
//     sigue guardada y visible —el jefe la marcó a la mañana y después le cargaron las horas—, pero
//     lo que se paga son las horas que existen.
//
// ═══ POR QUÉ ES UNA FUNCIÓN PURA Y NO UNA COLUMNA CALCULADA ═══
//
// Porque la misma pregunta la hacen seis lugares distintos —la grilla de la quincena, el total del
// día, el total de la quincena, la ficha de la persona, la cronología y lo que se escribe cuando se
// marca «no vino»— y cada uno la contestaba por su cuenta. Un concepto crítico se define una sola
// vez. Acá no hay base, no hay sesión y no hay fecha del sistema: se prueba entero sin Supabase.

import { MOTIVO } from '../../../../orquestador/lib/asistencia-motivos.mjs'
import { esTrabajada } from '../../obras/services/tipoHora.ts'
import { JORNADA_ESTANDAR_HS } from './ausenciaDeLaPersona.ts'

export interface ReglaDeMotivo {
  /** ¿Ese día se paga como jornada trabajada? */
  paga: boolean
  /** El dueño NO lo dijo explícito: es criterio del OS y él lo ajusta. Se lista en el informe. */
  revisar: boolean
  /** Por qué. Va acá y no en un comentario suelto para que la pantalla pueda mostrarlo. */
  porque: string
}

/**
 * MOTIVO → ¿SE PAGA?
 *
 * ═══ DECISIÓN PROVISORIA DEL OS, EL DUEÑO LA AJUSTA ═══
 *
 * Lo que él dijo textual el 08/09/2026 está marcado `revisar: false`: sin motivo, «faltó sin
 * avisar», «faltó con aviso», suspensión, paro y «otro» no se pagan; enfermedad, accidente de
 * trabajo, vacaciones, licencia especial y franco/feriado sí. Lo que NO dijo —lluvia, obra parada
 * y permiso— quedó `revisar: true`: son los tres casos donde la persona se presentó (o pidió) y la
 * decisión tiene efecto económico directo, así que la elige él, no el OS.
 *
 * SUSPENSIÓN ES EL CASO RARO Y ESTÁ ASÍ A PROPÓSITO: `tipoDeMotivo` la clasifica como `licencia`
 * —tiene acta y respaldo documental— y sin embargo no se paga. Por eso esta tabla es por MOTIVO y
 * no por `tipo_hora`: «toda licencia paga» habría hecho cobrar al suspendido.
 */
export const PAGA_POR_MOTIVO: Readonly<Record<string, ReglaDeMotivo>> = Object.freeze({
  [MOTIVO.FALTA]: { paga: false, revisar: false, porque: 'faltó sin avisar: no se paga' },
  [MOTIVO.FALTA_CON_AVISO]: { paga: false, revisar: false, porque: 'avisar no justifica la falta: no se paga' },
  [MOTIVO.SUSPENSION]: { paga: false, revisar: false, porque: 'una suspensión es sin goce de haberes' },
  [MOTIVO.PARO]: { paga: false, revisar: false, porque: 'medida gremial: el día no se paga' },
  [MOTIVO.OTRO]: { paga: false, revisar: false, porque: '«otro» no dice por qué: no se paga sin causa' },

  [MOTIVO.ENFERMEDAD]: { paga: true, revisar: false, porque: 'enfermedad con parte médico: paga por ley' },
  [MOTIVO.ACCIDENTE]: { paga: true, revisar: false, porque: 'accidente de trabajo (ART): paga por ley' },
  // IN ITINERE ES ART IGUAL. El dueño nombró «accidente de trabajo (ART)»; el accidente yendo o
  // volviendo entra en la misma cobertura y en el mismo derecho, aunque no en el mismo índice de
  // siniestralidad del obrador. Se paga por la misma razón, no por analogía suelta.
  [MOTIVO.ACCIDENTE_IN_ITINERE]: { paga: true, revisar: false, porque: 'accidente in itinere (ART): paga por ley' },
  [MOTIVO.VACACIONES]: { paga: true, revisar: false, porque: 'vacaciones: son remuneradas' },
  [MOTIVO.LICENCIA_ESPECIAL]: { paga: true, revisar: false, porque: 'licencia especial (LCT art. 158): paga y obligatoria' },
  [MOTIVO.FRANCO]: { paga: true, revisar: false, porque: 'franco o feriado: el jornal se paga' },

  [MOTIVO.LLUVIA]: { paga: true, revisar: true, porque: 'se presentó y la obra paró por clima: el jornal se paga' },
  [MOTIVO.SIN_TAREA]: { paga: true, revisar: true, porque: 'vino y no había qué hacer: la falla es nuestra' },
  [MOTIVO.PERMISO]: { paga: true, revisar: true, porque: 'permiso concedido por la empresa' },
})

/** La regla de ese motivo, o `null` si la clave no está en la tabla. `null` NO es «paga»: es «no se
 *  sabe», y lo que no se sabe no se paga (ver `motivoPaga`). */
export function reglaDelMotivo(motivo: string | null | undefined): ReglaDeMotivo | null {
  if (typeof motivo !== 'string') return null
  const clave = motivo.trim()
  return clave === '' ? null : (PAGA_POR_MOTIVO[clave] ?? null)
}

/**
 * ¿Ese día se paga?
 *
 * EL DEFAULT ES NO, Y ES LA MITAD DE LA REGLA. Sin motivo, con un motivo que no está en el catálogo
 * o con texto libre en `notas`, la respuesta es cero horas: es exactamente lo que el dueño pidió
 * («ausencia sin motivo es cero hs») y además lo que menos afirma sobre un derecho que nadie probó.
 */
export const motivoPaga = (motivo: string | null | undefined): boolean =>
  reglaDelMotivo(motivo)?.paga === true

/** Los motivos que el OS decidió sin instrucción del dueño. Es lo que va al informe y a la
 *  pantalla: una decisión provisoria que nadie enumera se convierte en definitiva por olvido. */
export const motivosARevisar = (): { clave: string; porque: string }[] =>
  Object.entries(PAGA_POR_MOTIVO)
    .filter(([, r]) => r.revisar)
    .map(([clave, r]) => ({ clave, porque: r.porque }))

export interface AusenciaAValorizar {
  /** `ausencia` o `licencia`. NO decide: la decisión es del motivo (ver el caso suspensión en
   *  `PAGA_POR_MOTIVO`). Viaja igual porque quien llama ya lo tiene y porque hace legible la
   *  llamada — y porque el día que el tipo tenga que decidir algo, va a estar acá. */
  tipo?: 'ausencia' | 'licencia'
  motivo: string | null | undefined
  /** La jornada de ESE día: `jornadaPorDefecto(fecha)` —9 de lunes a jueves, 8 los viernes—, o la
   *  cifra que alguien tipeó a mano, que gana. `null` cae a la jornada estándar. */
  jornada: number | null | undefined
}

/**
 * LAS HORAS QUE VALE UNA AUSENCIA. La función que este trabajo existe para tener.
 *
 * Sin motivo → 0. Con un motivo que no paga → 0. Con uno que paga → la jornada del día.
 *
 * El cero se puede ESCRIBIR desde la migración `20260908T2400_ausencia_cero_horas`: hasta ella,
 * `registros_hh_horas_check` exigía `horas > 0` y por eso una ausencia siempre llevaba jornada.
 * Esa restricción es la que fabricaba las horas que el dueño no quiere.
 */
export function horasDeAusencia(e: AusenciaAValorizar): number {
  if (!motivoPaga(e.motivo)) return 0
  const jornada = Number(e.jornada)
  return Number.isFinite(jornada) && jornada > 0 ? jornada : JORNADA_ESTANDAR_HS
}

/** Una fila de `registros_hh` mirada por la liquidación. `horas` viaja como TEXTO desde PostgREST
 *  (es `numeric`) y `notas` es donde vive la clave del motivo. */
export interface RegistroLiquidable {
  tipo_hora: string
  horas: number | string | null
  notas?: string | null
}

/**
 * LAS HORAS QUE SE LIQUIDAN DE UN DÍA DE UNA PERSONA. Una sola definición, la misma en la grilla,
 * en los totales, en la ficha y en la cronología.
 *
 * ═══ LO TRABAJADO GANA, Y LA AUSENCIA NO SE SUMA AL LADO ═══
 *
 * Es la regla contra el doble conteo. Un día con 8 hs cargadas en una obra y una «A» declarada esa
 * misma mañana vale 8, no 17. Antes eso era un «conflicto» pintado de rojo que alguien tenía que
 * resolver a mano antes de liquidar — y mientras nadie lo resolvía, los totales sumaban las dos.
 *
 * ═══ POR QUÉ LA AUSENCIA SE RE-VALORIZA EN LA LECTURA Y NO SE CREE LO GUARDADO ═══
 *
 * Porque en la base ya hay filas escritas con la regla vieja: faltas sin aviso con 9 hs adentro. Si
 * la liquidación leyera el número guardado, esos días seguirían pagándose hasta que alguien corra
 * un backfill. La tabla decide: un motivo que no paga vale 0 esté guardado lo que esté guardado. Lo
 * que sí se respeta es la CIFRA de un motivo que paga —puede ser media jornada tipeada a mano—.
 */
export function horasLiquidablesDelDia(registros: readonly RegistroLiquidable[]): number {
  const trabajadas = registros.filter((r) => esTrabajada(r.tipo_hora))
  if (trabajadas.length > 0) return trabajadas.reduce((s, r) => s + numero(r.horas), 0)
  return registros
    .filter((r) => r.tipo_hora === 'ausencia' || r.tipo_hora === 'licencia')
    .reduce((s, r) => s + (motivoPaga(r.notas) ? numero(r.horas) : 0), 0)
}

/** ¿Ese día tiene horas trabajadas cargadas? Es lo que convierte la «A» + horas en un dato
 *  explicado en vez de en un conflicto: la liquidación ya sabe cuál de las dos paga. */
export const hayHorasTrabajadas = (registros: readonly RegistroLiquidable[]): boolean =>
  registros.some((r) => esTrabajada(r.tipo_hora) && numero(r.horas) > 0)

// El TÍTULO de esa celda —«ausencia declarada y horas cargadas: se liquidan las horas cargadas»— no
// vive acá sino en `shared/components/ds/celdaDia.ts` (`AVISO_AUSENCIA_CON_HORAS`): es una frase de
// pantalla, y `shared/` no puede importar de `features/`. Una copia de ese texto acá serían dos
// definiciones de la misma frase.

const numero = (v: number | string | null | undefined): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}
