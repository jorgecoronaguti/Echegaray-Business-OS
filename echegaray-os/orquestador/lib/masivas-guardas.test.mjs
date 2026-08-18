// LAS GUARDAS DE LAS ACCIONES MASIVAS, probadas sobre el CÓDIGO.
//
// Una acción que escribe 344 filas de un saque es la que más barato hace un desastre grande: el
// defecto no se ve porque la pantalla contesta que sí, y lo que se rompió son trescientas filas que
// nadie va a mirar de a una. Los dos modos de falla que se cierran acá no se pueden atrapar con una
// llamada de prueba mientras la base siga como está —0 de 344 con línea base—: un test que escribe y
// lee pasaría igual con la guarda sacada.
//
//   · Que una acción que NO es el sellado toque `inicio_base`/`fin_base`/`sellada_en`. Alcanza con
//     agregar la columna a un `update` para que cada carga de HH borre la medición del desvío de
//     toda la obra, sin un error, sin una excepción.
//   · Que un `update` salga sin acotar por `obra_id`. Los ids de actividad los elige el navegador:
//     sin ese filtro, un id pegado a mano escribe sobre la obra de al lado.
//
// Mismo método que `baseline-intocable.test.mjs`, que cuida lo mismo del lado de `actions.ts`.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const FUENTE = readFileSync(
  new URL('../../src/features/obras/services/actionsMasivas.ts', import.meta.url),
  'utf8',
)

/** El cuerpo de una acción exportada: de su firma hasta la llave de cierre a nivel cero. Se corta
 *  ahí y no en el `export` siguiente porque entre una acción y otra hay comentarios, y arrastrar el
 *  docblock del vecino haría fallar este test por una palabra escrita en una explicación. */
function cuerpoDe(nombre) {
  const desde = FUENTE.indexOf(`export async function ${nombre}(`)
  assert.notEqual(desde, -1, `no existe la acción ${nombre}`)
  const fin = FUENTE.indexOf('\n}\n', desde)
  assert.notEqual(fin, -1, `no encontré el final de ${nombre}`)
  return FUENTE.slice(desde, fin)
}

const MASIVAS = ['asignarResponsableMasivo', 'cargarHHPlanMasivo', 'sellarBaselineMasivo']
const COLUMNAS_DE_BASE = ['inicio_base', 'fin_base', 'sellada_en']

for (const accion of ['asignarResponsableMasivo', 'cargarHHPlanMasivo']) {
  test(`${accion} no toca la linea base`, () => {
    const cuerpo = cuerpoDe(accion)
    for (const col of COLUMNAS_DE_BASE) {
      assert.ok(
        !cuerpo.includes(col),
        `${accion} menciona «${col}»: la línea base sólo la escribe el sellado`,
      )
    }
  })
}

test('sellarBaselineMasivo SI escribe la linea base: es lo que tiene que hacer', () => {
  const cuerpo = cuerpoDe('sellarBaselineMasivo')
  for (const col of COLUMNAS_DE_BASE) assert.ok(cuerpo.includes(col), `el sellado escribe ${col}`)
})

test('sellarBaselineMasivo no pisa lo ya sellado sin que alguien lo pida', () => {
  const cuerpo = cuerpoDe('sellarBaselineMasivo')
  // La condición tiene que MIRAR el pedido explícito. Sin esta rama, re-sellar una actividad
  // atrasada la devuelve a «en fecha» y la medición desaparece sin dejar rastro.
  assert.match(cuerpo, /!parsed\.data\.resellar/, 'el salteo tiene que depender de `resellar`')
  assert.match(cuerpo, /inicio_base != null/, 'se pregunta si YA tiene base antes de escribir')
})

for (const accion of MASIVAS) {
  test(`${accion} acota SIEMPRE por obra_id`, () => {
    const cuerpo = cuerpoDe(accion)
    const updates = cuerpo.split('.update(').slice(1)
    assert.ok(updates.length > 0, `${accion} tiene que escribir algo`)
    for (const u of updates) {
      // El filtro va en la misma cadena que el update: se busca en lo que sigue hasta el `select`
      // o el fin de la sentencia.
      const cadena = u.slice(0, u.indexOf('\n    if (') === -1 ? u.length : u.indexOf('\n    if ('))
      assert.ok(
        cadena.includes(".eq('obra_id'"),
        `un update de ${accion} no está acotado por obra_id: los ids vienen del navegador`,
      )
    }
  })

  test(`${accion} entra con la sesion del usuario, nunca con service role`, () => {
    const cuerpo = cuerpoDe(accion)
    assert.ok(!/service_role|SERVICE_ROLE|createServiceClient/.test(cuerpo), `${accion} no puede saltear el RLS`)
  })
}

test('el archivo entero usa el cliente de servidor con la sesion del usuario', () => {
  assert.match(FUENTE, /from '@\/lib\/supabase\/server'/)
  assert.ok(!FUENTE.includes('SUPABASE_SERVICE_ROLE_KEY'), 'ninguna acción masiva usa service role')
})

test('toda entrada del navegador pasa por Zod', () => {
  for (const accion of MASIVAS) {
    assert.match(cuerpoDe(accion), /safeParse\(/, `${accion} tiene que validar su entrada`)
  }
})
