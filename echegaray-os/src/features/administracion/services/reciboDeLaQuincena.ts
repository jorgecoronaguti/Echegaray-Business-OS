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
import { pagoDelMensual } from './liquidacionPorTipo.ts'

export type ConceptoDelRecibo = 'horas' | 'banco' | 'efectivo' | 'pagado'

export interface EleccionDelRecibo {
  /** El TOTAL de horas de la quincena. Nunca el reparto entre blanco y negro: ver el encabezado. */
  horas: boolean
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
}

/**
 * Lo que se puede tildar para esta línea, y por qué no, cuando no se puede.
 *
 * `mensual` lo decide el llamador (`tipoDeLiquidacion`): sin él, a un jornalero de una quincena CERRADA —que
 * tampoco trae `sueldo`— se le decía «cobra por mes», que es falso (auditoría 22/09/2026).
 */
export function conceptosDisponibles(l: LineaConOverrides, mensual = false): Record<ConceptoDelRecibo, string | null> {
  const horas = horasDeLaQuincena(l)
  return {
    horas: horas == null ? (mensual ? 'cobra por mes: no se liquida por hora' : 'sin horas cargadas en la quincena') : null,
    banco: null,
    efectivo: null,
    pagado: null,
  }
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
  return { horas: d.horas == null, banco: true, efectivo: true, pagado: false }
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

export function armarRecibo(l: LineaConOverrides, e: EleccionDelRecibo, fmt: (n: number) => string, mensual = false): ReciboArmado {
  const d = conceptosDisponibles(l, mensual)
  const horas: RenglonDelRecibo[] = []
  if (e.horas && d.horas == null) {
    const hs = horasDeLaQuincena(l)
    // SIN IMPORTE NI $/H: el importe por hora abriría el reparto que este papel no dice. Lo que se firma es
    // cuántas horas trabajó y cuánta plata recibió.
    horas.push({ rotulo: 'Horas trabajadas', horas: hs, detalle: null, importe: null })
  }

  const m = medios(l, mensual)
  const renglones: RenglonDelRecibo[] = []
  // Lo ya cobrado de esta quincena, cuando la línea no tiene modelo blanco + negro: va entero y arriba.
  if (e.pagado && m.previos.length > 1) renglones.push(...m.previos)
  const elegidos: (number | null)[] = []
  for (const [clave, rotulo] of [['banco', 'Depósito en banco'], ['efectivo', 'Efectivo']] as const) {
    if (!e[clave]) continue
    const x = m[clave]
    renglones.push({ rotulo, importe: x.total })
    elegidos.push(x.total)
    if (e.pagado && x.pagado != null) {
      renglones.push({ rotulo: 'ya pagado', importe: x.pagado, sub: true })
      const absorbido = absorbidoPor(m.absorbido, clave)
      if (absorbido) renglones.push(absorbido)
      // COBRÓ DE MÁS: el papel lo dice, no lo esconde detrás de un «resta $ 0» (auditoría 22/09/2026).
      if (m.excedente?.lado === clave && m.excedente.importe > 0) {
        renglones.push({ rotulo: 'cobró de más', importe: m.excedente.importe, sub: true })
      }
      renglones.push({ rotulo: 'resta', importe: x.resta, sub: true })
    }
  }
  const total = elegidos.length === 0 || elegidos.some((v) => v == null)
    ? null
    : Math.round(elegidos.reduce<number>((a, v) => a + (v as number), 0) * 100) / 100
  return { horas, medios: renglones, total }
}
