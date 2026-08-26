// EL ANCLA DEL CONTEO — LOS TESTS SON EL DEFECTO DEL 15/08/2026.
//
// `CAJA!C7` publicaba $58.646.092 de efectivo contra un conteo del dueño de $12.000.000, y ningún
// control lo miraba porque era positivo. Y un pago en efectivo hecho el mismo día del conteo, después
// de contar, no se descontaba nunca. Si alguien revierte cualquiera de las dos correcciones, los
// tests de este archivo y los del techo en caja-efectivo-fisico.test.mjs se ponen rojos.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  HORA_EN_LAS_FUENTES, HAY_HORA_EN_LOS_MOVIMIENTOS, CRITERIO_MISMO_DIA,
  clasificar, entraALaVentana, diaDe, tieneHora,
  ventanaDelConteo, comparadorDeVentana, mismoDiaQueElConteo,
  instanteDelSello, ventanaDelSello, anclaDeSalida,
}  from './caja-ancla-por-instante.mjs'
import { formulaComprasEfectivoPosteriores, formulaCobrosEfectivoPosteriores } from './caja-posterior-al-corte.mjs'

// Seriales reales del archivo: 07/08/2026 = 46241, 08/08 = 46242, 06/08 = 46240.
const ARQ = 46241

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 1 · EL CASO MÍNIMO DEL PEDIDO: EL PAGO DEL MISMO DÍA, DESPUÉS DEL CONTEO

test('EL DEFECTO: un pago en efectivo el MISMO día del conteo se descuenta del cajón', () => {
  // El dueño cuenta $12.000.000 a las 11:00 y a las 16:00 paga $960.000 en billetes. Con la ventana
  // exclusiva ese pago quedaba afuera PARA SIEMPRE: al conteo siguiente ya era anterior a él. Es
  // exactamente lo que hay cargado el 07/08 en el archivo real — $960.000 de pagos en efectivo.
  const pago = { fecha: ARQ, entra: false }
  const r = entraALaVentana(pago, { dia: ARQ })
  assert.equal(r.entra, true, 'una SALIDA del día del conteo entra a la ventana: se descarga')
  assert.equal(r.ambiguo, true, 'y queda marcada como ambigua para que se pueda MOSTRAR cuánto es')
})

test('EL DEFECTO, del lado de la fórmula: la rama "Pagado" ya no usa la ventana exclusiva', () => {
  // Con el código de hoy esta fórmula traía `(fechaDeCaja>$D$7)` y el pago del día del arqueo caía
  // afuera. El `INT` no es decorativo: fija la unidad de comparación en el DÍA, que es la única que la
  // otra punta tiene (ninguna fuente de movimientos guarda hora — ver HORA_EN_LAS_FUENTES).
  const f = formulaComprasEfectivoPosteriores('$D$7')
  assert.match(f, />=INT\(\$D\$7\)/, 'una salida entra desde el día del conteo INCLUSIVE')
  assert.doesNotMatch(f, /\)>\$D\$7\)/, 'no puede quedar ninguna comparación estricta contra el arqueo pelado')
})

test('una ENTRADA del mismo día NO entra: se asume que el dueño ya la contó', () => {
  const cobro = { fecha: ARQ, entra: true }
  const r = entraALaVentana(cobro, { dia: ARQ })
  assert.equal(r.entra, false)
  assert.equal(r.ambiguo, true)
  // Las dos mitades del criterio empujan el número publicado HACIA ABAJO. Si alguien invierte una de
  // las dos, el criterio deja de ser conservador y este test lo dice.
  assert.match(CRITERIO_MISMO_DIA, /conservador/)
})

test('los cobros conservan la ventana EXCLUSIVA en su fórmula: son entradas', () => {
  const f = formulaCobrosEfectivoPosteriores('$D$7')
  assert.match(f, /">"&\$D\$7/)
  assert.doesNotMatch(f, />=/)
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 2 · LA INMUNIDAD QUE EL SELLO NO TIENE — EL $48,3M DEL 15/08

test('LA CORRECCIÓN DE UN DATO HISTÓRICO NO ES PLATA QUE ENTRÓ AL CAJÓN', () => {
  // El 15/08 la línea de jornales en efectivo saltó $48.286.717 porque 8 de 15 quincenas perdieron su
  // fecha en «Pagado el». El sello leyó ese salto como billetes entrando. Las 7 quincenas que SÍ
  // tienen fecha van del 16/02 al 17/07 — ninguna posterior al conteo del 07/08.
  const quincenas = [46069, 46187, 46200, 46215, 46231, 46060, 46074].map((f) => ({ fecha: f, entra: false }))
  const dentro = quincenas.filter((q) => !entraALaVentana(q, { dia: ARQ }).entra)
  assert.equal(dentro.length, quincenas.length,
    'ninguna quincena pagada antes del conteo puede aportar un peso a la ventana posterior')
  // Y las 8 sin fecha tampoco: sin fecha no hay ventana. Es la misma guarda ISNUMBER de las fórmulas.
  assert.equal(clasificar({ fecha: undefined }, { dia: ARQ }), 'sin-fecha')
  assert.equal(entraALaVentana({ fecha: '' }, { dia: ARQ }).entra, false)
})

test('la ventana se juzga por la fecha ECONÓMICA, no por cuándo apareció el número', () => {
  // Ésta es LA diferencia contra el sello, dicha como test: una fila vieja que se corrige HOY sigue
  // teniendo su fecha vieja, así que la ventana la deja afuera pase lo que pase con el total.
  assert.equal(clasificar({ fecha: ARQ - 1 }, { dia: ARQ }), 'dentro')
  assert.equal(clasificar({ fecha: ARQ + 1 }, { dia: ARQ }), 'posterior')
  assert.equal(clasificar({ fecha: ARQ }, { dia: ARQ }), 'mismo-dia')
  assert.equal(clasificar({ fecha: ARQ + 1 }, {}), 'sin-ancla')
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 3 · NO INVENTAR LA HORA QUE EL DATO NO TIENE

test('está MEDIDO que las fuentes de movimientos no guardan hora, y el modelo lo sabe', () => {
  // 1.346 valores leídos del archivo real el 15/08 con UNFORMATTED_VALUE; uno solo con parte horaria.
  assert.equal(HAY_HORA_EN_LOS_MOVIMIENTOS, false)
  const medidos = HORA_EN_LAS_FUENTES.reduce((s, f) => s + f.medidos, 0)
  const conHora = HORA_EN_LAS_FUENTES.reduce((s, f) => s + f.conHora, 0)
  assert.equal(medidos, 2198)
  assert.equal(conHora, 1, 'el día que esto cambie, hay que venir a leer el criterio antes de tocarlo')
})

test('con hora de los DOS lados el empate se ordena de verdad y deja de ser ambiguo', () => {
  // El tramo que hoy nunca corre. Se prueba igual: es el que tiene que estar listo el día que una
  // fuente empiece a guardar la hora, y un tramo sin test es un tramo que va a estar roto ese día.
  const ancla = { dia: ARQ, instante: ARQ + 11 / 24 }        // contó a las 11:00
  const tarde = entraALaVentana({ fecha: ARQ, instante: ARQ + 16 / 24, entra: false }, ancla)
  assert.deepEqual([tarde.entra, tarde.ambiguo], [true, false], 'pagó a las 16:00: después de contar')
  const temprano = entraALaVentana({ fecha: ARQ, instante: ARQ + 9 / 24, entra: false }, ancla)
  assert.deepEqual([temprano.entra, temprano.ambiguo], [false, false], 'pagó a las 09:00: ya estaba contado')
  // Y una ENTRADA de la tarde con hora SÍ entra — con el dato real no hace falta el criterio conservador.
  assert.equal(entraALaVentana({ fecha: ARQ, instante: ARQ + 16 / 24, entra: true }, ancla).entra, true)
})

test('sin instante en el ancla no se ordena aunque el movimiento traiga hora: no hay contra qué', () => {
  const r = entraALaVentana({ fecha: ARQ, instante: ARQ + 16 / 24, entra: false }, { dia: ARQ })
  assert.equal(r.ambiguo, true, 'un lado con hora y el otro sin hora sigue siendo un empate')
})

test('diaDe y tieneHora toleran el flotante con el que viajan los seriales', () => {
  assert.equal(diaDe(46241.75), 46241)
  assert.equal(tieneHora(46241.75), true)
  assert.equal(tieneHora(46241), false)
  assert.equal(tieneHora(46241 + 1e-12), false, 'un decimal fantasma de la API no es una hora')
  assert.equal(Number.isNaN(diaDe('hola')), true)
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 4 · EL LADO DE LAS FÓRMULAS

test('LA VENTANA TIENE TECHO: un movimiento con fecha FUTURA no entra ni sale', () => {
  // Reportado por el dueño el 26/08/2026: contó $18.000.000 y la pestaña publicaba $14.795.500.
  // De los $3.204.500 descontados, $3.064.500 eran pagos que TODAVÍA NO OCURRIERON — Pedro Tello
  // con fecha de caja 28/08 y los sueldos de oficina con fecha 01/09. Un pago programado es una
  // proyección, no un billete que salió del cajón.
  for (const entra of [true, false]) {
    assert.match(ventanaDelConteo('FECHA', '$D$7', entra), /\(FECHA<=TODAY\(\)\)/,
      entra ? 'un cobro futuro tampoco entró' : 'un pago futuro no salió')
  }
})

test('la rama inclusiva arrastra `>0`: con `>=` un cero sería una fecha válida', () => {
  // El anexo pide el histórico completo pasando `0` como ancla. Con `>=INT(0)` y sin este guard, cada
  // fila SIN fecha —que se coacciona a 0 con N()— entraría a la ventana. El defecto no daría error:
  // devolvería un número más grande.
  const f = ventanaDelConteo('FECHA', '0', false)
  assert.equal(f, '(FECHA>=INT(0))*(FECHA>0)*(FECHA<=TODAY())')
  assert.equal(ventanaDelConteo('FECHA', '$D$7', true), '(FECHA>INT($D$7))*(FECHA<=TODAY())')
  assert.equal(comparadorDeVentana(true), '>')
  assert.equal(comparadorDeVentana(false), '>=')
})

test('el trozo que aísla el empate compara días, no valores crudos', () => {
  assert.equal(mismoDiaQueElConteo('FECHA', '$D$7'), 'INT(FECHA)=INT($D$7)')
})

test('separador es_AR y paréntesis balanceados en lo que se escribe al Sheet', () => {
  const fs = [ventanaDelConteo('A', 'B', false), ventanaDelConteo('A', 'B', true),
    mismoDiaQueElConteo('A', 'B'), formulaComprasEfectivoPosteriores('$D$7')]
  for (const f of fs) {
    assert.doesNotMatch(f, /,/, 'el archivo está en es_AR: el separador es `;`')
    let n = 0
    for (const c of f) { if (c === '(') n++; if (c === ')') n-- }
    assert.equal(n, 0, `paréntesis desbalanceados en: ${f}`)
  }
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 5 · "TENÉS Q PODER SABER EN Q MOMENTO ANOTÉ LO Q PUSE"

test('el instante se calcula en hora de ARGENTINA, no en UTC', () => {
  // Un conteo tipeado a las 22:00 de Buenos Aires es 01:00 UTC del día siguiente: con el serial en UTC
  // la constancia diría que se anotó al otro día. 15/08/2026 22:00 ART = 16/08 01:00 UTC.
  const s = instanteDelSello(new Date('2026-08-16T01:00:00Z'))
  assert.equal(Math.trunc(s), 46249, 'sigue siendo el 15/08')
  assert.equal(Math.round((s - Math.trunc(s)) * 24), 22)
  assert.throws(() => instanteDelSello('cuando sea'), /fecha válida/)
})

test('el momento del conteo se informa como INTERVALO, que es lo único que se puede probar', () => {
  const previo = instanteDelSello(new Date('2026-08-15T13:09:00Z')) // 10:09 ART
  const visto = instanteDelSello(new Date('2026-08-15T16:47:00Z')) // 13:47 ART
  const v = ventanaDelSello({ visto, vistoPrevio: previo })
  assert.equal(v.acotado, true)
  assert.equal(Math.round(v.horas * 10) / 10, 3.6)
  assert.match(v.texto, /entre las 10:09 y las 13:47/)
  assert.equal(v.desde, previo, 'el extremo TEMPRANO se conserva: es el conservador para el desempate')
})

test('sin marca de la corrida anterior el intervalo queda ABIERTO y lo dice', () => {
  const visto = instanteDelSello(new Date('2026-08-15T16:47:00Z'))
  const v = ventanaDelSello({ visto })
  assert.equal(v.acotado, false)
  assert.equal(v.desde, null)
  assert.equal(v.horas, null)
  assert.match(v.texto, /no sé desde cuándo/, 'un intervalo abierto informa; uno cerrado a ojo miente')
  // Una marca posterior al instante visto es basura (reloj movido, celda pisada): no acota nada.
  assert.equal(ventanaDelSello({ visto, vistoPrevio: visto + 1 }).acotado, false)
  assert.throws(() => ventanaDelSello({}), /instante en que se vio/)
})

test('el día de gracia sólo corre cuando el sello NO trae hora', () => {
  // Con instante (`46259,708` = 25/08 16:59) no hay ambigüedad de medianoche: el sello dice cuándo
  // se vio el conteo. Con día pelado sí la hay, y ahí el día de gracia protege.
  const e = anclaDeSalida('$F$20')
  assert.match(e, /INT\(\$F\$20\)=\$F\$20/, 'la condición mira si el ancla tiene parte horaria')
  assert.match(e, /\$F\$20-1/, 'sin hora, sigue mirando un día antes')
  assert.equal(anclaDeSalida('0'), '0', 'sin ventana sigue sin ventana')
})
