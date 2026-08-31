// LOS INDIRECTOS, POR CONCEPTOS — no por un porcentaje que nadie puede explicar.
//
// ═══ EL DEFECTO QUE ESTE ARCHIVO EXISTE PARA ARREGLAR ═══
//
// Hoy el indirecto de la empresa es UN ESCALAR: `parametro_comercial.pct_gastos_generales = 0,27`.
// La nota de esa fila dice que el 27 % «es el redondeo a mano del 26,98 % que calcula la hoja GG»,
// o sea que el número tiene una estructura detrás — y esa estructura no está en ninguna parte del
// OS. `indirecto_concepto` se creó el 29/08 para guardarla y tiene **0 filas**: `indirectos()` de
// `comercial.mjs` devuelve FALTA_DATO en cada corrida real desde que existe.
//
// Lo que sí está medido, en `datos/conocimiento/hallazgos-cotizaciones.json` sobre 64 cotizaciones
// reales de ECSAS, es la forma de esa estructura, y son DOS BLOQUES con bases distintas:
//
//   · GASTOS COMUNES DE OBRA (hoja GG, filas 14–51) — obrador, hidrogrúa, agua de construcción,
//     aranceles de OSSE, derechos municipales, capataz, comida, prevencionista, oficina técnica,
//     transporte interno, planos y aprobaciones. La columna G guarda una CANTIDAD (meses de baño
//     químico, raciones de comida) y el importe sale en $ PARA ESA OBRA.
//   · GASTOS GENERALES DE LA EMPRESA (filas 54–62) — administrativos, financieros y de banco,
//     contables, vehículos, alquiler de oficina y servicios, librería, matrículas. Ahí la columna G
//     guarda un PORCENTAJE DEL COSTO DIRECTO.
//
// Es la MISMA columna con dos significados. Un modelo de un solo porcentaje no puede representar
// eso: o prorratea meses de baño químico o pierde la estructura de la empresa. Por eso cada concepto
// declara SU BASE, y el cálculo la respeta.
//
// ═══ EL HALLAZGO QUE OBLIGA A SEPARAR CALCULADO DE APLICADO ═══
//
// Medido sobre esas 64 cotizaciones: el rótulo «Gastos administrativos (4 % de CD)» convive con un
// coeficiente aplicado de 0,02 en 49 cotizaciones, y «Alquiler oficina y servicios (1.2 % de CD)»
// aparece aplicado en 0,015 · 0,03 · 0,001 · 0,02 · 0,01 en 62. La empresa YA hace override: lo que
// no hace es registrarlo. Acá el calculado no se pierde nunca, y la diferencia tiene nombre —
// `brechaDeAbsorcion`— porque una obra que no absorbe su parte de estructura parece rentable y no lo
// es.
//
// ═══ SIN MONTO NO ES CERO ═══
//
// 29 conceptos aparecen en las 64 cotizaciones con importe $ 0. Ese cero es una afirmación —«esta
// obra no lleva agua de construcción»— y es distinto de «nadie cargó cuánto sale el agua». Un
// concepto con `monto: null` envenena el total; uno con `monto: 0` lo deja intacto y queda declarado
// como decisión. Los dos casos se distinguen en el resultado.

import { ESTADO, TIPO_ISSUE, SEVERIDAD, issue } from './contrato.mjs'

const redondear = (n, d = 2) => (n === null || n === undefined || !Number.isFinite(Number(n)) ? null : Math.round(Number(n) * 10 ** d) / 10 ** d)
const hayNumero = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v))

/** Sobre qué se apoya el monto de un concepto. No es una etiqueta: decide la aritmética. */
export const BASE_INDIRECTO = Object.freeze({
  /** Gasto anual de estructura, prorrateado: monto ÷ costo directo anual de la empresa. */
  PRORRATEO_ANUAL: 'PRORRATEO_ANUAL',
  /** Porcentaje del costo directo de ESTA obra. Es lo que la hoja GG guarda en el bloque empresa. */
  PCT_COSTO_DIRECTO: 'PCT_COSTO_DIRECTO',
  /** Plata de esta obra, computada aparte (meses de obrador, raciones de comida, un arancel). */
  MONTO_POR_OBRA: 'MONTO_POR_OBRA',
})

/** De quién es el gasto. Un gasto de OBRA se computa por obra; uno de EMPRESA se reparte entre
 *  todas, y por eso su criterio de reparto tiene que estar declarado y no heredado. */
export const BLOQUE_INDIRECTO = Object.freeze({ OBRA: 'OBRA', EMPRESA: 'EMPRESA' })

/**
 * UN CONCEPTO DE INDIRECTO. PURA, congelada.
 *
 * `fuente` es obligatoria por el mismo motivo que en el alcance: un gasto general mueve el precio de
 * cada oferta de la empresa, y «siempre se usó 27» no es una fuente.
 */
export function conceptoIndirecto({
  concepto, bloque = BLOQUE_INDIRECTO.EMPRESA, base = BASE_INDIRECTO.PRORRATEO_ANUAL,
  montoAnual = null, pct = null, monto = null, fuente, notas = null,
} = {}) {
  if (!concepto) throw new Error('un concepto de indirecto sin nombre no se puede discutir ni comparar')
  if (!fuente) throw new Error(`el concepto «${concepto}» no declara fuente: un gasto general sin origen no se puede defender`)
  if (!Object.values(BASE_INDIRECTO).includes(base)) throw new Error(`base de indirecto desconocida: ${base}`)
  if (!Object.values(BLOQUE_INDIRECTO).includes(bloque)) throw new Error(`bloque de indirecto desconocido: ${bloque}`)
  const campo = { PRORRATEO_ANUAL: 'montoAnual', PCT_COSTO_DIRECTO: 'pct', MONTO_POR_OBRA: 'monto' }[base]
  const valores = { montoAnual, pct, monto }
  for (const [k, v] of Object.entries(valores)) {
    if (k !== campo && v !== null && v !== undefined) throw new Error(`«${concepto}» declara base ${base} y trae ${k}: el valor tiene que ir en ${campo}`)
    if (k === campo && v !== null && v !== undefined && (!Number.isFinite(Number(v)) || Number(v) < 0)) {
      throw new Error(`«${concepto}» trae ${k} = «${v}», que no es un monto válido`)
    }
  }
  return Object.freeze({
    concepto: String(concepto), bloque, base, notas,
    montoAnual: hayNumero(montoAnual) ? Number(montoAnual) : null,
    pct: hayNumero(pct) ? Number(pct) : null,
    monto: hayNumero(monto) ? Number(monto) : null,
    /** El valor que gobierna, según la base. `null` es un HUECO y `0` es una decisión. */
    valor: hayNumero(valores[campo]) ? Number(valores[campo]) : null,
    fuente: String(fuente),
    estado: hayNumero(valores[campo]) ? ESTADO.EXTRAIDO : ESTADO.FALTA_DATO,
  })
}

/**
 * LA ESTRUCTURA DE INDIRECTOS DE LA EMPRESA, VERSIONADA. PURA, congelada.
 *
 * `costoDirectoAnual` es el denominador del prorrateo y **la tabla `indirecto_concepto` no lo tenía**:
 * con montos anuales y sin denominador, el porcentaje no se puede calcular por más conceptos que se
 * carguen. Sin él, los conceptos de base PRORRATEO_ANUAL no se pueden convertir a porcentaje y el
 * cálculo lo dice en vez de repartirlos sobre una base inventada.
 */
export function estructuraIndirecta({ version = 1, conceptos = [], costoDirectoAnual = null, fuente, vigenciaDesde = null } = {}) {
  if (!fuente) throw new Error('una estructura de indirectos sin fuente no se puede auditar')
  if (!Array.isArray(conceptos)) throw new Error('los conceptos de la estructura tienen que ser una lista')
  const dup = conceptos.map((c) => c.concepto).filter((c, i, a) => a.indexOf(c) !== i)
  if (dup.length) throw new Error(`la estructura repite conceptos y los sumaría dos veces: ${[...new Set(dup)].join(', ')}`)
  return Object.freeze({
    version, fuente: String(fuente), vigenciaDesde,
    conceptos: Object.freeze([...conceptos]),
    costoDirectoAnual: hayNumero(costoDirectoAnual) ? Number(costoDirectoAnual) : null,
  })
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// EL CÁLCULO — cada base con su aritmética, y el hueco envenena
// ══════════════════════════════════════════════════════════════════════════════════════════════

/** Cuánto aporta un concepto a ESTA obra, en $ y en pct del costo directo de la obra. PURA. */
function aporteDeConcepto(c, { costoDirectoObra, costoDirectoAnual }) {
  if (c.valor === null) return { monto: null, pct: null, porQue: `«${c.concepto}» no declara ${{ PRORRATEO_ANUAL: 'monto anual', PCT_COSTO_DIRECTO: 'porcentaje', MONTO_POR_OBRA: 'monto' }[c.base]}. NO es cero: es un hueco` }
  if (c.base === BASE_INDIRECTO.PCT_COSTO_DIRECTO) {
    return { monto: costoDirectoObra === null ? null : costoDirectoObra * c.valor, pct: c.valor, porQue: null }
  }
  if (c.base === BASE_INDIRECTO.MONTO_POR_OBRA) {
    return { monto: c.valor, pct: costoDirectoObra ? c.valor / costoDirectoObra : null, porQue: null }
  }
  // PRORRATEO_ANUAL: sin denominador no hay porcentaje, y repartirlo sobre el costo de una obra
  // sería afirmar que esa obra absorbe TODA la estructura del año.
  if (costoDirectoAnual === null || costoDirectoAnual <= 0) {
    return { monto: null, pct: null, porQue: `«${c.concepto}» se prorratea sobre el costo directo anual de la empresa, y ese dato no está declarado` }
  }
  const pct = c.valor / costoDirectoAnual
  return { monto: costoDirectoObra === null ? null : costoDirectoObra * pct, pct, porQue: null }
}

/**
 * EL INDIRECTO **CALCULADO** DE UNA OBRA. PURA.
 *
 * Devuelve `{ pct, monto, porConcepto, nHuecos, estado, porQue, issues }`. `pct` es la fracción del
 * costo directo de la obra —el número que después entra en la cascada como `pctGastosGenerales`—.
 *
 * Un solo concepto sin valor deja `pct` y `monto` en `null`. Es la misma regla que el costo directo:
 * un total al que le falta un renglón engaña más que un total ausente, porque tiene cara de completo.
 */
export function indirectoCalculado({ estructura = null, costoDirectoObra = null } = {}) {
  const cdo = hayNumero(costoDirectoObra) ? Number(costoDirectoObra) : null
  const vacio = (porQue, extra = {}) => Object.freeze({
    pct: null, monto: null, porConcepto: Object.freeze([]), nConceptos: 0, nHuecos: 0,
    costoDirectoObra: cdo, estado: ESTADO.FALTA_DATO, porQue,
    issues: Object.freeze([issue({ type: TIPO_ISSUE.FALTA_DATO, severity: SEVERIDAD.ALTA, entity: 'indirectos', detalle: porQue })]),
    ...extra,
  })
  if (!estructura || !estructura.conceptos?.length) {
    return vacio('no hay estructura de indirectos declarada: el porcentaje NO se calcula, y NO es cero. Un indirecto en cero significaría que la empresa no tiene estructura')
  }

  const porConcepto = estructura.conceptos.map((c) => {
    const a = aporteDeConcepto(c, { costoDirectoObra: cdo, costoDirectoAnual: estructura.costoDirectoAnual })
    return Object.freeze({
      concepto: c.concepto, bloque: c.bloque, base: c.base, valor: c.valor, fuente: c.fuente,
      monto: redondear(a.monto), pct: a.pct === null ? null : redondear(a.pct, 6), porQue: a.porQue,
      estado: a.porQue ? ESTADO.FALTA_DATO : ESTADO.CALCULADO,
    })
  })

  const huecos = porConcepto.filter((c) => c.estado === ESTADO.FALTA_DATO)
  const base = {
    porConcepto: Object.freeze(porConcepto), nConceptos: porConcepto.length, nHuecos: huecos.length,
    costoDirectoObra: cdo,
  }
  if (huecos.length) {
    return Object.freeze({
      ...base, pct: null, monto: null, estado: ESTADO.FALTA_DATO,
      // ═══ EL MOTIVO DE CADA HUECO VIAJA, NO SE RESUME ═══
      // «1 de 1 conceptos no tiene valor» mandaba a cargar el monto de un concepto que SÍ lo tenía:
      // lo que faltaba era el costo directo anual sobre el que se prorratea. Un control que nombra
      // mal la causa hace perder el tiempo en el lugar equivocado.
      porQue: `${huecos.length} de ${porConcepto.length} conceptos de la estructura no aportan al cálculo — ${[...new Set(huecos.map((c) => c.porQue))].join(' · ')}`,
      issues: Object.freeze(huecos.map((c) => issue({
        type: TIPO_ISSUE.FALTA_DATO, severity: SEVERIDAD.ALTA, entity: `indirecto · ${c.concepto}`, detalle: c.porQue,
      }))),
    })
  }
  const pct = porConcepto.reduce((a, c) => a + c.pct, 0)
  return Object.freeze({
    ...base,
    pct: redondear(pct, 6),
    monto: cdo === null ? null : redondear(porConcepto.reduce((a, c) => a + c.monto, 0)),
    estado: ESTADO.CALCULADO, porQue: null, issues: Object.freeze([]),
  })
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// EL OVERRIDE — cuatro datos o no se aplica
// ══════════════════════════════════════════════════════════════════════════════════════════════

/** Los cuatro que un override de indirecto tiene que traer. Sin los cuatro NO se aplica: no es un
 *  formalismo, es que el 27 % de hoy es un override sin registrar del 26,98 % de la hoja GG y
 *  nadie puede decir quién lo redondeó ni por qué. */
export const CAMPOS_OVERRIDE = Object.freeze(['actor', 'motivo', 'fecha', 'evidencia'])

/**
 * UN OVERRIDE DE INDIRECTO. PURA.
 *
 * Devuelve `{ ok, override, faltan, porQue }` en vez de tirar: un override incompleto es un caso de
 * negocio corriente —alguien tipeó un número sin explicarlo— y el motor tiene que poder decir «se
 * descartó y esto es lo que le falta», no romperse.
 */
export function overrideDeIndirecto({ valor, actor = null, motivo = null, fecha = null, evidencia = null } = {}) {
  const traido = { actor, motivo, fecha, evidencia }
  const faltan = CAMPOS_OVERRIDE.filter((k) => !traido[k])
  if (!hayNumero(valor) || Number(valor) < 0) {
    return { ok: false, override: null, faltan: ['valor', ...faltan], porQue: `«${valor}» no es un porcentaje de indirecto válido` }
  }
  if (faltan.length) {
    return {
      ok: false, override: null, faltan,
      porQue: `el override del indirecto no trae ${faltan.join(', ')}: sin los cuatro NO se aplica, porque un porcentaje sin quién, por qué, cuándo y contra qué no se puede defender`,
    }
  }
  return {
    ok: true, faltan: [], porQue: null,
    override: Object.freeze({ valor: Number(valor), actor: String(actor), motivo: String(motivo), fecha: String(fecha).slice(0, 10), evidencia: String(evidencia) }),
  }
}

/**
 * EL INDIRECTO **APLICADO**, con el calculado siempre al lado. PURA.
 *
 * `calculado` y `aplicado` son DOS CAMPOS DISTINTOS y ninguna función devuelve uno donde se espera el
 * otro (invariante `INDIRECTO_CALCULADO ≠ INDIRECTO_APLICADO`). Cuando no hay override son iguales
 * en valor, y siguen siendo dos campos: la igualdad es un resultado, no una identidad.
 *
 * `brechaDeAbsorcion` es la plata que esta obra NO absorbe de la estructura cuando el aplicado es
 * menor que el calculado. Es el número que hace visible «esta obra parece rentable y no lo es».
 */
export function indirectoAplicado({ calculado, intento = null } = {}) {
  const calc = calculado ?? null
  const pctCalc = calc?.pct ?? null
  const cdo = calc?.costoDirectoObra ?? null
  const sinOverride = (issues = []) => Object.freeze({
    calculado: pctCalc, aplicado: pctCalc, override: null, brechaDeAbsorcion: null,
    montoCalculado: calc?.monto ?? null, montoAplicado: calc?.monto ?? null,
    estado: pctCalc === null ? ESTADO.FALTA_DATO : ESTADO.CALCULADO,
    porQue: pctCalc === null ? (calc?.porQue ?? 'no hay indirecto calculado') : 'no hubo override: el aplicado es el calculado',
    issues: Object.freeze([...(calc?.issues ?? []), ...issues]),
  })
  if (!intento) return sinOverride()
  if (!intento.ok) {
    // ═══ UN OVERRIDE INCOMPLETO NO SE APLICA, Y TAMPOCO SE PIERDE ═══
    // Se descarta y queda el issue con lo que le falta. Aplicarlo «porque el número está» es
    // exactamente cómo el 27 % llegó a la tabla sin que nadie pueda explicar de dónde salió.
    return sinOverride([issue({
      type: TIPO_ISSUE.COMMERCIAL_DECISION, severity: SEVERIDAD.ALTA, entity: 'indirecto aplicado',
      detalle: intento.porQue, recommended_action: 'set_global_policy',
    })])
  }
  const o = intento.override
  const brecha = pctCalc === null || cdo === null ? null : redondear((o.valor - pctCalc) * cdo)
  return Object.freeze({
    calculado: pctCalc,
    aplicado: o.valor,
    override: o,
    brechaDeAbsorcion: brecha,
    montoCalculado: calc?.monto ?? null,
    montoAplicado: cdo === null ? null : redondear(o.valor * cdo),
    estado: ESTADO.CONFIRMADO,
    porQue: pctCalc === null
      ? `se aplicó ${o.valor} sin estructura que lo calcule: es una DECISIÓN de ${o.actor}, no un cálculo`
      : `se aplicó ${o.valor} sobre un calculado de ${pctCalc} — decidido por ${o.actor} el ${o.fecha}: ${o.motivo}`,
    issues: Object.freeze([
      ...(calc?.issues ?? []),
      ...(brecha !== null && brecha < 0
        ? [issue({
          type: TIPO_ISSUE.COMMERCIAL_DECISION, severity: SEVERIDAD.ALTA, entity: 'indirecto aplicado',
          impact: Math.abs(brecha),
          detalle: `el indirecto aplicado (${o.valor}) es MENOR que el calculado (${pctCalc}): esta obra deja de absorber $${Math.abs(brecha)} de la estructura de la empresa`,
        })]
        : []),
    ]),
  })
}
