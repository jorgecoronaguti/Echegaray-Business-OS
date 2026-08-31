// EL BANCO DE MUTACIONES — sólo para los tests negativos.
//
// ═══ POR QUÉ HACE FALTA ESTO Y NO ALCANZA UN `mock` ═══
//
// Un módulo ES no se puede parchear desde afuera: su namespace es de sólo lectura, y aunque se
// pudiera, `motor.mjs` ya tiene su import resuelto y seguiría llamando al original. Un test que
// "muta" así no muta nada y da verde creyendo que probó algo.
//
// Acá la mutación es de VERDAD: se clona el árbol del motor a una carpeta descartable, se parchea
// el TEXTO de un archivo, y se importa el clon. La copia queda a la misma profundidad que el
// original (`lib/motores/<clon>/`) para que `../../google.mjs` resuelva igual, y se borra siempre.
//
// ═══ QUÉ PRUEBA ═══
//
// Que cada guarda PUEDE dar rojo. Este repo ya tuvo un control que era una constante y escondía
// $4,1 M, y una «MUTACIÓN QUE LO PONE ROJO» declarada en un comentario que nadie corrió — 3 de 4
// resultaron falsas. Una mutación que no se ejecuta no es evidencia de nada.

import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const AQUI = path.dirname(new URL(import.meta.url).pathname)
const MOTORES = path.join(AQUI, '..')

/** Clona el motor a una carpeta descartable. NO copia los `.test.mjs`: si los copiara, `orq:test`
 *  los recogería del clon y correría la suite dos veces (y sobre código mutado). */
function clonar() {
  const destino = path.join(MOTORES, `.mutante-${process.pid}-${Math.random().toString(36).slice(2, 8)}`)
  const copiar = (de, a) => {
    fs.mkdirSync(a, { recursive: true })
    for (const e of fs.readdirSync(de, { withFileTypes: true })) {
      if (e.isDirectory()) { copiar(path.join(de, e.name), path.join(a, e.name)); continue }
      if (e.name.endsWith('.test.mjs')) continue
      fs.copyFileSync(path.join(de, e.name), path.join(a, e.name))
    }
  }
  copiar(AQUI, destino)
  return destino
}

/**
 * Corre `fn` contra un motor con UNA línea cambiada, y borra el clon pase lo que pase.
 *
 * @param {{archivo:string, de:string, a:string}} mutacion `de` tiene que aparecer EXACTAMENTE una
 *        vez: si el código cambia y la mutación deja de aplicar, esto grita en vez de correr un
 *        test que ya no muta nada — que es la forma en que una mutación se vuelve decorativa.
 * @param {(motor:object)=>Promise<unknown>} fn
 */
export async function conMutacion({ archivo, de, a }, fn) {
  const dir = clonar()
  try {
    const ruta = path.join(dir, archivo)
    const src = fs.readFileSync(ruta, 'utf8')
    const veces = src.split(de).length - 1
    if (veces !== 1) throw new Error(`la mutación sobre ${archivo} aparece ${veces} veces, tiene que aparecer 1. ¿Cambió el código?`)
    // `() => a` y no `a`: en un reemplazo de `String.replace`, `$'`, `$&` y `$1` son patrones
    // especiales. Una mutación que toque un `replace('$', '')` —hay varias en `direcciones.mjs`—
    // se corrompería y el clon no compilaría, y el test lo reportaría como "la guarda no se
    // desactivó" en vez de como lo que es: un bug de este archivo. Ya pasó.
    fs.writeFileSync(ruta, src.replace(de, () => a))
    return await fn(await import(pathToFileURL(path.join(dir, 'motor.mjs')).href))
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}
