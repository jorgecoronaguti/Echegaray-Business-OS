// EL DWG: LO QUE SE PUEDE HACER HOY Y LO QUE FALTA, DICHO SIN ADORNOS.
//
// ═══ EL ESTADO REAL, MEDIDO EN LA VM ═══
//
// El `.dwg` es un formato BINARIO, cerrado y propiedad de Autodesk. No se parsea con doscientas
// líneas como el DXF: hay que convertirlo. Los tres conversores locales que sirven —`dwg2dxf` y
// `dwgread` de LibreDWG, y el ODA File Converter— NO están instalados en esta máquina, y este
// worktree no puede instalar nada.
//
// Por eso este módulo NO promete leer DWG. Hace tres cosas, y las tres son honestas:
//
//   1. DETECTA si hay un conversor disponible, buscándolo en el PATH.
//   2. SI LO HAY, convierte solo y el usuario no se entera — que es el requisito: nadie tiene que
//      exportar un DXF a mano.
//   3. SI NO LO HAY, devuelve un hueco con nombre, con qué instalar y con qué archivo quedó sin
//      leer. Un `.dwg` que se ignora en silencio es un plano entero que no entró a la cotización.
//
// ═══ POR QUÉ NO SE RESUELVE MANDÁNDOLO A UN SERVICIO WEB ═══
//
// Existen conversores en la nube. Subir el plano de un cliente a un servicio de terceros es una
// decisión con efecto contractual y de confidencialidad, no una decisión técnica, y no la toma este
// archivo. Queda anotada como alternativa y con dueño.

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const ejecutar = promisify(execFile)

/** Los conversores que este módulo sabe manejar, en orden de preferencia. `dwg2dxf` primero porque
 *  es libre, local y no pide licencia; el de ODA es el más fiel pero es propietario. */
export const CONVERSORES = Object.freeze([
  { comando: 'dwg2dxf', paquete: 'libredwg (apt: libredwg-tools)', libre: true, argumentos: (entrada, salida) => ['-o', salida, entrada] },
  { comando: 'dwgread', paquete: 'libredwg (apt: libredwg-tools)', libre: true, argumentos: (entrada, salida) => ['-O', 'DXF', '-o', salida, entrada] },
  { comando: 'ODAFileConverter', paquete: 'ODA File Converter (descarga manual, propietario)', libre: false, argumentos: null },
])

/** ¿Está este comando en el PATH? Devuelve la ruta o null. No lanza: la ausencia es un dato. */
export async function existeComando(comando) {
  try {
    const { stdout } = await ejecutar('which', [comando])
    const ruta = String(stdout).trim()
    return ruta || null
  } catch { return null }
}

/** Qué conversores hay disponibles en esta máquina, ahora. */
export async function conversoresDisponibles() {
  const salida = []
  for (const c of CONVERSORES) {
    const ruta = await existeComando(c.comando)
    if (ruta) salida.push({ ...c, ruta })
  }
  return salida
}

/**
 * CONVERTIR UN DWG A DXF. Automático cuando se puede; declarado cuando no.
 *
 * Devuelve `{ ok: true, dxf, conversor }` o `{ ok: false, porQue, comoSeResuelve, alternativas }`.
 * Nunca lanza y nunca devuelve un DXF vacío haciéndolo pasar por una conversión exitosa: un archivo
 * de cero bytes leído como plano da un cómputo de cero, y un cómputo de cero no se distingue de un
 * galpón que no existe.
 */
export async function convertirADxf(rutaDwg, { directorio = null } = {}) {
  const disponibles = await conversoresDisponibles()
  if (!disponibles.length) {
    return {
      ok: false,
      archivo: path.basename(String(rutaDwg ?? '')),
      porQue: 'el .dwg es binario y cerrado, y en esta máquina no hay ningún conversor instalado',
      comoSeResuelve: 'instalar `libredwg-tools` (libre, local, sin licencia) — a partir de ahí la conversión es automática y nadie exporta nada a mano',
      alternativas: [
        { que: 'pedirle al cliente el DXF además del DWG', costo: 'cero, y suele estar', quienDecide: 'quien habla con el cliente' },
        { que: 'usar un conversor en la nube', costo: 'sube el plano del cliente a un tercero', quienDecide: 'el dueño — es confidencialidad, no una decisión técnica' },
        { que: 'leer el PDF del mismo plano si existe', costo: 'se pierde la geometría exacta y hay que mirarlo con visión', quienDecide: 'automático: el circuito ya lo hace' },
      ],
      estado: 'REQUIERE_CONVERSION',
    }
  }
  const conversor = disponibles.find((c) => c.argumentos) ?? disponibles[0]
  if (!conversor.argumentos) {
    return { ok: false, archivo: path.basename(String(rutaDwg ?? '')), porQue: `${conversor.comando} está instalado pero este módulo no sabe invocarlo todavía`, comoSeResuelve: 'agregar sus argumentos en CONVERSORES', estado: 'REQUIERE_CONVERSION' }
  }
  const destino = path.join(directorio ?? fs.mkdtempSync(path.join(os.tmpdir(), 'xsas-dwg-')), `${path.basename(String(rutaDwg), path.extname(String(rutaDwg)))}.dxf`)
  try {
    await ejecutar(conversor.comando, conversor.argumentos(rutaDwg, destino), { timeout: 120000 })
  } catch (e) {
    return { ok: false, archivo: path.basename(String(rutaDwg ?? '')), porQue: `${conversor.comando} falló: ${String(e?.message ?? e).slice(0, 200)}`, comoSeResuelve: 'revisar la versión del DWG — LibreDWG no soporta todas', estado: 'NO_LEGIBLE' }
  }
  const tamano = fs.existsSync(destino) ? fs.statSync(destino).size : 0
  if (tamano < 64) {
    return { ok: false, archivo: path.basename(String(rutaDwg ?? '')), porQue: `la conversión terminó sin error pero produjo un DXF de ${tamano} bytes: eso no es un plano`, comoSeResuelve: 'probar otro conversor o pedir el DXF al cliente', estado: 'NO_LEGIBLE' }
  }
  return { ok: true, dxf: destino, bytes: tamano, conversor: conversor.comando, estado: 'LEIDO' }
}
