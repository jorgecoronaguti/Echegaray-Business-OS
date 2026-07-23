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

/**
 * FILAS OCULTAS QUE NO PERTENECEN A NINGÚN GRUPO — invisibles y sin forma de encontrarlas.
 *
 * POR QUÉ EXISTE (23/07). El dueño: "no veo lo solicitado en caja, si se encuentra en filas ocultas,
 * mostrar". Había 115 ocultas desde la fila 18, y el calendario de vencimientos que él había pedido
 * estaba entre ellas. El grupo colapsable declaraba las filas 40 a 132: las 18 a 39 estaban ocultas
 * SIN GRUPO. Pasa cuando un bloque se mueve — el grupo se recrea en sus coordenadas nuevas y las
 * filas del grupo viejo quedan escondidas para siempre, sin un "+" que las devuelva.
 *
 * Una fila oculta DENTRO de su grupo está bien: tiene su "+" y se encuentra (es el desplegable por
 * proveedor, que el dueño pidió). Una fila oculta FUERA de todo grupo no se puede descubrir mirando.
 */
async function filasOcultasHuerfanas(g, titulo) {
  const j = await g.apiGetSheets(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(ID)}`
    + `?ranges=${encodeURIComponent(`'${titulo}'!A1:A400`)}&fields=sheets(rowGroups,data(rowMetadata(hiddenByUser)))`).catch(() => null)
  const hoja = j?.sheets?.[0]
  if (!hoja) return []
  const grupos = (hoja.rowGroups ?? []).map((x) => [x.range.startIndex, x.range.endIndex])
  const enGrupo = (i) => grupos.some(([a, b]) => i >= a && i < b)
  const huerfanas = []
  ;(hoja.data?.[0]?.rowMetadata ?? []).forEach((m, i) => { if (m.hiddenByUser && !enGrupo(i)) huerfanas.push(i + 1) })
  if (!huerfanas.length) return []
  return [{
    fila: huerfanas[0],
    regla: 'fila-oculta-huerfana',
    detalle: `${huerfanas.length} fila(s) ocultas que no pertenecen a ningún grupo desplegable: no hay forma de encontrarlas mirando (${huerfanas.slice(0, 8).join(', ')}${huerfanas.length > 8 ? '…' : ''}).`,
  }]
}

async function main() {
  const solo = process.argv[2]
  const g = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const hojas = (await g.getSheetMeta(ID)).filter((h) => (solo ? h.title === solo : !EXCLUIDAS.test(h.title)))

  let totalDefectos = 0
  const resumen = []
  for (const h of hojas) {
    const filas = await g.readSheetValues(ID, `'${h.title}'!A1:Z400`).catch(() => [])
    const malos = auditarPatron(filas)
    malos.push(...await filasOcultasHuerfanas(g, h.title))
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
