// JORNALEROS Y MENSUALES: DOS CUADROS, DOS SUBTOTALES Y UN TOTAL QUE CIERRA (dueño, 17/09/2026).
//
// *«el arreglo de ui que se hizo en liq de hs está roto y no contempló cuestiones de los dos tipos de empleados que
// aparecen, rehacer»*. El cuadro de la quincena metía a los dos jefes de obra en la misma grilla que los obreros: sus
// celdas de «recibo blanco» quedaban vacías (un sueldo mensual no se arma con horas × $/h de categoría) y el pie los
// sumaba donde no correspondía. Medido en la captura de 16–30/09:
//
//   «Efectivo redondeado $3.600.000»   = los dos sueldos mensuales enteros, sugeridos como billetes: el redondeo
//                                        sumaba `enEfectivo` de TODAS las filas, y a un jefe sin recibo cargado el
//                                        efectivo le da el sueldo completo.
//   «el total no cierra por $3.600.000» `cierreDeTotales` exige Total = Banco + Negro, pero el Total traía los
//                                        sueldos mensuales y el Negro no (con razón): la diferencia era exactamente
//                                        la suma de los mensuales, no un error de nadie.
//
// Las dos cosas son la misma causa: sumar juntas filas cuyas columnas significan cosas distintas. Acá se separan una
// vez, y cada cuadro suma lo suyo.
//
// ═══ QUIÉN ES MENSUAL ═══
//
// Lo decide el cuadro, no esta pantalla: `armarCuadros` pone en Oficina a quien es jefe de obra o tiene neto mensual
// vigente (`cobraPorMes`), y `modalidadDe('oficina')` es `mensual`. Acá se lee esa modalidad; una segunda regla
// («si tiene $/h», «si el puesto dice jefe») daría un jefe mensual en un cuadro y por hora en el otro, que es el
// defecto que `cobroMensual.ts` ya pagó el 15/09.
//
// ═══ EL PAGO DE UN MENSUAL, SIN INVENTAR EL REPARTO ═══
//
// Regla del dueño para Oficina (01/09/2026, opción A): el recibo va por banco y el efectivo es lo que queda hasta el
// sueldo. Sin recibo cargado NO se sabe cuánto va por cada canal —y un sugerido de billetes por el sueldo entero
// mandaría a entregar en mano lo que después sale por banco—, pero SÍ se sabe cuánto falta en total: sueldo − pagado.
// Por eso los lados quedan `null` («falta recibo») y el saldo total se afirma igual.
//
// Es una lectura: no escribe nada, y `linea.pago` (el que usan «Pagar», la Caja y el legajo) no cambia.
//
// Puro: sin base, sin React. Tests en `liquidacionPorTipo.test.ts`.

import { cierreDeLaFila, cierreDeTotales } from './cuadroDeJornales.ts'
import { efectivoMostrado, saldoRedondeado } from './efectivoRedondeado.ts'
import { totalesDelEspejo, type FilaDelEspejo, type TotalesDelEspejo } from './espejoDeJornales.ts'
import type { LineaConOverrides } from './liquidacionOverrides.ts'
import type { GrupoLiquidacion, ModalidadDeLiquidacion } from './liquidacionQuincena.ts'
import { pagoDeLaLinea, type PagoDeLaLinea } from './pagoDeLaQuincena.ts'

const r2 = (n: number): number => Math.round(n * 100) / 100

export type TipoDeLiquidacion = 'jornalero' | 'mensual'

/**
 * Mensual = cuadro Oficina o modalidad mensual (son lo mismo por `modalidadDe`; se miran los dos para que un cambio
 * en uno no mande a un jefe a la grilla por hora en silencio). Todo lo demás —obreros y, si apareciera, una final—
 * va con los jornaleros: una final no cobra por mes y sus celdas ya dicen «sin modelo».
 */
export function tipoDeLiquidacion(f: { grupo: GrupoLiquidacion; linea: { modalidad: ModalidadDeLiquidacion } }): TipoDeLiquidacion {
  return f.grupo === 'oficina' || f.linea.modalidad === 'mensual' ? 'mensual' : 'jornalero'
}

export function separarPorTipo<T extends { grupo: GrupoLiquidacion; linea: { modalidad: ModalidadDeLiquidacion } }>(
  filas: readonly T[],
): { jornaleros: T[]; mensuales: T[] } {
  const jornaleros: T[] = []
  const mensuales: T[] = []
  for (const f of filas) (tipoDeLiquidacion(f) === 'mensual' ? mensuales : jornaleros).push(f)
  return { jornaleros, mensuales }
}

type LineaDelMensual = Pick<LineaConOverrides, 'cobra' | 'porBanco' | 'reciboNeto' | 'pagadoBanco' | 'pagadoEfectivo'>
  & { manual: Pick<LineaConOverrides['manual'], 'porBanco'> }

export interface PagoDelMensual extends PagoDeLaLinea {
  /** El sueldo del mes (`cobra`: neto mensual, importe cargado o escrito a mano). `null` = no cargado. */
  sueldo: number | null
  /** De dónde sale el banco: escrito a mano, el recibo del estudio, o el giro del extracto. `null` = sin recibo. */
  origenBanco: 'manual' | 'recibo' | 'giro' | null
}

/** El banco de un mensual: lo escrito a mano manda; si no, el recibo liquidado (aunque no se haya girado todavía). */
function bancoDelMensual(l: LineaDelMensual): { banco: number | null; origen: PagoDelMensual['origenBanco'] } {
  if (l.manual.porBanco) return { banco: l.porBanco, origen: 'manual' }
  if (l.reciboNeto != null) return { banco: r2(l.reciboNeto), origen: 'recibo' }
  if (l.porBanco > 0) return { banco: l.porBanco, origen: 'giro' }
  return { banco: null, origen: null }
}

export function pagoDelMensual(l: LineaDelMensual): PagoDelMensual {
  const sueldo = l.cobra == null ? null : r2(l.cobra)
  const { banco, origen } = bancoDelMensual(l)
  if (banco != null) {
    const negro = sueldo == null ? null : r2(sueldo - banco)
    const p = pagoDeLaLinea({ banco, negro, pagadoBanco: l.pagadoBanco, pagadoEfectivo: l.pagadoEfectivo })
    return { ...p, sueldo, origenBanco: origen }
  }
  // SIN RECIBO: los lados no se pueden afirmar; el total sí. Un pagado mayor al sueldo es un excedente igual.
  const p = pagoDeLaLinea({ banco: null, negro: null, pagadoBanco: l.pagadoBanco, pagadoEfectivo: l.pagadoEfectivo })
  const saldoTotal = sueldo == null ? null : r2(sueldo - p.pagado)
  const excedente = saldoTotal != null && saldoTotal < 0
    ? { lado: p.pagadoBanco >= p.pagadoEfectivo ? 'banco' as const : 'efectivo' as const, importe: -saldoTotal }
    : null
  return { ...p, total: sueldo, saldoTotal, excedente, sueldo, origenBanco: null }
}

/**
 * EL EFECTIVO DEL QUE SALE EL SUGERIDO DE «EFECT. RED.», el mismo para la celda y para el pie. Antes la celda usaba
 * `aPagarEfectivo` y el pie `enEfectivo`: con un adelanto cargado los dos números no coincidían.
 */
export function efectivoDelRedondeo(f: FilaDelEspejo): number | null {
  if (tipoDeLiquidacion(f) === 'mensual') return pagoDelMensual(f.linea).aPagarEfectivo
  return f.linea.pago.aPagarEfectivo ?? f.linea.enEfectivo
}

const redondeoDe = (filas: readonly FilaDelEspejo[]): number =>
  r2(filas.reduce((s, f) => s + (efectivoMostrado({ efectivoRedondeado: f.linea.efectivoRedondeado, enEfectivo: efectivoDelRedondeo(f) }).valor ?? 0), 0))

const saldoRedDe = (saldos: readonly (number | null)[]): number =>
  saldos.reduce<number>((s, v) => s + (saldoRedondeado(v).valor ?? 0), 0)

/** Días trabajados, horas y ausencias: referencia del mensual, que no cobra por ellas. */
export function asistenciaDeReferencia(f: Pick<FilaDelEspejo, 'celdas' | 'linea'>): { dias: number; horas: number | null; ausencias: number; licencias: number } {
  return {
    dias: f.celdas.filter((c) => c.marca !== 'ausencia' && c.marca !== 'licencia' && (c.horas ?? 0) > 0).length,
    horas: f.linea.horas,
    ausencias: f.celdas.filter((c) => c.marca === 'ausencia').length,
    licencias: f.celdas.filter((c) => c.marca === 'licencia').length,
  }
}

export interface TotalesDeJornaleros extends TotalesDelEspejo {
  redondeo: number
  saldoRedondeado: number
  /** Cobra de las filas que suman y no tienen saldo que afirmar, menos lo que se les pagó. */
  sinSaldoImporte: number
}

export function totalesDeJornaleros(filas: readonly FilaDelEspejo[]): TotalesDeJornaleros {
  const t = totalesDelEspejo(filas)
  const sinSaldoImporte = r2(filas
    .filter((f) => f.linea.cobra != null && !f.linea.sinTarifa && f.linea.pago.saldoTotal == null)
    .reduce((s, f) => s + (f.linea.cobra ?? 0) - f.linea.pago.pagado, 0))
  return {
    ...t, sinSaldoImporte,
    redondeo: redondeoDe(filas),
    saldoRedondeado: saldoRedDe(filas.map((f) => f.linea.pago.saldoTotal)),
  }
}

export interface TotalesDeMensuales {
  personas: number
  /** Suma de los sueldos cargados. Los que faltan se cuentan en `sinSueldo`, no suman como cero. */
  sueldo: number
  sinSueldo: number
  /** Lo que va por banco de quien tiene recibo; `sinRecibo` cuenta a los demás. */
  banco: number
  efectivo: number
  sinRecibo: number
  pagadoBanco: number
  pagadoEfectivo: number
  pagado: number
  saldoTotal: number
  redondeo: number
  saldoRedondeado: number
  /** Filas cuya cadena escrita a mano no cierra (`cierreDeLaFila`), y por cuánto en total. */
  noCierran: number
  diferencia: number
}

export function totalesDeMensuales(filas: readonly FilaDelEspejo[]): TotalesDeMensuales {
  const t: TotalesDeMensuales = {
    personas: filas.length, sueldo: 0, sinSueldo: 0, banco: 0, efectivo: 0, sinRecibo: 0,
    pagadoBanco: 0, pagadoEfectivo: 0, pagado: 0, saldoTotal: 0, redondeo: redondeoDe(filas), saldoRedondeado: 0,
    noCierran: 0, diferencia: 0,
  }
  const saldos: (number | null)[] = []
  for (const f of filas) {
    const p = pagoDelMensual(f.linea)
    const cierre = cierreDeLaFila(f.linea)
    if (cierre && !cierre.cierra) { t.noCierran++; t.diferencia += cierre.diferencia }
    if (p.sueldo == null) { t.sinSueldo++; continue }
    t.sueldo += p.sueldo
    // LO PAGADO SE SUMA SÓLO DONDE HAY SUELDO: así Sueldo − Pagado = Saldo se puede comprobar fila por fila.
    t.pagadoBanco += p.pagadoBanco
    t.pagadoEfectivo += p.pagadoEfectivo
    t.pagado += p.pagado
    t.saldoTotal += p.saldoTotal ?? 0
    saldos.push(p.saldoTotal)
    if (p.banco == null) t.sinRecibo++
    else { t.banco += p.banco; t.efectivo += p.negro ?? 0 }
  }
  for (const k of ['sueldo', 'banco', 'efectivo', 'pagadoBanco', 'pagadoEfectivo', 'pagado', 'saldoTotal', 'diferencia'] as const) t[k] = r2(t[k])
  t.saldoRedondeado = saldoRedDe(saldos)
  return t
}

export interface CausaDeDescuadre { causa: string; importe: number }

export interface TotalGeneral {
  total: number
  pagado: number
  saldo: number
  redondeo: number
  saldoRedondeado: number
  /** Total − Pagado − Saldo. 0 (±$1) = cierra. */
  descuadre: number
  cierra: boolean
  /** Por qué no cierra, con el importe de cada causa. Vacío cuando cierra. */
  causas: CausaDeDescuadre[]
}

/**
 * EL TOTAL GENERAL: jornaleros (la quincena) + mensuales (el sueldo del mes). Cierra cuando Total − Pagado = Saldo.
 * Lo que no cierra se dice con su causa: filas que suman al total y no tienen saldo que afirmar, o una cadena escrita
 * a mano que ya no da Banco + Negro. Lo que quede sin explicar se dice como tal, no se reparte entre las causas.
 */
export function totalGeneral(j: TotalesDeJornaleros, m: TotalesDeMensuales): TotalGeneral {
  const total = r2(j.cobra + m.sueldo)
  const pagado = r2(j.pago.pagado + m.pagado)
  const saldo = r2(j.pago.saldoTotal + m.saldoTotal)
  const descuadre = r2(total - pagado - saldo)
  const causas: CausaDeDescuadre[] = []
  if (Math.abs(descuadre) > 1) {
    if (Math.abs(j.sinSaldoImporte) > 1) {
      causas.push({ causa: `${j.pago.sinSaldo} jornalero${j.pago.sinSaldo === 1 ? '' : 's'} sin saldo que afirmar`, importe: j.sinSaldoImporte })
    }
    const resto = r2(descuadre - j.sinSaldoImporte)
    if (Math.abs(resto) > 1) {
      const cierre = cierreDeTotales(j)
      causas.push({
        causa: cierre?.cierra === false ? 'jornaleros: total escrito a mano distinto de banco + negro' : 'sin causa identificada',
        importe: resto,
      })
    }
  }
  return {
    total, pagado, saldo, descuadre, cierra: Math.abs(descuadre) <= 1, causas,
    redondeo: r2(j.redondeo + m.redondeo), saldoRedondeado: j.saldoRedondeado + m.saldoRedondeado,
  }
}
