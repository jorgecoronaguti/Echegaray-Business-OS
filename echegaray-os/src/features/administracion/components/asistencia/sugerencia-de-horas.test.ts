import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// EL CANARIO DE LA SUGERENCIA: LA PANTALLA DE HORAS NO PUEDE VOLVER A SUGERIR LA JORNADA DE LA OBRA.
//
// ═══ EL DEFECTO QUE VIGILA (08/09/2026) ═══
//
// El dueño fijó la jornada por defecto por DÍA DE LA SEMANA —«9 hs de L a J y 8 hs los V cuando se
// da el presente»—. Antes, las tres sugerencias de esta pantalla (el placeholder gris, el botón
// «poner … a los que faltan» y la sugerencia condicionada por la presencia) salían de la misma
// variable: `jornada`, o sea `obra_canonica.jornada_horas`, que dice 9 todos los días. Un viernes
// sugería 9: una hora de más por persona y por semana, en la casilla que después se guarda.
//
// `jornada` NO desapareció del componente y ahí está el riesgo: sigue vivo para medir en horas una
// AUSENCIA (`loQueViaja`, `ausenciasSinJornada`), que es otra cosa. Basta que alguien escriba otra
// vez `hs(jornada)` en el botón o `horasSegunPresencia(declarado, jornada)` para que la regla del
// dueño quede revertida sin que ningún test de servicio se ponga rojo — la regla pura seguiría bien
// y la pantalla, mal.
//
// Se prueba sobre el TEXTO porque el defecto es de FORMA: qué variable alimenta la sugerencia. Un
// test que corre siempre y atrapa la forma vale más que un render que nadie ejecuta.

const fuente = readFileSync(
  fileURLToPath(new URL('./FormAsistencia.tsx', import.meta.url)), 'utf8')

/** `assert.match` vuelca el archivo entero cuando falla: 12 kB de ruido por un renglón. Acá se
 *  afirma sobre el booleano y el mensaje dice qué se rompió. */
const tiene = (re: RegExp) => re.test(fuente)

test('la sugerencia del día sale de `jornadaPorDefecto(fecha)`, no de la obra', () => {
  assert.ok(tiene(/const sugerida = jornadaPorDefecto\(fecha\)/),
    'la pantalla dejó de derivar la jornada por defecto de la fecha')
  assert.ok(tiene(/horasSegunPresencia\(declarado, fecha\)/),
    'volvió a pasarle la jornada de la obra a `horasSegunPresencia`')
})

test('ninguna de las tres sugerencias se alimenta de la jornada de la obra', () => {
  const prohibidas = [
    /ponerLaJornada\(\s*c\s*,\s*jornada\s*\)/,
    /hs\(jornada\)/,
    /horasSegunPresencia\(declarado, jornada\)/,
    /sugerencia\s*=\s*[^\n]*\bjornada\b\s*>/,
  ]
  for (const p of prohibidas) {
    assert.ok(!tiene(p),
      `la jornada de la obra volvió a ser la sugerencia del presente: ${p}`)
  }
})

test('el fin de semana no se sugiere nada: el atajo queda apagado', () => {
  assert.ok(tiene(/disabled=\{sugerida === null\}/),
    'sin esto, un sábado el botón pone horas que nadie trabajó')
})

// LA JORNADA DE LA OBRA SIGUE HACIENDO SU TRABAJO. Sacarla del componente rompería la ausencia:
// `registros_hh` guarda la falta medida en horas y sin jornada pactada no se puede medir.
test('la jornada de la obra sigue midiendo la ausencia', () => {
  assert.ok(tiene(/loQueViaja\([\s\S]*?,\s*jornada\)/),
    'la ausencia se quedó sin horas con las que registrarse')
  assert.ok(tiene(/ausenciasSinJornada\(vista, jornada\)/),
    'se perdió el aviso de que la obra no tiene jornada pactada')
})
