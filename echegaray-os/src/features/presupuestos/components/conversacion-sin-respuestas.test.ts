// EL PANEL NO PUEDE TENER UNA SOLA RESPUESTA PREESCRITA.
//
// ═══ EL DEFECTO QUE ESTE TEST IMPIDE ═══
//
// Un panel de conversación es el lugar más fácil del sistema para escribir una frase linda a mano:
// «¡Listo! Actualicé la mampostería a 520 m².» Se ve idéntica a una respuesta verdadera y no la
// verificó nadie — es una afirmación sobre el presupuesto emitida por la capa que sólo tenía que
// dibujar. Con el motor apagado seguiría apareciendo.
//
// La regla: TODO lo que el panel dice sobre el presupuesto llega en `respuesta`, que arma
// `redactar()` con lo que devolvió `ejecutar()`. Este test lo verifica por el lado que se puede
// verificar sin navegador: los TÍTULOS y los MOTIVOS que el motor produce no pueden estar escritos
// en el componente. Si alguien copia uno para «mejorar el texto», se pone rojo.
//
// El otro lado —que todo número mostrado exista en la salida del motor— lo cierra
// `orquestador/lib/cotizador/conversacion.test.mjs`. Los dos juntos son la puerta.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const AQUI = dirname(fileURLToPath(import.meta.url))

/**
 * El archivo SIN comentarios. Un comentario que explica el defecto no ES el defecto: el encabezado
 * de `Conversacion.tsx` cita «¡Listo! Actualicé la mampostería» justamente para decir por qué no se
 * escribe. Mirar el archivo crudo hacía que la explicación de la regla rompiera la regla.
 */
const sinComentarios = (s: string) => s
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .split('\n').map((l) => l.replace(/(^|\s)\/\/.*$/, '')).join('\n')

const PANEL = sinComentarios(readFileSync(join(AQUI, 'Conversacion.tsx'), 'utf8'))
const MOTOR = readFileSync(join(AQUI, '..', '..', '..', '..', 'orquestador', 'lib', 'cotizador', 'conversacion.mjs'), 'utf8')

/** Los títulos que produce `redactar()`. Se leen del motor: una lista copiada acá envejecería. */
function titulosDelMotor(): string[] {
  const bloques = MOTOR.match(/const TITULO_[A-Z]+ = Object\.freeze\(\{[\s\S]*?\}\)/g) ?? []
  const titulos = bloques.flatMap((b) => [...b.matchAll(/'([^']+)'/g)].map((m) => m[1]))
  // «Aplicado» y «No se aplicó» están sueltos en `redactar()`, no en las tablas.
  return [...new Set([...titulos, 'Aplicado', 'No se aplicó'])].filter((t) => /[A-ZÁÉÍÓÚ]/.test(t[0]) && t.length > 4)
}

describe('el formulario manda lo que se escribió (QA visual, 29/08/2026)', () => {
  // EL DEFECTO: `onSubmit={() => { campo.current.value = '' }}` limpiaba el input EN CARRERA con la
  // captura del FormData, y el servidor recibía `texto=''` siempre. Los chips de ejemplo andaban
  // porque llaman `mandar()` con el texto en la mano — por eso los tests no lo vieron: probaban el
  // único camino que no estaba roto. Sin navegador no se puede tipear, pero sí se puede exigir que
  // el orden sea el correcto, que es donde vivía el defecto.

  test('el form NO limpia el campo en onSubmit', () => {
    assert.ok(!/onSubmit=\{[^}]*value\s*=\s*''/.test(PANEL),
      'limpia el input en onSubmit: corre en carrera con la captura del FormData y manda texto vacío')
  })

  test('la limpieza va DESPUÉS de despachar la acción', () => {
    const accion = /action=\{\((?:datos|[a-z]+)[^)]*\)\s*=>\s*\{([\s\S]*?)\n\s{12}\}\}/.exec(PANEL)
    assert.ok(accion, 'no encontré la acción del formulario: el test dejó de mirar donde tenía que mirar')
    const cuerpo = accion[1]
    const despacho = cuerpo.indexOf('enviar(')
    const limpieza = cuerpo.indexOf("value = ''")
    assert.ok(despacho >= 0, 'la acción no despacha nada')
    assert.ok(limpieza >= 0, 'la acción no limpia el campo: el input queda con el texto anterior')
    assert.ok(despacho < limpieza, 'limpia el campo ANTES de despachar: se pierde lo que se escribió')
  })

  test('el foco vuelve al campo, y DESPUÉS de despachar', () => {
    const accion = /action=\{\((?:datos|[a-z]+)[^)]*\)\s*=>\s*\{([\s\S]*?)\n\s{12}\}\}/.exec(PANEL)
    assert.ok(accion, 'no encontré la acción del formulario')
    const cuerpo = accion[1]
    const foco = cuerpo.indexOf('.focus()')
    assert.ok(foco >= 0, 'el foco no vuelve al input: hay que hacer clic para escribir la frase siguiente')
    assert.ok(cuerpo.indexOf('enviar(') < foco, 'devuelve el foco antes de despachar')
  })

  test('el input tiene name=texto, que es lo que el esquema del servidor exige', () => {
    assert.match(PANEL, /name="texto"/)
    assert.match(PANEL, /name="id"/)
  })
})

describe('el panel no escribe respuestas', () => {
  test('la lista de títulos del motor se lee de verdad (si no, este test no controla nada)', () => {
    const t = titulosDelMotor()
    assert.ok(t.length >= 6, `sólo encontré ${t.length} títulos en el motor: el test dejó de mirar donde tenía que mirar`)
    assert.ok(t.includes('No tenés permiso'))
    assert.ok(t.includes('Lo que falta para enviar'))
  })

  test('ninguno de esos títulos está escrito en el componente', () => {
    for (const titulo of titulosDelMotor()) {
      assert.ok(
        !PANEL.includes(titulo),
        `«${titulo}» está escrito en Conversacion.tsx: es una respuesta preescrita y se vería igual con el motor apagado`,
      )
    }
  })

  test('el componente no afirma que algo se aplicó', () => {
    // El vocabulario de la afirmación falsa: un panel que dice «actualicé» está declarando un efecto.
    for (const verbo of ['actualicé', 'actualice ', 'guardé', 'apliqué', 'cambié', '¡Listo']) {
      assert.ok(!PANEL.includes(verbo), `«${verbo}» en el panel afirma un efecto que el panel no produjo`)
    }
  })

  test('el impacto en el precio no se calcula en el panel', () => {
    // Una resta acá sería una segunda definición del movimiento del precio. El delta viene hecho.
    assert.ok(!/impacto\.despues\s*-\s*impacto\.antes/.test(PANEL), 'el panel recalcula el delta en vez de mostrar el que vino')
  })

  test('los ejemplos que ofrece salen de CANONICOS, no de una lista propia', () => {
    assert.match(PANEL, /CANONICOS/)
    // Una lista literal de ejemplos podría publicar frases que el intérprete no entiende.
    assert.ok(!/const EJEMPLOS[^=]*=\s*\[/.test(PANEL), 'los ejemplos están escritos a mano en el panel')
  })
})
