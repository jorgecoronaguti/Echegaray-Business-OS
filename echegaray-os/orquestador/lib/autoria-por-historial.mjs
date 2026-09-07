// ¿ESTE TEXTO LO ESCRIBÍ YO? LA PRUEBA ESTÁ EN EL HISTORIAL, NO EN MI PALABRA.
//
// ═══ EL PROBLEMA (06/09/2026) ═══
//
// La Regla 0 protege lo que el dueño escribe, y la prueba de que una celda es MÍA es la huella que
// el generador dejó al escribirla. Funciona — salvo para lo que se escribió ANTES de que la huella
// existiera. Esas celdas quedan huérfanas: el generador las trata como del dueño («nunca fue mía y
// tiene algo tuyo: no la piso») y nadie las puede limpiar nunca.
//
// Medido el 06/09 en «Proveedores», después de enchufar el podador: ocho párrafos que el contrato
// prohíbe siguieron en la pestaña por esto. Ninguno lo escribió el dueño; los escribí yo, en
// corridas viejas, y quedé sin forma de probarlo.
//
// ═══ LA PRUEBA QUE SÍ EXISTE ═══
//
// El repositorio guarda cada línea que escribió cada generador. Si un texto aparece en el historial
// de `orquestador/` es porque salió de un generador mío: el dueño no edita este repositorio, edita su
// planilla. `git log -S` contesta exactamente eso —«¿en qué commit apareció o desapareció esta
// cadena?»— y es verificable por cualquiera que corra el mismo comando.
//
// LO QUE **NO** PRUEBA: que el dueño no la haya editado DESPUÉS. Por eso la coincidencia tiene que
// ser EXACTA sobre el texto entero. Un texto que el dueño tocó deja de coincidir y vuelve a estar
// protegido, que es el lado por el que este control tiene que fallar.

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const ejecutar = promisify(execFile)

/** El texto, listo para viajar como argumento de `git log -S`. Sin recortes: la coincidencia es exacta. */
export function normalizarParaBuscar(texto) {
  return String(texto ?? '').replace(/\s+/g, ' ').trim()
}

/**
 * ¿Este texto YA NO está en el código de hoy? La prueba de que una celda es RESIDUO y no dato vivo.
 *
 * Hace falta para las celdas con fórmula. Una fórmula que el generador sigue escribiendo es la que
 * publica el número: borrarla se lleva puesto el cálculo. Una que ya no está en ninguna línea del
 * repositorio no la escribe nadie — es la versión vieja que sobrevivió a un cambio de forma, como el
 * aviso de 190 caracteres del bloque de ARCA que se acortó y quedó publicado igual.
 *
 * @returns {Promise<boolean>} true si el texto NO aparece en el árbol actual
 */
export async function yaNoEstaEnElCodigo(texto, { ruta = 'orquestador/', cwd = process.cwd(), correr = ejecutar } = {}) {
  const t = normalizarParaBuscar(texto)
  if (t.length < 60) return false
  try {
    await correr('git', ['grep', '-qF', '--', t, '--', ruta], { cwd, maxBuffer: 4 << 20 })
    return false                              // salida 0 = lo encontró: sigue vivo
  } catch (e) {
    // `git grep` sale 1 cuando no hay coincidencias. Cualquier otro código es un problema de la
    // herramienta, y ahí no se puede afirmar nada: se responde que NO es residuo (fail-closed).
    return e?.code === 1
  }
}

/**
 * ¿Este texto salió alguna vez de un generador de este repositorio?
 *
 * @param {string} texto el contenido de la celda
 * @param {{ruta?:string, cwd?:string, correr?:Function}} opciones `correr` se inyecta en los tests
 * @returns {Promise<{mio:boolean, commit:string|null, porQue:string}>}
 */
export async function loEscribioElOS(texto, { ruta = 'orquestador/', cwd = process.cwd(), correr = ejecutar } = {}) {
  const t = normalizarParaBuscar(texto)
  // Un texto corto coincide con cualquier cosa y no prueba nada. El piso es el mismo tope que separa
  // un rótulo de una nota: por debajo de eso no hay párrafo que reclamar.
  if (t.length < 60) return { mio: false, commit: null, porQue: 'demasiado corto para probar autoría' }
  try {
    const { stdout } = await correr('git', ['log', '--format=%H', '-S', t, '--', ruta], { cwd, maxBuffer: 4 << 20 })
    const commits = stdout.split('\n').filter(Boolean)
    return commits.length
      ? { mio: true, commit: commits[0], porQue: `aparece en el historial de ${ruta} (${commits.length} commit(s), el último ${commits[0].slice(0, 8)})` }
      : { mio: false, commit: null, porQue: `no aparece en el historial de ${ruta}: no puedo probar que sea mía` }
  } catch (e) {
    // Sin historial la prueba no se puede hacer, y no poder verificar NUNCA es permiso para borrar.
    return { mio: false, commit: null, porQue: `no pude consultar el historial (${e.message}): sin prueba no se toca` }
  }
}
