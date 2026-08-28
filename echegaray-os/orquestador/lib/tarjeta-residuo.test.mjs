// NINGUNA CELDA DEL LAYOUT ANTERIOR SOBREVIVE ADENTRO DEL NUEVO — probado contra la guarda REAL.
//
// ═══ EL DEFECTO QUE ESTE TEST FIJA (28/08/2026) ═══
//
// La pestaña se escribió con el rediseño y quedó un HÍBRIDO: 29 celdas del layout anterior
// intercaladas entre las secciones nuevas. Entre ellas, una sección entera —"3 · CONTROL — LA
// PESTAÑA CONTRA EL RESUMEN DEL BANCO"— publicando $5.749.674 con "▲ revisar la carga". Un número
// muerto, gritando, en la pestaña que el dueño acababa de pedir que fuera minimalista.
//
// LA CAUSA no fue la grilla: la grilla mandaba "" en esas celdas. Es que un "" significa "no es mi
// celda" y `no-borrar.mjs` —bien— conserva lo que no puede probar de quién es. Faltaban las dos
// declaraciones que el repo ya tiene y este generador no usaba:
//
//   1. el centinela `VACIO` — "esta celda es mía y va vacía";
//   2. `vaciarPropio` — los rótulos con los que la guarda puede PROBAR que el residuo lo escribió el
//      OS (`residuo-propio.mjs`: la fila anclada por un rótulo propio y la celda con forma de
//      generador).
//
// SE PRUEBA CON LA GUARDA DE VERDAD, no con una simulación: `protegerBorrado` es la misma función
// que corre en cada escritura, y acá se le da un cliente que devuelve el destino sembrado. Un test
// que reimplementa la regla que quiere probar sólo prueba su propia copia.

import test from 'node:test'
import assert from 'node:assert/strict'
import { protegerBorrado, MIA_PROBADA } from './no-borrar.mjs'
import { VACIO, limpiarCentinela } from './preservar-anotaciones.mjs'
import { RETIRADOS, COLS } from './tarjeta-banda.mjs'
import { BANDA } from './tarjeta-geometria.mjs'

/**
 * EL DESTINO SEMBRADO: el layout ANTERIOR, en las coordenadas donde de verdad sobrevivió.
 *
 * No es un layout viejo inventado: son las filas que la banda nueva DEJA VACÍAS (los renglones de
 * aire entre bloques y el relleno del final), que es exactamente donde quedaron las 29 celdas
 * medidas sobre la pestaña real. Sembrar el residuo donde el generador igual va a escribir encima no
 * probaría nada: lo pisaría la escritura, no la guarda.
 */
function pestanaConElLayoutViejo() {
  const filas = Array.from({ length: BANDA }, () => Array(COLS).fill(''))
  const set = (ref, v) => { const c = ref.charCodeAt(0) - 65; const f = Number(ref.slice(1)) - 1; filas[f][c] = v }
  set('A7', 'LA LÍNEA — CUÁNTO SE PUEDE GASTAR HOY')
  set('A18', 'Concepto'); set('B18', 'Monto'); set('C18', 'Cuándo')
  set('A25', '3 · CONTROL — LA PESTAÑA CONTRA EL RESUMEN DEL BANCO')
  set('A26', 'Concepto'); set('B26', 'Monto'); set('C26', 'Cuándo')
  set('A27', 'Pendiente según esta pestaña'); set('B27', '=B16')
  set('A28', 'Pendiente según el resumen del banco'); set('B28', 5749674.28)
  set('C28', '=LET(dd_;TODAY()-DATE(2026;7;29);IF(dd_>21;"▲ foto de hace "&dd_&" días";"resumen al 29/07/2026"))')
  set('A29', '⇒ Diferencia'); set('B29', '=B27-B28')
  set('C29', '=IF(B27=0;"sin cuotas cargadas";IF(ABS(B29)<=100;"✓ concilia";"▲ revisar la carga"))')
  set('A30', 'Límite de compra'); set('B30', 10000000); set('C30', 'acordado')
  return filas
}

/** Lo que el generador manda hoy: contenido en las filas que usa, centinela en las que deja vacías. */
function loQueEscribeLaBandaNueva({ notaDelDueno = null } = {}) {
  const filas = Array.from({ length: BANDA }, () => Array(COLS).fill(VACIO))
  const set = (ref, v) => { const c = ref.charCodeAt(0) - 65; const f = Number(ref.slice(1)) - 1; filas[f][c] = v }
  set('A1', 'Tarjeta de crédito')
  set('A2', 'Visa 3319 · Santander · resumen 202120, cerrado el 20/08/2026')
  set('A4', 'A PAGAR — PESOS'); set('C4', 'A PAGAR — DÓLARES'); set('F4', '¿YA SE PAGÓ?')
  set('A5', 2208958.42); set('C5', 544.99); set('F5', '=LET(pag_;0;"A VENCER")')
  set('A8', '1 · QUÉ ME ESTÁN COBRANDO')
  set('A9', 'Concepto'); set('B9', 'Monto'); set('C9', 'Cuánto pesa')
  set('A10', 'Consumos del período'); set('B10', 1949747.67)
  if (notaDelDueno) set(notaDelDueno.ref, notaDelDueno.texto)
  return filas
}

/**
 * LO QUE LLEGA DE VERDAD A LA ESCRITURA.
 *
 * El centinela NO viaja hasta la guarda: `conHuellaFueraDelPorton` lo traduce a "" después de que la
 * huella decidió (un centinela crudo se escribiría LITERAL — así aparecieron 61 celdas "::VACIO::"
 * en CAJA). O sea que en la escritura hay tres valores posibles por celda: contenido, "" (mía y
 * vacía, sin que la huella pudiera probarlo) y `MIA_PROBADA` (mía y vacía, PROBADO por la huella).
 * Los tests de abajo trabajan sobre eso, que es lo que la guarda ve.
 */
const comoLlegaALaEscritura = (grid) => limpiarCentinela(grid)

const RANGO = 'Tarjeta de Credito!A1'
/** Un cliente que devuelve el destino sembrado. La guarda relee: acá se le da qué leer. */
const clienteQueLee = (destino) => ({ readSheetValues: async () => destino })
const celda = (values, ref) => values[Number(ref.slice(1)) - 1][ref.charCodeAt(0) - 65]

const MIOS = [...RETIRADOS, 'Concepto', 'Monto', 'Cuándo']

test('con el centinela y los rótulos retirados, NINGÚN rótulo del layout viejo sobrevive', async () => {
  const destino = pestanaConElLayoutViejo()
  const r = await protegerBorrado(clienteQueLee(destino), 'id',
    [{ range: RANGO, values: comoLlegaALaEscritura(loQueEscribeLaBandaNueva()) }], { vaciarPropio: { mios: MIOS } })
  const values = r.data[0].values
  const plano = values.flat().map((c) => String(c ?? ''))
  for (const muerto of ['LA LÍNEA — CUÁNTO SE PUEDE GASTAR HOY', '3 · CONTROL — LA PESTAÑA CONTRA EL RESUMEN DEL BANCO',
    'Pendiente según el resumen del banco', 'Pendiente según esta pestaña', '⇒ Diferencia', 'Límite de compra']) {
    assert.ok(!plano.includes(muerto), `sobrevivió "${muerto}"`)
  }
  // Y el número muerto que gritaba: $5.749.674 con su "▲ revisar la carga".
  assert.ok(!plano.some((c) => c.includes('5749674')), 'sobrevivió el pendiente del layout viejo')
  assert.ok(!plano.some((c) => c.includes('revisar la carga')), 'sobrevivió la alerta del control viejo')
  // Ni un centinela llega al Sheet: uno escrito literal ya dejó 61 celdas "::VACIO::" en CAJA.
  assert.ok(!plano.some((c) => c.includes('VACIO')), 'un centinela llegó crudo a la escritura')
})

// ═══ EL CASO CONTRARIO, QUE ES EL QUE HACE QUE ESTO SIRVA ═══

test('lo que escribió una PERSONA adentro de la banda se conserva, aunque la banda lo deje vacío', async () => {
  // Sin este caso, el test de arriba se aprueba con un `clearValues` — que es exactamente lo que no
  // se puede hacer. Una nota del dueño no tiene forma de generador ni está en el registro de
  // rótulos: la guarda no la puede probar suya, y por lo tanto no la borra.
  const destino = pestanaConElLayoutViejo()
  destino[26][3] = 'ojo: este mes pagué 200.000 de más, verificar con el banco'   // D27
  const r = await protegerBorrado(clienteQueLee(destino), 'id',
    [{ range: RANGO, values: comoLlegaALaEscritura(loQueEscribeLaBandaNueva()) }], { vaciarPropio: { mios: MIOS } })
  assert.equal(celda(r.data[0].values, 'D27'), 'ojo: este mes pagué 200.000 de más, verificar con el banco')
  assert.ok(r.preservadas >= 1, 'la guarda tiene que declarar que conservó algo que no pudo probar suyo')
})

test('un importe suelto en una fila SIN ancla del generador tampoco se toca', async () => {
  // La fila 21 no tiene ningún rótulo propio: aunque un número "tenga forma de generador",
  // `residuosPropios` exige las DOS evidencias (fila anclada + celda propia).
  const destino = pestanaConElLayoutViejo()
  destino[20][1] = 123456   // B21: la fila 21 no tiene ningún rótulo
  const r = await protegerBorrado(clienteQueLee(destino), 'id',
    [{ range: RANGO, values: comoLlegaALaEscritura(loQueEscribeLaBandaNueva()) }], { vaciarPropio: { mios: MIOS } })
  assert.equal(celda(r.data[0].values, 'B21'), 123456)
})

test('sin declarar nada, el layout viejo sobrevive — el test que reproduce el defecto', async () => {
  // Es la versión anterior de este generador: mandaba "" donde no escribía y no pasaba `vaciarPropio`.
  // La guarda no puede distinguir "no es mi celda" de "es mía y va vacía", así que conserva — bien.
  // Si alguien saca la declaración, este test sigue verde y el primero se cae: entre los dos, el
  // defecto no puede volver en silencio.
  const r = await protegerBorrado(clienteQueLee(pestanaConElLayoutViejo()), 'id',
    [{ range: RANGO, values: comoLlegaALaEscritura(loQueEscribeLaBandaNueva()) }])
  const plano = r.data[0].values.flat().map((c) => String(c ?? ''))
  assert.ok(plano.includes('3 · CONTROL — LA PESTAÑA CONTRA EL RESUMEN DEL BANCO'), 'ése era el defecto')
  assert.ok(plano.includes('LA LÍNEA — CUÁNTO SE PUEDE GASTAR HOY'), 'ése era el defecto')
})

test('y cuando la huella SÍ puede probar la celda, la guarda limpia sin depender de ninguna lista', async () => {
  // La segunda vía, y la más fuerte: `aplicarHuella` emite `MIA_PROBADA` con evidencia positiva
  // —selló esa coordenada y la celda sigue con la forma que dejó—. Es lo que limpia el layout
  // ANTERIOR de este mismo generador ahora que el alto se ajusta por abajo y las coordenadas no se
  // corren: sin eso, la huella no alinea y no hay veredicto.
  const grid = comoLlegaALaEscritura(loQueEscribeLaBandaNueva())
  grid[24][0] = MIA_PROBADA          // A25, donde vive "3 · CONTROL — …"
  const r = await protegerBorrado(clienteQueLee(pestanaConElLayoutViejo()), 'id', [{ range: RANGO, values: grid }])
  assert.equal(celda(r.data[0].values, 'A25'), '', 'lo que la huella probó mío se limpia')
  assert.equal(r.limpiadas, 1)
})

test('y sin los rótulos retirados tampoco alcanza: el registro de rótulos sólo guarda lo de HOY', async () => {
  // `sheet_rotulos` conserva lo que la pestaña tiene ahora; en cuanto el rediseño reemplaza los
  // textos, la prueba de que los escribió el OS se pierde. Por eso la lista `RETIRADOS` existe.
  const r = await protegerBorrado(clienteQueLee(pestanaConElLayoutViejo()), 'id',
    [{ range: RANGO, values: comoLlegaALaEscritura(loQueEscribeLaBandaNueva()) }],
    { vaciarPropio: { mios: ['Concepto', 'Monto', 'Cuándo'] } })
  const plano = r.data[0].values.flat().map((c) => String(c ?? ''))
  assert.ok(plano.includes('LA LÍNEA — CUÁNTO SE PUEDE GASTAR HOY'),
    'sin el rótulo declarado, esa fila no tiene ancla y la guarda conserva — bien')
})
