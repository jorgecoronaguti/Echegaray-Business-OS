// PLAN 1 F1 — LIBRO IVA (ARCA). Respuesta determinística (0 API) que arma el Libro IVA
// Ventas (comprobantes emitidos, tipo_libro='E') y Compras (recibidos, 'R') desde
// public.comprobantes_arca — los comprobantes reales extraídos de ARCA por AfipSDK.
//
// Disciplina de evidencia (regla de oro: nunca fabricar): los totales son DATO (vienen de
// los comprobantes reales de ARCA). La POSICIÓN DE IVA (débito − crédito) es CÁLCULO. No es
// la DDJJ presentada: es lo que surge de los comprobantes cargados; si falta un período o un
// comprobante no se extrajo, el número es parcial y se dice. Fuente de verdad: ARCA.
//
// 21/07 — LAS NOTAS DE CRÉDITO RESTAN. Esto sumaba `total_iva` de todos los comprobantes sin mirar
// `tipo_comprobante`, así que las 13 notas de crédito de compra del libro inflaban el CRÉDITO
// FISCAL y el OS declaraba menos IVA del que hay que pagar: $7.231.456 en siete meses, con mayo
// dando vuelta de $4.017.601 a favor a $2.610.762 a pagar. El signo vive en un solo lugar,
// lib/comprobante-arca.mjs, y de ahí sale tanto el SQL de acá como el JS del resto del OS.
import { query } from './db.mjs'
import { sqlConSigno, sqlEsNotaDeCredito, signo } from './comprobante-arca.mjs'

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
    // Cada importe con su signo: una nota de crédito resta en TODAS las columnas, no sólo en el
    // total. Un neto gravado inflado también miente, aunque el que duele sea el IVA.
    `select count(*)::int n,
            coalesce(${sqlConSigno('neto_gravado')},0) neto,
            coalesce(${sqlConSigno('neto_no_gravado')},0) no_gravado,
            coalesce(${sqlConSigno('exento')},0) exento,
            coalesce(${sqlConSigno('total_iva')},0) iva,
            coalesce(${sqlConSigno('otros_tributos')},0) otros,
            coalesce(${sqlConSigno('imp_total')},0) total,
            count(*) filter (where ${sqlEsNotaDeCredito()})::int notas_credito
       from public.comprobantes_arca
      where periodo = $1 and tipo_libro = $2`,
    [periodo, tipoLibro],
  )
  return rows[0]
}

// Suma de IVA discriminado por alícuota (desde el jsonb iva_por_alicuota) para el detalle.
// Con SIGNO, igual que los totales: si el desglose por alícuota no restara las notas de crédito,
// el detalle no cerraría contra su propio total y no habría forma de saber cuál de los dos miente.
async function porAlicuota(periodo, tipoLibro) {
  const { rows } = await query(
    `select tipo_comprobante, iva_por_alicuota from public.comprobantes_arca
      where periodo = $1 and tipo_libro = $2 and iva_por_alicuota is not null`,
    [periodo, tipoLibro],
  )
  const acc = {}
  for (const r of rows) {
    const s = signo(r.tipo_comprobante)
    if (s === null) continue // tipo desconocido: se aparta, no se adivina el signo
    const obj = r.iva_por_alicuota || {}
    for (const [alic, v] of Object.entries(obj)) {
      acc[alic] = acc[alic] || { neto: 0, iva: 0 }
      acc[alic].neto += s * Number(v.neto || 0)
      acc[alic].iva += s * Number(v.iva || 0)
    }
  }
  return acc
}

const bloqueLibro = (titulo, t, alic) => {
  // Se declara cuántas notas de crédito hay adentro. Sin esto, el día que un total baja porque
  // entró una nota de crédito, parece un error de extracción y alguien "lo arregla" sumándolas
  // de nuevo. Un número que cambió tiene que poder explicar por qué.
  const nc = Number(t.notas_credito) || 0
  const lineas = [`**${titulo}** — ${t.n} comprobante(s)${nc ? `, de los cuales ${nc} son notas de crédito (restan)` : ''}`]
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
 * Posición de IVA ESTRUCTURADA mes por mes de un año — para COMPONER tablas/reportes (no texto).
 * Devuelve los 12 meses: los que tienen comprobantes cargados con números REALES (débito/crédito/
 * posición), y los que no, marcados `disponible:false`. NUNCA fabrica un mes sin datos. Es el
 * insumo para que el agente arme una planilla de IVA del año con los superpoderes de Sheets.
 */
export async function posicionIvaAnio(anio) {
  const y = String(anio || new Date().getFullYear()).slice(0, 4)
  const disp = new Set((await periodosDisponibles()).map((d) => d.periodo))
  const meses = []
  for (let mm = 1; mm <= 12; mm++) {
    const periodo = `${y}-${String(mm).padStart(2, '0')}`
    if (!disp.has(periodo)) { meses.push({ periodo, mes: periodoLegible(periodo), disponible: false }); continue }
    const [v, c] = await Promise.all([totales(periodo, 'E'), totales(periodo, 'R')])
    const debito = Number(v.iva), credito = Number(c.iva)
    const pos = debito - credito
    meses.push({
      periodo, mes: periodoLegible(periodo), disponible: true,
      n_ventas: v.n, n_compras: c.n,
      debito_fiscal: debito, credito_fiscal: credito,
      posicion: pos, a_pagar: pos >= 0 ? pos : 0, a_favor: pos < 0 ? -pos : 0,
    })
  }
  const conDatos = meses.filter((m) => m.disponible)
  return {
    anio: y,
    meses,
    meses_con_datos: conDatos.map((m) => m.periodo),
    meses_sin_datos: meses.filter((m) => !m.disponible).map((m) => m.periodo),
    nota: conDatos.length < 12
      ? 'Faltan meses: no hay comprobantes cargados de ARCA para ellos (la descarga de ARCA está bloqueada por el certificado sin autorizar). NO inventes esos meses: en la tabla dejalos como "sin datos" y avisá que falta cargarlos.'
      : 'Año completo con datos reales.',
  }
}

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, ' ').replace(/\b(sa|srl|sas|sh|s a|s r l)\b/g, '').replace(/\s+/g, ' ').trim()
const soloDigitos = (s) => String(s || '').replace(/\D/g, '')
const nombreMatch = (en, pn) => Boolean(en && pn && (pn.includes(en) || en.includes(pn) || pn.split(' ')[0] === en.split(' ')[0]))

/**
 * Cruce entre comprobantes de compra de ARCA y los costos ya registrados en el OS.
 * Prefiere el CUIT (HECHO) cuando el proveedor lo tiene cargado; si no, cae a NOMBRE
 * aproximado (heurística — señala, no afirma). Devuelve los comprobantes sin match.
 */
export async function comprobantesSinRegistrar(periodo) {
  const { rows: comps } = await query(
    `select emisor_cuit, emisor_nombre, numero, imp_total
       from public.comprobantes_arca where periodo = $1 and tipo_libro = 'R'
      order by imp_total desc`,
    [periodo],
  )
  if (!comps.length) return { total: 0, sinMatch: [] }
  // Proveedores con algún costo registrado, con su CUIT (si lo tienen cargado) y nombre.
  const { rows: provs } = await query(
    `select distinct p.nombre, p.cuit from public.proveedores p
       join public.costos_reales c on c.proveedor_id = p.id`,
  )
  const cuitsConCosto = new Set(provs.map((p) => soloDigitos(p.cuit)).filter(Boolean))
  const provNorms = provs.map((p) => norm(p.nombre)).filter(Boolean)
  const sinMatch = []
  for (const c of comps) {
    const cuit = soloDigitos(c.emisor_cuit)
    if (cuit && cuitsConCosto.has(cuit)) continue // match por CUIT (hecho)
    const en = norm(c.emisor_nombre)
    if (provNorms.some((pn) => nombreMatch(en, pn))) continue // match por nombre (heurística)
    sinMatch.push(c)
  }
  return { total: comps.length, sinMatch }
}

/**
 * Concilia los EMISORES de ARCA (compras) contra la tabla de proveedores del OS.
 * Determinístico (0 API). PROPONE, no escribe: separa emisores que matchean un proveedor
 * existente (candidatos a completar el CUIT) de los que no existen (candidatos a alta).
 * El nombre nunca es prueba suficiente para asignar un CUIT solo: por eso propone y no aplica.
 */
export async function conciliarProveedoresArca() {
  const { rows: emis } = await query(
    `select emisor_cuit, max(emisor_nombre) nombre, count(*)::int n, sum(imp_total) tot
       from public.comprobantes_arca where tipo_libro = 'R' and emisor_cuit is not null
      group by emisor_cuit order by sum(imp_total) desc`,
  )
  const { rows: provs } = await query(`select id, nombre, cuit from public.proveedores`)
  const provNorms = provs.map((p) => ({ ...p, n: norm(p.nombre), c: soloDigitos(p.cuit) }))
  const conCuit = [], candidatosCuit = [], candidatosAlta = []
  for (const e of emis) {
    const cuit = soloDigitos(e.emisor_cuit)
    const porCuit = cuit && provNorms.find((p) => p.c && p.c === cuit)
    if (porCuit) { conCuit.push({ ...e, proveedor: porCuit.nombre }); continue }
    const en = norm(e.nombre)
    const porNombre = provNorms.find((p) => nombreMatch(en, p.n))
    if (porNombre) candidatosCuit.push({ ...e, proveedor: porNombre.nombre, proveedor_id: porNombre.id })
    else candidatosAlta.push(e)
  }
  return { emisores: emis.length, conCuit, candidatosCuit, candidatosAlta }
}
