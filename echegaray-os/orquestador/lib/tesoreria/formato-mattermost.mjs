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

/** El CFT anual del descubierto llevado al período. Aritmética, para no comparar peras con manzanas. */
const cftDelPeriodo = (anual, dias) => (Number.isFinite(Number(anual)) && Number.isFinite(Number(dias))
  ? ((1 + Number(anual)) ** (Number(dias) / 365)) - 1 : null)

/** La coordenada verificable de un término: dónde ir a mirarlo con los propios ojos. */
const coordenada = (o = {}) => [
  o.pestana ? `**${o.pestana}**` : o.fuente,
  o.criterio,
  o.fecha_dato ? `al ${o.fecha_dato}` : null,
].filter(Boolean).join(' · ')

/**
 * LA DERIVACIÓN DE UNA VENTANA — la respuesta a "cómo determinás ese valor", que el dueño pidió tres
 * veces. Cada línea lleva su monto y el lugar exacto del que sale.
 */
export function formatoDerivacion(d = {}, titulo = '') {
  if (d?.estado !== 'ok') return `_Sin derivación: ${d?.motivo ?? 'no se pudo calcular'}._`
  const L = [
    `**${titulo || `Cómo se determina el colocable a ${d.dias} días`}**`,
    '',
    `Todo lo que entra y sale entre hoy y el **${d.dia_de_tension}**, que es el peor día de los ${d.dias}: `
    + 'el colocable es lo que sobra ESE día, no al final de la ventana.',
    '',
    '```',
  ]
  for (const t of [...d.terminos, ...d.cierre]) {
    // El signo va en su columna: imprimir además el monto negativo daba "− ... $-4.700.000", que se
    // lee como una resta de un negativo. El único que va con signo propio es el total.
    const monto = t.signo === '=' ? pesos(t.monto) : pesos(Math.abs(t.monto))
    L.push(`${t.signo} ${t.concepto.padEnd(60).slice(0, 60)} ${monto.padStart(16)}   ${coordenada(t.origen).replace(/\*\*/g, '')}`)
  }
  L.push('```')
  // SI EL CUADRO NO CIERRA, SE DICE. Publicar una derivación que no llega al número publicado es peor
  // que no publicar ninguna.
  if (!d.chequeo?.coincide || d.chequeo?.monto_coincide === false) {
    L.push('', `⚠️ **EL CUADRO NO CIERRA**: los términos suman ${pesos(d.chequeo?.suma_terminos)} y el piso del recorrido es `
      + `${pesos(d.chequeo?.piso)}. No usar este número hasta entender la diferencia.`)
  }
  if (d.chequeo?.descuadre_calendario) {
    L.push('', `⚠️ hay ${pesos(d.chequeo.descuadre_calendario)} de diferencia entre el detalle por movimiento y el total diario del calendario.`)
  }
  L.push('', `Al último día de la ventana el saldo sería ${pesos(d.resto_de_la_ventana?.neto_al_vencimiento)}, `
    + `pero ${d.resto_de_la_ventana?.nota}.`)
  return L.join('\n')
}

/**
 * EL RENDIMIENTO, ABIERTO. Bruto, cada impuesto por separado y el neto — nunca un neto solo. Cuando
 * la propuesta no trae el cálculo de impuestos, lo dice en vez de presentar un bruto disfrazado.
 */
export function desgloseDeRendimiento(rec = {}) {
  const imp = rec.impuestos
  const capital = Number(rec.monto_maximo) || 0
  if (imp?.estado !== 'ok') {
    return [
      `Rendimiento bruto del período: ${pct(rec.rendimiento_bruto_periodo ?? rec.rendimiento_neto_periodo)}`,
      '⚠️ **SIN IMPUESTOS CALCULADOS**: este número NO es un rendimiento neto y no alcanza para decidir.',
    ]
  }
  const L = [`Rendimiento bruto del período: ${pct(rec.rendimiento_antes_de_impuestos_periodo ?? imp.rendimiento_bruto_periodo)} (${pesos(capital * (rec.rendimiento_antes_de_impuestos_periodo ?? imp.rendimiento_bruto_periodo))})`]
  for (const c of imp.cargas || []) {
    L.push(`  − ${c.concepto} · ${c.jurisdiccion} · ${pct(c.alicuota)} sobre ${c.base}: −${pesos(capital * c.peso_sobre_capital)}`)
  }
  L.push(`Rendimiento ${imp.etiqueta_neto}: **${pct(rec.rendimiento_neto_periodo)} (${pesos(rec.ganancia_neta_estimada)})**`)
  for (const p of imp.pendientes || []) L.push(`  ⚠️ falta ${p.concepto}: ${p.motivo}`)
  if ((imp.pendientes || []).length) L.push('  ⚠️ el resultado REAL es menor que el publicado: lo de arriba es antes de esos impuestos.')
  return L
}

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
    // EL BRUTO Y CADA DESCUENTO POR SEPARADO. Publicar sólo el neto obliga a creerlo.
    ...desgloseDeRendimiento(rec),
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
  // POR QUÉ LA VENTANA LARGA TIENE MENOS. Sin esta línea, "$46,6M a 1 día y $14,6M a 90" se lee como
  // un error del sistema — y así lo leyó el dueño.
  if (exc.por_que_baja_con_el_plazo?.texto) L.push('', `ℹ️ ${exc.por_que_baja_con_el_plazo.texto}`)
  // LA CUENTA, NO SÓLO EL RESULTADO. Se publica la de la ventana más larga con monto: es la que
  // encabeza las tablas de instrumentos y la que el dueño no podía auditar.
  const conDerivacion = (exc.ventanas_por_plazo || []).filter((v) => v.estado === 'ok' && v.derivacion?.estado === 'ok')
  const elegida = conDerivacion[conDerivacion.length - 1]
  if (elegida) L.push('', formatoDerivacion(elegida.derivacion, `Cómo se determina el colocable a ${elegida.dias} días — ${pesos(elegida.monto_maximo)}`))
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
 * POR QUÉ NO HAY PROPUESTA, BLOQUE POR BLOQUE.
 *
 * «0 propuestas» sin causa no se puede leer: no distingue "no conviene" de "el sistema no supo", y
 * las dos lecturas piden cosas opuestas del dueño. Cada línea nombra el bloque, el código de causa y
 * la explicación en pesos y días.
 */
export function formatoSinPropuesta(decision = {}) {
  const filas = decision.sin_propuesta || []
  if (!filas.length) return null
  const L = ['**TESORERÍA · POR QUÉ NO HAY PROPUESTA EN CADA BLOQUE**', '']
  if (decision.cancelacion?.hay_propuesta) {
    L.push(`Antes que nada: hay ${pesos(decision.cancelacion.deuda)} de descubierto y se propone cancelar `
      + `${pesos(decision.cancelacion.monto_a_cancelar)}. Ese monto ya NO figura como colocable en ningún bloque.`, '')
  }
  L.push('| Bloque | Plazo | Causa | Detalle |')
  L.push('|---|---|---|---|')
  for (const f of filas) {
    L.push(`| ${f.titulo ?? f.bloque ?? '—'} | ${f.dias ?? '—'} días | \`${f.codigo ?? 'sin_codigo'}\` | ${f.motivo ?? '—'} |`)
  }
  L.push('', `Propuestas emitidas en esta corrida: **${decision.n_propuestas ?? 0}**.`)
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
  // DE DÓNDE SALE EL MONTO DE ESTA TABLA. Era exactamente el número que el dueño no podía auditar.
  if (tabla.derivacion?.estado === 'ok') L.push(formatoDerivacion(tabla.derivacion, `De dónde salen los ${pesos(tabla.monto_a_colocar)}`), '')
  L.push(`Vara a superar: **${pct(tabla.vara?.periodo)}** en ${tabla.dias} día(s) — ${tabla.vara?.explicacion}`)
  L.push(`Equivale a ${pesos(tabla.vara?.en_pesos)}: es lo que cuesta NO hacer nada.`)
  // ═══ EL DESCUBIERTO ES CONTEXTO, NO LA VARA DE ESTA TABLA ═══
  //
  // Esta línea decía «ningún instrumento que rinda menos que eso justifica inmovilizar plata», con
  // «eso» = 62,78%. Era el defecto conceptual escrito con todas las letras en el mensaje que lee el
  // dueño: el descubierto mide lo que cuesta estar CORTO, no el costo de oportunidad de estar LARGO.
  // Sobre plata que igual iba a quedarse parada, la alternativa es CERO, y un plazo fijo al 30% neto
  // es ganancia pura aunque el descubierto cueste el doble. Lo que el CFT sí manda es la PRIORIDAD:
  // mientras haya rojo, el primer peso va a cancelarlo.
  L.push(`Contexto: el descubierto del acuerdo N°00007 cuesta **${pct(tabla.vara?.anual)} de CFT anual** `
    + `($1.506,85 por día por millón, verificado) — ${pct(cftDelPeriodo(tabla.vara?.anual, tabla.dias))} en ${tabla.dias} día(s). `
    + 'Eso fija la PRIORIDAD, no la vara: mientras haya saldo deudor el primer peso va a cancelarlo, y sólo lo que sobra se compara con esta tabla.', '')
  L.push(formatoImpuestos(tabla.fiscal, tabla.monto_a_colocar), '')
  if (tabla.viables?.length) {
    // BRUTO E IMPUESTOS AL LADO DEL NETO, SIEMPRE. Un neto sin su bruto no se puede discutir.
    L.push('| # | Instrumento | Ticker | TNA | TEA | Liquidez | Bruto en $ | Impuestos | Neto en $ | Riesgo | Mínimo |')
    L.push('|---|---|---|---:|---:|---|---:|---:|---:|---|---|')
    tabla.viables.forEach((f, i) => {
      const tna = f.tna_declarada != null ? pct(f.tna_declarada) : f.tna_equivalente != null ? `${pct(f.tna_equivalente)} _(calc.)_` : 'sin dato'
      // LA COMPUERTA: sin cálculo de impuestos NO se publica un neto. Un número que parece neto y es
      // bruto es el defecto que este informe viene a corregir; imprimirlo igual lo reintroduciría.
      const neto = f.impuestos?.estado === 'ok' ? `**${pesos(f.rinde_en_pesos)}**` : '**SIN IMPUESTOS CALCULADOS — no es un neto**'
      const imp = f.impuestos_en_pesos != null ? `−${pesos(f.impuestos_en_pesos)}` : 'DESCONOCIDO'
      L.push(`| ${i + 1} | ${f.instrumento} | ${f.ticker} | ${tna} | ${pct(f.tea)} | ${f.liquidez} | ${pesos(f.bruto_en_pesos)} | ${imp} | ${neto} | ${f.nivel_riesgo} | ${f.monto_minimo} |`)
    })
  } else {
    L.push('_Ninguna alternativa relevada supera la vara._')
  }
  L.push('', `Veredicto: ${tabla.veredicto}`)
  if (tabla.recomendacion) {
    const r = tabla.recomendacion
    L.push('', `**Recomendada: ${r.instrumento}** (${r.familia})`,
      `Por qué: rinde ${pct(r.rendimiento_neto_periodo)} ${r.etiqueta_neto ?? 'neto'} en ${tabla.dias} días — `
      + `${pct(r.exceso_sobre_vara)} por encima de la vara — y devuelve la plata en ${r.dias_vuelta} día(s).`,
      `Bruto ${pesos(r.bruto_en_pesos)} − impuestos ${pesos(r.impuestos_en_pesos)} = ${pesos(r.rinde_en_pesos)}.`)
    if (!r.impuestos_completos) {
      L.push(`⚠️ Este neto NO está completo: falta ${(r.impuestos_pendientes || []).map((p) => p.concepto).join(' y ')}. El número real es MENOR.`)
    }
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

/**
 * LOS IMPUESTOS DE LA COLOCACIÓN, antes de la tabla. Cada alícuota con su estado y su fuente, y las
 * que faltan con la pregunta exacta que hay que hacerle al estudio contable — no un "consultar".
 */
export function formatoImpuestos(fiscal = null, monto = 0) {
  if (!fiscal) return '⚠️ **Esta tabla no calculó impuestos**: los rendimientos de abajo son brutos, no netos.'
  const L = ['**Impuestos contemplados** (un rendimiento sin impuestos es una estimación optimista, no un resultado)', '']
  L.push('| Impuesto | Jurisdicción | Estado | Alícuota | Fuente |')
  L.push('|---|---|---|---:|---|')
  const ley = fiscal.ley_25413 ?? {}
  const alicuotaLey = ley.valor ? pct(Number(ley.valor.debito) + Number(ley.valor.credito)) : 'DESCONOCIDO'
  L.push(`| Ley 25.413 (débitos y créditos) | nacional | ${ley.estado ?? 'DESCONOCIDO'} | ${alicuotaLey} sobre el capital | ${ley.fuente ?? ley.motivo ?? '—'} |`)
  for (const [k, titulo, jur] of [['iibb', 'Ingresos Brutos sobre intereses', 'San Juan'], ['ganancias', 'Ganancias', 'nacional']]) {
    const p = fiscal[k] ?? {}
    L.push(`| ${titulo} | ${jur} | ${p.estado ?? 'DESCONOCIDO'} | ${p.valor != null ? pct(p.valor) : 'DESCONOCIDO'} | ${p.fuente ?? p.motivo ?? '—'} |`)
  }
  if (Number(monto) > 0 && ley.estado === 'conocido') {
    const tasa = Number(ley.valor.debito) + Number(ley.valor.credito)
    L.push('', `Sobre ${pesos(monto)}, sacar la plata y traerla de vuelta paga ${pesos(Number(monto) * tasa)} de impuesto al cheque `
      + '— y eso se paga aunque la colocación no rinda nada.')
  }
  // LO QUE FALTA SE DERIVA DE LOS PARÁMETROS, no de que alguien se acuerde de pasarlo. Si dependiera
  // de un campo opcional, el día que no viaje el mensaje quedaría diciendo "neto" sin asterisco.
  const pendientes = fiscal.pendientes?.length ? fiscal.pendientes
    : [fiscal.iibb, fiscal.ganancias].filter((p) => p && p.estado !== 'conocido')
      .map((p) => ({ concepto: p === fiscal.iibb ? 'Ingresos Brutos (San Juan)' : 'Impuesto a las Ganancias', motivo: p.motivo, pregunta: p.pregunta }))
  if (pendientes.length) {
    L.push('', '**Lo que falta para poder llamarlo NETO** (mientras tanto, el neto publicado es un techo, no un resultado):')
    L.push(lista(pendientes.map((p) => `${p.concepto} — ${p.motivo}. Pregunta concreta: _${p.pregunta}_`)))
  }
  if (fiscal.fuera_de_alcance?.length) L.push('', `Fuera del alcance de este cálculo: ${fiscal.fuera_de_alcance.join(' · ')}.`)
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
