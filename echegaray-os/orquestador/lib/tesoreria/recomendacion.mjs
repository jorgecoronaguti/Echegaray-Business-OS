// SKILL 8 · GENERAR RECOMENDACIÓN FINANCIERA — una propuesta que se puede defender línea por línea.
//
// ═══ QUÉ HACE DISTINTA A ESTA RECOMENDACIÓN ═══
//
// Trae adjunto lo que la invalida. Una recomendación de inversión sin `condiciones_invalidez` es una
// opinión con fecha de vencimiento oculta: sirve el día que se emite y nadie sabe cuándo dejó de
// servir. Acá cada propuesta dice qué tiene que pasar para que deje de valer, y vence sola.
//
// ═══ ESTADO ÚNICO ═══
//
// Toda recomendación nace y muere como **PROPUESTA — REQUIERE APROBACIÓN HUMANA**. No hay un estado
// "ejecutada": este agente es Nivel C/D del `CLAUDE.md` raíz y no tiene forma de operar. El mensaje
// que publica no lleva botones ni instrucciones de ejecución.
//
// ═══ LA RECOMENDACIÓN DE NO INVERTIR TAMBIÉN ES UNA RECOMENDACIÓN ═══
//
// Y en esta empresa es la más frecuente y la más valiosa: con la cuenta en descubierto al 62,78%, la
// mejor colocación disponible es cancelar la línea. `recomendarAplicarADeuda` existe para que ese
// caso salga con la misma estructura y la misma auditoría que cualquier otro, en vez de como un
// mensaje de error.

import { ESTADO_RECOMENDACION, Recomendacion, validarContra, CONFIANZA, EVIDENCIA } from './contratos.mjs'

/** Cuánto vale una recomendación antes de recalcularse. Corto a propósito: las tasas se mueven. */
export const VIGENCIA_HORAS = 24

const iso = (d) => d.toISOString().slice(0, 10)

function vencimiento(hoy, horas = VIGENCIA_HORAS) {
  const d = new Date(hoy)
  d.setHours(d.getHours() + horas)
  return d.toISOString()
}

/**
 * LA RECOMENDACIÓN ESTRUCTURAL DE ESTA EMPRESA: aplicar el sobrante a la línea. No lleva instrumento
 * porque no hay nada que comprar — y por eso no usa el contrato `Recomendacion`, que exige uno.
 */
export function recomendarAplicarADeuda(posicion = {}, corte = {}, hoy = new Date(), deuda = null) {
  // EL MONTO ES LA DEUDA, NO EL SALDO. Antes tomaba |caja_real|, que con la cuenta en positivo daba
  // un número enorme y sin sentido ("cancelá $126M de descubierto" con cero descubierto). La deuda
  // cancelable la calcula `costo-liquidez.deudaCancelable` mirando los saldos negativos POR CUENTA.
  const monto = deuda != null
    ? Math.max(0, Number(deuda) || 0)
    : Math.max(0, -(Number(posicion.caja_real) || 0))
  const ahorroDiario = (Number(corte.valor) || 0) / 365 * monto
  return {
    tipo: 'aplicar_a_deuda',
    titulo: 'Cancelar descubierto antes de evaluar cualquier inversión',
    monto_maximo: Math.round(monto),
    moneda: 'ARS',
    rendimiento_equivalente: Number(corte.valor) || null,
    ahorro_diario_estimado: Math.round(ahorroDiario),
    fundamento: `el acuerdo cuesta ${((Number(corte.valor) || 0) * 100).toFixed(2)}% efectivo anual con IVA y percepción incluidos. `
      + 'Bajar un peso de rojo rinde exactamente eso, sin riesgo de capital, sin plazo de rescate y sin impuesto a las ganancias sobre la renta.',
    condiciones_invalidez: ['si la cuenta deja de estar en descubierto, esta recomendación se reemplaza por el análisis de excedente'],
    riesgos: ['ninguno de mercado: es cancelación de deuda propia'],
    evidencia: corte.evidencia || EVIDENCIA.HECHO,
    confianza: CONFIANZA.ALTA,
    fuente_caja: posicion.fuente ?? null,
    vence_en: vencimiento(hoy),
    estado: ESTADO_RECOMENDACION,
  }
}

/**
 * SKILL 8. Convierte el ganador de cada ranking en una propuesta completa. Un ranking sin ganador NO
 * produce una propuesta degradada: produce ninguna, y el motivo viaja en `sin_propuesta`.
 */
export function generarRecomendaciones(comparacion = {}, ventanas = [], ctx = {}) {
  const hoy = ctx.hoy ? new Date(ctx.hoy) : new Date()
  const propuestas = []
  const sinPropuesta = []

  for (const r of comparacion.rankings || []) {
    const ventana = ventanas.find((v) => v.bloque === r.bloque)
    const ganador = (r.ranking || [])[0]
    if (!ganador) {
      sinPropuesta.push({ bloque: r.bloque, motivo: r.veredicto, excluidos: (r.excluidos || []).length })
      continue
    }
    const riesgo = (ctx.riesgos || {})[ganador.instrumento_id]
    if (riesgo && !riesgo.apto) {
      // UN MOTIVO VACÍO NO ES UN MOTIVO. `apto` puede ser false por un bloqueante explícito o
      // porque el NIVEL de riesgo del instrumento supera el del perfil, y en ese segundo caso
      // `bloqueantes` viene vacío: el mensaje terminaba en "no pasa el filtro de riesgo: " y nada
      // detrás. Sobre las pantallas reales eran 22 instrumentos descartados sin una palabra.
      const causa = riesgo.bloqueantes?.length
        ? riesgo.bloqueantes.join(' · ')
        : `su nivel de riesgo es ${riesgo.nivel_instrumento ?? riesgo.nivel ?? 'desconocido'} y el perfil admite hasta ${riesgo.max_riesgo_perfil ?? 'bajo'}`
          + (riesgo.hallazgos?.length ? ` (${riesgo.hallazgos.slice(0, 3).map((x) => x.detalle ?? x.tipo).join(' · ')})` : '')
      sinPropuesta.push({ bloque: r.bloque, motivo: `el mejor por rendimiento no pasa el filtro de riesgo: ${causa}` })
      continue
    }
    // UNA VENTANA SIN POLÍTICA APROBADA NO PRODUCE UN MONTO EJECUTABLE.
    // El monto se informa igual —sirve para dimensionar— pero la propuesta sale NO_ACCIONABLE y con
    // el bloqueo escrito. Un número con nombre de accionable se usa como accionable.
    // FAIL-CLOSED. Era `!== false`, así que un `undefined` daba accionable = true: la única compuerta
    // de accionabilidad tenía el default del lado peligroso.
    const accionable = ventana?.accionable === true && ctx.accionable === true
    const salida = new Date(hoy); salida.setDate(salida.getDate() + Number(r.dias))
    const prop = {
      id: `rec_${r.bloque}_${iso(hoy)}_${ganador.instrumento_id}`.slice(0, 90),
      bloque: r.bloque,
      instrumento: ganador.instrumento,
      instrumento_id: ganador.instrumento_id,
      categoria: ganador.categoria,
      monto_maximo: Math.round(Number(r.monto_maximo) || 0),
      moneda: ganador.moneda,
      horizonte_dias: Number(r.dias),
      fecha_ingreso_sugerida: iso(hoy),
      fecha_limite_salida: iso(salida),
      plazo_rescate_dias: ganador.dias_vuelta ?? null,
      liquidacion_dias: null,
      rendimiento_estimado_periodo: ganador.rendimiento_bruto_periodo,
      rendimiento_bruto_periodo: ganador.rendimiento_bruto_periodo,
      // EL DESGLOSE FISCAL VIAJA CON LA PROPUESTA. Sin él, el mensaje no puede mostrar el bruto al
      // lado del neto, y un neto sin bruto no se puede discutir ni auditar.
      rendimiento_antes_de_impuestos_periodo: ganador.rendimiento_antes_de_impuestos_periodo ?? null,
      impuestos: ganador.impuestos ?? null,
      impuestos_completos: Boolean(ganador.impuestos_completos),
      rendimiento_neto_periodo: ganador.rendimiento_neto_periodo,
      ganancia_neta_estimada: ganador.ganancia_neta_estimada,
      costo_oportunidad_evitado: Math.round((Number(r.monto_maximo) || 0) * (ganador.exceso_sobre_corte || 0)),
      reserva_preservada: ventana?.reserva_preservada ?? null,
      obligaciones_cubiertas: ventana?.obligaciones_cubiertas ?? [],
      riesgos: (riesgo?.hallazgos || []).map((h) => `${h.tipo}: ${h.detalle}`),
      escenario_favorable: `si la tasa se mantiene, el excedente rinde ${(ganador.rendimiento_neto_periodo * 100).toFixed(2)}% en ${r.dias} días`,
      escenario_adverso: 'si una cobranza del período no entra, la ventana se cierra y hay que rescatar antes: el resultado depende del costo de salida anticipada',
      condiciones_invalidez: [
        ...(ventana?.condiciones_invalidez || []),
        `la tasa fue observada el ${ganador.evidencia === 'hecho' ? 'cierre' : 'relevamiento'} y esta propuesta vence en ${VIGENCIA_HORAS} horas`,
        ...(ganador.costos_conocidos ? [] : ['los costos del instrumento no se pudieron leer: el neto es un techo, no un resultado']),
        // Una alícuota que falta no es un detalle de forma: el resultado real es MENOR que el publicado.
        ...((ganador.impuestos?.pendientes || []).length
          ? [`el rendimiento publicado NO descuenta ${ganador.impuestos.pendientes.map((p) => p.concepto).join(' ni ')}: el resultado real es menor`]
          : []),
        ...(accionable ? [] : ['NO ACCIONABLE: el monto es un techo técnico preliminar, no un excedente aprobado']),
      ],
      datos_faltantes: ganador.campos_faltantes || [],
      confianza: confianzaDe(ganador, riesgo, ventana, ctx.frescura),
      evidencia: ganador.evidencia,
      fuente_caja: ctx.fuente_caja ?? 'Flujo de Caja',
      fuente_mercado: ctx.fuente_mercado ?? 'Balanz',
      vence_en: vencimiento(hoy),
      estado: ESTADO_RECOMENDACION,
      accionable,
      estado_accionabilidad: accionable ? 'ACCIONABLE' : 'NO_ACCIONABLE',
      bloqueos_accionabilidad: accionable ? [] : (ctx.bloqueos ?? ['falta una política de tesorería aprobada']),
      etiqueta_monto: accionable ? 'excedente_aprobado' : 'techo_tecnico_preliminar',
      vara_periodo: ganador.vara_periodo ?? null,
      modo_vara: ganador.modo_vara ?? null,
    }
    const v = validarContra(Recomendacion, prop)
    if (v.ok) propuestas.push(v.valor)
    else sinPropuesta.push({ bloque: r.bloque, motivo: `la propuesta no cumple el contrato: ${v.errores.join('; ')}` })
  }

  return { estado: 'ok', propuestas, sin_propuesta: sinPropuesta, generado_en: hoy.toISOString() }
}

/**
 * La confianza NO se elige: se deriva. Costos desconocidos o campos faltantes la bajan, porque el
 * número neto deja de ser un resultado y pasa a ser un techo optimista.
 */
export function confianzaDe(ganador = {}, riesgo = null, ventana = null, frescura = null) {
  if (!ganador.costos_conocidos) return CONFIANZA.BAJA
  if ((ganador.campos_faltantes || []).length >= 2) return CONFIANZA.BAJA
  // ═══ LA COBERTURA DEL MERCADO ENTRA ACÁ, Y NO EN NINGÚN OTRO LADO ═══
  //
  // `frescuraDeMercado` cuenta cuántos instrumentos tienen el dato viejo y cuántos no declaran cuándo
  // cotizaron, y esos dos números se escribían sin que nadie los leyera — el mismo defecto que la
  // auditoría había encontrado con `moneda_no_declarada_en_pantalla`, reintroducido en el arreglo de
  // la frescura. Peor todavía: `riesgo.mjs` justifica NO bloquear un instrumento sin fecha diciendo
  // que el costo se paga bajando la confianza. Si no se pagaba acá, no se pagaba en ningún lado.
  //
  // Elegir sobre un universo donde la mayoría no tiene fecha de cotización no es lo mismo que
  // elegir sobre uno donde todos la tienen, aunque el ganador sea el mismo instrumento.
  const total = Number(frescura?.n ?? 0) + Number(frescura?.sin_fecha ?? 0)
  if (total > 0) {
    const dudosos = (Number(frescura?.viejos ?? 0) + Number(frescura?.sin_fecha ?? 0)) / total
    if (dudosos >= 0.5) return CONFIANZA.BAJA
    if (dudosos > 0) return CONFIANZA.MEDIA
  }
  if (riesgo?.nivel === 'medio' || ventana?.confianza === CONFIANZA.BAJA) return CONFIANZA.MEDIA
  return ventana?.confianza === CONFIANZA.ALTA ? CONFIANZA.ALTA : CONFIANZA.MEDIA
}

/** ¿Venció? Se pregunta antes de publicar y antes de mostrar: una propuesta vieja es un riesgo. */
export const estaVencida = (rec, ahora = new Date()) => Date.parse(rec?.vence_en) <= ahora.getTime()

export const VERSION_SKILL = '1.1.0'
