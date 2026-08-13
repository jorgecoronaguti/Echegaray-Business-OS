// EL PLAN DE TRES RODADOS, CALCULADO — cuotas, tasas reales, caja y el costo de demorar.
//
// ═══ QUÉ CONTESTA (13/08/2026) ═══
//
// El informe anterior le proponía al dueño renunciar a FONDEFIN porque no llegaba para septiembre.
// Era una mala recomendación por un error de encuadre: trataba las tres unidades como una sola
// decisión. Son tres, con tres fechas y dos fuentes de fondos, y la única pregunta cara es cuánto
// cuesta cada combinación EN PESOS Y EN EL TIEMPO. Este módulo produce esos números.
//
// ═══ LA IDEA QUE ORDENA TODO: LA TASA REAL ═══
//
// Con inflación del 29,8% anual, una TNA del 13,69% no es "barata": es NEGATIVA en términos reales.
// Se devuelve con pesos que valen menos que los que se recibieron. Por eso el orden de las fuentes de
// fondos no se decide por la tasa nominal —que es como se mira una tabla de banco— sino por
// `tasaReal`, y por eso FONDEFIN no se cambia por urgencia: se cambia el CALENDARIO, no la fuente.
//
// ═══ LO QUE NO HACE ═══
//
// No lee el Sheet ni escribe nada. No inventa el CFT de FONDEFIN (no está publicado): todo número que
// depende de él sale marcado `esPiso`. No recalcula la comparación contado-vs-eCheq: la pide a
// `rodados-financiacion.mjs`, que ya la tiene verificada por dos caminos independientes.

import { CALENDARIO, C31, C32, FONDEFIN, FUENTES_DE_FONDOS, INFLACION, PRENDARIO_FORD, UVA } from './rodados-plan-datos.mjs'

const MESES_ANIO = 12

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// CALENDARIO — aritmética de meses 'AAAA-MM'
// ─────────────────────────────────────────────────────────────────────────────────────────────────

/** NÚCLEO PURO: suma meses a 'AAAA-MM'. Devuelve null con una entrada que no sea un mes. */
export function sumarMeses(mes, n) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(mes))
  if (!m || !Number.isFinite(Number(n))) return null
  const t = Number(m[1]) * MESES_ANIO + (Number(m[2]) - 1) + Math.trunc(Number(n))
  return `${Math.floor(t / MESES_ANIO)}-${String((t % MESES_ANIO) + 1).padStart(2, '0')}`
}

/** NÚCLEO PURO: cuántos meses hay de `desde` a `hasta` (negativo si `hasta` es anterior). */
export function diffMeses(desde, hasta) {
  const a = /^(\d{4})-(\d{2})$/.exec(String(desde))
  const b = /^(\d{4})-(\d{2})$/.exec(String(hasta))
  if (!a || !b) return null
  return (Number(b[1]) - Number(a[1])) * MESES_ANIO + (Number(b[2]) - Number(a[2]))
}

/** NÚCLEO PURO: la lista de meses de un extremo al otro, inclusive. */
export function rangoDeMeses(desde, hasta) {
  const n = diffMeses(desde, hasta)
  if (n == null || n < 0) return []
  return Array.from({ length: n + 1 }, (_, i) => sumarMeses(desde, i))
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// INFLACIÓN Y TASA REAL
// ─────────────────────────────────────────────────────────────────────────────────────────────────

/** NÚCLEO PURO: encadena variaciones mensuales en una sola del período. */
export const encadenar = (variaciones = []) => variaciones.reduce((a, v) => a * (1 + Number(v)), 1) - 1

/** NÚCLEO PURO: la mensual equivalente a una variación de `meses` meses. */
export const aMensual = (variacionPeriodo, meses) =>
  (meses > 0 ? (1 + Number(variacionPeriodo)) ** (1 / meses) - 1 : null)

/** NÚCLEO PURO: anualiza una variación mensual. */
export const aAnual = (mensual) => (1 + Number(mensual)) ** MESES_ANIO - 1

/**
 * La inflación de trabajo, derivada del IPC publicado. NUNCA tipeada: si el INDEC publica julio y
 * alguien lo agrega a `ipc-publicado.mjs`, estos dos números se mueven solos.
 */
export function inflacionDeTrabajo(datos = INFLACION) {
  const vs = datos.mesesIpc.map((m) => m.variacion)
  const mensual = aMensual(encadenar(vs), vs.length)
  return {
    mensual,
    anual: aAnual(mensual),
    meses: datos.mesesIpc.map((m) => m.periodo),
    remMensual: datos.remMensual,
    remAnual: aAnual(datos.remMensual),
    fuente: datos.fuenteIpc,
  }
}

/**
 * NÚCLEO PURO: TASA REAL — lo que cuesta de verdad una tasa nominal cuando los pesos se deprecian.
 * Fisher exacto, no la resta ingenua: (1+nominal)/(1+inflación)−1. Con inflación del 29,8% la resta
 * y la división difieren casi 4 puntos, que es la mitad del argumento de FONDEFIN.
 */
export const tasaReal = (nominalAnual, inflacionAnual) =>
  (1 + Number(nominalAnual)) / (1 + Number(inflacionAnual)) - 1

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// CUOTAS
// ─────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * NÚCLEO PURO: cuota del sistema francés.
 * A tasa CERO devuelve capital/n en vez de dividir por cero: un crédito sin interés existe (el UVA
 * nominal es exactamente eso) y la fórmula general se indefine ahí.
 */
export function cuotaFrancesa(capital, tasaMensual, n) {
  const c = Number(capital); const i = Number(tasaMensual); const k = Math.trunc(Number(n))
  if (!(c > 0) || !(k > 0) || !Number.isFinite(i) || i < 0) return null
  if (i === 0) return c / k
  return c * i / (1 - (1 + i) ** -k)
}

/**
 * NÚCLEO PURO: el cuadro de marcha de un préstamo francés CON GRACIA DE CAPITAL.
 *
 * Durante la gracia el saldo no baja y se pagan sólo intereses; después, la cuota francesa se calcula
 * sobre el capital entero por las cuotas que quedan. La gracia NO es gratis: alivia los primeros
 * meses y encarece el total, y eso se ve en `totalIntereses`.
 *
 * EL IVA DESCONOCIDO NO ES IVA CERO — misma regla que `costoEfectivo`: con `iva: null` el cuadro
 * devuelve `iva: null` por cuota, `esPiso: true` y la cuota es la de capital+interés sin impuesto.
 * Un IVA tratado como cero subestima el egreso hasta 21 puntos sobre los intereses sin decir nada.
 *
 * ═══ POR QUÉ `cftPublicado` ES UN PARÁMETRO Y NO UNA CONSTANTE (13/08/2026) ═══
 *
 * `esPiso` se resolvía mirando `FONDEFIN.ivaSobreInteresesDeclarado`: una función GENÉRICA leyendo una
 * constante de UNA fuente puntual. Mientras ese campo fue `null` el defecto quedó tapado, porque
 * devolvía `true` para todo el mundo y "piso" es el rótulo conservador. Cuando el dueño declaró el
 * IVA, el mismo renglón empezó a devolver `false` para el cuadro de FONDEFIN — o sea, a afirmar TOTAL
 * sobre un crédito al que le faltan el CFT, el sellado, el seguro de vida sobre saldo deudor y la
 * tasación. Un dato que llega convertía un piso en un total sin que nadie lo decidiera.
 *
 * Lo que separa un piso de un total NO es el IVA: es el CFT. Así que se pregunta por él, y quien llama
 * dice si su fuente lo publica. Sin CFT, piso — aunque el IVA esté declarado.
 */
export function cuadroFrances(capital, tnaAnual, { cuotas, gracia = 0, iva = null, cftPublicado = null } = {}) {
  const c = Number(capital)
  const i = Number(tnaAnual) / MESES_ANIO
  const n = Math.trunc(Number(cuotas))
  const g = Math.trunc(Number(gracia) || 0)
  if (!(c > 0) || !(n > 0) || g < 0 || g >= n || !Number.isFinite(i) || i < 0) return null
  const cuotaPura = cuotaFrancesa(c, i, n - g)
  const filas = []
  let saldo = c
  for (let k = 1; k <= n; k++) {
    const interes = saldo * i
    const amortizacion = k <= g ? 0 : Math.min(saldo, cuotaPura - interes)
    const ivaCuota = iva == null ? null : interes * Number(iva)
    saldo = Math.max(0, saldo - amortizacion)
    filas.push({ k, interes, amortizacion, iva: ivaCuota, cuota: interes + amortizacion + (ivaCuota ?? 0), saldo })
  }
  return {
    capital: c, tasaMensual: i, cuotas: n, gracia: g, cuotaPura,
    filas,
    totalPagado: filas.reduce((s, f) => s + f.cuota, 0),
    totalIntereses: filas.reduce((s, f) => s + f.interes, 0),
    totalIva: iva == null ? null : filas.reduce((s, f) => s + f.iva, 0),
    esPiso: iva == null || cftPublicado == null,
  }
}

/**
 * NÚCLEO PURO: el cuadro de un crédito UVA de TNA 0% expresado en PESOS DE CADA MES.
 *
 * La cuota es constante en UVAs y creciente en pesos: se multiplica por el índice acumulado. Ese es
 * TODO el costo del crédito — la TNA 0% no lo hace gratis, lo hace neutro. `valorPresente` descontado
 * a la misma inflación devuelve el capital exacto, y ese es el punto: la UVA cuesta 0% REAL, no 0%.
 */
export function cuadroUva(capital, cuotas, inflacionMensual) {
  const c = Number(capital); const n = Math.trunc(Number(cuotas)); const i = Number(inflacionMensual)
  if (!(c > 0) || !(n > 0) || !Number.isFinite(i)) return null
  const cuotaNominal = c / n
  const filas = Array.from({ length: n }, (_, idx) => {
    const k = idx + 1
    const factor = (1 + i) ** k
    return { k, factor, cuota: cuotaNominal * factor, cuotaNominal }
  })
  const totalPagado = filas.reduce((s, f) => s + f.cuota, 0)
  return {
    capital: c, cuotas: n, cuotaNominal, inflacionMensual: i, filas,
    totalPagado,
    costoNominal: totalPagado - c,
    valorPresente: valorPresente(filas.map((f) => ({ k: f.k, importe: f.cuota })), i),
    esPiso: true, // el "+ SEGURO" del presupuesto no tiene importe declarado
  }
}

/** NÚCLEO PURO: valor presente de un flujo mensual descontado a `tasaMensual`. */
export const valorPresente = (flujos = [], tasaMensual) =>
  flujos.reduce((s, f) => s + Number(f.importe) / (1 + Number(tasaMensual)) ** Number(f.k), 0)

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// FONDEFIN — el monto que hay que pedir y la garantía que hay que dar
// ─────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * NÚCLEO PURO: cuánto hay que SOLICITAR para que al proveedor le lleguen `neto` pesos.
 * Los gastos de otorgamiento se DETRAEN del desembolso: se divide, no se resta. Restarlos deja al
 * proveedor corto por el 2% del 2% y a la operación sin cerrar.
 */
export const montoASolicitar = (neto, gastos = FONDEFIN.gastosOtorgamiento) =>
  (Number(neto) > 0 && Number(gastos) < 1 ? Number(neto) / (1 - Number(gastos)) : null)

/**
 * NÚCLEO PURO: la garantía prendaria. El ROP exige que la prenda cubra el 200% del FINANCIAMIENTO —
 * no el 100% del bien. Dos unidades de $29,4M no alcanzan a garantizar $60M de crédito: falta
 * exactamente lo que devuelve `faltante`, y eso se cubre con otros rodados, hipoteca o aval de SGR.
 * Es una restricción operativa, no un detalle de letra chica: sin garantía no hay desembolso.
 */
export function garantiaPrendaria(financiamiento, valorDeLosBienes, cobertura = FONDEFIN.coberturaPrenda) {
  const f = Number(financiamiento); const v = Number(valorDeLosBienes)
  if (!(f > 0)) return null
  const requerida = f * Number(cobertura)
  return { requerida, aportanLasUnidades: v, faltante: Math.max(0, requerida - v), alcanza: v >= requerida }
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// EL PLAN COMPLETO
// ─────────────────────────────────────────────────────────────────────────────────────────────────

/** Los gastos de retiro del C31, por ANALOGÍA con el C32. Estimación declarada, nunca un dato. */
export function gastosRetiroC31(c31 = C31, c32 = C32) {
  if (c31.gastosRetiro != null) return { importe: c31.gastosRetiro, clase: 'DATO' }
  const gastos = c32.total - c32.precioUnidad
  return {
    importe: gastos / c32.precioUnidad * c31.precioLista,
    clase: 'ESTIMACIÓN',
    proporcion: gastos / c32.precioUnidad,
    como: `${gastos.toLocaleString('es-AR')} de gastos sobre un precio de unidad de ${c32.precioUnidad.toLocaleString('es-AR')} en el C32, aplicado al precio del C31`,
  }
}

/** El plan armado: las tres unidades con su cuadro de cuotas y su calendario. */
export function planDeTresUnidades({ inflacionMensual, ivaFondefin = FONDEFIN.ivaSobreIntereses } = {}) {
  const inf = inflacionMensual ?? inflacionDeTrabajo().mensual
  const solicitado = montoASolicitar(C31.precioLista)
  // Sin `cftPublicado`: el ROP no publica CFT y le faltan sellos, seguro de vida y tasación. El cuadro
  // de FONDEFIN es un PISO aunque el IVA ya tenga dueño y fecha.
  const cuadroF = cuadroFrances(solicitado, FONDEFIN.tna, {
    cuotas: FONDEFIN.cuotasTotales, gracia: FONDEFIN.cuotasDeGracia, iva: ivaFondefin,
  })
  const u1 = {
    n: 1, modelo: `${C32.unidad.marca} ${C32.unidad.modelo} ${C32.unidad.version} ${C32.unidad.condicion}`,
    fuente: 'Santander UVA 0% · 24 meses',
    precio: UVA.precioTotal, precioContado: UVA.precioTotal,
    desembolsoPropio: UVA.anticipoEfectivo, financiado: UVA.capital,
    mesEntrega: CALENDARIO.mesEntregaU1, mesPrimeraCuota: CALENDARIO.mesPrimeraCuotaU1,
    cuadro: cuadroUva(UVA.capital, UVA.cuotas, inf),
  }
  const gastos = gastosRetiroC31()
  const unidadFondefin = (n) => ({
    n, modelo: C31.modelo, fuente: 'FONDEFIN Bienes de Capital · 48 meses (6 de gracia)',
    precio: C31.precioLista, precioContado: C31.precioLista + gastos.importe,
    desembolsoPropio: gastos.importe, desembolsoPropioClase: gastos.clase,
    financiado: solicitado, montoSolicitado: solicitado, netoAlProveedor: C31.precioLista,
    mesEntrega: CALENDARIO.mesDesembolsoFondefin, mesPrimeraCuota: CALENDARIO.mesPrimeraCuotaFondefin,
    cuadro: cuadroF,
  })
  return {
    inflacionMensual: inf,
    unidades: [u1, unidadFondefin(2), unidadFondefin(3)],
    gastosRetiroC31: gastos,
    garantia: garantiaPrendaria(solicitado * 2, C31.precioLista * 2),
    calendario: CALENDARIO,
  }
}

/**
 * EL COSTO DE CADA UNIDAD, en nominales y en pesos de HOY. El segundo es el que decide.
 *
 * ═══ CONTRA QUÉ SE MIDE EL COSTO FINANCIERO REAL ═══
 *
 * No contra el precio de hoy: contra el VALOR PRESENTE DE PAGAR ESA MISMA UNIDAD AL CONTADO EN SU MES
 * DE ENTREGA. Si se comparara contra el precio nominal de hoy, una unidad que se entrega en diciembre
 * mostraría un "ahorro" de cuatro meses de inflación que no tiene nada que ver con cómo se financió, y
 * la comparación entre la unidad de septiembre y las de diciembre quedaría sesgada a favor de las
 * segundas. Con esta base, la UVA 0% da exactamente CERO de costo real —que es lo que significa una
 * indexación pura— y todo lo que se aleje de cero es costo o beneficio de LA FUENTE DE FONDOS.
 */
export function costoDeCadaUnidad(plan = planDeTresUnidades()) {
  const inf = plan.inflacionMensual
  return plan.unidades.map((u) => {
    const filas = u.cuadro.filas
    const totalCuotas = u.cuadro.totalPagado
    const mesesHastaEntrega = diffMeses('2026-08', u.mesEntrega)
    const mesesHastaPrimeraCuota = diffMeses('2026-08', u.mesPrimeraCuota)
    const vpCuotas = valorPresente(filas.map((f) => ({ k: f.k + mesesHastaPrimeraCuota - 1, importe: f.cuota })), inf)
    const vpPropio = u.desembolsoPropio / (1 + inf) ** mesesHastaEntrega
    const vpContado = u.precioContado / (1 + inf) ** mesesHastaEntrega
    return {
      unidad: u.n, modelo: u.modelo, fuente: u.fuente, precio: u.precio, precioContado: u.precioContado,
      desembolsoPropio: u.desembolsoPropio, financiado: u.financiado,
      cuotas: u.cuadro.cuotas, mesEntrega: u.mesEntrega, mesPrimeraCuota: u.mesPrimeraCuota,
      mesUltimaCuota: sumarMeses(u.mesPrimeraCuota, u.cuadro.cuotas - 1),
      cuotaInicial: filas[0].cuota, cuotaFinal: filas[filas.length - 1].cuota,
      cuotaMaxima: Math.max(...filas.map((f) => f.cuota)),
      totalPagado: u.desembolsoPropio + totalCuotas,
      costoFinancieroNominal: totalCuotas - u.financiado,
      totalPesosDeHoy: vpPropio + vpCuotas,
      costoFinancieroReal: vpPropio + vpCuotas - vpContado,
      esPiso: u.cuadro.esPiso,
    }
  })
}

/** La comparación de fuentes de fondos, ordenada por TASA REAL. La única columna que decide. */
export function compararFuentes(inflacionAnual = inflacionDeTrabajo().anual, fuentes = FUENTES_DE_FONDOS) {
  return fuentes
    .map((f) => {
      const tnaConIva = f.iva == null ? null : Number(f.tna) * (1 + Number(f.iva))
      // El efectivo anual es el CFT si la entidad lo publica; si no, la TEA que capitaliza la TNA con
      // IVA. Un indexado (UVA 0%) no tiene tasa propia: su costo ES la inflación.
      const efectivo = f.indexado ? inflacionAnual
        : f.cft != null ? Number(f.cft)
          : tnaConIva == null ? null : (1 + tnaConIva / MESES_ANIO) ** MESES_ANIO - 1
      return {
        ...f, tnaConIva, efectivoAnual: efectivo,
        origenEfectivo: f.indexado ? 'inflación proyectada (el ajuste ES el costo)' : f.cft != null ? 'CFT publicado' : 'TEA derivada de la TNA con IVA',
        tasaReal: efectivo == null ? null : tasaReal(efectivo, inflacionAnual),
        esPiso: f.cft == null || f.ivaEsSupuesto || f.iva == null,
      }
    })
    .sort((a, b) => (a.tasaReal ?? Infinity) - (b.tasaReal ?? Infinity))
}

/** Todas las cuotas que caen en un mes, por unidad, más el Ford. */
export function calendarioDeCuotas(plan = planDeTresUnidades(), { desde = '2026-09', hasta = '2027-12' } = {}) {
  return rangoDeMeses(desde, hasta).map((mes) => {
    const porUnidad = plan.unidades.map((u) => {
      const k = diffMeses(u.mesPrimeraCuota, mes) + 1
      const fila = k >= 1 && k <= u.cuadro.cuotas ? u.cuadro.filas[k - 1] : null
      return { unidad: u.n, k: fila ? k : null, cuota: fila ? fila.cuota : 0, enGracia: fila ? k <= (u.cuadro.gracia ?? 0) : false }
    })
    const ford = mes >= '2026-08' && mes <= PRENDARIO_FORD.mesUltima ? PRENDARIO_FORD.cuota : 0
    const fordCargadoEnElSheet = mes < PRENDARIO_FORD.mesPrimeraNoCargada
    return {
      mes, porUnidad, ford, fordCargadoEnElSheet,
      totalUnidades: porUnidad.reduce((s, x) => s + x.cuota, 0),
      total: porUnidad.reduce((s, x) => s + x.cuota, 0) + ford,
    }
  })
}
