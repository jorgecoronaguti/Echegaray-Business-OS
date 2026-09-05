// ÍNDICES ECONÓMICOS — busca en internet la inflación proyectada y los aumentos de convenio, los
// guarda con su fuente y los deja listos para que TODA proyección del OS los use.
//
// REGLA DEL DUEÑO (20/07): "en las proyecciones siempre considerar inflación, aumentos, etc.
// (datos que se deben buscar en la web), hacerlo automático y autónomo".
//
// POR QUÉ NO ALCANZA CON UN NÚMERO A MANO: los índices se vencen. Una proyección hecha en julio con
// la inflación de mayo no está desactualizada de a poco — está mal desde el primer mes. Por eso esto
// corre solo y, cuando el dato tiene más de 35 días, lo dice en vez de seguir usándolo callado.
//
// LO QUE NO HACE: no inventa un índice. Si la búsqueda no devuelve números reconocibles, deja lo que
// había y avisa. Preferimos una proyección declaradamente vieja a una inventada.

import { query } from './db.mjs'

/**
 * NÚCLEO PURO: extrae variaciones mensuales de un texto de resultados de búsqueda.
 * Busca patrones tipo "agosto 2026: 1,8%" o "1,8% en agosto".
 * @returns {Array<{periodo:string, variacion:number}>}
 */
export function parsearVariaciones(texto, anio = new Date().getFullYear()) {
  const MESES = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12 }
  const t = String(texto ?? '').toLowerCase()
  const out = new Map()
  const guardar = (mes, pct) => {
    const v = Number(String(pct).replace(',', '.'))
    // Un IPC mensual argentino fuera de 0–15% es casi seguro un error de parseo (un acumulado
    // anual, un porcentaje de otra cosa). Antes que guardar basura, se descarta.
    if (!Number.isFinite(v) || v <= 0 || v > 15) return
    const p = `${anio}-${String(mes).padStart(2, '0')}`
    // Redondeo a 6 decimales: 1,8/100 en coma flotante da 0.018000000000000002 y ese ruido
    // termina en la base y en la planilla.
    if (!out.has(p)) out.set(p, Math.round((v / 100) * 1e6) / 1e6)
  }
  for (const [nombre, n] of Object.entries(MESES)) {
    // "agosto 2026: 1,8%" · "agosto: 1,8%" · "**agosto 2026:** 1.8%"
    let m = new RegExp(`${nombre}[^\\n%]{0,24}?(\\d{1,2}[.,]\\d)\\s*%`).exec(t)
    if (!m) m = new RegExp(`(\\d{1,2}[.,]\\d)\\s*%[^\\n.]{0,30}?${nombre}`).exec(t)
    if (m) guardar(n, m[1])
  }
  return [...out.entries()].map(([periodo, variacion]) => ({ periodo, variacion })).sort((a, b) => a.periodo.localeCompare(b.periodo))
}

const pct = (v) => `${(Number(v) * 100).toFixed(1)}%`

/** Texto legible. PURO. */
export function formatIndices(r) {
  if (!r || r.error) return `No pude actualizar los índices: ${r?.error ?? 'sin datos'}`
  const L = ['ÍNDICES ECONÓMICOS PARA PROYECTAR', '']
  for (const [indice, filas] of Object.entries(r.por_indice ?? {})) {
    L.push(`  ${indice.toUpperCase()}:`)
    for (const f of filas) L.push(`    ${f.periodo}  ${pct(f.variacion).padStart(6)}   acumulado ×${Number(f.factor_acumulado).toFixed(3)}`)
  }
  if (r.nuevos) L.push('', `  ✚ ${r.nuevos} valor(es) nuevo(s) guardado(s) desde la web.`)
  if (r.vencido) L.push('', `  ⚠ El último dato tiene ${r.dias_viejo} días. Conviene refrescarlo antes de decidir con una proyección.`)
  if (r.sin_parsear) L.push('', '  ⚠ La búsqueda no devolvió números reconocibles: quedó lo que ya estaba, no inventé nada.')
  return L.join('\n')
}

/**
 * Busca en la web y actualiza los índices. `buscar` es la función de búsqueda inyectada
 * (webSearch), así se puede testear sin internet.
 */
export async function actualizarIndices(buscar, { anio = new Date().getFullYear(), forzar = false } = {}) {
  // ¿Hace falta buscar? Un índice de hace 3 días no cambia por volver a preguntar, y cada búsqueda
  // cuesta. Se refresca si tiene más de 7 días.
  const { rows: ult } = await query(
    "select max(leido_en) ultimo, count(*)::int n from public.indice_economico where indice='ipc'",
  )
  const dias = ult[0]?.ultimo ? Math.floor((Date.now() - new Date(ult[0].ultimo)) / 86400000) : 999
  let nuevos = 0, sinParsear = false

  if (forzar || dias > 7) {
    // Dos búsquedas: una sola devuelve dos o tres meses sueltos y quedan huecos justo en los meses
    // que más importa proyectar. La segunda pide explícitamente el mes por mes.
    const textos = []
    for (const q of [
      `REM BCRA inflación mensual proyectada Argentina IPC expectativas ${anio}`,
      `inflación mensual esperada Argentina mes por mes agosto septiembre octubre noviembre diciembre ${anio} porcentaje`,
    ]) {
      const r = await buscar(q)
      textos.push(r?.text ?? r?.resultado ?? '')
    }
    const vars = parsearVariaciones(textos.join('\n'), anio)
    if (!vars.length) sinParsear = true
    for (const v of vars) {
      // Sólo se pisan las PROYECCIONES. Un mes ya publicado como dato firme no se toca con una
      // expectativa: sería reemplazar un hecho por un pronóstico.
      const { rowCount } = await query(
        `insert into public.indice_economico (indice, periodo, variacion, tipo, fuente, url, leido_en)
         values ('ipc', $1, $2, 'proyeccion', $3, $4, now())
         on conflict (indice, periodo, tipo) do update set
           variacion = excluded.variacion, fuente = excluded.fuente, leido_en = now()`,
        [v.periodo, v.variacion, 'REM BCRA (relevamiento de expectativas de mercado), vía búsqueda web', 'https://www.bcra.gob.ar/publicaciones/relevamiento-de-expectativas-de-mercado.asp'],
      )
      nuevos += rowCount ?? 0
    }
  }

  const { rows: crudas } = await query(
    "select indice, periodo, tipo, variacion, factor_acumulado, fuente from public.factor_ajuste where periodo >= to_char(now(),'YYYY-MM') order by indice, periodo",
  )
  // ═══ EL FACTOR SALE COMO NÚMERO, NO COMO STRING CON SEIS DECIMALES (05/09/2026) ═══
  //
  // `factor_acumulado` es `numeric` y `pg` lo entrega como string: «1.237788». En formato argentino
  // eso se lee como UN MILLÓN DOSCIENTOS TREINTA Y SIETE MIL. No es una molestia estética: el
  // control de visibilidad —que a propósito no sabe nada del filtro y sólo busca números grandes en
  // la salida de una tool— lo contó como plata que se le estaba filtrando a un jefe de obra, y tenía
  // razón en sospechar. Un factor que se puede leer como un importe es un factor mal serializado.
  //
  // Cuatro decimales son 0,01% de precisión sobre un índice de proyección. Los seis que traía la
  // base son precisión falsa: nadie proyecta con la sexta cifra de un IPC.
  const rows = crudas.map((f) => ({
    ...f,
    variacion: Number(f.variacion),
    factor_acumulado: Number(Number(f.factor_acumulado).toFixed(4)),
  }))
  const por_indice = {}
  for (const f of rows) (por_indice[f.indice] ??= []).push(f)

  return {
    por_indice,
    nuevos,
    sin_parsear: sinParsear,
    // dias===999 es "nunca se buscó", no "vencido hace 999 días": avisar de un vencimiento en la
    // primera corrida es una alarma falsa.
    vencido: dias !== 999 && dias > 35,
    dias_viejo: dias === 999 ? null : dias,
    filas: rows,
  }
}
