// QUE UN TOTAL NO SE HAGA PASAR POR UNA COTIZACIÓN.
//
// La prueba que importa es la primera: con la mitad del cómputo resuelto el resultado tiene que
// decir INCOMPLETA. Si alguien baja el umbral o cambia el denominador para que dé lindo, se pone
// roja — y ése es exactamente el cambio que hay que impedir.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { controlar, medirCobertura, supuestosOcultos, preguntas, decisiones, DECISIONES, UMBRAL_COBERTURA, ESTADO_COTIZACION } from './control.mjs'
import { computarElemento } from './computo.mjs'
import { validarElemento } from './interpretar.mjs'
import { ESTADO } from './seleccion.mjs'
import { FUENTE } from './fuente.mjs'

const item = (id, valor, fuente = FUENTE.CALCULADO) => ({ id, nombre: `Elemento ${id}`, unidad: 'm3', cantidad: valor === null ? null : { valor, fuente } })
const mapeo = (elemento, estado, extra = {}) => ({ elemento, estado, computo: { nombre: `Elemento ${elemento}` }, candidatos: [], ...extra })

test('CON LA MITAD DEL CÓMPUTO RESUELTO, LA COTIZACIÓN ES INCOMPLETA', () => {
  const r = controlar({
    computo: { detectados: 10, items: [item('A', 1), item('B', 2), item('C', null), item('D', null)] },
    mapeo: { mapeos: [mapeo('A', ESTADO.MAPEADA), mapeo('B', ESTADO.AMBIGUO)] },
  })
  assert.equal(r.estado, ESTADO_COTIZACION.INCOMPLETA)
  assert.equal(r.cobertura.resueltos, 1)
  assert.equal(r.cobertura.detectados, 10)
  assert.match(r.porQue, /de los 10 elementos detectados/)
})

test('EL DENOMINADOR ES LO QUE EL PLANO TIENE, no lo que salió bien', () => {
  // Contar la cobertura sobre los elementos que se lograron computar da siempre 100% y no mide nada.
  const c = medirCobertura({ detectados: 46, items: [item('A', 1)], mapeos: [mapeo('A', ESTADO.MAPEADA)] })
  assert.equal(c.detectados, 46)
  assert.ok(c.cobertura < 0.1)
  assert.equal(c.alcanza, false)
})

test('con cobertura por encima del umbral y sin supuestos ocultos, sale COMPLETA y dice por qué', () => {
  const items = Array.from({ length: 10 }, (_, i) => item(`E${i}`, i + 1))
  const mapeos = items.map((i) => mapeo(i.id, ESTADO.MAPEADA))
  const r = controlar({ computo: { detectados: 10, items }, mapeo: { mapeos } })
  assert.equal(r.estado, ESTADO_COTIZACION.COMPLETA)
  assert.equal(r.cobertura.cobertura, 1)
  assert.match(r.porQue, /quedaron con cantidad y con partida/)
  assert.ok(UMBRAL_COBERTURA >= 0.9, 'el umbral no puede aflojarse para que un proyecto pase')
})

test('UN SUPUESTO OCULTO TIRA LA COTIZACIÓN ABAJO aunque la cobertura sea perfecta', () => {
  const items = Array.from({ length: 10 }, (_, i) => item(`E${i}`, i + 1))
  items[3] = item('E3', 99, FUENTE.INFERIDO)
  const r = controlar({ computo: { detectados: 10, items }, mapeo: { mapeos: items.map((i) => mapeo(i.id, ESTADO.MAPEADA)) } })
  assert.equal(r.estado, ESTADO_COTIZACION.INCOMPLETA)
  assert.equal(r.supuestosOcultos.length, 1)
  assert.equal(r.supuestosOcultos[0].elemento, 'E3')
  assert.match(r.porQue, /sin que la cita los respalde/)
})

test('un supuesto DECLARADO no es un supuesto oculto: se ve, y por eso no rompe nada', () => {
  assert.equal(supuestosOcultos([item('A', 5, FUENTE.SUPUESTO)]).length, 0)
  assert.equal(supuestosOcultos([item('A', 5, FUENTE.FALTA_DATO)]).length, 0)
  assert.equal(supuestosOcultos([item('A', 5, FUENTE.INFERIDO)]).length, 1)
  assert.equal(supuestosOcultos([item('A', null, FUENTE.INFERIDO)]).length, 0, 'sin cantidad no hay número que se cuele')
})

test('LAS PREGUNTAS SE COLAPSAN POR TEXTO: el mismo espesor preguntado tres veces es UNA pregunta', () => {
  const falta = { atributo: 'espesor_m', literal: '50cm' }
  const p = preguntas({
    mapeos: [
      mapeo('P1', ESTADO.PARTIDA_CANDIDATA, { faltan: [falta] }),
      mapeo('P2', ESTADO.PARTIDA_CANDIDATA, { faltan: [falta] }),
      mapeo('P3', ESTADO.PARTIDA_CANDIDATA, { faltan: [falta] }),
    ],
  })
  assert.equal(p.length, 1)
  assert.equal(p[0].destraba.length, 3)
  assert.match(p[0].pregunta, /espesor/)
})

test('primero va la pregunta que destraba más partidas', () => {
  const p = preguntas({
    mapeos: [
      mapeo('A', ESTADO.PARTIDA_CANDIDATA, { faltan: [{ atributo: 'espesor_m', literal: '50cm' }] }),
      mapeo('B', ESTADO.PARTIDA_CANDIDATA, { faltan: [{ atributo: 'espesor_m', literal: '50cm' }] }),
      mapeo('C', ESTADO.PARTIDA_CANDIDATA, { faltan: [{ atributo: 'ubicacion', literal: 'exteriores' }] }),
    ],
  })
  assert.equal(p[0].destraba.length, 2)
  assert.equal(p[1].destraba.length, 1)
})

test('cada pregunta dice QUIÉN la contesta — una pregunta sin dueño no se contesta nunca', () => {
  const p = preguntas({
    mapeos: [mapeo('A', ESTADO.AMBIGUO, { candidatos: [{ codigo: 'T1' }, { codigo: 'T2' }] })],
    procesos: [{ elemento: 'B', tarea: 'Excavación', unidad: 'm3', cantidad: null, porQueFalta: 'falta el sobreancho', quienLoTiene: 'dirección técnica / proyecto' }],
  })
  assert.ok(p.every((x) => x.quienLoTiene))
  assert.ok(p.some((x) => x.origen === 'empate entre partidas'))
  assert.ok(p.some((x) => x.origen === 'proceso derivado'))
})

test('LAS DOS COBERTURAS SON DISTINTAS: computado no es lo mismo que cotizable', () => {
  // Un proyecto puede estar bien medido y mal cotizado si a la Base Maestra le faltan partidas.
  // Reportar un solo número esconde cuál de las dos cosas está fallando.
  const c = medirCobertura({
    detectados: 10,
    items: Array.from({ length: 8 }, (_, i) => item(`E${i}`, i + 1)),
    mapeos: [mapeo('E0', ESTADO.MAPEADA), mapeo('E1', ESTADO.MAPEADA)],
  })
  assert.equal(c.coberturaComputo, 0.8, '8 de 10 medidos')
  assert.equal(c.cobertura, 0.2, 'sólo 2 de 10 con partida')
})

test('el resumen entra en una línea y no esconde ninguno de los cinco números', () => {
  const r = controlar({
    computo: { detectados: 46, items: [item('A', 1)] },
    mapeo: { mapeos: [mapeo('A', ESTADO.MAPEADA)] },
    omisionesCircot: [{ codigo: 'X' }],
  })
  assert.match(r.resumen, /INCOMPLETA/)
  assert.match(r.resumen, /cómputo 2% \(1\/46\)/)
  assert.match(r.resumen, /cotización 2% \(1\/46\)/)
  assert.match(r.resumen, /supuestos ocultos 0/)
  assert.match(r.resumen, /omisiones CIRCOT a confirmar 1/)
})

test('DOS CONTROLES IDÉNTICOS dan exactamente lo mismo', () => {
  const entrada = { computo: { detectados: 3, items: [item('A', 1), item('B', 2)] }, mapeo: { mapeos: [mapeo('A', ESTADO.MAPEADA), mapeo('B', ESTADO.AMBIGUO)] } }
  assert.deepEqual(controlar(entrada), controlar(entrada))
})

test('UNA DECISIÓN CIERRA CUATRO PREGUNTAS QUE NO ERAN CUATRO PREGUNTAS', () => {
  // «¿cuánto pesa el perfil?», «¿qué equipo de izaje?», «¿cuánta superficie de antióxido?» y
  // «¿cómo se transporta?» son UNA sola decisión: cómo se contrata la estructura metálica.
  const p = [
    { pregunta: 'Provisión y fabricación en taller (kg): sin el peso por metro del perfil no hay kilos', destraba: ['CERCHA', 'K1'], origen: 'proceso derivado', quienLoTiene: 'x' },
    { pregunta: 'Izaje y montaje (gl): depende del equipo de izaje', destraba: ['CERCHA'], origen: 'proceso derivado', quienLoTiene: 'x' },
    { pregunta: 'Transporte a obra (gl): depende de la distancia', destraba: ['CERCHA'], origen: 'proceso derivado', quienLoTiene: 'x' },
    { pregunta: 'Tratamiento anticorrosivo (m2): superficie desarrollada del perfil', destraba: ['K1'], origen: 'proceso derivado', quienLoTiene: 'x' },
  ]
  const d = decisiones(p)
  assert.equal(d.decisiones.length, 1)
  assert.equal(d.decisiones[0].preguntasQueCierra, 4)
  assert.deepEqual(d.decisiones[0].destraba.sort(), ['CERCHA', 'K1'])
  assert.equal(d.sueltas.length, 0)
})

test('LO QUE NINGUNA DECISIÓN CIERRA SALE SUELTO — meterlo a la fuerza esconde el hueco', () => {
  const d = decisiones([{ pregunta: '¿Con qué partida se cotiza «Portón corredizo»? No hay ninguna compatible', destraba: ['P1'], origen: 'sin partida', quienLoTiene: 'x' }])
  assert.equal(d.decisiones.length, 0)
  assert.equal(d.sueltas.length, 1, 'una decisión que no cierra la pregunta es un rótulo, no una decisión')
})

test('las decisiones se ordenan por cuántos elementos destraban, no por cuántas preguntas junta', () => {
  const d = decisiones([
    { pregunta: '¿Qué espesor tiene la platea? La partida exige «50cm»', destraba: ['A'], origen: 'atributo sin respaldo', quienLoTiene: 'x' },
    { pregunta: 'Armadura elaborada (kg): sin cuantía no hay kilos', destraba: ['B', 'C', 'D'], origen: 'proceso derivado', quienLoTiene: 'x' },
  ])
  assert.equal(d.decisiones[0].clave, 'armadura_cuantia_o_planilla')
  assert.equal(d.decisiones[1].clave, 'espesores_no_declarados')
})

test('CADA DECISIÓN DICE QUÉ CIERRA Y QUIÉN LA TOMA — sin eso es un título', () => {
  for (const d of DECISIONES) {
    assert.ok(d.pregunta && d.porQueCierra && d.quienLoDecide, `${d.clave} está incompleta`)
    assert.equal(typeof d.cuando, 'function')
  }
})

test('el control expone las decisiones y las sueltas por separado', () => {
  const r = controlar({
    computo: { detectados: 3, items: [item('A', 1)] },
    mapeo: { mapeos: [mapeo('A', ESTADO.PARTIDA_CANDIDATA, { faltan: [{ atributo: 'espesor_m', literal: '50cm' }] })] },
  })
  assert.equal(r.decisiones.length, 1)
  assert.match(r.resumen, /1 decisiones \+ 0 preguntas sueltas/)
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// EL CONTROL SE PRUEBA CON LO QUE EL SISTEMA PRODUCE, NO CON LO QUE YO ESCRIBO A MANO
//
// Una auditoría desarmó la versión anterior de `supuestosOcultos`: miraba `item.cantidad.fuente` y
// `computarElemento` asigna SIEMPRE `CALCULADO`, así que la función era estructuralmente incapaz de
// devolver otra cosa que cero. Y ningún test se ponía rojo, porque los tests fabricaban los items a
// mano con `FUENTE.INFERIDO` — un valor que el circuito NO PRODUCE JAMÁS. El control se validaba
// contra una entrada que el sistema no puede generar.
//
// Por eso los tests de acá abajo arman el elemento con `validarElemento` + `computarElemento`, que
// es exactamente el camino de producción.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/** Un elemento como sale del modelo, pasado por el circuito real de interpretación y cómputo. */
const delCircuito = (crudo) => computarElemento(validarElemento(crudo, { archivo: 'Plano.pdf', archivoId: 'x', lamina: 'L1' }))

test('C1 · UNA CITA QUE NO CONTIENE EL NÚMERO ES UN SUPUESTO OCULTO — el caso de la platea', () => {
  // Éste es el caso real: el plano dice «s/Cálculo» —o sea que el dato NO está— y el área salió de
  // la superficie del salón. Es la partida que este mismo archivo nombra como $ 29,6 M.
  const item = delCircuito({
    id: 'PLATEA', nombre: 'Platea de fundación', sistema: 'hormigon_armado', forma: 'superficie',
    dimensiones: { area_m2: 191.92 },
    repeticion: { modo: 'conteo_directo', cantidad: 1 },
    evidencia: { vista: 'PLANTA', texto_literal: '01 Platea s/Calculo' },
  })
  const o = supuestosOcultos([item])
  assert.equal(o.length, 1, 'la cita existe y no contiene 191,92: el número no está leído del plano')
  assert.equal(o[0].que, 'area')
  assert.equal(o[0].valor, 191.92)
  assert.match(o[0].porQue, /NO aparece en la cita/)
})

test('C1 · CON LA CITA QUE SÍ CONTIENE EL NÚMERO, no hay supuesto', () => {
  const item = delCircuito({
    id: 'SALON', nombre: 'Salón', sistema: 'piso', forma: 'superficie',
    dimensiones: { area_m2: 191.92 },
    dimensiones_texto: { area_m2: 'Salon 191.92m²' },
    repeticion: { modo: 'conteo_directo', cantidad: 1 },
    evidencia: { vista: 'PLANTA', texto_literal: 'Salon 191.92m²' },
  })
  assert.equal(supuestosOcultos([item]).length, 0)
  assert.equal(item.dimensiones.area.fuente, FUENTE.EXTRAIDO_PLANO)
})

test('C1 · EL CONTROL NO PUEDE DEVOLVER CERO POR CONSTRUCCIÓN: mira la evidencia, no la etiqueta', () => {
  // Si alguien vuelve a mirar sólo `cantidad.fuente`, este test se pone rojo: la cantidad de este
  // item tiene fuente CALCULADO —la única que el circuito produce— y el hueco está en la dimensión.
  const item = delCircuito({
    id: 'X', nombre: 'Viga X', sistema: 'hormigon_armado', forma: 'prisma',
    dimensiones: { ancho_m: 0.2, alto_m: 0.4, largo_m: 6 },
    dimensiones_texto: { ancho_m: 'V(20-40)', alto_m: 'V(20-40)' },
    repeticion: { modo: 'conteo_directo', cantidad: 2 },
    evidencia: { vista: 'CORTE', texto_literal: 'V(20-40)' },
  })
  assert.equal(item.cantidad.fuente, FUENTE.CALCULADO, 'la etiqueta que la versión rota miraba')
  const o = supuestosOcultos([item])
  assert.equal(o.length, 1, 'el largo 6 no está en ninguna cita')
  assert.equal(o[0].que, 'largo')
})

test('G2 · EL «+1» SIN DECLARAR NO PRODUCE CANTIDAD: produce la pregunta', () => {
  // La correa real de Quattropani: 18,30 m cada 1,63 m. Con `incluye_extremos` sin declarar, el
  // código ponía 13 donde el techo da 12 — +8,3% sobre la partida, con fuente CALCULADO.
  const sinDeclarar = delCircuito({
    id: 'CORREA', nombre: 'Correa C140', sistema: 'estructura_metalica', forma: 'lineal',
    dimensiones: { largo_m: 18.3 }, dimensiones_texto: { largo_m: '18.30' },
    repeticion: { modo: 'por_separacion', longitud_tramo_m: 18.3, separacion_m: 1.63 },
    evidencia: { vista: 'PLANTA', texto_literal: '18.30 · 1.63' },
  })
  assert.equal(sinDeclarar.cantidad, null)
  assert.ok(sinDeclarar.faltan.some((f) => /DOS EXTREMOS/.test(f)))

  const declarado = delCircuito({
    id: 'CORREA', nombre: 'Correa C140', sistema: 'estructura_metalica', forma: 'lineal',
    dimensiones: { largo_m: 18.3 }, dimensiones_texto: { largo_m: '18.30' },
    repeticion: { modo: 'por_separacion', longitud_tramo_m: 18.3, separacion_m: 1.63, incluye_extremos: false },
    evidencia: { vista: 'PLANTA', texto_literal: '18.30 · 1.63' },
  })
  assert.equal(declarado.cantidadElementos, 12, 'techo(18,30 ÷ 1,63) = 12, sin el +1 que nadie pidió')
})

test('G2 · declarado en true, el +1 entra y queda en las entradas de la fórmula', () => {
  const e = delCircuito({
    id: 'C', nombre: 'Correa', sistema: 'estructura_metalica', forma: 'lineal',
    dimensiones: { largo_m: 18.3 }, dimensiones_texto: { largo_m: '18.30' },
    repeticion: { modo: 'por_separacion', longitud_tramo_m: 18.3, separacion_m: 1.63, incluye_extremos: true },
    evidencia: { vista: 'PLANTA', texto_literal: '18.30 · 1.63' },
  })
  assert.equal(e.cantidadElementos, 13)
  assert.equal(e.cantidad.entradas.cantidadElementos, 13)
})
