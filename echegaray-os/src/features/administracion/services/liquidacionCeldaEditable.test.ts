import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { MENSAJE_SIN_PERMISO, permisoDeLiquidacion } from './liquidacionPermiso.ts'

// LAS DOS CERRADURAS DE LAS CELDAS EDITABLES, PROBADAS SOBRE EL CÓDIGO QUE LAS IMPLEMENTA.
//
// Las acciones escriben con la CLAVE DE SERVICIO —el GRANT por columna de `authenticated` sigue
// acotado a `efectivo_redondeado` a propósito—, así que la RLS ya no las protege: las dos únicas
// cerraduras que quedan son el rol y el estado releído de la cabecera. Un `if` que se puede borrar
// sin que nada se ponga rojo no es un control.

const FUENTE = readFileSync(new URL('./liquidacionActions.ts', import.meta.url), 'utf8')

const cuerpoDe = (nombre: string): string => {
  const i = FUENTE.indexOf(`export async function ${nombre}(`)
  assert.ok(i > 0, `no encontré ${nombre}`)
  const resto = FUENTE.slice(i)
  const fin = resto.indexOf('\n}\n')
  return resto.slice(0, fin)
}

for (const accion of ['guardarCeldaLiquidacion', 'guardarValorHora']) {
  test(`${accion} RECHAZA A QUIEN NO LIQUIDA — y lo hace ANTES de escribir`, () => {
    const cuerpo = cuerpoDe(accion)
    assert.match(cuerpo, /const permiso = await puedeLiquidar\(supabase\)/)
    assert.match(cuerpo, /if \(!permiso\.ok\) return \{ ok: false, error: permiso\.error \}/)
    // EL DEFECTO QUE ATRAPA: pedir la clave de servicio antes de saber quién llama. Con la clave en
    // la mano ya no hay policy que frene un jefe de obra reescribiendo los sueldos del plantel.
    assert.ok(
      cuerpo.indexOf('await puedeLiquidar') < cuerpo.indexOf('createAdminClient()'),
      'el rol se pregunta antes de tomar la clave de servicio',
    )
  })

  test(`${accion} NO EDITA UNA QUINCENA CERRADA (R6), releyendo el estado de la base`, () => {
    const cuerpo = cuerpoDe(accion)
    // EL DEFECTO QUE ATRAPA: confiar en que la pantalla no dibuja la celda. Una server action es un
    // endpoint y se invoca con el id que viaja en el HTML sin abrir jamás la pantalla; y con la
    // clave de servicio la policy `liquidacion_linea_edita_abierta` ya no la frena.
    assert.match(cuerpo, /const cab = await cabecera\(supabase, v\)/)
    assert.match(cuerpo, /if \(cab\.estado === 'cerrada'\) return \{ ok: false, error: 'La quincena está cerrada: no se edita\.' \}/)
    assert.ok(
      cuerpo.indexOf("cab.estado === 'cerrada'") < cuerpo.indexOf('createAdminClient()'),
      'el estado se comprueba antes de tomar la clave de servicio',
    )
  })

  test(`${accion} ACUSA LEYENDO EL EFECTO, no el 204`, () => {
    const cuerpo = cuerpoDe(accion)
    assert.match(cuerpo, /\.select\(/)
    assert.match(cuerpo, /La base no guardó/)
  })
}

test('el rol que gobierna la celda es el mismo que el del módulo: jefe de obra NO', () => {
  const r = permisoDeLiquidacion('jefe_obra')
  assert.equal(r.ok, false)
  assert.equal(r.ok === false && r.error, MENSAJE_SIN_PERMISO)
  assert.equal(permisoDeLiquidacion('administracion').ok, true)
})

test('VACÍO NO ES CERO: la celda vacía viaja como «» y la acción la traduce a NULL', () => {
  const cuerpo = cuerpoDe('guardarCeldaLiquidacion')
  assert.match(cuerpo, /const nuevo = valor === '' \? null : valor/)
  // EL DEFECTO QUE ATRAPA: un `Number(valor) || 0` que convierte «borré la celda» en «le pago $ 0».
  assert.doesNotMatch(cuerpo, /\|\| 0/)
})

test('EL $/HORA NO SE ESCRIBE EN OFICINA: le borraría el neto mensual acordado', () => {
  // EL DEFECTO QUE ATRAPA: `persona_tarifa` acepta `valor_hora` O `neto_mensual` (CHECK «una sola
  // forma»). Un $/h escrito sobre Maldonado o Nievas convertiría $1.800.000 mensuales en una tarifa
  // horaria, y el cuadro los movería solos de Oficina a Obreros.
  const cuerpo = cuerpoDe('guardarValorHora')
  assert.match(cuerpo, /if \(v\.grupo !== 'obreros'\)/)
  assert.ok(
    cuerpo.indexOf("v.grupo !== 'obreros'") < cuerpo.indexOf('createAdminClient()'),
    'se rechaza antes de tomar la clave de servicio',
  )
})
