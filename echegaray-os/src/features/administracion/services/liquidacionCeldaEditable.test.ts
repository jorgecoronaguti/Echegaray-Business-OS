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

// `guardarValorHora` SE MUDÓ a `tarifaDeLaQuincenaActions.ts` (14/09/2026) y pasa por la misma regla
// que la celda del cuadro de la quincena. Sus cerraduras se prueban en `solapaQuincena.test.ts`.
for (const accion of ['guardarCeldaLiquidacion']) {
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

// ═══ LA CELDA QUE CALCULA (dueño, 15/09/2026) ═══

test('LA CUENTA SE LEE CON EL MISMO LECTOR QUE EL NAVEGADOR, Y UNA INVÁLIDA NO SE GUARDA', () => {
  const cuerpo = cuerpoDe('guardarCeldaLiquidacion')
  // EL DEFECTO QUE ATRAPA: un `Number(valor)` en el servidor. «=9*105» daría NaN y la celda se guardaría
  // vacía —o peor, en 0— sin que nadie se entere; o un segundo parser daría otro número que el de la pantalla.
  assert.match(cuerpo, /leerCeldaNumerica\(/)
  assert.match(cuerpo, /if \(!escrito\.ok\) return \{ ok: false, error: escrito\.error \}/)
  assert.ok(
    cuerpo.indexOf('leerCeldaNumerica(') < cuerpo.indexOf('createAdminClient()'),
    'lo tecleado se valida antes de tomar la clave de servicio',
  )
})

test('LA CUENTA SE GUARDA AL LADO DEL NÚMERO, NO EN SU LUGAR', () => {
  const cuerpo = cuerpoDe('guardarCeldaLiquidacion')
  // EL DEFECTO QUE ATRAPA: escribir la expresión en la columna numérica, o pisar `formulas` entero con
  // `{ [campo]: expresion }` y borrar las cuentas de las otras celdas de la fila.
  assert.match(cuerpo, /\[columna\]: nuevo/)
  assert.match(cuerpo, /siguientesFormulas\(hoy\?\.formulas, campo, escrito\.expresion\)/)
})

test('SIN LA COLUMNA `formulas` LA LIMITACIÓN SE DICE, NO SE FINGE', () => {
  const cuerpo = cuerpoDe('guardarCeldaLiquidacion')
  // EL DEFECTO QUE ATRAPA: devolver «Guardado.» cuando la cuenta se perdió. Quien la escribió creería que
  // al reabrir la celda va a ver su expresión, y va a ver un número pelado.
  assert.match(cuerpo, /escrito\.expresion != null && !hayFormulas/)
  assert.match(cuerpo, /La cuenta NO se guardó/)
})

test('EL $/HORA NO SE ESCRIBE EN OFICINA: le borraría el neto mensual acordado', () => {
  // EL DEFECTO QUE ATRAPA: `persona_tarifa` acepta `valor_hora` O `neto_mensual` (CHECK «una sola
  // forma»). Un $/h escrito sobre Maldonado o Nievas convertiría $1.800.000 mensuales en una tarifa
  // horaria, y el cuadro los movería solos de Oficina a Obreros.
  // La acción se mudó a `tarifaDeLaQuincenaActions.ts` (14/09/2026). La regla sigue: se rechaza en la
  // entrada, antes de leer nada y antes de tomar la clave de servicio.
  const TARIFA = readFileSync(new URL('./tarifaDeLaQuincenaActions.ts', import.meta.url), 'utf8')
  const i = TARIFA.indexOf('export async function guardarValorHora(')
  assert.ok(i > 0, 'guardarValorHora vive en tarifaDeLaQuincenaActions.ts')
  const cuerpo = TARIFA.slice(i, i + TARIFA.slice(i).indexOf('\n}\n'))
  assert.match(cuerpo, /if \(v\.grupo !== 'obreros'\)/)
  assert.ok(!/createAdminClient\(\)/.test(cuerpo), 'la entrada no toma la clave de servicio: delega en escribirTarifa')
  assert.match(cuerpo, /escribirTarifa\(\{ \.\.\.v, forma: 'hora', valor \}\)/)
})
