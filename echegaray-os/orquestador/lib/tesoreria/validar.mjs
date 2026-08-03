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
import { rendimientoDelPeriodo, costoTotal } from './comparar.mjs'
import { aTea } from './instrumentos.mjs'
import { estaVencida } from './recomendacion.mjs'
import { impuestosDeColocacion, parametrosFiscales } from './impuestos-colocacion.mjs'

/** Tolerancia de reproducción de la aritmética. 1 peso: no es redondeo, es un error de fórmula. */
export const TOLERANCIA_PESOS = 1

/**
 * ¿ES UN NÚMERO DE VERDAD? `Number.isFinite(Number(null))` es **true**, porque `Number(null)` es 0.
 * Lo mismo con `''` y con `[]`. Escribí este control dos veces con `Number.isFinite(Number(x))` y las
 * dos veces dejó pasar el `null` que venía a atrapar. El vacío se descarta ANTES de convertir.
 */
export function esNumero(x) {
  if (x == null) return false
  if (typeof x === 'string' && x.trim() === '') return false
  if (typeof x === 'boolean' || Array.isArray(x)) return false
  return Number.isFinite(Number(x))
}

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
    // `caja_restringida` es un MODELO, no un número: el monto a restar vive adentro. Leerlo como
    // número daba NaN, y `x <= NaN` es false, así que el control fallaba cerrado — por accidente.
    // Un control que sólo funciona por accidente no es un control: acá se lee el campo correcto y se
    // verifica explícitamente que los cuatro componentes sean números.
    const restringida = posicion.caja_restringida?.monto_a_restar ?? posicion.caja_restringida
    const componentes = [enPesos, posicion.caja_comprometida, restringida, posicion.caja_minima]
    if (!componentes.every(esNumero)) {
      chequeos.push(falla('sin_caja_comprometida', `no se puede recalcular la caja libre: algún componente no es un número (${componentes.join(', ')})`))
    } else {
      const libre = Number(enPesos) - Number(posicion.caja_comprometida) - Number(restringida) - Number(posicion.caja_minima)
      chequeos.push(rec.monto_maximo <= libre + TOLERANCIA_PESOS
        ? pasa('sin_caja_comprometida', `$${rec.monto_maximo.toLocaleString('es-AR')} ≤ $${Math.round(libre).toLocaleString('es-AR')} libre`)
        : falla('sin_caja_comprometida', `propone $${rec.monto_maximo.toLocaleString('es-AR')} y sólo hay $${Math.round(libre).toLocaleString('es-AR')} libres`))
    }
  }

  // 4 · SI HAY DEUDA CANCELABLE, NO SE COLOCA POR ENCIMA DE ELLA.
  //
  // Ya no es "si está en descubierto, nada": cancelar deuda domina SÓLO por su monto. Lo que se
  // verifica es que la propuesta no ocupe pesos que deberían ir a la línea.
  const deudaMonto = Number(excedente?.deuda_cancelable?.monto) || 0
  chequeos.push(deudaMonto <= 0
    ? pasa('deuda_primero')
    : falla('deuda_primero', `hay $${deudaMonto.toLocaleString('es-AR')} de descubierto utilizado: esa porción va a la línea antes que a cualquier instrumento`))

  // 4bis · ACCIONABILIDAD. Sin políticas aprobadas el monto es un techo técnico, no un excedente.
  chequeos.push(rec.accionable
    ? pasa('accionable')
    : falla('accionable', `NO_ACCIONABLE: ${(rec.bloqueos_accionabilidad || ['falta política aprobada']).join(' · ')}`))

  // 5 · LA VENTANA EXISTE Y CUBRE EL MONTO.
  const ventana = (excedente?.ventanas || []).find((v) => v.bloque === rec.bloque)
  chequeos.push(ventana && Number(ventana.monto_maximo) >= rec.monto_maximo - TOLERANCIA_PESOS
    ? pasa('ventana_cubre', `bloque ${rec.bloque}`)
    : falla('ventana_cubre', `la ventana del bloque ${rec.bloque} no existe o no cubre $${rec.monto_maximo?.toLocaleString('es-AR')}`))

  // 6 · LA RESERVA SE PRESERVA.
  // `reserva_preservada == null` PASABA. Una propuesta que declara no preservar nada aprobaba el
  // control llamado "la reserva se preserva". Un ausente falla, no pasa.
  if (posicion?.estado !== 'ok') chequeos.push(pasa('reserva_preservada', 'sin posición: ya falló arriba'))
  else if (!esNumero(rec.reserva_preservada)) {
    chequeos.push(falla('reserva_preservada', 'la propuesta no declara qué reserva preserva'))
  } else {
    chequeos.push(Number(rec.reserva_preservada) >= posicion.caja_minima
      ? pasa('reserva_preservada')
      : falla('reserva_preservada', `preserva $${rec.reserva_preservada} y la reserva mínima es $${posicion.caja_minima}`))
  }

  // 7 · MONEDA Y HORIZONTE COINCIDEN CON LA VENTANA.
  chequeos.push(ventana && ventana.moneda === rec.moneda
    ? pasa('moneda_coincide')
    : falla('moneda_coincide', `la propuesta es ${rec.moneda} y la ventana ${ventana?.moneda ?? '(no encontrada)'}`))
  chequeos.push(ventana && Number(ventana.dias_libres) >= Number(rec.horizonte_dias)
    ? pasa('horizonte_coincide')
    : falla('horizonte_coincide', `${rec.horizonte_dias} días no caben en la ventana de ${ventana?.dias_libres ?? '?'}`))

  // 8 · EL RESCATE ES COMPATIBLE.
  // `plazo_rescate_dias == null` PASABA — justo el riesgo de que la plata no vuelva a tiempo, que
  // este agente declara como el dominante de la caja operativa.
  chequeos.push(!esNumero(rec.plazo_rescate_dias)
    ? falla('rescate_compatible', 'no se conoce el plazo de rescate: no se puede saber si la plata vuelve a tiempo')
    : (Number(rec.plazo_rescate_dias) <= Number(rec.horizonte_dias)
      ? pasa('rescate_compatible')
      : falla('rescate_compatible', `la plata vuelve en ${rec.plazo_rescate_dias} días y el horizonte es ${rec.horizonte_dias}`)))

  // 9 · SUPERA LA VARA DE SU VENTANA. Se toma de la VENTANA, no de la propuesta: leer el umbral que
  //     el otro lado declaró sería validar un control contra la información que produce.
  // `Number(undefined) || 0` daba vara CERO: una ventana sin `hurdle_periodo` hacía que cualquier
  // rendimiento positivo "superara la vara". Sin vara calculable se cae a la conservadora (el CFT).
  const hurdle = ventana?.referencia?.hurdle_periodo
  const varaP = esNumero(hurdle)
    ? Number(hurdle)
    : rendimientoDelPeriodo(Number(excedente?.tasa_de_corte?.valor) || 0, Number(rec.horizonte_dias) || 0)
  const modoVara = esNumero(hurdle) ? (ventana?.referencia?.modo ?? 'sin modo') : 'vara conservadora (la ventana no trae referencia)'
  chequeos.push(Number(rec.rendimiento_neto_periodo) > varaP
    ? pasa('supera_vara', `${(rec.rendimiento_neto_periodo * 100).toFixed(2)}% > ${(varaP * 100).toFixed(2)}% (${modoVara})`)
    : falla('supera_vara', `${((rec.rendimiento_neto_periodo ?? 0) * 100).toFixed(2)}% no supera la vara ${(varaP * 100).toFixed(2)}% (${modoVara})`))

  // 10 · ARITMÉTICA REPRODUCIBLE. La ganancia declarada tiene que salir de monto × neto.
  const esperado = Math.round(Number(rec.monto_maximo) * Number(rec.rendimiento_neto_periodo))
  chequeos.push(Math.abs(esperado - Number(rec.ganancia_neta_estimada)) <= TOLERANCIA_PESOS
    ? pasa('aritmetica')
    : falla('aritmetica', `declara $${rec.ganancia_neta_estimada} y monto × neto da $${esperado}`))

  // 11 · EL INSTRUMENTO EXISTE, y su rendimiento SE RECALCULA desde él.
  //
  // Dos agujeros que encontró la auditoría, y el segundo era el peor de todos: `!inst` pasaba (un
  // `instrumento_id` inventado no se detectaba), y el `rendimiento_neto_periodo` nunca se rehacía —
  // el chequeo 10 comparaba dos campos de la propuesta CONTRA SÍ MISMOS. Un neto inflado diez veces
  // aprobaba con cero fallas. La cabecera de este archivo prometía recalcular; ahora lo hace.
  const inst = instrumentos.find((i) => i.id === rec.instrumento_id)
  if (!inst) {
    chequeos.push(falla('instrumento_existe', `el instrumento "${rec.instrumento_id}" no está entre los relevados`))
  } else {
    chequeos.push(pasa('instrumento_existe'))
    chequeos.push(!['rendimiento_historico', 'variacion_precio'].includes(inst.tasa?.tipo)
      ? pasa('no_historico_como_esperado')
      : falla('no_historico_como_esperado', `la tasa del instrumento es "${inst.tasa.tipo}": es pasado, no una expectativa`))

    const tea = aTea(inst.tasa)
    if (tea == null) {
      chequeos.push(falla('neto_reproducible', 'la tasa del instrumento no se puede llevar a efectiva anual: el neto declarado no se puede verificar'))
    } else {
      // EL VALIDADOR REHACE LA CUENTA ENTERA, IMPUESTOS INCLUIDOS. Recalcular sólo bruto − comisiones
      // y compararlo contra un neto que sí descuenta impuestos hace fallar a la propuesta correcta;
      // peor todavía, si algún día el ciclo dejara de descontar impuestos, este chequeo aprobaría el
      // error. La revisión independiente tiene que medir lo MISMO que la propuesta afirma.
      const antesDeImpuestos = rendimientoDelPeriodo(tea, Number(rec.horizonte_dias) || 0) - costoTotal(inst).total
      const fiscal = impuestosDeColocacion({
        capital: Number(rec.monto_maximo) || 0, rendimientoBrutoPeriodo: antesDeImpuestos,
        categoria: inst.categoria, parametros: fuentes.fiscal ?? parametrosFiscales({}),
      })
      const netoReal = fiscal.estado === 'ok' ? fiscal.rendimiento_neto_periodo : antesDeImpuestos
      const declarado = Number(rec.rendimiento_neto_periodo)
      // Tolerancia relativa de medio punto básico sobre el período: separa un redondeo de un invento.
      chequeos.push(Math.abs(netoReal - declarado) <= 0.00005
        ? pasa('neto_reproducible', `${(declarado * 100).toFixed(4)}% reproduce desde el instrumento, con ${(fiscal.costo_fiscal_periodo * 100).toFixed(4)}% de impuestos`)
        : falla('neto_reproducible', `declara ${(declarado * 100).toFixed(4)}% y el instrumento da ${(netoReal * 100).toFixed(4)}% en ${rec.horizonte_dias} días`))

      // ═══ UN RENDIMIENTO SIN IMPUESTOS NO SE PUBLICA ═══
      //
      // No alcanza con que la aritmética cierre: si la propuesta llegó hasta acá sin desglose fiscal,
      // el número que se le muestra al dueño es un bruto con cara de neto. Eso ya costó tres informes
      // rechazados, así que es una falla de validación, no una nota al pie.
      chequeos.push(rec.impuestos?.estado === 'ok'
        ? pasa('impuestos_descontados', rec.impuestos.etiqueta_neto)
        : falla('impuestos_descontados', 'la propuesta no trae el cálculo de impuestos: lo que declara como neto es bruto'))
    }
  }

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

export const VERSION_SKILL = '1.2.0'
