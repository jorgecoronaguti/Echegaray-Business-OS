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

import { exigirColumnas } from './cobranzas-columnas.mjs'

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
 * NÚCLEO PURO. `cobranzas` = filas de Cobranzas desde la fila 5, leídas desde la A; cada dato por su
 * RÓTULO con `cols` (categoría · comprobante · cliente · neto · fecha de factura · fecha de cobro —
 * eran los índices 1/4/6/9/15/16, que con «Obra» en H apuntaban a la columna de al lado).
 * `arca` = filas de `_ARCA_RAW!A4:L` (0 período · 1 libro · 2 fecha · 6 punto de venta · 7 número ·
 * 9 razón social · 10 neto · 11 IVA): esa réplica la escribe el OS y no recibe la columna nueva.
 */
export function conciliarCobranzasConArca(cobranzas = [], arca = [], { hoy, primeraFila = 5, cols } = {}) {
  const c = exigirColumnas(cols, ['categoria', 'comprobante', 'cliente', 'neto', 'fechaFactura', 'fechaCobro'], 'conciliarCobranzasConArca')
  const en = (fila, k) => fila?.[c[k].indice]
  const enCurso = String(hoy ?? '').slice(0, 7)
  const ventas = new Map()
  for (const a of arca) if (a?.[1] === 'Ventas') ventas.set(`${Number(a[6])}-${Number(a[7])}`, { fecha: a[2], periodo: a[0], neto: Number(a[10]) || 0, iva: Number(a[11]) || 0, razon: String(a[9] ?? '') })
  const B = cobranzas.map((r, i) => ({ fila: primeraFila + i, r })).filter(({ r }) => String(en(r, 'categoria') ?? '').trim().toUpperCase() === 'B')
  const out = { noEstaEnArca: [], fechaEnOtroMes: [], sinNumeroPeroEmitida: [], vencidasSinEmitir: [], arcaSinFila: [] }
  const vistas = new Set()
  for (const { fila, r } of B) {
    const k = claveDeComprobante(en(r, 'comprobante'))
    const cliente = String(en(r, 'cliente') ?? '').trim()
    const neto = Number(en(r, 'neto')) || 0
    const factura = en(r, 'fechaFactura')
    if (k) {
      vistas.add(k)
      const a = ventas.get(k)
      if (!a) { out.noEstaEnArca.push({ fila, cliente, comprobante: k, fecha: serialADMY(factura), neto }); continue }
      if (Number.isFinite(Number(factura)) && factura && serialAPeriodo(factura) !== a.periodo) {
        out.fechaEnOtroMes.push({ fila, cliente, comprobante: k, enCobranzas: serialADMY(factura), enArca: serialADMY(a.fecha), periodoArca: a.periodo })
      }
      continue
    }
    if (Number.isFinite(Number(factura)) && factura && serialAPeriodo(factura) < enCurso) {
      out.vencidasSinEmitir.push({ fila, cliente, fecha: serialADMY(factura), cobro: serialADMY(en(r, 'fechaCobro')), neto })
    }
  }
  // Facturas de ARCA que ninguna fila referencia por número: se les busca una fila B sin número del
  // mismo importe (o cuya suma por cliente lo dé), para que el dueño sepa qué número cargar dónde.
  for (const [k, a] of ventas) {
    if (vistas.has(k)) continue
    const candidatas = B.filter(({ r }) => !claveDeComprobante(en(r, 'comprobante')) && Math.abs((Number(en(r, 'neto')) || 0) - a.neto) < 2).map((x) => x.fila)
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
