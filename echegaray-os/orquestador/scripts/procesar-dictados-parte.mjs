#!/usr/bin/env node
// LA COLA DE «DICTAR PARTE» (ERP Obras › Parte diario). Cada 15 s por `echegaray-dictados-parte.timer`.
//
// Toma los audios que el jefe grabó desde app.ecsas.com.ar, los transcribe EN LA VM (parakeet,
// sherpa-onnx: el audio no sale de la empresa) y deja la PROPUESTA de parte en `parte_dictado`.
// No guarda el parte: eso lo hace la persona al tocar «Guardar parte».
//
//   node orquestador/scripts/procesar-dictados-parte.mjs            # una vuelta
//   node orquestador/scripts/procesar-dictados-parte.mjs --health   # ¿puede trabajar?
//
// Una vuelta sin audios en la cola no carga el modelo: pregunta a la base y sale (~1 s).

import { accesoAStorage, bajarDeStorage } from '../lib/storage-supabase.mjs'
import { verificarModelo, cargarDictado, transcribirWav, MODELO_DICTADO } from '../lib/ml/voz.mjs'
import { BUCKET_DICTADOS, drenarDictados } from '../lib/dictado-parte.mjs'
import { completarConModelo, encendido } from '../lib/ml/voz-parte-llm.mjs'

const args = process.argv.slice(2)
const json = args.includes('--json')

function faltantes() {
  const falta = []
  if (!process.env.DATABASE_URL) falta.push('DATABASE_URL')
  const s = accesoAStorage(process.env)
  if (!s.ok) falta.push(s.falta)
  falta.push(...verificarModelo())
  return falta
}

async function main() {
  const falta = faltantes()
  if (args.includes('--health')) {
    const salida = { ok: falta.length === 0, falta, modelo: `${MODELO_DICTADO.id}@${MODELO_DICTADO.revision.slice(0, 12)}`, llm: encendido() ? 'encendido' : 'apagado' }
    process.stdout.write(json ? `${JSON.stringify(salida, null, 2)}\n` : (salida.ok ? `✔ listo · ${salida.modelo} · modelo de lenguaje ${salida.llm}\n` : `✖ falta: ${falta.join(' · ')}\n`))
    process.exitCode = salida.ok ? 0 : 1
    return
  }
  if (falta.length) {
    // Salir 0: una configuración pendiente no es una falla del servicio (misma decisión que comprobantes-web).
    process.stdout.write(`↷ no proceso nada: falta ${falta.join(' · ')}\n`)
    return
  }
  const db = await import('../lib/db.mjs')
  const port = { query: (...a) => db.query(...a) }
  const completar = encendido()
    ? async (p, ctx) => completarConModelo(p, ctx, { pedirTexto: (await import('../lib/ia/cliente.mjs')).pedirTexto })
    : null
  try {
    const r = await drenarDictados({
      port,
      bajar: (path) => bajarDeStorage({ bucket: BUCKET_DICTADOS, path, mediaType: 'audio/wav' }),
      cargarMotor: () => cargarDictado(),
      transcribir: transcribirWav,
      completar,
      log: (m) => process.stdout.write(`${m}\n`),
    })
    if (r.motorCargado) {
      process.stdout.write(`modelo cargado en ${r.msCarga} ms · RSS ${Math.round(process.memoryUsage().rss / 1e6)} MB · pico ${Math.round(process.resourceUsage().maxRSS / 1024)} MB\n`)
    }
    if (json) process.stdout.write(`${JSON.stringify(r)}\n`)
  } finally {
    await db.closePool?.()
  }
}

main().catch((e) => { process.stderr.write(`✖ ${e?.stack ?? e}\n`); process.exitCode = 1 })
