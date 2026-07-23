#!/usr/bin/env node
// MIDE TODAS LAS PESTAÑAS CONTRA EL PATRÓN DE DISEÑO. No arregla: nombra el defecto y su fila.
//
// POR QUÉ EXISTE (23/07). El dueño: "las pestañas no respetan un patrón de diseño". Hasta hoy eso
// sólo se podía contestar mirando una por una y opinando. Con esto es una MEDICIÓN: la gramática
// vive en lib/patron-pestana.mjs y acá se aplica contra el archivo real. Un estándar que no se
// puede medir vuelve a romperse a la semana siguiente.
//
//   node orquestador/scripts/auditar-diseno-pestanas.mjs ["Nombre de pestaña"]

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { auditarPatron } from '../lib/patron-pestana.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
// Las pestañas de insumo crudo (_RAW) y los ledgers de captura no son statements: son datos que se
// leen por fórmula, no cuadros que se leen con los ojos. Medirlas contra la gramática sería ruido.
const EXCLUIDAS = /^(_|Compras$|Cobranzas$|02_|Parámetros$|Parametros$)/i

async function main() {
  const solo = process.argv[2]
  const g = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const hojas = (await g.getSheetMeta(ID)).filter((h) => (solo ? h.title === solo : !EXCLUIDAS.test(h.title)))

  let totalDefectos = 0
  const resumen = []
  for (const h of hojas) {
    const filas = await g.readSheetValues(ID, `'${h.title}'!A1:Z400`).catch(() => [])
    const malos = auditarPatron(filas)
    resumen.push({ pestaña: h.title, defectos: malos.length })
    totalDefectos += malos.length
    if (!malos.length) { console.log(`✓ ${h.title}`); continue }
    console.log(`\n✖ ${h.title} — ${malos.length} defecto(s)`)
    // Agrupadas por regla: diez filas con el mismo problema son UN problema, no diez.
    const porRegla = new Map()
    for (const m of malos) {
      if (!porRegla.has(m.regla)) porRegla.set(m.regla, [])
      porRegla.get(m.regla).push(m)
    }
    for (const [regla, lista] of porRegla) {
      const filasTxt = lista.slice(0, 6).map((m) => m.fila).filter(Boolean).join(', ')
      console.log(`   ${regla} ×${lista.length}${filasTxt ? ` (filas ${filasTxt}${lista.length > 6 ? '…' : ''})` : ''}`)
      console.log(`      ${lista[0].detalle}`)
    }
  }

  console.log(`\n── ${resumen.filter((r) => !r.defectos).length}/${resumen.length} pestañas limpias · ${totalDefectos} defecto(s) en total`)
  // El código de salida sirve para que esto se pueda encadenar a una validación automática.
  process.exit(totalDefectos ? 1 : 0)
}

main().catch((e) => { console.error(e); process.exit(2) })
