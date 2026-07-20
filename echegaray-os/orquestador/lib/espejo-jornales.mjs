// ESPEJO DE JORNALES SIN IMPORTRANGE.
//
// El IMPORTRANGE que traía el archivo JORNALES quedó en "Cargando..." y NO avisó. De ese espejo
// cuelga todo (14 quincenas, total del año, proyección, RESUMEN, línea de jornales del Cash Flow):
// quedó en #REF! y en cero, y el síntoma aparecía a cuatro pestañas de distancia de la causa.
// Un IMPORTRANGE sólo lo puede reautorizar un humano con un clic. El OS ya tiene permiso propio
// sobre el archivo origen, así que no necesita el puente: copia él.
const DESTINO = '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const ORIGEN = '1s0KlEURR5Udi7vvy-BmeqAi83lMRyqSCSsRjpiO5aXk'
const MAPA = [
  { hoja: 'Obreros 26', tab: '_J_OBREROS', rango: 'A1:AC990' },
  { hoja: 'Oficina 26', tab: '_J_OFICINA', rango: 'A1:AA990' },
]

export function formatEspejo(r) {
  if (!r || r.error) return `No pude refrescar el espejo de JORNALES: ${r?.error ?? 'sin datos'}`
  const L = ['ESPEJO DE JORNALES', '']
  for (const h of r.hojas) L.push(`  ${h.tab}: ${h.filas} filas${h.aviso ? ` · ⚠ ${h.aviso}` : ''}`)
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
    hojas.push({ tab: m.tab, filas: norm.filter((f) => f.some((c) => String(c ?? '').trim())).length })
  }
  return { hojas }
}
