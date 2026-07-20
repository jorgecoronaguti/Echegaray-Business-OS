// CARGAS SOCIALES — lee las DDJJ F931 reales del data room y las discrimina por concepto.
//
// POR QUÉ: hasta hoy el OS sólo veía el PAGO de F931 en la pestaña Compras — un número global por
// mes ("F931 Junio $9.000.000") sin saber qué lo compone. La declaración jurada sí lo discrimina, y
// está archivada en Drive (administracion/…/931/<año>/YYYY-MM F.931.pdf).
//
// HALLAZGO QUE CAMBIA UNA ALERTA (20/07): el ART **se paga adentro del F931**, código 312 (L.R.T.).
// Como en Compras no hay ninguna fila "ART", el OS venía reportando "ART en cero — o no se está
// pagando", que es una alarma FALSA y de las caras: habría mandado a buscar un problema inexistente.
// La DDJJ lo demuestra: junio 2026, L.R.T. $2.750.458,70 sobre 22 CUILes con ART.
//
// CRITERIO (contabilidad-constructoras): esto es el DEVENGADO — lo que corresponde al período según
// la declaración. El pago de ese F931 cae en el mes siguiente. Nunca comparar un mes de declaración
// contra el mismo mes de pago sin declarar el desfase.

/** Un número es-AR de la DDJJ ("4.408.245,79") a Number. PURA. */
export function numeroDDJJ(s) {
  const t = String(s ?? '').trim().replace(/\./g, '').replace(',', '.')
  const n = Number(t)
  return Number.isFinite(n) ? n : 0
}

// Los códigos del bloque "MONTOS QUE SE INGRESAN". Son los que efectivamente se pagan.
export const CONCEPTOS_F931 = [
  { codigo: '301', clave: 'aportes_ss', nombre: 'Aportes de Seguridad Social' },
  { codigo: '302', clave: 'aportes_os', nombre: 'Aportes de Obra Social' },
  { codigo: '351', clave: 'contrib_ss', nombre: 'Contribuciones de Seguridad Social' },
  { codigo: '352', clave: 'contrib_os', nombre: 'Contribuciones de Obra Social' },
  { codigo: '312', clave: 'lrt', nombre: 'L.R.T. — ART' },
  { codigo: '028', clave: 'scvo', nombre: 'Seguro Colectivo de Vida Obligatorio' },
  { codigo: '360', clave: 'renatre', nombre: 'Contribuciones RENATRE' },
  { codigo: '935', clave: 'sepelio', nombre: 'Seguro Sepelio UATRE' },
]

/**
 * NÚCLEO PURO: extrae los conceptos de una DDJJ F931 desde el texto del PDF.
 * Devuelve null si el texto no parece un F931 — no se inventa una declaración.
 */
export function parseF931(texto) {
  const t = String(texto ?? '')
  if (!/931/.test(t) || !/MONTOS QUE SE INGRESAN/i.test(t)) return null

  // "Mes - Año … 06/2026" — el período que DECLARA, no el de pago.
  const per = /(\d{2})\/(\d{4})/.exec(t.slice(t.indexOf('Mes - Año')))
  const periodo = per ? `${per[2]}-${per[1]}` : null

  const num = (re) => {
    const m = re.exec(t)
    return m ? numeroDDJJ(m[1]) : 0
  }
  const conceptos = {}
  for (const c of CONCEPTOS_F931) {
    // "301 - Aportes de Seguridad Social \t 2.682.844,79"
    conceptos[c.clave] = num(new RegExp(`${c.codigo}\\s*-\\s*[^\\d]{0,60}?([\\d.]+,\\d{2})`))
  }
  const total = Object.values(conceptos).reduce((a, b) => a + b, 0)

  return {
    periodo,
    empleados: Number((/Empleados en n[oó]mina:\s*(\d+)/i.exec(t) || [])[1] ?? 0) || null,
    remuneracion: num(/Suma de Rem\.\s*1:\s*([\d.]+,\d{2})/),
    cuiles_con_art: Number((/Cantidad de CUILES con ART\s*(\d+)/i.exec(t) || [])[1] ?? 0) || null,
    conceptos,
    total,
  }
}

const $ = (v) => `$${Math.round(Number(v) || 0).toLocaleString('es-AR')}`

/** Texto legible de las DDJJ leídas. PURO. */
export function formatCargas(r) {
  if (!r || r.error) return `No pude leer las DDJJ: ${r?.error ?? 'sin datos'}`
  if (!r.meses?.length) return 'No encontré ninguna DDJJ F931 en esa carpeta.'
  const L = [`CARGAS SOCIALES DECLARADAS (F931) — ${r.meses.length} mes(es)`, '']
  L.push('  PERÍODO   EMPLEADOS   REMUNERACIÓN        APORTES   CONTRIBUC.          ART        TOTAL')
  for (const m of r.meses) {
    const c = m.conceptos
    L.push(
      `  ${String(m.periodo).padEnd(9)} ${String(m.empleados ?? '-').padStart(9)} ` +
        `${$(m.remuneracion).padStart(14)} ${$(c.aportes_ss + c.aportes_os).padStart(14)} ` +
        `${$(c.contrib_ss + c.contrib_os).padStart(12)} ${$(c.lrt).padStart(12)} ${$(m.total).padStart(12)}`,
    )
  }
  const tot = r.meses.reduce((a, m) => a + m.total, 0)
  const art = r.meses.reduce((a, m) => a + m.conceptos.lrt, 0)
  L.push('')
  L.push(`  TOTAL DECLARADO: ${$(tot)} · de eso, ART (L.R.T.): ${$(art)}`)
  L.push('  El ART se paga DENTRO del F931 (código 312): no hay que buscarlo como un pago aparte.')
  if (r.faltantes?.length) L.push(`  ⚠ Sin DDJJ en la carpeta: ${r.faltantes.join(', ')}.`)
  return L.join('\n')
}

/** Lee las DDJJ F931 de un año desde la carpeta del data room. */
export async function cargasSocialesDeclaradas(google, { folder_id, anio } = {}) {
  if (!google?.listFolder && !google?.driveList) return { error: 'no hay una cuenta de Google autorizada' }
  if (!folder_id) return { error: 'falta folder_id (la carpeta con las subcarpetas por año)' }
  const listar = google.listFolder ?? google.driveList

  const anios = await listar(folder_id)
  const y = String(anio ?? new Date().getFullYear())
  const carpetaAnio = (anios || []).find((f) => String(f.name) === y)
  if (!carpetaAnio) return { error: `no encontré la carpeta del año ${y}` }

  const subs = await listar(carpetaAnio.id)
  const c931 = (subs || []).find((f) => /^931$/.test(String(f.name)))
  if (!c931) return { error: `no encontré la subcarpeta 931 dentro de ${y}` }

  const archivos = (await listar(c931.id)) || []
  const ddjj = archivos.filter((f) => /F\.?931/i.test(String(f.name)) && /pdf$/i.test(String(f.name)))

  const meses = []
  for (const a of ddjj) {
    try {
      const leido = await google.readPdfText(a.id)
      const p = parseF931(typeof leido === 'string' ? leido : (leido?.text ?? leido?.texto))
      if (p) meses.push({ ...p, archivo: a.name })
    } catch { /* un PDF ilegible se declara abajo, no se inventa */ }
  }
  meses.sort((a, b) => String(a.periodo).localeCompare(String(b.periodo)))
  const leidos = new Set(meses.map((m) => m.periodo))
  const faltantes = []
  for (let m = 1; m <= 12; m++) {
    const p = `${y}-${String(m).padStart(2, '0')}`
    if (!leidos.has(p) && new Date(`${p}-01`) < new Date()) faltantes.push(p)
  }
  return { anio: y, meses, faltantes, archivos_ddjj: ddjj.length }
}
