// DE LA PESTAÑA AL PORTAL — la traducción, pura y probable.
//
// ═══ POR QUÉ ESTO EXISTE ═══
//
// Las obras y sus cronogramas viven en el Sheet «Flujo de Caja», pestañas OBRAS (bloque 3) y
// Cobranzas. El portal del cliente no puede leer el Sheet en cada carga —lento, y una pantalla que
// un tercero mira no puede depender de que Google conteste— así que se copian a Postgres.
//
// ═══ LO QUE NO HACE ═══
//
// No adivina a qué obra va una cobranza. Cada obra declara sus PALABRAS, y una fila que no calza con
// ninguna queda SIN IMPUTAR y se informa. Repartirla «por proporción» o mandarla a la primera obra
// del cliente pondría plata de una obra en el cronograma de otra, y el cliente lo ve.

/** El importe como lo escribe el Sheet en es-AR: `$ 1.234.567,89`, `($ 96.800)`, `—`. */
export function monto(crudo) {
  const s = String(crudo ?? '').trim()
  if (!s || s === '—' || s === '-') return null
  const negativo = /^\(/.test(s)
  const n = Number(s.replace(/[^0-9,.-]/g, '').replace(/\./g, '').replace(',', '.'))
  if (!Number.isFinite(n)) return null
  return negativo ? -Math.abs(n) : n
}

/** `28/08/2026` o `28/8/26` → `2026-08-28`. Cualquier otra cosa, null: una fecha inventada vence. */
export function fecha(crudo) {
  const m = String(crudo ?? '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (!m) return null
  const a = m[3].length === 2 ? `20${m[3]}` : m[3]
  return `${a}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
}

const sinTildes = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

/**
 * El rótulo de OBRAS: `3.1 · San Francisco — PISOS INDUSTRIALES · 05/08 → 30/09`.
 *
 * Devuelve el cliente, el nombre de la obra y las dos fechas. El «▲» al final es una marca de aviso
 * de la pestaña, no parte del nombre.
 */
export function partirRotuloDeObra(crudo) {
  const s = String(crudo ?? '').replace(/\s*▲\s*$/, '').trim()
  const m = s.match(/^[\d.]+\s*·\s*(.+?)\s*—\s*(.+?)(?:\s*·\s*(\d{1,2}\/\d{1,2})\s*→\s*(\d{1,2}\/\d{1,2}))?$/)
  if (!m) return null
  return { cliente: m[1].trim(), obra: m[2].trim(), desde: m[3] ?? null, hasta: m[4] ?? null }
}

/** `05/08` sin año: el año lo pone el ejercicio de la pestaña. Sin año no hay fecha. */
export function fechaCorta(ddmm, anio) {
  if (!ddmm || !anio) return null
  const [d, m] = String(ddmm).split('/')
  return `${anio}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/**
 * NÚCLEO PURO: ¿a qué obra pertenece esta fila de Cobranzas?
 *
 * Se busca en el concepto, el detalle y la orden de compra alguna de las PALABRAS que declara cada
 * obra del cliente. Gana la coincidencia más larga —«instalacion electrica» antes que «pisos» si las
 * dos calzaran— y ante empate no se elige: se devuelve null y la fila queda sin imputar.
 *
 * UNA PALABRA SUELTA NO ALCANZA CUANDO LA OBRA TIENE VARIAS. «Rep de pisos - canalizacion» comparte
 * «pisos» con la obra «Cambio de Pisos - RRHH» y no tiene nada que ver: son dos trabajos distintos
 * del mismo cliente. Por eso una obra de varias palabras exige el nombre entero o DOS de sus
 * palabras. Una obra de una sola palabra —«BSA», «MAMPOSTERÍA»— sólo tiene esa, y con ésa alcanza.
 *
 * @returns {{obra: object, palabra: string}|null}
 */
export function imputarObra(fila, obrasDelCliente) {
  // EL ATAJO DE OBRA ÚNICA: un cliente con UNA sola obra en todo el universo no tiene ambigüedad
  // posible — no hay una segunda a la que la fila pudiera pertenecer.
  //
  // La versión anterior exigía además que estuviera declarada en el bloque OBRAS del Sheet, para
  // evitar que un cliente con una obra vieja se comiera todo. Con el universo apuntando a
  // `obra_canonica` —el registro real de obras del OS— esa exigencia dejaba a ARCOR sin nada: es un
  // cliente de MANTENIMIENTO, sus trece cobranzas son órdenes de compra sueltas (bacheo,
  // compactación, cortinas) y su única obra no se declara en curso porque no es una obra en curso.
  // El resultado era $49,8 M que no aparecían en ningún lado. Con una sola obra no hay nada que
  // mezclar; el riesgo real vuelve recién con la segunda.
  if (obrasDelCliente.length === 1) {
    return { obra: obrasDelCliente[0], palabra: '(única obra del cliente)' }
  }
  const texto = sinTildes(`${fila.concepto ?? ''} ${fila.detalle ?? ''} ${fila.ordenCompra ?? ''}`)
  let mejor = null
  for (const obra of obrasDelCliente) {
    const [completo, ...partes] = (obra.palabras ?? []).map(sinTildes)
    let señal = null
    if (completo && texto.includes(completo)) señal = completo
    else {
      const calzan = partes.filter((p) => p && texto.includes(p))
      // Una obra de varias palabras necesita dos; una de una sola palabra, esa.
      if (calzan.length >= Math.min(2, partes.length) && calzan.length > 0) {
        señal = calzan.reduce((a, b) => (b.length > a.length ? b : a))
      }
    }
    if (!señal) continue
    if (!mejor || señal.length > mejor.palabra.length) mejor = { obra, palabra: señal }
    else if (señal.length === mejor.palabra.length && mejor.obra !== obra) mejor = { ...mejor, empate: true }
  }
  if (mejor && !mejor.empate) return { obra: mejor.obra, palabra: mejor.palabra }

  // ═══ EL RESPALDO: EL RÓTULO DEL CLIENTE NOMBRA LA OBRA ═══
  //
  // En Cobranzas el cliente se escribe «IMOTOR/San Francisco/JAVI SANCHEZ»: la obra está ahí, no en
  // el concepto. Por eso «Certificado 2», «Certificado 3» y seis pagos en efectivo —$104,77 M ya
  // COBRADOS— no nombraban obra: para quien carga la planilla es obvia.
  //
  // SÓLO CUANDO EL CONCEPTO NO DIJO NADA, y NUNCA para una fila que abarca varias obras: ahí el
  // rótulo del cliente metería en una sola obra plata que es de todas. Esas quedan a nivel cliente.
  if (abarcaVariasObras(`${fila.concepto ?? ''} ${fila.ordenCompra ?? ''}`)) return null
  const delCliente = sinTildes(fila.clienteSheet ?? '')
  if (!delCliente) return null
  let porCliente = null
  for (const obra of obrasDelCliente) {
    for (const palabra of (obra.palabras ?? []).map(sinTildes)) {
      // Sólo la obra dicha ENTERA. Una palabra suelta del rótulo del cliente no alcanza: «IMOTOR»
      // calzaría con cualquier cosa.
      if (!palabra || !palabra.includes(' ') || !delCliente.includes(palabra)) continue
      if (!porCliente || palabra.length > porCliente.palabra.length) porCliente = { obra, palabra }
      else if (palabra.length === porCliente.palabra.length && porCliente.obra !== obra) porCliente = { ...porCliente, empate: true }
    }
  }
  if (!porCliente || porCliente.empate) return null
  return { obra: porCliente.obra, palabra: `${porCliente.palabra} (del rótulo del cliente)` }
}

/**
 * NÚCLEO PURO: las palabras con las que una obra se reconoce, por su nombre Y por su id.
 *
 * «PISOS INDUSTRIALES» → ['pisos industriales', 'pisos']. La palabra entera primero: es la que
 * desempata contra otra obra del mismo cliente que comparta un término.
 *
 * ═══ EL ID TAMBIÉN NOMBRA A LA OBRA (26/08/2026) ═══
 *
 * La obra `san-francisco` se llama «Galpones, Mampostería, Cancha de Padel», y cuatro filas de
 * Cobranzas por $47,66 M dicen «Saldo obras San Francisco — 1/4». El concepto SÍ nombraba la obra;
 * lo que no la reconocía era el buscador, que sólo miraba el nombre cargado. Quedaban sin imputar
 * por una diferencia de rótulo entre dos lugares del mismo sistema.
 */
export function palabrasDeObra(nombre, id) {
  const deTexto = (t) => sinTildes(String(t ?? '')).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
  const limpio = deTexto(nombre)
  const porId = deTexto(String(id ?? '').replace(/-/g, ' '))
  const util = (w) => w.length > 3 && !['para', 'sobre', 'obra', 'obras', 'salon'].includes(w)
  const partes = [...new Set([...limpio.split(' '), ...porId.split(' ')])].filter(util)
  // El id entero va junto al nombre entero: los dos son «la obra dicha completa» y ganan el desempate.
  return [...new Set([limpio, porId, ...partes].filter(Boolean))]
}

/**
 * ¿ESTA FILA HABLA DE VARIAS OBRAS A LA VEZ? Entonces no es de ninguna.
 *
 * «Anticipos quincenales de todas las obras», «Saldo 50% de todas las obras». Sin este freno, el
 * respaldo por el rótulo del cliente —que abajo manda «IMOTOR/San Francisco» a la obra
 * `san-francisco`— las metería enteras en una sola obra, que es exactamente repartir plata de una
 * obra al cronograma de otra.
 */
export function abarcaVariasObras(texto) {
  return /\btodas las obras\b|\bde todas\b|\bvarias obras\b/.test(sinTildes(texto))
}

/** El estado de la fila de Cobranzas, traducido al del cronograma del portal. */
export function estadoDeCobranza(estado, fechaPago) {
  const e = sinTildes(estado)
  if (e === 'cobrado' || fechaPago) return 'pagado'
  if (e === 'facturado' || e === 'pendiente') return null // lo decide la fecha, como en el portal
  if (e === 'proyectado') return 'sin_factura'
  return null
}

/** Una fila de Cobranzas que no se carga nunca: la que el dueño marcó para cancelar. */
export function seDescarta(estado) {
  return sinTildes(estado) === 'cancelar'
}

// ── LO QUE EL CLIENTE NO PUEDE LEER ──────────────────────────────────────────────────────────
//
// La columna B de Cobranzas es «Categoría» y vale B o N: facturado o efectivo no declarado. Es
// contabilidad interna. El portal lo mira gente de AFUERA de la empresa, así que ningún rótulo ni
// nota puede llevar esos términos — y una certificación partida en una fila B y una fila N es, para
// el cliente, UN cobro por la suma de las dos.
//
// La lista es de TÉRMINOS, no de columnas: el dato nunca se copia de la columna B, pero el concepto
// que escribe una persona sí los repite («Playon Azufre - Blanco - Certificación 1/2»).
const PROHIBIDOS = [
  /\bblancos?\b/i,
  /\bnegros?\b/i,
  /\bno\s+declarad\w*/i,
  /\bcategor[ií]a\s*[BN]\b/i,
  // « - B - » / « · N · »: la categoría abreviada entre separadores.
  /(?:^|\s[-·]\s)[BN](?=\s[-·]\s|$)/,
]

/** El término prohibido que trae el texto, o null. Se usa en el test Y como freno antes de escribir. */
export function terminoProhibido(texto) {
  const s = String(texto ?? '')
  for (const re of PROHIBIDOS) { const m = s.match(re); if (m) return m[0].trim() }
  return null
}

/** El mismo texto sin la categoría contable: «Playon Azufre - Blanco - Cert. 1/2» → «Playon Azufre - Cert. 1/2». */
export function sinCategoriaContable(texto) {
  return String(texto ?? '')
    .replace(/\s*[-·—]\s*(?:blancos?|negros?)\b/gi, '')
    .replace(/\b(?:blancos?|negros?)\s*[-·—]\s*/gi, '')
    .replace(/\b(?:blancos?|negros?)\b/gi, '')
    .replace(/(^|\s[-·]\s)[BN](?=\s[-·]\s|$)/g, '$1')
    .replace(/\s*[-·—]\s*[-·—]\s*/g, ' - ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s\-·—]+|[\s\-·—]+$/g, '')
    .trim()
}

const CERTIFICACION = /certificaci[oó]n\s*(?:quincenal\s*)?n?[°º]?\s*(\d+)/i
const CERTIFICADO = /certificado\s*n?[°º]?\s*(\d+)/i

/**
 * NÚCLEO PURO: qué ES esta fila para el cliente, y cómo se llama en su cronograma.
 *
 * El rótulo que ve el cliente no es el concepto del Sheet. El concepto repite el nombre de la obra
 * («Playon Azufre»), arrastra la categoría contable y a veces es la orden de compra. Lo que el
 * cliente necesita saber es QUÉ cobro es: «Certificado 3», «Anticipo», «Fondo de reparo».
 *
 * Se mira el concepto (I) y la orden de compra (H) juntos: la categoría suele estar en H
 * («Anticipo inicio obra Pisos Industriales») cuando I sólo tiene el nombre de la obra.
 *
 * @returns {{tipo: 'anticipo'|'certificado'|'fondo_reparo'|'otro', rotulo: string}}
 */
export function clasificar(concepto, ordenCompra) {
  const limpioC = sinCategoriaContable(concepto)
  const limpioH = sinCategoriaContable(ordenCompra)
  const texto = `${limpioC} ${limpioH}`
  const cert = texto.match(CERTIFICACION) || texto.match(CERTIFICADO)
  if (cert) return { tipo: 'certificado', rotulo: `Certificado ${Number(cert[1])}` }
  if (/fondo\s+de\s+reparo/i.test(texto)) return { tipo: 'fondo_reparo', rotulo: 'Fondo de reparo' }
  if (/\banticipos?\b/i.test(texto)) return { tipo: 'anticipo', rotulo: 'Anticipo' }
  if (/\badicional\b/i.test(texto)) return { tipo: 'otro', rotulo: 'Adicional' }
  // Sin categoría reconocible manda el concepto, que es lo único que describe el trabajo. Se acota:
  // un rótulo de 200 caracteres no es un rótulo, es una nota.
  const crudo = limpioC || limpioH
  if (!crudo) return { tipo: 'otro', rotulo: 'Cobro' }
  return { tipo: 'otro', rotulo: crudo.length > 80 ? `${crudo.slice(0, 79).trimEnd()}…` : crudo }
}

/**
 * NÚCLEO PURO: los dólares de una fila cuyo neto se calcula CONTRA el tipo de cambio.
 *
 * `=3500*TIPO_CAMBIO_USD` no es un importe en pesos: es U$S 3.500 mostrados en pesos de hoy. El
 * contrato de Quattropani es en dólares por ajuste alzado —inmune a variaciones cambiarias—, así que
 * publicar el peso de hoy es publicar un número que mañana está mal.
 *
 * NO SE INVENTA UN TIPO DE CAMBIO: el de la fila sale de la propia fila (neto ÷ dólares de la
 * fórmula) y con ÉL se convierte el TOTAL a cobrar. El valor no cambia, cambia la unidad.
 */
export function montoUsdPorTipoDeCambio({ formulaNeto, neto, total }) {
  const m = String(formulaNeto ?? '').match(/^=\s*([\d.,]+)\s*\*\s*TIPO_CAMBIO_USD\s*$/i)
  if (!m) return null
  const usdNeto = monto(m[1])
  if (!usdNeto || !neto || !total) return null
  const tc = neto / usdNeto
  if (!Number.isFinite(tc) || tc <= 0) return null
  return Math.round((total / tc) * 100) / 100
}

/** «… · parte U$S 4.600 = $ 7.130.000 a TC 1.550» → 4600. Lo que la fila declara valer en dólares. */
export function parteDeclaradaUsd(concepto) {
  const m = String(concepto ?? '').match(/\bparte\s+U\$S\s*([\d.,]+)/i)
  return m ? monto(m[1]) : null
}

/** «U$S 20.000 — 63,5 % del anticipo» → 20000. El total que el concepto dice que suman las partes. */
export function totalDeclaradoUsd(concepto) {
  const m = String(concepto ?? '').match(/^\s*U\$S\s*([\d.,]+)/i)
  return m ? monto(m[1]) : null
}

/**
 * NÚCLEO PURO: varias filas del Sheet que son UN SOLO cobro para el cliente.
 *
 * Pasa dos veces: una certificación partida en B y N, y un anticipo cobrado en dos monedas el mismo
 * día. En los dos casos el cliente pagó UNA vez.
 *
 * MONEDAS DISTINTAS NO SE SUMAN A OJO. Sólo se fusionan si cada parte declara cuánto vale en dólares
 * y la suma coincide con el total que el propio concepto declara. Si no cierra, no se publica nada:
 * se devuelve el conflicto para que salga por pantalla. Dos líneas que digan «U$S 20.000» cada una
 * es exactamente el defecto que el cliente vio.
 *
 * @returns {{monto: number|null, moneda: string}|{conflicto: string}}
 */
export function fusionarImportes(partes) {
  const monedas = new Set(partes.map((p) => p.moneda))
  if (monedas.size === 1) {
    const conMonto = partes.filter((p) => p.monto != null)
    // NULL NO ES CERO: si ninguna parte tiene importe, el cobro sigue sin importe.
    return { monto: conMonto.length ? conMonto.reduce((s, p) => s + p.monto, 0) : null, moneda: partes[0].moneda }
  }
  const enDolares = partes.map((p) => parteDeclaradaUsd(p.concepto))
  if (enDolares.some((x) => x == null)) {
    return { conflicto: `${[...monedas].join(' y ')} en el mismo cobro y ninguna fila declara la equivalencia` }
  }
  const suma = Math.round(enDolares.reduce((s, x) => s + x, 0) * 100) / 100
  const declarado = totalDeclaradoUsd(partes[0].concepto)
  if (declarado != null && Math.abs(declarado - suma) > 0.01) {
    return { conflicto: `las partes suman U$S ${suma} pero el concepto declara U$S ${declarado}` }
  }
  return { monto: suma, moneda: 'USD' }
}

/**
 * NÚCLEO PURO: dos líneas de la misma obra con el mismo rótulo se distinguen por su lugar.
 *
 * «Anticipo» y «Anticipo» no le dicen nada al cliente. «Anticipo (1 de 2)» sí, y no inventa nada:
 * el orden sale de la fecha que ya tiene cada línea.
 */
export function numerarRepetidos(lineas) {
  const cuenta = new Map()
  for (const l of lineas) cuenta.set(l.rotulo, (cuenta.get(l.rotulo) ?? 0) + 1)
  const visto = new Map()
  return lineas.map((l) => {
    const n = cuenta.get(l.rotulo)
    if (n < 2) return l
    const i = (visto.get(l.rotulo) ?? 0) + 1
    visto.set(l.rotulo, i)
    return { ...l, rotulo: `${l.rotulo} (${i} de ${n})` }
  })
}

/**
 * NÚCLEO PURO: el rótulo no repite el nombre de la obra.
 *
 * El cliente ya está mirando la obra: una línea que dice «Galpón 9» dentro de la obra «Galpón 9» no
 * le dice qué cobro es. Se saca el nombre SÓLO cuando está al principio o al final pegado a un
 * separador —«Faltante - GALPON 9» → «Faltante»—; en el medio se deja, porque «PLANTA DE BSA - 50%»
 * sin el «BSA» queda mutilado. Si no queda nada, el rótulo neutro es mejor que el nombre repetido.
 */
export function depurarRotulo(rotulo, nombreObra) {
  const r = String(rotulo ?? '').trim()
  const o = String(nombreObra ?? '').trim()
  if (!o) return r || 'Cobro'
  // Se compara SIN TILDES —el Sheet escribe «GALPON 9» donde la obra es «Galpón 9»— pero se corta
  // sobre el texto original: `sinTildes` no cambia la longitud, así que los índices coinciden.
  const rn = sinTildes(r), on = sinTildes(o)
  if (rn === on) return 'Cobro'
  const escapado = on.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const alPrincipio = rn.match(new RegExp(`^${escapado}\\s*[-·—]\\s*`))
  if (alPrincipio) return r.slice(alPrincipio[0].length).trim() || 'Cobro'
  const alFinal = rn.match(new RegExp(`\\s*[-·—]\\s*${escapado}$`))
  if (alFinal) return r.slice(0, rn.length - alFinal[0].length).trim() || 'Cobro'
  return r
}
