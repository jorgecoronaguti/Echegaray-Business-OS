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
import { deudaCancelable, tasaDeReferencia, interesDiarioDelAcuerdo, MODO } from './costo-liquidez.mjs'
import { ventanaDeExcedente, excedentePorVentana, VENTANAS_DIAS, DIAS_ACREDITACION_VALORES } from './excedente-ventana.mjs'

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
  const interesDia = opts.interesDia ?? await interesDiarioDelAcuerdo()

  if (posicion.estado !== 'ok' || proyeccion.estado !== 'ok') {
    const motivo = posicion.motivo || proyeccion.motivo || 'falta la posición de caja o la proyección'
    return {
      estado: 'sin_dato', motivo, tasa_de_corte: corte,
      ventanas: [ventanaCerrada('G', motivo)],
    }
  }

  // ── DEUDA CANCELABLE: el CASO A, y sólo por su monto ────────────────────────
  //
  // Corrección del 01/08. La versión anterior, ante cualquier saldo negativo, devolvía "excedente
  // cero" para TODO. Eso mezcla dos cosas: cancelar deuda es la mejor colocación para la porción que
  // alcanza a cancelarla, no para el resto. Y el descubierto se mide POR CUENTA — una cuenta corriente
  // en rojo con efectivo en la caja fuerte da un total positivo y el banco cobra igual.
  const deuda = deudaCancelable(posicion.composicion, posicion.caja_real)

  const reserva = Number(posicion.caja_minima) || 0
  const techoPosicion = Number(posicion.techo_tecnico_preliminar) || 0

  // ═══ LOS INSUMOS DEL MOTOR POR VENTANA ═══
  //
  // Antes, un `techo_tecnico_preliminar` en cero cortaba acá y devolvía "no invertible" para TODOS los
  // plazos. Ese techo es una foto de T+0 que resta el 100% de los cheques firmados —incluidos los que
  // vencen dentro de 90 días— y no suma una sola cobranza: usarlo como compuerta garantizaba el mismo
  // resultado siempre. Ya no corta: es un dato más, y el excedente sale de caminar el calendario.
  const arsLiquida = Number.isFinite(Number(posicion.composicion?.ars_liquida))
    ? Number(posicion.composicion.ars_liquida) : Number(posicion.caja_real) || 0
  const valoresADepositar = Number(posicion.composicion?.valores_a_depositar) || 0
  // Lo que el calendario NO puede ver: cheques ya vencidos sin debitar y cheques sin fecha. No depende
  // de la ventana (los dos casos pueden caer cualquier día), así que se toma una sola vez.
  const restringidaFuera = Number(
    Object.values(posicion.caja_restringida_por_ventana ?? {})[0]?.a_restar_fuera_del_calendario ?? 0,
  ) || 0
  const insumos = {
    dias: opts.dias || [],
    saldoInicial: arsLiquida,
    vencido: Number(posicion.caja_comprometida) || 0,
    valoresADepositar,
    diasAcreditacion: DIAS_ACREDITACION_VALORES,
    reserva,
    restringidaFueraDelCalendario: restringidaFuera,
    hoy,
  }
  // LA VISTA QUE PIDIÓ EL DUEÑO: el excedente por plazo, no un número único. Va aparte de los bloques
  // A–E porque responde otra pregunta —"¿cuánto puedo colocar a 30, a 60 y a 90 días?"— y es la que
  // se publica.
  const porPlazo = excedentePorVentana({ ...insumos, ventanas: VENTANAS_DIAS })

  const dias = (proyeccion.escenarios?.adverso?.horizontes) || []
  // HASTA DÓNDE VE EL CALENDARIO. Todo lo que esté más allá NO se puede afirmar.
  //
  // La corrida real del 01/08 lo destapó: el bloque E ("más de 90 días") devolvía una ventana con
  // fecha límite en 2036 calculada con el piso de los 90 días. Decir que $80M están libres diez años
  // porque el calendario de tres meses no muestra egresos es exactamente inventar precisión: en 2027
  // hay sueldos, y el modelo no los ve porque no llega, no porque no existan.
  // COBERTURA = FILAS REALES DEL CALENDARIO, no el mayor horizonte que dijo "ok".
  //
  // `resumirHorizonte` devolvía `ok` con cualquier array no vacío, así que con 11 días de calendario
  // el horizonte de 90 salía `ok` y `cobertura` daba 90 igual. El bloque E caía en G sólo porque
  // 91 > 90, no porque se hubiera medido nada: el control se validaba contra sí mismo.
  const filas = (opts.dias || []).length
  const cobertura = filas > 0
    ? Math.min(filas - 1, Math.max(0, ...dias.filter((x) => x.estado === 'ok').map((x) => x.dias)))
    : 0

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
    // EL MOTOR ES UNO SOLO. `ventanaDeExcedente` camina el mismo calendario en escenario adverso
    // sumando las cobranzas del período y restando SÓLO los egresos que caen dentro de la ventana.
    const v = ventanaDeExcedente({ ...insumos, hasta: tope, factorIngresos: 0.5 })
    if (v.estado !== 'ok') { porBloque.set(b.id, ventanaCerrada('G', v.motivo, { bloque_solicitado: b.id })); continue }
    const piso = v.piso
    const monto = v.monto_maximo
    if (monto <= 0) {
      // `bloque_solicitado` viaja también en la F: una ventana cerrada tiene que decir CUÁL se cerró.
      // Sin eso, tres bloques distintos devuelven tres filas idénticas y no se puede auditar ninguna.
      porBloque.set(b.id, ventanaCerrada('F', `el saldo mínimo proyectado a ${tope} días (escenario adverso, cobranzas al 50%) es $${Math.round(piso).toLocaleString('es-AR')} y la reserva aprobada es $${Math.round(reserva).toLocaleString('es-AR')}: no aguanta inmovilizar nada`, { monto_maximo: 0, detalle_ventana: v, bloque_solicitado: b.id, dias_libres: tope }))
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
      // LA VARA DE ESTA VENTANA. No es un número global: depende del plazo, del monto y de si
      // inmovilizarlo lleva la caja a rojo en el escenario adverso. Se calcula por ventana.
      referencia: tasaDeReferencia({
        dias: tope, monto: Math.round(monto), deuda: deuda.monto,
        dias_calendario: opts.dias || [],
        // EN PESOS, NO EL TOTAL. El techo ya se topea con `ars_liquida`; la simulación del riesgo
        // arrancaba del total —dólares incluidos— así que creía que había más pesos de los que hay,
        // subestimaba los días en rojo y devolvía una vara más baja. El mismo error de moneda que el
        // módulo ya había corregido en el techo, sin corregir en la vara.
        cajaInicial: Number.isFinite(Number(posicion.composicion?.ars_liquida))
          ? Math.min(Number(posicion.caja_real), Number(posicion.composicion.ars_liquida))
          : Number(posicion.caja_real),
        reserva,
        cft: corte.valor, interesDia, factorIngresos: 0.5, escenario: 'adverso',
      }),
      // EL DETALLE COMPLETO DEL RECORRIDO. Entradas, salidas, el día de tensión y el solapamiento de
      // la reserva con el calendario: sin esto el monto es un número sin defensa.
      detalle_ventana: v,
      condiciones_invalidez: [
        `el día de mayor tensión es el ${v.fecha_tension}: si ese día entra un pago no previsto, la ventana se cierra`,
        `sin creerle nada a las cobranzas el excedente a ${tope} días sería $${Math.round(ventanaDeExcedente({ ...insumos, hasta: tope, factorIngresos: 0 }).monto_maximo ?? 0).toLocaleString('es-AR')}`,
        ...(v.solape_reserva?.solapado > 0 ? [v.solape_reserva.nota] : []),
        ...(deuda.monto > 0 ? [`hay $${deuda.monto.toLocaleString('es-AR')} de descubierto utilizado: esa porción va a cancelar la línea antes que a cualquier instrumento`] : []),
        ...(tope < b.hasta ? [`la ventana se recortó a ${tope} días: el calendario no proyecta más allá`] : []),
      ],
      evidencia: EVIDENCIA.PROYECCION,
      confianza: posicion.confianza === CONFIANZA.ALTA ? CONFIANZA.MEDIA : posicion.confianza,
      // Una ventana con monto NO es una ventana accionable: eso lo decide la política aprobada.
      accionable: Boolean(posicion.accionable),
      estado_recomendacion: posicion.estado_recomendacion ?? 'NO_ACCIONABLE',
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
    en_descubierto: deuda.monto > 0,
    deuda_cancelable: deuda,
    tasa_de_corte: corte, // el CFT del acuerdo: es UNA referencia, ya no el piso universal
    techo_base: Math.round(techoPosicion),
    etiqueta_monto: posicion.etiqueta_monto ?? 'techo_tecnico_preliminar',
    accionable: Boolean(posicion.accionable),
    estado_recomendacion: posicion.estado_recomendacion ?? 'NO_ACCIONABLE',
    bloqueos_accionabilidad: posicion.bloqueos_accionabilidad ?? [],
    reserva_preservada: Math.round(reserva),
    ventanas,
    // LA TABLA QUE SE PUBLICA. Un excedente por plazo, con los tres escenarios de cobro al lado.
    ventanas_por_plazo: porPlazo,
    solape_reserva: porPlazo[0]?.solape_reserva ?? null,
    criterio: 'el excedente de cada ventana es el SALDO MÍNIMO del recorrido del calendario (pesos líquidos + valores a depositar '
      + `acreditados a ${DIAS_ACREDITACION_VALORES} días + cobranzas del período al 50% − lo vencido − los egresos que caen DENTRO de la ventana) menos la reserva aprobada; `
      + 'la vara de cada ventana sale de costo-liquidez (cancelación de deuda / costo de oportunidad / contingencia), no del CFT fijo',
    evidencia: EVIDENCIA.CALCULO,
    confianza: posicion.confianza,
  }
}

/** Bloque que le corresponde a un plazo, para clasificar un instrumento contra las ventanas. */
export { bloquePorDias }

export { MODO }

export const VERSION_SKILL = '1.1.0'
