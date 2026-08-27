#!/usr/bin/env node
// LA TERCERA CARA — usar el OS desde Claude Code / la terminal.
//
// La arquitectura del proyecto dice "web + chat + Claude Code sobre UN núcleo", pero Claude Code
// nunca tuvo puerta de entrada: cada consulta desde acá se hacía con un `node -e` improvisado o un
// `curl` al endpoint. Eso significaba re-escribir la llamada cada vez y, peor, poder equivocarse en
// el nombre de una tabla y creerle al resultado.
//
// Esto expone EXACTAMENTE las mismas capacidades que usa el chat, con los mismos nombres. Si acá da
// un número, el chat da el mismo: no hay una segunda implementación que pueda divergir.
//
// Uso:
//   node orquestador/os.mjs list                        → todas las capacidades
//   node orquestador/os.mjs list caja                   → las que matcheen "caja"
//   node orquestador/os.mjs <capacidad>                 → la ejecuta sin argumentos
//   node orquestador/os.mjs <capacidad> '{"json":1}'    → con argumentos
//   node orquestador/os.mjs <capacidad> --json          → salida JSON cruda (para pipear)
//
// COSTO: 0 API. Ejecuta la capacidad directo, sin pasar por el modelo. Para preguntar en lenguaje
// natural está el chat; esto es para ejecutar algo puntual y verificarlo.
import { makeGoogleClient, WORKSPACE_SCOPES } from './lib/google.mjs'
import { operadorPara, getTokenFor } from './lib/google-oauth.mjs'
import { loadConfig } from './lib/config.mjs'
import { closePool } from './lib/db.mjs'

// Las mismas familias de tools que registra el servidor interactivo.
import { driveReadTools } from './lib/tools/drive.mjs'
import { driveWriteTools } from './lib/tools/drive-write.mjs'
import { osDataTools } from './lib/tools/os-data.mjs'
import { jornalesTools } from './lib/tools/jornales-tool.mjs'
import { certificacionesTools } from './lib/tools/certificaciones-tool.mjs'
import { comprasTools } from './lib/tools/compras-tool.mjs'
import { cuitTools } from './lib/tools/cuit-tool.mjs'
import { obligacionesTools } from './lib/tools/obligaciones-tool.mjs'
import { adicionalesTools } from './lib/tools/adicionales-tool.mjs'
import { legajosTools } from './lib/tools/legajos-tool.mjs'
import { pylTools } from './lib/tools/pyl-tool.mjs'
import { cotizacionesTools } from './lib/tools/cotizaciones-tool.mjs'
import { noConformidadesTools } from './lib/tools/no-conformidades-tool.mjs'
import { cajaVencidoTools } from './lib/tools/caja-vencido-tool.mjs'
import { controlAdministrativoTools } from './lib/tools/control-administrativo-tool.mjs'
import { auditarPestanaTools } from './lib/tools/auditar-pestana-tool.mjs'
import { estadoEmpresaTools } from './lib/tools/estado-empresa-tool.mjs'
import { deshacerSheetTools } from './lib/tools/deshacer-sheet-tool.mjs'
import { operacionesSheetTools } from './lib/tools/operaciones-sheet-tool.mjs'
import { reclamoCobranzaTools } from './lib/tools/reclamo-cobranza-tool.mjs'
import { cotizacionesHistorialTools } from './lib/tools/cotizaciones-historial-tool.mjs'
import { briefingCajaTools } from './lib/tools/briefing-caja-tool.mjs'
import { tesoreriaTools } from './lib/tools/tesoreria-tool.mjs'
import { ingenieriaFinancieraTools } from './lib/tools/ingenieria-financiera-tool.mjs'
import { obraTools } from './lib/tools/obra.mjs'
import { bibliotecaAreaTools } from './lib/tools/biblioteca-area-tool.mjs'
import { operatingReviewTools } from './lib/tools/operating-review-tool.mjs'
import { egresosTools } from './lib/tools/egresos-tool.mjs'
import { cargasSocialesTools } from './lib/tools/cargas-sociales-tool.mjs'
import { nominaSyncTools } from './lib/tools/nomina-sync-tool.mjs'
import { sheetRenderTools } from './lib/tools/sheet-render.mjs'
import { learnTools } from './lib/tools/learn.mjs'
import { rendimientoTools } from './lib/tools/rendimiento.mjs'
import { sheetsFormatTools } from './lib/tools/sheets-format.mjs'
import { sheetDropdownTools } from './lib/tools/sheet-dropdowns.mjs'
import { aliasPendientesTools } from './lib/tools/alias-pendientes-tool.mjs'
import { indicesTools } from './lib/tools/indices-tool.mjs'
import { rodadosTools } from './lib/tools/rodados-tool.mjs'

/** Cliente de Google con la MISMA cuenta autorizada que usa el chat (OAuth por usuario, PRP-024).
 *  Si nadie autorizó, devuelve null y las capacidades de Drive lo dicen en vez de fallar raro. */
async function googleClient() {
  try {
    const op = await operadorPara()
    if (!op) return null
    return makeGoogleClient({ config: loadConfig(), scopes: WORKSPACE_SCOPES, getToken: getTokenFor(op) })
  } catch { return null }
}

async function construirRegistro() {
  const google = await googleClient()
  return {
    ...driveReadTools(google), ...driveWriteTools(google), ...osDataTools(),
    ...jornalesTools(google), ...certificacionesTools(), ...comprasTools(), ...cuitTools(),
    ...obligacionesTools(), ...adicionalesTools(), ...legajosTools(), ...pylTools(google),
    ...cotizacionesTools(), ...noConformidadesTools(), ...cajaVencidoTools(),
    ...controlAdministrativoTools(), ...auditarPestanaTools(google), ...estadoEmpresaTools(google),
    ...deshacerSheetTools(google), ...operacionesSheetTools(google), ...reclamoCobranzaTools(google),
    ...cotizacionesHistorialTools(), ...briefingCajaTools(google), ...ingenieriaFinancieraTools(google), ...tesoreriaTools(google), ...obraTools(),
    ...bibliotecaAreaTools(), ...operatingReviewTools(), ...egresosTools(google), ...cargasSocialesTools(google), ...nominaSyncTools(google), ...sheetRenderTools(google), ...learnTools(), ...rendimientoTools(), ...sheetsFormatTools(google), ...sheetDropdownTools(google), ...aliasPendientesTools(google), ...indicesTools(), ...rodadosTools(),
  }
}

const ESCRITURA = new Set(['drive.write'])

function listar(registro, filtro) {
  const f = String(filtro || '').toLowerCase()
  const filas = Object.values(registro)
    .filter((t) => t?.schema?.name)
    .map((t) => ({
      nombre: t.schema.name,
      escribe: ESCRITURA.has(t.capability),
      desc: String(t.schema.description || '').split('.')[0],
    }))
    .filter((r) => !f || r.nombre.includes(f) || r.desc.toLowerCase().includes(f))
    .sort((a, b) => a.nombre.localeCompare(b.nombre))
  if (!filas.length) { console.log(`No hay capacidades que matcheen "${filtro}".`); return }
  console.log(`\n${filas.length} capacidad(es)${filtro ? ` con "${filtro}"` : ''} — ✏️ = escribe:\n`)
  for (const r of filas) console.log(`  ${r.escribe ? '✏️ ' : '   '}${r.nombre.padEnd(30)} ${r.desc.slice(0, 90)}`)
  console.log('\nEjecutar:  node orquestador/os.mjs <capacidad> \'{"arg":"valor"}\'\n')
}

async function main() {
  const [cmd, ...resto] = process.argv.slice(2)
  const registro = await construirRegistro()

  if (!cmd || cmd === 'list' || cmd === '--help' || cmd === '-h') {
    return listar(registro, resto.find((a) => !a.startsWith('-')))
  }

  const entry = Object.values(registro).find((t) => t?.schema?.name === cmd)
  if (!entry) {
    console.error(`No existe la capacidad "${cmd}".`)
    return listar(registro, cmd.split('_')[0])
  }

  const crudo = resto.find((a) => !a.startsWith('--'))
  let args = {}
  if (crudo) {
    try { args = JSON.parse(crudo) } catch { console.error(`El argumento tiene que ser JSON válido. Recibí: ${crudo}`); process.exitCode = 1; return }
  }

  // Las escrituras se avisan. Desde la terminal es fácil disparar sin querer algo que toca un
  // archivo real de la empresa; que no pase en silencio.
  if (ESCRITURA.has(entry.capability)) console.error(`⚠️  "${cmd}" ESCRIBE en Drive.`)

  const r = await entry.run(args)
  if (resto.includes('--json')) { console.log(JSON.stringify(r, null, 2)); return }
  // Las capacidades traen un resumen legible; si está, se muestra eso y no el JSON entero.
  const texto = r?.resumen_texto ?? r?.resumen ?? r?.propuesta
  if (typeof texto === 'string') { console.log(texto); if (r.error) console.error(`\nERROR: ${r.error}`) }
  else console.log(JSON.stringify(r, null, 2))
}

main()
  .catch((e) => { console.error(`Falló: ${String(e?.message ?? e)}`); process.exitCode = 1 })
  .finally(() => closePool().catch(() => {}))
