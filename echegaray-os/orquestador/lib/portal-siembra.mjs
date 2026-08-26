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
 * Se busca en el concepto y el detalle de la fila alguna de las PALABRAS que declara cada obra del
 * mismo cliente. Gana la coincidencia más larga —«instalacion electrica» antes que «pisos» si las
 * dos calzaran— y ante empate no se elige: se devuelve null y la fila queda sin imputar.
 *
 * @returns {{obra: object, palabra: string}|null}
 */
export function imputarObra(fila, obrasDelCliente) {
  // UN CLIENTE CON UNA SOLA OBRA NO TIENE AMBIGÜEDAD. No es adivinar: es la única posibilidad. Sin
  // esto, un cliente de obra única —Quattropani— se quedaba con el cronograma vacío porque ninguna
  // fila de Cobranzas repite el nombre de la obra que ya es obvia.
  if (obrasDelCliente.length === 1) return { obra: obrasDelCliente[0], palabra: '(única obra del cliente)' }
  const texto = sinTildes(`${fila.concepto ?? ''} ${fila.detalle ?? ''}`)
  let mejor = null
  for (const obra of obrasDelCliente) {
    for (const p of obra.palabras ?? []) {
      const clave = sinTildes(p)
      if (!clave || !texto.includes(clave)) continue
      if (!mejor || clave.length > mejor.palabra.length) mejor = { obra, palabra: clave }
      else if (clave.length === mejor.palabra.length && mejor.obra !== obra) mejor = { ...mejor, empate: true }
    }
  }
  if (!mejor || mejor.empate) return null
  return { obra: mejor.obra, palabra: mejor.palabra }
}

/**
 * NÚCLEO PURO: las palabras con las que una obra se reconoce, sacadas de su propio nombre.
 *
 * «PISOS INDUSTRIALES» → ['pisos industriales', 'pisos']. La palabra entera primero: es la que
 * desempata contra otra obra del mismo cliente que comparta un término.
 */
export function palabrasDeObra(nombre) {
  const limpio = sinTildes(nombre).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
  const partes = limpio.split(' ').filter((w) => w.length > 3 && !['para', 'sobre', 'obra', 'salon'].includes(w))
  return [limpio, ...partes]
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
