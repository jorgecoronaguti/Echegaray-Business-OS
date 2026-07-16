// PRP-017 F4 — AVANCE FÍSICO por obra, leído del archivo REAL que usa la empresa
// ("Avances de Obra", una hoja por obra, tracker estilo MS-Project con Activity/Status/
// % Done). Honesto con la realidad del dato: las hojas son HETEROGÉNEAS — las nuevas
// (San Francisco, Messina, LE-*) tienen % Done por actividad; la vieja (Estrella) es un
// checklist sin estado. Donde hay % ⇒ avance calculado; donde no ⇒ DESCONOCIDO, no se
// inventa. Lee vía el Service Account (0 costo de API del modelo). No escribe nada.
import { makeGoogleClient } from './google.mjs'
import { loadConfig } from './config.mjs'

// El archivo lo pasó el dueño (2026-07-15) como la fuente que usa la empresa.
export const AVANCE_FILE_ID = '1XHiqSC1wiMVrXAob8H_koN5vHr9BQLLvXn61yIW18Ug'

const norm = (s) => String(s ?? '').trim()
/** Parsea un valor de "% Done": "100%"→100, "0,5"→50 (fracción), "80"→80. null si vacío. */
function parsePct(v) {
  const s = norm(v).replace('%', '').replace(',', '.').trim()
  if (!s) return null
  const n = Number(s)
  if (!Number.isFinite(n)) return null
  return n <= 1 && s.includes('.') ? n * 100 : n // fracción 0-1 → %, si no ya es %
}

/** Encuentra la fila de encabezado y mapea columnas por nombre. null si no hay tracker. */
function ubicarColumnas(rows) {
  for (let i = 0; i < Math.min(rows.length, 12); i++) {
    const r = rows[i] || []
    const find = (re) => r.findIndex((c) => re.test(norm(c)))
    const pct = find(/%\s*done|avance|%\s*compl/i)
    const act = find(/activity|actividad|tarea|rubro|item/i)
    if (pct >= 0 && act >= 0) {
      return { header: i, act, pct, status: find(/status|estado/i), num: find(/^#$|n[°º]|nro|item/i) }
    }
  }
  return null
}

/** Avance físico de UNA hoja/obra. Devuelve resumen o {estructurado:false} si no hay %. */
export async function avanceHoja(g, tab) {
  const rows = await g.readSheetValues(AVANCE_FILE_ID, `${tab}!A1:N250`).catch(() => [])
  const cols = ubicarColumnas(Array.isArray(rows) ? rows : [])
  if (!cols) return { tab, estructurado: false, motivo: 'la hoja no tiene columna de % avance (checklist sin estado)' }
  let n = 0, suma = 0, completadas = 0
  const detalle = []
  for (let i = cols.header + 1; i < rows.length; i++) {
    const r = rows[i] || []
    const actividad = norm(r[cols.act])
    // Actividad real: tiene nombre Y un # (código tipo "1,02"); descarta divisores de sección.
    const tieneNum = cols.num >= 0 && /\d/.test(norm(r[cols.num]))
    if (!actividad || !tieneNum) continue
    const p = parsePct(r[cols.pct])
    if (p == null) continue
    n++; suma += p; if (p >= 99.5 || /complet|termin|finaliz/i.test(norm(r[cols.status]))) completadas++
    detalle.push({ codigo: norm(r[cols.num]) || null, actividad, pct: Math.round(p), estado: cols.status >= 0 ? norm(r[cols.status]) || null : null })
  }
  if (!n) return { tab, estructurado: false, motivo: 'tracker presente pero sin actividades con % cargado' }
  return { tab, estructurado: true, actividades: n, completadas, avancePromedio: Math.round(suma / n), detalle }
}

/** Avance físico de todas las hojas del archivo. Reusa un solo cliente Google. */
export async function avanceTodasLasObras() {
  const g = makeGoogleClient({ config: loadConfig() })
  const tabs = await g.listTabs(AVANCE_FILE_ID)
  const out = []
  for (const tab of tabs) out.push(await avanceHoja(g, tab))
  return out
}

/** Línea legible por hoja, para el cuadro/briefing. */
export function formatAvance(a) {
  if (!a.estructurado) return `${a.tab}: avance físico sin cargar (${a.motivo})`
  return `${a.tab}: **${a.avancePromedio}%** físico (${a.completadas}/${a.actividades} actividades completas)`
}

/** Resumen de avance físico. Sin nombre → todas las obras del archivo. Con nombre →
 *  la(s) hoja(s) cuyo título coincide. Respuesta lista para el chat (0 API del modelo). */
export async function avanceResumen(nombre) {
  let obras
  try { obras = await avanceTodasLasObras() } catch (e) {
    return `No pude leer el archivo de Avances de Obra: ${String(e?.message ?? e).slice(0, 140)}`
  }
  const filtro = norm(nombre).toLowerCase()
  const sel = filtro ? obras.filter((o) => o.tab.toLowerCase().includes(filtro)) : obras
  if (filtro && !sel.length) {
    return `No encontré una hoja de avance para "${nombre}". Hay: ${obras.map((o) => o.tab).join(', ')}.`
  }
  const conDato = sel.filter((o) => o.estructurado)
  const L = ['**Avance físico de obra**  _(fuente: "Avances de Obra" en Drive; 0 API)_', '']
  for (const o of sel) L.push(`• ${formatAvance(o)}`)
  if (conDato.length) {
    const prom = Math.round(conDato.reduce((s, o) => s + o.avancePromedio, 0) / conDato.length)
    L.push('', `Promedio de las obras con avance cargado: **${prom}%**.`)
  }
  L.push('', '_Es avance de ACTIVIDADES (% Done del tracker), no avance económico. Para el cruce físico vs económico pedime el cuadro económico de la obra._')
  return L.join('\n')
}
