// LO QUE EL DUEÑO ESCRIBE A MANO LE GANA A LA CUENTA — y se ve que se lo ganó.
//
// Dueño, 09/09/2026: *«quiero más editables todas esas filas y columnas, no los nombres pero lo
// demás sí»*. La regla del repo es anterior y más fuerte: **edición manual = verdad definitiva**. Lo
// que esta capa agrega es que el valor manual no se disfrace de calculado: cada celda pisada sale
// marcada, y vaciarla devuelve la cuenta.
//
// ═══ POR QUÉ NO SE PISA LA CIFRA Y SE OLVIDA LA CUENTA ═══
//
// Guardar sólo el número escrito y borrar el cálculo haría imposible contestar «¿esto lo escribió
// alguien o lo calculó el sistema?» — que es exactamente la pregunta que se hace cuando el total no
// coincide con el recibo. El cálculo se sigue haciendo SIEMPRE; el override se aplica encima y se
// declara. Vaciar la celda no «restaura» nada: deja de haber override y la cuenta vuelve sola.
//
// ═══ LA CADENA SE RECALCULA DESPUÉS DE CADA PISADA (R5 del handoff) ═══
//
//   COBRA        = horas × $/h            ← si se pisan las horas, COBRA se mueve
//   EN EFECTIVO  = COBRA − ADELANTO − YA TRANSFERIDO − POR BANCO
//   TOTAL        = POR BANCO + EN EFECTIVO
//
// Un override corta la cadena EN SU ESLABÓN y los de abajo siguen calculándose sobre el valor
// pisado. Pisar COBRA y que EN EFECTIVO siguiera mostrando la resta vieja sería publicar una fila
// que no cierra consigo misma.
//
// ═══ NULL NO ES CERO, TAMPOCO ACÁ ═══
//
// `null` en un override significa «no hay override». Un cero escrito a mano SÍ es un override —«no
// le doy nada por banco» es una afirmación— y por eso el override viaja como `number | null` y la
// ausencia como la falta de la clave, nunca como 0.

import type { GrupoLiquidacion, LineaLiquidada } from './liquidacionQuincena.ts'
import { repartoDelAcuerdo } from './liquidacionAcuerdo.ts'

/** Las celdas que se pueden pisar a mano. El nombre NO está: es la única que el dueño dejó afuera. */
export const CAMPOS_EDITABLES = [
  'horas', 'cobra', 'adelanto', 'yaTransferido', 'porBanco', 'enEfectivo', 'total',
] as const

export type CampoEditable = (typeof CAMPOS_EDITABLES)[number]

/** Lo escrito a mano para una línea. Clave ausente o `null` = sin override. */
export type OverridesDeLinea = Partial<Record<CampoEditable, number | null>>

export interface LineaConOverrides extends LineaLiquidada {
  /** Qué celdas de esta fila las escribió una persona. La pantalla las marca. */
  manual: Record<CampoEditable, boolean>
  /**
   * DE DÓNDE SALIÓ CADA CELDA. Tres orígenes y un orden, escrito una sola vez:
   *
   *   manual     alguien la escribió en la app (`*_manual` no nulo). GANA SIEMPRE.
   *   jornales   la escribió el dueño en la planilla y la trajo el espejo.
   *   calculado  la cuenta de la app sobre `nomina_adelanto` / `nomina_recibo_neto` + extracto.
   *
   * ═══ POR QUÉ JORNALES LE GANA A LO CALCULADO ═══
   *
   * Dueño, 11/09/2026: *«todo lo referente a adelantos de plata no está»*. La planilla es donde él
   * decide los adelantos, y el derivado es una inferencia del OS sobre movimientos bancarios. Entre
   * la decisión de quien paga y la inferencia de quien mira, manda la decisión — la misma regla que
   * «edición manual = verdad definitiva», un escalón más abajo.
   *
   * ═══ Y POR QUÉ LO MANUAL LE GANA A JORNALES ═══
   *
   * Porque lo manual es MÁS NUEVO por definición: es lo que alguien corrigió mirando esta pantalla,
   * ya sabiendo lo que dice la planilla. Si JORNALES pisara, la corrección desaparecería en la
   * próxima corrida del timer y el que la escribió creería que guardó.
   */
  origen: Record<CampoEditable, OrigenDeCelda>
  /**
   * DÓNDE JORNALES Y EL DERIVADO NO DICEN LO MISMO. Se muestra JORNALES y se AVISA la diferencia:
   * esconderla haría que un giro que el extracto ve y la planilla no —o al revés— desapareciera.
   */
  discrepancia: Partial<Record<CampoEditable, { jornales: number; calculado: number }>>
}

export type OrigenDeCelda = 'calculado' | 'jornales' | 'manual'

/** Lo que el espejo del bloque de JORNALES dice de esta persona. `null` = la planilla no lo dice. */
export interface CadenaDeJornales {
  cobra?: number | null
  adelanto?: number | null
  yaTransferido?: number | null
  porBanco?: number | null
  enEfectivo?: number | null
}

const redondear2 = (n: number): number => Math.round(n * 100) / 100

const SIN_MARCAS: Record<CampoEditable, boolean> = {
  horas: false, cobra: false, adelanto: false, yaTransferido: false,
  porBanco: false, enEfectivo: false, total: false,
}

const TODO_CALCULADO: Record<CampoEditable, OrigenDeCelda> = {
  horas: 'calculado', cobra: 'calculado', adelanto: 'calculado', yaTransferido: 'calculado',
  porBanco: 'calculado', enEfectivo: 'calculado', total: 'calculado',
}

/**
 * LAS CELDAS QUE JORNALES PUEDE APORTAR. `horas` y `total` NO están, y no es un olvido:
 *
 *   HORAS  las de la app salen de `registros_hh` día por día, y el cotejo de la vista «Quincena»
 *          existe justamente para comparar las dos. Si JORNALES pisara las horas, el chip compararía
 *          la planilla contra la planilla y diría «coincide» siempre.
 *   TOTAL  es POR BANCO + EN EFECTIVO. Traerlo de la planilla dejaría una fila que no cierra
 *          consigo misma el día que uno de los dos sumandos venga de otro lado.
 */
const DE_JORNALES = ['cobra', 'adelanto', 'yaTransferido', 'porBanco', 'enEfectivo'] as const

/**
 * LA LÍNEA CALCULADA, CON LO ESCRITO A MANO ENCIMA Y LA CADENA REHECHA.
 *
 * `grupo` importa en un solo punto: COBRA se recalcula desde las horas SÓLO en obreros. Oficina
 * cobra un neto mensual y una liquidación final es la mitad blanca por dos — multiplicar sus horas
 * por una tarifa que no existe daría `null` y borraría el importe correcto de la pantalla.
 */
export function aplicarOverrides(
  base: LineaLiquidada, ov: OverridesDeLinea, grupo: GrupoLiquidacion,
  jornales: CadenaDeJornales | null = null,
): LineaConOverrides {
  const manual = { ...SIN_MARCAS }
  const origen = { ...TODO_CALCULADO }
  const discrepancia: LineaConOverrides['discrepancia'] = {}

  /**
   * LA PRECEDENCIA, EN UNA SOLA FUNCIÓN: manual > JORNALES > calculado.
   *
   * `calculado` llega como función y no como valor porque en varios eslabones depende de los de
   * arriba, que a esta altura ya se resolvieron. Evaluarlo siempre costaría nada; pasarlo perezoso
   * deja que el llamador escriba la cadena en el orden en que se lee.
   */
  const resolver = (campo: CampoEditable, calculado: number | null): number | null => {
    const v = ov[campo]
    if (v != null && Number.isFinite(v)) {
      manual[campo] = true
      origen[campo] = 'manual'
      return redondear2(v)
    }
    if (!jornales || !(DE_JORNALES as readonly string[]).includes(campo)) return calculado
    const j = jornales[campo as (typeof DE_JORNALES)[number]]
    // NULL NO ES CERO, TAMPOCO ACÁ. Una columna que la planilla no rotula viaja NULL y no puede
    // borrar lo que la app calculó: «no hay columna» y «no le dieron nada» son cosas distintas.
    if (j == null || !Number.isFinite(j)) return calculado
    const jr = redondear2(j)
    origen[campo] = 'jornales'
    // LA DIFERENCIA CONTRA EL DERIVADO SE DICE. El extracto puede ver un giro que la planilla no
    // tiene, o al revés: gana JORNALES y la pantalla publica las dos cifras en el `title`.
    if (calculado != null && redondear2(calculado) !== jr) {
      discrepancia[campo] = { jornales: jr, calculado: redondear2(calculado) }
    }
    return jr
  }
  const puesto = (campo: CampoEditable): number | null => {
    const v = ov[campo]
    if (v == null || !Number.isFinite(v)) return null
    manual[campo] = true
    origen[campo] = 'manual'
    return redondear2(v)
  }

  const horas = puesto('horas') ?? base.horas
  const cobraCalc = manual.horas && grupo === 'obreros'
    ? (base.valorHora == null || horas == null ? null : redondear2(horas * base.valorHora))
    : base.cobra
  const cobra = resolver('cobra', cobraCalc)
  const adelanto = resolver('adelanto', base.adelanto) ?? 0
  const yaTransferido = resolver('yaTransferido', base.yaTransferido) ?? 0
  const porBanco = resolver('porBanco', base.porBanco) ?? 0
  // LA CADENA SE REHACE SOBRE LO QUE QUEDÓ ARRIBA, venga de donde venga (R5). Un adelanto de
  // JORNALES que no bajara EN EFECTIVO dejaría una fila que no cierra consigo misma — y el número
  // que el dueño mira para armar el sobre es justamente ése.
  const enEfectivoCalc = cobra == null
    ? null
    : redondear2(cobra - adelanto - yaTransferido - porBanco)
  const enEfectivo = resolver('enEfectivo', enEfectivoCalc)
  const totalCalc = enEfectivo == null ? null : redondear2(porBanco + enEfectivo)
  const total = puesto('total') ?? totalCalc
  // EL ACUERDO 50/50 SE REHACE SOBRE EL COBRA FINAL, no sobre el calculado: si alguien pisó COBRA a
  // mano, las dos mitades que se muestran tienen que ser mitades de LO QUE SE VA A PAGAR.
  const acuerdo = repartoDelAcuerdo(cobra, base.modalidad)

  return {
    ...base,
    horas,
    cobra,
    adelanto,
    yaTransferido,
    porBanco,
    enEfectivo,
    total,
    blancoAcuerdo: acuerdo.blanco,
    efectivoAcuerdo: acuerdo.efectivo,
    // PISAR COBRA A MANO RESUELVE «SIN TARIFA». La fila deja de estar pendiente porque alguien
    // decidió el importe; seguir diciendo «sin tarifa» mandaría a buscar una tarifa que ya no
    // hace falta para pagar esta quincena.
    // PISAR COBRA RESUELVE «SIN TARIFA», venga de la app o de la planilla: en los dos casos alguien
    // decidió el importe y no hace falta buscar una tarifa para pagar esta quincena.
    sinTarifa: base.sinTarifa && origen.cobra === 'calculado',
    manual,
    origen,
    discrepancia,
  }
}

/** Ninguna celda pisada: la fila calculada, con las marcas en falso. Para cuadros sin líneas guardadas. */
export function sinOverrides(base: LineaLiquidada): LineaConOverrides {
  return { ...base, manual: { ...SIN_MARCAS }, origen: { ...TODO_CALCULADO }, discrepancia: {} }
}

/** Nombre de columna en `liquidacion_linea` de cada celda editable. */
export const COLUMNA_DE: Record<CampoEditable, string> = {
  horas: 'horas',
  cobra: 'cobra_manual',
  adelanto: 'adelanto_manual',
  yaTransferido: 'ya_transferido_manual',
  porBanco: 'por_banco_manual',
  enEfectivo: 'en_efectivo_manual',
  total: 'total_manual',
}

/**
 * QUÉ CELDAS SE PUEDEN GUARDAR HOY, según las columnas que la base REALMENTE tiene.
 *
 * `horas` es nullable desde la migración original: NULL = nadie la escribió, y por eso alcanza para
 * distinguir un override de una ausencia. Las otras seis (`cobra`, `adelanto`, …) nacieron NOT NULL
 * DEFAULT 0: un 0 guardado ahí es indistinguible de «no hay override», y la fila que crea el
 * redondeo las deja en 0 — pisarlas liquidaría a alguien en cero sin que nadie lo haya escrito. Por
 * eso van a columnas `*_manual` nullable, y hasta que la migración se aplique esas celdas se
 * dibujan como sólo lectura en vez de guardar en una columna que no puede decir «vacío».
 */
export function camposGuardables(columnas: readonly string[]): CampoEditable[] {
  return CAMPOS_EDITABLES.filter((c) => columnas.includes(COLUMNA_DE[c]))
}
