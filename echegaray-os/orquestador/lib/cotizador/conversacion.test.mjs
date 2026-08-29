// LA CONVERSACIÓN DE PUNTA A PUNTA — y las dos cosas que no puede hacer nunca:
// inventar una respuesta, y caerse cuando el modelo no está.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { conversar, redactar, deltaDePrecio } from './conversacion.mjs'
import { desdeJson, interpretarConModelo } from '../interprete-presupuesto-llm.mjs'
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
/** El intérprete de respaldo, INYECTADO. `cotizador/` no lo importa: ver el encabezado del módulo. */
const conModelo = interpretarConModelo

describe('el ciclo completo, sin modelo (CLAUDE-ZERO · §34)', () => {
  test('«la mamposteria son 520 m2» cambia la cantidad y dice de cuánto a cuánto', async () => {
    const t = await conversar({ texto: 'la mamposteria son 520 m2', rol: ROL.DUENO, actor: 'jorge', estado: ESTADO, usarModelo: false, confirmado: true, mutar })
    assert.equal(t.entendido, true)
    assert.equal(t.salida.ok, true, t.salida.porQue ?? '')
    assert.equal(t.respuesta.titulo, 'Aplicado')
    assert.deepEqual(t.respuesta.cambios, [{ que: '01.01', campo: 'cantidad', antes: 480, despues: 520 }])
  })

  // ═══ LA PROPIEDAD QUE EL CONTRATO 1.1.0 TRAJO, CON SU CANDADO ═══
  //
  // Hasta la 1.0.0 el evento se firmaba con `entidad: String(intent.target)` —el TEXTO que escribió
  // la persona—, así que «la mamposteria», «mamposteria de ladrillo hueco» y «01.01» dejaban tres
  // entidades distintas en el historial y el undo del §21 no podía agruparlas. Acá vivía un candado
  // que afirmaba esa limitación para ponerse rojo el día que la arreglaran. Se puso rojo.
  //
  // Ahora afirma lo contrario, que es la propiedad de verdad: dos formas de nombrar la misma partida
  // dejan UNA sola entidad. Si alguien vuelve a firmar con el texto crudo, esto se pone rojo otra vez.
  test('dos textos distintos sobre la misma partida dejan UNA entidad, no dos', async () => {
    const a = await conversar({ texto: 'la mamposteria son 500 m2', rol: ROL.DUENO, actor: 'j', estado: ESTADO, usarModelo: false, confirmado: true, mutar })
    const b = await conversar({ texto: 'mamposteria de ladrillo hueco son 500 m2', rol: ROL.DUENO, actor: 'j', estado: ESTADO, usarModelo: false, confirmado: true, mutar })
    assert.equal(a.eventos[0].entidad, b.eventos[0].entidad, 'el evento se firma con el texto del usuario: el undo no puede agrupar')
    assert.equal(a.eventos[0].entidad, '01.01', 'la entidad no es la partida que resolvió la validación')
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
    const t = await conversar({ texto: 'che fijate eso del tema aquel', rol: ROL.DUENO, actor: 'jorge', estado: ESTADO, pedir: sinModelo, conModelo, mutar })
    assert.equal(t.degradado, true, 'no declaró que estaba degradado')
    assert.equal(t.entendido, false)
    assert.ok(t.respuesta.pregunta)
  })

  test('con el modelo caído, los canónicos siguen andando igual', async () => {
    const t = await conversar({ texto: 'q me falta para enviar', rol: ROL.DUENO, actor: 'jorge', estado: { ...ESTADO, cola: { bloqueantes: [] } }, pedir: sinModelo, conModelo, mutar })
    assert.equal(t.entendido, true)
    assert.equal(t.degradado, false, 'llamó al modelo para una frase que el parser resuelve')
  })
})

describe('sin inyectar el respaldo, no hay modelo — por construcción', () => {
  test('conversar() a secas NO llama al modelo aunque el parser no entienda', async () => {
    let llamadas = 0
    const t = await conversar({
      texto: 'che fijate eso del tema aquel', rol: ROL.DUENO, actor: 'jorge', estado: ESTADO,
      pedir: async () => { llamadas += 1; return '{\"action\":\"update_quantity\"}' },
      mutar,
    })
    // MUTACIÓN QUE LO PONE ROJO: volver a importar `interpretarConModelo` dentro de
    // `conversacion.mjs` en vez de recibirlo. Ahí `llamadas` pasa a 1.
    assert.equal(llamadas, 0, 'llamó al modelo sin que nadie lo enchufara')
    assert.equal(t.degradado, false, 'declaró degradación de un modelo que nunca estuvo enchufado')
    assert.equal(t.entendido, false)
  })

  test('con el respaldo inyectado, la misma frase SÍ llega al modelo', async () => {
    let llamadas = 0
    await conversar({
      texto: 'che fijate eso del tema aquel', rol: ROL.DUENO, actor: 'jorge', estado: ESTADO,
      conModelo, pedir: async () => { llamadas += 1; return null }, mutar,
    })
    assert.equal(llamadas, 1, 'el respaldo inyectado no se usó: el test de arriba no probaría nada')
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
      const t = await conversar({ texto: 'algo que el parser no entiende jamas', rol: ROL.DUENO, actor: 'jorge', estado: ESTADO, pedir: responde(crudo), conModelo, mutar: () => { mutaciones += 1 } })
      assert.equal(t.entendido, false, `«${que}» se convirtió en una intención`)
      assert.equal(mutaciones, 0)
    })
  }

  test('un JSON bien formado del modelo SÍ pasa, y vuelve a pasar por RBAC', async () => {
    const crudo = '{"action":"commercial_override","target":"pctBeneficio","value":19}'
    const t = await conversar({ texto: 'subime la ganancia un toque', rol: ROL.JEFE_DE_OBRA, actor: 'jefe', estado: ESTADO, pedir: responde(crudo), conModelo, mutar })
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

describe('una consulta sin datos DICE que no los tiene (QA visual, 29/08/2026)', () => {
  test('«de donde sale» sobre una partida sin genealogía no devuelve un JSON de nulls mudo', async () => {
    const t = await conversar({ texto: 'de donde sale la mamposteria', rol: ROL.DUENO, actor: 'j', estado: ESTADO, usarModelo: false, mutar })
    assert.equal(t.salida.ok, true, t.salida.porQue ?? '')
    assert.ok(t.respuesta.lineas.length > 0, 'devolvió el JSON pelado y ninguna línea que lo explique')
    assert.match(t.respuesta.lineas[0], /no tiene genealogia ni evidencia/)
    // Y el JSON SIGUE ahí: la línea acompaña al dato, no lo reemplaza.
    assert.equal(t.respuesta.datos.entidad, '01.01')
  })

  test('cuando SÍ hay genealogía no se agrega ninguna línea de ausencia', async () => {
    const conDatos = { ...ESTADO, partidas: PARTIDAS.map((p) => (p.codigo === '01.01' ? { ...p, genealogia: 'plano A-01, muro eje 3' } : p)) }
    const t = await conversar({ texto: 'de donde sale la mamposteria', rol: ROL.DUENO, actor: 'j', estado: conDatos, usarModelo: false, mutar })
    assert.deepEqual(t.respuesta.lineas, [], 'inventó una línea de ausencia sobre un dato que estaba')
  })

  test('«no encuentro X» del motor se muestra tal cual, sin reescribirlo', async () => {
    const t = await conversar({ texto: 'de donde sale el ascensor', rol: ROL.DUENO, actor: 'j', estado: ESTADO, usarModelo: false, mutar })
    if (t.salida?.ok) assert.match(t.respuesta.lineas[0] ?? '', /no encuentro/)
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
