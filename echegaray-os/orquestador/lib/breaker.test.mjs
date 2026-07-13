#!/usr/bin/env node
// Test del semáforo de concurrencia y del circuit breaker (lib/breaker.mjs).
// Hermético: sin red, sin DB. exit 0 = OK, exit 1 = falla.
import { createSemaphore, createBreaker, BreakerOpenError } from './breaker.mjs'

let ok = 0
let fail = 0
function check(nombre, cond) {
  if (cond) ok++
  else { fail++; console.error(`FALLA: ${nombre}`) }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  // --- Semáforo: nunca supera el máximo de concurrencia ---
  {
    const sem = createSemaphore(2)
    let running = 0
    let peak = 0
    const task = async () => sem.run(async () => {
      running++
      peak = Math.max(peak, running)
      await sleep(10)
      running--
      return true
    })
    await Promise.all([task(), task(), task(), task(), task()])
    check('semáforo: pico de concurrencia <= 2', peak <= 2)
    check('semáforo: liberado al final', sem.inUse === 0 && sem.pending === 0)
  }

  // --- Breaker: abre tras N fallos consecutivos y corta en corto ---
  {
    let t = 1000
    const brk = createBreaker({ threshold: 3, cooldownMs: 100, now: () => t })
    brk.assertClosed() // cerrado al inicio (no lanza)
    brk.onFailure(); brk.onFailure()
    check('breaker: sigue cerrado antes del umbral', brk.state === 'closed')
    brk.onFailure() // 3er fallo -> abre
    check('breaker: abre al alcanzar el umbral', brk.state === 'open')
    let threw = false
    try { brk.assertClosed() } catch (e) { threw = e instanceof BreakerOpenError }
    check('breaker: assertClosed lanza BreakerOpenError abierto', threw)
    // avanzar el reloj más allá del cooldown
    t += 200
    check('breaker: vuelve a cerrado tras cooldown', brk.state === 'closed')
    brk.onSuccess()
    check('breaker: onSuccess resetea contador', brk.consecutiveFailures === 0)
  }

  // --- Breaker: un fallo HARD (credencial) abre de inmediato ---
  {
    let t = 5000
    const brk = createBreaker({ threshold: 10, cooldownMs: 100, now: () => t })
    brk.onFailure({ hard: true })
    check('breaker: fallo hard abre inmediato', brk.state === 'open')
    check('breaker: cooldown hard extendido (2x)', brk.openUntil === 5000 + 200)
  }

  console.log(`breaker.test: ${ok} OK, ${fail} FALLA`)
  process.exit(fail ? 1 : 0)
}

main().catch((e) => { console.error('breaker.test abortó:', e); process.exit(1) })
