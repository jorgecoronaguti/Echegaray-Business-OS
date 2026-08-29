// LA CONVERSACIÓN DE PUNTA A PUNTA — y las dos cosas que no puede hacer nunca:
// inventar una respuesta, y caerse cuando el modelo no está.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { conversar, redactar, deltaDePrecio } from './conversacion.mjs'
import { desdeJson } from './interprete-llm.mjs'
import { CANONICOS } from './interprete.mjs'
import { ROL } from './contrato.mjs'

const PARTIDAS = [
  { codigo: '01.01', descripcion: 'Mamposteria de ladrillo hueco', rubro: 'Albañileria', unidad: 'm2', cantidad: 480, costoUnitario: 25000, subtotal: 12000000 },
  { codigo: '02.01', descripcion: 'Pintura latex interior', rubro: 'Terminaciones', unidad: 'm2', cantidad: 900, costoUnitario: 8000, subtotal: 7200000 },
  { codigo: '03.01', descripcion: 'Instalacion sanitaria', rubro: 'Instalaciones', unidad: 'gl', cantidad: 1, costoUnitario: null, subtotal: null },
  { codigo: '04.01', descripcion: 'Hormigon de platea', rubro: 'Estructura', unidad: 'm3', cantidad: 47.2, costoUnitario: 180000, subtotal: 8496000 },
]
const ESTADO = { partidas: PARTIDAS, politica: { pctBeneficio: 0.15 }, costoConocido: 27696000 }

/** Un `mutar` de juguete que devuelve lo validado — alcanza para ver qué habría cambiado. */
const mutar = ({ validado }) => validado
/** Un `pedir` que finge al modelo. Sin red, sin clave, sin costo. */
const responde = (texto) => async () => texto
const sinModelo = async () => null

describe('el ciclo completo, sin modelo (CLAUDE-ZERO · §34)', () => {
  test('«la mamposteria son 520 m2» cambia la cantidad y dice de cuánto a cuánto', async () => {
    const t = await conversar({ texto: 'la mamposteria son 520 m2', rol: ROL.DUENO, actor: 'jorge', estado: ESTADO, usarModelo: false, confirmado: true, mutar })
    assert.equal(t.entendido, true)
    assert.equal(t.salida.ok, true, t.salida.porQue ?? '')
    assert.equal(t.respuesta.titulo, 'Aplicado')
    assert.deepEqual(t.respuesta.cambios, [{ que: 'mamposteria', campo: 'cantidad', antes: 480, despues: 520 }])
  })

  // ═══ CANDADO DE UN LÍMITE CONOCIDO DEL CORE, NO UNA PREFERENCIA ═══
  //
  // `comandos.ejecutar()` arma el evento con `entidad: String(intent.target)`, o sea el TEXTO que
  // escribió la persona, no la partida que la validación ya resolvió. «mamposteria», «la
  // mamposteria» y «01.01» son la misma partida y dejan tres entidades distintas en el historial,
  // así que el undo del §21 no puede agruparlas. Está pedido al CORE. Cuando lo corrija, este test
  // se pone rojo y alguien tiene que venir a mirarlo — que es exactamente para lo que está.
  test('LÍMITE: el evento identifica la entidad por el texto del usuario, no por la partida', async () => {
    const a = await conversar({ texto: 'la mamposteria son 500 m2', rol: ROL.DUENO, actor: 'j', estado: ESTADO, usarModelo: false, confirmado: true, mutar })
    const b = await conversar({ texto: 'mamposteria de ladrillo hueco son 500 m2', rol: ROL.DUENO, actor: 'j', estado: ESTADO, usarModelo: false, confirmado: true, mutar })
    assert.notEqual(a.eventos[0].entidad, b.eventos[0].entidad, 'el CORE ya identifica la entidad por la partida: actualizar este candado')
  })

  test('los siete canónicos se entienden con el proveedor APAGADO', async () => {
    for (const c of CANONICOS) {
      const t = await conversar({ texto: c.texto, rol: ROL.DUENO, actor: 'jorge', estado: ESTADO, usarModelo: false, mutar })
      assert.equal(t.entendido, true, `«${c.texto}» no se entendió sin modelo`)
      assert.equal(t.intencion.action, c.accion)
    }
  })

  test('una frase rara sin modelo pide reformular; no rompe y no muta', async () => {
    let mutaciones = 0
    const t = await conversar({ texto: 'che fijate eso del tema aquel', rol: ROL.DUENO, actor: 'jorge', estado: ESTADO, usarModelo: false, mutar: () => { mutaciones += 1 } })
    assert.equal(t.entendido, false)
    assert.equal(mutaciones, 0)
    assert.equal(t.respuesta.titulo, 'No entendí')
    assert.ok(t.respuesta.pregunta)
  })
})

describe('sin clave el sistema DEGRADA, no se cae (§34)', () => {
  test('el modelo devuelve null y la conversación sigue viva y lo dice', async () => {
    const t = await conversar({ texto: 'che fijate eso del tema aquel', rol: ROL.DUENO, actor: 'jorge', estado: ESTADO, pedir: sinModelo, mutar })
    assert.equal(t.degradado, true, 'no declaró que estaba degradado')
    assert.equal(t.entendido, false)
    assert.ok(t.respuesta.pregunta)
  })

  test('con el modelo caído, los canónicos siguen andando igual', async () => {
    const t = await conversar({ texto: 'q me falta para enviar', rol: ROL.DUENO, actor: 'jorge', estado: { ...ESTADO, cola: { bloqueantes: [] } }, pedir: sinModelo, mutar })
    assert.equal(t.entendido, true)
    assert.equal(t.degradado, false, 'llamó al modelo para una frase que el parser resuelve')
  })
})

describe('el texto del modelo NUNCA muta estado (§19)', () => {
  const BASURA = [
    ['prosa', 'Claro, ya te actualicé la mampostería a 520 m2. ¡Listo!'],
    ['acción inventada', '{"action": "DROP TABLE cotizaciones"}'],
    ['acción nula', '{"action": null}'],
    ['no es objeto', '["update_quantity", "01.01", 520]'],
    ['json roto', '{"action": "update_quantity", '],
  ]
  for (const [que, crudo] of BASURA) {
    test(`${que}: no produce intención`, async () => {
      let mutaciones = 0
      const t = await conversar({ texto: 'algo que el parser no entiende jamas', rol: ROL.DUENO, actor: 'jorge', estado: ESTADO, pedir: responde(crudo), mutar: () => { mutaciones += 1 } })
      assert.equal(t.entendido, false, `«${que}» se convirtió en una intención`)
      assert.equal(mutaciones, 0)
    })
  }

  test('un JSON bien formado del modelo SÍ pasa, y vuelve a pasar por RBAC', async () => {
    const crudo = '{"action":"commercial_override","target":"pctBeneficio","value":19}'
    const t = await conversar({ texto: 'subime la ganancia un toque', rol: ROL.JEFE_DE_OBRA, actor: 'jefe', estado: ESTADO, pedir: responde(crudo), mutar })
    assert.equal(t.entendido, true)
    assert.equal(t.salida.ok, false)
    assert.equal(t.salida.etapaQueParo, 'AUTORIZACION')
    assert.ok(!/19/.test(JSON.stringify(t.respuesta)), 'el rechazo le contó el valor al jefe de obra')
  })

  test('el modelo no puede colar campos que la acción no declara', () => {
    const r = desdeJson('{"action":"update_quantity","target":"01.01","value":520,"cotizacion_id":"otra","sql":"delete"}')
    assert.equal(r.resuelto, true)
    assert.equal(r.intencion.cotizacion_id, undefined)
    assert.equal(r.intencion.sql, undefined)
  })

  test('un objeto anidado en target no llega al command layer', () => {
    const r = desdeJson('{"action":"update_quantity","target":{"$ne":null},"value":520}')
    assert.equal(r.intencion.target, null, 'dejó pasar un objeto como target')
  })
})

describe('ninguna respuesta está preescrita', () => {
  /** Todos los números que aparecen en un objeto serializado. */
  const numerosDe = (o) => (JSON.stringify(o ?? null).match(/-?\d+(\.\d+)?/g) ?? [])

  test('todo número que se muestra vino del motor, no del redactor', async () => {
    for (const texto of ['la mamposteria son 520 m2', 'saca pintura', 'sanitaria 8,5M', 'beneficio 19%']) {
      const t = await conversar({ texto, rol: ROL.DUENO, actor: 'jorge', estado: ESTADO, usarModelo: false, confirmado: true, mutar })
      const delMotor = new Set([...numerosDe(t.salida), ...numerosDe(t.intencion)])
      for (const num of numerosDe(t.respuesta)) {
        assert.ok(delMotor.has(num), `«${texto}»: la respuesta muestra ${num} y el motor nunca lo produjo`)
      }
    }
  })

  test('sin resultado del motor no hay ninguna afirmación sobre el presupuesto', () => {
    const r = redactar({
      intencion: { action: 'update_quantity' },
      salida: { ok: false, etapaQueParo: 'VALIDACION', porQue: null, pregunta: null, eventos: [] },
    })
    assert.deepEqual(r.lineas, [], 'inventó una línea que el motor no dio')
    assert.deepEqual(r.cambios, [])
    assert.equal(r.pregunta, null)
  })

  test('el aviso del outlier NO se esconde porque el cambio salió bien', () => {
    const r = redactar({
      intencion: { action: 'update_quantity' },
      salida: { ok: true, veredicto: 'APLICAR_CON_AVISO', porQue: 'el cambio es 10 veces el valor anterior', eventos: [{ entidad: '01.01', campo: 'cantidad', antes: 48, despues: 480 }] },
    })
    assert.equal(r.tono, 'aviso')
    assert.ok(r.lineas.some((l) => /10 veces/.test(l)))
  })
})

describe('el impacto en el precio: null cuando no se midió, nunca cero (§42)', () => {
  test('sin cascada antes no se afirma un delta', () => {
    assert.equal(deltaDePrecio(null, { ventaSinIva: 100 }), null)
    assert.equal(deltaDePrecio({ ventaSinIva: 100 }, null), null)
    assert.equal(deltaDePrecio({ ventaSinIva: null }, { ventaSinIva: 100 }), null)
  })

  test('con las dos, el delta es la resta y trae los dos extremos', () => {
    assert.deepEqual(deltaDePrecio({ ventaSinIva: 100 }, { ventaSinIva: 130 }), { antes: 100, despues: 130, delta: 30 })
  })
})
