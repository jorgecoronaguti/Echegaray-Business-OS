#!/usr/bin/env node
// INSTALA LOS PESOS DE «DICTAR PARTE» EN LA VM — la revisión fijada, con su sha256 verificado.
//
//   node orquestador/scripts/voz-instalar-modelo.mjs                 # baja de Hugging Face (670 MB)
//   node orquestador/scripts/voz-instalar-modelo.mjs --desde <dir>   # copia una carpeta local ya bajada
//   node orquestador/scripts/voz-instalar-modelo.mjs --verificar     # sólo controla lo instalado
//
// Idempotente: un archivo que ya está y coincide no se vuelve a bajar. Uno que NO coincide se borra
// y se vuelve a traer: un peso cambiado en silencio es otro modelo, y el WER medido no vale para él.
// Al terminar deja `VERIFICADO` en la carpeta; sin esa constancia el worker no toma audios.
//
// Baja SÓLO de huggingface.co, por la URL de la revisión exacta (`/resolve/<sha>/`), nunca de `main`.

import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream, existsSync, mkdirSync, copyFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import { MODELO_DICTADO, carpetaDelModelo } from '../lib/ml/voz.mjs'

const args = process.argv.slice(2)
const desde = args.includes('--desde') ? args[args.indexOf('--desde') + 1] : null
const soloVerificar = args.includes('--verificar')

async function sha256(archivo) {
  const h = createHash('sha256')
  await pipeline(createReadStream(archivo), h)
  return h.digest('hex')
}

async function main() {
  const dir = carpetaDelModelo()
  mkdirSync(dir, { recursive: true })
  const informe = []
  for (const [archivo, esperado] of Object.entries(MODELO_DICTADO.archivos)) {
    const destino = join(dir, archivo)
    if (existsSync(destino) && await sha256(destino) === esperado) { informe.push(`✓ ${archivo} ya estaba`); continue }
    if (soloVerificar) { informe.push(`✖ ${archivo} falta o no coincide`); continue }
    rmSync(destino, { force: true })
    const tmp = `${destino}.parcial`
    if (desde) copyFileSync(join(desde, archivo), tmp)
    else {
      const url = `https://huggingface.co/${MODELO_DICTADO.id}/resolve/${MODELO_DICTADO.revision}/${archivo}`
      const r = await fetch(url)
      if (!r.ok || !r.body) throw new Error(`Hugging Face contestó ${r.status} para ${archivo}`)
      await pipeline(Readable.fromWeb(r.body), createWriteStream(tmp))
    }
    const real = await sha256(tmp)
    if (real !== esperado) { rmSync(tmp, { force: true }); throw new Error(`${archivo}: sha256 ${real} ≠ ${esperado}. No se instala.`) }
    renameSync(tmp, destino)
    informe.push(`✓ ${archivo} instalado y verificado`)
  }
  const ok = informe.every((l) => l.startsWith('✓'))
  if (ok) writeFileSync(join(dir, 'VERIFICADO'), `${MODELO_DICTADO.id}@${MODELO_DICTADO.revision}\n${new Date().toISOString()}\n${MODELO_DICTADO.atribucion}\n`)
  process.stdout.write(`${informe.join('\n')}\n${ok ? `listo en ${dir}` : 'INCOMPLETO'}\n`)
  process.exitCode = ok ? 0 : 1
}

main().catch((e) => { process.stderr.write(`✖ ${e.message}\n`); process.exitCode = 1 })
