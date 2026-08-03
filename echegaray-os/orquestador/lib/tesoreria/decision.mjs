// LAS DOS DECISIONES DE TESORERÍA, SEPARADAS — cancelar descubierto no es lo mismo que colocar.
//
// ═══ EL DEFECTO CONCEPTUAL QUE ESTE MÓDULO MATA ═══
//
// El motor usaba el CFT del descubierto (62,78%) como vara para decidir si una colocación valía la
// pena. Ninguna colocación de tesorería a 30–90 días paga eso, así que NADA pasaba el filtro nunca:
// cuatro tablas publicadas y cero propuestas, tres corridas rechazadas por el dueño.
//
// El error no es aritmético. **El descubierto es lo que cuesta estar CORTO, no el costo de
// oportunidad de estar LARGO.** Son dos preguntas distintas y se contestan por separado:
//
//   1. ¿Tengo saldo deudor? → cancelarlo. Bajar un peso de rojo rinde 62,78% libre de riesgo, sin
//      plazo de rescate y sin impuesto sobre la renta: le gana a cualquier instrumento del mercado.
//      Ésta es la PRIMERA propuesta y no compite con ninguna otra.
//
//   2. Sobre lo que queda DESPUÉS de cancelar y de dejar la reserva → ¿colocar o dejar quieto? La
//      alternativa real de esa plata no es el descubierto: es CERO, porque iba a quedarse parada. Un
//      plazo fijo al 30% neto sobre plata dormida es ganancia pura aunque el descubierto cueste el
//      doble. La vara es rendimiento neto de impuestos > 0.
//
// El costo del descubierto vuelve a entrar en (2) por una sola puerta y con otro nombre: si
// inmovilizar puede empujar la caja al rojo antes del vencimiento, ese costo esperado sube la vara.
// Eso ya lo simula `costo-liquidez.mjs` sobre el calendario real, y acá se LEE, no se recalcula.
//
// ═══ POR QUÉ EL "NETO" LLEVA SU ASTERISCO ═══
//
// IIBB San Juan sobre renta financiera y la alícuota marginal de Ganancias siguen siendo DESCONOCIDO
// (ver `impuestos-colocacion.mjs`). Un neto que omite impuestos desconocidos es un número optimista
// disfrazado de exacto: cada propuesta publica qué impuestos contempla y cuáles no, y se marca como
// TECHO mientras falte alguno. No se bloquea por eso —bloquear sería reinventar el defecto de arriba—
// pero el dueño ve que el resultado real es menor.

import { EVIDENCIA, CONFIANZA } from './contratos.mjs'
import { MODO } from './costo-liquidez.mjs'

/** Rendimiento efectivo de una TEA por `dias` días. La MISMA aritmética que usa el resto del motor. */
export const rendimientoPeriodo = (tea, dias) => (1 + Number(tea)) ** (Number(dias) / 365) - 1

/**
 * POR QUÉ NO HAY PROPUESTA. Cada código es una causa distinta y pide una acción distinta del dueño.
 * "0 propuestas" sin código no distingue "no conviene" de "el sistema no supo", y eso fue lo que el
 * dueño rechazó: no se puede decidir sobre un silencio.
 */
export const MOTIVO = {
  SIN_EXCEDENTE: 'sin_excedente',
  TODO_A_DESCUBIERTO: 'todo_a_descubierto',
  SIN_INSTRUMENTO: 'sin_instrumento_con_cotizacion_vigente',
  BREAK_EVEN_CHEQUE: 'no_supera_break_even_impuesto_al_cheque',
  NO_SUPERA_VARA: 'no_supera_la_vara',
  VENTANA_CERRADA: 'ventana_cerrada',
}

const redondear = (n) => Math.round(Number(n) || 0)
const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : null)

// ════════════════════════════════════════════════════════════════════════════
// DECISIÓN 1 · CANCELAR DESCUBIERTO
// ════════════════════════════════════════════════════════════════════════════

/**
 * CUÁNTO CONVIENE CANCELAR Y CUÁNTO SE AHORRA. Pura.
 *
 * El monto es el mínimo entre la deuda y lo que hay disponible sin perforar la reserva: cancelar
 * deuda con plata que se necesita para pagar sueldos no cancela nada, sólo mueve el problema.
 *
 * @param {object} p
 * @param {number} p.deuda saldo deudor por cuenta (de `deudaCancelable`), en pesos
 * @param {number} p.disponible caja líquida en pesos aplicable hoy
 * @param {number} [p.reserva] reserva mínima aprobada que NO se toca
 * @param {number} p.cftAnual costo financiero total anual del acuerdo, verificado
 * @param {number} [p.dias] horizonte sobre el que se expresa el ahorro
 */
export function cancelarDescubierto({ deuda = 0, disponible = 0, reserva = 0, cftAnual = 0, dias = 30 } = {}) {
  const d = Math.max(0, num(deuda) ?? 0)
  const libre = Math.max(0, (num(disponible) ?? 0) - Math.max(0, num(reserva) ?? 0))
  const monto = Math.min(d, libre)
  const cft = Math.max(0, num(cftAnual) ?? 0)
  const cftPeriodo = rendimientoPeriodo(cft, dias)
  if (!(d > 0)) {
    return {
      hay_propuesta: false, motivo: 'no hay saldo deudor: no hay descubierto que cancelar',
      deuda: 0, monto_a_cancelar: 0, remanente_disponible: Math.max(0, libre),
      evidencia: EVIDENCIA.DATO, confianza: CONFIANZA.ALTA,
    }
  }
  if (!(monto > 0)) {
    return {
      hay_propuesta: false,
      motivo: `hay $${redondear(d).toLocaleString('es-AR')} de descubierto pero no hay caja libre por encima de la reserva para cancelarlo`,
      deuda: redondear(d), monto_a_cancelar: 0, remanente_disponible: 0,
      evidencia: EVIDENCIA.DATO, confianza: CONFIANZA.ALTA,
    }
  }
  return {
    hay_propuesta: true,
    prioridad: 1, // le gana a cualquier colocación, siempre: mismo rendimiento sin riesgo ni plazo
    deuda: redondear(d),
    monto_a_cancelar: redondear(monto),
    // Lo que queda para la decisión 2. Es el único excedente que se puede colocar.
    remanente_disponible: redondear(libre - monto),
    deuda_remanente: redondear(d - monto),
    rendimiento_equivalente_anual: cft,
    rendimiento_equivalente_periodo: cftPeriodo,
    ahorro_periodo: redondear(monto * cftPeriodo),
    ahorro_diario: redondear(monto * cft / 365),
    dias,
    fundamento: `el acuerdo cuesta ${(cft * 100).toFixed(2)}% efectivo anual con IVA y percepción incluidos. `
      + `Bajar $${redondear(monto).toLocaleString('es-AR')} de rojo rinde exactamente eso —${(cftPeriodo * 100).toFixed(2)}% en ${dias} días— `
      + 'sin riesgo de capital, sin plazo de rescate y sin impuesto sobre la renta. Ninguna colocación de mercado le gana.',
    riesgos: ['ninguno de mercado: es cancelación de deuda propia'],
    evidencia: EVIDENCIA.HECHO,
    confianza: CONFIANZA.ALTA,
  }
}

// ════════════════════════════════════════════════════════════════════════════
// DECISIÓN 2 · COLOCAR EL EXCEDENTE QUE QUEDA
// ════════════════════════════════════════════════════════════════════════════

/**
 * A CUÁNTOS DÍAS UNA COLOCACIÓN EMPIEZA A DEJAR PLATA. Debajo de eso, el impuesto al cheque se lleva
 * toda la ganancia y colocar es perder con papeleo.
 *
 * La carga NO se recalcula acá: entra medida desde `impuestosDeColocacion` (Ley 25.413, ida y vuelta,
 * contrastada contra el cargo real del Santander). Lo que se hace es invertir la MISMA función de
 * rendimiento que usa todo el motor, así el corte por días y el corte por neto ≤ 0 no pueden
 * discrepar nunca: son la misma desigualdad escrita de dos formas.
 *
 * El corte por días existe porque el MOTIVO importa. "Rinde 0,80% y la vara es 0%" no explica nada;
 * "a 12 días el impuesto al cheque se lleva más de lo que rinde, hace falta 21" dice qué hacer.
 */
export function diasBreakEvenCheque({ tea, cargaSobreCapital } = {}) {
  const t = num(tea)
  const c = num(cargaSobreCapital)
  if (t == null || c == null || !(c > 0)) return null
  if (!(t > 0)) return Infinity // una tasa nula nunca cubre un costo fijo
  return 365 * Math.log(1 + c) / Math.log(1 + t)
}

/** La vara de una colocación. NUNCA es el CFT del descubierto: es cero, o el costo de empujar al rojo. */
export function varaDeColocacion(referencia = null) {
  // Se lee el tramo NO-deuda de la referencia que `costo-liquidez` ya calculó sobre el calendario
  // real. El tramo de cancelación de deuda pertenece a la decisión 1 y no gobierna a la 2.
  const tramo = (referencia?.tramos || []).filter((t) => t.modo !== MODO.CANCELACION_DEUDA).pop()
  if (!tramo) {
    return {
      periodo: 0, modo: MODO.COSTO_OPORTUNIDAD,
      explicacion: 'no hay descubierto ni riesgo simulado de provocarlo: la alternativa de esta plata es quedarse quieta rindiendo cero',
      evidencia: EVIDENCIA.CALCULO,
    }
  }
  return {
    periodo: Math.max(0, num(tramo.hurdle_periodo) ?? 0),
    modo: tramo.modo,
    explicacion: tramo.motivo,
    evidencia: tramo.evidencia ?? EVIDENCIA.CALCULO,
    contingencia: tramo.contingencia ?? null,
  }
}

/** Qué impuestos contempla el neto publicado y cuáles no. Un neto sin esto es optimismo con formato. */
function etiquetarNeto(impuestos = null) {
  const contempla = (impuestos?.cargas || []).map((c) => `${c.concepto} (${c.jurisdiccion})`)
  const noContempla = (impuestos?.pendientes || []).map((p) => p.concepto)
  return {
    contempla,
    no_contempla: noContempla,
    es_techo: noContempla.length > 0,
    etiqueta: impuestos?.etiqueta_neto
      ?? (noContempla.length ? `neto SÓLO de ${contempla.join(' y ') || 'nada'}` : 'neto de impuestos'),
  }
}

/** Evalúa UN candidato contra la vara de colocación. Devuelve la fila o el descarte con su código. */
function evaluarCandidato(c, { dias, vara }) {
  const neto = num(c.rendimiento_neto_periodo)
  const carga = num(c.impuestos?.costo_fiscal_periodo) ?? 0
  const breakEven = diasBreakEvenCheque({ tea: c.tea, cargaSobreCapital: carga })
  const fila = {
    instrumento_id: c.instrumento_id ?? c.id ?? null,
    instrumento: c.instrumento ?? c.nombre ?? 'sin nombre',
    categoria: c.categoria ?? null,
    tea: num(c.tea),
    dias,
    rendimiento_neto_periodo: neto,
    exceso_sobre_vara: neto == null ? null : neto - vara.periodo,
    dias_break_even_cheque: breakEven == null || !Number.isFinite(breakEven) ? breakEven : Math.ceil(breakEven),
    neto_declarado: etiquetarNeto(c.impuestos),
  }
  if (neto == null) return { ...fila, viable: false, codigo: MOTIVO.SIN_INSTRUMENTO, motivo: 'no tiene rendimiento neto calculable' }
  if (breakEven != null && dias < breakEven) {
    return {
      ...fila, viable: false, codigo: MOTIVO.BREAK_EVEN_CHEQUE,
      motivo: `a ${dias} días el impuesto al cheque (${(carga * 100).toFixed(2)}% del capital, ida y vuelta) se lleva más de lo que rinde: `
        + `hacen falta ${Number.isFinite(breakEven) ? Math.ceil(breakEven) : 'infinitos'} días para empatar`,
    }
  }
  if (!(neto > vara.periodo)) {
    return {
      ...fila, viable: false, codigo: MOTIVO.NO_SUPERA_VARA,
      motivo: `rinde ${(neto * 100).toFixed(2)}% ${fila.neto_declarado.etiqueta} en ${dias} días y la vara es ${(vara.periodo * 100).toFixed(2)}% — ${vara.explicacion}`,
    }
  }
  return { ...fila, viable: true, codigo: null, motivo: null }
}

/**
 * DECISIÓN 2. Sobre el excedente que queda después de cancelar el descubierto y de preservar la
 * reserva, ¿qué conviene colocar? Pura: no lee nada y no simula nada — la contingencia entra ya
 * calculada dentro de `referencia`.
 *
 * @param {object} p
 * @param {number} p.excedente pesos realmente colocables (netos de deuda y reserva)
 * @param {number} p.dias horizonte de la ventana
 * @param {Array}  p.candidatos filas ya evaluadas (tea, rendimiento_neto_periodo, impuestos)
 * @param {object} [p.referencia] salida de `tasaDeReferencia` para esta ventana
 */
export function colocarExcedente({ excedente = 0, dias = 0, candidatos = [], referencia = null, bloque = null, titulo = null } = {}) {
  const monto = Math.max(0, num(excedente) ?? 0)
  const vara = varaDeColocacion(referencia)
  const base = { bloque, titulo, dias, excedente: redondear(monto), vara, evidencia: EVIDENCIA.CALCULO }
  if (!(monto > 0)) {
    return {
      ...base, hay_propuesta: false, propuestas: [], descartados: [],
      codigo: MOTIVO.SIN_EXCEDENTE,
      motivo: `no hay excedente colocable a ${dias} días después de cubrir el descubierto y la reserva: no hay nada que decidir`,
      confianza: CONFIANZA.ALTA,
    }
  }
  if (!candidatos.length) {
    return {
      ...base, hay_propuesta: false, propuestas: [], descartados: [],
      codigo: MOTIVO.SIN_INSTRUMENTO,
      motivo: `hay $${redondear(monto).toLocaleString('es-AR')} colocables a ${dias} días pero ningún instrumento con cotización vigente contra el cual compararlos`,
      confianza: CONFIANZA.NULA,
    }
  }
  const filas = candidatos.map((c) => evaluarCandidato(c, { dias, vara }))
  const viables = filas.filter((f) => f.viable).sort((a, b) => b.exceso_sobre_vara - a.exceso_sobre_vara)
  const descartados = filas.filter((f) => !f.viable)
  if (!viables.length) {
    // EL MOTIVO DOMINANTE, NO EL PRIMERO QUE APARECIÓ. Si todo cayó por el break-even, la respuesta es
    // "alargá el plazo"; si todo cayó por la vara, es "el mercado no paga". Son acciones distintas.
    const porBreakEven = descartados.filter((d) => d.codigo === MOTIVO.BREAK_EVEN_CHEQUE).length
    const codigo = porBreakEven >= descartados.length / 2 ? MOTIVO.BREAK_EVEN_CHEQUE : MOTIVO.NO_SUPERA_VARA
    return {
      ...base, hay_propuesta: false, propuestas: [], descartados, codigo,
      motivo: codigo === MOTIVO.BREAK_EVEN_CHEQUE
        ? `ninguno de los ${descartados.length} instrumentos cubre el impuesto al cheque en ${dias} días: a este plazo colocar cuesta más de lo que rinde`
        : `ninguno de los ${descartados.length} instrumentos supera la vara de ${(vara.periodo * 100).toFixed(2)}% del período (${vara.explicacion})`,
      confianza: CONFIANZA.MEDIA,
    }
  }
  return {
    ...base,
    hay_propuesta: true,
    prioridad: 2, // siempre después de cancelar descubierto
    propuestas: viables.map((f) => ({
      ...f,
      monto: redondear(monto),
      gana_en_pesos: redondear(monto * f.rendimiento_neto_periodo),
      // Si falta una alícuota, el resultado real es MENOR que el publicado. Se dice en la propuesta,
      // no en una nota al pie: el que decide lee la propuesta.
      advertencias: f.neto_declarado.es_techo
        ? [`el rendimiento publicado NO descuenta ${f.neto_declarado.no_contempla.join(' ni ')}: el resultado real es menor`]
        : [],
    })),
    descartados,
    codigo: null,
    motivo: `${viables.length} alternativa(s) rinden por encima de dejar la plata quieta a ${dias} días`,
    confianza: viables[0].neto_declarado.es_techo ? CONFIANZA.MEDIA : CONFIANZA.ALTA,
  }
}

// ════════════════════════════════════════════════════════════════════════════
// LA VENTANA QUE SE LE ENTREGA AL COMPARADOR
// ════════════════════════════════════════════════════════════════════════════

/**
 * LA DERIVACIÓN TIENE QUE SEGUIR CERRANDO. Bajar el monto colocable sin tocar el cuadro que lo explica
 * deja al dueño con dos números y ninguna forma de saber cuál manda — el módulo de derivación declara
 * eso como peor que no publicar nada. Así que el descuento se agrega COMO UN TÉRMINO MÁS del cierre,
 * con su origen, y el monto declarado se actualiza. Los términos de arriba no se tocan: la identidad
 * `Σ(términos) = piso` sigue siendo la misma.
 */
export function derivacionNetaDeDeuda(derivacion = null, aCancelar = 0) {
  const d = Math.max(0, num(aCancelar) ?? 0)
  if (derivacion?.estado !== 'ok' || !(d > 0)) return derivacion
  const nuevo = Math.max(0, redondear(derivacion.monto_maximo) - d)
  return {
    ...derivacion,
    cierre: [
      ...derivacion.cierre,
      {
        signo: '−', concepto: 'descubierto que se cancela primero', monto: -d,
        origen: { fuente: 'Flujo de Caja', pestana: 'CAJA', criterio: 'saldos negativos por cuenta: cancelar la línea rinde el CFT del acuerdo y le gana a cualquier colocación' },
      },
      {
        signo: '=', concepto: `colocable a ${derivacion.dias} días DESPUÉS de cancelar`, monto: nuevo,
        origen: { fuente: 'cálculo', pestana: null, criterio: 'lo que sobra una vez bajado el rojo: es lo único que se puede inmovilizar' },
      },
    ],
    monto_maximo: nuevo,
    chequeo: { ...derivacion.chequeo, monto_declarado: nuevo, monto_coincide: true },
  }
}

/**
 * LA VENTANA CON LAS DOS CORRECCIONES APLICADAS, para que el comparador y las tablas decidan sobre lo
 * mismo que la decisión: monto NETO de la deuda a cancelar, y vara de COLOCACIÓN (nunca el CFT).
 *
 * Se deja `monto_bruto_ventana` a la vista: el techo del calendario no desaparece, se explica.
 */
export function ventanaParaColocacion(ventana = {}, aCancelar = 0) {
  const d = Math.max(0, num(aCancelar) ?? 0)
  const bruto = Math.max(0, num(ventana.monto_maximo) ?? 0)
  const vara = varaDeColocacion(ventana.referencia)
  const derivacion = derivacionNetaDeDeuda(ventana.detalle_ventana?.derivacion ?? ventana.derivacion ?? null, d)
  return {
    ...ventana,
    monto_maximo: Math.max(0, redondear(bruto - d)),
    monto_bruto_ventana: redondear(bruto),
    descubierto_descontado: redondear(Math.min(d, bruto)),
    referencia: {
      ...(ventana.referencia ?? {}),
      hurdle_periodo: vara.periodo,
      modo: vara.modo,
      explicacion: vara.explicacion,
      // El CFT no se borra: se conserva como referencia visible para poder contrastar las dos varas.
      cft_periodo: ventana.referencia?.cft_periodo ?? null,
    },
    ...(derivacion ? { derivacion, detalle_ventana: { ...(ventana.detalle_ventana ?? {}), derivacion } } : {}),
  }
}

// ════════════════════════════════════════════════════════════════════════════
// LAS DOS, EN ORDEN
// ════════════════════════════════════════════════════════════════════════════

/**
 * PRIMERO CANCELAR, DESPUÉS COLOCAR. El orden no es estético: el excedente que se coloca es el que
 * SOBRA después de bajar el rojo, y mientras haya deuda ninguna colocación puede ser la primera
 * recomendación.
 *
 * @param {object} p
 * @param {number} p.deuda descubierto utilizado
 * @param {number} p.disponible caja líquida en pesos
 * @param {number} p.reserva reserva mínima aprobada
 * @param {number} p.cftAnual CFT verificado del acuerdo
 * @param {Array}  p.ventanas [{ bloque, titulo, dias, monto_maximo, referencia, candidatos }]
 */
export function decidirTesoreria({ deuda = 0, disponible = 0, reserva = 0, cftAnual = 0, ventanas = [] } = {}) {
  const cancelacion = cancelarDescubierto({ deuda, disponible, reserva, cftAnual, dias: 30 })
  const aCancelar = cancelacion.hay_propuesta ? cancelacion.monto_a_cancelar : 0
  const colocaciones = ventanas.map((v) => {
    const dias = num(v.dias ?? v.dias_libres) ?? 0
    const bruto = Math.max(0, num(v.monto_maximo) ?? 0)
    // EL EXCEDENTE COLOCABLE ES EL QUE QUEDA DESPUÉS DE LA DEUDA. Sin este descuento, el motor
    // proponía colocar plata que ya estaba comprometida a bajar el rojo — y la única defensa contra
    // eso era la vara del 62,78%, que además mataba todo lo demás.
    const excedente = Math.max(0, bruto - aCancelar)
    const r = colocarExcedente({
      excedente, dias, candidatos: v.candidatos || [], referencia: v.referencia,
      bloque: v.bloque ?? null, titulo: v.titulo ?? null,
    })
    if (!r.hay_propuesta && r.codigo === MOTIVO.SIN_EXCEDENTE && aCancelar > 0 && bruto > 0) {
      return {
        ...r, codigo: MOTIVO.TODO_A_DESCUBIERTO,
        motivo: `los $${redondear(bruto).toLocaleString('es-AR')} de esta ventana van enteros a cancelar descubierto: `
          + 'cancelar rinde más que cualquier instrumento y no queda excedente que colocar',
      }
    }
    // UNA VENTANA CERRADA NO ES UNA VENTANA SIN EXCEDENTE. El calendario no llega, o el piso no
    // aguanta: son causas distintas de "sobra cero", y la ventana ya trae escrita la suya.
    if (!r.hay_propuesta && r.codigo === MOTIVO.SIN_EXCEDENTE && v.motivo) {
      return { ...r, codigo: MOTIVO.VENTANA_CERRADA, motivo: String(v.motivo) }
    }
    return r
  })
  return {
    estado: 'ok',
    cancelacion,
    colocaciones,
    // LA LISTA QUE CONTESTA "¿POR QUÉ 0 PROPUESTAS?", bloque por bloque y con código. Un bloque sin
    // propuesta y sin motivo es indistinguible de un bloque que el sistema no supo analizar.
    sin_propuesta: colocaciones.filter((c) => !c.hay_propuesta)
      .map((c) => ({ bloque: c.bloque, titulo: c.titulo, dias: c.dias, codigo: c.codigo, motivo: c.motivo })),
    n_propuestas: (cancelacion.hay_propuesta ? 1 : 0) + colocaciones.filter((c) => c.hay_propuesta).length,
    evidencia: EVIDENCIA.CALCULO,
  }
}

export const VERSION_SKILL = '1.0.0'
