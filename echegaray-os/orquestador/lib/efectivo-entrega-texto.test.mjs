// Entregar efectivo escribiéndolo en el canal (22/09/2026). Lo que se prueba acá es plata que sale del
// cajón: cada caso es una forma real de escribirlo, y los empates NO se desempatan solos.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  elegirObra, elegirPersona, interpretarEntrega, leerMonto, leerParaQue, pareceEntrega,
  pareceEntregaSinVerbo, textoDePregunta,
} from './efectivo-entrega-texto.mjs'

const PERSONAS = [
  { id: 'sosa', nombre: 'SOSA RUBEN DARIO' },
  { id: 'sosa2', nombre: 'SOSA MARIA ELENA' },
  { id: 'aguero', nombre: 'AGUERO CRISTIAN DOMINGO' },
]
const OBRAS = [
  { id: 'g8', codigo: 'OB-0020', nombre: 'Galpón 8' },
  { id: 'estrella', codigo: 'OB-0031', nombre: 'La Estrella' },
]

test('el monto se lee como se escribe en la obra', () => {
  assert.equal(leerMonto('entregué $250.000 a Sosa'), 250000)
  assert.equal(leerMonto('le di 250 mil'), 250000)
  assert.equal(leerMonto('$1,5 millones'), 1500000)
  assert.equal(leerMonto('entregué 12000 a Sosa'), 12000)
  assert.equal(leerMonto('$12.500,50'), 12500.5)
})

test('dos montos posibles sin signo NO se adivinan, pero el número de la obra no confunde', () => {
  assert.equal(leerMonto('entregué 12000 y 5000'), null)
  assert.equal(leerMonto('entregue 250 mil a sosa p/ el galpon 8'), 250000)
  assert.equal(leerMonto('entregue 12000 a sosa para el galpon 8'), 12000)
  assert.equal(leerMonto('entregue 250 mil y 300 mil'), null)
  // El número del galpón NO es el monto: sin signo ni escala, abajo de mil no es plata.
  assert.equal(leerMonto('entregue plata a aguero para el galpon 8'), null)
  assert.equal(leerMonto('entregue $800 a aguero para el galpon 8'), 800, 'con signo sí')
  // Con signo sí: el signo dice cuál es la plata.
  assert.equal(leerMonto('entregué $12.000 para la orden 5000'), 12000)
})

test('el apellido gana al nombre, y dos que empatan se preguntan', () => {
  assert.equal(elegirPersona('le di plata a aguero', PERSONAS).persona?.id, 'aguero')
  assert.equal(elegirPersona('a ruben dario sosa', PERSONAS).persona?.id, 'sosa')
  const empate = elegirPersona('se lo di a sosa', PERSONAS)
  assert.equal(empate.persona, undefined)
  assert.deepEqual(empate.candidatos?.map((p) => p.id), ['sosa', 'sosa2'])
})

test('el código de obra gana al nombre', () => {
  assert.equal(elegirObra('para OB-0020', OBRAS).obra?.id, 'g8')
  assert.equal(elegirObra('para el galpón 8', OBRAS).obra?.id, 'g8')
  assert.equal(elegirObra('para la esquina', OBRAS).obra, undefined)
})

test('«para qué» es lo que dice el texto, no lo que se supone', () => {
  assert.equal(leerParaQue('entregué $50.000 a Agüero para gasoil'), 'gasoil')
  assert.equal(leerParaQue('entregué $50.000 a Agüero'), null)
})

test('un mensaje cualquiera con números no es una entrega', () => {
  assert.equal(pareceEntrega('la factura 0001-00012345 de Acindar'), false)
  assert.equal(interpretarEntrega('la factura 0001-00012345', { personas: PERSONAS }).estado, 'nada')
  assert.equal(pareceEntrega('entregué plata'), false, 'sin número no hay entrega')
})

test('el caso completo: monto, persona y obra', () => {
  const r = interpretarEntrega('entregué $250.000 a Cristian Aguero para el galpón 8', { personas: PERSONAS, obras: OBRAS })
  assert.deepEqual(
    { estado: r.estado, monto: r.monto, persona: r.persona?.id, obra: r.obra?.id },
    { estado: 'listo', monto: 250000, persona: 'aguero', obra: 'g8' },
  )
})

test('sin obra pero con destino, la entrega es de Estructura y el destino queda escrito', () => {
  const r = interpretarEntrega('le di $30.000 a Aguero para gasoil', { personas: PERSONAS, obras: OBRAS })
  assert.equal(r.estado, 'listo')
  assert.equal(r.obra, null)
  assert.equal(r.paraQue, 'gasoil')
})

test('sin destino NO se registra: una entrega sin imputación es plata que sale sin rastro', () => {
  const r = interpretarEntrega('entregué $30.000 a Aguero', { personas: PERSONAS, obras: OBRAS })
  assert.equal(r.estado, 'pregunta')
  assert.equal(r.falta, 'destino')
  assert.match(textoDePregunta(r), /obra|gasoil/)
})

test('lo que falta se pregunta con nombre y apellido, y sin publicar plata de nadie', () => {
  const ambigua = interpretarEntrega('entregué $10.000 a sosa para el galpón 8', { personas: PERSONAS, obras: OBRAS })
  assert.equal(ambigua.falta, 'persona_ambigua')
  const t = textoDePregunta(ambigua)
  assert.match(t, /SOSA RUBEN DARIO/)
  assert.doesNotMatch(t, /\$/, 'la pregunta no publica importes')
  // Sin ningún número no es una entrega: es una charla.
  assert.equal(interpretarEntrega('entregué mucha plata a Aguero', { personas: PERSONAS }).estado, 'nada')
  // Con número pero sin monto válido, se pregunta el monto en vez de registrar cero.
  assert.equal(interpretarEntrega('entregué $0 a Aguero para el galpón 8', { personas: PERSONAS, obras: OBRAS }).falta, 'monto')
})

// ═══ COMO ESCRIBE EL DUEÑO, NO COMO ESCRIBE UN MANUAL (regla de `.claude/rules/tests.md`) ═══

test('sin acentos, abreviado y a las apuradas', () => {
  const casos = [
    ['entregue 250 mil a sosa ruben dario p/ el galpon 8', 250000, 'sosa', 'g8'],
    ['le di $30.000 a aguero pa gasoil', 30000, 'aguero', null],
    ['entregue $12000 a AGUERO CRISTIAN para la estrella', 12000, 'aguero', 'estrella'],
    ['entrega de $5.000 a maria elena sosa para gasoil', 5000, 'sosa2', null],
  ]
  for (const [texto, monto, persona, obra] of casos) {
    const r = interpretarEntrega(texto, { personas: PERSONAS, obras: OBRAS })
    assert.equal(r.estado, 'listo', texto)
    assert.equal(r.monto, monto, texto)
    assert.equal(r.persona.id, persona, texto)
    assert.equal(r.obra?.id ?? null, obra, texto)
  }
})

test('«p» de «para» no convierte cualquier frase en destino', () => {
  // «pagado» empieza con p y no es «para»: el destino sale de una palabra suelta, no de un prefijo.
  assert.equal(leerParaQue('entregue $5.000 a aguero pagado ayer'), null)
})

// ═══ LA ENTREGA ESCRITA SIN VERBO (dueño, 23/09/2026) ═══
//
// «100 a jorge para combustible» fue el primer mensaje real del canal y ningún especialista lo reclamó como
// entrega: cayó a la libreta de gastos, que lo rechazó. El dueño lo leyó como «el chat no funciona».

test('«100 a jorge para combustible» se registra entero, sin pedir el signo', () => {
  // Los dos mensajes reales del dueño, 23/09/2026. El primero caía a la libreta («no pude cargarlos»);
  // arreglado eso, el segundo se comió un «escribilo con el signo» que tampoco servía de nada. El número
  // que ABRE el mensaje y va seguido de «a <alguien>» es la plata: no hay otra cosa que pueda ser.
  assert.equal(pareceEntregaSinVerbo('100 a jorge para combustible'), true)
  const r = interpretarEntrega('100 a jorge para combustible', {
    personas: [{ id: 'p1', nombre: 'JORGE CORONA' }], obras: [],
  })
  assert.equal(r.estado, 'listo')
  assert.equal(r.monto, 100)
  assert.equal(r.paraQue, 'combustible')

  const dos = interpretarEntrega('150 a rodrigo para maquinaria', {
    personas: [{ id: 'p2', nombre: 'RODRIGUEZ RODRIGO' }], obras: [],
  })
  assert.equal(dos.estado, 'listo')
  assert.equal(dos.monto, 150)
})

test('la escala del número que abre se respeta, y no se inventa', () => {
  const p = [{ id: 'p1', nombre: 'MALDONADO BATISTA' }]
  // «150» es CIENTO CINCUENTA. Multiplicar por mil porque parece poco sería fabricar plata.
  assert.equal(interpretarEntrega('150 a Maldonado para gasoil', { personas: p }).monto, 150)
  assert.equal(interpretarEntrega('150 mil a Maldonado para gasoil', { personas: p }).monto, 150_000)
  assert.equal(interpretarEntrega('$150.000 a Maldonado para gasoil', { personas: p }).monto, 150_000)
})

test('un número suelto en el medio NO se toma como monto: «galpón 8» no es $ 8', () => {
  const r = interpretarEntrega('entregué plata a Maldonado para el galpón 8', {
    personas: [{ id: 'p1', nombre: 'MALDONADO BATISTA' }], obras: [],
  })
  assert.equal(r.estado, 'pregunta')
  assert.equal(r.falta, 'monto')
})

test('con el signo, la misma frase se registra entera', () => {
  const r = interpretarEntrega('$100 a jorge para combustible', {
    personas: [{ id: 'p1', nombre: 'JORGE CORONA' }], obras: [],
  })
  assert.equal(r.estado, 'listo')
  assert.equal(r.monto, 100)
  assert.equal(r.persona.id, 'p1')
  assert.equal(r.paraQue, 'combustible')
})

test('un PAGO a proveedor no se confunde con una entrega', () => {
  for (const t of ['pagué 100 a jorge', 'abone 250.000 a Tello', 'transferí 50000 a Corralón']) {
    assert.equal(pareceEntregaSinVerbo(t), false, t)
  }
})

test('una línea de libreta sin «a alguien» no se toca', () => {
  assert.equal(pareceEntregaSinVerbo('P. Tello 18/9 2.640.000'), false)
  assert.equal(pareceEntregaSinVerbo('Flete 60.000'), false)
})

test('con verbo sigue siendo entrega, y la forma sin verbo no lo pisa', () => {
  assert.equal(pareceEntrega('entregué $250.000 a Rubén Sosa para el galpón 8'), true)
  assert.equal(pareceEntregaSinVerbo('entregué $250.000 a Rubén Sosa'), false)
})

test('si el nombre no está en el padrón, el bot dice las DOS salidas y no un callejón', () => {
  const r = interpretarEntrega('$100 a fulano para combustible', { personas: [], obras: [] })
  assert.equal(r.falta, 'persona')
  const t = textoDePregunta(r)
  assert.match(t, /entregaste/)
  assert.match(t, /libreta/)
})

test('un nombre del padrón con corchetes no rompe la interpretación', () => {
  // Medido contra el padrón real el 23/09/2026: «[PRUEBA E2E] QA Campo» hacía que `new RegExp` tirara
  // «Unmatched )» y se caía la lectura del mensaje entero — el bot no contestaba nada a nadie.
  const personas = [{ id: 'x', nombre: '[PRUEBA E2E] QA Campo' }, { id: 'p1', nombre: 'MALDONADO BATISTA EMILIANO' }]
  const r = interpretarEntrega('$100 a Maldonado para combustible', { personas, obras: [] })
  assert.equal(r.estado, 'listo')
  assert.equal(r.persona.id, 'p1')
})

test('la obra se reconoce por sus palabras, no por su nombre completo', () => {
  // «para el salón comercial» iba a Estructura porque se exigía «QP - SALÓN COMERCIAL» entero. Plata
  // imputada al destino equivocado, en silencio.
  const obras = [
    { codigo: 'qp-salon', nombre: 'QP - SALÓN COMERCIAL' },
    { codigo: 'le-g8', nombre: 'LE - GALPÓN 8' },
    { codigo: 'le-g9', nombre: 'LE - GALPÓN 9' },
  ]
  assert.equal(elegirObra('$50.000 a Maldonado para el salon comercial', obras).obra?.codigo, 'qp-salon')
  // Con dos obras posibles NO se elige una: se pregunta.
  assert.equal(elegirObra('$50.000 para el galpón', obras).obra, undefined)
  assert.equal(elegirObra('$50.000 para el galpón 8', obras).obra?.codigo, 'le-g8')
})
