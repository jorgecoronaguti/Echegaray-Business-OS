import test from 'node:test'
import assert from 'node:assert/strict'
import {
  agruparPorObra, aPagoDelPortal, estadoFijadoDe, obrasQueFiltran, pagosDelEsquema, pagosEnPantalla,
  publicadoAlPortal, sinImportes, tipoDelPago, SIN_OBRA, type FilaEsquema,
} from './esquema.ts'
import { estadoDePago, proximoPago, resumenDeCobro, type ResumenCobro } from './cronograma.ts'
import { contratoDelConjunto } from './esquema.ts'

/** Una fila de `esquema_pago` publicada. Los tests cambian sólo lo que están probando. */
function fila(cambios: Partial<FilaEsquema> = {}): FilaEsquema {
  return {
    id: 'f1',
    obra_id: 'pisos-industriales',
    concepto: 'Anticipo (1 de 3)',
    fecha: '2026-09-15',
    monto: '5726423.60',
    reparo: null,
    estado: 'a_vencer',
    medio: null,
    visible_portal: true,
    publicado_at: '2026-08-26T12:00:00Z',
    cambio_pendiente: false,
    orden: 1,
    ...cambios,
  }
}

const TODAS = () => true
const NOMBRES = new Map([['pisos-industriales', 'Pisos Industriales'], ['quattropani', 'Salón Comercial']])

// ── EL PREDICADO DE PUBLICACIÓN ──────────────────────────────────────────────────────────────

test('visible_portal = false NO llega al portal', () => {
  assert.equal(publicadoAlPortal(fila({ visible_portal: false })), false)
  assert.equal(pagosDelEsquema([fila({ visible_portal: false })], NOMBRES, TODAS).length, 0)
})

test('un esquema armado pero sin publicar NO llega al portal', () => {
  assert.equal(publicadoAlPortal(fila({ publicado_at: null })), false)
  assert.equal(pagosDelEsquema([fila({ publicado_at: null })], NOMBRES, TODAS).length, 0)
})

test('cambio_pendiente NO esconde una fila ya publicada', () => {
  // La policy `esquema_pago_select` no lo mira. Esconderla dejaría al cliente sin un pago que ya le
  // fue comunicado.
  assert.equal(publicadoAlPortal(fila({ cambio_pendiente: true })), true)
})

// ── EL ALCANCE POR OBRA ──────────────────────────────────────────────────────────────────────

test('el filtro por obra se aplica sobre lo publicado', () => {
  const filas = [fila({ id: 'a', obra_id: 'pisos-industriales' }), fila({ id: 'b', obra_id: 'quattropani' })]
  const solo = pagosDelEsquema(filas, NOMBRES, (o) => o === 'quattropani')
  assert.deepEqual(solo.map((p) => p.id), ['b'])
})

// ── LA LECTURA DE UNA FILA ───────────────────────────────────────────────────────────────────

test('cobrado usa la fecha como fecha de pago Y como la del cronograma', () => {
  const p = aPagoDelPortal(fila({ estado: 'cobrado', fecha: '2026-08-21' }), 'Pisos Industriales')
  assert.equal(p.fechaPago, '2026-08-21')
  // `esquema_pago` guarda UNA fecha y es el mismo día: el cronograma la mostraba «sin fecha»
  // para todo lo ya pagado, y el cliente no podía decir cuándo pagó su anticipo.
  assert.equal(p.fechaPrevista, '2026-08-21')
  assert.equal(estadoDePago(p, '2026-08-26'), 'pagado')
  // Y no aparece como pendiente: un cobrado que además vence sería la misma plata contada dos veces.
  // CERO, no `null`: hay una línea en pesos y está cobrada, así que «no debe nada» es un HECHO y se
  // escribe. `null` es para cuando no hay ninguna línea de esta moneda — ahí no sabemos, no es cero.
  assert.equal(resumenDeCobro([p], null, '2026-08-26').pendiente, 0)
})

test('retenido es el fondo de reparo y NO suma a pendiente', () => {
  assert.equal(tipoDelPago({ estado: 'retenido', concepto: 'Fondo de reparo' }), 'fondo_reparo')
  const p = aPagoDelPortal(fila({ estado: 'retenido', monto: '1000000' }), 'Pisos Industriales')
  assert.equal(p.tipo, 'fondo_reparo')
  // CERO: el fondo de reparo es plata que la empresa RETIENE, así que de esta obra el cliente no
  // debe nada — y eso es un hecho que el pie puede escribir, no un dato que falte.
  assert.equal(resumenDeCobro([p], null, '2026-08-26').pendiente, 0)
  assert.equal(resumenDeCobro([p], null, '2026-08-26').nPendiente, 0)
  assert.equal(proximoPago([p]), null)
})

test('un certificado CON reparo sigue siendo deuda del cliente', () => {
  // `reparo` es cuánto se retiene DE ese pago, no un pago aparte. Marcarlo como fondo de reparo lo
  // sacaría de «pendiente» y subestimaría lo que el cliente debe.
  const p = aPagoDelPortal(fila({ concepto: 'Certificado 1', reparo: '500000', monto: '1000000' }), 'x')
  assert.equal(p.tipo, 'certificado')
  assert.equal(resumenDeCobro([p], null, '2026-08-26').pendiente, 1_000_000)
})

test('previsto se fija como «sin factura»: una fecha pasada nuestra no es mora del cliente', () => {
  assert.equal(estadoFijadoDe({ estado: 'previsto' }), 'sin_factura')
  const p = aPagoDelPortal(fila({ estado: 'previsto', fecha: '2026-01-01' }), 'x')
  assert.equal(estadoDePago(p, '2026-08-26'), 'sin_factura')
})

test('vencido y a_vencer NO se fijan: los decide la fecha, que es la palanca que se mueve', () => {
  assert.equal(estadoFijadoDe({ estado: 'vencido' }), null)
  const movido = aPagoDelPortal(fila({ estado: 'vencido', fecha: '2026-12-01' }), 'x')
  assert.equal(estadoDePago(movido, '2026-08-26'), 'programado')
})

// ── EL ESTADO QUE DECLARA EL SHEET LLEGA A LA PANTALLA ───────────────────────────────────────
//
// El defecto: la pantalla recalculaba por fecha estados que el Sheet ya había declarado, así que la
// columna O de Cobranzas no llegaba nunca al cliente.

test('cobrado se fija: no se vuelve a derivar de la fecha', () => {
  assert.equal(estadoFijadoDe({ estado: 'cobrado' }), 'pagado')
  const p = aPagoDelPortal(fila({ estado: 'cobrado', fecha: '2026-01-15' }), 'x')
  assert.equal(estadoDePago(p, '2026-08-26'), 'pagado')
})

test('el fondo de reparo NO se pinta vencido: es plata retenida, no una deuda del cliente', () => {
  assert.equal(estadoFijadoDe({ estado: 'retenido' }), 'programado')
  // Con la fecha de devolución ya pasada, derivar por fecha le reclamaba al cliente un pago que
  // nadie le está pidiendo — la plata la tiene la empresa.
  const p = aPagoDelPortal(fila({ estado: 'retenido', fecha: '2026-01-01' }), 'x')
  assert.equal(estadoDePago(p, '2026-08-26'), 'programado')
  assert.equal(p.tipo, 'fondo_reparo')
})

test('monto NULL sigue siendo NULL, nunca 0', () => {
  assert.equal(aPagoDelPortal(fila({ monto: null }), 'x').monto, null)
  assert.equal(aPagoDelPortal(fila({ monto: '0' }), 'x').monto, 0)
})

test('sin la columna moneda se asume ARS; con USD no se mezcla en el total en pesos', () => {
  assert.equal(aPagoDelPortal(fila(), 'x').moneda, 'ARS')
  const dolar = aPagoDelPortal(fila({ moneda: 'USD', monto: '4235' }), 'x')
  assert.equal(dolar.moneda, 'USD')
  const r = resumenDeCobro([dolar], null, '2026-08-26')
  // NI SIQUIERA CERO. Quattropani tiene todo su cronograma en dólares y leía «Pendiente $ 0»
  // teniendo nueve certificados por delante: cero es una afirmación y dice que no debe nada.
  assert.equal(r.pendiente, null)
  // Y NO se cuenta como «no entra en estos totales»: entra, en la columna de dólares del pie. El
  // aviso de `sinMonto` es para lo que de verdad quedó afuera — un cobro sin importe cargado.
  assert.equal(r.sinMonto, 0)
  assert.equal(r.enOtraMoneda, 1)
})

// ── `puede_ver_montos = false` ───────────────────────────────────────────────────────────────

test('sin puede_ver_montos el importe no sale de la capa de datos', () => {
  const pagos = pagosDelEsquema([fila(), fila({ id: 'f2', monto: '99' })], NOMBRES, TODAS)
  const recortados = sinImportes(pagos)
  assert.deepEqual(recortados.map((p) => p.monto), [null, null])
  // NULL, no 0: cero afirmaría que esos pagos no valen nada.
  assert.ok(recortados.every((p) => p.monto !== 0))
  // Y lo demás sigue viajando: fechas, rótulos y comprobantes son lo que sí puede ver.
  assert.deepEqual(recortados.map((p) => p.fechaPrevista), ['2026-09-15', '2026-09-15'])
})

// ── EL AGRUPAMIENTO ──────────────────────────────────────────────────────────────────────────

test('las filas sin obra van a su propio bloque, al final, y no se descartan', () => {
  const filas = [
    fila({ id: 'a', obra_id: 'quattropani', orden: 1 }),
    fila({ id: 'b', obra_id: null, orden: 2 }),
    fila({ id: 'c', obra_id: 'pisos-industriales', orden: 3 }),
  ]
  const bloques = agruparPorObra(pagosDelEsquema(filas, NOMBRES, TODAS))
  assert.deepEqual(bloques.map((b) => b.nombre), ['Pisos Industriales', 'Salón Comercial', SIN_OBRA])
  assert.equal(bloques.at(-1)?.obraId, null)
  // Las tres filas siguen ahí: ninguna se descartó ni se repartió entre las obras.
  assert.equal(bloques.reduce((s, b) => s + b.pagos.length, 0), 3)
})

test('una obra cuyo id no resuelve a nombre cae en «sin obra», no en un bloque sin título', () => {
  const bloques = agruparPorObra(pagosDelEsquema([fila({ obra_id: 'obra-borrada' })], NOMBRES, TODAS))
  assert.deepEqual(bloques.map((b) => b.nombre), [SIN_OBRA])
})

test('el orden es `orden` y la fecha desempata — el mismo que lee la pantalla 32', () => {
  const filas = [
    fila({ id: 'c', orden: 2, fecha: '2026-01-01' }),
    fila({ id: 'a', orden: 1, fecha: '2026-05-05' }),
    fila({ id: 'b', orden: 1, fecha: '2026-02-02' }),
  ]
  assert.deepEqual(pagosDelEsquema(filas, NOMBRES, TODAS).map((p) => p.id), ['b', 'a', 'c'])
})

test('un cobro sin obra NO borra el contrato del cliente', () => {
  // Desde que los cobros que no nombran obra se publican —«Saldo obras San Francisco», «de todas las
  // obras»— el bloque sin obra existe casi siempre. Con la regla vieja bastaba para escribir
  // «CONTRATO sin cargar» a un cliente cuyo contrato la ficha muestra en $299,68 M.
  const contratos = new Map([['pisos', { monto: 40_000_000, moneda: 'ARS' as const }], ['electrica', { monto: 7_728_254, moneda: 'ARS' as const }]])
  const bloques = [
    { obraId: 'pisos', nombre: 'Pisos', pagos: [] },
    { obraId: 'electrica', nombre: 'Eléctrica', pagos: [] },
    { obraId: null, nombre: '', pagos: [] },
  ] as never
  assert.deepEqual(contratoDelConjunto(bloques, contratos), { monto: 47_728_254, moneda: 'ARS', obras: 2, sinContrato: 0, cobradoAntes: 0 })

  // ═══ UNA OBRA SIN CONTRATO YA NO ANULA A LAS OTRAS (26/08/2026) ═══
  //
  // Devolvía `null` en cuanto faltaba una, y a La Estrella —Galpón 9 por $49,7 M y Oficina y Fábrica
  // de Palitos por $246,1 M, las dos cargadas— le escribía «CONTRATO sin cargar» por una tercera
  // obra vieja sin contrato. Callar dos contratos ciertos deja al cliente con menos verdad. Se suma
  // lo que hay y se DICE cuántas faltan: el pie lo escribe al lado de la cifra.
  const falta = new Map([['pisos', { monto: 40_000_000, moneda: 'ARS' as const }], ['electrica', { monto: null, moneda: 'ARS' as const }]])
  assert.deepEqual(contratoDelConjunto(bloques, falta), { monto: 40_000_000, moneda: 'ARS', obras: 1, sinContrato: 1, cobradoAntes: 0 })

  // Lo que sigue dando `null`: que NINGUNA obra tenga contrato. Ahí no hay nada que publicar.
  const ninguno = new Map([['pisos', { monto: null, moneda: 'ARS' as const }], ['electrica', { monto: null, moneda: 'ARS' as const }]])
  assert.equal(contratoDelConjunto(bloques, ninguno), null)

  // Sin ninguna obra no hay contra qué contrato comparar.
  assert.equal(contratoDelConjunto([{ obraId: null, nombre: '', pagos: [] }] as never, contratos), null)
})

test('el contrato de una obra ANTERIOR no entra en el total del conjunto', () => {
  // San Francisco: el pie publicaba $299,7 M contratados sumando los $204,4 M de «Galpones,
  // Mampostería, Cancha de Padel», cuyos cobros son históricos y NO están en «pagado». Un contrato
  // comparado contra los pagos de otro no cierra nunca.
  const contratos = new Map([
    ['pisos', { monto: 47_590_272, moneda: 'ARS' as const }],
    ['galpones', { monto: 204_361_104, moneda: 'ARS' as const }],
  ])
  const enCurso = { historico: false } as never
  const viejo = { historico: true } as never
  const bloques = [
    { obraId: 'pisos', nombre: 'Pisos', pagos: [enCurso] },
    { obraId: 'galpones', nombre: 'Galpones', pagos: [viejo, viejo] },
  ] as never
  assert.deepEqual(contratoDelConjunto(bloques, contratos), { monto: 47_590_272, moneda: 'ARS', obras: 1, sinContrato: 0, cobradoAntes: 0 })

  // Una obra con cobros de las dos clases SÍ cuenta: sigue en curso.
  const mixto = [{ obraId: 'galpones', nombre: 'Galpones', pagos: [viejo, enCurso] }] as never
  assert.equal(contratoDelConjunto(mixto, contratos)?.monto, 204_361_104)
})

test('un cobro de obra ANTERIOR no suma al contrato en curso', () => {
  // Javier Sánchez leía «Pagado $131 M» contra $299 M contratados, y $77 M de eso eran cobros de
  // obras que ya habían terminado. El contrato contra el que se comparan estos totales es el de las
  // obras EN CURSO: mezclarlos hacía que «pagado» y «falta certificar» dieran cualquier cosa.
  const enCurso = aPagoDelPortal(fila({ monto: '10000000', estado: 'cobrado', fecha: '2026-08-01' }), 'Pisos')
  const anterior = { ...aPagoDelPortal(fila({ monto: '77350000', estado: 'cobrado', fecha: '2026-01-15' }), 'Pisos'), historico: true }
  const r = resumenDeCobro([enCurso, anterior], 40_000_000, '2026-08-26')
  assert.equal(r.pagado, 10_000_000)
  // Y por eso «falta certificar» sigue siendo el resto real del contrato vigente.
  assert.equal(r.faltaCertificar, 30_000_000)
})

test('el histórico llega marcado desde la base, y por defecto NO lo es', () => {
  assert.equal(aPagoDelPortal(fila({}), 'x').historico, false)
  assert.equal(aPagoDelPortal({ ...fila({}), historico: true } as never, 'x').historico, true)
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// EL CRONOGRAMA REAL DE INTER MOTOR SRL — cuatro obras y un corte que las cruza
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// Leído de `esquema_pago` el 27/08/2026. Es el cliente donde el dueño vio el defecto: «no está
// reflejando bien lo que sale el contrato de cada obra, lo pagado y lo pendiente a medida que toco
// los filtros». Su corte (`clientes.portal_cobros_desde`) es el 01/07/2026 y «Galpones, Mampostería,
// Cancha de Padel» tiene pagos a los dos lados.

/** `[obra, orden, monto, neto, iva, fecha, cobrado, historico]` tal como está en la base. */
const INTER_MOTOR: [string | null, number, number, number, number, string, boolean, boolean][] = [
  ['pisos-industriales', 1, 5_726_423.6, 5_726_423.6, 0, '2026-08-21', true, false],
  ['pisos-industriales', 2, 9_034_356.2, 9_034_356.2, 0, '2026-09-04', false, false],
  ['pisos-industriales', 3, 9_034_356.2, 9_034_356.2, 0, '2026-09-11', false, false],
  ['entrepiso-y-escalera', 1, 1_932_063.5, 1_932_063.5, 0, '2026-09-04', false, false],
  ['entrepiso-y-escalera', 2, 1_932_063.5, 1_932_063.5, 0, '2026-09-11', false, false],
  ['instalacion-electrica', 1, 12_100_000, 10_000_000, 2_100_000, '2026-08-26', true, false],
  ['instalacion-electrica', 2, 10_000_000, 10_000_000, 0, '2026-09-15', false, false],
  // San Francisco: cinco pagos arriba del corte y cuatro abajo. La base marca `historico` fila por
  // fila, comparando la fecha del pago contra el 01/07/2026.
  ['san-francisco', 1, 18_150_000, 15_000_000, 3_150_000, '2026-01-15', true, true],
  ['san-francisco', 2, 24_200_000, 20_000_000, 4_200_000, '2026-05-08', true, true],
  ['san-francisco', 3, 20_000_000, 20_000_000, 0, '2026-05-08', true, true],
  ['san-francisco', 4, 10_000_000, 10_000_000, 0, '2026-06-12', true, true],
  ['san-francisco', 5, 5_000_000, 5_000_000, 0, '2026-06-26', true, true],
  ['san-francisco', 6, 5_000_000, 5_000_000, 0, '2026-07-08', true, false],
  ['san-francisco', 7, 6_215_646, 6_215_646, 0, '2026-07-16', true, false],
  ['san-francisco', 8, 16_200_000, 16_200_000, 0, '2026-07-17', true, false],
  ['san-francisco', 9, 9_273_576.4, 9_273_576.4, 0, '2026-08-21', true, false],
  // «Saldo obras San Francisco — 1/4 … 4/4»: acordados con el cliente y sin obra asignada.
  [null, 1001, 11_914_816, 11_914_816, 0, '2026-09-30', false, false],
  [null, 1002, 11_914_816, 11_914_816, 0, '2026-10-15', false, false],
  [null, 1003, 11_914_816, 11_914_816, 0, '2026-10-30', false, false],
  [null, 1004, 11_914_815, 11_914_815, 0, '2026-11-13', false, false],
]

const NOMBRES_IM = new Map([
  ['pisos-industriales', 'Pisos Industriales'],
  ['entrepiso-y-escalera', 'Entrepiso y Escalera'],
  ['instalacion-electrica', 'Instalación Eléctrica'],
  ['san-francisco', 'Galpones, Mampostería, Cancha de Padel'],
])

const CONTRATOS_IM = new Map([
  ['pisos-industriales', { monto: 47_590_272, moneda: 'ARS' as const }],
  ['entrepiso-y-escalera', { monto: 7_728_254, moneda: 'ARS' as const }],
  ['instalacion-electrica', { monto: 40_000_000, moneda: 'ARS' as const }],
  ['san-francisco', { monto: 204_361_104, moneda: 'ARS' as const }],
])

const interMotor = () => pagosDelEsquema(
  INTER_MOTOR.map(([obra, orden, monto, neto, iva, fecha, cobrado, historico]) => ({
    ...fila({ orden, fecha }),
    id: `${obra ?? 'sin-obra'}-${orden}`,
    obra_id: obra,
    monto: String(monto), neto: String(neto), iva: String(iva),
    estado: cobrado ? 'cobrado' : 'a_vencer',
    historico,
  })),
  NOMBRES_IM, TODAS,
)

/** Los centavos de `9_273_576.4` sumados nueve veces no se comparan con `===`. */
const redondo = (n: number | null) => (n == null ? null : Math.round(n))

// ── EL DEFECTO 1: EL CONTRATO ENTERO CONTRA UNA PARTE DE SUS PAGOS ──────────────────────────

test('el corte del dueño manda: lo anterior no se muestra, y el contrato se achica en esa medida', () => {
  // ═══ LA DECISIÓN, DEL DUEÑO Y POR ESCRITO (27/08/2026) ═══
  //
  // `clientes.portal_cobros_desde` es una fecha que él puso a mano para decidir DESDE CUÁNDO el
  // cliente ve sus pagos. Inter Motor la tiene en el 01/07 y la obra la cruza: 5 cobros antes
  // ($70.000.000 netos) y 4 después.
  //
  // Hubo una versión que resolvía el desfasaje al revés —«si la obra sigue viva, todos sus pagos son
  // actuales»— y le devolvía al cliente los cinco cobros que el corte existía para no mostrarle. El
  // dueño lo rechazó: **el corte manda**. Lo que se ajusta es el CONTRATO.
  //
  // Los dos lados del pie tienen que hablar de la MISMA ventana. Si el cliente no ve los pagos
  // anteriores, tampoco puede ver el contrato que esos pagos cancelaron: la resta le quedaría como
  // saldo pendiente y le estaríamos reclamando algo que ya pagó.
  const sf = pagosEnPantalla(interMotor(), 'san-francisco')
  assert.equal(sf.todos.length, 9)
  assert.equal(sf.anteriores.length, 5, 'los cinco anteriores al corte siguen rotulados como tales')

  // El contrato que ve el cliente: el cargado menos lo que ya cobró antes del corte.
  const c = contratoDelConjunto([{ obraId: 'san-francisco', nombre: 'San Francisco', pagos: sf.todos }],
    new Map([['san-francisco', { monto: 204_361_104, moneda: 'ARS' as const }]]))
  assert.ok(c)
  assert.equal(redondo(c.cobradoAntes), 70_000_000, 'lo cobrado antes del corte, dicho y no escondido')
  assert.equal(redondo(c.monto), 134_361_104, 'el contrato que se publica va neto de eso')

  // Y el pie cierra: pagado desde el corte + lo que falta = el contrato publicado.
  const r = resumenDeCobro(sf.enCurso, c.monto, '2026-08-27')
  assert.equal(redondo(r.netoPagado), 36_689_222)
  assert.equal(redondo(r.faltaCertificar), 97_671_882)
  assert.equal(redondo((r.netoPagado ?? 0) + (r.faltaCertificar ?? 0)), redondo(c.monto), 'el pie tiene que cerrar')
})

test('una obra cuyos pagos son TODOS anteriores al corte sigue siendo una obra anterior', () => {
  // La marca de la base no se ignora: se corrige sólo cuando la obra tiene vida después del corte.
  const viejos = pagosDelEsquema([
    { ...fila({ orden: 1 }), id: 'v1', obra_id: 'obra-vieja', estado: 'cobrado', historico: true },
    { ...fila({ orden: 2 }), id: 'v2', obra_id: 'obra-vieja', estado: 'cobrado', historico: true },
    { ...fila({ orden: 1 }), id: 'n1', obra_id: 'pisos-industriales' },
  ], new Map([...NOMBRES_IM, ['obra-vieja', 'Obra vieja']]), TODAS)
  assert.deepEqual(viejos.filter((p) => p.historico).map((p) => p.id).sort(), ['v1', 'v2'])
  // Y su contrato sigue fuera del total del conjunto — que es la otra mitad de la misma regla.
  const contratos = new Map([
    ['obra-vieja', { monto: 204_361_104, moneda: 'ARS' as const }],
    ['pisos-industriales', { monto: 47_590_272, moneda: 'ARS' as const }],
  ])
  assert.equal(contratoDelConjunto(agruparPorObra(viejos), contratos)?.monto, 47_590_272)
})

test('un pago SIN obra conserva la marca de la base: no hay obra a la que preguntarle', () => {
  const sueltos = pagosDelEsquema([
    { ...fila({ orden: 1 }), id: 's1', obra_id: null, estado: 'cobrado', historico: true },
    { ...fila({ orden: 2 }), id: 'n1', obra_id: 'pisos-industriales' },
  ], NOMBRES_IM, TODAS)
  assert.equal(sueltos.find((p) => p.id === 's1')?.historico, true)
})

// ── EL DEFECTO 2: CON UN FILTRO PUESTO, LA PANTALLA SEGUÍA MOSTRANDO OTRA OBRA ───────────────

test('con una obra elegida NO sobrevive ni un pago de otra obra', () => {
  const pagos = interMotor()
  for (const [id] of obrasQueFiltran(pagos)) {
    const v = pagosEnPantalla(pagos, id)
    for (const lista of [v.todos, v.enCurso, v.anteriores]) {
      assert.ok(lista.every((p) => p.obraId === id), `«${id}» dejó pasar un pago ajeno`)
    }
    assert.ok(v.todos.length > 0, `«${id}» filtra a cero y no debería estar ofrecida`)
  }
})

test('el próximo pago del filtro es de la obra filtrada, no del cliente entero', () => {
  const pagos = interMotor()
  // Sin filtro, lo próximo es el 04/09 (Entrepiso — `orden` 1 desempata contra Pisos).
  assert.equal(proximoPago(pagosEnPantalla(pagos, null).enCurso)?.fechaPrevista, '2026-09-04')
  // Con Instalación Eléctrica elegida es el 15/09, el suyo. Antes seguía siendo el 04/09 de otra
  // obra: ninguna fila de la lista quedaba resaltada como «próximo» y el calendario abría en un mes
  // que no tenía nada de la obra pedida.
  const soloElectrica = pagosEnPantalla(pagos, 'instalacion-electrica').enCurso
  const electrica = proximoPago(soloElectrica)
  assert.equal(electrica?.fechaPrevista, '2026-09-15')
  assert.equal(soloElectrica.find((p) => p.id === electrica?.id)?.obraId, 'instalacion-electrica')
})

test('el filtro sólo ofrece obras con pagos en curso, y las ofrece por nombre', () => {
  assert.deepEqual(obrasQueFiltran(interMotor()).map(([, n]) => n), [
    'Entrepiso y Escalera', 'Galpones, Mampostería, Cancha de Padel', 'Instalación Eléctrica', 'Pisos Industriales',
  ])
})

test('cada combinación del filtro publica el contrato, lo pagado y lo pendiente de SU obra', () => {
  const pagos = interMotor()
  const hoy = '2026-08-27'
  const esperado: Record<string, [contrato: number, pagado: number, pendiente: number, falta: number]> = {
    'pisos-industriales': [47_590_272, 5_726_424, 18_068_712, 23_795_136],
    'entrepiso-y-escalera': [7_728_254, 0, 3_864_127, 3_864_127],
    'instalacion-electrica': [40_000_000, 10_000_000, 10_000_000, 20_000_000],
    // El contrato va NETO de los $70.000.000 cobrados antes del corte del 01/07, y lo pagado cuenta
    // sólo desde el corte. Los dos lados hablan de la misma ventana y el pie cierra.
    'san-francisco': [134_361_104, 36_689_222, 0, 97_671_882],
  }
  for (const [id, [contrato, pagado, pendiente, falta]] of Object.entries(esperado)) {
    const r = resumenDeCobro(pagosEnPantalla(pagos, id).todos, contrato, hoy)
    assert.equal(redondo(r.netoPagado), pagado, `${id}: pagado`)
    assert.equal(redondo(r.netoPendiente), pendiente, `${id}: pendiente`)
    assert.equal(redondo(r.faltaCertificar), falta, `${id}: falta certificar`)
  }
})

test('LA PRUEBA CRUZADA: la suma de los pies por obra es el pie sin filtro', () => {
  // Si el filtro dejara pasar plata de otra obra —o la escondiera— los dos lados dejarían de dar lo
  // mismo. Es el control que el cliente hace a ojo cuando toca las pastillas una por una.
  const pagos = interMotor()
  const hoy = '2026-08-27'
  const todo = resumenDeCobro(pagosEnPantalla(pagos, null).todos, null, hoy)
  const trozos = [...obrasQueFiltran(pagos).map(([id]) => id), null]
    .map((id) => resumenDeCobro(
      id === null ? pagos.filter((p) => !p.obraId) : pagosEnPantalla(pagos, id).todos, null, hoy))
  const sumar = (leer: (r: ResumenCobro) => number | null) =>
    Math.round(trozos.reduce((a, r) => a + (leer(r) ?? 0), 0))

  // $52.415.646 y no $122.415.646: los $70.000.000 anteriores al corte del dueño no se le muestran
  // al cliente, ni con filtro ni sin él.
  assert.equal(redondo(todo.netoPagado), 52_415_646)
  assert.equal(redondo(todo.netoPendiente), 79_592_102)
  assert.equal(sumar((r) => r.netoPagado), redondo(todo.netoPagado))
  assert.equal(sumar((r) => r.netoPendiente), redondo(todo.netoPendiente))
  assert.equal(trozos.reduce((a, r) => a + r.nPagado, 0), todo.nPagado)
  assert.equal(trozos.reduce((a, r) => a + r.nPendiente, 0), todo.nPendiente)

  // Y el contrato del conjunto: la suma de los cuatro NETA de lo cobrado antes del corte, que se
  // declara aparte en vez de esconderse dentro del total.
  assert.deepEqual(contratoDelConjunto(agruparPorObra(pagos), CONTRATOS_IM),
    { monto: 229_679_630, moneda: 'ARS', obras: 4, sinContrato: 0, cobradoAntes: 70_000_000 })
})
