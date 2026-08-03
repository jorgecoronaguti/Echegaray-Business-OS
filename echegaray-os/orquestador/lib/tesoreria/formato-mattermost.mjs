// EL MENSAJE — formato exacto pedido por el dueño, sin un botón transaccional.
//
// ═══ POR QUÉ NO HAY ACCIONES INTERACTIVAS ═══
//
// El OS ya sabe publicar mensajes con botones en Mattermost. Acá no se usan, y es deliberado: un
// botón "Invertir" en un canal es una orden a un clic de distancia, y el callback de Mattermost llega
// sin identidad verificable (este repo ya lo documentó). Aprobar una colocación se hace donde se
// opera —en Balanz, a mano, por una persona—, no desde un chat.

const pesos = (n) => (Number.isFinite(Number(n)) ? '$' + Math.round(Number(n)).toLocaleString('es-AR') : 'sin dato')
const pct = (x) => (Number.isFinite(Number(x)) ? (Number(x) * 100).toFixed(2) + '%' : 'sin dato')
const lista = (xs, vacio = '—') => (xs?.length ? xs.map((x) => `• ${x}`).join('\n') : vacio)

/** La propuesta de colocación, en el formato exacto que pidió el dueño. */
export function formatoPropuesta(rec, posicion, ctx = {}) {
  return [
    '**TESORERÍA · PROPUESTA DE INVERSIÓN**',
    '',
    `Caja disponible: ${pesos(posicion?.caja_real)}`,
    `Caja comprometida: ${pesos(posicion?.caja_comprometida)}`,
    `Reserva preservada: ${pesos(rec.reserva_preservada)}`,
    `Excedente invertible: ${pesos(rec.monto_maximo)}`,
    `Horizonte: ${rec.horizonte_dias} días`,
    '',
    `Alternativa recomendada: **${rec.instrumento}**`,
    `Moneda: ${rec.moneda}`,
    `Liquidez: T+${rec.plazo_rescate_dias ?? '?'}`,
    `Rendimiento estimado para el período: ${pct(rec.rendimiento_neto_periodo)} (${pesos(rec.ganancia_neta_estimada)})`,
    `Monto máximo sugerido: ${pesos(rec.monto_maximo)}`,
    '',
    `Obligaciones cubiertas:\n${lista(rec.obligaciones_cubiertas)}`,
    '',
    `Riesgos:\n${lista(rec.riesgos)}`,
    '',
    `Condiciones que invalidan la propuesta:\n${lista(rec.condiciones_invalidez)}`,
    '',
    `Confianza: ${rec.confianza}${rec.datos_faltantes?.length ? ` (faltan: ${rec.datos_faltantes.join(', ')})` : ''}`,
    '',
    `Fuente de caja: Flujo de Caja — ${ctx.fecha_caja ?? posicion?.fecha ?? 's/f'}`,
    `Fuente de mercado: Balanz — ${ctx.fecha_mercado ?? 's/f'}`,
    '',
    `Estado:\n**${rec.estado}**`,
  ].join('\n')
}

/**
 * EL MENSAJE QUE ESTA EMPRESA VA A VER CASI SIEMPRE. Con la cuenta en rojo no hay propuesta de
 * inversión que hacer, y decirlo con la misma estructura —números, fundamento, condición de
 * invalidez— es lo que lo convierte en una decisión y no en un "no hay nada".
 */
export function formatoAplicarADeuda(rec, posicion) {
  return [
    '**TESORERÍA · NO HAY EXCEDENTE INVERTIBLE**',
    '',
    `Caja disponible: ${pesos(posicion?.caja_real)}`,
    `Caja comprometida: ${pesos(posicion?.caja_comprometida)}`,
    '',
    `**${rec.titulo}**`,
    '',
    rec.fundamento,
    '',
    `Rendimiento equivalente: ${pct(rec.rendimiento_equivalente)} efectivo anual`,
    `Ahorro estimado: ${pesos(rec.ahorro_diario_estimado)} por día mientras el saldo siga en rojo`,
    '',
    `Condiciones que invalidan:\n${lista(rec.condiciones_invalidez)}`,
    '',
    `Confianza: ${rec.confianza}`,
    `Fuente de caja: ${rec.fuente_caja ?? 'Flujo de Caja'}`,
    '',
    `Estado:\n**${rec.estado}**`,
  ].join('\n')
}

/** Sesión vencida. Es un aviso operativo, no una alerta financiera: se dice qué tiene que hacer él. */
export function formatoSesionRequerida(motivo) {
  return [
    '**TESORERÍA · NO PUDE VER EL MERCADO**',
    '',
    `Motivo: ${motivo}`,
    '',
    'El análisis de caja se hizo igual; lo que falta son las alternativas de Balanz.',
    '',
    'Para habilitarlo: abrí Chrome con el puerto de depuración y entrá a Balanz a mano.',
    'El OS reusa esa sesión y NUNCA intenta iniciarla por su cuenta.',
  ].join('\n')
}

/**
 * ¿HAY QUE PUBLICAR? El pedido es explícito: sólo cambios materiales. Un mensaje diario que dice lo
 * mismo que ayer entrena a la gente a no leerlo, y entonces el día que dice algo distinto tampoco se
 * lee. Pura y testeable.
 */
export function esCambioMaterial(actual = {}, anterior = null, umbrales = {}) {
  if (!anterior) return { publicar: true, motivo: 'primera corrida' }
  const uMonto = Number(umbrales.monto ?? 500000)
  const uTasa = Number(umbrales.tasa ?? 0.02)

  if (Boolean(actual.en_descubierto) !== Boolean(anterior.en_descubierto)) {
    return { publicar: true, motivo: actual.en_descubierto ? 'la cuenta entró en descubierto' : 'la cuenta salió del descubierto' }
  }
  const antes = Number(anterior.excedente ?? 0)
  const ahora = Number(actual.excedente ?? 0)
  if (antes <= 0 && ahora > 0) return { publicar: true, motivo: 'apareció excedente invertible donde no había' }
  if (antes > 0 && ahora <= 0) return { publicar: true, motivo: 'desapareció el excedente invertible' }
  if (Math.abs(ahora - antes) >= uMonto) return { publicar: true, motivo: `el excedente cambió ${pesos(ahora - antes)}` }

  const tAntes = Number(anterior.mejor_tasa ?? 0)
  const tAhora = Number(actual.mejor_tasa ?? 0)
  if (Math.abs(tAhora - tAntes) >= uTasa) return { publicar: true, motivo: `la mejor tasa cambió ${pct(tAhora - tAntes)}` }

  if (actual.mejor_instrumento && actual.mejor_instrumento !== anterior.mejor_instrumento) {
    return { publicar: true, motivo: 'cambió el instrumento recomendado' }
  }
  if (actual.sesion_requerida && !anterior.sesion_requerida) {
    return { publicar: true, motivo: 'la sesión de Balanz venció' }
  }
  return { publicar: false, motivo: 'sin cambios materiales desde la corrida anterior' }
}
