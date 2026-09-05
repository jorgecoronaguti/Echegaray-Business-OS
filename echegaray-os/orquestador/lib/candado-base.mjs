// ESPERAR EL TURNO PARA ESCRIBIR EN LA BASE. El mismo candado que serializa los tests, usable
// desde cualquier script.
//
// ═══ EL DEFECTO QUE ESTE ARCHIVO CIERRA, MEDIDO EL 05/09/2026 ═══
//
// `una-corrida-por-maquina.mjs` serializa CORRIDAS DE TESTS entre sí, y eso funciona. Lo que no
// cubría es lo otro: un script del OS escribiendo en Postgres MIENTRAS la suite corre. Pasó dos
// veces seguidas — `clasificar-documentos-pendientes --aplicar` hacía UPDATE sobre
// `documento_leido` y `escritura-economica.pg.test.mjs` pedía un AccessExclusiveLock sobre la misma
// región. Postgres los mató con «deadlock detected», y el rojo no era de nadie: el código estaba
// bien y el test estaba bien.
//
// Un rojo que no es de nadie es peor que un rojo de verdad, porque entrena a ignorarlo. Y con dos
// frentes trabajando en paralelo sobre la misma VM va a volver a pasar todos los días.
//
// ═══ POR QUÉ NO ES UN CANDADO NUEVO ═══
//
// Es EL MISMO archivo en disco. Un segundo candado sería un segundo lugar donde se decide quién
// puede tocar la base, que es exactamente el problema que un candado viene a resolver.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { avisoDeEspera, contenidoDelCandado, estadoDelCandado } from './candado-de-corrida.mjs'

/** El MISMO archivo que usa el envoltorio de tests. `/tmp` fijo y no `os.tmpdir()`: cada agente y
 *  cada worktree puede tener su propio TMPDIR, y un candado por TMPDIR no serializa nada. */
export const RUTA = process.env.ORQ_CANDADO_TESTS || path.join(os.tmpdir(), 'echegaray-orq-test.lock')

const vive = (pid) => { try { process.kill(pid, 0); return true } catch (e) { return e?.code === 'EPERM' } }
const leer = () => { try { return fs.readFileSync(RUTA, 'utf8') } catch { return null } }

/**
 * Espera a que no haya una corrida de tests viva y toma el turno.
 *
 * @param {{quien?:string, esperaMaxMs?:number, avisar?:(s:string)=>void}} opts
 * @returns {Promise<()=>void>} la función que suelta el turno. SIEMPRE hay que llamarla.
 */
export async function toma({ quien = 'script', esperaMaxMs = 15 * 60 * 1000, avisar = console.error } = {}) {
  if (process.env.ORQ_SIN_CANDADO === '1') return () => {}
  const hasta = Date.now() + esperaMaxMs
  let avisado = false
  for (;;) {
    const r = estadoDelCandado(leer(), { vivo: vive })
    if (r.estado === 'huerfano') { try { fs.unlinkSync(RUTA) } catch { /* otro lo soltó */ } }
    if (r.estado !== 'tomado') {
      try {
        fs.writeFileSync(RUTA, contenidoDelCandado({ pid: process.pid, quien }), { flag: 'wx' })
        break
      } catch { /* alguien ganó la carrera: se vuelve a mirar */ }
    } else if (!avisado) { avisar(avisoDeEspera(r)); avisado = true }
    // Esperar es lo correcto, pero no para siempre: un script de mantenimiento colgado media hora
    // es peor que uno que dice que no pudo.
    if (Date.now() > hasta) throw new Error(`no se pudo tomar el turno de base en ${Math.round(esperaMaxMs / 1000)} s: hay una corrida viva`)
    await new Promise((r2) => setTimeout(r2, 2000))
  }
  let soltado = false
  const soltar = () => { if (soltado) return; soltado = true; try { fs.unlinkSync(RUTA) } catch { /* ya no está */ } }
  process.on('exit', soltar)
  return soltar
}

/** Envuelve una función: toma el turno, la corre y lo suelta pase lo que pase. */
export async function conTurno(quien, fn) {
  const soltar = await toma({ quien })
  try { return await fn() } finally { soltar() }
}
