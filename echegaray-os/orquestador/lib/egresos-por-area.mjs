// EGRESOS POR ÁREA — clasifica el libro de salidas de dinero (pestaña Compras del Cash Flow)
// contra las 8 áreas canónicas del OS.
//
// POR QUÉ ES UNA CAPACIDAD Y NO UN SCRIPT: el 20/07 hice este mismo análisis con python
// descartable. Un número que sale de un script que se tira no se puede volver a verificar, no lo
// puede correr el dueño desde el chat y no queda igual la próxima vez. Regla del proyecto: si el
// OS lo va a decir, el OS lo tiene que calcular.
//
// CRITERIO (compras-abastecimiento-subcontratacion): el Flujo de Fondos manda el costo por obra;
// ARCA es el respaldo fiscal. Esta capacidad lee el Flujo, no lo suma con ARCA.
//
// CRITERIO (arquitectura-integracion-finanzas-obras): no duplica lógica. La clasificación por área
// usa las mismas claves canónicas que el resto del OS, y la obra se resuelve con resolverObraCon()
// —el MISMO resolvedor del eje canónico que usan la web y el chat— no con un match propio.
// Error real del 20/07: normalicé "LA ESTRELLA" por mi cuenta y no matcheó el alias "estrella"
// (normObra saca los artículos). 260 filas cayeron en "sin clasificar" por eso.

import { resolverObraCon, cargarAliasMap } from './obras.mjs'

/** Las asignaciones que son NÓMINA. El proveedor manda: los sueldos se cargan SIN concepto. */
const NOMINA_PROVEEDOR = new Set(['sueldos', 'sac', 'sindicatos', 'uocra', 'fcl', 'ieric', 'fodeco'])
const NOMINA_CLIENTE = new Set(['f931', 'uocra', 'fcl', 'ieric', 'fodeco'])
const RE_NOMINA_CONCEPTO = /sueldo|jornal|aguinaldo|liquidacion/i
const INDIRECTO = new Set(['administracion', 'taller', 'almacen', 'obras'])
const RE_FLOTA = /\bford\b|\btoyota\b|\bmoto\b|chevrolet|hilux|amarok|patente/i

const norm = (s) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()

/** Importe en formato es-AR ("$ 54.043,44") a número. PURA. Un texto sin dígitos es 0, no NaN. */
export function montoAR(v) {
  if (typeof v === 'number') return v
  const s = String(v ?? '').replace(/[^\d,.-]/g, '')
  if (!s || s === '-') return 0
  // es-AR: coma = decimal, punto = miles. Pero la API también puede devolver el valor crudo con
  // punto decimal. Se decide por la forma, no por suposición: "$1.234.567" son miles (daba 0 antes,
  // porque Number('1.234.567') es NaN) y "54043.44" es decimal.
  let n
  if (/,\d{1,2}$/.test(s)) n = s.replace(/\./g, '').replace(',', '.')            // 54.043,44
  else if (/\.\d{1,2}$/.test(s) && (s.match(/\./g) || []).length === 1) n = s.replace(/,/g, '')  // 54043.44
  else n = s.replace(/[.,]/g, '')                                               // 1.234.567
  const r = Number(n)
  return Number.isFinite(r) ? r : 0
}

/**
 * NÚCLEO PURO: a qué área pertenece una fila de egreso.
 * @param {object} f { proveedor, cliente, unidad, concepto, total }
 * @param {Map} aliasMap mapa alias→obra del eje canónico (public.obra_alias)
 * @returns {{area:string, grupo:string}} grupo = el corte fino dentro del área
 */
export function areaDeEgreso(f = {}, aliasMap = new Map()) {
  const prov = norm(f.proveedor)
  const cli = norm(f.cliente)
  const uni = norm(f.unidad)
  const con = String(f.concepto ?? '')

  if (NOMINA_PROVEEDOR.has(prov) || NOMINA_CLIENTE.has(cli) || RE_NOMINA_CONCEPTO.test(con)) {
    // El corte fino importa: sueldo neto y cargas sociales se deciden distinto.
    if (prov === 'sueldos') return { area: 'personas', grupo: 'Sueldo neto' }
    if (prov === 'sac') return { area: 'personas', grupo: 'SAC / aguinaldo' }
    if (cli === 'f931' || prov === 'arca') return { area: 'personas', grupo: 'F931 — cargas sociales' }
    if (prov === 'sindicatos') return { area: 'personas', grupo: 'Sindicatos' }
    if (prov === 'fcl' || cli === 'fcl') return { area: 'personas', grupo: 'Fondo de cese' }
    return { area: 'personas', grupo: 'Otros de nómina' }
  }
  if (uni === 'impuestos' || prov === 'arca' || cli === 'plan de pago') {
    return { area: 'contabilidad_legales', grupo: 'Impuestos y planes' }
  }
  if (uni === 'financiero' || cli === 'credito prendario' || prov === 'banco') {
    return { area: 'administracion_finanzas', grupo: 'Bancario y financiero' }
  }
  if (RE_FLOTA.test(con)) return { area: 'compras', grupo: 'Flota y equipos' }
  // La obra se resuelve por el EJE, no por comparación de texto propia.
  const o = resolverObraCon(aliasMap, f.cliente)
  if (o.resuelto && o.obra_id) return { area: 'obras', grupo: 'Compra imputada a obra' }
  if (o.resuelto && o.clasificacion === 'indirecto') return { area: 'compras', grupo: 'Estructura / indirecto' }
  if (INDIRECTO.has(cli)) return { area: 'compras', grupo: 'Estructura / indirecto' }
  // Sin monto y sin datos = fila de plantilla, no un egreso. Se cuenta aparte, no como hueco.
  if (!montoAR(f.total) && !cli && !uni) return { area: null, grupo: 'Fila de plantilla' }
  return { area: null, grupo: 'Sin clasificar' }
}

/**
 * NÚCLEO PURO: agrega las filas por área y por grupo.
 * @param {Array} filas [{proveedor,cliente,unidad,concepto,total}]
 */
export function componerEgresos(filas = [], aliasMap = new Map()) {
  const porArea = new Map()
  const porGrupo = new Map()
  let total = 0
  let plantilla = 0
  let sinConcepto = 0
  let sinConceptoMonto = 0

  const porCruce = new Map()
  for (const f of filas) {
    const { area, grupo } = areaDeEgreso(f, aliasMap)
    const m = montoAR(f.total)
    if (grupo === 'Fila de plantilla') { plantilla++; continue }
    total += m
    if (!String(f.concepto ?? '').trim() && m > 0) { sinConcepto++; sinConceptoMonto += m }

    const ka = area ?? '(sin clasificar)'
    const a = porArea.get(ka) ?? { area: ka, filas: 0, monto: 0 }
    a.filas++; a.monto += m; porArea.set(ka, a)

    const g = porGrupo.get(grupo) ?? { grupo, area: ka, filas: 0, monto: 0 }
    g.filas++; g.monto += m; porGrupo.set(grupo, g)

    // CRUCE con la clasificación que ya usa el Sheet (columna "Unidad de Negocio"). Sirve para ver
    // si esa lista y las áreas dicen lo mismo o son dos cortes distintos superpuestos.
    const u = String(f.unidad ?? '').trim() || '(vacío)'
    const kc = `${u}||${ka}`
    const c = porCruce.get(kc) ?? { unidad: u, area: ka, filas: 0, monto: 0 }
    c.filas++; c.monto += m; porCruce.set(kc, c)
  }

  const areas = [...porArea.values()].sort((x, y) => y.monto - x.monto)
  for (const a of areas) a.pct = total ? (100 * a.monto) / total : 0
  const grupos = [...porGrupo.values()].sort((x, y) => y.monto - x.monto)
  for (const g of grupos) g.pct = total ? (100 * g.monto) / total : 0

  return {
    filas_leidas: filas.length,
    filas_egreso: filas.length - plantilla,
    filas_plantilla: plantilla,
    total,
    areas,
    grupos,
    // Huecos de captura: no son un defecto de esta capacidad, son trabajo real del dueño.
    sin_concepto: sinConcepto,
    sin_concepto_monto: sinConceptoMonto,
    cruce_unidad_area: [...porCruce.values()].sort((x, y) => y.monto - x.monto),
  }
}

const $ = (v) => `$${Math.round(Number(v) || 0).toLocaleString('es-AR')}`

/** Texto legible. PURO. */
export function formatEgresos(r, nombreArea = (a) => a) {
  if (!r || r.error) return `No pude analizar los egresos: ${r?.error ?? 'sin datos'}`
  const L = [`EGRESOS POR ÁREA — ${r.filas_egreso} filas · ${$(r.total)}`, '']
  L.push('  ÁREA                            FILAS            TOTAL      %')
  for (const a of r.areas) {
    L.push(
      `  ${String(a.area === '(sin clasificar)' ? a.area : nombreArea(a.area)).padEnd(30)} ` +
        `${String(a.filas).padStart(5)} ${$(a.monto).padStart(16)} ${a.pct.toFixed(1).padStart(6)}%`,
    )
  }
  L.push('')
  L.push('  CORTE FINO (la sub-pestaña que corresponde a cada uno):')
  for (const g of r.grupos) {
    L.push(`  ${g.grupo.padEnd(30)} ${String(g.filas).padStart(5)} ${$(g.monto).padStart(16)} ${g.pct.toFixed(1).padStart(6)}%`)
  }
  L.push('')
  if (r.filas_plantilla) L.push(`  ${r.filas_plantilla} filas de PLANTILLA (fórmulas vivas sin dato): se limpian antes de tocar nada.`)
  if (r.sin_concepto) L.push(`  ${r.sin_concepto} filas SIN concepto por ${$(r.sin_concepto_monto)}: no se sabe qué se compró.`)
  if (r.cruce_unidad_area?.length) {
    L.push('')
    L.push('  CRUCE con "Unidad de Negocio" (la lista que ya usa el Sheet):')
    L.push('  UNIDAD            ÁREA DEL OS                 FILAS            TOTAL')
    for (const c of r.cruce_unidad_area) {
      L.push(`  ${c.unidad.padEnd(17)} ${String(c.area === '(sin clasificar)' ? c.area : nombreArea(c.area)).padEnd(26)} ${String(c.filas).padStart(5)} ${$(c.monto).padStart(16)}`)
    }
  }
  return L.join('\n')
}

/** Lee la pestaña y clasifica. El eje canónico de obras sale de la base, no de una lista a mano. */
export async function egresosPorArea(google, { file_id, pestana = 'Compras', fila_encabezado = 3 } = {}) {
  if (!google?.readSheetValues) return { error: 'no hay una cuenta de Google autorizada' }
  if (!file_id) return { error: 'falta file_id' }

  let aliasMap = new Map()
  try { aliasMap = await cargarAliasMap() }
  catch { /* sin base, la obra cae a "sin clasificar" y se declara como tal */ }

  const valores = await google.readSheetValues(file_id, `${pestana}!A${fila_encabezado}:AB`)
  if (!valores?.length) return { error: `no pude leer ${pestana}` }
  const hdr = valores[0].map((h) => String(h ?? '').trim())
  const col = (re) => hdr.findIndex((h) => re.test(h))
  const iProv = col(/^proveedor$/i)
  const iCli = col(/cliente|asignaci/i)
  const iUni = col(/unidad/i)
  const iCon = col(/^concepto$/i)
  const iTot = col(/^total$/i)
  if (iTot < 0) return { error: `no encontré la columna Total en ${pestana} (fila ${fila_encabezado})` }

  const filas = valores.slice(1)
    .filter((r) => r.some((c) => String(c ?? '').trim()))
    .map((r) => ({
      proveedor: r[iProv], cliente: r[iCli], unidad: r[iUni], concepto: r[iCon], total: r[iTot],
    }))

  return { ...componerEgresos(filas, aliasMap), pestana, file_id }
}
