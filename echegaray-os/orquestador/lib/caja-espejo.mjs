// EL ESPEJO DE LA PESTAÑA CAJA — lo que CAJA MUESTRA, leído tal cual, para que la app lo lea de Postgres.
//
// ═══ EL PEDIDO (18/09/2026, textual) ═══
//
// «la sección caja que muestra analíticas en app.ecsas.com.ar tiene que ser un reflejo fiel de lo que
// muestra la pestaña caja de sheet flujo de fondos, manda todo a supabase en tiempo real para que se
// lea de ahí».
//
// ═══ REFLEJO FIEL = EL TEXTO DE LA CELDA, NO UN NÚMERO RECALCULADO ═══
//
// Cada celda se guarda con DOS lecturas que no se pisan: `texto` —el `formattedValue`, lo que el dueño
// VE en la pestaña, con sus puntos, su «U$S», su «(12.293.790)» y su «—»— y `numero` —el
// `effectiveValue`, el mismo valor sin formato—. La app dibuja el texto: así el espejo no puede
// redondear distinto, convertir otra moneda ni cambiar un rótulo. El número queda para medir (el largo
// de una barra, un control), nunca para reescribir lo que la pestaña dice.
//
// Nada de acá calcula un saldo. Si CAJA dice «$80.072.343», el espejo dice «$80.072.343»; si mañana el
// dueño cambia la fórmula, el espejo cambia con ella sin tocar código.
//
// ═══ SE UBICA POR RÓTULO, NUNCA POR LETRA DE COLUMNA ═══
//
// La pestaña la reescribe el generador (`scripts/caja-pestana.mjs`) y ya cambió de forma siete veces.
// Un espejo que leyera «A3» o «C15» fijo publicaría otro número el día que el cuadro crezca una fila,
// sin error. Acá se buscan las anclas por su texto:
//
//   · la PORTADA es la fila cuyos rótulos incluyen «CAJA DISPONIBLE»: cada rótulo no vacío de esa fila
//     es una tarjeta, su valor está debajo y su contexto debajo del valor.
//   · cada SECCIÓN empieza en una celda «N · TÍTULO». Su ancho va hasta la próxima sección de la misma
//     fila. Si la fila de abajo trae dos o más rótulos es una TABLA (encabezados + filas); si no, es una
//     LISTA (alertas, acciones).
//
// Si falta un ancla, `leerCaja` TIRA: un espejo a medio leer no se publica (la app sigue mostrando la
// última foto buena, con su hora, y el error queda a la vista).
//
// Núcleo PURO: entra la grilla ya leída (`readSheetGrid`), sale la foto. Se prueba sin Google ni Postgres.
import { createHash } from 'node:crypto'

const txt = (c) => (c?.valor == null ? '' : String(c.valor).trim())
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim()
const SECCION = /^(\d+)\s*·\s*(.+)$/

/** Serial de Sheets (días desde 30/12/1899) → `AAAA-MM-DD`. */
export function serialAIso(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return null
  const d = new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86400000)
  return d.toISOString().slice(0, 10)
}

/** Una celda del espejo: lo que se ve, el número detrás, y la fecha si la celda es una fecha. */
export function celda(c) {
  const texto = txt(c)
  const numero = typeof c?.numero === 'number' && Number.isFinite(c.numero) ? c.numero : null
  const fecha = c?.formato === 'DATE' || c?.formato === 'DATE_TIME' ? serialAIso(numero) : null
  return { texto, numero, fecha }
}

const slug = (s) => norm(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'fila'

/** Las celdas con texto de una fila, entre dos columnas (hasta exclusiva). */
function llenas(fila, desde = 0, hasta = Infinity) {
  const out = []
  ;(fila ?? []).forEach((c, j) => { if (j >= desde && j < hasta && txt(c) !== '') out.push({ col: j, c }) })
  return out
}

/** LA PORTADA: las tarjetas de la fila de «CAJA DISPONIBLE», con su valor y su contexto. */
export function leerPortada(filas) {
  const i = filas.findIndex((f) => llenas(f).some(({ c }) => norm(txt(c)) === 'CAJA DISPONIBLE'))
  if (i < 0) throw new Error('CAJA: no encuentro la fila de «CAJA DISPONIBLE» — no publico una portada a ciegas')
  const titulo = i > 0 ? llenas(filas[i - 1]).map(({ c }) => txt(c)).join(' ') : ''
  const tarjetas = llenas(filas[i]).map(({ col, c }) => ({
    clave: slug(txt(c)),
    rotulo: txt(c),
    valor: celda(filas[i + 1]?.[col]),
    contexto: txt(filas[i + 2]?.[col]),
  }))
  if (!tarjetas.every((t) => t.valor.texto !== '')) {
    throw new Error(`CAJA: una tarjeta sin valor (${tarjetas.filter((t) => t.valor.texto === '').map((t) => t.rotulo).join(', ')})`)
  }
  return { titulo, tarjetas, fila: i + 1 }
}

/** LAS SECCIONES «N · TÍTULO», con su forma (tabla o lista) y sus filas, tal cual. */
export function leerSecciones(filas, desdeFila = 0) {
  const anclas = []
  filas.forEach((f, i) => {
    if (i < desdeFila) return
    for (const { col, c } of llenas(f)) {
      const m = SECCION.exec(txt(c))
      if (m) anclas.push({ fila: i, col, numero: Number(m[1]), titulo: txt(c) })
    }
  })
  if (!anclas.length) throw new Error('CAJA: no encuentro ninguna sección «N · TÍTULO»')
  return anclas.map((a) => {
    const vecina = anclas.filter((b) => b.fila === a.fila && b.col > a.col).sort((x, y) => x.col - y.col)[0]
    const hasta = vecina ? vecina.col : Infinity
    // La sección termina donde empieza la próxima que ocupa sus columnas (más abajo), o al final.
    const fin = anclas.filter((b) => b.fila > a.fila && b.col >= a.col && b.col < hasta).map((b) => b.fila).sort((x, y) => x - y)[0] ?? filas.length
    const debajo = llenas(filas[a.fila + 1], a.col, hasta)
    const base = { clave: `seccion-${a.numero}`, numero: a.numero, titulo: a.titulo }
    if (debajo.length >= 2) {
      const cols = debajo.map((d) => d.col)
      const encabezados = debajo.map((d) => txt(d.c))
      const vistas = new Map()
      const filasTabla = []
      for (let r = a.fila + 2; r < fin; r++) {
        const valores = cols.map((j) => celda(filas[r]?.[j]))
        if (valores.every((v) => v.texto === '')) continue
        const k = slug(valores[0].texto)
        const n = (vistas.get(k) ?? 0) + 1
        vistas.set(k, n)
        filasTabla.push({ clave: n > 1 ? `${k}-${n}` : k, fila: r + 1, celdas: valores })
      }
      return { ...base, forma: 'tabla', encabezados, filas: filasTabla }
    }
    const items = []
    for (let r = a.fila + 1; r < fin; r++) {
      for (const { c } of llenas(filas[r], a.col, hasta)) items.push({ fila: r + 1, texto: txt(c) })
    }
    return { ...base, forma: 'lista', items }
  })
}

/** La grilla completa en texto+número, para que un tercero audite el espejo contra la pestaña. */
export function grillaPlana(filas) {
  const out = []
  filas.forEach((f, i) => (f ?? []).forEach((c, j) => {
    const x = celda(c)
    if (x.texto !== '' || x.numero != null) out.push({ f: i + 1, c: j + 1, t: x.texto, n: x.numero })
  }))
  return out
}

// ─── Los gráficos ────────────────────────────────────────────────────────────────────────────────

const letra = (i) => {
  let s = ''
  let n = i + 1
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26) }
  return s
}

/** Un `GridRange` de la API → `'Pestaña'!H260:H290`. */
export function a1(titulo, r) {
  return `'${String(titulo).replace(/'/g, "''")}'!${letra(r.startColumnIndex ?? 0)}${(r.startRowIndex ?? 0) + 1}:${letra((r.endColumnIndex ?? 1) - 1)}${r.endRowIndex}`
}

/**
 * LOS GRÁFICOS DE CAJA, COMO DATOS. Entra la respuesta de `spreadsheets.get` con `charts(...)` (todas
 * las pestañas, para resolver `sheetId → título`); sale cada gráfico con los rangos A1 que hay que leer.
 * Los gráficos de CAJA no tienen datos propios —leen `_CAJA_ANEXO` (ver lib/caja-graficos.mjs)—, así
 * que el espejo lee LOS MISMOS rangos que el gráfico, no una serie recalculada.
 */
export function planDeGraficos(respuesta, pestana = 'CAJA') {
  const titulos = new Map((respuesta?.sheets ?? []).map((s) => [s.properties?.sheetId, s.properties?.title]))
  const hoja = (respuesta?.sheets ?? []).find((s) => s.properties?.title === pestana)
  const rango = (sr) => {
    const src = sr?.sourceRange?.sources?.[0]
    if (!src || !titulos.has(src.sheetId)) return null
    return a1(titulos.get(src.sheetId), src)
  }
  return (hoja?.charts ?? []).flatMap((ch) => {
    const b = ch.spec?.basicChart
    if (!b) return []
    const dominio = rango(b.domains?.[0]?.domain)
    const series = (b.series ?? []).map((s) => ({
      rango: rango(s.series), tipo: s.type ?? b.chartType ?? null, eje: s.targetAxis ?? null,
      punteada: s.lineStyle?.type ? s.lineStyle.type !== 'SOLID' : false,
    })).filter((s) => s.rango)
    if (!dominio || !series.length) return []
    return [{
      id: String(ch.chartId), titulo: ch.spec?.title ?? '', subtitulo: ch.spec?.subtitle ?? '',
      tipo: b.chartType ?? null, apilado: b.stackedType ?? null, encabezados: b.headerCount ?? 0,
      fila: (ch.position?.overlayPosition?.anchorCell?.rowIndex ?? 0) + 1,
      dominio, series,
    }]
  }).sort((x, y) => x.fila - y.fila || x.id.localeCompare(y.id))
}

/** Los rangos a leer, sin repetir. */
export const rangosDeGraficos = (plan) => [...new Set(plan.flatMap((g) => [g.dominio, ...g.series.map((s) => s.rango)]))]

/**
 * El gráfico con sus valores. `leidos` = `Map(rangoA1 → { texto: string[][], crudo: any[][] })`, las dos
 * lecturas de `values:batchGet` (FORMATTED_VALUE y UNFORMATTED_VALUE). Con `encabezados = 1` la primera
 * fila es el nombre de la serie, como la dibuja Sheets.
 */
export function armarGraficos(plan, leidos) {
  const col = (r) => {
    const l = leidos.get(r)
    if (!l) throw new Error(`CAJA: el gráfico lee ${r} y ese rango no volvió`)
    return { texto: (l.texto ?? []).map((f) => (f?.[0] == null ? '' : String(f[0]))), crudo: (l.crudo ?? []).map((f) => f?.[0] ?? null) }
  }
  return plan.map((g) => {
    const h = g.encabezados > 0 ? 1 : 0
    const d = col(g.dominio)
    const largo = Math.max(d.texto.length, d.crudo.length) - h
    const numeros = (xs) => Array.from({ length: largo }, (_, i) => {
      const v = xs[i + h]
      return typeof v === 'number' && Number.isFinite(v) ? v : null
    })
    return {
      id: g.id, titulo: g.titulo, subtitulo: g.subtitulo, tipo: g.tipo, apilado: g.apilado, fila: g.fila,
      dominio: Array.from({ length: largo }, (_, i) => d.texto[i + h] ?? ''),
      series: g.series.map((s) => {
        const c = col(s.rango)
        return { nombre: h ? (c.texto[0] ?? '') : '', tipo: s.tipo, eje: s.eje, punteada: s.punteada, valores: numeros(c.crudo) }
      }),
    }
  })
}

// ─── La foto ─────────────────────────────────────────────────────────────────────────────────────

/** LA FOTO DE CAJA: portada + secciones + gráficos + tipo de cambio + la grilla cruda, con su huella. */
export function leerCaja({ grid, graficos = [], tipoCambioUsd = null }) {
  const filas = grid?.filas ?? []
  if (!filas.length) throw new Error('CAJA: la pestaña volvió vacía — no publico una caja vacía')
  const portada = leerPortada(filas)
  const secciones = leerSecciones(filas, portada.fila)
  const tc = typeof tipoCambioUsd === 'number' && Number.isFinite(tipoCambioUsd) ? tipoCambioUsd : null
  const contenido = { portada, secciones, graficos, tipo_cambio_usd: tc }
  const huella = createHash('sha256').update(JSON.stringify(contenido)).digest('hex')
  return { ...contenido, grilla: grillaPlana(filas), huella }
}

/**
 * ¿INSERTAR, SÓLO CONFIRMAR, O NADA? Una foto idéntica a la vigente no se vuelve a guardar: se confirma
 * (`verificada_en`), así la app sabe que a esa hora CAJA seguía diciendo lo mismo sin sumar filas.
 */
export function decidirEscritura(vigente, foto) {
  if (vigente?.huella === foto.huella) return 'confirmar'
  return 'insertar'
}
