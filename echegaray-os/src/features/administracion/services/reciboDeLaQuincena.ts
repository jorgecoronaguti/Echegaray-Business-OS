// EL RECIBO QUE SE ARMA DESDE EL PANEL DE LA PERSONA — qué lleva, según lo que se tilda.
//
// Dueño, 22/09/2026: *«tiene q ser algo q aparezca al hacerle click al nombre de cada uno, q aparece en el
// desplegable de la derecha lo q se considera en blanco. tiene q haber un boton q sea "recibo" y se tiene q
// abrir la opcion de ir armando lo q se quiere imprimir o guardar en ese recibo, hs en blanco, en negro
// efectivo deposito en banco»*. Y: *«no hace falta quincena cerrada»*.
//
// Ni una cuenta nueva: cada renglón es una cifra que el panel ya muestra (la línea, `sueldo`, `pago`). Lo
// único que se suma es el total de lo que se eligió imprimir, y sólo si todo lo elegido tiene número: un
// «sin dato» no se imprime como $ 0.

import type { LineaConOverrides } from './liquidacionOverrides'
import { pagoDelMensual } from './liquidacionPorTipo.ts'

export type ConceptoDelRecibo = 'blanco' | 'negro' | 'banco' | 'efectivo' | 'pagado'

export interface EleccionDelRecibo {
  blanco: boolean
  negro: boolean
  banco: boolean
  efectivo: boolean
  /** Debajo de cada medio: lo ya pagado (adelantos) y lo que resta. */
  pagado: boolean
}

export interface RenglonDelRecibo {
  rotulo: string
  detalle?: string
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
  const s = l.sueldo
  const sinHoras = s ? null : (mensual
    ? 'cobra por mes: no tiene horas en blanco y en negro'
    : 'esta quincena no guarda el detalle de blanco y negro')
  return {
    blanco: sinHoras ?? (s!.horasBlanco == null ? 'sin horas de recibo cargadas' : null),
    negro: sinHoras ?? (s!.horasNegro == null ? 'sin horas en negro calculadas' : null),
    banco: null,
    efectivo: null,
    pagado: null,
  }
}

/** Por defecto va todo lo que la línea puede decir. */
export function eleccionInicial(l: LineaConOverrides, mensual = false): EleccionDelRecibo {
  const d = conceptosDisponibles(l, mensual)
  return { blanco: d.blanco == null, negro: d.negro == null, banco: true, efectivo: true, pagado: false }
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
      excedente: p.excedente, absorbido: p.absorbido,
    }
  }
  if (mensual) {
    const p = pagoDelMensual(l as Parameters<typeof pagoDelMensual>[0])
    return {
      banco: { total: p.banco, pagado: p.pagadoBanco, resta: p.saldoBanco },
      efectivo: { total: p.negro, pagado: p.pagadoEfectivo, resta: p.saldoEfectivo },
      excedente: p.excedente, absorbido: p.absorbido,
    }
  }
  const efectivo = l.cobra == null ? null : Math.round((l.cobra - l.porBanco) * 100) / 100
  return {
    banco: { total: l.porBanco, pagado: 0, resta: l.porBanco },
    efectivo: { total: efectivo, pagado: Math.round(((l.adelanto ?? 0) + (l.yaTransferido ?? 0)) * 100) / 100, resta: l.enEfectivo },
    excedente: null, absorbido: null,
  }
}

/** Lo pagado de más por un lado que se descuenta del otro (`pago.absorbido`): va escrito debajo del que lo absorbe. */
function absorbidoPor(a: { lado: 'banco' | 'efectivo'; importe: number } | null, clave: 'banco' | 'efectivo'): RenglonDelRecibo | null {
  if (!a || a.lado === clave || !(a.importe > 0)) return null
  return { rotulo: `menos lo pagado de más en ${a.lado === 'banco' ? 'banco' : 'efectivo'}`, importe: -a.importe, sub: true }
}

export function armarRecibo(l: LineaConOverrides, e: EleccionDelRecibo, fmt: (n: number) => string, mensual = false): ReciboArmado {
  const d = conceptosDisponibles(l, mensual)
  const s = l.sueldo
  const horas: RenglonDelRecibo[] = []
  if (e.blanco && d.blanco == null && s) {
    horas.push({
      rotulo: 'Horas en blanco', horas: s.horasBlanco,
      // BRUTO, y dicho: el banco paga el NETO, y sin la palabra el papel parece no sumar.
      detalle: `${s.valorHoraCategoria == null ? hs(s.horasBlanco) : `${hs(s.horasBlanco)} × ${fmt(s.valorHoraCategoria)}/h`} · bruto`,
      importe: s.bruto,
    })
  }
  if (e.negro && d.negro == null && s) {
    horas.push({
      rotulo: 'Horas en negro', horas: s.horasNegro,
      detalle: s.valorHoraNegro == null ? hs(s.horasNegro) : `${hs(s.horasNegro)} × ${fmt(s.valorHoraNegro)}/h`,
      importe: s.negro,
    })
  }

  const m = medios(l, mensual)
  const renglones: RenglonDelRecibo[] = []
  const elegidos: (number | null)[] = []
  for (const [clave, rotulo] of [['banco', 'Depósito en banco'], ['efectivo', 'Efectivo']] as const) {
    if (!e[clave]) continue
    const x = m[clave]
    renglones.push({ rotulo, importe: x.total })
    elegidos.push(x.total)
    if (e.pagado) {
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
