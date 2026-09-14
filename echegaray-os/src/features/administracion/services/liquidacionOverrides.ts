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
import { sueldoBlancoNegro, type EntradaDeBlanco, type SueldoBlancoNegro } from './sueldoBlancoNegro.ts'

/** Las celdas que se pueden pisar a mano. El nombre NO está: es la única que el dueño dejó afuera. */
export const CAMPOS_EDITABLES = [
  'horas', 'cobra', 'adelanto', 'yaTransferido', 'porBanco', 'enEfectivo', 'total',
  // EL BLANCO (dueño, 14/09/2026: «dejame editable las h/recibo»). El neto es `porBanco`.
  'horasRecibo', 'valorHoraRecibo',
  // IMPORTE NEGRO (15/09/2026: «dejame editable todas las columnas de dinero»). Cobra total es `cobra` y Total
  // efectivo es `enEfectivo`: ya existían.
  'negro',
] as const

export type CampoEditable = (typeof CAMPOS_EDITABLES)[number]

/** Lo escrito a mano para una línea. Clave ausente o `null` = sin override. */
export type OverridesDeLinea = Partial<Record<CampoEditable, number | null>>

/**
 * LO QUE LA PLANILLA DICE DE LAS HORAS Y EL COBRA DE UN OBRERO, cuando ya no manda.
 *
 * `difiere` = las horas o el cobra de JORNALES no son los del cuadro. La pantalla pone la marca sólo
 * entonces, con «JORNALES: 75 h · $371.250» en el `title`.
 */
export interface ReferenciaDeJornales {
  horas: number | null
  cobra: number | null
  porBanco: number | null
  enEfectivo: number | null
  difiere: boolean
}

export interface LineaConOverrides extends LineaLiquidada {
  /** Qué celdas de esta fila las escribió una persona. La pantalla las marca. */
  manual: Record<CampoEditable, boolean>
  /**
   * DE DÓNDE SALIÓ CADA CELDA. Tres orígenes y un orden, escrito una sola vez:
   *
   *   manual     alguien la escribió en la app (`*_manual` no nulo). GANA SIEMPRE.
   *   jornales   la escribió el dueño en la planilla y la trajo el espejo.
   *   calculado  la cuenta de la app sobre `registros_hh`, `nomina_adelanto`, `nomina_recibo_neto` + extracto.
   *
   * ═══ POR QUÉ JORNALES LE GANA A LO CALCULADO EN LA PLATA ENTREGADA ═══
   *
   * Dueño, 11/09/2026: *«todo lo referente a adelantos de plata no está»*. La planilla es donde él
   * decide los adelantos, y el derivado es una inferencia del OS sobre movimientos bancarios. Entre
   * la decisión de quien paga y la inferencia de quien mira, manda la decisión.
   *
   * ═══ Y POR QUÉ NO LE GANA EN EL COBRA DE UN OBRERO (14/09/2026) ═══
   *
   * *«esta mal las hs q considera liq hs, parece q no estan leyendo del mismo cuadro de hs en
   * supabase»*. El cobra de la planilla es SUS horas × $/h, y la planilla va atrasada respecto de la
   * app: Quiroga Alexander, 01/09, 88 h en las celdas (el 11/09 corregido a mano en la web) y $371.250
   * = 75 h en JORNALES. La regla vigente del dueño es «respetar lo que manda app.ecsas.com.ar». Por eso
   * en obreros COBRA sale de las horas del cuadro y EN EFECTIVO de la resta; la planilla queda en
   * `referenciaJornales`. Oficina y finales no cobran por hora y siguen como estaban.
   *
   * ═══ Y POR QUÉ LO MANUAL LE GANA A TODO ═══
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
  /** Obreros: lo que la planilla dice de horas, cobra, banco y efectivo, sin mandar. `null` sin espejo. */
  referenciaJornales: ReferenciaDeJornales | null
  /**
   * BLANCO + NEGRO (dueño, 14/09/2026). `null` fuera del modelo: Oficina, finales, quincena cerrada, o
   * un llamador que no le pasó la entrada del blanco. Con modelo, COBRA = `sueldo.total` y POR BANCO =
   * `sueldo.neto`, salvo lo escrito a mano.
   */
  sueldo: SueldoBlancoNegro | null
  /** Hay $/h y horas pero el blanco no tiene neto: el total no se puede afirmar. No es «sin tarifa». */
  sinNeto: boolean
  /** Horas del recibo que muestra la celda (manual o del recibo/estimado). `null` fuera del modelo. */
  horasRecibo: number | null
  /** $/h de categoría que muestra la celda. `null` fuera del modelo. */
  valorHoraRecibo: number | null
  /** Importe negro que muestra la celda (calculado o escrito). `null` fuera del modelo. */
  negro: number | null
}

export type OrigenDeCelda = 'calculado' | 'jornales' | 'manual'

/** Lo que el espejo del bloque de JORNALES dice de esta persona. `null` = la planilla no lo dice. */
export interface CadenaDeJornales {
  horas?: number | null
  cobra?: number | null
  adelanto?: number | null
  yaTransferido?: number | null
  porBanco?: number | null
  enEfectivo?: number | null
}

const redondear2 = (n: number): number => Math.round(n * 100) / 100

const SIN_MARCAS: Record<CampoEditable, boolean> = {
  horas: false, cobra: false, adelanto: false, yaTransferido: false,
  porBanco: false, enEfectivo: false, total: false, horasRecibo: false, valorHoraRecibo: false, negro: false,
}

const TODO_CALCULADO: Record<CampoEditable, OrigenDeCelda> = {
  horas: 'calculado', cobra: 'calculado', adelanto: 'calculado', yaTransferido: 'calculado',
  porBanco: 'calculado', enEfectivo: 'calculado', total: 'calculado', horasRecibo: 'calculado', valorHoraRecibo: 'calculado', negro: 'calculado',
}

/**
 * LAS CELDAS QUE JORNALES PUEDE APORTAR, POR CUADRO. `horas` y `total` no están en ninguno:
 *
 *   HORAS  salen de `registros_hh` día por día; son las celdas del cuadro.
 *   TOTAL  es POR BANCO + EN EFECTIVO. Traerlo de la planilla dejaría una fila que no cierra.
 *
 * En OBREROS tampoco COBRA ni EN EFECTIVO (dueño, 14/09/2026): cobra = horas del cuadro × $/h, y el
 * efectivo es la resta que hace cerrar la fila con ese cobra. Adelanto, ya transferido y por banco
 * siguen con la precedencia manual > JORNALES > calculado.
 */
const DE_JORNALES_OBREROS = ['adelanto', 'yaTransferido', 'porBanco'] as const
const DE_JORNALES_OTROS = ['cobra', 'adelanto', 'yaTransferido', 'porBanco', 'enEfectivo'] as const
/**
 * CON BLANCO + NEGRO, JORNALES TAMPOCO MANDA EL BANCO: por banco es el neto del recibo (dueño,
 * 14/09/2026). La planilla queda en `referenciaJornales` con su cobra, banco y efectivo.
 */
const DE_JORNALES_MODELO = ['adelanto', 'yaTransferido'] as const

/**
 * LA LÍNEA CALCULADA, CON LO ESCRITO A MANO ENCIMA Y LA CADENA REHECHA.
 *
 * `grupo` importa en dos puntos: COBRA se recalcula desde las horas SÓLO en obreros (Oficina cobra un
 * neto mensual y una final es la mitad blanca por dos), y sólo en obreros JORNALES deja de mandar
 * sobre COBRA y EN EFECTIVO.
 */
export function aplicarOverrides(
  base: LineaLiquidada, ov: OverridesDeLinea, grupo: GrupoLiquidacion,
  jornales: CadenaDeJornales | null = null,
  /** La entrada del blanco. Sin ella la línea sigue el modelo anterior (horas × $/h). */
  blanco: EntradaDeBlanco | null = null,
): LineaConOverrides {
  const manual = { ...SIN_MARCAS }
  const origen = { ...TODO_CALCULADO }
  const discrepancia: LineaConOverrides['discrepancia'] = {}
  const conModelo = blanco != null && grupo === 'obreros'
  const deJornales: readonly string[] = conModelo
    ? DE_JORNALES_MODELO
    : (grupo === 'obreros' ? DE_JORNALES_OBREROS : DE_JORNALES_OTROS)

  /** LA PRECEDENCIA, EN UNA SOLA FUNCIÓN: manual > JORNALES (si el cuadro lo admite) > calculado. */
  const resolver = (campo: CampoEditable, calculado: number | null): number | null => {
    const v = ov[campo]
    if (v != null && Number.isFinite(v)) {
      manual[campo] = true
      origen[campo] = 'manual'
      return redondear2(v)
    }
    if (!jornales || !deJornales.includes(campo)) return calculado
    const j = jornales[campo as keyof CadenaDeJornales]
    // NULL NO ES CERO, TAMPOCO ACÁ. Una columna que la planilla no rotula viaja NULL y no puede
    // borrar lo que la app calculó: «no hay columna» y «no le dieron nada» son cosas distintas.
    if (j == null || !Number.isFinite(j)) return calculado
    const jr = redondear2(j)
    origen[campo] = 'jornales'
    // LA DIFERENCIA CONTRA EL DERIVADO SE DICE: gana JORNALES y la pantalla publica las dos cifras.
    if (calculado != null && redondear2(calculado) !== jr) {
      discrepancia[campo] = { jornales: jr, calculado: redondear2(calculado) }
    }
    return jr
  }
  /** Horas y total no tienen fuente en JORNALES: o los escribió alguien, o se calculan. */
  const puesto = (campo: 'horas' | 'total' | 'horasRecibo' | 'valorHoraRecibo' | 'negro'): number | null => {
    const v = ov[campo]
    if (v == null || !Number.isFinite(v)) return null
    manual[campo] = true
    origen[campo] = 'manual'
    return redondear2(v)
  }

  const horas = puesto('horas') ?? base.horas
  // UNAS HORAS ESCRITAS A MANO SON LAS QUE SE PAGAN: no traen extras aparte que reconstruir.
  const horasEquivalentes = manual.horas ? horas : base.horasEquivalentes
  // EL MODELO SE CALCULA SOBRE LAS HORAS QUE QUEDARON (manuales o de la app) Y EL $/H NEGRO VIGENTE.
  // LO ESCRITO EN EL BLANCO ENTRA AL MODELO: horas del recibo, $/h de categoría y el neto (`por_banco_manual`).
  const netoManual = ov.porBanco != null && Number.isFinite(ov.porBanco) ? redondear2(ov.porBanco) : null
  const manualDelBlanco = conModelo
    ? { horasRecibo: puesto('horasRecibo'), valorHoraRecibo: puesto('valorHoraRecibo'), neto: netoManual, negro: puesto('negro') }
    : undefined
  const sueldo = conModelo
    ? sueldoBlancoNegro({ ...blanco!, horas, horasEquivalentes, valorHoraNegro: base.valorHora, manual: manualDelBlanco })
    : null
  const cobraCalc = sueldo
    ? sueldo.total
    : manual.horas && grupo === 'obreros'
      ? (base.valorHora == null || horas == null ? null : redondear2(horas * base.valorHora))
      : base.cobra
  const cobra = resolver('cobra', cobraCalc)
  const adelanto = resolver('adelanto', base.adelanto) ?? 0
  const yaTransferido = resolver('yaTransferido', base.yaTransferido) ?? 0
  // POR BANCO = NETO. Sin neto el banco no tiene cifra: 0 acá, y el total `null` saca la fila del pie.
  const porBanco = resolver('porBanco', sueldo ? (sueldo.neto ?? 0) : base.porBanco) ?? 0
  // LA CADENA SE REHACE SOBRE LO QUE QUEDÓ ARRIBA, venga de donde venga (R5).
  const enEfectivoCalc = cobra == null
    ? null
    : redondear2(cobra - adelanto - yaTransferido - porBanco)
  const enEfectivo = resolver('enEfectivo', enEfectivoCalc)
  const totalCalc = enEfectivo == null ? null : redondear2(porBanco + enEfectivo)
  const total = (ov.total != null && Number.isFinite(ov.total) ? puesto('total') : null) ?? totalCalc
  // EL ACUERDO 50/50 SE REHACE SOBRE EL COBRA FINAL: las mitades son de LO QUE SE VA A PAGAR.
  const acuerdo = repartoDelAcuerdo(cobra, base.modalidad)

  return {
    ...base,
    horas, horasEquivalentes, extras: manual.horas ? [] : base.extras,
    cobra, adelanto, yaTransferido, porBanco, enEfectivo, total,
    blancoAcuerdo: acuerdo.blanco,
    efectivoAcuerdo: acuerdo.efectivo,
    // PISAR COBRA RESUELVE «SIN TARIFA», venga de la app o de la planilla: en los dos casos alguien
    // decidió el importe y no hace falta buscar una tarifa para pagar esta quincena.
    sinTarifa: base.sinTarifa && origen.cobra === 'calculado',
    manual,
    origen,
    discrepancia,
    referenciaJornales: grupo === 'obreros' ? referenciaDe(jornales, horas, cobra, conModelo) : null,
    sueldo,
    sinNeto: sueldo != null && sueldo.neto == null && !base.sinTarifa && origen.cobra === 'calculado',
    horasRecibo: sueldo?.horasBlanco ?? null,
    valorHoraRecibo: sueldo?.valorHoraCategoria ?? null,
    negro: sueldo?.negro ?? null,
  }
}

/**
 * Lo que la planilla dice de un obrero, y si difiere del cuadro. Con blanco + negro sólo se comparan
 * las HORAS: el cobra de la planilla es horas × $/h, otro concepto que el neto + negro, y una marca que
 * difiere siempre deja de leerse.
 */
function referenciaDe(
  j: CadenaDeJornales | null, horas: number | null, cobra: number | null, conModelo: boolean,
): ReferenciaDeJornales | null {
  if (!j) return null
  const num = (v: number | null | undefined): number | null =>
    v == null || !Number.isFinite(v) ? null : redondear2(v)
  const r = { horas: num(j.horas), cobra: num(j.cobra), porBanco: num(j.porBanco), enEfectivo: num(j.enEfectivo) }
  if (r.horas == null && r.cobra == null && r.enEfectivo == null && r.porBanco == null) return null
  const distinto = (a: number | null, b: number | null) => a != null && b != null && a !== redondear2(b)
  return { ...r, difiere: distinto(r.horas, horas) || (!conModelo && distinto(r.cobra, cobra)) }
}

/** Ninguna celda pisada: la fila calculada, con las marcas en falso. Para cuadros cerrados o sin líneas guardadas. */
export function sinOverrides(base: LineaLiquidada): LineaConOverrides {
  return {
    ...base, manual: { ...SIN_MARCAS }, origen: { ...TODO_CALCULADO }, discrepancia: {},
    referenciaJornales: null, sueldo: null, sinNeto: false, horasRecibo: null, valorHoraRecibo: null, negro: null,
  }
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
  horasRecibo: 'horas_recibo_manual',
  valorHoraRecibo: 'valor_hora_recibo_manual',
  negro: 'negro_manual',
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
