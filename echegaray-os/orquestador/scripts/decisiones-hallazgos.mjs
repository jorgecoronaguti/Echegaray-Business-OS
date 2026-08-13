#!/usr/bin/env node
// QUÉ HALLAZGOS TIENEN DECISIÓN DEL DUEÑO, Y SI ALGUNA ESTÁ ROTA.
//
// El registro es un JSON versionado en git (`orquestador/decisiones-del-dueno.json`) y se edita a
// mano: una decisión del dueño es un hecho de negocio, no un formulario. Lo que este comando aporta
// es lo que un editor de texto no puede dar — que el archivo VALGA: que cada entrada tenga autoridad,
// fecha, texto y forma del dato, y que apunte a un control que existe de verdad. Una decisión con el
// nombre del control mal escrito no da error en ningún lado: simplemente no se aplica nunca, y el
// aviso vuelve sin que nadie entienda por qué.
//
//   node orquestador/scripts/decisiones-hallazgos.mjs            # listar y validar
//   node orquestador/scripts/decisiones-hallazgos.mjs --json     # para otro programa
//
// Sale con código ≠0 si alguna entrada no se puede usar.

import { CONTROLES, RUTA_REGISTRO, leerRegistro, problemasDe, formaDe, huellaDe } from '../lib/decisiones-hallazgos.mjs'

const ddmmaa = (iso) => `${String(iso).slice(8, 10)}/${String(iso).slice(5, 7)}/${String(iso).slice(0, 4)}`

/** NÚCLEO PURO: el estado de cada entrada del registro. */
export function auditar(registro, controlesVivos = Object.values(CONTROLES)) {
  return (registro.decisiones ?? []).map((d) => {
    const problemas = problemasDe(d)
    // Un control que no existe es el modo de falla silencioso de este archivo: la decisión queda
    // cargada, se ve prolija en el diff y no libera nada.
    if (!problemas.length && !controlesVivos.includes(String(d.control))) {
      problemas.push(`el control "${d.control}" no existe: ningún generador pide veredicto con ese nombre`)
    }
    return { decision: d, problemas }
  })
}

function main() {
  const registro = leerRegistro()
  if (registro._error) {
    console.error(`✖ no pude leer ${RUTA_REGISTRO}: ${registro._error}`)
    console.error('  Mientras no se lea, NINGÚN hallazgo queda silenciado: todos vuelven a avisar.')
    process.exit(1)
  }
  const filas = auditar(registro)
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(filas, null, 2))
    process.exitCode = filas.some((f) => f.problemas.length) ? 1 : 0
    return
  }
  console.log(`DECISIONES DEL DUEÑO SOBRE HALLAZGOS DE CONTROL — ${filas.length} en ${RUTA_REGISTRO}\n`)
  const porControl = new Map()
  for (const f of filas) {
    const k = String(f.decision.control)
    if (!porControl.has(k)) porControl.set(k, [])
    porControl.get(k).push(f)
  }
  for (const [control, xs] of porControl) {
    console.log(`${control}  (${xs.length})`)
    for (const { decision: d, problemas } of xs) {
      console.log(`   ${problemas.length ? '✖' : '·'} ${String(d.clave).padEnd(18)} ${formaDe(d.forma ?? {})}`)
      console.log(`     "${d.decision}" — ${d.quien}, ${ddmmaa(d.cuando)}${d.hasta ? ` (hasta ${ddmmaa(d.hasta)})` : ''}  [${huellaDe(d.forma ?? {})}]`)
      for (const p of problemas) console.log(`     ✖ ${p}`)
    }
    console.log('')
  }
  const rotas = filas.filter((f) => f.problemas.length)
  if (rotas.length) {
    console.log(`✖ ${rotas.length} entrada(s) NO se pueden usar: sus hallazgos siguen avisando.`)
    process.exitCode = 1
  } else {
    console.log('✓ todas las entradas se pueden usar. Los hallazgos que cubren se cuentan y se listan, sin ocupar la línea de aviso.')
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main()
