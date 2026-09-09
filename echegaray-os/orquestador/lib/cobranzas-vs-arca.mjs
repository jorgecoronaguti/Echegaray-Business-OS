// COBRANZAS «B» CONTRA ARCA — «lo que aparece en AfipSDK tiene que ser como lo facturado en B».
//
// POR QUÉ (09/09/2026). El dueño: *«tenés que revisar bien las fechas de factura con B que aparecen
// en Cobranzas, para lo que pasó y para lo futuro»*. Medido ese día sobre las 63 filas B: siete
// facturas de ARCOR de enero–marzo figuran con fecha de abril–mayo; trece filas cobradas no tienen
// número de comprobante aunque su factura existe en ARCA; seis facturas de ARCA no están en ninguna
// fila. Nada de eso da un error en la planilla: da un IVA en el mes equivocado.
//
// Esto NO corrige Cobranzas (no se edita) ni escribe una celda: produce la lista para el log de la
// corrida, que es donde se mira cuando el débito de un mes no cierra. Núcleo puro; el generador le
// pasa las filas crudas de `Cobranzas!A5:Q` y de `_ARCA_RAW!A4:L`.

const serialAPeriodo = (s) => {
  const d = new Date(Date.UTC(1899, 11, 30) + Number(s) * 86400000)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}
const serialADMY = (s) => {
  if (!Number.isFinite(Number(s)) || !s) return '—'
  const d = new Date(Date.UTC(1899, 11, 30) + Number(s) * 86400000)
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}
/** «01-00000228», «00001-00000221», «1-228» → «1-228». Null si la celda no trae un número. */
export const claveDeComprobante = (texto) => {
  const m = /(\d+)\s*-\s*(\d+)/.exec(String(texto ?? ''))
  return m ? `${Number(m[1])}-${Number(m[2])}` : null
}

/**
 * NÚCLEO PURO. `cobranzas` = filas de `Cobranzas!A5:Q` (índices: 1 categoría · 4 comprobante ·
 * 6 cliente · 9 neto · 15 fecha de factura · 16 fecha de cobro), `arca` = filas de `_ARCA_RAW!A4:L`
 * (0 período · 1 libro · 2 fecha · 6 punto de venta · 7 número · 9 razón social · 10 neto · 11 IVA).
 */
export function conciliarCobranzasConArca(cobranzas = [], arca = [], { hoy, primeraFila = 5 } = {}) {
  const enCurso = String(hoy ?? '').slice(0, 7)
  const ventas = new Map()
  for (const r of arca) if (r?.[1] === 'Ventas') ventas.set(`${Number(r[6])}-${Number(r[7])}`, { fecha: r[2], periodo: r[0], neto: Number(r[10]) || 0, iva: Number(r[11]) || 0, razon: String(r[9] ?? '') })
  const B = cobranzas.map((r, i) => ({ fila: primeraFila + i, r })).filter(({ r }) => String(r?.[1] ?? '').trim().toUpperCase() === 'B')
  const out = { noEstaEnArca: [], fechaEnOtroMes: [], sinNumeroPeroEmitida: [], vencidasSinEmitir: [], arcaSinFila: [] }
  const vistas = new Set()
  for (const { fila, r } of B) {
    const k = claveDeComprobante(r[4])
    const cliente = String(r[6] ?? '').trim()
    const neto = Number(r[9]) || 0
    if (k) {
      vistas.add(k)
      const a = ventas.get(k)
      if (!a) { out.noEstaEnArca.push({ fila, cliente, comprobante: k, fecha: serialADMY(r[15]), neto }); continue }
      if (Number.isFinite(Number(r[15])) && r[15] && serialAPeriodo(r[15]) !== a.periodo) {
        out.fechaEnOtroMes.push({ fila, cliente, comprobante: k, enCobranzas: serialADMY(r[15]), enArca: serialADMY(a.fecha), periodoArca: a.periodo })
      }
      continue
    }
    if (Number.isFinite(Number(r[15])) && r[15] && serialAPeriodo(r[15]) < enCurso) {
      out.vencidasSinEmitir.push({ fila, cliente, fecha: serialADMY(r[15]), cobro: serialADMY(r[16]), neto })
    }
  }
  // Facturas de ARCA que ninguna fila referencia por número: se les busca una fila B sin número del
  // mismo importe (o cuya suma por cliente lo dé), para que el dueño sepa qué número cargar dónde.
  for (const [k, a] of ventas) {
    if (vistas.has(k)) continue
    const candidatas = B.filter(({ r }) => !claveDeComprobante(r[4]) && Math.abs((Number(r[9]) || 0) - a.neto) < 2).map((x) => x.fila)
    out.arcaSinFila.push({ comprobante: k, fecha: serialADMY(a.fecha), razon: a.razon, neto: a.neto, iva: a.iva, filasCandidatas: candidatas })
    for (const f of candidatas) out.sinNumeroPeroEmitida.push({ fila: f, comprobante: k })
  }
  return out
}

/** Las líneas del log. Vacío si no hay nada que decir. */
export function informarConciliacion(c) {
  const f = (n) => Math.round(n).toLocaleString('es-AR')
  const L = []
  const total = c.noEstaEnArca.length + c.fechaEnOtroMes.length + c.arcaSinFila.length + c.vencidasSinEmitir.length
  if (!total) return L
  L.push(`  ══ COBRANZAS «B» CONTRA ARCA — ${total} diferencia(s) ══`)
  for (const x of c.noEstaEnArca) L.push(`   fila ${x.fila} ${x.cliente}: comprobante ${x.comprobante} (${x.fecha}, $${f(x.neto)}) NO está en ARCA`)
  for (const x of c.fechaEnOtroMes) L.push(`   fila ${x.fila} ${x.cliente}: ${x.comprobante} dice ${x.enCobranzas} en Cobranzas y ${x.enArca} en ARCA — el IVA va al mes de ARCA (${x.periodoArca})`)
  for (const x of c.arcaSinFila) L.push(`   ARCA ${x.comprobante} (${x.fecha}, $${f(x.neto)} + IVA $${f(x.iva)}) sin número en ninguna fila B${x.filasCandidatas.length ? ` — por importe parece la fila ${x.filasCandidatas.join('/')}` : ''}`)
  for (const x of c.vencidasSinEmitir) L.push(`   fila ${x.fila} ${x.cliente}: B sin comprobante con fecha de factura ${x.fecha} vencida — se proyecta por su cobro (${x.cobro})`)
  return L
}
