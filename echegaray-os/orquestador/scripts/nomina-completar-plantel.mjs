#!/usr/bin/env node
// «Nómina» CUENTA A TODOS LOS QUE COBRARON, NO SÓLO A LOS QUE SIGUEN.
//
// ═══ QUÉ ARREGLA, MEDIDO EN EL ARCHIVO VIVO (21/09/2026) ═══
//
// El cuadro 1 listaba 17 personas y sumaba $115.912.477 de enero a agosto. En esos ocho meses se
// pagaron $182.762.688: faltaban los **22 desvinculados** ($50.098.968) y **oficina** ($24.330.363),
// más la diferencia de medición del espejo. Y el cuadro 2 tomaba ese total incompleto, le aplicaba
// las alícuotas y lo comparaba contra el F931 ENTERO —25 empleados declarados en agosto—: la fila
// «Diferencia contra F931» publicaba −$18.644.120 como desvío del modelo.
//
// No era un desvío del modelo. Con las dos poblaciones adentro, el % en blanco implícito da
// **50,3 %** contra el 50 % que el dueño tiene puesto a mano: el supuesto 50/50 estaba bien y lo que
// faltaba era gente. Ése es el resultado que este script hace visible.
//
// ═══ LO QUE ESTE SCRIPT NO HACE ═══
//
// · NO vuelve a listar a los desvinculados con nombre y apellido. El dueño ordenó *«los inactivos
//   quitar»* y esa orden no se toca: vuelve su PLATA, en un renglón agrupado.
// · NO reescribe la pestaña. «Nómina» está hecha a mano —sus cinco secciones no existen en el repo—
//   así que acá se tocan SÓLO las filas que este script declara suyas, ancladas por rótulo y nunca
//   por número de fila. Todo lo demás se lee y se deja como está.
//
//   node orquestador/scripts/nomina-completar-plantel.mjs           → dice qué escribiría
//   node orquestador/scripts/nomina-completar-plantel.mjs --aplicar → lo escribe

import { makeGoogleClient, WRITE_SCOPES, READONLY_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { detectarQuincenas } from '../lib/nomina-sync.mjs'
import { plantelDelEspejo, separarPlantel, claveNombre } from '../lib/desvinculacion-plantel.mjs'
import { devengadoPorMes, COL_OBRA } from '../lib/nomina-devengado.mjs'
import {
  devengadoDeLosQueSeFueron, ROTULO_DESVINCULADOS, ROTULO_OFICINA, ROTULO_SAC,
  celdasDesvinculados, celdasOficina, cargasDeUnGrupo, formulaDelSac, sumaDeLaColumna,
  ubicarCuadros, colMes, bloqueDeOficina, formulaBlancoMedido, NOTA_BLANCO_MEDIDO,
} from '../lib/nomina-plantel-completo.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const PESTAÑA = 'Nómina'
const APLICAR = process.argv.includes('--aplicar')
const ANIO = 2026
// EL % EN BLANCO ES DEL DUEÑO Y NO SE TOCA SOLO: sólo se escribe si esta corrida lo trae explícito.
// El 21/09/2026 lo fijó en 39 % después de confirmar que los dos jefes SÍ están en el F931, que es el
// dato que decide entre 38,6 % y 45,4 % y que no está en ninguna fuente del repositorio.
const PCT_BLANCO = (() => {
  const i = process.argv.indexOf('--blanco')
  if (i < 0) return null
  const v = Number(String(process.argv[i + 1]).replace(',', '.'))
  return Number.isFinite(v) && v > 0 && v < 1 ? v : null
})()

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: APLICAR ? WRITE_SCOPES : READONLY_SCOPES })

  // ── LO QUE SE FUE, MEDIDO CONTRA EL ESPEJO ──────────────────────────────────────────────────────
  const espejo = await google.readSheetValues(ID, '_J_OBREROS!A1:AC990')
  const bloques = detectarQuincenas(espejo ?? [])
  if (!bloques.length) { console.error('no encontré quincenas en _J_OBREROS: NO escribo'); process.exit(1) }
  const { activos, desafectados } = separarPlantel(plantelDelEspejo(espejo, bloques), bloques)
  const dev = devengadoPorMes(espejo, bloques, { anio: ANIO, clave: claveNombre, col: COL_OBRA })
  const fuera = devengadoDeLosQueSeFueron(dev, desafectados, { anio: ANIO })
  console.log(`plantel del año: ${activos.length} activo(s) · ${fuera.personas} desvinculado(s) · $${Math.round(fuera.porMes.reduce((a, b) => a + b, 0)).toLocaleString('es-AR')} que el cuadro no tenía`)
  for (const n of fuera.sinDato) console.warn(`  ▲ ${n}: sin devengado medible en el espejo — su plata NO entra en el renglón`)

  // ── DÓNDE VAN. POR RÓTULO, NUNCA POR NÚMERO DE FILA ─────────────────────────────────────────────
  const grid = await google.readSheetValues(ID, `'${PESTAÑA}'!A1:Q200`, { render: 'FORMULA' })
  const sitio = ubicarCuadros(grid)
  if (sitio.error) { console.error(`no pude ubicar los cuadros de «${PESTAÑA}»: ${sitio.error} — NO escribo`); process.exit(1) }
  console.log(`cuadro 1: personas ${sitio.uno.primera}-${sitio.uno.ultima}, total ${sitio.uno.total} · cuadro 2: personas ${sitio.dos.primera}-${sitio.dos.ultima}, total ${sitio.dos.total}`)
  if (sitio.yaEstan.length) console.log(`  ↻ ya existen y se actualizan en su lugar: ${sitio.yaEstan.join(' · ')}`)

  // ── LAS FILAS QUE ESTE SCRIPT DECLARA SUYAS ─────────────────────────────────────────────────────
  //
  // Se insertan ANTES del TOTAL de cada cuadro, de abajo hacia arriba, para que los números de fila
  // que ya resolví no se muevan mientras inserto. Google reapunta solo las fórmulas que citan filas
  // que se corren —incluido el cuadro 3, que lee el TOTAL del cuadro 1— así que el resto de la
  // pestaña no se toca.
  const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
  const nuevasUno = [ROTULO_DESVINCULADOS, ROTULO_OFICINA]
  const nuevasDos = [ROTULO_DESVINCULADOS, ROTULO_OFICINA, ROTULO_SAC]
  if (sitio.yaEstan.length) {
    console.error('  ▲ ya hay filas mías en la pestaña y este paso todavía no sabe actualizarlas en su lugar: NO escribo.')
    console.error('     Borralas a mano o decime y le agrego la actualización idempotente.')
    process.exit(1)
  }

  // EL CUADRO DE OFICINA, en la pestaña de al lado: sin él la fila de oficina no se puede anclar.
  const gridJor = await google.readSheetValues(ID, `'Jornales por Quincena'!A1:A200`)
  const bloqueOfi = bloqueDeOficina(gridJor)
  if (bloqueOfi.error) { console.error(`${bloqueOfi.error} — NO escribo`); process.exit(1) }
  console.log(`oficina en «Jornales por Quincena», filas ${bloqueOfi.desde}-${bloqueOfi.hasta}`)

  const hojas = await google.getSheetMeta(ID)
  const hoja = hojas.find((h) => h.title === PESTAÑA)
  if (!hoja) { console.error(`no encontré la pestaña «${PESTAÑA}»`); process.exit(1) }

  // Después de insertar N filas en el cuadro 1 (que está ARRIBA), todo el cuadro 2 baja N.
  const nUno = nuevasUno.length
  const p1 = { p0: sitio.uno.primera, p1: sitio.uno.ultima }
  const filasUno = { desv: sitio.uno.total, ofi: sitio.uno.total + 1, total: sitio.uno.total + nUno }
  const dosBase = sitio.dos.total + nUno
  const filasDos = { desv: dosBase, ofi: dosBase + 1, sac: dosBase + 2, total: dosBase + nuevasDos.length }
  const dosPersonas = { primera: sitio.dos.primera + nUno, ultima: sitio.dos.ultima + nUno }

  console.log(`\nescribiría:`)
  console.log(`  cuadro 1 · fila ${filasUno.desv} «${ROTULO_DESVINCULADOS}» · fila ${filasUno.ofi} «${ROTULO_OFICINA}» · TOTAL pasa a ${filasUno.total}`)
  console.log(`  cuadro 2 · filas ${filasDos.desv}-${filasDos.sac} · TOTAL pasa a ${filasDos.total}`)
  if (!APLICAR) { console.log('\n--dry: no escribo. Corré con --aplicar.'); return }

  await google.spreadsheetBatchUpdate(ID, [
    // De abajo hacia arriba.
    { insertDimension: { range: { sheetId: hoja.sheetId, dimension: 'ROWS', startIndex: sitio.dos.total - 1, endIndex: sitio.dos.total - 1 + nuevasDos.length }, inheritFromBefore: true } },
    { insertDimension: { range: { sheetId: hoja.sheetId, dimension: 'ROWS', startIndex: sitio.uno.total - 1, endIndex: sitio.uno.total - 1 + nUno }, inheritFromBefore: true } },
  ])

  const desv = celdasDesvinculados(fuera)
  const ofi = celdasOficina(MESES, { bloque: bloqueOfi })
  const filaGrupo = (rotulo, celdas, f) => [rotulo, '', '', ...celdas, `=SUM(D${f}:O${f})`]
  const filaCargas = (rotulo, fNeto, f) => [rotulo, '', '',
    ...Array.from({ length: 12 }, (_, i) => cargasDeUnGrupo(`${colMes(i + 1)}${fNeto}`)), `=SUM(D${f}:O${f})`]

  const escribir = []
  escribir.push({ rango: `A${filasUno.desv}`, filas: [filaGrupo(ROTULO_DESVINCULADOS, desv, filasUno.desv)] })
  escribir.push({ rango: `A${filasUno.ofi}`, filas: [filaGrupo(ROTULO_OFICINA, ofi, filasUno.ofi)] })
  escribir.push({ rango: `D${filasUno.total}`, filas: [Array.from({ length: 13 }, (_, i) => sumaDeLaColumna(String.fromCharCode(68 + i), sitio.uno.primera, filasUno.ofi))] })
  escribir.push({ rango: `A${filasDos.desv}`, filas: [filaCargas(ROTULO_DESVINCULADOS, filasUno.desv, filasDos.desv)] })
  escribir.push({ rango: `A${filasDos.ofi}`, filas: [filaCargas(ROTULO_OFICINA, filasUno.ofi, filasDos.ofi)] })
  // EL AGUINALDO VA EN SUS DOS MESES Y EN NINGÚN OTRO: junio y diciembre, cada uno sobre su semestre.
  const sac = Array(12).fill('')
  sac[5] = formulaDelSac({ p0: sitio.uno.primera, p1: filasUno.ofi }, [1, 2, 3, 4, 5, 6])
  sac[11] = formulaDelSac({ p0: sitio.uno.primera, p1: filasUno.ofi }, [7, 8, 9, 10, 11, 12])
  escribir.push({ rango: `A${filasDos.sac}`, filas: [[ROTULO_SAC, '', '', ...sac, `=SUM(D${filasDos.sac}:O${filasDos.sac})`]] })
  escribir.push({ rango: `D${filasDos.total}`, filas: [Array.from({ length: 13 }, (_, i) => sumaDeLaColumna(String.fromCharCode(68 + i), dosPersonas.primera, filasDos.sac))] })

  // ── Y LA CELDA QUE DECÍA 56,9 % ─────────────────────────────────────────────────────────────────
  //
  // «% en blanco medido» no medía un % en blanco, y encima estaba anclada a la CELDA J36 de la otra
  // pestaña. Ahora se mide contra el cuadro de al lado y se ancla por rótulo. El porqué completo, en
  // `formulaBlancoMedido`.
  escribir.push({ rango: `O5`, filas: [[formulaBlancoMedido({ filaTotal: filasUno.total })]] })
  escribir.push({ rango: `O6`, filas: [[NOTA_BLANCO_MEDIDO]] })
  if (PCT_BLANCO != null) {
    console.log(`  · B5 «% en blanco» pasa a ${(PCT_BLANCO * 100).toFixed(0)} %`)
    escribir.push({ rango: `B5`, filas: [[PCT_BLANCO]] })
  }

  for (const e of escribir) {
    const r = await google.updateSheetValues(ID, `'${PESTAÑA}'!${e.rango}`, e.filas)
    if (r?.protegido) console.error(`  🛡 ${e.rango}: ${r.motivo ?? 'protegido'}`)
    else console.log(`  ✓ ${e.rango}`)
  }
  console.log('\nlisto. Verificá con exportar-pestana-pdf.mjs antes de darlo por bueno.')
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
}
