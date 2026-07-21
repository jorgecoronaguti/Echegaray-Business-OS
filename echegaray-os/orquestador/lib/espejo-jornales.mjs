// ESPEJO DE JORNALES SIN IMPORTRANGE.
//
// El IMPORTRANGE que traía el archivo JORNALES quedó en "Cargando..." y NO avisó. De ese espejo
// cuelga todo (14 quincenas, total del año, proyección, RESUMEN, línea de jornales del Cash Flow):
// quedó en #REF! y en cero, y el síntoma aparecía a cuatro pestañas de distancia de la causa.
// Un IMPORTRANGE sólo lo puede reautorizar un humano con un clic. El OS ya tiene permiso propio
// sobre el archivo origen, así que no necesita el puente: copia él.
//
// ═══ EL SEGUNDO MODO DE FALLA, QUE COSTÓ ENCONTRAR (21/07) ═══
//
// Reemplazar el IMPORTRANGE por una copia arregló el #REF! pero abrió un problema peor, porque este
// no se ve: un IMPORTRANGE roto GRITA (#REF!, "Cargando..."), una copia vieja se queda callada y
// muestra números plausibles. Este script NO estaba en los pasos del agente: se corrió una vez a
// mano el 20/07 y ahí quedó. Al día siguiente el espejo tenía la quincena en curso entera con
// valores viejos —14 obreros, $1.231.963 de menos— y el cash flow, las quincenas y el núcleo
// leían esa foto como si fuera de hoy.
//
// POR ESO EL ESPEJO SE VERIFICA CONTRA SU ORIGEN. Un espejo que no da igual que el original no es
// un espejo: `verificarEspejo()` vuelve a leer el destino y compara la columna de plata. Si no
// coincide, lo dice con el monto. Es el mismo método que encontró los typos del extracto del
// Santander — dos números que TIENEN que coincidir.

const DESTINO = '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const ORIGEN = '1s0KlEURR5Udi7vvy-BmeqAi83lMRyqSCSsRjpiO5aXk'

// `col` es la columna del NETO a pagar, la que tiene que dar igual de los dos lados (0-indexada).
// Obreros AA=26 · Oficina Z=25. Está verificada en lib/jornales.mjs y no se adivina.
const MAPA = [
  { hoja: 'Obreros 26', tab: '_J_OBREROS', rango: 'A1:AC990', col: 26 },
  { hoja: 'Oficina 26', tab: '_J_OFICINA', rango: 'A1:AA990', col: 25 },
]

/**
 * NÚCLEO PURO: lee un importe escrito a la argentina ("$ 1.231.963,50") como número.
 * El espejo copia el valor FORMATEADO, así que sin esto la comparación mide texto contra texto.
 */
export function importe(v) {
  const s = String(v ?? '').replace(/[^0-9,.-]/g, '').replace(/\./g, '').replace(',', '.')
  const n = Number(s)
  return Number.isFinite(n) ? n : 0
}

/** NÚCLEO PURO: suma la columna de plata de una matriz de filas. */
export function total(filas = [], col = 0) {
  return filas.reduce((a, f) => a + importe(f?.[col]), 0)
}

/**
 * NÚCLEO PURO: ¿el espejo dice lo mismo que el origen?
 * @returns {{ok:boolean, origen:number, espejo:number, diferencia:number}}
 */
export function comparar(filasOrigen = [], filasEspejo = [], col = 0, tolerancia = 0.5) {
  const o = total(filasOrigen, col)
  const e = total(filasEspejo, col)
  const d = o - e
  return { ok: Math.abs(d) <= tolerancia, origen: o, espejo: e, diferencia: d }
}

const ars = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-AR')}`

export function formatEspejo(r) {
  if (!r || r.error) return `No pude refrescar el espejo de JORNALES: ${r?.error ?? 'sin datos'}`
  const L = ['ESPEJO DE JORNALES', '']
  for (const h of r.hojas) {
    const plata = h.verificacion ? `  ${ars(h.verificacion.origen)}` : ''
    L.push(`  ${h.tab}: ${h.filas} filas${plata}${h.aviso ? ` · ⚠ ${h.aviso}` : ''}`)
  }
  if (r.desfasado) L.push('', '  ⚠ El espejo NO coincide con el original: lo que lea el cash flow está mal.')
  return L.join('\n')
}

export async function refrescarEspejo(google, { destino = DESTINO, origen = ORIGEN } = {}) {
  if (!google?.readSheetValues) return { error: 'no hay una cuenta de Google autorizada' }
  const hojas = []
  for (const m of MAPA) {
    let filas
    try { filas = await google.readSheetValues(origen, `${m.hoja}!${m.rango}`) }
    catch (e) { hojas.push({ tab: m.tab, filas: 0, aviso: `no pude leer el origen: ${String(e?.message ?? e).slice(0, 90)}` }); continue }
    // Si el origen vino vacío NO se pisa el espejo: dejar el dato viejo es mucho menos malo que
    // borrar el cuadro entero porque una lectura falló.
    if (!filas?.length) { hojas.push({ tab: m.tab, filas: 0, aviso: 'el origen vino vacío, no toqué el espejo' }); continue }
    const ancho = Math.max(...filas.map((f) => f.length))
    const norm = filas.map((f) => { const r = f.slice(); while (r.length < ancho) r.push(''); return r })
    await google.clearValues(destino, `${m.tab}!${m.rango}`)
    for (let i = 0; i < norm.length; i += 200) {
      await google.batchUpdateValues(destino, [{ range: `${m.tab}!A${i + 1}`, values: norm.slice(i, i + 200) }])
    }
    // VERIFICAR, no confiar. Se relee el DESTINO —no la matriz que acabamos de mandar— porque lo
    // que importa es qué quedó escrito, no qué quisimos escribir. Una copia que se cree hecha y no
    // lo está es peor que no copiar: nadie la mira de nuevo.
    let verificacion = null
    try {
      const escrito = await google.readSheetValues(destino, `${m.tab}!${m.rango}`)
      verificacion = comparar(norm, escrito, m.col)
    } catch (e) {
      hojas.push({ tab: m.tab, filas: norm.length, aviso: `no pude verificar el espejo: ${String(e?.message ?? e).slice(0, 90)}` })
      continue
    }
    hojas.push({
      tab: m.tab,
      filas: norm.filter((f) => f.some((c) => String(c ?? '').trim())).length,
      verificacion,
      aviso: verificacion.ok ? undefined : `el espejo quedó ${ars(Math.abs(verificacion.diferencia))} ${verificacion.diferencia > 0 ? 'por debajo' : 'por encima'} del original`,
    })
  }
  return { hojas, desfasado: hojas.some((h) => h.verificacion && !h.verificacion.ok) }
}
