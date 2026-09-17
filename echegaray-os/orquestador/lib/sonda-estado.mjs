// DÓNDE GUARDA LA SONDA LO QUE VIO — y por qué el pipeline también lo lee.
//
// La lectura anterior de «Qué hacer» es la única forma de distinguir un borrado del dueño de una fila
// nueva sin fórmula (ver `proveedores-notas-hoja.mjs`). El pipeline la necesita para rescatar las
// ediciones antes de reescribir la columna, así que la ruta vive acá y no adentro del script de la sonda.
//
// FUERA DEL REPO: producción corre desde otro checkout y el estado no es código. UN ARCHIVO POR SHEET:
// una prueba contra una copia no puede mezclar su lectura anterior con la del Flujo de Caja real.
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { CASHFLOW_ID } from './cash-briefing.mjs'
import { anteriorDeJson } from './proveedores-notas-hoja.mjs'

export function rutaDelEstado(fileId = CASHFLOW_ID, env = process.env) {
  if (env.ORQ_SONDA_ESTADO) return env.ORQ_SONDA_ESTADO
  const base = join(env.XDG_STATE_HOME || join(homedir(), '.local', 'state'), 'echegaray-os')
  return join(base, fileId === CASHFLOW_ID ? 'sonda-flujo-caja.json' : `sonda-flujo-caja-${fileId}.json`)
}

export async function leerEstado(ruta) {
  try { return JSON.parse(await readFile(ruta, 'utf8')) } catch { return null }
}

/** Escritura atómica: un corte a mitad de camino no deja un JSON roto que parezca «primera lectura». */
export async function guardarEstado(ruta, e) {
  await mkdir(dirname(ruta), { recursive: true })
  await writeFile(`${ruta}.tmp`, JSON.stringify(e))
  await rename(`${ruta}.tmp`, ruta)
}

/** La lectura anterior de «Qué hacer» para un Sheet, o null si la sonda nunca lo miró. */
export async function anteriorDeLaSonda(fileId = CASHFLOW_ID) {
  return anteriorDeJson((await leerEstado(rutaDelEstado(fileId)))?.notas ?? null)
}
