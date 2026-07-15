// PLAN 1 F1 — LIBRO IVA (ARCA). Respuesta determinística (0 API) que arma el Libro IVA
// Ventas (comprobantes emitidos, tipo_libro='E') y Compras (recibidos, 'R') desde
// public.comprobantes_arca — los comprobantes reales extraídos de ARCA por AfipSDK.
//
// Disciplina de evidencia (regla de oro: nunca fabricar): los totales son DATO (vienen de
// los comprobantes reales de ARCA). La POSICIÓN DE IVA (débito − crédito) es CÁLCULO. No es
// la DDJJ presentada: es lo que surge de los comprobantes cargados; si falta un período o un
// comprobante no se extrajo, el número es parcial y se dice. Fuente de verdad: ARCA.
import { query } from './db.mjs'

const ars = (n) =>
  n == null ? 'sin dato'
    : new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(Number(n))

const MESES = ['', 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const periodoLegible = (p) => {
  const m = /^(\d{4})-(\d{2})$/.exec(String(p || ''))
  return m ? `${MESES[Number(m[2])]} ${m[1]}` : String(p || 'sin período')
}

// "junio", "junio 2026", "06/2026", "2026-06", "junio de 2026" → 'YYYY-MM' (o null).
export function parsePeriodo(texto, anioDefault) {
  const t = String(texto || '').toLowerCase()
  let m = /(\d{4})[-/](\d{1,2})/.exec(t) || /(\d{1,2})[-/](\d{4})/.exec(t)
  if (m) {
    const [a, mes] = m[1].length === 4 ? [m[1], m[2]] : [m[2], m[1]]
    return `${a}-${String(mes).padStart(2, '0')}`
  }
  for (let i = 1; i <= 12; i++) {
    if (new RegExp(`\\b${MESES[i]}\\b`).test(t)) {
      const anio = (/\b(20\d{2})\b/.exec(t)?.[1]) || anioDefault || String(new Date().getFullYear())
      return `${anio}-${String(i).padStart(2, '0')}`
    }
  }
  return null
}

/** Períodos con comprobantes cargados (para elegir el último si no piden uno). */
export async function periodosDisponibles() {
  const { rows } = await query(
    `select periodo, count(*)::int n from public.comprobantes_arca where periodo is not null group by periodo order by periodo desc`,
  )
  return rows
}

async function totales(periodo, tipoLibro) {
  const { rows } = await query(
    `select count(*)::int n,
            coalesce(sum(neto_gravado),0) neto,
            coalesce(sum(neto_no_gravado),0) no_gravado,
            coalesce(sum(exento),0) exento,
            coalesce(sum(total_iva),0) iva,
            coalesce(sum(otros_tributos),0) otros,
            coalesce(sum(imp_total),0) total
       from public.comprobantes_arca
      where periodo = $1 and tipo_libro = $2`,
    [periodo, tipoLibro],
  )
  return rows[0]
}

// Suma de IVA discriminado por alícuota (desde el jsonb iva_por_alicuota) para el detalle.
async function porAlicuota(periodo, tipoLibro) {
  const { rows } = await query(
    `select iva_por_alicuota from public.comprobantes_arca
      where periodo = $1 and tipo_libro = $2 and iva_por_alicuota is not null`,
    [periodo, tipoLibro],
  )
  const acc = {}
  for (const r of rows) {
    const obj = r.iva_por_alicuota || {}
    for (const [alic, v] of Object.entries(obj)) {
      acc[alic] = acc[alic] || { neto: 0, iva: 0 }
      acc[alic].neto += Number(v.neto || 0)
      acc[alic].iva += Number(v.iva || 0)
    }
  }
  return acc
}

const bloqueLibro = (titulo, t, alic) => {
  const lineas = [`**${titulo}** — ${t.n} comprobante(s)`]
  lineas.push(`- Neto gravado: ${ars(t.neto)}`)
  if (Number(t.no_gravado)) lineas.push(`- No gravado: ${ars(t.no_gravado)}`)
  if (Number(t.exento)) lineas.push(`- Exento: ${ars(t.exento)}`)
  lineas.push(`- IVA: ${ars(t.iva)}`)
  if (Number(t.otros)) lineas.push(`- Otros tributos: ${ars(t.otros)}`)
  lineas.push(`- **Total: ${ars(t.total)}**`)
  const alics = Object.entries(alic).sort((a, b) => Number(b[0]) - Number(a[0]))
  if (alics.length > 1 || (alics.length === 1 && alics[0][0] !== '21')) {
    lineas.push(`  _IVA por alícuota: ${alics.map(([a, v]) => `${a}% → ${ars(v.iva)}`).join(' · ')}_`)
  }
  return lineas.join('\n')
}

/**
 * Arma el Libro IVA de un período. tipoLibro: 'E' ventas, 'R' compras, null = ambos + posición.
 * Determinístico (0 API). Devuelve markdown listo para el chat.
 */
export async function libroIvaResumen(periodo = null, tipoLibro = null) {
  let per = periodo
  if (!per) {
    const disp = await periodosDisponibles()
    if (!disp.length) return 'No tengo comprobantes de ARCA cargados todavía. Se cargan extrayéndolos de ARCA (Mis Comprobantes) — decime el período que querés y lo traigo.'
    per = disp[0].periodo
  }
  const quiereVentas = tipoLibro === 'E'
  const quiereCompras = tipoLibro === 'R'
  const ambos = !tipoLibro

  const [ventas, compras, alicV, alicC] = await Promise.all([
    totales(per, 'E'), totales(per, 'R'), porAlicuota(per, 'E'), porAlicuota(per, 'R'),
  ])

  if (ventas.n === 0 && compras.n === 0) {
    const disp = await periodosDisponibles()
    const hay = disp.length ? ` Tengo cargado: ${disp.map((d) => `${periodoLegible(d.periodo)} (${d.n})`).join(', ')}.` : ''
    return `No tengo comprobantes de ARCA para **${periodoLegible(per)}**.${hay}`
  }

  const out = [`## Libro IVA — ${periodoLegible(per)}`]
  if (ambos || quiereVentas) out.push('', bloqueLibro('IVA Ventas (emitidos)', ventas, alicV))
  if (ambos || quiereCompras) out.push('', bloqueLibro('IVA Compras (recibidos)', compras, alicC))

  if (ambos) {
    const debito = Number(ventas.iva)
    const credito = Number(compras.iva)
    const pos = debito - credito
    out.push('', '**Posición de IVA (según comprobantes cargados)**')
    out.push(`- Débito fiscal (IVA ventas): ${ars(debito)}`)
    out.push(`- Crédito fiscal (IVA compras): ${ars(credito)}`)
    if (pos >= 0) out.push(`- **A pagar (aprox.): ${ars(pos)}**`)
    else out.push(`- **Saldo a favor (aprox.): ${ars(-pos)}**`)
    out.push('', '_Cálculo sobre los comprobantes reales extraídos de ARCA. No es la DDJJ presentada: no incluye saldos a favor de períodos previos, retenciones/percepciones ni ajustes. Si falta algún comprobante por extraer, el número es parcial._')
  } else {
    out.push('', '_Datos: comprobantes reales extraídos de ARCA (Mis Comprobantes)._')
  }
  return out.join('\n')
}

/**
 * Cruce HEURÍSTICO (no es un hecho) entre comprobantes de compra de ARCA y los costos ya
 * registrados en el OS. proveedores no tiene CUIT todavía, así que el match es por NOMBRE
 * de proveedor aproximado — sirve para SEÑALAR posibles faltantes, no para afirmarlos.
 */
export async function comprobantesSinRegistrar(periodo) {
  const per = periodo
  const { rows: comps } = await query(
    `select emisor_cuit, emisor_nombre, numero, imp_total
       from public.comprobantes_arca where periodo = $1 and tipo_libro = 'R'
      order by imp_total desc`,
    [per],
  )
  if (!comps.length) return { total: 0, sinMatch: [] }
  // Nombres de proveedores con algún costo registrado (para el match aproximado).
  const { rows: provs } = await query(
    `select distinct p.nombre from public.proveedores p
       join public.costos_reales c on c.proveedor_id = p.id`,
  )
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, ' ').replace(/\b(sa|srl|sas|sh|s a|s r l)\b/g, '').replace(/\s+/g, ' ').trim()
  const provNorms = provs.map((p) => norm(p.nombre)).filter(Boolean)
  const sinMatch = []
  for (const c of comps) {
    const en = norm(c.emisor_nombre)
    const hit = en && provNorms.some((pn) => pn && (pn.includes(en) || en.includes(pn) || pn.split(' ')[0] === en.split(' ')[0]))
    if (!hit) sinMatch.push(c)
  }
  return { total: comps.length, sinMatch }
}
