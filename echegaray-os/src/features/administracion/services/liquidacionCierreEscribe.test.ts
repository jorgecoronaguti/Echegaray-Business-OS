import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { estadoDeCierre, validarMotivoDeReapertura, type LineaParaCerrar } from './liquidacionCierre.ts'

// LAS TRES CERRADURAS DEL CIERRE QUE ESCRIBE, PROBADAS SOBRE EL CÓDIGO QUE LAS IMPLEMENTA.
//
// `cerrarQuincenaAction` no se puede importar acá: es un módulo `'use server'` que resuelve
// `@/lib/supabase/server`, un alias que `node --test` no conoce. La política del repo para las
// server actions es la misma que en `liquidacionCeldaEditable.test.ts`: se prueba el ORDEN sobre la
// fuente, porque el orden es lo único que la base no perdona y un `if` que se puede borrar sin que
// nada se ponga rojo no es un control.
//
// Lo que sí se ejecuta de verdad —qué bloquea el cierre y qué motivo alcanza— está abajo y corre
// contra las funciones puras que la acción usa: son las mismas que dibujan la pantalla.

const FUENTE = readFileSync(new URL('./liquidacionCierreActions.ts', import.meta.url), 'utf8')
// Reabrir vive en la otra acción y NO se duplica: la firma antes de abrir se prueba donde está.
const REABRE = readFileSync(new URL('./liquidacionActions.ts', import.meta.url), 'utf8')

const cuerpoDe = (nombre: string): string => {
  const i = FUENTE.indexOf(`export async function ${nombre}(`)
  assert.ok(i > 0, `no encontré ${nombre}`)
  const resto = FUENTE.slice(i)
  return resto.slice(0, resto.indexOf('\n}\n'))
}

const antes = (cuerpo: string, a: string, b: string, porque: string): void => {
  const ia = cuerpo.indexOf(a)
  const ib = cuerpo.indexOf(b)
  assert.ok(ia >= 0, `no encontré «${a}»`)
  assert.ok(ib >= 0, `no encontré «${b}»`)
  assert.ok(ia < ib, porque)
}

for (const accion of ['cerrarQuincenaAction']) {
  test(`${accion} PREGUNTA EL ROL ANTES DE TOCAR LA BASE`, () => {
    const cuerpo = cuerpoDe(accion)
    assert.match(cuerpo, /const paso = await puerta\(supabase\)/)
    assert.match(cuerpo, /if \('error' in paso\) return \{ ok: false, error: paso\.error \}/)
    // EL DEFECTO QUE ATRAPA: leer o escribir y rechazar después. Una server action es un endpoint:
    // se invoca con lo que viaja en el HTML sin abrir jamás la pantalla.
    const consultas = ['.from(', 'lineasSelladas(', 'getLiquidacionDeLaQuincena(', 'legajosAlCerrar(']
      .map((c) => cuerpo.indexOf(c)).filter((i) => i >= 0)
    assert.ok(consultas.length > 0, 'la acción tiene que tocar la base en algún lado')
    assert.ok(
      cuerpo.indexOf('await puerta(supabase)') < Math.min(...consultas),
      'el rol se pregunta antes de la primera consulta',
    )
  })
}

test('CERRAR SELLA PRIMERO Y MARCA LA CABECERA DESPUÉS — lo exige la policy, no la costumbre', () => {
  const cuerpo = cuerpoDe('cerrarQuincenaAction')
  // EL DEFECTO QUE ATRAPA: marcar la cabecera cerrada antes de sellar. `liquidacion_linea_edita_abierta`
  // exige `estado = 'abierta'`, así que el sello se rechazaría en silencio (0 filas, sin error) y la
  // quincena quedaría CERRADA Y SIN SELLO: diría que se pagó sin decir con qué valor hora.
  antes(cuerpo, 'escribirSello(', 'marcarCerrada(',
    'sellar va antes de cerrar: con la cabecera cerrada la policy rechaza el sello')
  // Y la foto de plata antes del sello: una fila que no existe no se puede actualizar.
  antes(cuerpo, 'escribirFoto(', 'escribirSello(', 'la fila se crea antes de sellarse')
})

test('CERRAR NO SELLA CON PENDIENTES, Y LOS DICE', () => {
  const cuerpo = cuerpoDe('cerrarQuincenaAction')
  assert.match(cuerpo, /if \(!estado\.puedeCerrar\)/)
  antes(cuerpo, 'if (!estado.puedeCerrar)', 'escribirFoto(', 'el bloqueo va antes de escribir')
  assert.match(cuerpo, /porQueNo\(estado\.pendientes\)/, 'el rechazo dice cuál pendiente traba')
  // EL DEFECTO QUE ATRAPA: sellar sobre una lectura que falló. Una fuente que no se pudo leer no es
  // una fuente vacía, y el sello vuelve el importe corto indistinguible de uno correcto.
  antes(cuerpo, 'lectura.errores.length > 0', 'escribirFoto(',
    'una lectura con errores no se sella')
})

test('REABRIR ESCRIBE LA FIRMA ANTES DE ABRIR', () => {
  const i = REABRE.indexOf('export async function reabrirQuincena(')
  assert.ok(i > 0, 'no encontré reabrirQuincena')
  const cuerpo = REABRE.slice(i, i + REABRE.slice(i).indexOf('\n}\n'))
  // EL DEFECTO QUE ATRAPA: abrir primero y registrar después. Si el insert del motivo falla, la
  // quincena ya quedó abierta y el descierre es anónimo: la diferencia aparece en la caja y nadie
  // puede decir de dónde salió.
  antes(cuerpo, "from('liquidacion_reapertura')", "estado: 'abierta'",
    'el motivo se guarda antes de abrir')
  antes(cuerpo, 'validarMotivoDeReapertura', "from('liquidacion_reapertura')",
    'el motivo se valida antes de insertarlo')
  assert.match(cuerpo, /rastro\.error \|\| !rastro\.data/, 'se lee el efecto del insert del motivo')
  // Y la quincena abierta deja de decir quién la cerró: «cerrada por X» sobre una quincena ABIERTA
  // es una firma que ya no firma nada.
  assert.match(cuerpo, /cerrada_por: null/)
})

test('CADA ESCRITURA ACUSA LEYENDO EL EFECTO, no el 204', () => {
  for (const nombre of ['escribirFoto', 'escribirSello', 'marcarCerrada']) {
    const i = FUENTE.indexOf(`async function ${nombre}(`)
    assert.ok(i > 0, `no encontré ${nombre}`)
    const cuerpo = FUENTE.slice(i, i + FUENTE.slice(i).indexOf('\n}\n'))
    assert.match(cuerpo, /\.select\(/, `${nombre} tiene que leer lo que escribió`)
    assert.match(cuerpo, /La base no /, `${nombre} tiene que acusar el rechazo en silencio`)
  }
})

test('EL AVISO DE LA REAPERTURA SE CALCULA SIN ESCRIBIR (R6)', () => {
  // El aviso lo arma la solapa con `avisoDeReapertura` (núcleo puro) ANTES de ofrecer el botón:
  // el defecto que atrapa es reabrir para poder mostrar la diferencia, que es el orden inverso al
  // que pidió el dueño («avisa la diferencia ANTES de guardar»).
  const solapa = readFileSync(
    new URL('../components/liquidacion/solapas/cierre.tsx', import.meta.url), 'utf8')
  assert.match(solapa, /avisoDeReapertura\(/)
  const cuerpo = solapa
  // EL DEFECTO QUE ATRAPA: reabrir para poder mostrar la diferencia. El dueño lo pidió al revés:
  // «recalcula con la retribución vigente y avisa la diferencia ANTES de guardar».
  for (const escritura of ['.update(', '.insert(', '.upsert(', '.delete(']) {
    assert.ok(!cuerpo.includes(escritura), `previsualizar no puede ${escritura}`)
  }
})

// ═══ LO QUE SÍ SE EJECUTA: la misma lista que ve la pantalla ═══

const linea = (p: Partial<LineaParaCerrar> = {}): LineaParaCerrar => ({
  personaId: 'p1', nombre: 'Zogbe Fabian', horas: 97, valorHora: 3650, netoMensual: null,
  modalidad: 'hora', cobra: 354050,
  porBanco: 0, enEfectivo: 354050, total: 354050, sinTarifa: false, reciboSinGiro: false, ...p,
})

test('UNA LÍNEA SIN TARIFA BLOQUEA EL CIERRE ENTERO, con nombre propio', () => {
  const estado = estadoDeCierre([linea(), linea({ personaId: 'p2', nombre: 'Castillo', valorHora: null, cobra: null, sinTarifa: true })])
  assert.equal(estado.puedeCerrar, false)
  assert.match(estado.pendientes[0].texto, /Castillo/)
  // Y el total sellado NO la cuenta como cero: son 354.050, no 354.050 «de dos personas».
  assert.equal(estado.totalSellado, 354050)
  assert.equal(estado.liquidadas, 1)
  assert.equal(estado.personas, 2)
})

test('SIN LÍNEAS NO SE CIERRA: una quincena vacía no es una quincena liquidada', () => {
  assert.equal(estadoDeCierre([]).puedeCerrar, false)
})

test('EL MOTIVO DE LA REAPERTURA ES LO QUE LA ACCIÓN VALIDA ANTES DE ESCRIBIR', () => {
  assert.equal(validarMotivoDeReapertura('ok').ok, false)
  assert.equal(validarMotivoDeReapertura('   corto   ').ok, false)
  const bueno = validarMotivoDeReapertura('  se cargaron   horas que faltaban ')
  assert.equal(bueno.ok, true)
  assert.equal(bueno.ok && bueno.motivo, 'se cargaron horas que faltaban')
})
