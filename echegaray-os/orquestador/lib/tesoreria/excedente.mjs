// SKILL 4 · CALCULAR EXCEDENTE INVERTIBLE — la skill que casi siempre va a decir que no.
//
// ═══ LA REGLA QUE ESTE AGENTE EXISTE PARA APLICAR ═══
//
// Echegaray opera EN descubierto, con el acuerdo N°00007 al 62,78% CFT (verificado contra el cargo
// real del banco, no supuesto: `costo-descubierto.mjs`). Eso convierte una pregunta de inversión en
// una pregunta de arbitraje, y la respuesta es casi siempre la misma:
//
//   **CANCELAR DESCUBIERTO ES UNA INVERSIÓN AL 62,78% LIBRE DE RIESGO E IMPUESTOS.**
//
// Ningún money market ni plazo fijo en pesos paga eso. Entonces, mientras la cuenta esté en rojo, el
// excedente invertible es CERO y la recomendación correcta es aplicar el sobrante a la línea. Un
// agente que en esa situación proponga un FCI está recomendando perder plata con cara de ganarla.
//
// Por eso la TASA DE CORTE de este agente no es cero: es el costo del peso marginal de ESTA empresa.
// Un instrumento que rinde menos que eso no es una oportunidad — es una pérdida más chica que otra.
//
// ═══ LAS TRES RESTAS QUE VAN ANTES DE CUALQUIER TASA ═══
//
//   1. lo comprometido (ya tiene dueño y fecha)
//   2. la reserva mínima (política del dueño; si no existe, se declara y baja la confianza)
//   3. el piso del período bajo escenario ADVERSO (SKILL 3)
//
// El excedente es el MENOR de los tres resultados, nunca el mayor.

import { BLOQUES, bloquePorDias, EVIDENCIA, CONFIANZA } from './contratos.mjs'

/**
 * TASA DE CORTE (hurdle rate) — el rendimiento anual que un instrumento tiene que superar para que
 * invertir sea mejor que aplicar la plata a la deuda más cara de la empresa.
 *
 * Sale del CFT del acuerdo, que ya incluye IVA y percepción: es lo que efectivamente sale de la
 * cuenta. Compararlo contra una TNA "limpia" de un fondo subestimaría el costo real del descubierto.
 */
export async function tasaDeCorte() {
  const { ACUERDO } = await import('../banco-santander.mjs')
  return {
    valor: ACUERDO.cft,
    base: 'anual efectiva (CFT del acuerdo N°' + ACUERDO.numero + ', con IVA y percepción)',
    evidencia: EVIDENCIA.HECHO,
    fuente: 'banco-santander.mjs · costo-descubierto.mjs (modelo verificado contra el cargo real)',
  }
}

/** Rendimiento efectivo de una tasa anual efectiva para `dias` días. Aritmética, no modelo. */
export const rendimientoPeriodo = (tea, dias) => (1 + Number(tea)) ** (Number(dias) / 365) - 1

/**
 * ¿Qué obligaciones cubre el excedente que se deja sin invertir? Se nombran para que la propuesta sea
 * auditable: "reservo $X" sin decir para qué es un número sin defensa.
 */
export function obligacionesCubiertas(dias = [], hasta = 30) {
  const conceptos = new Map()
  for (const d of dias.slice(0, hasta + 1)) {
    for (const m of d.movimientos || []) {
      if (m.tipo !== 'egreso') continue
      const k = m.categoria || 'egreso'
      conceptos.set(k, (conceptos.get(k) || 0) + (Number(m.monto) || 0))
    }
  }
  return [...conceptos.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([k, v]) => `${k}: $${Math.round(v).toLocaleString('es-AR')}`)
}

/** Una ventana en estado terminal (F o G), con el motivo que la explica. */
function ventanaCerrada(bloque, motivo, extra = {}) {
  return {
    bloque, titulo: BLOQUES[bloque].titulo, monto_maximo: null, moneda: 'ARS',
    fecha_inicial: null, fecha_limite: null, dias_libres: null, reserva_preservada: null,
    obligaciones_cubiertas: [], condiciones_invalidez: [], motivo,
    evidencia: bloque === 'G' ? EVIDENCIA.SIN_DATO : EVIDENCIA.CALCULO,
    confianza: bloque === 'G' ? CONFIANZA.NULA : CONFIANZA.ALTA,
    ...extra,
  }
}

/**
 * SKILL 4. Devuelve las ventanas A–G. Siempre devuelve las siete: un bloque vacío es información
 * ("a 90 días no hay nada invertible"), y omitirlo haría creer que no se miró.
 *
 * @param {object} posicion salida de la SKILL 2
 * @param {object} proyeccion salida de la SKILL 3
 * @param {object} [opts] {politica:{reserva_minima}, hoy, dias}
 */
export async function calcularExcedente(posicion = {}, proyeccion = {}, opts = {}) {
  const hoy = opts.hoy ? new Date(opts.hoy) : new Date()
  const corte = await tasaDeCorte()

  if (posicion.estado !== 'ok' || proyeccion.estado !== 'ok') {
    const motivo = posicion.motivo || proyeccion.motivo || 'falta la posición de caja o la proyección'
    return {
      estado: 'sin_dato', motivo, tasa_de_corte: corte,
      ventanas: [ventanaCerrada('G', motivo)],
    }
  }

  // ── EL PORTÓN: ¿la empresa está en rojo? ────────────────────────────────────
  if (posicion.en_descubierto) {
    const motivo = `la cuenta está en descubierto ($${Math.abs(posicion.caja_real).toLocaleString('es-AR')}): `
      + `cada peso aplicado a la línea "rinde" ${(corte.valor * 100).toFixed(2)}% efectivo anual, libre de riesgo. `
      + 'Ningún instrumento de tesorería en pesos paga eso. No hay excedente invertible.'
    return {
      estado: 'ok', hoy: hoy.toISOString().slice(0, 10), tasa_de_corte: corte,
      en_descubierto: true,
      recomendacion_estructural: 'aplicar todo sobrante a cancelar descubierto antes de evaluar cualquier inversión',
      ventanas: [ventanaCerrada('F', motivo, { monto_maximo: 0 })],
      evidencia: EVIDENCIA.CALCULO, confianza: CONFIANZA.ALTA,
    }
  }

  // ── EL EXCEDENTE ES EL MENOR DE LAS TRES RESTAS ─────────────────────────────
  const reserva = Number(posicion.caja_minima) || 0
  const excedentePosicion = Number(posicion.caja_excedente_bruto) || 0
  if (excedentePosicion <= 0) {
    return {
      estado: 'ok', hoy: hoy.toISOString().slice(0, 10), tasa_de_corte: corte, en_descubierto: false,
      ventanas: [ventanaCerrada('F', `después de restar lo comprometido ($${posicion.caja_comprometida.toLocaleString('es-AR')}), lo restringido y la reserva, no queda excedente`, { monto_maximo: 0 })],
      evidencia: EVIDENCIA.CALCULO, confianza: posicion.confianza,
    }
  }

  const dias = (proyeccion.escenarios?.adverso?.horizontes) || []
  // HASTA DÓNDE VE EL CALENDARIO. Todo lo que esté más allá NO se puede afirmar.
  //
  // La corrida real del 01/08 lo destapó: el bloque E ("más de 90 días") devolvía una ventana con
  // fecha límite en 2036 calculada con el piso de los 90 días. Decir que $80M están libres diez años
  // porque el calendario de tres meses no muestra egresos es exactamente inventar precisión: en 2027
  // hay sueldos, y el modelo no los ve porque no llega, no porque no existan.
  const cobertura = Math.max(0, ...dias.filter((x) => x.estado === 'ok').map((x) => x.dias))

  const porBloque = new Map()
  for (const b of [BLOQUES.A, BLOQUES.B, BLOQUES.C, BLOQUES.D, BLOQUES.E]) {
    if (b.desde > cobertura) {
      porBloque.set(b.id, ventanaCerrada('G', `el calendario proyecta ${cobertura} días: no se puede afirmar nada a partir del día ${b.desde}`, { bloque_solicitado: b.id }))
      continue
    }
    // El horizonte que gobierna cada bloque es su día FINAL: para invertir a 30 días hay que aguantar
    // el piso de los 30, no el de hoy. Si el bloque se extiende más allá de la cobertura, se recorta
    // a lo observable — una ventana más corta y cierta, en vez de una larga e inventada.
    const tope = Math.min(b.hasta, cobertura)
    const h = dias.find((x) => x.dias >= tope) || dias[dias.length - 1]
    const piso = h?.estado === 'ok' ? h.piso_invertible : null
    if (piso == null) { porBloque.set(b.id, ventanaCerrada('G', `el calendario no cubre ${b.hasta} días`, { bloque_solicitado: b.id })); continue }
    const monto = Math.max(0, Math.min(excedentePosicion, piso - reserva))
    if (monto <= 0) {
      porBloque.set(b.id, ventanaCerrada('F', `el saldo mínimo proyectado a ${tope} días (escenario adverso) es $${Math.round(piso).toLocaleString('es-AR')}: no aguanta inmovilizar nada`, { monto_maximo: 0 }))
      continue
    }
    const inicio = new Date(hoy)
    const limite = new Date(hoy); limite.setDate(limite.getDate() + tope)
    porBloque.set(b.id, {
      bloque: b.id,
      titulo: b.titulo,
      monto_maximo: Math.round(monto),
      moneda: 'ARS',
      fecha_inicial: inicio.toISOString().slice(0, 10),
      fecha_limite: limite.toISOString().slice(0, 10),
      dias_libres: tope,
      reserva_preservada: Math.round(reserva),
      obligaciones_cubiertas: obligacionesCubiertas(opts.dias || [], b.hasta),
      condiciones_invalidez: [
        `si entra un pago no previsto mayor a $${Math.round(piso - reserva - monto).toLocaleString('es-AR')}, la ventana se cierra`,
        'si una cobranza del período no se acredita, el piso baja y el monto deja de ser válido',
        `si la cuenta vuelve al descubierto, cancelar la línea rinde ${(corte.valor * 100).toFixed(2)}% y gana a cualquier instrumento`,
        ...(tope < b.hasta ? [`la ventana se recortó a ${tope} días: el calendario no proyecta más allá`] : []),
      ],
      evidencia: EVIDENCIA.PROYECCION,
      confianza: posicion.confianza === CONFIANZA.ALTA ? CONFIANZA.MEDIA : posicion.confianza,
      motivo: null,
    })
  }

  const ventanas = [...porBloque.values()]
  if (posicion.datos_faltantes?.length) {
    ventanas.push(ventanaCerrada('G', `hay datos faltantes que afectan el cálculo: ${posicion.datos_faltantes.join(' · ')}`))
  }

  return {
    estado: 'ok',
    hoy: hoy.toISOString().slice(0, 10),
    en_descubierto: false,
    tasa_de_corte: corte,
    excedente_base: Math.round(excedentePosicion),
    reserva_preservada: Math.round(reserva),
    ventanas,
    criterio: 'excedente = min(caja − comprometido − restringido − reserva, piso del período en escenario adverso − reserva)',
    evidencia: EVIDENCIA.CALCULO,
    confianza: posicion.confianza,
  }
}

/** Bloque que le corresponde a un plazo, para clasificar un instrumento contra las ventanas. */
export { bloquePorDias }

export const VERSION_SKILL = '1.0.0'
