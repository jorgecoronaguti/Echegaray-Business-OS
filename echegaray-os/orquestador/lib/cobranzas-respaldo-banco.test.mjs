import test from 'node:test'
import assert from 'node:assert/strict'
import {
  acreditacionesDelExtracto, respaldoDeCobro, cruzarConElBanco, textoDeRespaldo, desmiente,
  MARCA_SIN_RESPALDO, VENTANA_DIAS,
} from './cobranzas-respaldo-banco.mjs'
import { esCobrado } from './cobranzas-repaso.mjs'
import { auditar, C } from './cobranzas-en-cashflow.mjs'
import { ROTULO_CONCEPTO } from './cash-flow-matriz.mjs'
import { SUB_COBRANZAS } from './cobranzas-en-cashflow.mjs'

const serial = (iso) => Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.UTC(1899, 11, 30)) / 86400000)

/** `_BANCO_RAW`: fila 1 rótulo, 2 nota, 3 encabezado, 4 en adelante los movimientos. */
const bancoRaw = (movs) => [
  ['BANCO — réplica del extracto'], ['se actualiza con cada importación'],
  ['Fecha', 'Concepto', 'Importe', 'Referencia', 'Saldo', 'Naturaleza'],
  ...movs.map((m) => [serial(m.fecha), m.concepto ?? 'ACREDITACION', m.importe, m.ref ?? '', null, m.nat ?? 'cobranza']),
]

// `instrumento: echeq` por defecto: un cobro en efectivo NO se juzga contra el extracto (ver
// `deberiaEstarEnElBanco`), así que un fixture sin instrumento probaría el camino equivocado.
const cobro = (o) => ({ fila: 16, cliente: 'LA ESTRELLA', estado: 'Cobrado', endosado: false, instrumento: 'echeq', ...o })

test('las acreditaciones son los créditos del extracto, y el débito no entra', () => {
  const filas = bancoRaw([
    { fecha: '2026-08-04', importe: 15000000 },
    { fecha: '2026-08-05', importe: -3000000, concepto: 'PAGO PROVEEDOR' },
    { fecha: '2026-08-06', importe: 0, concepto: 'SALDO' },
  ])
  const a = acreditacionesDelExtracto(filas)
  assert.equal(a.length, 1, 'un pago que sale no puede respaldar un cobro que entra')
  assert.equal(a[0].importe, 15000000)
  assert.equal(a[0].fila, 4, 'la fila del archivo, para poder ir a mirarla')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// LOS TRES VEREDICTOS — "no está en mi lista" NO es "el banco no lo tiene"
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// El cruce viejo comparaba contra `ECHEQS_TERCEROS`: ocho echeqs transcriptos a mano, de un solo
// emisor, con corte al 22/07. Con esa fuente, CUATRO filas de LA ESTRELLA por $50.000.000 llevaban
// "▲ el banco no tiene un echeq con esta fecha e importe" — una afirmación que la fuente no podía
// sostener. Estos tests son esa distinción.

test('con acreditación única en la ventana, el "Cobrado" queda confirmado', () => {
  const acr = acreditacionesDelExtracto(bancoRaw([{ fecha: '2026-08-07', importe: 10000000 }]))
  const r = respaldoDeCobro(cobro({ serialCobro: serial('2026-08-05'), monto: 10000000 }), acr, { corte: serial('2026-08-14') })
  assert.equal(r.estado, 'confirma')
  assert.equal(desmiente(r), false)
})

test('una acreditación fuera de la ventana no confirma nada', () => {
  const acr = acreditacionesDelExtracto(bancoRaw([{ fecha: '2026-08-20', importe: 10000000 }]))
  const r = respaldoDeCobro(cobro({ serialCobro: serial('2026-08-05'), monto: 10000000 }), acr, { corte: serial('2026-08-30') })
  assert.equal(r.estado, 'sinRespaldo', `15 días es más que la ventana de ${VENTANA_DIAS}`)
})

test('SIN EXTRACTO QUE CUBRA LA FECHA NO SE NIEGA NADA: es "no sé", no "no entró"', () => {
  // El caso exacto de los $50M: el cruce estaba fechado al 22/07 y las filas eran del 02/07 al 05/08.
  // Un control que dice "el banco no lo tiene" cuando el banco todavía no contó ese día afirma más de
  // lo que sabe, y esa alerta imposible de apagar es la que enseña a ignorar las alertas.
  const acr = acreditacionesDelExtracto(bancoRaw([{ fecha: '2026-07-10', importe: 999 }]))
  const viejo = respaldoDeCobro(cobro({ serialCobro: serial('2026-08-05'), monto: 10000000 }), acr, { corte: serial('2026-07-22') })
  assert.equal(viejo.estado, 'fueraDeCorte')
  assert.equal(desmiente(viejo), false, 'no se puede desmentir un cobro que el extracto no alcanzó')
  // Con el extracto al 14/08, la MISMA fila ya se puede juzgar — y ahí sí, no está.
  const hoy = respaldoDeCobro(cobro({ serialCobro: serial('2026-08-05'), monto: 10000000 }), acr, { corte: serial('2026-08-14') })
  assert.equal(hoy.estado, 'sinRespaldo')
  assert.equal(desmiente(hoy), true)
})

test('la ventana también tiene que estar cubierta por el extracto, no sólo la fecha', () => {
  // Fecha de cobro 12/08 y extracto al 14/08: la acreditación todavía podría caer el 15. Negarlo
  // sería contar como definitivo lo que está en curso.
  const r = respaldoDeCobro(cobro({ serialCobro: serial('2026-08-12'), monto: 500 }), [], { corte: serial('2026-08-14') })
  assert.equal(r.estado, 'fueraDeCorte')
})

test('dos acreditaciones iguales no eligen una: se declara la ambigüedad', () => {
  const acr = acreditacionesDelExtracto(bancoRaw([
    { fecha: '2026-08-04', importe: 10000000 }, { fecha: '2026-08-05', importe: 10000000 },
  ]))
  const r = respaldoDeCobro(cobro({ serialCobro: serial('2026-08-04'), monto: 10000000 }), acr, { corte: serial('2026-08-14') })
  assert.equal(r.estado, 'ambiguo')
  assert.equal(r.cuantos, 2)
  assert.equal(desmiente(r), false, 'ambiguo no es negativo: no se escribe donde el mapeo dice que no')
})

test('sólo se juzgan los cobrados: un pendiente no dice haber entrado, y un endosado no va a entrar', () => {
  const cobros = [
    cobro({ fila: 37, serialCobro: serial('2026-08-05'), monto: 10000000, estado: 'Pendiente' }),
    cobro({ fila: 43, serialCobro: serial('2026-08-05'), monto: 10000000, endosado: true }),
    cobro({ fila: 16, serialCobro: serial('2026-08-05'), monto: 15000000 }),
  ]
  const r = cruzarConElBanco(cobros, bancoRaw([{ fecha: '2026-08-14', importe: 1 }]), { esCobrado })
  assert.equal(r.veredictos.length, 1, 'sólo la fila 16')
  assert.equal(r.veredictos[0].cobro.fila, 16)
})

test('el corte se DERIVA del extracto: un corte tipeado se queda viejo sin gritar', () => {
  const r = cruzarConElBanco([], bancoRaw([
    { fecha: '2026-07-10', importe: 1 }, { fecha: '2026-08-14', importe: 2 },
  ]), { esCobrado })
  assert.equal(r.corte, serial('2026-08-14'))
  assert.equal(r.acreditaciones, 2)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EL AVISO: DEVENGADO DISFRAZADO DE PERCIBIDO
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('el texto de la pestaña dice qué pasa y qué hacer, no sólo que algo está mal', () => {
  const t = textoDeRespaldo({ estado: 'sinRespaldo' }, { alerta: '▲', fechaCorte: '2026-08-14' })
  assert.match(t, new RegExp(MARCA_SIN_RESPALDO))
  assert.match(t, /ingreso REAL/, 'dice qué consecuencia tiene en el cuadro')
  assert.match(t, /2026-08-14/, 'y contra qué corte se juzgó: sin eso, el aviso no se puede desmentir')
  // El que no se puede juzgar NO lleva la marca: si la llevara, sería la alerta que nadie puede apagar.
  const fuera = textoDeRespaldo({ estado: 'fueraDeCorte' }, { alerta: '▲', fechaCorte: '2026-07-22' })
  assert.doesNotMatch(fuera, new RegExp(MARCA_SIN_RESPALDO))
  assert.match(fuera, /todavía no llega/)
})

/** Un cuadro de un mes con las dos líneas, para el cuadre completo. */
const cuadroAgosto = (real, proy) => [
  [{ valor: ROTULO_CONCEPTO }, { valor: 'ago', numero: serial('2026-08-01') }],
  [{ valor: 'Ingresos reales' }, { valor: '', numero: real }],
  [{ valor: `    ${SUB_COBRANZAS}` }, { valor: '', numero: real }],
  [{ valor: 'Ingresos proyectados' }, { valor: '', numero: proy }],
  [{ valor: `    ${SUB_COBRANZAS}` }, { valor: '', numero: proy }],
]

/** Una fila de Cobranzas para `auditar`. */
function filaCob({ total, cliente = 'LA ESTRELLA', estado = 'Cobrado', cobro: fc, forma = 'eCheq' }) {
  const f = []
  const set = (j, valor, numero = null) => { f[j] = { valor, numero, formula: null, formato: null, derivada: false } }
  set(C.total, String(total), total)
  set(C.unidad, 'Civil'); set(C.cliente, cliente); set(C.estado, estado); set(C.forma, forma)
  set(C.fechaCobro, fc, serial(fc))
  return f
}

test('auditar declara el cobrado sin respaldo — y NO aborta la publicación por eso', () => {
  const cob = [filaCob({ total: 15000000, cobro: '2026-07-02' })]
  // El extracto tiene que CUBRIR la fecha del cobro por los dos extremos, o el veredicto sería "no sé".
  const banco = bancoRaw([{ fecha: '2026-06-01', importe: 999 }, { fecha: '2026-08-14', importe: 123 }])
  const r = auditar(cob, cuadroAgosto(0, 0), { filasBanco: banco })
  // El cuadro de julio no existe en este fixture: lo que importa es el cruce, que no depende de él.
  assert.equal(r.cobradoSinRespaldo.length, 1)
  assert.equal(r.cobradoSinRespaldo[0].cobro.fila, 5)
  assert.equal(r.respaldo.montos.sinRespaldo, 15000000)
  // Un cobro sin respaldo NO baja el veredicto: el portón de la publicación es para el cuadro mal
  // calculado, no para un dato que sólo el dueño o una importación del banco pueden cerrar.
  const sano = auditar([], cuadroAgosto(0, 0), { filasBanco: banco })
  assert.equal(sano.ok, true)
})

test('sin `_BANCO_RAW` el cruce no se inventa: la lista queda vacía y se sabe', () => {
  const r = auditar([filaCob({ total: 15000000, cobro: '2026-08-02' })], cuadroAgosto(15000000, 0))
  assert.equal(r.respaldo, null, 'no hay extracto: no hay veredicto bancario')
  assert.deepEqual(r.cobradoSinRespaldo, [])
  assert.equal(r.ok, true, 'y el cuadre del mes sigue valiendo por sí solo')
})

test('el efectivo no se juzga contra el extracto: nunca va a estar ahí', () => {
  // Si se juzgara, TODA fila cobrada en efectivo quedaría "sin respaldo" y la columna se llenaría de
  // alertas falsas — que es exactamente cómo se pierde la alerta verdadera.
  const cob = [
    filaCob({ total: 500000, cobro: '2026-08-01', forma: 'Efectivo' }),
    filaCob({ total: 500000, cobro: '2026-08-01', forma: 'Transferencia' }),
  ]
  const r = auditar(cob, cuadroAgosto(1000000, 0), {
    filasBanco: bancoRaw([{ fecha: '2026-07-01', importe: 1 }, { fecha: '2026-08-14', importe: 2 }]),
  })
  assert.equal(r.cobradoSinRespaldo.length, 1, 'sólo la transferencia, que sí tenía que pasar por la cuenta')
  assert.equal(r.cobradoSinRespaldo[0].cobro.instrumento, 'transferencia')
  const efectivo = r.respaldo.veredictos.find((v) => v.cobro.instrumento === 'efectivo')
  assert.equal(efectivo.estado, 'noPasaPorLaCuenta', 'se declara, no desaparece')
})

test('UN EXTRACTO ILEGIBLE NO SE CUENTA COMO "todo en orden": se declara', () => {
  // MEDIDO EN VIVO el 15/08: `_BANCO_RAW` tenía 406 filas y el cruce vio CERO acreditaciones, porque
  // la lectura salía sin UNFORMATTED_VALUE y todo llegaba como texto. El efecto era invisible —cero
  // acreditaciones y corte nulo mandan TODO cobro a "el extracto no llega a esa fecha"— y el aviso no
  // se emitía nunca. Un control que se apaga solo tiene que gritar que se apagó.
  const formateado = [
    ['BANCO'], ['réplica'], ['Fecha', 'Concepto', 'Importe'],
    ['14/08/2026', 'ACREDITACION', '$15.000.000'],
    ['13/08/2026', 'ACREDITACION', '$10.000.000'],
  ]
  const r = cruzarConElBanco([cobro({ serialCobro: serial('2026-07-02'), monto: 15000000 })], formateado, { esCobrado })
  assert.match(r.ilegible, /UNFORMATTED_VALUE/)
  assert.equal(r.veredictos[0].estado, 'extractoIlegible')
  assert.equal(r.sinRespaldo.length, 0, 'no se niega ningún cobro con un extracto que no se entiende')
  assert.match(textoDeRespaldo(r.veredictos[0], { alerta: '▲' }), /no pude leer/)
  // Y con el MISMO contenido bien leído, el cruce funciona: la diferencia es sólo el render.
  const bien = cruzarConElBanco([cobro({ serialCobro: serial('2026-07-02'), monto: 15000000 })],
    bancoRaw([{ fecha: '2026-08-14', importe: 15000000 }]), { esCobrado })
  assert.equal(bien.ilegible, null)
  assert.equal(bien.acreditaciones, 1)
})

test('un extracto vacío de verdad no es un extracto ilegible', () => {
  const r = cruzarConElBanco([], [['BANCO'], ['réplica'], ['Fecha', 'Concepto', 'Importe']], { esCobrado })
  assert.equal(r.ilegible, null, 'tres filas de encabezado y ningún movimiento es un archivo nuevo, no un error de lectura')
})

test('LA VENTANA DEL EXTRACTO TIENE DOS EXTREMOS: lo anterior al primer movimiento tampoco se niega', () => {
  // MEDIDO EN VIVO el 15/08: mirando sólo el corte superior, el cruce declaró "sin respaldo" 22
  // cobros por $221.523.370 — con ARCOR del 3 de febrero y IMOTOR del 15 de enero adentro. El
  // extracto importado arranca en julio: no están porque el extracto no llega, no porque no entraron.
  const extracto = bancoRaw([
    { fecha: '2026-07-05', importe: 1000 }, { fecha: '2026-08-14', importe: 2000 },
  ])
  const viejo = cruzarConElBanco([cobro({ fila: 7, serialCobro: serial('2026-01-15'), monto: 18150000 })], extracto, { esCobrado })
  assert.equal(viejo.veredictos[0].estado, 'anteriorAlExtracto')
  assert.equal(viejo.sinRespaldo.length, 0, 'un cobro de enero no se niega con un extracto que arranca en julio')
  assert.equal(viejo.desde, serial('2026-07-05'), 'el inicio se DERIVA del dato, igual que el corte')
  // Y adentro de la ventana, el mismo importe ausente SÍ se niega: la ventana no es un colchón.
  const dentro = cruzarConElBanco([cobro({ fila: 7, serialCobro: serial('2026-07-20'), monto: 18150000 })], extracto, { esCobrado })
  assert.equal(dentro.veredictos[0].estado, 'sinRespaldo')
})

// ═══ UN COBRO NO LLEGA COMO UN MOVIMIENTO DEL BANCO (19/08/2026) ═══
//
// El control denunció $87.044.023 "cobrado sin respaldo". Rastreados contra el extracto, $82,5M
// estaban: el cruce buscaba UN movimiento por cobro. Los dos casos reales están acá con sus cifras.
test('el anticipo que entró en tres transferencias el mismo día se confirma', () => {
  // Quattropani, 28/07/2026: $65.678.419,31 en tres credin.
  const acred = [
    { fecha: 100, importe: 35000000, concepto: 'Transferencia recibida - credin' },
    { fecha: 100, importe: 30000000, concepto: 'Transferencia recibida - credin' },
    { fecha: 100, importe: 678419.31, concepto: 'Transferencia recibida - credin' },
  ]
  const r = respaldoDeCobro({ serialCobro: 100, monto: 65678419.31 }, acred, { corte: 120, desde: 1 })
  assert.equal(r.estado, 'confirma')
  assert.equal(r.partes.length, 3)
})

test('el cobro que llegó mitad echeq y mitad transferencia, en días distintos, se confirma', () => {
  // MESSINA: $16.832.407,20 = echeq $16.807.425,92 del 29/07 + transferencia $24.981,28 del 28/07.
  const acred = [
    { fecha: 101, importe: 16807425.92, concepto: 'Deposito E-cheq 48hs Presencia Bsr' },
    { fecha: 100, importe: 24981.28, concepto: 'Transferencia recibida - De manufacturas quimicas' },
  ]
  const r = respaldoDeCobro({ serialCobro: 101, monto: 16832407.20 }, acred, { corte: 120, desde: 1 })
  assert.equal(r.estado, 'confirma')
  assert.equal(r.partes.length, 2)
})

test('lo que el banco NO tiene sigue diciendo que no lo tiene', () => {
  // El otro cobro de MESSINA, $4.300.876,36 del 20/07: no hay ningún importe ni suma que lo explique.
  const acred = [{ fecha: 100, importe: 3940000, concepto: 'Deposito e-cheq int ots plazas' }]
  const r = respaldoDeCobro({ serialCobro: 100, monto: 4300876.36 }, acred, { corte: 120, desde: 1 })
  assert.equal(r.estado, 'sinRespaldo')
})

test('dos combinaciones distintas que dan el mismo total NO confirman ninguna', () => {
  const acred = [
    { fecha: 100, importe: 500 }, { fecha: 100, importe: 500 },
    { fecha: 100, importe: 300 }, { fecha: 100, importe: 700 },
  ]
  const r = respaldoDeCobro({ serialCobro: 100, monto: 1000 }, acred, { corte: 120, desde: 1 })
  assert.equal(r.estado, 'ambiguo')
})

test('no se arma una suma con más partes de las declaradas', () => {
  // Cuatro sumandos para MAXIMO_PARTES=3: con suficientes sumandos cualquier número sale, y por eso
  // el tope existe. Este cobro NO se confirma.
  const acred = [
    { fecha: 100, importe: 100 }, { fecha: 100, importe: 200 },
    { fecha: 100, importe: 300 }, { fecha: 100, importe: 400 },
  ]
  const r = respaldoDeCobro({ serialCobro: 100, monto: 1000 }, acred, { corte: 120, desde: 1 })
  assert.equal(r.estado, 'sinRespaldo')
})

test('una acreditación MAYOR al cobro no puede ser parte de su suma', () => {
  const acred = [{ fecha: 100, importe: 9999999 }, { fecha: 100, importe: 600 }, { fecha: 100, importe: 400 }]
  const r = respaldoDeCobro({ serialCobro: 100, monto: 1000 }, acred, { corte: 120, desde: 1 })
  assert.equal(r.estado, 'confirma')
  assert.equal(r.partes.length, 2)
})
