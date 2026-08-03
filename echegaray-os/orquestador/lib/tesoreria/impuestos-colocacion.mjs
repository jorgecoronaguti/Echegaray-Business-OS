// LOS IMPUESTOS DE UNA COLOCACIÓN — sin esto, un rendimiento es una estimación optimista.
//
// ═══ EL FACTOR QUE DECIDE, Y QUE NO ESTABA ═══
//
// Sacar la plata de la cuenta corriente para colocarla y traerla de vuelta paga el impuesto de la
// Ley 25.413 por las DOS puntas: 0,6% al débito y 0,6% al crédito. Sobre el capital eso es 1,2%, y
// una colocación a 30 días al 23,5% TNA rinde ~1,93% bruto en el período: el impuesto se come más de
// la mitad de la ganancia. Publicar el bruto como si fuera el resultado no es un redondeo — es la
// diferencia entre "conviene" y "no conviene".
//
// ═══ NINGUNA ALÍCUOTA SE CITA DE MEMORIA ═══
//
// La skill `impuestos-construccion` es terminante: toda alícuota es una norma obligatoria hasta que
// se verifique. Acá eso se cumple así:
//
//   · Ley 25.413 → se DECLARA 0,6%+0,6% y se VERIFICA contra el cargo real del banco con
//     `medirLey25413`. Medido el 03/08/2026 sobre `banco_movimientos` (3 meses, $86,9M de débitos y
//     $167,6M de créditos): tasa efectiva 0,6000% al débito y 0,6000% al crédito, sobre prácticamente
//     el 100% del volumen. El control no se valida contra sí mismo: la ley dice una cosa y el banco
//     cobró otra, y coinciden.
//   · IIBB San Juan sobre intereses (actividad financiera) → DESCONOCIDO. No es la alícuota de la
//     construcción y nadie la verificó todavía.
//   · Ganancias → DESCONOCIDO. La alícuota marginal depende de la posición de la empresa (quebrantos,
//     anticipos, tramo); afirmarla sería fabricar precisión.
//
// Un DESCONOCIDO no se rellena con cero: cero es una afirmación ("no paga"), y no la tenemos.
//
// ═══ LA EXENCIÓN QUE NO SE PUEDE CONFIRMAR ═══
//
// Existe un régimen de exenciones del impuesto al cheque (Decreto 380/2001 y sus modificatorias) que
// alcanza a determinadas cuentas del mercado de capitales. Si la transferencia a la cuenta comitente
// estuviera exenta, el instrumento cambia de ranking. Pero el extracto del Santander NO tiene una sola
// transferencia a cuenta comitente —la empresa nunca operó Balanz—, así que la exención no se puede
// confirmar ni descartar con evidencia propia. El modelo aplica las dos puntas (lado seguro) y lo
// declara. El día que exista la primera transferencia, `medirLey25413` la mide sola.

/** Clave de la política fiscal en `tesoreria.politicas`. Ahí viven las alícuotas que apruebe el dueño. */
export const CLAVE_POLITICA_FISCAL = 'fiscal_colocaciones'

export const DESCONOCIDO = 'DESCONOCIDO'

/** Alícuota general de la Ley 25.413, declarada. No se usa sin contrastarla contra el banco. */
export const LEY_25413_DECLARADA = { debito: 0.006, credito: 0.006 }

/** Tolerancia de la verificación: el banco redondea por movimiento, no al peso del total. */
export const TOLERANCIA_LEY_25413 = 0.0002

/**
 * CÓMO TRIBUTA CADA FAMILIA. La diferencia entre instrumentos no es un detalle: puede dar vuelta el
 * ranking, y ése es justamente el punto.
 */
export const TRATAMIENTO = {
  caucion: {
    puntas: 2,
    motivo_puntas: 'la plata sale de la cuenta corriente a la comitente y vuelve al vencimiento: débito y crédito',
    renta: 'interés (resultado por colocación a plazo)',
  },
  money_market: {
    puntas: 2,
    motivo_puntas: 'suscripción desde la cuenta corriente y rescate de vuelta a ella: débito y crédito',
    renta: 'resultado por rescate de cuotapartes — no es un interés, y su tratamiento en Ganancias puede diferir',
  },
  lecap: {
    puntas: 2,
    motivo_puntas: 'compra desde la cuenta corriente y cobro del vencimiento de vuelta a ella: débito y crédito',
    renta: 'resultado por venta o vencimiento del título — no es un interés',
  },
  plazo_fijo: {
    puntas: null,
    motivo_puntas: 'constituido en el MISMO banco puede no generar un débito/crédito gravado; con otra entidad sí. '
      + 'Sin una constitución real en el extracto no se afirma ninguna de las dos cosas',
    renta: 'interés (resultado por colocación a plazo)',
  },
}

const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : null)

/**
 * MIDE LA TASA EFECTIVA QUE EL BANCO COBRÓ. La ley dice 0,6%; esto dice cuánto salió de la cuenta.
 * Read-only sobre `banco_movimientos`. Si no hay base suficiente devuelve `sin_dato` — una medición
 * sobre tres movimientos no verifica nada.
 */
export async function medirLey25413(query, { minimoBase = 1000000 } = {}) {
  if (typeof query !== 'function') return { estado: 'sin_dato', motivo: 'sin acceso a la base' }
  const { rows } = await query(`
    select
      sum(case when concepto !~* '25.?413' and importe < 0 then -importe else 0 end)::float8 as debitos,
      sum(case when concepto !~* '25.?413' and importe > 0 then  importe else 0 end)::float8 as creditos,
      sum(case when concepto ~* '25.?413 *debito'  then -importe else 0 end)::float8 as imp_debito,
      sum(case when concepto ~* '25.?413 *credito' then -importe else 0 end)::float8 as imp_credito,
      min(fecha)::text as desde, max(fecha)::text as hasta
    from banco_movimientos`)
  const r = rows[0] ?? {}
  const base = { debitos: num(r.debitos) ?? 0, creditos: num(r.creditos) ?? 0 }
  if (base.debitos < minimoBase || base.creditos < minimoBase) {
    return { estado: 'sin_dato', motivo: 'el extracto no tiene volumen suficiente para medir la tasa efectiva', base }
  }
  const medida = { debito: (num(r.imp_debito) ?? 0) / base.debitos, credito: (num(r.imp_credito) ?? 0) / base.creditos }
  const coincide = Math.abs(medida.debito - LEY_25413_DECLARADA.debito) <= TOLERANCIA_LEY_25413
    && Math.abs(medida.credito - LEY_25413_DECLARADA.credito) <= TOLERANCIA_LEY_25413
  return {
    estado: coincide ? 'verificada' : 'conflictiva',
    medida,
    declarada: LEY_25413_DECLARADA,
    base,
    ventana: { desde: r.desde ?? null, hasta: r.hasta ?? null },
    fuente: 'banco_movimientos · conceptos "Impuesto ley 25.413 debito/credito 0,6%" del extracto del Santander',
    motivo: coincide ? null
      : `el banco cobró ${(medida.debito * 100).toFixed(4)}% al débito y ${(medida.credito * 100).toFixed(4)}% al crédito, `
        + 'y la alícuota declarada es 0,6000%: hay que entender la diferencia antes de usar cualquiera de las dos',
  }
}

/** Un parámetro fiscal conocido. */
const conocido = (valor, fuente, extra = {}) => ({ estado: 'conocido', valor, fuente, ...extra })

/** Un parámetro fiscal que NO tenemos. Nunca vale cero: cero sería afirmar que no paga. */
const desconocido = (motivo, pregunta) => ({ estado: DESCONOCIDO, valor: null, motivo, pregunta })

/**
 * LA ALÍCUOTA DEL IMPUESTO AL CHEQUE. Siempre se aplica: la de la Ley 25.413 es una norma general, no
 * una estimación, y este agente ya la contrastó contra el cargo real del banco.
 *
 * ═══ POR QUÉ NO PUEDE CAER A CERO CUANDO NO HAY MEDICIÓN ═══
 *
 * La primera versión dejaba la alícuota en DESCONOCIDO si no podía medirla, y eso hacía que el
 * impuesto NO se restara: sin base de datos, los rendimientos volvían a publicarse como si sacar la
 * plata del banco fuera gratis. O sea, el defecto que este módulo existe para matar reaparecía por la
 * puerta de atrás, y encima en silencio. Una medición que falla degrada la CONFIANZA, nunca el monto.
 *
 * Si el banco cobró algo distinto de lo declarado, manda lo que el banco cobró —es lo que
 * efectivamente sale de la cuenta— y el conflicto se declara.
 */
export function leyDeCheque(medicion = null) {
  const base = {
    estado: 'conocido',
    valor: LEY_25413_DECLARADA,
    fuente: 'alícuota general de la Ley 25.413 (0,6% al débito + 0,6% al crédito)',
    verificacion: { estado: 'sin_verificar', motivo: medicion?.motivo ?? 'no se pudo contrastar contra el extracto en esta corrida' },
  }
  if (medicion?.estado === 'verificada') {
    return {
      ...base,
      valor: medicion.medida,
      fuente: `${medicion.fuente} — el cargo real del banco coincide con la alícuota declarada`,
      verificacion: { estado: 'verificada', medida: medicion.medida, base: medicion.base, ventana: medicion.ventana },
    }
  }
  if (medicion?.estado === 'conflictiva') {
    return {
      ...base,
      valor: medicion.medida,
      fuente: `${medicion.fuente} — SE USA LO QUE EL BANCO COBRÓ, no la alícuota declarada`,
      verificacion: { estado: 'conflictiva', motivo: medicion.motivo, medida: medicion.medida, declarada: LEY_25413_DECLARADA },
    }
  }
  return base
}

/**
 * ARMA LOS PARÁMETROS FISCALES de la corrida. La política aprobada del dueño manda sobre todo; lo que
 * ella no diga queda DESCONOCIDO, salvo la Ley 25.413 cuando la medición contra el banco la confirma.
 *
 * @param {object} opts {medicion: salida de medirLey25413, politica: fila de tesoreria.politicas}
 */
export function parametrosFiscales({ medicion = null, politica = null } = {}) {
  const p = (politica && typeof politica.valor === 'object' && politica.valor) || {}
  const aprobadaPor = politica?.aprobada_por ?? null
  return {
    ley_25413: leyDeCheque(medicion),
    iibb: num(p.iibb_intereses) != null
      ? conocido(Number(p.iibb_intereses), `política aprobada ${CLAVE_POLITICA_FISCAL}${aprobadaPor ? ` por ${aprobadaPor}` : ''}`, { jurisdiccion: 'San Juan' })
      : desconocido(
        'no hay alícuota verificada de Ingresos Brutos de San Juan para intereses ganados (actividad financiera). NO es la alícuota de la construcción',
        '¿qué alícuota de IIBB San Juan corresponde a los intereses/resultados financieros de la empresa? (consultar al estudio contable / DGR San Juan)',
      ),
    ganancias: num(p.ganancias_marginal) != null
      ? conocido(Number(p.ganancias_marginal), `política aprobada ${CLAVE_POLITICA_FISCAL}${aprobadaPor ? ` por ${aprobadaPor}` : ''}`, { jurisdiccion: 'nacional' })
      : desconocido(
        'la alícuota marginal de Ganancias depende de la posición fiscal de la empresa (tramo, quebrantos, anticipos): no se puede afirmar desde acá',
        '¿a qué alícuota marginal de Ganancias tributa hoy el resultado financiero de la empresa?',
      ),
    // Lo que este módulo NO evalúa, dicho por su nombre. Un alcance que no se declara se lee como cobertura.
    fuera_de_alcance: [
      'IVA sobre intereses de colocaciones financieras: no evaluado en esta versión',
      'retenciones/percepciones que el bróker o el banco puedan practicar sobre la acreditación',
      'SIRCREB sobre las acreditaciones bancarias',
    ],
  }
}

/**
 * Una carga fiscal calculada. `peso_sobre_capital` es la fracción del capital que se lleva, y es lo
 * que se resta del rendimiento del período.
 *
 * ═══ POR QUÉ LA CUENTA ES EN FRACCIONES Y NO EN PESOS ═══
 *
 * Las tablas de referencia se publican con monto 0 (cuando no hay un peso colocable, el mercado se
 * informa igual). Calculando en pesos, un capital de 0 daba 0 de impuesto y la tabla mostraba
 * rendimientos que parecían netos y eran brutos: exactamente el defecto que este módulo viene a
 * matar, colado por la puerta de atrás. En fracciones, la alícuota es la misma haya o no plata.
 */
const carga = (concepto, jurisdiccion, base, fraccionBase, alicuota, fuente, capital) => ({
  concepto,
  jurisdiccion,
  base,
  alicuota,
  peso_sobre_capital: fraccionBase * alicuota,
  base_pesos: Math.round(fraccionBase * capital),
  monto: Math.round(fraccionBase * alicuota * capital),
  fuente,
})

/**
 * IMPUESTO AL CHEQUE DE UNA COLOCACIÓN. Sobre el CAPITAL, por las dos puntas, salvo que el
 * tratamiento de la familia diga que no se puede afirmar.
 */
function cargaLey25413(capital, tratamiento, ley) {
  if (tratamiento.puntas == null) {
    return { pendiente: { concepto: 'Impuesto Ley 25.413 (débitos y créditos)', motivo: tratamiento.motivo_puntas, pregunta: '¿el plazo fijo se constituiría en el mismo banco donde está la cuenta?' } }
  }
  if (ley.estado !== 'conocido') {
    return { pendiente: { concepto: 'Impuesto Ley 25.413 (débitos y créditos)', motivo: ley.motivo ?? 'alícuota sin verificar', pregunta: ley.pregunta ?? '¿se puede verificar la alícuota contra el extracto?' } }
  }
  const tasa = Number(ley.valor.debito) + Number(ley.valor.credito)
  return {
    carga: carga(
      `Impuesto Ley 25.413 · ${tratamiento.puntas} punta(s) sobre el capital`, 'nacional',
      'capital colocado', 1, tasa, ley.fuente, capital,
    ),
  }
}

/**
 * LOS IMPUESTOS DE UNA COLOCACIÓN CONCRETA. Devuelve el bruto, cada descuento por separado y el neto
 * — y cuando falta una alícuota, devuelve el neto de lo CONOCIDO y la lista de lo que falta, nunca un
 * neto que finge estar completo.
 *
 * @param {object} o {capital, rendimientoBrutoPeriodo (fracción del capital), categoria, parametros}
 */
export function impuestosDeColocacion({ capital = 0, rendimientoBrutoPeriodo = null, categoria = null, parametros = null } = {}) {
  const K = Number(capital) || 0
  const bruta = num(rendimientoBrutoPeriodo)
  const trat = TRATAMIENTO[categoria] ?? { puntas: null, motivo_puntas: `familia "${categoria}" sin tratamiento fiscal declarado`, renta: DESCONOCIDO }
  const par = parametros ?? parametrosFiscales({})
  if (bruta == null) {
    return { estado: 'sin_dato', motivo: 'sin rendimiento bruto no hay impuesto que calcular', capital: K, tratamiento: trat }
  }
  const cargas = []
  const pendientes = []

  const ley = cargaLey25413(K, trat, par.ley_25413)
  if (ley.carga) cargas.push(ley.carga); else pendientes.push(ley.pendiente)

  if (par.iibb.estado === 'conocido') {
    cargas.push(carga('Ingresos Brutos sobre el resultado financiero', 'San Juan', trat.renta, bruta, Number(par.iibb.valor), par.iibb.fuente, K))
  } else {
    pendientes.push({ concepto: 'Ingresos Brutos (San Juan) sobre el resultado financiero', motivo: par.iibb.motivo, pregunta: par.iibb.pregunta })
  }

  // Fracción del capital que queda antes de Ganancias: el bruto menos lo ya descontado.
  const antesDeGanancias = bruta - cargas.reduce((s, c) => s + c.peso_sobre_capital, 0)
  if (par.ganancias.estado === 'conocido') {
    // Ganancias muerde DESPUÉS de IIBB y del impuesto al cheque: los dos son gasto del mismo resultado.
    cargas.push(carga('Impuesto a las Ganancias', 'nacional', trat.renta, Math.max(0, antesDeGanancias), Number(par.ganancias.valor), par.ganancias.fuente, K))
  } else {
    pendientes.push({ concepto: 'Impuesto a las Ganancias', motivo: par.ganancias.motivo, pregunta: par.ganancias.pregunta })
  }

  const costoFiscal = cargas.reduce((s, c) => s + c.peso_sobre_capital, 0)
  const neto = bruta - costoFiscal
  return {
    estado: 'ok',
    capital: Math.round(K),
    categoria,
    tratamiento: trat,
    rendimiento_bruto_periodo: bruta,
    bruto_pesos: Math.round(K * bruta),
    cargas,
    // Lo que falta para poder decir "neto" sin asterisco. Si esto no está vacío, el número de abajo
    // es un neto PARCIAL y así se publica.
    pendientes,
    total_conocido_pesos: Math.round(K * costoFiscal),
    // Como fracción del capital: es directamente restable del rendimiento del período.
    costo_fiscal_periodo: costoFiscal,
    rendimiento_antes_de_ganancias_periodo: antesDeGanancias,
    neto_antes_de_ganancias_pesos: Math.round(K * antesDeGanancias),
    neto_pesos: Math.round(K * neto),
    rendimiento_neto_periodo: neto,
    // LA REGLA: sin todas las alícuotas, esto NO es un rendimiento neto y no se puede publicar como tal.
    completo: pendientes.length === 0,
    etiqueta_neto: pendientes.length === 0
      ? 'neto de impuestos'
      : `neto SÓLO de los impuestos conocidos — falta ${pendientes.map((p) => p.concepto).join(' y ')}`,
  }
}

export const VERSION_SKILL = '1.0.0'
