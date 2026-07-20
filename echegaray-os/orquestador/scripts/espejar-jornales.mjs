#!/usr/bin/env node
// ESPEJAR JORNALES SIN IMPORTRANGE.
//
// POR QUÉ (20/07): `_J_OBREROS!A1` tenía un IMPORTRANGE al archivo JORNALES y quedó en
// "Cargando..." para siempre — se cae la autorización entre planillas y NO avisa. De ese espejo
// cuelga todo: las 14 quincenas, el total del año, la proyección, RESUMEN y la línea de jornales
// del Cash Flow. Todo eso quedó en #REF! y en cero, y el síntoma aparece a cuatro pestañas de
// distancia de la causa.
//
// Un IMPORTRANGE es una dependencia que sólo un humano puede reautorizar, con un clic, en el
// navegador. El OS ya tiene permiso para leer el archivo origen con su propia credencial: no
// necesita el puente. Esto lo reemplaza por un snapshot que mantiene el agente.
import { makeGoogleClient, WORKSPACE_SCOPES } from '../lib/google.mjs'
import { operadorPara, getTokenFor } from '../lib/google-oauth.mjs'
import { loadConfig } from '../lib/config.mjs'

const DESTINO = '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const ORIGEN = '1s0KlEURR5Udi7vvy-BmeqAi83lMRyqSCSsRjpiO5aXk'
const MAPA = [
  { hoja: 'Obreros 26', tab: '_J_OBREROS', rango: 'A1:AC990' },
  { hoja: 'Oficina 26', tab: '_J_OFICINA', rango: 'A1:AA990' },
]

const op = await operadorPara()
if (!op) { console.error('no hay cuenta de Google autorizada'); process.exit(1) }
const google = makeGoogleClient({ config: loadConfig(), scopes: WORKSPACE_SCOPES, getToken: getTokenFor(op) })

for (const m of MAPA) {
  let filas
  try { filas = await google.readSheetValues(ORIGEN, `${m.hoja}!${m.rango}`) }
  catch (e) { console.error(`  ${m.tab}: no pude leer "${m.hoja}" — ${String(e?.message ?? e).slice(0, 120)}`); continue }
  if (!filas?.length) { console.error(`  ${m.tab}: el origen vino vacío, NO piso el espejo`); continue }

  const ancho = Math.max(...filas.map((f) => f.length))
  const norm = filas.map((f) => { const r = f.slice(); while (r.length < ancho) r.push(''); return r })
  // Se limpia primero: si el origen encogió, las filas viejas quedarían colgadas y el detector de
  // quincenas leería bloques que ya no existen.
  await google.clearValues(DESTINO, `${m.tab}!${m.rango}`)
  // En tandas: 990 filas en una sola llamada se pasa del límite de la API.
  const TANDA = 200
  for (let i = 0; i < norm.length; i += TANDA) {
    const trozo = norm.slice(i, i + TANDA)
    await google.batchUpdateValues(DESTINO, [{ range: `${m.tab}!A${i + 1}`, values: trozo }])
  }
  const conDato = norm.filter((f) => f.some((c) => String(c ?? '').trim())).length
  console.log(`  ${m.tab}: ${conDato} filas con dato copiadas desde "${m.hoja}"`)
}
console.log('Listo. El espejo ya no depende del IMPORTRANGE.')
process.exit(0)
