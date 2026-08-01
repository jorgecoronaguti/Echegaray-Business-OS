#!/usr/bin/env node
// ROMPE TODOS LOS CANDADOS ADOPTANDO CADA PESTAÑA COMO ESTÁ HOY.
//
// El dueño: *"rompé los candados de todo, que los agentes entiendan cada una de las pestañas como
// están y las dejen así"*.
//
// ═══ ROMPER EL CANDADO NO ES BORRAR LA FILA DE LA BASE ═══
//
// Un candado tiene DOS mitades: la fila en `sheet_pestanas_bloqueadas` y la FIRMA que dice cómo era
// la pestaña la última vez que escribió el OS. Si sólo se borra la fila, el control de firma vuelve a
// mirar, ve una pestaña distinta de la que él dejó y la canda de nuevo en la corrida siguiente — que
// es exactamente lo que pasó hoy dos veces seguidas con "Cash Flow Mensual".
//
// Adoptar es la otra operación: RE-SELLAR la firma de valores y la de formato contra el estado VIVO.
// A partir de ahí el OS entiende la pestaña como está —lo que el dueño haya escrito pasa a ser la
// referencia, no una diferencia sospechosa— y sigue actualizando los números sin pisarle nada,
// porque la fusión celda a celda y la Regla 0 siguen activas por debajo.
//
// LO QUE ESTO NO HACE, DICHO ACÁ: no reescribe ninguna pestaña. No dispara ningún generador. Sólo
// cambia la referencia contra la que se comparan. Si mañana el dueño edita algo, la firma vuelve a
// diferir y el candado vuelve a protegerlo: se adopta el presente, no se desactiva el mecanismo.
//
//   node orquestador/scripts/adoptar-pestanas.mjs             (muestra y no toca)
//   node orquestador/scripts/adoptar-pestanas.mjs --aplicar

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { query } from '../lib/db.mjs'
import { sellarFirma } from '../lib/firma-tab.mjs'
import { sellarFormato } from '../lib/firma-formato.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const APLICAR = process.argv.includes('--aplicar')

// Las hojas técnicas (espejos de fuentes externas) no tienen nada del dueño que adoptar y se
// reescriben enteras en cada corrida: sellarlas es trabajo y ruido sin efecto.
const ESPEJO = /^_/

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const hojas = (await google.getSheetMeta(ID)).map((h) => h.title).filter((t) => !ESPEJO.test(t))
  const { rows: candados } = await query('select pestana, bloqueada_por, motivo from sheet_pestanas_bloqueadas where file_id = $1', [ID])
  const porTab = new Map(candados.map((c) => [c.pestana, c]))

  console.log(`${hojas.length} pestaña(s) de trabajo · ${candados.length} candada(s)\n`)
  if (!APLICAR) {
    for (const t of hojas) {
      const c = porTab.get(t)
      console.log(`  ${c ? '🔒' : '  '} ${t.padEnd(26)} ${c ? `candada por ${c.bloqueada_por}: ${String(c.motivo).slice(0, 60)}` : 'libre'}`)
    }
    console.log('\n(nada escrito: corré con --aplicar para adoptar el estado actual y levantar los candados)')
    return
  }

  let sellados = 0
  const fallaron = []
  for (const t of hojas) {
    try {
      // Firma de VALORES y de FORMATO. Las dos, o la pestaña se vuelve a candar por la mitad que falte
      // (el formato tiene su propia firma desde el 01/08 y protege por separado).
      await sellarFirma(google, ID, t)
      await sellarFormato(google, ID, t)
      sellados++
      console.log(`  ✓ ${t.padEnd(26)} adoptada tal como está`)
    } catch (e) {
      fallaron.push(t)
      console.log(`  ✖ ${t.padEnd(26)} no pude sellarla: ${e.message}`)
    }
  }

  // El candado se levanta DESPUÉS de sellar, y sólo para las que se pudieron sellar. Al revés, una
  // pestaña quedaría destrabada y sin referencia: el peor de los dos estados.
  const aLevantar = hojas.filter((t) => porTab.has(t) && !fallaron.includes(t))
  if (aLevantar.length) {
    const { rowCount } = await query(
      'delete from sheet_pestanas_bloqueadas where file_id = $1 and pestana = any($2)', [ID, aLevantar])
    console.log(`\n🔓 ${rowCount} candado(s) levantado(s): ${aLevantar.join(', ')}`)
  }
  if (fallaron.length) console.log(`\n⚠ ${fallaron.length} pestaña(s) sin sellar — su candado NO se tocó: ${fallaron.join(', ')}`)
  console.log(`\n${sellados}/${hojas.length} pestañas adoptadas. Los generadores siguen actualizando los números;`)
  console.log('lo que escribas a mano vuelve a proteger la pestaña en cuanto la firma difiera.')
}

main().then(() => process.exit(0)).catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
