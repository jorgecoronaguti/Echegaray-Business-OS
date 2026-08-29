// LA POLÍTICA COMERCIAL — versionada, separada de la ingeniería, y con el coeficiente DERIVADO.
//
// ═══ TRES REGLAS DEL PROGRAMA, EN UN SOLO ARCHIVO ═══
//
// §16 INDIRECTOS: `CALCULATED_*` y `APPLIED_*` conviven y el calculado NUNCA se pierde. Un «GG =
//     27 %» a secas no dice si ese 27 salió de sumar la estructura de la empresa o de que alguien
//     lo tipeó. Los dos números viven, y la diferencia entre ellos es una decisión que se puede
//     mirar.
// §17 COMERCIAL SEPARADO: riesgo, contingencia, financiero, markup, impuestos, descuentos y
//     overrides son de la QUOTE, no de la ingeniería. Y una conversación NO cambia la política
//     global de la empresa: para eso hay una acción distinta (`set_global_policy`) con un permiso
//     distinto (`GLOBAL_POLICY_WRITE`).
// §18 EL COEFICIENTE ES DERIVADO: no es input, no es editable, y la fuente de verdad son sus
//     componentes. Acá no existe ningún campo `coeficiente` que se pueda escribir — se calcula.
//
// ═══ LA MATEMÁTICA ES LA DEL LIBRO, NO UNA RAZONABLE ═══
//
// Está verificada contra `Planilla para Cotizar (2).xlsm` hoja Presupuesto B62:H89 y replicada en
// la vista `public.cotizacion_cascada` (migración 20260821T4300, 6/6 casos con diferencia $0,00):
//
//     COSTO DIRECTO
//   + GG            sobre el costo directo         → COSTO INDUSTRIAL
//   + BENEFICIO     sobre el COSTO INDUSTRIAL
//   + FINANCIERO    pct × factor sobre el INDUSTRIAL (no incluye el beneficio, medio período)
//   + IIBB + GANANCIAS sobre INDUSTRIAL + BENEFICIO
//   = SUBTOTAL
//   + IMPUESTO AL CHEQUE sobre el SUBTOTAL
//   = VENTA SIN IVA        + IVA = VENTA FINAL
//
// Los porcentajes NO se suman linealmente porque hay TRES bases distintas. Sumarlos daba 1,581
// donde el coeficiente real es 1,682: cotizar con el primero es regalar 18 puntos por oferta.
//
// ═══ BENEFICIO NO ES MARGEN ═══
//
// El beneficio es MARKUP sobre el costo industrial. El margen sobre el precio de venta es otro
// número y siempre más chico. Confundirlos es el error más caro de una presupuestación, así que
// salen los dos, con nombres distintos, siempre.

import { ESTADO, TIPO_ISSUE, SEVERIDAD, issue, PERMISO } from './contrato.mjs'

const redondear = (n, d = 2) => (n === null || n === undefined || !Number.isFinite(Number(n)) ? null : Math.round(Number(n) * 10 ** d) / 10 ** d)

/** Los ocho porcentajes. Siete son DECISIÓN EMPRESARIAL; uno —el IVA— es normativo, y por eso
 *  `esNormativo` existe: cambiar el IVA no es negociar, es equivocarse. */
export const PARAMETROS = Object.freeze([
  'pctGastosGenerales', 'pctBeneficio', 'pctFinanciero', 'factorFinanciero',
  'pctIibb', 'pctGanancias', 'pctCheque', 'pctIva',
])
export const esNormativo = (p) => p === 'pctIva'

/**
 * UNA POLÍTICA COMERCIAL VERSIONADA. PURA, congelada.
 *
 * `origen` dice si es la política GLOBAL de la empresa o un override de ESTA cotización. La
 * distinción no es decorativa: §17 dice que una conversación no cambia la política global, y sin
 * este campo un `commercial_override` y un `set_global_policy` producirían el mismo objeto.
 */
export function politicaComercial({
  version = 1, origen = 'GLOBAL', fuente, vigenciaDesde = null,
  pctGastosGenerales, pctBeneficio, pctFinanciero, factorFinanciero,
  pctIibb, pctGanancias, pctCheque, pctIva,
} = {}) {
  if (!fuente) throw new Error('una política comercial sin fuente no se puede defender ni auditar')
  if (!['GLOBAL', 'QUOTE'].includes(origen)) throw new Error(`origen de política desconocido: ${origen}`)
  const vals = { pctGastosGenerales, pctBeneficio, pctFinanciero, factorFinanciero, pctIibb, pctGanancias, pctCheque, pctIva }
  for (const [k, v] of Object.entries(vals)) {
    if (!Number.isFinite(Number(v)) || Number(v) < 0) throw new Error(`${k} = «${v}» no es un porcentaje válido`)
  }
  return Object.freeze({ version, origen, fuente: String(fuente), vigenciaDesde, ...Object.fromEntries(Object.entries(vals).map(([k, v]) => [k, Number(v)])) })
}

/**
 * UN OVERRIDE COMERCIAL SOBRE ESTA COTIZACIÓN. PURA.
 *
 * Devuelve una política NUEVA con origen `QUOTE`, la versión incrementada, y —lo importante— el
 * valor anterior guardado en `sustituye`. El calculado no se pierde nunca (§16): «beneficio 19 %»
 * dicho en una conversación tiene que poder mostrarse al lado del 22 % que decía la política, o el
 * que revisa la oferta no puede saber que hubo una negociación.
 *
 * `set_global_policy` NO pasa por acá: cambiar la política de la empresa es otra acción, con otro
 * permiso, y produce una versión GLOBAL nueva.
 */
export function overrideDeQuote({ base, parametro, valor, autorizadoPor, motivo = null } = {}) {
  if (!PARAMETROS.includes(parametro)) throw new Error(`«${parametro}» no es un parámetro de la política comercial`)
  if (esNormativo(parametro)) throw new Error(`el ${parametro} es NORMATIVO: no se negocia por cotización. Si cambió la alícuota, cambia la política global`)
  if (!Number.isFinite(Number(valor)) || Number(valor) < 0) throw new Error(`«${valor}» no es un porcentaje válido para ${parametro}`)
  if (!autorizadoPor) throw new Error('un override comercial sin quién lo autorizó no se puede defender ante el dueño')
  return Object.freeze({
    ...base,
    [parametro]: Number(valor),
    version: (base.version ?? 1) + 1,
    origen: 'QUOTE',
    fuente: `override de esta cotización sobre ${base.fuente}`,
    sustituye: Object.freeze({ parametro, valorAnterior: base[parametro], valorNuevo: Number(valor), autorizadoPor, motivo, permisoExigido: PERMISO.COMMERCIAL_WRITE }),
  })
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// INDIRECTOS: CALCULATED vs APPLIED (§16)
// ══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * LOS INDIRECTOS, con los DOS números. PURA.
 *
 * `calculado` sale de la estructura declarada (los conceptos y sus montos anuales prorrateados).
 * `aplicado` es lo que efectivamente se usa en la cascada. Si nadie lo tocó, son el mismo número y
 * `override` es `null`. Si alguien lo tocó, el calculado SIGUE ESTANDO — es la diferencia entre
 * «GG 27 %» y «GG 27 % aplicado sobre un 26,98 % calculado, redondeado a mano».
 *
 * `conceptos` es opcional: cuando no hay estructura declarada, `calculado` es `null` y NO cero, y
 * el issue lo dice. Un indirecto calculado en cero significaría que la empresa no tiene estructura.
 */
export function indirectos({ conceptos = null, costoDirectoAnual = null, aplicado = null, motivoOverride = null } = {}) {
  const hayEstructura = Array.isArray(conceptos) && conceptos.length > 0 && Number.isFinite(Number(costoDirectoAnual)) && Number(costoDirectoAnual) > 0
  // ═══ UN CONCEPTO SIN MONTO NO VALE CERO ═══
  // `|| 0` sobre un `montoAnual` ausente bajaba el porcentaje de gastos generales CINCO PUNTOS sin
  // emitir un solo issue: la estructura decía tener seis conceptos y se calculaba sobre cinco. Un
  // concepto declarado y sin monto es un hueco, y un hueco no se suma: envenena el cálculo.
  const sinMonto = hayEstructura ? conceptos.filter((c) => c?.montoAnual === null || c?.montoAnual === undefined || c?.montoAnual === '' || !Number.isFinite(Number(c.montoAnual))) : []
  const totalConceptos = hayEstructura && !sinMonto.length ? conceptos.reduce((a, c) => a + Number(c.montoAnual), 0) : null
  const calculado = totalConceptos === null ? null : totalConceptos / Number(costoDirectoAnual)

  if (aplicado === null || aplicado === undefined) {
    return Object.freeze({
      calculado: redondear(calculado, 6), aplicado: redondear(calculado, 6), override: null,
      conceptos: hayEstructura ? Object.freeze([...conceptos]) : null,
      estado: calculado === null ? ESTADO.FALTA_DATO : ESTADO.CALCULADO,
      porQue: calculado !== null ? null
        : (sinMonto.length
          ? `${sinMonto.length} concepto(s) de la estructura no declaran monto anual (${sinMonto.map((c) => c.concepto ?? '?').join(', ')}): el porcentaje NO se calcula sobre los que sí lo declaran`
          : 'no hay estructura de indirectos declarada: el porcentaje no se calcula, y NO es cero'),
      issues: calculado !== null ? [] : [issue({
        type: TIPO_ISSUE.FALTA_DATO, severity: SEVERIDAD.ALTA, entity: 'indirectos',
        detalle: sinMonto.length
          ? `conceptos sin monto anual: ${sinMonto.map((c) => c.concepto ?? '?').join(', ')}`
          : 'sin estructura declarada no se puede calcular el porcentaje de indirectos',
      })],
    })
  }

  return Object.freeze({
    calculado: redondear(calculado, 6),
    aplicado: Number(aplicado),
    // EL CALCULADO NO SE PIERDE. Es toda la regla del §16 en una línea.
    override: Object.freeze({ valorCalculado: redondear(calculado, 6), valorAplicado: Number(aplicado), motivo: motivoOverride, diferencia: calculado === null ? null : redondear(Number(aplicado) - calculado, 6) }),
    conceptos: hayEstructura ? Object.freeze([...conceptos]) : null,
    estado: ESTADO.CONFIRMADO,
    porQue: calculado === null
      ? `se aplicó ${aplicado} sin estructura que lo calcule: es una decisión, no un cálculo`
      : `se aplicó ${aplicado} sobre un calculado de ${redondear(calculado, 6)}`,
    issues: [],
  })
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// LA CASCADA — el coeficiente es lo ÚLTIMO y sale de los componentes
// ══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * LA CASCADA COMERCIAL. PURA.
 *
 * `costoDirecto` puede ser `null` —y lo es cada vez que falta un precio—. En ese caso NO se
 * devuelve una cascada de ceros: se devuelve una cascada de `null` con el motivo. Una cascada que
 * calcula sobre cero publica «venta final $0» y un coeficiente indefinido, y eso en una pantalla se
 * lee como «este presupuesto vale nada», no como «este presupuesto no se puede calcular».
 *
 * `COST ≠ PRICE` (§42) está acá: `costoDirecto` y `ventaSinIva` son campos distintos y ninguna
 * función devuelve uno donde se espera el otro.
 */
export function cascada({ costoDirecto, politica } = {}) {
  const vacia = (porQue) => Object.freeze({
    costoDirecto: null, gastosGenerales: null, costoIndustrial: null, beneficio: null,
    financiero: null, iibb: null, ganancias: null, subtotal: null, impuestoCheque: null,
    ventaSinIva: null, iva: null, ventaFinal: null,
    coeficienteSinIva: null, coeficienteConIva: null, margenSobrePrecioPct: null,
    estado: ESTADO.FALTA_DATO, porQue, politica: politica ?? null,
  })
  if (!politica) return vacia('no hay política comercial: sin los ocho porcentajes no hay precio')
  if (costoDirecto === null || costoDirecto === undefined || !Number.isFinite(Number(costoDirecto))) {
    return vacia('el costo directo no se pudo afirmar, así que el precio tampoco. NO es cero: es desconocido')
  }

  const cd = Number(costoDirecto)
  const p = politica
  const gastosGenerales = cd * p.pctGastosGenerales
  const costoIndustrial = cd * (1 + p.pctGastosGenerales)
  const beneficio = costoIndustrial * p.pctBeneficio
  const financiero = costoIndustrial * p.pctFinanciero * p.factorFinanciero
  const baseImpuestos = costoIndustrial * (1 + p.pctBeneficio)
  const iibb = baseImpuestos * p.pctIibb
  const ganancias = baseImpuestos * p.pctGanancias
  const subtotal = baseImpuestos * (1 + p.pctIibb + p.pctGanancias) + financiero
  const impuestoCheque = subtotal * p.pctCheque
  const ventaSinIva = subtotal * (1 + p.pctCheque)
  const iva = ventaSinIva * p.pctIva
  const ventaFinal = ventaSinIva * (1 + p.pctIva)

  return Object.freeze({
    costoDirecto: redondear(cd), gastosGenerales: redondear(gastosGenerales),
    costoIndustrial: redondear(costoIndustrial), beneficio: redondear(beneficio),
    financiero: redondear(financiero), iibb: redondear(iibb), ganancias: redondear(ganancias),
    subtotal: redondear(subtotal), impuestoCheque: redondear(impuestoCheque),
    ventaSinIva: redondear(ventaSinIva), iva: redondear(iva), ventaFinal: redondear(ventaFinal),
    // ═══ DERIVADOS. NO SON CAMPOS: SON CONSECUENCIAS ═══
    coeficienteSinIva: cd > 0 ? redondear(ventaSinIva / cd, 6) : null,
    coeficienteConIva: cd > 0 ? redondear(ventaFinal / cd, 6) : null,
    // Y el margen sobre precio, que NO es el beneficio: el beneficio es markup sobre costo.
    margenSobrePrecioPct: ventaSinIva > 0 ? redondear((beneficio / ventaSinIva) * 100, 2) : null,
    estado: ESTADO.CALCULADO, porQue: null, politica: p,
  })
}

/**
 * EL COEFICIENTE A PARTIR DE LOS PORCENTAJES SOLOS, sin costo. PURA.
 *
 * Es la forma cerrada demostrada en la migración:
 *   coef = (1+gg) × [ (1+ben) × (1+iibb+gan) + fin×factor ] × (1+cheque)
 *
 * Existe para PROBAR que el coeficiente es derivado: si alguien quisiera escribirlo, esta función
 * demuestra que su valor ya está determinado por otros ocho números y que cualquier valor tipeado
 * que no coincida es una contradicción, no una preferencia.
 */
export function coeficienteDe(politica) {
  if (!politica) return null
  const p = politica
  const c = (1 + p.pctGastosGenerales) * ((1 + p.pctBeneficio) * (1 + p.pctIibb + p.pctGanancias) + p.pctFinanciero * p.factorFinanciero) * (1 + p.pctCheque)
  return redondear(c, 6)
}

/**
 * ¿ALGUIEN ESTÁ INTENTANDO ESCRIBIR EL COEFICIENTE? PURA.
 *
 * El command layer llama a esto antes de aplicar cualquier `commercial_override`. Devuelve el
 * rechazo con la explicación de cuál de los ocho componentes hay que mover en su lugar — porque
 * «no se puede» sin decir qué sí se puede es una pared, no una respuesta.
 */
export function rechazarEscrituraDeCoeficiente(parametro) {
  if (!/coeficiente|coef/i.test(String(parametro))) return null
  return {
    ok: false,
    porQue: 'el coeficiente es DERIVADO: sale de los ocho porcentajes y no se puede escribir. Para moverlo se cambia el componente que corresponda',
    componentes: PARAMETROS.filter((x) => !esNormativo(x)),
  }
}
