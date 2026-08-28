// LOS CONTROLES DEL RESUMEN DE TARJETA — ARITMÉTICA, NO CONFIANZA.
//
// Un resumen mal leído no da error: da un número plausible. "1.090.924,47" leído con la columna
// corrida un par de caracteres devolvió CERO durante la primera corrida de este parser, y cero es un
// valor perfectamente creíble para un pago. Por eso ningún resumen entra a la base sin que estas
// identidades cierren: cada una cruza campos que el banco imprime en RENGLONES DISTINTOS, así que no
// pueden coincidir por casualidad.
//
// ═══ UN CONTROL QUE NO PUEDE DAR ROJO NO ES UN CONTROL ═══
//
// Es la trampa que ya se pagó en este repo: comparar una suma contra un total que uno mismo calculó
// como esa suma. Cierra siempre, y por eso no dice nada. Acá los totales de comparación son los que
// IMPRIME EL BANCO ("Total Consumos", "DEBITAREMOS…"), no los que calcula el parser. Donde el banco
// no publica un total —la tabla de cuotas a vencer no lo trae— el control se declara NO VERIFICABLE
// en vez de fabricarse uno tautológico.

import { verificarResumenTarjeta, verificarCuotasAVencer } from './banco-santander.mjs'
import { tcDeducido } from './tarjeta-resumen.mjs'

/** Redondeo al centavo. Sin esto, 0,1 + 0,2 arruina una identidad que en el papel cierra. */
const c = (x) => Math.round((Number(x) || 0) * 100) / 100
const sum = (l, f) => c(l.reduce((s, m) => s + (Number(f(m)) || 0), 0))

/** Un centavo de tolerancia: el banco redondea sus propias columnas y arrastra centavos por mes. */
export const CENTAVO = 0.01

/**
 * ¿LA SUMA DE LAS LÍNEAS DA EL TOTAL QUE IMPRIME EL BANCO?
 *
 * El control que caza una línea perdida al leer el PDF: si un consumo se salteó porque su renglón
 * tenía una forma que el parser no reconoce, la suma queda corta y esto lo grita. Es el equivalente
 * de la cadena de saldos del extracto.
 */
export function verificarTotalConsumos(p) {
  const cons = p.movimientos.filter((m) => m.tipo === 'consumo')
  const out = []
  for (const [moneda, campo, dec] of [['pesos', 'pesos', p.resumen.consumosPesosDeclarado], ['dólares', 'dolares', p.resumen.consumosDolaresDeclarado]]) {
    const suma = sum(cons, (m) => m[campo])
    if (dec == null) {
      out.push({ nombre: `total de consumos en ${moneda}`, estado: suma ? 'no_verificable' : 'ok', suma, declarado: null, diferencia: null, detalle: 'el resumen no imprime el total de esta moneda' })
      continue
    }
    const diferencia = c(suma - c(dec))
    out.push({ nombre: `total de consumos en ${moneda}`, estado: Math.abs(diferencia) <= CENTAVO ? 'ok' : 'falla', suma, declarado: c(dec), diferencia, detalle: `${cons.length} línea(s) de consumo` })
  }
  return out
}

/**
 * LA IDENTIDAD DEL DOCUMENTO ENTERO: saldo anterior + pagos + consumos + cargos = lo que se debita.
 *
 * Vale SIEMPRE, también cuando el saldo anterior no se canceló del todo —el caso en que la tarjeta
 * pasa a ser financiamiento— y por eso es la identidad principal. La versión que ya vivía en
 * `banco-santander.mjs` (consumos + sellos + sellos P + RG 5617 = a debitar) es un caso particular
 * de ésta: el de este resumen, donde el pago del 03/08 canceló exactamente el saldo anterior. Se
 * corre igual, abajo, porque cruza los cargos UNO POR UNO y ésta los cruza sumados.
 */
export function verificarADebitar(p) {
  const m = p.movimientos
  const out = []
  for (const [moneda, campo, declarado] of [['pesos', 'pesos', p.resumen.aDebitarPesos], ['dólares', 'dolares', p.resumen.aDebitarDolares]]) {
    if (declarado == null) {
      out.push({ nombre: `a debitar en ${moneda}`, estado: 'no_verificable', suma: null, declarado: null, diferencia: null, detalle: 'el resumen no trae la frase "DEBITAREMOS…" para esta moneda' })
      continue
    }
    const suma = sum(m, (x) => x[campo])
    const diferencia = c(suma - c(declarado))
    out.push({
      nombre: `a debitar en ${moneda}`,
      estado: Math.abs(diferencia) <= CENTAVO ? 'ok' : 'falla',
      suma,
      declarado: c(declarado),
      diferencia,
      detalle: 'saldo anterior + pagos + consumos + cargos',
    })
  }
  return out
}

/**
 * LA PERCEPCIÓN RG 5617 SE VERIFICA A SÍ MISMA, Y DE PASO VERIFICA LOS DÓLARES.
 *
 * El banco imprime la BASE entre paréntesis ("DB.RG 5617 30% ( 815850,03 )"). De ahí salen dos
 * controles independientes:
 *   · base × alícuota = el importe percibido;
 *   · base ÷ consumos en dólares = el tipo de cambio del cierre, y si da un número redondo al
 *     centavo es que las dos cifras describen el mismo hecho. O sea: el consumo en dólares queda
 *     controlado por un número escrito en pesos, en otro renglón.
 *
 * EL TC ES UN CÁLCULO, NO UN DATO: el resumen no lo imprime. Por eso se devuelve rotulado y NO se
 * usa para convertir nada — los dólares se debitan en dólares.
 */
export function verificarRG5617(p) {
  const rg = p.movimientos.find((m) => m.concepto === 'rg5617')
  if (!rg) return [{ nombre: 'percepción RG 5617', estado: 'no_verificable', detalle: 'este resumen no trae percepción' }]
  const alicuota = 0.30
  const esperado = c(rg.base * alicuota)
  const dif = c(esperado - c(rg.pesos))
  const usd = p.resumen.consumosDolares
  const tc = tcDeducido(rg.base, usd)
  return [
    { nombre: 'percepción RG 5617 = 30% de su base', estado: Math.abs(dif) <= CENTAVO ? 'ok' : 'falla', suma: esperado, declarado: c(rg.pesos), diferencia: dif, detalle: `base $${rg.base}` },
    // Este control no compara dos importes: comprueba que la base en PESOS y el consumo en DÓLARES
    // son el mismo hecho. Por eso no lleva `declarado` —no hay contra qué compararlo— y el número
    // que devuelve es el TC, que es un CÁLCULO y viaja rotulado como tal.
    { nombre: 'la base de la percepción explica el consumo en dólares', estado: tc && Number.isFinite(tc) ? 'ok' : 'no_verificable', suma: tc, declarado: null, diferencia: null, tcCierre: tc, detalle: tc ? `U$S ${usd} × ${tc} = $${c(rg.base)} · TC deducido, el resumen no lo imprime` : 'sin consumo en dólares' },
  ]
}

/**
 * EL PAGO DEL PERÍODO ANTERIOR, EXPLICADO PESO POR PESO.
 *
 * "SU PAGO EN PESOS 1384.664,47 TC1520,000" aplicó $1.090.924,47 al saldo en pesos y U$S 193,25 al
 * saldo en dólares. La identidad: 1.090.924,47 + 193,25 × 1.520 = 1.384.664,47 EXACTO. Es lo que
 * convierte un débito del extracto en la prueba de que ESE resumen quedó pagado, y no una
 * coincidencia de importes.
 */
export function verificarPagoAnterior(p) {
  const pa = p.resumen.pagoAnterior
  if (!pa || pa.importe == null) return [{ nombre: 'pago del período anterior', estado: 'no_verificable', detalle: 'el resumen no registra un pago' }]
  if (!pa.tc && pa.aplicadoDolares) return [{ nombre: 'pago del período anterior', estado: 'no_verificable', detalle: 'aplicó dólares y el resumen no declara el tipo de cambio' }]
  const esperado = c(Math.abs(pa.aplicadoPesos) + Math.abs(pa.aplicadoDolares || 0) * (pa.tc || 0))
  const dif = c(esperado - c(pa.importe))
  return [{
    nombre: 'el pago anterior explica los dos saldos que canceló',
    estado: Math.abs(dif) <= CENTAVO ? 'ok' : 'falla',
    suma: esperado,
    declarado: c(pa.importe),
    diferencia: dif,
    detalle: `$${Math.abs(pa.aplicadoPesos)} + U$S ${Math.abs(pa.aplicadoDolares || 0)} × ${pa.tc}`,
  }]
}

/**
 * LA PRIMERA FILA DE "CUOTAS A VENCER" SE PUEDE RECONSTRUIR DESDE LAS COMPRAS DE ESTE RESUMEN.
 *
 * Toda compra en cuotas con `cuota < cuotas` vuelve a facturarse el mes que viene, por el mismo
 * importe. Sumarlas tiene que dar la primera columna de la tabla que publica el banco — y son dos
 * lugares distintos del documento, leídos por dos caminos distintos del parser.
 *
 * ES EL CONTROL QUE SOSTIENE LA PROYECCIÓN. El "piso" de la próxima liquidación no es una opinión
 * porque este control lo cruza; si fallara, el piso pasaría a ser una estimación y hay que decirlo.
 *
 * LA TOLERANCIA ES DEL BANCO, NO NUESTRA: el propio resumen arrastra hasta 6 centavos por columna
 * (redondea cada plan por separado). Se admite un peso; un peso no esconde una cuota.
 */
export function verificarProximaCuota(p) {
  const fila = p.cuotas?.porMes?.[0]
  const vivas = p.movimientos.filter((m) => m.tipo === 'consumo' && m.cuota && m.cuotas && m.cuota < m.cuotas)
  if (!fila || !vivas.length) {
    return [{ nombre: 'la próxima cuota se reconstruye desde las compras', estado: 'no_verificable', detalle: !fila ? 'el resumen no publica la tabla de cuotas a vencer' : 'no hay compras en cuotas vivas' }]
  }
  const suma = sum(vivas, (m) => m.pesos)
  const dif = c(suma - c(fila.importe))
  return [{
    nombre: 'la próxima cuota se reconstruye desde las compras',
    estado: Math.abs(dif) <= 1 ? 'ok' : 'falla',
    suma,
    declarado: c(fila.importe),
    diferencia: dif,
    detalle: `${vivas.length} plan(es) vivo(s) → ${fila.mes}`,
  }]
}

/**
 * Los dos controles que YA EXISTÍAN en `banco-santander.mjs`, corridos sobre lo parseado.
 *
 * No se reescriben: se les da de comer la foto que esperan. El primero cruza los cargos uno por uno
 * y sólo aplica cuando el resumen tiene exactamente esos tres (sellos, sellos P y RG 5617) y el
 * saldo anterior quedó cancelado; fuera de ese caso NO se fuerza — se declara que no aplica, que es
 * distinto de decir que pasó.
 *
 * Del segundo se usa SÓLO `colaEsTotal`: comparar la suma de la tabla contra su total sería
 * tautológico acá, porque ese total lo calcula este mismo parser (el banco no lo imprime).
 */
export function verificarConLosControlesViejos(p) {
  const out = []
  const porConcepto = (k) => p.movimientos.filter((m) => m.concepto === k).reduce((s, m) => s + m.pesos, 0)
  const cargos = p.movimientos.filter((m) => m.tipo === 'cargo')
  const soloLosTres = cargos.length === 3 && cargos.every((m) => ['sellos', 'sellos_provinciales', 'rg5617'].includes(m.concepto))
  const netoAnterior = c(sum(p.movimientos.filter((m) => m.tipo === 'saldo_anterior' || m.tipo === 'pago'), (m) => m.pesos))
  if (soloLosTres && netoAnterior === 0) {
    const v = verificarResumenTarjeta({
      consumidoPesos: p.resumen.consumosPesos,
      resumen: { sellos: porConcepto('sellos'), sellosProvinciales: porConcepto('sellos_provinciales'), rg5617: { importe: porConcepto('rg5617') }, aDebitarPesos: p.resumen.aDebitarPesos },
    })
    out.push({ nombre: 'consumos + sellos + sellos P + RG 5617 = a debitar', estado: v.cierra ? 'ok' : 'falla', suma: v.suma, declarado: v.declarado, diferencia: v.diferencia, detalle: 'el control que ya existía en banco-santander.mjs' })
  } else {
    out.push({ nombre: 'consumos + sellos + sellos P + RG 5617 = a debitar', estado: 'no_aplica', detalle: soloLosTres ? `el saldo anterior no quedó en cero (${netoAnterior})` : `este resumen trae ${cargos.length} cargo(s) y no los tres de siempre` })
  }

  const cola = p.cuotas?.cola
  if (cola?.total && cola.cuotas) {
    const v = verificarCuotasAVencer({ cuotasAVencer: { porMes: p.cuotas.porMes, desdeMarzo27: { total: cola.total, cuotas: cola.cuotas, importe: cola.cuota }, total: p.cuotas.total } })
    out.push({ nombre: '"a partir de …" es un TOTAL, no una cuota mensual', estado: v.colaEsTotal ? 'ok' : 'falla', suma: c(cola.cuotas * cola.cuota), declarado: c(cola.total), diferencia: c(cola.cuotas * cola.cuota - cola.total), detalle: `${cola.cuotas} × $${cola.cuota}` })
  } else if (cola?.total) {
    out.push({ nombre: '"a partir de …" es un TOTAL, no una cuota mensual', estado: 'no_verificable', detalle: `$${cola.total} no es múltiplo exacto de la última cuota publicada: no puedo afirmar en cuántas se reparte` })
  }
  return out
}

/**
 * TODOS LOS CONTROLES, Y EL VEREDICTO.
 *
 * `cierra` es falso si CUALQUIERA falla. Un resumen que no cierra no entra a la base salvo que se lo
 * pidan con la bandera explícita: un resumen mal transcripto adentro es peor que uno sin cargar.
 */
export function verificarResumen(p) {
  const controles = [
    ...verificarTotalConsumos(p),
    ...verificarADebitar(p),
    ...verificarRG5617(p),
    ...verificarPagoAnterior(p),
    ...verificarProximaCuota(p),
    ...verificarConLosControlesViejos(p),
  ]
  if (!p.resumen.pagoMinimoVerificado) {
    controles.push({ nombre: 'pago mínimo', estado: 'no_verificable', detalle: p.resumen.pagoMinimoMotivo || 'no lo pude identificar en el talón' })
  } else {
    controles.push({ nombre: 'pago mínimo', estado: 'ok', declarado: p.resumen.pagoMinimo, detalle: 'identificado en el talón por los dos importes que ya se sabían' })
  }
  return { controles, cierra: controles.every((x) => x.estado !== 'falla'), fallas: controles.filter((x) => x.estado === 'falla') }
}
