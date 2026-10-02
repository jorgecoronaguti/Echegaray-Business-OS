// EL RECIBO QUE SE ARMA DESDE EL PANEL DE LA PERSONA — qué lleva, según lo que se tilda.
//
// Dueño, 22/09/2026: *«tiene q ser algo q aparezca al hacerle click al nombre de cada uno, q aparece en el
// desplegable de la derecha lo q se considera en blanco. tiene q haber un boton q sea "recibo" y se tiene q
// abrir la opcion de ir armando lo q se quiere imprimir o guardar en ese recibo, hs en blanco, en negro
// efectivo deposito en banco»*. Y: *«no hace falta quincena cerrada»*.
//
// ═══ EL PAPEL NO DICE BLANCO NI NEGRO (dueño, 22/09/2026) ═══
//
// Textual: *«el recibo tiene q decir total de hs y total depositado y total efectivo. no puede quedar
// evidencia de blanco o negro»*. El papel se lo lleva la persona y puede terminar en cualquier lado: lo que
// se firma es cuántas horas trabajó y cuánta plata recibió por cada medio. El reparto entre lo que paga el
// recibo del estudio y el resto es una cuenta INTERNA, y vive en el panel de Liquidación, no acá.
//
// Ni una cuenta nueva: cada renglón es una cifra que el panel ya muestra (la línea, `sueldo`, `pago`). Lo
// único que se suma es el total de lo que se eligió imprimir, y sólo si todo lo elegido tiene número: un
// «sin dato» no se imprime como $ 0.

import type { LineaConOverrides } from './liquidacionOverrides'
import { efectivoParaRedondear, pagoDelMensual } from './liquidacionPorTipo.ts'
import { efectivoMostrado } from './efectivoRedondeado.ts'

export type ConceptoDelRecibo = 'horas' | 'horasRecibo' | 'horasFuera' | 'banco' | 'efectivo' | 'pagado'

/**
 * LOS RÓTULOS DE LOS TRES RENGLONES QUE EL PAPEL AFIRMA, en un solo lugar.
 *
 * Estaban escritos a mano acá y otra vez en quien lee el recibo guardado. El recibo emitido se SELLA por
 * estos rótulos (`reciboEmitido.ts` busca el renglón de banco y el de efectivo para llenar sus columnas):
 * dos copias del texto significan que cambiar «Efectivo» por «En efectivo» deja de encontrar la cifra y la
 * ficha empieza a decir «sin dato» sobre plata que se entregó.
 */
export const ROTULO = {
  horas: 'Horas trabajadas',
  // ═══ LAS DOS OPCIONES QUE PIDIÓ EL DUEÑO (22/09/2026) ═══
  //
  // Textual: *«en recibo quiero dos opciones adicionales q sean hs trabajadas por recibo y hs trabajadas
  // fuera de recibo»*. Son el reparto de las horas, SÍ — pero dicho por lo que el papel del estudio cubre y
  // lo que no, que es un hecho verificable contra el recibo mismo. Nunca las palabras «blanco» y «negro»:
  // eso sigue rigiendo (*«no puede quedar evidencia de blanco o negro»*), y por eso ninguna de las dos se
  // tilda sola — sale del papel salvo que quien lo arma decida ponerla.
  horasRecibo: 'Horas trabajadas por recibo',
  horasFuera: 'Horas trabajadas fuera de recibo',
  banco: 'Depósito en banco',
  efectivo: 'Efectivo',
} as const

export interface EleccionDelRecibo {
  /** El TOTAL de horas de la quincena. Nunca el reparto entre blanco y negro: ver el encabezado. */
  horas: boolean
  /** Las horas que el recibo del estudio cubre. Apagada por defecto. */
  horasRecibo: boolean
  /** Las horas que el recibo no cubre. Apagada por defecto. */
  horasFuera: boolean
  banco: boolean
  efectivo: boolean
  /** Debajo de cada medio: lo ya pagado (adelantos) y lo que resta. */
  pagado: boolean
}

export interface RenglonDelRecibo {
  rotulo: string
  detalle?: string | null
  importe: number | null
  /** Horas, sin importe propio en el total. */
  horas?: number | null
  sub?: boolean
}

export interface ReciboArmado {
  horas: RenglonDelRecibo[]
  medios: RenglonDelRecibo[]
  /** Suma de los medios elegidos. `null` si ninguno, o si alguno no tiene número. */
  total: number | null
  /**
   * El depósito en banco que imprime es una ESTIMACIÓN: todavía no hay recibo del estudio para esta persona y
   * quincena. Un papel así se puede mirar e imprimir, pero no se sella ni se numera como definitivo.
   */
  estimado?: boolean
}

/**
 * Lo que se puede tildar para esta línea, y por qué no, cuando no se puede.
 *
 * `mensual` lo decide el llamador (`tipoDeLiquidacion`): sin él, a un jornalero de una quincena CERRADA —que
 * tampoco trae `sueldo`— se le decía «cobra por mes», que es falso (auditoría 22/09/2026).
 */
export function conceptosDisponibles(l: LineaConOverrides, mensual = false): Record<ConceptoDelRecibo, string | null> {
  const horas = horasDeLaQuincena(l)
  const sinHoras = mensual ? 'cobra por mes: no se liquida por hora' : 'sin horas cargadas en la quincena'
  // El reparto sólo existe cuando la línea trae el modelo de sueldo. Sin él no se reparte nada: se dice que
  // no está, en vez de imprimir «0 h fuera de recibo», que afirmaría algo que nadie cargó.
  const r = horasPorRecibo(l)
  const f = horasFueraDeRecibo(l)
  return {
    horas: horas == null ? sinHoras : null,
    horasRecibo: r == null ? (horas == null ? sinHoras : 'la quincena no trae el reparto de horas') : null,
    horasFuera: f == null ? (horas == null ? sinHoras : 'la quincena no trae el reparto de horas') : null,
    banco: null,
    efectivo: null,
    pagado: null,
  }
}

/** Las horas que cubre el recibo del estudio. `null` si la línea no trae el reparto. */
export function horasPorRecibo(l: LineaConOverrides): number | null {
  const b = l.sueldo?.horasBlanco
  return b == null ? null : Math.round(b * 100) / 100
}

/** Las horas que el recibo no cubre. `null` si la línea no trae el reparto. */
export function horasFueraDeRecibo(l: LineaConOverrides): number | null {
  const n = l.sueldo?.horasNegro
  return n == null ? null : Math.round(n * 100) / 100
}

/**
 * EL TOTAL DE HORAS, sin abrir el reparto. Con modelo blanco + negro son las dos partes sumadas —que es
 * exactamente lo que la persona trabajó—; sin modelo, las horas de la línea. `null` = no hay horas cargadas,
 * y entonces el renglón no se imprime: una quincena sin horas no vale «0 h».
 */
export function horasDeLaQuincena(l: LineaConOverrides): number | null {
  const s = l.sueldo
  if (s) {
    const b = s.horasBlanco ?? null
    const n = s.horasNegro ?? null
    if (b == null && n == null) return null
    return Math.round(((b ?? 0) + (n ?? 0)) * 100) / 100
  }
  return l.horas ?? null
}

/** Por defecto va todo lo que la línea puede decir. */
export function eleccionInicial(l: LineaConOverrides, mensual = false): EleccionDelRecibo {
  const d = conceptosDisponibles(l, mensual)
  // El reparto NO se tilda solo: el papel por defecto dice el total de horas y nada más.
  return { horas: d.horas == null, horasRecibo: false, horasFuera: false, banco: true, efectivo: true, pagado: false }
}

const hs = (n: number | null | undefined): string => (n == null ? 'sin dato' : `${String(Math.round(n * 100) / 100).replace('.', ',')} h`)

/**
 * Los dos medios. Tres modelos, y NINGUNO se reinventa acá — son los mismos que dibuja el panel:
 *
 *   · blanco + negro (jornalero, quincena abierta): `l.pago`.
 *   · mensual y Oficina: `pagoDelMensual`, que es lo que muestra `CadenaMensual`.
 *   · el resto (finales, quincena cerrada sin modelo): la cadena de siempre. Acá estaba el defecto que
 *     encontró la auditoría del 22/09/2026: `l.enEfectivo` YA viene con el adelanto y lo transferido
 *     descontados (`cobra − adelanto − yaTransferido − porBanco`), así que ponerlo como total del efectivo
 *     y volver a restar «ya pagado» descontaba el adelanto dos veces. El total del efectivo es
 *     `cobra − porBanco`, lo ya pagado es el adelanto más lo transferido, y lo que resta es `enEfectivo`.
 */
function medios(l: LineaConOverrides, mensual: boolean) {
  if (l.sueldo) {
    const p = l.pago
    return {
      banco: { total: p.banco, pagado: p.pagadoBanco, resta: p.saldoBanco },
      efectivo: { total: p.negro, pagado: p.pagadoEfectivo, resta: p.saldoEfectivo },
      excedente: p.excedente, absorbido: p.absorbido, previos: [],
    }
  }
  if (mensual) {
    const p = pagoDelMensual(l as Parameters<typeof pagoDelMensual>[0])
    return {
      banco: { total: p.banco, pagado: p.pagadoBanco, resta: p.saldoBanco },
      efectivo: { total: p.negro, pagado: p.pagadoEfectivo, resta: p.saldoEfectivo },
      excedente: p.excedente, absorbido: p.absorbido, previos: [],
    }
  }
  // LA CADENA DEL PANEL, TAL CUAL (`CadenaSinModelo`): cobra total − adelanto − ya transferido = banco +
  // efectivo. Acá estuvo el ida y vuelta de la auditoría del 22/09/2026: primero `enEfectivo` como total del
  // efectivo descontaba el adelanto dos veces; después `cobra − porBanco` con «ya pagado = adelanto + ya
  // transferido» contaba lo TRANSFERIDO de los dos lados y declaraba $ 50.000 menos de deuda. Lo que se paga
  // hoy es `porBanco` y `enEfectivo`; lo ya cobrado se dice arriba, entero, una sola vez.
  return {
    banco: { total: l.porBanco, pagado: null, resta: null },
    efectivo: { total: l.enEfectivo, pagado: null, resta: null },
    excedente: l.pago?.excedente ?? null,
    absorbido: l.pago?.absorbido ?? null,
    previos: [
      { rotulo: 'Cobra la quincena', importe: l.cobra },
      ...((l.adelanto ?? 0) > 0 ? [{ rotulo: 'menos el adelanto', importe: -(l.adelanto ?? 0), sub: true }] : []),
      ...((l.yaTransferido ?? 0) > 0 ? [{ rotulo: 'menos lo ya transferido', importe: -(l.yaTransferido ?? 0), sub: true }] : []),
    ],
  }
}

/** Lo pagado de más por un lado que se descuenta del otro (`pago.absorbido`): va escrito debajo del que lo absorbe. */
function absorbidoPor(a: { lado: 'banco' | 'efectivo'; importe: number } | null, clave: 'banco' | 'efectivo'): RenglonDelRecibo | null {
  if (!a || a.lado === clave || !(a.importe > 0)) return null
  return { rotulo: `menos lo pagado de más en ${a.lado === 'banco' ? 'banco' : 'efectivo'}`, importe: -a.importe, sub: true }
}

const r2 = (n: number) => Math.round(n * 100) / 100

export const ROTULO_SUB = { reciboDeSueldo: 'Recibo de sueldo', diferencia: 'Diferencia a revisar' } as const

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** «Q1-09/2026» → «1ª quincena de septiembre». Lo que no se reconoce se dice tal cual: no se inventa una fecha. */
export function quincenaDeOrigen(periodo: string): string {
  const m = /^Q([12])-(\d{2})/.exec(periodo.trim())
  const mes = m ? MESES[Number(m[2]) - 1] : undefined
  return m && mes ? `${m[1]}ª quincena de ${mes}` : periodo.trim()
}

/** Varios orígenes se suman en una fila (`leerArrastres`): «Q1-09/2026, Q2-08/2026» → «… y …». */
const origenesDichos = (periodoOrigen: string): string => periodoOrigen.split(',').map(quincenaDeOrigen).join(' y ')

/**
 * EL DEPÓSITO EN BANCO, ABIERTO (dueño, 02/10/2026: *«no me coinciden con lo que envían por recibo de liquidación
 * los contadores»*). El renglón principal sigue siendo el subtotal —el sello y la ficha lo buscan por su rótulo— y
 * debajo van las dos partes: el neto del recibo de sueldo, que es el del estudio, y el saldo del recibo de otra
 * quincena que se paga por este banco. Los importes pagados no cambian; sólo se dice de dónde sale cada uno.
 */
function desgloseDelBanco(neto: number, arrastre: number, periodoOrigen: string, residuo = 0): RenglonDelRecibo[] {
  // SIN TEXTO DE MÁS (dueño, 02/10: «no me gustan las aclaraciones extras… confunden»): rótulo corto, sin repetir el del banco.
  return [
    { rotulo: ROTULO_SUB.reciboDeSueldo, importe: neto, sub: true },
    ...(arrastre > 0 ? [{ rotulo: `Saldo ${origenesDichos(periodoOrigen)}`, importe: arrastre, sub: true }] : []),
    // LO QUE NO CIERRA SE DICE: el neto del estudio manda y la diferencia queda a la vista, no repartida en silencio.
    ...(residuo !== 0 ? [{ rotulo: ROTULO_SUB.diferencia, importe: residuo, sub: true }] : []),
  ]
}

/** La resta de otro recibo que este banco paga: la aplicada (quincena abierta) o la ya incluida en el banco sellado (cerrada). */
function restaDelBanco(l: LineaConOverrides): { importe: number; periodoOrigen: string } | null {
  const a = l.arrastre?.estado === 'aplicado' ? l.arrastre : l.arrastreIncluido
  return a && a.importe > 0 ? { importe: r2(a.importe), periodoOrigen: a.periodoOrigen } : null
}

/**
 * EL NETO DEL RECIBO DEL ESTUDIO, LEÍDO DE ÉL (no restado del banco): el de la línea cuando viene del recibo o de
 * la nómina, o el que la línea cerrada conserva (`reciboNeto`). `null` = no hay recibo del estudio.
 */
function netoDelEstudio(l: LineaConOverrides): number | null {
  const o = l.sueldo?.origenNeto
  if (l.sueldo && (o === 'recibo' || o === 'nomina') && l.sueldo.neto != null) return l.sueldo.neto
  return l.reciboNeto ?? null
}

/**
 * EL EFECTIVO QUE ENTREGA EL DUEÑO (dueño, 02/10/2026): el «Efect. red.» del cuadro —`efectivoMostrado` sobre
 * `efectivoParaRedondear`, las mismas funciones de la celda, sin cuenta nueva— redondea el SALDO que resta. En el
 * recibo, entonces, «resta» es ese número y «Efectivo» es lo ya pagado más esa resta: nunca un importe con centavos
 * bajo un efectivo redondo. Si lo ya pagado supera lo que correspondía, no se inventa nada: se muestra lo pagado y
 * resta 0. `null` = no se puede afirmar (la cadena del panel no cierra con la del cuadro): se muestra el exacto.
 */
function efectivoDelPapel(l: LineaConOverrides, mensual: boolean, exacto: number | null, pagado: number | null): { total: number; resta: number } | null {
  const pag = pagado ?? 0
  const aRedondear = efectivoParaRedondear(l, mensual)
  // Sin la cifra del cuadro no hay nada que redondear: se muestra el exacto, tal cual está.
  if (exacto == null || aRedondear == null || !(exacto > 0 || pag > 0)) return null
  // LA REGLA ÚNICA: Efectivo = ya pagado + resta, y la resta es el «Efect. red.» del cuadro (guardado o sugerido). Lo
  // pagado de más por banco NO entra acá: se dice en la sección del banco, donde ocurrió.
  const resta = efectivoMostrado({ efectivoRedondeado: l.efectivoRedondeado ?? null, enEfectivo: aRedondear }).valor ?? 0
  return { total: r2(pag + resta), resta }
}

/**
 * Los rótulos de un papel sellado ANTES de esta limpieza («Depósito en banco · recibo de sueldo», «… · saldo del
 * recibo de la …») se reimprimen con los cortos, y sin ninguna cuenta escrita al lado de un importe. No toca
 * importes, orden ni cantidad de renglones. El único texto que se conserva es «ESTIMADO».
 */
export function limpiarMediosSellados(medios: RenglonDelRecibo[]): RenglonDelRecibo[] {
  const prefijo = `${ROTULO.banco} · `
  return medios.map((m) => {
    let rotulo = m.rotulo
    if (m.sub && rotulo.startsWith(prefijo)) {
      const resto = rotulo.slice(prefijo.length)
      rotulo = resto === 'recibo de sueldo' ? ROTULO_SUB.reciboDeSueldo
        : resto === 'diferencia a revisar' ? ROTULO_SUB.diferencia
          : resto.startsWith('saldo del recibo de la ') ? `Saldo ${resto.slice('saldo del recibo de la '.length)}` : resto
    }
    const detalle = m.detalle?.startsWith('ESTIMADO') ? m.detalle : undefined
    if (rotulo === m.rotulo && detalle === m.detalle) return m
    const limpio: RenglonDelRecibo = { ...m, rotulo }
    if (detalle) limpio.detalle = detalle
    else delete limpio.detalle
    return limpio
  })
}

/**
 * ¿El neto del banco es estimado? Sólo lo es cuando la línea lo dice (`origenNeto` conceptos/estimado): un neto
 * escrito a mano o el del recibo del estudio no se marcan. Sin modelo de sueldo (mensual, cerrada) no hay estimación
 * que declarar: el banco viene sellado o liquidado por otro camino.
 */
const bancoEstimado = (l: LineaConOverrides): boolean =>
  l.sueldo?.origenNeto === 'estimado' || l.sueldo?.origenNeto === 'conceptos'

/**
 * REIMPRIMIR UN RECIBO YA SELLADO con el banco junto (los RP de la Q2-09 salieron antes de esta regla). Parte el
 * renglón del banco sellado en neto del estudio + saldo, SIN tocar ningún importe. Sólo lo hace si las cuentas cierran
 * al centavo (`banco = neto + saldo`): si el neto del estudio no está o no cierra, el papel sale como se selló, porque
 * inventar un desglose sobre un papel que la persona ya firmó sería peor que dejarlo.
 */
export function desglosarBancoSellado(
  medios: RenglonDelRecibo[],
  d: { netoDelEstudio: number | null; arrastre: { importe: number; periodoOrigen: string } | null },
): RenglonDelRecibo[] {
  const i = medios.findIndex((m) => !m.sub && m.rotulo === ROTULO.banco)
  const banco = i >= 0 ? medios[i].importe : null
  if (i < 0 || banco == null || d.netoDelEstudio == null) return medios
  if (medios.some((m) => m.sub && m.rotulo === ROTULO_SUB.reciboDeSueldo)) return medios
  const resta = d.arrastre && d.arrastre.importe > 0 ? r2(d.arrastre.importe) : 0
  const neto = r2(d.netoDelEstudio)
  const residuo = r2(banco - resta - neto)
  if (resta === 0 && residuo === 0) return medios
  const sal = [...medios]
  sal.splice(i + 1, 0, ...desgloseDelBanco(neto, resta, d.arrastre?.periodoOrigen ?? '', residuo))
  return sal
}

export function armarRecibo(l: LineaConOverrides, e: EleccionDelRecibo, _fmt: (n: number) => string, mensual = false): ReciboArmado {
  const d = conceptosDisponibles(l, mensual)
  const horas: RenglonDelRecibo[] = []
  if (e.horas && d.horas == null) {
    const hs = horasDeLaQuincena(l)
    // SIN IMPORTE NI $/H: el importe por hora abriría el reparto que este papel no dice. Lo que se firma es
    // cuántas horas trabajó y cuánta plata recibió.
    horas.push({ rotulo: ROTULO.horas, horas: hs, detalle: null, importe: null })
  }
  // El reparto va DEBAJO del total y sangrado: son las partes de la cifra de arriba, no dos renglones más.
  if (e.horasRecibo && d.horasRecibo == null) {
    horas.push({ rotulo: ROTULO.horasRecibo, horas: horasPorRecibo(l), detalle: null, importe: null, sub: e.horas && d.horas == null })
  }
  if (e.horasFuera && d.horasFuera == null) {
    horas.push({ rotulo: ROTULO.horasFuera, horas: horasFueraDeRecibo(l), detalle: null, importe: null, sub: e.horas && d.horas == null })
  }

  const m = medios(l, mensual)
  const renglones: RenglonDelRecibo[] = []
  // Lo ya cobrado de esta quincena, cuando la línea no tiene modelo blanco + negro: va entero y arriba.
  if (e.pagado && m.previos.length > 1) renglones.push(...m.previos)
  const elegidos: (number | null)[] = []
  let estimado = false
  for (const [clave, rotulo] of [['banco', ROTULO.banco], ['efectivo', ROTULO.efectivo]] as const) {
    if (!e[clave]) continue
    const x = m[clave]
    const restaDe = clave === 'banco' ? restaDelBanco(l) : null
    const resta = restaDe?.importe ?? 0
    const estimadoAca = clave === 'banco' && x.total != null && Math.abs(x.total) >= 0.005 && bancoEstimado(l)
    if (estimadoAca) estimado = true
    const papel = clave === 'efectivo' ? efectivoDelPapel(l, mensual, x.total, x.pagado) : null
    const importe = papel?.total ?? x.total
    renglones.push({
      rotulo, importe,
      ...(estimadoAca ? { detalle: 'ESTIMADO: todavía no hay recibo del estudio' } : {}),
    })
    elegidos.push(importe)
    if (clave === 'banco' && x.total != null) {
      const estudio = netoDelEstudio(l)
      const neto = estudio ?? r2(x.total - resta)
      const residuo = r2(x.total - resta - neto)
      if (resta > 0 || residuo !== 0) renglones.push(...desgloseDelBanco(r2(neto), resta, restaDe?.periodoOrigen ?? '', residuo))
    }
    if (e.pagado && x.pagado != null) {
      renglones.push({ rotulo: 'ya pagado', importe: x.pagado, sub: true })
      const absorbido = clave === 'banco' ? absorbidoPor(m.absorbido, clave) : null
      if (absorbido) renglones.push(absorbido)
      // COBRÓ DE MÁS: el papel lo dice, no lo esconde detrás de un «resta $ 0» (auditoría 22/09/2026).
      if (m.excedente?.lado === clave && m.excedente.importe > 0) {
        renglones.push({ rotulo: 'cobró de más', importe: m.excedente.importe, sub: true })
      }
      renglones.push({ rotulo: 'resta', importe: papel?.resta ?? x.resta, sub: true })
    }
    // LO PAGADO DE MÁS POR BANCO se dice donde ocurrió, exacto y al final de esa sección, y suma al total: el cuadro lo
    // descuenta del efectivo, y así el efectivo del papel queda redondo sin perder esos centavos.
    if (clave === 'banco' && m.absorbido?.lado === 'banco' && m.absorbido.importe > 0) {
      renglones.push({ rotulo: 'pagado de más en banco', importe: m.absorbido.importe, sub: true })
      elegidos.push(m.absorbido.importe)
    }
  }
  const total = elegidos.length === 0 || elegidos.some((v) => v == null)
    ? null
    : Math.round(elegidos.reduce<number>((a, v) => a + (v as number), 0) * 100) / 100
  return { horas, medios: renglones, total, estimado }
}
