// LA COMPARACIÓN AL DETALLE — un instrumento suelto no es una decisión.
//
// ═══ QUÉ FALTABA ═══
//
// El ciclo terminaba con "la mejor alternativa" o con nada. El dueño pidió otra cosa, y tiene razón:
// para decidir dónde poner plata hace falta ver TODAS las opciones viables una al lado de la otra, con
// lo que cada una rinde EN PESOS sobre el monto que se colocaría, y con lo que la invalida. Un ranking
// que devuelve un nombre obliga a confiar; una tabla deja auditar.
//
// ═══ LA VARA QUE HACE QUE ESTO IMPORTE ═══
//
// Echegaray paga **62,78% de CFT** por el descubierto del acuerdo N°00007 (verificado: ×1,12 por IVA
// 10,5% + percepción 1,5%, $1.506,85 por día por millón). Cualquier instrumento que rinda menos que eso
// pierde contra simplemente no entrar en descubierto. Esa línea va EN la tabla, no en una nota: sin
// ella, un money market al 35% parece una buena idea.
//
// ═══ LAS CUATRO FAMILIAS QUE SIEMPRE SE INFORMAN ═══
//
// Caución bursátil, FCI money market (T+0), Lecap/letra del Tesoro y plazo fijo. Si el relevamiento no
// trajo alguna, la fila existe igual y dice **DESCONOCIDO** con el motivo. Omitirla haría indistinguible
// "no hay" de "no se miró", y ésa es exactamente la confusión que hizo que el dueño rechazara el
// resultado dos veces.
//
// ═══ NO SE FABRICA NINGUNA TASA ═══
//
// Lo que la pantalla no publicó se declara DESCONOCIDO. La TNA se informa sólo si el bróker la declaró;
// la equivalente se marca como CÁLCULO. El monto mínimo no viaja en ninguna pantalla de Balanz que este
// repo lea: es un gap declarado, no un supuesto.

import { EVIDENCIA, CONFIANZA, TIPO_TASA } from './contratos.mjs'
import { aTea, esAptoTesoreria, esNumero, tasaCreible, CATEGORIAS } from './instrumentos.mjs'
import { rendimientoDelPeriodo, costoTotal, liquidezCompatible } from './comparar.mjs'

export const DESCONOCIDO = 'DESCONOCIDO'

/** Las familias que la comparación informa SIEMPRE, traiga o no el relevamiento una de cada una. */
export const FAMILIAS_OBLIGATORIAS = [
  { categoria: 'caucion', titulo: 'Caución bursátil' },
  { categoria: 'money_market', titulo: 'FCI money market (T+0)' },
  { categoria: 'lecap', titulo: 'Lecap / letra del Tesoro' },
  { categoria: 'plazo_fijo', titulo: 'Plazo fijo' },
]

/** TEA → TNA con capitalización mensual. Es la inversa exacta de `tnaATea`: aritmética, no supuesto. */
export const teaATna = (tea, m = 12) => (((1 + Number(tea)) ** (1 / m)) - 1) * m

/**
 * LIQUIDEZ EN PALABRAS, no en un número suelto. "¿Se puede desarmar antes? ¿con qué castigo?" es la
 * pregunta que hace un tesorero, y `plazo_rescate_dias: 0` no la contesta.
 */
export function describirLiquidez(inst = {}) {
  const r = esNumero(inst.plazo_rescate_dias) ? Number(inst.plazo_rescate_dias) : null
  const l = esNumero(inst.liquidacion_dias) ? Number(inst.liquidacion_dias) : null
  const castigo = esNumero(inst.costos?.salida_anticipada) ? Number(inst.costos.salida_anticipada) : null
  if (r == null) return { texto: DESCONOCIDO, dias_vuelta: null, motivo: 'el bróker no publica el plazo de rescate' }
  const total = r + (l ?? 0)
  const base = r === 0 ? 'T+0: se rescata el mismo día' : `T+${r}`
  return {
    texto: [
      base,
      l != null && l > 0 ? `liquida en ${l} día(s) más` : null,
      // Un plazo fijo NO se desarma antes: es la diferencia práctica con un fondo, y es la que
      // decide cuando la fecha de tensión de la caja se mueve.
      inst.categoria === 'plazo_fijo' ? 'NO se puede desarmar antes del vencimiento'
        : inst.categoria === 'caucion' ? 'NO se puede desarmar antes: la caución se cancela a su vencimiento'
          : castigo != null ? `salida anticipada con castigo de ${(castigo * 100).toFixed(2)}% del período`
            : 'se puede rescatar antes; el bróker no publica castigo de salida anticipada',
    ].filter(Boolean).join(' · '),
    dias_vuelta: total,
    castigo_salida: castigo,
  }
}

/** Los riesgos que importan de este instrumento, en el orden que importan para una tesorería. */
export function describirRiesgo(inst = {}, riesgo = null) {
  const out = []
  if (riesgo?.hallazgos?.length) {
    for (const h of riesgo.hallazgos) out.push(`${h.tipo} (${h.nivel}): ${h.detalle}`)
  }
  if (inst.categoria === 'caucion') out.push('crédito: garantizado por el mercado (BYMA) — el riesgo de crédito es el más bajo del universo')
  if (inst.categoria === 'money_market') out.push('precio: no marca a mercado, no puede dar rendimiento negativo por precio')
  if (inst.categoria === 'lecap') out.push('precio: cotiza a mercado — vender antes del vencimiento puede dar pérdida de capital')
  if (inst.moneda !== 'ARS') out.push(`moneda: el instrumento es ${inst.moneda} y las obligaciones de la empresa son en pesos (descalce)`)
  return out.length ? out : ['sin hallazgos de riesgo declarados por el evaluador']
}

/**
 * UNA FILA DE LA TABLA. Devuelve SIEMPRE la fila —también cuando el instrumento no es viable— con el
 * motivo que lo invalida. Un instrumento que desaparece sin explicación vuelve a proponerse el mes que
 * viene.
 */
export function filaDeInstrumento(inst, { dias, monto, hurdlePeriodo, hurdleAnual, riesgo = null } = {}) {
  const tea = aTea(inst.tasa)
  const cordura = tea == null ? { creible: false, motivo: 'sin tasa convertible a efectiva anual' } : tasaCreible(tea)
  const liq = describirLiquidez(inst)
  const compat = liquidezCompatible(inst, dias)
  const costos = costoTotal(inst)
  const bruto = tea != null && cordura.creible ? rendimientoDelPeriodo(tea, dias) : null
  const neto = bruto == null ? null : bruto - costos.total
  const tnaDeclarada = inst.tasa?.tipo === TIPO_TASA.TNA ? Number(inst.tasa.valor) : null

  const invalidan = []
  if ((inst.campos_faltantes || []).includes('moneda_no_declarada_en_pantalla')) invalidan.push('la pantalla no declara la moneda: no se compara contra una moneda asumida')
  else if (inst.moneda !== 'ARS') invalidan.push(`el instrumento es ${inst.moneda} y la ventana es en pesos`)
  if (!esAptoTesoreria(inst.categoria)) invalidan.push(`la categoría "${CATEGORIAS[inst.categoria]?.titulo ?? inst.categoria}" no es apta para caja operativa`)
  if (!compat.compatible) invalidan.push(compat.motivo)
  if (tea == null) invalidan.push(inst.tasa ? `la tasa es "${inst.tasa.tipo}" y no se puede llevar a efectiva anual sin inventar` : 'no tiene tasa conocida')
  else if (!cordura.creible) invalidan.push(cordura.motivo)
  else if (neto != null && neto <= hurdlePeriodo) {
    invalidan.push(`rinde ${(neto * 100).toFixed(2)}% neto en ${dias} días y la vara de esta ventana es ${(hurdlePeriodo * 100).toFixed(2)}%`)
  }
  if (riesgo && !riesgo.apto) invalidan.push(...(riesgo.bloqueantes?.length ? riesgo.bloqueantes : [`riesgo ${riesgo.nivel_instrumento} por encima del máximo del perfil (${riesgo.max_riesgo_perfil})`]))

  return {
    instrumento: inst.nombre,
    ticker: inst.ticker ?? DESCONOCIDO,
    categoria: inst.categoria,
    familia: CATEGORIAS[inst.categoria]?.titulo ?? inst.categoria,
    moneda: inst.moneda,
    // TNA sólo si el bróker la declaró; la equivalente sale de la TEA y se marca como CÁLCULO.
    tna_declarada: tnaDeclarada,
    tna_equivalente: tea != null && cordura.creible && tnaDeclarada == null ? teaATna(tea) : null,
    tea: tea != null && cordura.creible ? tea : null,
    tea_publicada_sospechosa: cordura.sospechosa ? tea : null,
    tipo_tasa: inst.tasa?.tipo ?? DESCONOCIDO,
    naturaleza_tasa: inst.tasa?.naturaleza ?? DESCONOCIDO,
    plazo_dias: dias,
    liquidez: liq.texto,
    dias_vuelta: liq.dias_vuelta,
    riesgos: describirRiesgo(inst, riesgo),
    nivel_riesgo: riesgo?.nivel_instrumento ?? DESCONOCIDO,
    // NINGUNA PANTALLA DE BALANZ QUE ESTE REPO LEA PUBLICA EL MÍNIMO. Se declara faltante, no se supone.
    monto_minimo: esNumero(inst.monto_minimo) ? Number(inst.monto_minimo) : DESCONOCIDO,
    costos_periodo: costos.conocido ? costos.total : DESCONOCIDO,
    rendimiento_bruto_periodo: bruto,
    rendimiento_neto_periodo: neto,
    // EL NÚMERO QUE ENTIENDE CUALQUIERA: cuánta plata es, sobre el monto que se colocaría.
    rinde_en_pesos: neto != null ? Math.round(Number(monto) * neto) : null,
    exceso_sobre_vara: neto != null ? neto - hurdlePeriodo : null,
    // Lo que se pierde por NO colocar: el mismo monto al costo del descubierto.
    costo_de_no_hacer_nada: Math.round(Number(monto) * hurdlePeriodo),
    viable: invalidan.length === 0,
    que_lo_invalida: invalidan,
    cotizado_en: inst.cotizado_en ?? DESCONOCIDO,
    fuente: inst.url ?? 'Balanz',
    evidencia: inst.evidencia ?? EVIDENCIA.DATO,
    hurdle_anual: hurdleAnual,
  }
}

/**
 * LA TABLA DE UNA VENTANA. Ordenada por rendimiento NETO en pesos, con las viables arriba y las
 * descartadas abajo con su motivo, y con la fila de referencia del descubierto que fija la vara.
 */
export function tablaDeVentana(instrumentos = [], ventana = {}, { hurdleAnual = 0, riesgos = {} } = {}) {
  const dias = Number(ventana.dias_libres ?? ventana.dias) || 0
  const monto = Number(ventana.monto_maximo) || 0
  const hurdlePeriodo = Number(ventana.referencia?.hurdle_periodo)
  const vara = Number.isFinite(hurdlePeriodo) ? hurdlePeriodo : rendimientoDelPeriodo(hurdleAnual, dias)
  const filas = instrumentos.map((i) => filaDeInstrumento(i, {
    dias, monto, hurdlePeriodo: vara, hurdleAnual, riesgo: riesgos[i.id] ?? null,
  }))
  const viables = filas.filter((f) => f.viable)
    .sort((a, b) => (b.rendimiento_neto_periodo - a.rendimiento_neto_periodo) || (a.dias_vuelta - b.dias_vuelta))
  const descartadas = filas.filter((f) => !f.viable)

  // LAS FAMILIAS QUE FALTAN SE DICEN. Una tabla sin caución no significa que la caución no sirva.
  const presentes = new Set(filas.map((f) => f.categoria))
  const faltantes = FAMILIAS_OBLIGATORIAS.filter((f) => !presentes.has(f.categoria)).map((f) => ({
    familia: f.titulo,
    categoria: f.categoria,
    estado: DESCONOCIDO,
    motivo: f.categoria === 'plazo_fijo'
      ? 'el plazo fijo no cotiza en Balanz: la tasa la da el banco y hoy nadie la declaró en el OS. Sin tasa declarada no se estima.'
      : 'el relevamiento de esta corrida no trajo ningún instrumento de esta familia',
  }))

  return {
    dias,
    monto_a_colocar: monto,
    bloque: ventana.bloque ?? null,
    titulo: ventana.titulo ?? null,
    // LA REFERENCIA QUE HACE QUE TODO ESTO IMPORTE.
    vara: {
      anual: hurdleAnual,
      periodo: vara,
      en_pesos: Math.round(monto * vara),
      explicacion: ventana.referencia?.explicacion
        ?? `costo del descubierto del acuerdo N°00007: ${(hurdleAnual * 100).toFixed(2)}% CFT (IVA 10,5% + percepción 1,5% incluidos)`,
      modo: ventana.referencia?.modo ?? 'cft_conservador',
    },
    viables,
    descartadas,
    familias_sin_dato: faltantes,
    recomendacion: viables[0] ?? null,
    // POR QUÉ NO LAS OTRAS. Es la mitad de la respuesta y la que nunca se escribe.
    por_que_no_las_otras: viables.slice(1).map((f) => ({
      instrumento: f.instrumento,
      motivo: `rinde ${((f.rendimiento_neto_periodo ?? 0) * 100).toFixed(2)}% contra ${((viables[0]?.rendimiento_neto_periodo ?? 0) * 100).toFixed(2)}% de la recomendada`
        + (f.dias_vuelta > (viables[0]?.dias_vuelta ?? 0) ? ` y devuelve la plata ${f.dias_vuelta - viables[0].dias_vuelta} día(s) más tarde` : ''),
    })).concat(descartadas.map((f) => ({ instrumento: f.instrumento, motivo: f.que_lo_invalida[0] }))),
    veredicto: viables.length
      ? `${viables.length} alternativa(s) superan el ${(vara * 100).toFixed(2)}% que cuesta el peso propio en ${dias} días`
      : `ninguna alternativa supera el ${(vara * 100).toFixed(2)}% que cuesta el peso propio en ${dias} días: la mejor colocación es no entrar en descubierto`,
    evidencia: EVIDENCIA.CALCULO,
    confianza: instrumentos.length ? CONFIANZA.MEDIA : CONFIANZA.NULA,
  }
}

/** Una tabla por ventana con monto. Sin ventanas con monto se devuelve igual, informativa. */
export function tablaComparativa(instrumentos = [], ventanas = [], { hurdleAnual = 0, riesgos = {} } = {}) {
  return {
    estado: 'ok',
    hurdle_anual: hurdleAnual,
    tablas: ventanas.map((v) => tablaDeVentana(instrumentos, v, { hurdleAnual, riesgos })),
    n_instrumentos: instrumentos.length,
    evidencia: EVIDENCIA.CALCULO,
  }
}

export const VERSION_SKILL = '1.0.0'
