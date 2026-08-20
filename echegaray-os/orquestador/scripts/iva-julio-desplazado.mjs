#!/usr/bin/env node
// LA COLUMNA DE JULIO DEL CUADRO DE IVA ESTÁ CORRIDA UNA FILA, Y SE VUELVE A SU LUGAR.
//
// ═══ QUÉ PASÓ (17/08/2026) ═══
//
// El bloque "3 · IVA — DÉBITO, CRÉDITO Y SALDO A FAVOR" de `Impuestos y Financieros` tiene la
// columna H (jul-26) desplazada **una fila hacia arriba**. Los números del dueño son correctos en
// CONTENIDO y están mal en POSICIÓN:
//
//   H53 (encabezado del mes)          dice 23.623.111,82   → es el DÉBITO
//   H54 (Débito fiscal)               dice 11.328.237,58   → es el CRÉDITO
//   H55 (Crédito fiscal)              dice 0               → es el A PAGAR
//   H56 (⇒ IVA a pagar en efectivo)   dice  7.050.036,33   → es la LIBRE DISPONIBILIDAD
//   H57 (Saldo de libre disponib.)    dice "⚠ vence 20/08" → es una leyenda tipeada
//
// ═══ POR QUÉ ESTO NO ES UNA OPINIÓN ═══
//
// La aritmética del propio cuadro cierra AL CENTAVO con la lectura corregida y no cierra con la
// publicada. El arrastre es `libre(mes) = libre(mes-1) + crédito − débito`:
//
//   19.344.910,57 + 11.328.237,58 − 23.623.111,82 = 7.050.036,33   ✓ exacto
//
// y el a pagar es `MAX(0; débito − crédito − libre(mes-1))` = `MAX(0; −7.050.036,33)` = **0**.
//
// ═══ EL DAÑO, QUE ES EL MOTIVO ═══
//
// La fila 56 es la que leen el Libro y los dos Cash Flow. Con la columna corrida, el OS reserva
// **$7.050.036 de IVA para pagar el 20/08** — en tres días — cuando el IVA a pagar de julio es CERO
// y esos $7.050.036 son crédito A FAVOR. El titular "a pagar en los próximos 30 días" declara
// $18.813.036 contra $11.763.000 reales: 37,5% de sobredeclaración en el número con el que se
// decide cuánta plata juntar.
//
// ═══ POR QUÉ NO LO ARREGLA EL GENERADOR ═══
//
// Son valores PEGADOS. `impuestos-pestana.mjs` los respeta —y hace bien: es dato del dueño— así que
// la corrida deja la columna igual y sólo cambia el `#VALUE!` de la portada por un aviso legible.
// Mover celdas tipeadas es una operación con bisturí, con una persona nombrándolas: ésta.
//
// ═══ CÓMO NO ROMPE NADA ═══
//
// · Verifica la aritmética ANTES de escribir. Si no cierra al centavo, no toca nada y falla.
// · Comprueba que cada celda tenga HOY el valor desplazado que espera. Si alguien ya la corrigió,
//   aborta: no vuelve a mover una columna que ya está en su lugar.
// · La leyenda no se tira: se transcribe al log para que se pueda recuperar.
// · Relee el archivo celda por celda y vuelve a verificar el arrastre sobre lo escrito.
//
//   node orquestador/scripts/iva-julio-desplazado.mjs             → dice qué haría, no escribe
//   node orquestador/scripts/iva-julio-desplazado.mjs --aplicar   → escribe y verifica releyendo

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const APLICAR = process.argv.includes('--aplicar')
const PESTANA = 'Impuestos y Financieros'
const COL = 'H'
const cent = (x) => Math.round((Number(x) || 0) * 100)
const plata = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-AR')

/**
 * NÚCLEO PURO: ¿la columna está desplazada, y la aritmética del cuadro lo prueba?
 *
 * `leido` son las cinco celdas H53..H57 tal como están hoy. `libreAnterior` es el saldo de libre
 * disponibilidad del mes anterior (G57), que es el ancla del arrastre.
 *
 * @returns {{desplazada:boolean, motivo:string, corregido?:{debito:number, credito:number, aPagar:number, libre:number}}}
 */
export function diagnosticar(leido = [], libreAnterior = 0) {
  const [h53, h54, h55, h56, h57] = leido
  const num = (x) => (typeof x === 'number' ? x : null)
  // La firma del desplazamiento: un NÚMERO en la fila del encabezado y un TEXTO en la del saldo.
  // Las dos juntas, porque cada una sola tiene explicaciones inocentes.
  if (num(h53) === null) return { desplazada: false, motivo: 'H53 no es un número: el encabezado está en su lugar' }
  if (typeof h57 === 'number') return { desplazada: false, motivo: 'H57 ya es un importe: la columna no está corrida' }
  const debito = num(h53); const credito = num(h54); const aPagar = num(h55); const libre = num(h56)
  if ([credito, aPagar, libre].some((x) => x === null)) {
    return { desplazada: false, motivo: 'alguna de H54..H56 no es un número: no reconozco el patrón' }
  }
  // LA PRUEBA. El arrastre del cuadro tiene que cerrar al centavo con la lectura corregida.
  const esperado = cent(libreAnterior) + cent(credito) - cent(debito)
  if (esperado !== cent(libre)) {
    return { desplazada: false,
      motivo: `la aritmética NO cierra: ${plata(libreAnterior)} + ${plata(credito)} − ${plata(debito)} `
        + `da ${plata(esperado / 100)} y la celda dice ${plata(libre)}. No muevo nada.` }
  }
  // Y el "a pagar" corregido tiene que ser el que la misma fórmula produce.
  const aPagarReal = Math.max(0, (cent(debito) - cent(credito) - cent(libreAnterior)) / 100)
  return { desplazada: true, motivo: 'la aritmética cierra al centavo', leyenda: String(h57 ?? ''),
    corregido: { debito, credito, aPagar: aPagarReal, libre } }
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const meta = await google.getSheetMeta(ID)
  const hoja = meta.find((h) => h.title === PESTANA)
  if (!hoja) throw new Error(`no encontré la pestaña "${PESTANA}"`)

  const leido = (await google.readSheetValues(ID, `'${PESTANA}'!${COL}53:${COL}57`, { render: 'UNFORMATTED_VALUE' }))
    .map((f) => f?.[0] ?? '')
  const [gAnt] = (await google.readSheetValues(ID, `'${PESTANA}'!G57:G57`, { render: 'UNFORMATTED_VALUE' }))
    .map((f) => f?.[0] ?? 0)

  const d = diagnosticar(leido, gAnt)
  console.log(`«${PESTANA}» · columna ${COL} (jul-26) · saldo de junio ${plata(gAnt)}`)
  console.log(`  hoy: H53=${leido[0]} · H54=${leido[1]} · H55=${leido[2]} · H56=${leido[3]} · H57="${leido[4]}"`)
  if (!d.desplazada) { console.log(`\n✓ ${d.motivo}`); return }

  const c = d.corregido
  console.log(`  ✓ ${d.motivo}: ${plata(gAnt)} + ${plata(c.credito)} − ${plata(c.debito)} = ${plata(c.libre)}\n`)
  console.log('  queda así:')
  console.log(`    H53 encabezado                    → "jul-26"`)
  console.log(`    H54 Débito fiscal                 → ${plata(c.debito)}`)
  console.log(`    H55 Crédito fiscal                → ${plata(c.credito)}`)
  console.log(`    H56 ⇒ IVA a pagar en efectivo     → ${plata(c.aPagar)}   (hoy dice ${plata(leido[3])})`)
  console.log(`    H57 Saldo de libre disponibilidad → ${plata(c.libre)}`)
  console.log(`  la leyenda que se descarta: "${d.leyenda}" — no es un importe, no va en una serie que otras fórmulas suman`)
  if (!APLICAR) { console.log('\n(sin --aplicar: no escribí nada)'); return }

  const col = 7 // H
  const val = [{ stringValue: 'jul-26' }, { numberValue: c.debito }, { numberValue: c.credito },
    { numberValue: c.aPagar }, { numberValue: c.libre }]
  const r = await google.spreadsheetBatchUpdate(ID, [{ updateCells: {
    range: { sheetId: hoja.sheetId, startRowIndex: 52, endRowIndex: 57, startColumnIndex: col, endColumnIndex: col + 1 },
    rows: val.map((v) => ({ values: [{ userEnteredValue: v }] })),
    fields: 'userEnteredValue',
  } }])
  if (r?.congelado) return console.log('🧊 el freno de mano está puesto: no escribí nada.')
  if (r?.protegido) return console.log('🔒 la guarda descartó todo: la pestaña está candada.')

  // ── LA EVIDENCIA ES DEL EFECTO: se relee y se vuelve a verificar el arrastre sobre lo escrito.
  const despues = (await google.readSheetValues(ID, `'${PESTANA}'!${COL}53:${COL}57`, { render: 'UNFORMATTED_VALUE' }))
    .map((f) => f?.[0] ?? '')
  const okArrastre = cent(gAnt) + cent(despues[2]) - cent(despues[1]) === cent(despues[4])
  console.log(`\n  releído: H53="${despues[0]}" · H54=${plata(despues[1])} · H55=${plata(despues[2])} `
    + `· H56=${plata(despues[3])} · H57=${plata(despues[4])}`)
  if (despues[0] !== 'jul-26' || !okArrastre) {
    console.error('✖ el archivo no dice lo que escribí, o el arrastre dejó de cerrar.'); process.exit(1)
  }
  console.log('  ✓ el arrastre cierra sobre lo escrito')
  console.log(`\n✓ el IVA a pagar de julio pasó de ${plata(leido[3])} a ${plata(c.aPagar)}, `
    + `y ${plata(c.libre)} volvieron a ser crédito A FAVOR.`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
}
