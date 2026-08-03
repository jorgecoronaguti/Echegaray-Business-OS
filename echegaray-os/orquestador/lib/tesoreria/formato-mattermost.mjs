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

/**
 * EL EXCEDENTE POR PLAZO. Un número único no es una decisión: colocar a 30 días y a 90 días son dos
 * decisiones distintas sobre el mismo peso, y la diferencia entre "con cobranzas" y "sin cobranzas" es
 * justo lo que hay que mirar antes de inmovilizar plata.
 */
export function formatoExcedentePorPlazo(exc = {}) {
  const L = ['**TESORERÍA · EXCEDENTE POR PLAZO**', '']
  L.push('| Plazo | Colocable hoy | Si no cobrás nada | Piso del período | Día de tensión |')
  L.push('|---|---:|---:|---:|---|')
  for (const v of exc.ventanas_por_plazo || []) {
    if (v.estado !== 'ok') { L.push(`| ${v.dias} días | sin dato | — | — | ${v.motivo ?? ''} |`); continue }
    L.push(`| ${v.dias} días | **${pesos(v.monto_maximo)}** | ${pesos(v.monto_sin_creerle_a_las_cobranzas)} | ${pesos(v.piso)} | ${v.fecha_tension} |`)
  }
  L.push('', `Reserva mínima aprobada y preservada: ${pesos(exc.reserva_preservada)}`)
  // EL SOLAPAMIENTO SE DICE. Es plata real que el dueño podría liberar cambiando su propia política,
  // y el software no puede cambiarla por él.
  const s = exc.solape_reserva
  if (s?.solapado > 0) {
    L.push('', `⚠️ ${s.nota}`,
      `Si la reserva pasara a ser un colchón para lo IMPREVISTO en vez de los egresos que el calendario ya descuenta, `
      + `el colocable a 30 días subiría a ${pesos((exc.ventanas_por_plazo || [])[0]?.monto_si_reserva_no_duplicara)}. **Es una decisión tuya, no del OS.**`)
  }
  return L.join('\n')
}

/**
 * LA TABLA COMPARATIVA DE INSTRUMENTOS — lo que el dueño pidió dos veces y no estaba.
 *
 * Se publica SIEMPRE que haya relevamiento, tenga o no la empresa excedente: saber que el mercado paga
 * 40% cuando el descubierto cuesta 62,78% es información aunque hoy no haya un peso para colocar.
 */
export function formatoTablaInstrumentos(tabla = {}) {
  const L = [`**TESORERÍA · ALTERNATIVAS A ${tabla.dias} DÍAS** — sobre ${pesos(tabla.monto_a_colocar)}`, '']
  L.push(`Vara a superar: **${pct(tabla.vara?.periodo)}** en ${tabla.dias} días (${pct(tabla.vara?.anual)} anual) — ${tabla.vara?.explicacion}`)
  L.push(`Equivale a ${pesos(tabla.vara?.en_pesos)}: es lo que cuesta NO hacer nada.`, '')
  if (tabla.viables?.length) {
    L.push('| # | Instrumento | Ticker | TNA | TEA | Liquidez | Rinde en $ | Riesgo | Mínimo |')
    L.push('|---|---|---|---:|---:|---|---:|---|---|')
    tabla.viables.forEach((f, i) => {
      const tna = f.tna_declarada != null ? pct(f.tna_declarada) : f.tna_equivalente != null ? `${pct(f.tna_equivalente)} _(calc.)_` : 'sin dato'
      L.push(`| ${i + 1} | ${f.instrumento} | ${f.ticker} | ${tna} | ${pct(f.tea)} | ${f.liquidez} | **${pesos(f.rinde_en_pesos)}** | ${f.nivel_riesgo} | ${f.monto_minimo} |`)
    })
  } else {
    L.push('_Ninguna alternativa relevada supera la vara._')
  }
  L.push('', `Veredicto: ${tabla.veredicto}`)
  if (tabla.recomendacion) {
    L.push('', `**Recomendada: ${tabla.recomendacion.instrumento}** (${tabla.recomendacion.familia})`,
      `Por qué: rinde ${pct(tabla.recomendacion.rendimiento_neto_periodo)} neto en ${tabla.dias} días — `
      + `${pct(tabla.recomendacion.exceso_sobre_vara)} por encima de la vara — y devuelve la plata en ${tabla.recomendacion.dias_vuelta} día(s).`)
  }
  if (tabla.por_que_no_las_otras?.length) {
    L.push('', 'Por qué NO las otras:', lista(tabla.por_que_no_las_otras.map((x) => `${x.instrumento}: ${x.motivo}`).slice(0, 12)))
  }
  if (tabla.familias_sin_dato?.length) {
    L.push('', 'Familias sin dato en esta corrida (**DESCONOCIDO**, no se estima):',
      lista(tabla.familias_sin_dato.map((f) => `${f.familia}: ${f.motivo}`)))
  }
  return L.join('\n')
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
