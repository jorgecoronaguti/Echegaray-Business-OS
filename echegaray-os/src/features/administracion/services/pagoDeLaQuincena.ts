// LO QUE SE LE PAGÓ DE VERDAD, Y LO QUE FALTA — dueño, 15/09/2026.
//
// Textual: *«necesito al lado de banco y negro lo que se le ha pagado efectivamente y que vaya restando al total
// o incrementando en el otro llegado el caso; así no sirve, rehacer — pésimo: no considera adelantos en efectivo
// y resta del efectivo total»*.
//
// ═══ QUÉ ESTABA MAL, EN UNA ORACIÓN ═══
//
// El cuadro tenía «Adelanto efectivo» como una columna que se RESTABA de «Total efectivo». Eso trata al adelanto
// como un descuento del sueldo y no como lo que es —PLATA QUE YA SE ENTREGÓ— y deja tres preguntas sin lugar
// donde vivir: cuánto se le pagó, cuánto falta, y de qué lado falta. Con el adelanto restado del efectivo, a
// González Tobares (negro 133.650, adelanto 140.000) la pantalla le mostraba −6.350 en la columna del efectivo y
// nada más: ni que ya cobró de más, ni que esos 6.350 hay que descontárselos del banco.
//
// ═══ EL MODELO: DOS LADOS Y UN SOLO TOTAL ═══
//
//   BLANCO   banco            el neto del recibo (real o estimado)
//            pagado banco     lo transferido de verdad: adelantos por banco, embargos, giros registrados
//            saldo banco      banco − pagado banco
//
//   NEGRO    negro            lo que el recibo no paga
//            pagado efectivo  adelantos en efectivo + lo entregado en mano
//            saldo efectivo   negro − pagado efectivo
//
// ═══ UN LADO PAGADO DE MÁS NO SE PIERDE: PASA AL OTRO ═══
//
// Es la parte que el dueño pidió con «o incrementando en el otro llegado el caso». La persona cobra UN sueldo; el
// canal es una decisión de tesorería, no dos deudas separadas. Por eso el saldo que manda es el total:
//
//   saldo total = (banco + negro) − (pagado banco + pagado efectivo)
//
// y lo que la pantalla pide pagar HOY reparte ese saldo respetando el exceso del otro lado:
//
//   a pagar en efectivo = max(0, saldo efectivo + min(0, saldo banco))
//   a pagar por banco   = max(0, saldo banco   + min(0, saldo efectivo))
//
// Los saldos por lado SIGUEN PUBLICÁNDOSE en negativo: esconder el exceso detrás del neteo borraría la evidencia
// de que alguien cobró de más por un canal, que es exactamente lo que hay que ver para corregirlo.
//
// ═══ NULL NO ES CERO ═══
//
// Sin negro (Oficina, una final, una foto sellada sin recibo) no hay saldo que afirmar: `null`. Un cero diría
// «no le falta nada», y eso es una afirmación que nadie hizo.

const r2 = (n: number): number => Math.round(n * 100) / 100

const suma = (v: number | null | undefined): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export interface EntradaDePago {
  /** Lo que le corresponde por banco: el neto del recibo. `null` = no se pudo afirmar. */
  banco: number | null
  /** Lo que le corresponde en negro. `null` = fuera del modelo. */
  negro: number | null
  /** Lo transferido de verdad. Ausente = nada pagado todavía; NUNCA se deduce del banco. */
  pagadoBanco?: number | null
  /** Lo entregado en efectivo de verdad (adelantos incluidos). */
  pagadoEfectivo?: number | null
}

export interface PagoDeLaLinea {
  banco: number | null
  negro: number | null
  /** banco + negro. `null` si falta alguno de los dos. */
  total: number | null
  pagadoBanco: number
  pagadoEfectivo: number
  pagado: number
  /**
   * LO QUE FALTA PAGAR POR ESE LADO, YA COMPENSADO (dueño, 16/09/2026: «si digo que se le pagó el 100 % por
   * efectivo o por transferencia me marca que debo de un lado y del otro»): el exceso de un lado se descuenta
   * del otro antes de mostrar nada. Pagado todo por un lado → los dos saldos en 0.
   */
  saldoBanco: number | null
  saldoEfectivo: number | null
  /** El saldo crudo de cada lado (banco − pagado banco; negro − pagado efectivo), antes de compensar. */
  saldoBancoBruto: number | null
  saldoEfectivoBruto: number | null
  saldoTotal: number | null
  /** Lo que hay que entregar en mano HOY, con el exceso del banco ya descontado. `null` sin modelo. */
  aPagarEfectivo: number | null
  /** Lo que hay que girar HOY, con el exceso del efectivo ya descontado. `null` sin modelo. */
  aPagarBanco: number | null
  /** Cobró de más EN TOTAL (pagado > banco + negro). `null` = no. La pantalla lo pinta en ámbar con su explicación. */
  excedente: { lado: 'banco' | 'efectivo'; importe: number } | null
  /** Un lado pagado de más cuyo exceso se descontó del otro. `null` = nada que absorber. Es informativo, no ámbar. */
  absorbido: { lado: 'banco' | 'efectivo'; importe: number } | null
}

/**
 * LOS SALDOS DE UNA LÍNEA. Función pura: decide plata que se entrega en mano y tiene que poder probarse sin base.
 */
export function pagoDeLaLinea(e: EntradaDePago): PagoDeLaLinea {
  const banco = e.banco == null ? null : r2(e.banco)
  const negro = e.negro == null ? null : r2(e.negro)
  const pagadoBanco = r2(suma(e.pagadoBanco))
  const pagadoEfectivo = r2(suma(e.pagadoEfectivo))
  const pagado = r2(pagadoBanco + pagadoEfectivo)
  const saldoBancoBruto = banco == null ? null : r2(banco - pagadoBanco)
  const saldoEfectivoBruto = negro == null ? null : r2(negro - pagadoEfectivo)
  const total = banco == null || negro == null ? null : r2(banco + negro)
  const saldoTotal = total == null ? null : r2(total - pagado)
  const completo = saldoBancoBruto != null && saldoEfectivoBruto != null
  // LA COMPENSACIÓN: el exceso de un lado baja el saldo del otro. Con los dos lados, lo que se muestra por lado
  // es lo que falta pagar por ahí HOY; sin uno de los dos (sin modelo), el bruto es lo único que se puede decir.
  const saldoBanco = completo ? Math.max(0, r2(saldoBancoBruto + Math.min(0, saldoEfectivoBruto))) : saldoBancoBruto
  const saldoEfectivo = completo ? Math.max(0, r2(saldoEfectivoBruto + Math.min(0, saldoBancoBruto))) : saldoEfectivoBruto
  return {
    banco, negro, total, pagadoBanco, pagadoEfectivo, pagado, saldoBanco, saldoEfectivo, saldoBancoBruto, saldoEfectivoBruto, saldoTotal,
    aPagarEfectivo: completo ? saldoEfectivo : null,
    aPagarBanco: completo ? saldoBanco : null,
    excedente: excedenteDe(saldoTotal, saldoBancoBruto, saldoEfectivoBruto),
    absorbido: absorbidoDe(saldoTotal, saldoBancoBruto, saldoEfectivoBruto),
  }
}

/** Cobró de más EN TOTAL: el importe es lo que sobra sobre banco + negro, del lado que más se pasó. */
function excedenteDe(saldoTotal: number | null, saldoBanco: number | null, saldoEfectivo: number | null): PagoDeLaLinea['excedente'] {
  if (saldoTotal == null || saldoTotal >= 0) return null
  const banco = saldoBanco != null && saldoBanco < 0 ? -saldoBanco : 0
  const efectivo = saldoEfectivo != null && saldoEfectivo < 0 ? -saldoEfectivo : 0
  return { lado: banco >= efectivo ? 'banco' : 'efectivo', importe: r2(-saldoTotal) }
}

/** Un lado pagado de más que el otro absorbió entero (el total no se pasó). Informativo. */
function absorbidoDe(saldoTotal: number | null, saldoBanco: number | null, saldoEfectivo: number | null): PagoDeLaLinea['absorbido'] {
  if (saldoTotal == null || saldoTotal < 0) return null
  if (saldoBanco != null && saldoBanco < 0) return { lado: 'banco', importe: r2(-saldoBanco) }
  if (saldoEfectivo != null && saldoEfectivo < 0) return { lado: 'efectivo', importe: r2(-saldoEfectivo) }
  return null
}

/** El `title` de un saldo negativo. Dice lo que pasa con la plata, no «negativo». */
export function avisoDeExcedente(p: Pick<PagoDeLaLinea, 'excedente' | 'absorbido'>): string | null {
  if (p.excedente) return `cobró de más: $${p.excedente.importe.toLocaleString('es-AR')} por encima de banco + negro`
  if (p.absorbido) {
    const otro = p.absorbido.lado === 'banco' ? 'del efectivo' : 'del banco'
    return `pagado de más por ${p.absorbido.lado}: $${p.absorbido.importe.toLocaleString('es-AR')} se descuentan ${otro}`
  }
  return null
}

export interface TotalesDePago {
  banco: number
  negro: number
  total: number
  pagadoBanco: number
  pagadoEfectivo: number
  pagado: number
  saldoBanco: number
  saldoEfectivo: number
  saldoTotal: number
  aPagarEfectivo: number
  aPagarBanco: number
  /** Cuántas filas no tienen saldo que afirmar (sin negro, sin neto). No suman y el pie lo dice. */
  sinSaldo: number
}

/**
 * EL PIE, COLUMNA POR COLUMNA. Suma exactamente lo que muestran las filas que recibe.
 *
 * LAS FILAS SIN SALDO NO SUMAN COMO CERO: se cuentan. Un pie que las contara daría un total que parece
 * completo y le falta gente — el mismo defecto que `totalesDelEspejo` ya evita con «sin tarifa».
 */
export function totalesDePago(pagos: readonly PagoDeLaLinea[]): TotalesDePago {
  const t: TotalesDePago = {
    banco: 0, negro: 0, total: 0, pagadoBanco: 0, pagadoEfectivo: 0, pagado: 0,
    saldoBanco: 0, saldoEfectivo: 0, saldoTotal: 0, aPagarEfectivo: 0, aPagarBanco: 0, sinSaldo: 0,
  }
  for (const p of pagos) {
    // LO PAGADO SUMA SIEMPRE, tenga o no saldo: la plata salió igual y esconderla sería peor que no sumarla.
    t.pagadoBanco += p.pagadoBanco
    t.pagadoEfectivo += p.pagadoEfectivo
    t.pagado += p.pagado
    if (p.saldoTotal == null) { t.sinSaldo++; continue }
    t.banco += suma(p.banco)
    t.negro += suma(p.negro)
    t.total += suma(p.total)
    t.saldoBanco += suma(p.saldoBanco)
    t.saldoEfectivo += suma(p.saldoEfectivo)
    t.saldoTotal += p.saldoTotal
    t.aPagarEfectivo += suma(p.aPagarEfectivo)
    t.aPagarBanco += suma(p.aPagarBanco)
  }
  for (const k of ['banco', 'negro', 'total', 'pagadoBanco', 'pagadoEfectivo', 'pagado',
    'saldoBanco', 'saldoEfectivo', 'saldoTotal', 'aPagarEfectivo', 'aPagarBanco'] as const) {
    t[k] = r2(t[k])
  }
  return t
}
