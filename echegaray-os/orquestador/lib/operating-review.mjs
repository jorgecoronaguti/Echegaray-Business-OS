// OPERATING REVIEW — el paso que faltaba entre detectar y decidir.
//
// El OS detecta bien: al 20/07 tenía 11 acciones abiertas de sus especialistas sólo en
// Administración y Finanzas, más los pendientes del backlog. Nadie las consumía. Detectar no cobra
// ni paga; la plata se mueve cuando un hallazgo se mira contra lo esperado, se le busca la causa y
// sale una decisión CON responsable y fecha.
//
// Esta capacidad NO analiza por su cuenta ni inventa causas: junta los hallazgos que YA existen,
// les pone la estructura del CLAUDE.md (esperado → real → desvío → causa → impacto → decisión →
// responsable → fecha → resultado posterior) y deja explícito qué falta completar. Lo que no tiene
// evidencia queda en NULL y se ve — un review con la causa inventada es peor que no tenerlo.
//
// Costo: 0 API para abrirlo y listarlo.

/** pg devuelve un Date para columnas `date`; String(Date) da "Wed Jul 01 2026" y no YYYY-MM-DD. PURA. */
export function isoCorta(v) {
  if (!v) return ''
  if (v instanceof Date) {
    const p = (n) => String(n).padStart(2, '0')
    return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`
  }
  return String(v).slice(0, 10)
}

const $ = (v) => `$${Math.round(Number(v) || 0).toLocaleString('es-AR')}`

/** Un punto está resuelto sólo con decisión + responsable + fecha. PURA. */
export function puntoResuelto(p = {}) {
  return Boolean(String(p.decision || '').trim() && String(p.responsable || '').trim() && p.fecha_limite)
}

/** Qué le falta a un punto para poder cerrarse. PURA. */
export function faltaDelPunto(p = {}) {
  const f = []
  if (!String(p.causa || '').trim()) f.push('causa')
  if (!String(p.decision || '').trim()) f.push('decisión')
  if (!String(p.responsable || '').trim()) f.push('responsable')
  if (!p.fecha_limite) f.push('fecha')
  return f
}

/**
 * NÚCLEO PURO: arma la lectura del review a partir de sus puntos.
 * No decide nada: cuenta, cuantifica lo cuantificable y dice qué falta.
 */
export function componerReview(d = {}) {
  const puntos = d.puntos || []
  const abiertos = puntos.filter((p) => p.estado !== 'descartado' && p.estado !== 'cerrado')
  const resueltos = abiertos.filter(puntoResuelto)
  const sinDecidir = abiertos.filter((p) => !puntoResuelto(p))

  // Sólo se suma lo que tiene monto. Los puntos sin monto NO son cero: son no cuantificados, y se
  // declaran aparte para que nadie lea el total como "el impacto completo del período".
  const conMonto = abiertos.filter((p) => Number.isFinite(Number(p.desvio_monto)) && p.desvio_monto !== null)
  const impactoMedido = conMonto.reduce((a, p) => a + Number(p.desvio_monto), 0)

  return {
    area: d.area,
    area_nombre: d.area_nombre,
    periodo: d.periodo,
    total_puntos: puntos.length,
    abiertos: abiertos.length,
    resueltos: resueltos.length,
    sin_decidir: sinDecidir.length,
    impacto_medido: impactoMedido,
    puntos_con_monto: conMonto.length,
    puntos_sin_cuantificar: abiertos.length - conMonto.length,
    detalle: abiertos.map((p) => ({
      titulo: p.titulo,
      origen: p.origen_tabla,
      desvio_monto: p.desvio_monto === null ? null : Number(p.desvio_monto),
      decision: p.decision || null,
      responsable: p.responsable || null,
      fecha_limite: p.fecha_limite || null,
      falta: faltaDelPunto(p),
    })),
  }
}

/** Texto legible del review. PURO. */
export function formatReview(r) {
  if (!r || r.error) return `No pude armar el review: ${r?.error ?? 'sin datos'}`
  const L = [`OPERATING REVIEW — ${String(r.area_nombre || r.area).toUpperCase()}`, `Período: ${r.periodo}`, '']
  L.push(`${r.abiertos} punto(s) abiertos · ${r.resueltos} con decisión · ${r.sin_decidir} SIN decidir`)
  if (r.puntos_con_monto) {
    L.push(`Impacto medido: ${$(r.impacto_medido)} sobre ${r.puntos_con_monto} punto(s).`)
  }
  if (r.puntos_sin_cuantificar) {
    L.push(`${r.puntos_sin_cuantificar} punto(s) sin cuantificar — NO son cero, es plata sin medir.`)
  }
  L.push('')

  const conD = r.detalle.filter((p) => p.decision)
  const sinD = r.detalle.filter((p) => !p.decision)

  if (conD.length) {
    L.push('DECIDIDOS:')
    for (const p of conD) {
      L.push(`  ✓ ${p.titulo}`)
      L.push(`      → ${p.decision} — ${p.responsable ?? 'SIN RESPONSABLE'} — ${p.fecha_limite ?? 'SIN FECHA'}`)
    }
    L.push('')
  }
  if (sinD.length) {
    L.push('PENDIENTES DE DECISIÓN (esto es lo que hay que resolver en la reunión):')
    for (const p of sinD) {
      const m = p.desvio_monto !== null ? ` — ${$(p.desvio_monto)}` : ''
      L.push(`  • ${p.titulo}${m}`)
      L.push(`      falta: ${p.falta.join(', ')}`)
    }
  }
  return L.join('\n').trim()
}

/**
 * Abre un review de un área cargándolo con los hallazgos que YA existen (acciones abiertas del área
 * + pendientes del backlog del área). Idempotente por área+período: si ya hay uno abierto lo
 * devuelve en vez de duplicar hallazgos.
 */
export async function abrirReview({ area, desde, hasta } = {}) {
  const { resolverArea, nombreArea } = await import('./biblioteca-area.mjs')
  const clave = resolverArea(area)
  if (!clave) return { error: `no reconozco el área "${area}".` }

  const { query } = await import('./db.mjs')
  const hoy = new Date()
  const hastaF = hasta || hoy.toISOString().slice(0, 10)
  const desdeF = desde || new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().slice(0, 10)

  const existente = await query(
    `select id from public.operating_reviews
      where area = $1 and estado = 'abierta' and periodo_desde = $2 and periodo_hasta = $3
      limit 1`,
    [clave, desdeF, hastaF],
  )
  let reviewId = existente.rows[0]?.id
  if (!reviewId) {
    const ins = await query(
      `insert into public.operating_reviews (area, periodo_desde, periodo_hasta) values ($1,$2,$3) returning id`,
      [clave, desdeF, hastaF],
    )
    reviewId = ins.rows[0].id
  }

  // Se cargan los hallazgos que ya existen. `on conflict` no aplica (no hay unique), así que se
  // evita el duplicado consultando lo ya cargado: un review que duplica hallazgos hace perder la
  // confianza en el conteo.
  const yaCargados = await query(
    `select origen_tabla, origen_id from public.operating_review_puntos where review_id = $1`,
    [reviewId],
  )
  const clavesYa = new Set(yaCargados.rows.map((r) => `${r.origen_tabla}:${r.origen_id}`))

  const candidatos = []
  const acc = await query(
    `select id::text, titulo, monto from public.acciones
      where area = $1 and estado is distinct from 'cerrada' order by created_at desc`,
    [clave],
  )
  for (const a of acc.rows) candidatos.push({ tabla: 'acciones', id: a.id, titulo: a.titulo, monto: a.monto })

  const bk = await query(
    `select id::text, titulo from public.backlog_autonomo
      where area = $1 and estado = 'abierto' order by created_at desc`,
    [clave],
  )
  for (const b of bk.rows) candidatos.push({ tabla: 'backlog_autonomo', id: b.id, titulo: b.titulo, monto: null })

  let nuevos = 0
  for (const c of candidatos) {
    if (clavesYa.has(`${c.tabla}:${c.id}`)) continue
    await query(
      `insert into public.operating_review_puntos (review_id, origen_tabla, origen_id, titulo, desvio_monto)
       values ($1,$2,$3,$4,$5)`,
      [reviewId, c.tabla, c.id, c.titulo, c.monto ?? null],
    )
    nuevos++
  }

  const r = await leerReview(reviewId)
  return { ...r, review_id: reviewId, puntos_nuevos: nuevos, area_nombre: nombreArea(clave) }
}

/** Lee un review con sus puntos. */
export async function leerReview(reviewId) {
  const { query } = await import('./db.mjs')
  const { nombreArea } = await import('./biblioteca-area.mjs')
  const { rows: rv } = await query(`select * from public.operating_reviews where id = $1`, [reviewId])
  if (!rv[0]) return { error: 'no existe ese review' }
  const { rows: pts } = await query(
    `select * from public.operating_review_puntos where review_id = $1 order by desvio_monto desc nulls last, created_at`,
    [reviewId],
  )
  return componerReview({
    area: rv[0].area,
    area_nombre: nombreArea(rv[0].area),
    periodo: `${isoCorta(rv[0].periodo_desde)} → ${isoCorta(rv[0].periodo_hasta)}`,
    puntos: pts,
  })
}

/** Registra la decisión de un punto. Nivel D (interno): no ejecuta nada afuera. */
export async function decidirPunto({ punto_id, causa, decision, responsable, fecha_limite, impacto } = {}) {
  if (!punto_id) return { error: 'falta punto_id' }
  if (!String(decision || '').trim()) return { error: 'una decisión sin texto no es una decisión' }
  if (!String(responsable || '').trim()) return { error: 'toda decisión necesita un responsable: sin dueño no se ejecuta' }
  const { query } = await import('./db.mjs')
  const { rows } = await query(
    `update public.operating_review_puntos
        set causa = coalesce($2, causa), decision = $3, responsable = $4,
            fecha_limite = $5, impacto = coalesce($6, impacto),
            estado = 'decidido', updated_at = now()
      where id = $1 returning id, titulo`,
    [punto_id, causa ?? null, decision, responsable, fecha_limite ?? null, impacto ?? null],
  )
  if (!rows[0]) return { error: 'no existe ese punto' }
  return { ok: true, punto: rows[0].titulo, resumen_texto: `Decidido: ${rows[0].titulo} → ${responsable}${fecha_limite ? ` (${fecha_limite})` : ''}.` }
}
