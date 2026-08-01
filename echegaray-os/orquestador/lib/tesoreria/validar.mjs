// SKILL 9 · VALIDAR RECOMENDACIÓN — el revisor que no escribió la propuesta.
//
// ═══ POR QUÉ EXISTE ═══
//
// Del `CLAUDE.md` raíz: **ningún trabajo lo cierra quien lo construyó**, y **un control nunca se
// valida contra la misma información que produce**. Una recomendación revisada por el mismo código
// que la generó no está revisada: está repetida.
//
// Esta skill re-verifica cada afirmación contra las FUENTES, no contra la propuesta. Recalcula la
// aritmética por su cuenta, vuelve a mirar el saldo, vuelve a mirar el vencimiento del dato. Si un
// número no reproduce, la propuesta no se publica.
//
// ═══ LA REGLA DURA ═══
//
// Una recomendación que no supera esta skill **no puede publicarse**. No se publica "con salvedades".
// El ciclo tiene el veredicto de acá como condición, no como sugerencia.

import { CONFIANZA } from './contratos.mjs'
import { rendimientoDelPeriodo } from './comparar.mjs'
import { estaVencida } from './recomendacion.mjs'

/** Tolerancia de reproducción de la aritmética. 1 peso: no es redondeo, es un error de fórmula. */
export const TOLERANCIA_PESOS = 1

const falla = (regla, detalle) => ({ regla, ok: false, detalle })
const pasa = (regla, detalle = null) => ({ regla, ok: true, detalle })

/**
 * SKILL 9. Valida UNA recomendación contra las fuentes.
 *
 * @param {object} rec la propuesta
 * @param {object} fuentes {posicion, excedente, proyeccion, instrumentos, ahora}
 */
export function validarRecomendacion(rec = {}, fuentes = {}) {
  const ahora = fuentes.ahora ? new Date(fuentes.ahora) : new Date()
  const chequeos = []
  const { posicion, excedente, instrumentos = [] } = fuentes

  // 1 · EL SHEET SE LEYÓ. Sin posición no hay recomendación posible.
  chequeos.push(posicion?.estado === 'ok'
    ? pasa('flujo_leido', posicion.fuente)
    : falla('flujo_leido', `la posición de caja no está disponible: ${posicion?.motivo ?? 'sin dato'}`))

  // 2 · EL DATO NO ESTÁ VENCIDO.
  chequeos.push(estaVencida(rec, ahora)
    ? falla('no_vencida', `la propuesta venció el ${rec.vence_en}`)
    : pasa('no_vencida'))

  // 3 · NO SE USÓ CAJA COMPROMETIDA. Se recalcula desde la posición, no se cree lo declarado.
  if (posicion?.estado === 'ok') {
    // Se recalcula desde los COMPONENTES, no desde `caja_excedente_bruto`: un control que lee el
    // número que produjo el otro lado no es un control. Y el techo es la parte líquida EN PESOS —
    // los dólares y los cheques en cartera no financian una colocación en pesos.
    const enPesos = Number.isFinite(Number(posicion.composicion?.ars_liquida))
      ? Math.min(posicion.caja_real, Number(posicion.composicion.ars_liquida))
      : posicion.caja_real
    const libre = enPesos - posicion.caja_comprometida - posicion.caja_restringida - posicion.caja_minima
    chequeos.push(rec.monto_maximo <= libre + TOLERANCIA_PESOS
      ? pasa('sin_caja_comprometida', `$${rec.monto_maximo.toLocaleString('es-AR')} ≤ $${Math.round(libre).toLocaleString('es-AR')} libre`)
      : falla('sin_caja_comprometida', `propone $${rec.monto_maximo.toLocaleString('es-AR')} y sólo hay $${Math.round(libre).toLocaleString('es-AR')} libres`))
  }

  // 4 · LA EMPRESA NO ESTÁ EN DESCUBIERTO. Si lo está, ninguna colocación es válida.
  chequeos.push(posicion?.en_descubierto
    ? falla('sin_descubierto', 'la cuenta está en descubierto: aplicar a la línea domina cualquier colocación')
    : pasa('sin_descubierto'))

  // 5 · LA VENTANA EXISTE Y CUBRE EL MONTO.
  const ventana = (excedente?.ventanas || []).find((v) => v.bloque === rec.bloque)
  chequeos.push(ventana && Number(ventana.monto_maximo) >= rec.monto_maximo - TOLERANCIA_PESOS
    ? pasa('ventana_cubre', `bloque ${rec.bloque}`)
    : falla('ventana_cubre', `la ventana del bloque ${rec.bloque} no existe o no cubre $${rec.monto_maximo?.toLocaleString('es-AR')}`))

  // 6 · LA RESERVA SE PRESERVA.
  chequeos.push(posicion?.estado !== 'ok' || rec.reserva_preservada == null || rec.reserva_preservada >= posicion.caja_minima
    ? pasa('reserva_preservada')
    : falla('reserva_preservada', `preserva $${rec.reserva_preservada} y la reserva mínima es $${posicion.caja_minima}`))

  // 7 · MONEDA Y HORIZONTE COINCIDEN CON LA VENTANA.
  chequeos.push(ventana && ventana.moneda === rec.moneda
    ? pasa('moneda_coincide')
    : falla('moneda_coincide', `la propuesta es ${rec.moneda} y la ventana ${ventana?.moneda ?? '(no encontrada)'}`))
  chequeos.push(ventana && Number(ventana.dias_libres) >= Number(rec.horizonte_dias)
    ? pasa('horizonte_coincide')
    : falla('horizonte_coincide', `${rec.horizonte_dias} días no caben en la ventana de ${ventana?.dias_libres ?? '?'}`))

  // 8 · EL RESCATE ES COMPATIBLE.
  chequeos.push(rec.plazo_rescate_dias == null || rec.plazo_rescate_dias <= Number(rec.horizonte_dias)
    ? pasa('rescate_compatible')
    : falla('rescate_compatible', `la plata vuelve en ${rec.plazo_rescate_dias} días y el horizonte es ${rec.horizonte_dias}`))

  // 9 · SUPERA LA TASA DE CORTE. Se recalcula acá: es el chequeo que no se delega.
  const corte = Number(excedente?.tasa_de_corte?.valor) || 0
  const corteP = rendimientoDelPeriodo(corte, Number(rec.horizonte_dias) || 0)
  chequeos.push(Number(rec.rendimiento_neto_periodo) > corteP
    ? pasa('supera_costo_del_dinero', `${(rec.rendimiento_neto_periodo * 100).toFixed(2)}% > ${(corteP * 100).toFixed(2)}%`)
    : falla('supera_costo_del_dinero', `${((rec.rendimiento_neto_periodo ?? 0) * 100).toFixed(2)}% no supera el ${(corteP * 100).toFixed(2)}% que cuesta el peso marginal`))

  // 10 · ARITMÉTICA REPRODUCIBLE. La ganancia declarada tiene que salir de monto × neto.
  const esperado = Math.round(Number(rec.monto_maximo) * Number(rec.rendimiento_neto_periodo))
  chequeos.push(Math.abs(esperado - Number(rec.ganancia_neta_estimada)) <= TOLERANCIA_PESOS
    ? pasa('aritmetica')
    : falla('aritmetica', `declara $${rec.ganancia_neta_estimada} y monto × neto da $${esperado}`))

  // 11 · NO CONFUNDE HISTÓRICO CON ESPERADO.
  const inst = instrumentos.find((i) => i.id === rec.instrumento_id)
  chequeos.push(!inst || !['rendimiento_historico', 'variacion_precio'].includes(inst.tasa?.tipo)
    ? pasa('no_historico_como_esperado')
    : falla('no_historico_como_esperado', `la tasa del instrumento es "${inst.tasa.tipo}": es pasado, no una expectativa`))

  // 12 · LA EVIDENCIA EXISTE.
  chequeos.push(rec.fuente_caja && rec.fuente_mercado
    ? pasa('evidencia')
    : falla('evidencia', 'falta declarar la fuente de caja o la de mercado'))

  const fallas = chequeos.filter((c) => !c.ok)
  return {
    id: rec.id,
    aprobada: fallas.length === 0,
    chequeos,
    fallas: fallas.map((f) => `${f.regla}: ${f.detalle}`),
    // La confianza de la VALIDACIÓN, no de la propuesta: rechazar con una falla dura es una conclusión
    // firme; aprobar con datos faltantes nunca lo es.
    confianza: fallas.length ? CONFIANZA.ALTA : (rec.datos_faltantes?.length ? CONFIANZA.MEDIA : CONFIANZA.ALTA),
    validado_en: ahora.toISOString(),
  }
}

/** Valida un lote y devuelve sólo las publicables. Lo rechazado viaja con su motivo, no desaparece. */
export function validarLote(recs = [], fuentes = {}) {
  const resultados = recs.map((r) => ({ rec: r, val: validarRecomendacion(r, fuentes) }))
  return {
    publicables: resultados.filter((x) => x.val.aprobada).map((x) => x.rec),
    rechazadas: resultados.filter((x) => !x.val.aprobada).map((x) => ({ id: x.rec.id, bloque: x.rec.bloque, fallas: x.val.fallas })),
    validaciones: resultados.map((x) => x.val),
  }
}

export const VERSION_SKILL = '1.0.0'
