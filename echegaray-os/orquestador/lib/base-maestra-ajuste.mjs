// EL «COEF. AJUSTE» NO ES UN NÚMERO: ES UNA DECISIÓN SIN FIRMAR. NÚCLEO PURO: SIN FS NI BASE.
//
// ═══ QUÉ HAY EN ESA COLUMNA, MEDIDO (28/08/2026) ═══
//
// `Presupuesto!G` de `Planilla para Cotizar (2).xlsm` multiplica el subtotal de cada partida
// —`H = E × F × G`— y también sus costos de MO, materiales y cargas sociales. Los 21 renglones con
// código traen cuatro valores distintos de 1:
//
//   G31 = 2      T1058 INSTALACIÓN ELECTRICA          duplica $ 1.308.480 → $ 2.616.960
//   G32 = 3      T1059 INSTALACIÓN SANITARIA          triplica $   719.689 → $ 2.159.068
//   G37 = 1450   T1126.1 ALQUILER BOBCAT con MARTILLO $ 38,27/HR → $ 55.492/HR
//   G42 = 1,2    T1167 ENTREPISO                      sobre una cantidad vacía: no mueve nada
//
// Los cuatro son la misma columna y NO significan lo mismo. Tratarlos igual —«coeficiente de
// ajuste = 1450»— es exactamente lo que había que sacar del Excel.
//
// ═══ EL ÚNICO QUE SE PUEDE PROBAR, Y CÓMO ═══
//
// T1126.1 se compone de seis recursos y los SEIS están en dólares (0.1, 255.1, 278.1, 334, 335,
// 336 — ver `base-maestra-moneda.mjs`). Su costo unitario, 38,27, es una cifra en USD. Multiplicar
// una cifra en USD por ~1450 sólo puede ser una cosa: **convertir**. Y el propio libro trae la
// cotización con la que compararlo: `Recursos!341`, «DOLAR BCO NACION - VENTA», $ 1500 al
// 01/10/2025. 1450 cae adentro de la banda de esa cotización, así que el ajuste es `FX` y queda
// escrito con qué se comparó.
//
// Ninguno de los otros tres se puede probar. G31=2 sobre una instalación eléctrica compuesta en
// pesos puede ser «hay dos tableros», «el alcance es el doble» o «lo cargué a ojo»; la hoja no lo
// dice y el análisis tampoco. **Quedan `UNKNOWN`.** Bajar eso a `SCOPE` porque suena razonable
// subiría la cobertura del informe y bajaría la verdad del sistema: un `SCOPE` inventado se
// hereda, se promedia y termina siendo una regla.
//
// ═══ LA BANDA, Y POR QUÉ NO ES UNA IGUALDAD ═══
//
// No se exige `coeficiente === tipoDeCambio`. La cotización del libro es del 01/10/2025 y el
// coeficiente lo tipeó alguien otro día: pedir igualdad exacta clasificaría como UNKNOWN a todos
// los FX reales. Se exige que caiga en `[tc / 2, tc × 2]`, que es amplio a propósito —discrimina
// «esto es una conversión» de «esto es un markup», que es la pregunta— y el desvío contra la
// cotización viaja como dato, no se esconde: 1450 contra 1500 son 50 pesos por dólar sobre 32
// horas de bobcat, y eso es una diferencia que alguien tiene que mirar.
//
// LO QUE ESTE MÓDULO NO HACE: no decide que un ajuste esté bien. Dice qué es cuando se puede
// probar y dice que no sabe cuando no. La conversión sólo ocurre para `FX`.

import { MONEDA, CONFIANZA } from './base-maestra-moneda.mjs'

/**
 * Los tipos de ajuste. El enum es más ancho que lo que este módulo sabe deducir a propósito: los
 * que faltan los clasifica una persona, y necesitan un lugar donde caer que no sea `UNKNOWN`.
 */
export const TIPO_AJUSTE = Object.freeze({
  NEUTRO: 'NEUTRO',
  FX: 'FX',
  WASTE: 'WASTE',
  PRODUCTIVITY: 'PRODUCTIVITY',
  SCOPE: 'SCOPE',
  RISK: 'RISK',
  MARKET: 'MARKET',
  COMMERCIAL: 'COMMERCIAL',
  MANUAL_OVERRIDE: 'MANUAL_OVERRIDE',
  OTHER: 'OTHER',
  UNKNOWN: 'UNKNOWN',
})

/** Sólo estos tipos autorizan a tocar el número. El resto viaja declarado y sin aplicar. */
export const TIPOS_QUE_CONVIERTEN = Object.freeze([TIPO_AJUSTE.FX])

/** Cuán lejos de la cotización del libro puede estar un coeficiente y seguir siendo conversión. */
export const BANDA_FX = Object.freeze({ piso: 0.5, techo: 2 })

/**
 * Por encima de esto, un multiplicador ya no puede ser una decisión de alcance ni un markup: nadie
 * cotiza una partida «cien veces». Sirve para separar «no sé qué es» de «no sé qué es Y ADEMÁS es
 * imposible como coeficiente comercial».
 */
export const MAGNITUD_IMPLAUSIBLE = 100

const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null)

/**
 * QUÉ ES ESTE COEFICIENTE. PURA.
 *
 * @param {object} p
 * @param {number|null} p.coeficiente        el valor de `Presupuesto!G` del renglón
 * @param {{moneda:string, homogenea:boolean}|null} [p.composicion]  de `monedaDeComposicion()`
 * @param {{valor:number, fecha:string|null, fuente:string|null, origen:string}|null} [p.tipoDeCambio]
 * @param {string|null} [p.donde]            la celda, para que el ajuste se rastree
 * @returns {{tipo:string, valor:number|null, confianza:string, porque:string,
 *            evidencia:object, implausible:boolean, requiereDecision:boolean, donde:string|null}}
 */
export function clasificarAjuste({ coeficiente, composicion = null, tipoDeCambio = null, donde = null } = {}) {
  const v = num(coeficiente)
  const base = { valor: v, donde, implausible: false, evidencia: {} }
  if (v === null) {
    return { ...base, tipo: TIPO_AJUSTE.UNKNOWN, confianza: CONFIANZA.BAJA, requiereDecision: true, porque: 'el coeficiente no es un número' }
  }
  if (v === 1) {
    return { ...base, tipo: TIPO_AJUSTE.NEUTRO, confianza: CONFIANZA.ALTA, requiereDecision: false, porque: 'el coeficiente es 1: no ajusta nada' }
  }

  const enUSD = composicion?.homogenea === true && composicion?.moneda === MONEDA.USD
  const implausible = Math.abs(v) >= MAGNITUD_IMPLAUSIBLE

  if (enUSD && tipoDeCambio && num(tipoDeCambio.valor) !== null) {
    const tc = tipoDeCambio.valor
    const dentro = v >= tc * BANDA_FX.piso && v <= tc * BANDA_FX.techo
    const evidencia = {
      composicion: composicion.porque ?? 'toda la composición está en USD',
      cotizacionDelLibro: { valor: tc, fecha: tipoDeCambio.fecha ?? null, fuente: tipoDeCambio.fuente ?? null, origen: tipoDeCambio.origen ?? null },
      desvioContraLaCotizacion: v - tc,
      banda: [tc * BANDA_FX.piso, tc * BANDA_FX.techo],
    }
    if (dentro) {
      return {
        ...base,
        tipo: TIPO_AJUSTE.FX,
        confianza: CONFIANZA.ALTA,
        requiereDecision: evidencia.desvioContraLaCotizacion !== 0,
        implausible: false,
        evidencia,
        porque: `la composición está entera en USD y ${v} cae en la banda de la cotización del libro (${tc}${tipoDeCambio.fecha ? ` al ${tipoDeCambio.fecha}` : ''})`,
      }
    }
    return {
      ...base,
      tipo: TIPO_AJUSTE.UNKNOWN,
      confianza: CONFIANZA.BAJA,
      requiereDecision: true,
      implausible,
      evidencia,
      porque: `la composición está en USD pero ${v} queda fuera de la banda de la cotización del libro (${tc}): no se puede afirmar que sea conversión`,
    }
  }

  if (enUSD) {
    return {
      ...base,
      tipo: TIPO_AJUSTE.UNKNOWN,
      confianza: CONFIANZA.BAJA,
      requiereDecision: true,
      implausible,
      evidencia: { composicion: composicion.porque ?? 'toda la composición está en USD' },
      porque: 'la composición está en USD y el coeficiente parece una conversión, pero el libro no declara ninguna cotización con la que probarlo',
    }
  }

  return {
    ...base,
    tipo: TIPO_AJUSTE.UNKNOWN,
    confianza: CONFIANZA.BAJA,
    requiereDecision: true,
    implausible,
    evidencia: composicion ? { composicion: composicion.porque ?? null } : {},
    porque: implausible
      ? `${v} es demasiado grande para ser un coeficiente comercial y la composición no está en moneda extranjera: no hay nada que lo explique`
      : `${v} no es 1 y nada en la hoja ni en la composición dice por qué`,
  }
}

/**
 * APLICAR EL AJUSTE — y sólo cuando se puede decir qué es. PURA.
 *
 * Un ajuste `UNKNOWN` NO se aplica. La alternativa —aplicarlo igual «porque el Excel lo aplicaba»—
 * reproduce el número y pierde el único dato nuevo que este trabajo produce: que nadie sabe por
 * qué está. El costo queda en su moneda original, marcado, y el precio no se publica solo.
 *
 * @returns {{valor:number|null, moneda:string, aplicado:boolean, comoSeHizo:string,
 *            ajuste:object, sinResolver:boolean}}
 */
export function aplicarAjuste({ costoUnitario, moneda = MONEDA.ARS, ajuste } = {}) {
  const c = num(costoUnitario)
  if (c === null) {
    return { valor: null, moneda, aplicado: false, sinResolver: true, ajuste, comoSeHizo: 'el costo unitario no es un número' }
  }
  if (!ajuste || ajuste.tipo === TIPO_AJUSTE.NEUTRO) {
    return { valor: c, moneda, aplicado: false, sinResolver: false, ajuste, comoSeHizo: 'el coeficiente no ajusta nada' }
  }
  if (TIPOS_QUE_CONVIERTEN.includes(ajuste.tipo)) {
    return {
      valor: c * ajuste.valor,
      moneda: MONEDA.ARS,
      aplicado: true,
      sinResolver: false,
      ajuste,
      comoSeHizo: `${c} ${moneda} × ${ajuste.valor} = ${c * ajuste.valor} ${MONEDA.ARS} · ${ajuste.porque}`,
    }
  }
  return {
    valor: c,
    moneda,
    aplicado: false,
    sinResolver: true,
    ajuste,
    comoSeHizo: `el ajuste ${ajuste.tipo} de ${ajuste.valor} NO se aplicó: ${ajuste.porque}`,
  }
}

/**
 * El repaso de una cotización entera: qué ajustes hay, cuáles se pudieron explicar y cuáles no.
 * `bloquea` es true cuando queda algún ajuste sin resolver moviendo plata — un precio con un
 * multiplicador que nadie sabe explicar no se emite.
 *
 * @param {Array<{tipo:string, valor:number|null, donde:string|null}>} ajustes
 */
export function repasoDeAjustes(ajustes = []) {
  const porTipo = {}
  for (const a of ajustes) porTipo[a.tipo] = (porTipo[a.tipo] ?? 0) + 1
  const sinResolver = ajustes.filter((a) => a.tipo === TIPO_AJUSTE.UNKNOWN)
  return {
    total: ajustes.length,
    porTipo,
    sinResolver: sinResolver.map((a) => ({ donde: a.donde, valor: a.valor, porque: a.porque })),
    bloquea: sinResolver.length > 0,
  }
}
