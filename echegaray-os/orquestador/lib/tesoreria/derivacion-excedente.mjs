// DE DÓNDE SALE EL NÚMERO — la aritmética del excedente, término por término, con su origen.
//
// ═══ POR QUÉ ESTE MÓDULO EXISTE ═══
//
// El informe decía «ALTERNATIVAS A 90 DÍAS — sobre $5.623.127» y nada más. Un monto de plata sin su
// derivación no se puede auditar ni discutir: el dueño lo rechazó tres veces pidiendo exactamente
// esto. Un número que sólo se puede creer no es un número, es una opinión con formato de número.
//
// ═══ LA TRAMPA QUE HAY QUE EVITAR AL MOSTRARLO ═══
//
// La tentación es publicar la cuenta de servilleta —caja + lo que entra en 90 días − lo que sale en
// 90 días− porque suma redondo. Pero ése NO es el número que el motor usa: el motor toma el SALDO
// MÍNIMO del recorrido (`excedente-ventana.mjs`), que casi siempre cae mucho antes del último día.
// Publicar una derivación que no llega al monto publicado sería peor que no publicar ninguna:
// dejaría al dueño con dos números y ninguna forma de saber cuál manda.
//
// Por eso la derivación se arma **hasta el día de tensión**, que es el día que efectivamente decide,
// y cierra con una identidad exacta:
//
//     Σ(términos) = piso · piso − restringida fuera del calendario − reserva = monto_maximo
//
// `chequeo.coincide` verifica esa identidad en cada corrida. Si alguna vez da false, el informe lo
// dice en vez de publicar un cuadro que no cierra.
//
// ═══ Y POR QUÉ A 90 DÍAS HAY MENOS QUE A 1 DÍA ═══
//
// Porque el piso de 90 días es el peor día de 90, y el de 1 día es el peor de 1: la ventana larga
// contiene a la corta, así que su piso sólo puede ser igual o menor. Medido el 03/08/2026: bloque A
// (1 día) $46.592.291 contra bloque D (90 días) $14.621.291, y la diferencia entera es el 05/08,
// cuando vencen $42,4M de cheques firmados. Sin decirlo, eso parece un error del sistema.

const redondear = (n) => Math.round(Number(n) || 0)

/**
 * DE QUÉ PESTAÑA SALE CADA COSA. El calendario declara un `origen` por movimiento; acá se traduce a
 * la coordenada que el dueño puede ir a mirar con sus propios ojos: pestaña y criterio de filtrado.
 * Un origen desconocido NO se inventa: se devuelve tal cual vino, marcado.
 */
export function origenDeMovimiento(origen = '') {
  const o = String(origen)
  if (/cheques emitidos/i.test(o)) {
    return { fuente: 'Flujo de Caja', pestana: 'Cheques Emitidos', criterio: 'cheques firmados con DEBITADO ≠ "Sí", por fecha de vencimiento' }
  }
  if (/cobranzas/i.test(o)) {
    return { fuente: 'Flujo de Caja', pestana: 'Cobranzas', criterio: 'filas sin cobrar, por fecha esperada reproyectada con el atraso típico del cliente' }
  }
  if (/compras/i.test(o)) {
    return { fuente: 'Flujo de Caja', pestana: 'Compras', criterio: 'comprobantes pendientes de pago, por fecha de vencimiento' }
  }
  if (/obligacion_resumen/i.test(o)) {
    return { fuente: 'Postgres', pestana: null, criterio: 'vista obligacion_resumen — la fuente única de obligaciones fiscales y laborales' }
  }
  return { fuente: 'DESCONOCIDO', pestana: null, criterio: `origen no mapeado: "${o}"` }
}

/** Cómo se nombra cada concepto en el cuadro. El nombre es del negocio, no de la columna. */
const CONCEPTO = {
  cheque: 'cheques firmados que vencen',
  impuesto: 'impuestos y obligaciones fiscales',
  cargas_sociales: 'cargas sociales',
  obligacion: 'obligaciones (UOCRA · IERIC · financiación)',
  proveedor: 'pagos a proveedores',
  cobranza: 'cobranzas que entran',
  egreso: 'otros egresos',
}

/** Agrupa los movimientos de los días 0..hasta por (dirección, origen, categoría). */
export function agruparMovimientos(dias = [], hasta = 0, factorIngresos = 1) {
  const grupos = new Map()
  let ingAgregado = 0
  let egrAgregado = 0
  for (const d of dias.slice(0, hasta + 1)) {
    ingAgregado += Number(d.ingresos) || 0
    egrAgregado += Number(d.egresos) || 0
    for (const m of d.movimientos || []) {
      const esIngreso = m.tipo === 'ingreso'
      const clave = `${m.tipo}|${m.origen ?? ''}|${m.categoria ?? ''}`
      const previo = grupos.get(clave) ?? {
        tipo: m.tipo,
        concepto: CONCEPTO[m.categoria] ?? CONCEPTO[esIngreso ? 'cobranza' : 'egreso'],
        categoria: m.categoria ?? null,
        origen: origenDeMovimiento(m.origen),
        bruto: 0,
        n: 0,
      }
      previo.bruto += Number(m.monto) || 0
      previo.n += 1
      grupos.set(clave, previo)
    }
  }
  const lista = [...grupos.values()].map((g) => ({
    ...g,
    // El escenario adverso castiga SÓLO las cobranzas: un egreso no se cobra a la mitad.
    monto: g.tipo === 'ingreso' ? g.bruto * Number(factorIngresos) : g.bruto,
  }))
  const sumaMov = lista.reduce((s, g) => s + (g.tipo === 'ingreso' ? g.bruto : -g.bruto), 0)
  return { grupos: lista, agregado: ingAgregado - egrAgregado, suma_movimientos: sumaMov }
}

/** Un término del cuadro. `origen` es la coordenada verificable, no una etiqueta decorativa. */
const termino = (signo, concepto, monto, origen, extra = {}) => ({
  signo, concepto, monto: redondear(signo === '−' ? -Math.abs(monto) : monto), origen, ...extra,
})

/**
 * LOS TÉRMINOS QUE NO SALEN DEL CALENDARIO: la caja de arranque, lo ya vencido, los valores a
 * depositar y los cheques que el calendario no puede ver (vencidos sin debitar o sin fecha).
 */
function terminosDeApertura({ saldoInicial, vencido, vencidoDetalle, valoresADepositar, diasAcreditacion, indice, fechaCaja }) {
  const t = [termino('+', 'caja líquida en pesos', saldoInicial,
    { fuente: 'Flujo de Caja', pestana: 'CAJA', criterio: 'filas de disponibilidad en pesos (no entran dólares ni valores a depositar)', fecha_dato: fechaCaja })]
  // ═══ LO VENCIDO SE ABRE POR FUENTE ═══
  //
  // La primera versión lo mostraba entero atribuido a "Compras", y contra la corrida real del
  // 03/08/2026 eso era FALSO: los $4.700.000 salían de `obligacion_resumen` y Compras no tenía una
  // sola fila vencida. Una coordenada equivocada es peor que ninguna — manda al dueño a mirar la
  // pestaña donde el número no está, y cuando no lo encuentra, con razón deja de creerle al informe.
  const fiscal = Number(vencidoDetalle?.vencido_fiscal) || 0
  const comercial = Number(vencidoDetalle?.vencido_comercial) || 0
  if (fiscal > 0) {
    t.push(termino('−', 'obligaciones fiscales y laborales ya vencidas', fiscal,
      { fuente: 'Postgres', pestana: null, criterio: 'vista obligacion_resumen · vencidas y sin pagar; el calendario arranca hoy y no las ve' }))
  }
  if (comercial > 0) {
    t.push(termino('−', 'deuda comercial vencida', comercial,
      { fuente: 'Flujo de Caja', pestana: 'Compras', criterio: 'comprobantes con vencimiento anterior a hoy y sin pagar' }))
  }
  const resto = Number(vencido) - fiscal - comercial
  if (Math.abs(resto) >= 1) {
    t.push(termino('−', 'lo ya vencido y sin pagar (sale el día 0)', resto,
      { fuente: 'cálculo', pestana: null, criterio: 'caja comprometida que el desglose por fuente no explica: revisar posicion.detalle' }))
  }
  const acreditaDentro = Number(valoresADepositar) > 0 && Number(diasAcreditacion) <= indice
  t.push(termino('+', `valores a depositar (acreditan a ${diasAcreditacion} días)`, acreditaDentro ? valoresADepositar : 0,
    {
      fuente: 'Flujo de Caja',
      pestana: 'CAJA',
      criterio: acreditaDentro
        ? 'cheques en cartera: se depositan y acreditan dentro de la ventana'
        : `cheques en cartera por $${redondear(valoresADepositar).toLocaleString('es-AR')}: acreditan DESPUÉS del día de tensión, así que no lo salvan`,
      fecha_dato: fechaCaja,
    }))
  return t
}

/**
 * LA DERIVACIÓN DE UNA VENTANA. Pura: no lee nada. Devuelve el cuadro término por término y el
 * chequeo de que la suma da exactamente el monto que se publica.
 *
 * @param {object} o insumos idénticos a los de `ventanaDeExcedente`, más el `corrido` ya calculado
 */
export function derivacionDeVentana({
  dias = [], hasta = 30, corrido = {}, saldoInicial = 0, vencido = 0, valoresADepositar = 0,
  diasAcreditacion = 3, factorIngresos = 1, reserva = 0, restringidaFueraDelCalendario = 0,
  fechaCaja = null, montoMaximo = null, vencidoDetalle = null,
} = {}) {
  if (corrido.estado !== 'ok') {
    return { estado: 'sin_dato', motivo: corrido.motivo ?? 'el recorrido no se pudo calcular', terminos: [] }
  }
  // El día que DECIDE. -1 significa que el peor momento es antes de que se mueva un solo peso.
  const indice = Number.isInteger(corrido.indice_tension) ? corrido.indice_tension : hasta
  const { grupos, agregado, suma_movimientos: sumaMov } = agruparMovimientos(dias, indice, factorIngresos)

  const terminos = terminosDeApertura({ saldoInicial, vencido, vencidoDetalle, valoresADepositar, diasAcreditacion, indice, fechaCaja })
  for (const g of grupos.sort((a, b) => Math.abs(b.monto) - Math.abs(a.monto))) {
    const esIngreso = g.tipo === 'ingreso'
    // El concepto se mantiene corto a propósito: el cuadro se lee en un canal de chat y una línea que
    // se corta a la mitad deja de ser una derivación auditable.
    const sufijo = esIngreso && Number(factorIngresos) !== 1
      ? ` (${g.n} de $${redondear(g.bruto).toLocaleString('es-AR')}, al ${Math.round(factorIngresos * 100)}% adverso)`
      : ` (${g.n} fila${g.n === 1 ? '' : 's'})`
    terminos.push(termino(esIngreso ? '+' : '−', `${g.concepto}${sufijo}`, g.monto, g.origen, { n: g.n, bruto: redondear(g.bruto) }))
  }
  // EL DESCUADRE SE DICE, NO SE TAPA. Si el detalle no reconstruye el agregado del calendario, el
  // cuadro está mintiendo aunque cierre contra el piso — y eso hay que verlo, no descubrirlo después.
  const descuadre = redondear(agregado - sumaMov)
  if (descuadre !== 0) {
    terminos.push(termino(descuadre > 0 ? '+' : '−', 'DESCUADRE entre el detalle y el total del calendario', Math.abs(descuadre),
      { fuente: 'control interno', pestana: null, criterio: 'el detalle por movimiento no reconstruye el agregado diario: hay un movimiento sin categoría o sin origen' }))
  }

  const suma = terminos.reduce((s, t) => s + t.monto, 0)
  const cierre = [
    termino('=', `piso del recorrido (el peor día: ${corrido.fecha_tension})`, corrido.piso,
      { fuente: 'cálculo', pestana: null, criterio: 'saldo mínimo día por día — no el saldo del último día' }),
  ]
  if (Number(restringidaFueraDelCalendario) > 0) {
    cierre.push(termino('−', 'cheques vencidos sin debitar o sin fecha (el calendario no los ve)', restringidaFueraDelCalendario,
      { fuente: 'Flujo de Caja', pestana: 'Cheques Emitidos', criterio: 'DEBITADO ≠ "Sí" con fecha anterior a hoy o sin fecha: pueden caer cualquier día' }))
  }
  cierre.push(termino('−', 'reserva mínima aprobada', reserva,
    { fuente: 'Postgres', pestana: null, criterio: 'tesoreria.politicas · clave reserva_minima · decisión del dueño, no del software' }))
  const monto = Math.max(0, corrido.piso - (Number(restringidaFueraDelCalendario) || 0) - (Number(reserva) || 0))
  cierre.push(termino('=', `colocable a ${hasta} días`, monto, { fuente: 'cálculo', pestana: null, criterio: 'piso − restringida fuera del calendario − reserva, con piso en cero' }))

  return {
    estado: 'ok',
    dias: hasta,
    dia_de_tension: corrido.fecha_tension,
    indice_tension: indice,
    terminos,
    cierre,
    piso: redondear(corrido.piso),
    monto_maximo: redondear(monto),
    // LA IDENTIDAD. Si esto da false, el cuadro publicado no explica el número publicado.
    chequeo: {
      suma_terminos: redondear(suma),
      piso: redondear(corrido.piso),
      coincide: Math.abs(suma - corrido.piso) <= 1,
      monto_declarado: montoMaximo == null ? null : redondear(montoMaximo),
      monto_coincide: montoMaximo == null ? null : Math.abs(redondear(montoMaximo) - redondear(monto)) <= 1,
      descuadre_calendario: descuadre,
    },
    // Lo que pasa DESPUÉS del día de tensión, para que la ventana entera se vea y no sólo su peor día.
    resto_de_la_ventana: {
      entradas: redondear(corrido.entradas),
      salidas: redondear(corrido.salidas),
      neto_al_vencimiento: redondear(corrido.saldo_final),
      nota: 'el neto al último día es mayor que el piso: entre medio hay un día que hay que aguantar, y ése es el que manda',
    },
  }
}

/**
 * POR QUÉ LA VENTANA LARGA TIENE MENOS. Compara los pisos de las ventanas y nombra el día y el monto
 * que explican la caída. Sin esto, "a 1 día $46,6M y a 90 días $14,6M" se lee como un error.
 */
export function porQueBajaConElPlazo(ventanas = []) {
  const ok = ventanas.filter((v) => v.estado === 'ok' && Number.isFinite(Number(v.piso)))
    .sort((a, b) => Number(a.dias) - Number(b.dias))
  if (ok.length < 2) return null
  const corta = ok[0]
  const larga = ok[ok.length - 1]
  const caida = Number(corta.monto_maximo) - Number(larga.monto_maximo)
  if (!(caida > 0)) {
    return {
      hay_caida: false,
      texto: `el colocable no baja con el plazo: el peor día del recorrido (${larga.fecha_tension}) cae dentro de las ${ok.length} ventanas por igual`,
    }
  }
  return {
    hay_caida: true,
    dias_corta: corta.dias,
    dias_larga: larga.dias,
    caida: redondear(caida),
    dia_que_la_explica: larga.fecha_tension,
    texto: `a ${larga.dias} días hay $${redondear(caida).toLocaleString('es-AR')} MENOS que a ${corta.dias} día(s), y no es un error: `
      + `para inmovilizar plata ${larga.dias} días hay que aguantar todos los pagos de esos ${larga.dias} días. `
      + `El día que decide es el ${larga.fecha_tension}; a ${corta.dias} día(s) ese día todavía no llegó.`,
  }
}

export const VERSION_SKILL = '1.0.0'
