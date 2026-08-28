#!/usr/bin/env node
// UNA SOLA CORRIDA DE TESTS POR MÁQUINA — el envoltorio que hace cumplir el candado.
//
// Corre el comando que se le pase, pero sólo cuando no hay otra corrida viva en esta máquina. Si la
// hay, ESPERA y lo dice; no falla, porque el que espera no hizo nada mal.
//
// El criterio de por qué existe está en lib/candado-de-corrida.mjs, con las mediciones. Acá está
// sólo lo que toca el disco y los procesos.
//
//   node orquestador/scripts/una-corrida-por-maquina.mjs npm run orq:test:corrida
//   ORQ_SIN_CANDADO=1 …   → lo saltea (para depurar el candado mismo, no para apurar una corrida)

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { avisoDeEspera, contenidoDelCandado, estadoDelCandado } from '../lib/candado-de-corrida.mjs'

export const RUTA = process.env.ORQ_CANDADO_TESTS
  || path.join(os.tmpdir(), 'echegaray-orq-test.lock')

/** Si el proceso existe. `kill(pid, 0)` no manda ninguna señal: sólo pregunta. */
export function pidVive(pid) {
  try { process.kill(pid, 0); return true } catch (e) { return e?.code === 'EPERM' }
}

const leer = () => { try { return fs.readFileSync(RUTA, 'utf8') } catch { return null } }

/** Intenta tomar el candado. `true` si quedó nuestro. La creación con 'wx' es atómica. */
function tomar() {
  const r = estadoDelCandado(leer(), { vivo: pidVive })
  if (r.estado === 'tomado') return r
  if (r.estado === 'huerfano') {
    console.error(`  ⚠ candado abandonado (${r.porQue}): lo suelto.`)
    try { fs.unlinkSync(RUTA) } catch { /* otro lo soltó primero: mejor */ }
  }
  try {
    fs.writeFileSync(RUTA, contenidoDelCandado({ pid: process.pid, quien: process.argv.slice(2).join(' ') }), { flag: 'wx' })
    return null
  } catch { return estadoDelCandado(leer(), { vivo: pidVive }) }
}

async function main() {
  const cmd = process.argv.slice(2)
  if (!cmd.length) { console.error('uso: una-corrida-por-maquina.mjs <comando…>'); process.exit(2) }
  if (process.env.ORQ_SIN_CANDADO !== '1') {
    let avisado = false
    for (;;) {
      const ocupado = tomar()
      if (!ocupado) break
      // El aviso sale UNA vez: repetirlo cada dos segundos convierte la espera en ruido.
      if (!avisado) { console.error(avisoDeEspera(ocupado)); avisado = true }
      await new Promise((r) => setTimeout(r, 2000))
    }
    const soltar = () => { try { fs.unlinkSync(RUTA) } catch { /* ya no está */ } }
    process.on('exit', soltar)
    for (const s of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(s, () => { soltar(); process.exit(130) })
  }
  const hijo = spawn(cmd[0], cmd.slice(1), { stdio: 'inherit', shell: false })
  hijo.on('exit', (code, señal) => process.exit(señal ? 130 : (code ?? 1)))
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main()
