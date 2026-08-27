// LAS SEÑALES DE LA OBRA — cada prueba mide un defecto que la evidencia real produjo.

import test from 'node:test'
import assert from 'node:assert/strict'
import { veredictoDe } from './clasificar-actividades.mjs'
import { sustitucion,
  singular, tokens, relacionDeNombres, vetosDe, corroboracionesDe, pruebaDirecta,
} from './clasificar-senales.mjs'

test('el plural no abre una tarea nueva, y «BASES» no se convierte en «BAS»', () => {
  assert.equal(singular('EXCAVACIONES'), 'EXCAVACION')
  assert.equal(singular('PORTONES'), 'PORTON')
  assert.equal(singular('BASES'), 'BASE')
  assert.equal(singular('ZANJAS'), 'ZANJA')
  assert.equal(singular('ESCOMBROS'), 'ESCOMBRO')
  // Palabras cortas no se tocan: quitarles una letra las convierte en otra cosa.
  assert.equal(singular('MAS'), 'MAS')
})

test('la medida NO se pierde al normalizar: dos espesores son dos tareas', () => {
  // «PISO DE HORMIGÓN - 20CM» y «- 15CM» son tareas distintas y el espesor es lo único que las
  // separa. Un normalizador que tirara los números las fundiría en una sola.
  assert.notDeepEqual([...tokens('PISO DE HORMIGÓN - 20CM')], [...tokens('PISO DE HORMIGÓN - 15CM')])
  assert.ok(tokens('PISO DE HORMIGÓN - 20CM').has('20CM'))
})

test('los conectores no cuentan: «Nivelacion de terreno» = «NIVELACION TERRENO»', () => {
  assert.equal(relacionDeNombres('Nivelacion de terreno', 'NIVELACION TERRENO'), 'IGUAL')
})

test('CON y SIN no son ruido: cambian el trabajo y el precio', () => {
  // Con «CON», «SIN» y «SOBRE» tratados como conectores, «MURO SIN REVOQUE» y «MURO CON REVOQUE»
  // salían IGUAL y se clasificaban como la misma tarea. Dos trabajos distintos con dos costos
  // distintos, fundidos en un rendimiento.
  assert.equal(relacionDeNombres('MURO SIN REVOQUE', 'MURO CON REVOQUE'), 'DISTINTAS')
  assert.equal(relacionDeNombres('PISO SOBRE LOSA', 'PISO DE HORMIGON'), 'DISTINTAS')
})

test('una letra suelta puede ser una designación, no un conector', () => {
  // «MURO TIPO A» y «MURO TIPO B» quedaban con las mismas palabras al descartar «A» y «TIPO».
  assert.equal(relacionDeNombres('MURO TIPO A', 'MURO TIPO B'), 'DISTINTAS')
  // Y no hace falta descartarlas para que el veto de especificidad siga funcionando.
  assert.equal(relacionDeNombres('Hormigonado', 'HORMIGONADO A MANO'), 'CANDIDATA_MAS_ESPECIFICA')
})

test('contener no es ser: la relación se declara en vez de resolverse por parecido', () => {
  assert.equal(relacionDeNombres('Hormigonado', 'HORMIGONADO A MANO'), 'CANDIDATA_MAS_ESPECIFICA')
  assert.equal(relacionDeNombres('Solicitud de Programa de Seguridad', 'PROGRAMA DE SEGURIDAD'), 'ACTIVIDAD_MAS_ESPECIFICA')
  assert.equal(relacionDeNombres('PISO DE HORMIGON', 'PUENTE DE HORMIGON'), 'DISTINTAS')
})

test('el veto por hermana: la obra que parte una tarea en dos dice que no es ninguna', () => {
  const vetos = vetosDe({ nombre: 'RELLENO Y COMPACTACIÓN' }, {
    nombre: 'Compactación',
    hermanas: [{ nombre: 'Relleno' }, { nombre: 'Tendido de malla' }],
  })
  assert.ok(vetos.some((v) => /Relleno/.test(v)))
})

test('una hermana con el mismo nombre que la actividad no se veta a sí misma', () => {
  // Seis «Compactación» en seis galpones son la misma tarea repetida, no una tarea que abarca a la
  // otra. Sin esta guarda, cualquier frente con dos actividades iguales se vetaba solo.
  const vetos = vetosDe({ nombre: 'COMPACTACION DE SUELO' }, {
    nombre: 'Compactación', hermanas: [{ nombre: 'Compactación' }],
  })
  assert.equal(vetos.filter((v) => /mismo frente/.test(v)).length, 0)
})

test('las corroboraciones son independientes del nombre y se nombran una por una', () => {
  const cs = corroboracionesDe({ tareaTipoId: 't1', nombre: 'TENDIDO DE MALLA', unidad: 'M2' }, {
    nombre: 'Tendido', unidad: 'm2', seccion: 'Tendido de malla', obra: 'Galpón San Francisco',
    hermanas: [{ nombre: 'Otra', tareaTipoId: 't1' }],
  })
  const senales = cs.map((c) => c.senal).sort()
  assert.deepEqual(senales, ['rubro', 'unidad', 'vecina'])
})

test('la partida cotizada es una prueba, no una inferencia', () => {
  const d = pruebaDirecta({ partidaTareaTipoId: 't7', partidaCodigo: '2.1' })
  assert.equal(d.origen, 'presupuesto')
  assert.equal(d.confianza, 'EXACTO')
  // Y sin ninguna de las dos, no hay prueba directa: no se inventa una.
  assert.equal(pruebaDirecta({}), null)
})

// ═══ EL VETO POR SUSTITUCIÓN — los cinco pares reales que la auditoría encontró ═══
//
// El defecto: sacar CON/SIN/SOBRE de los conectores impidió que salieran IGUAL por palabras, pero
// NO impidió que se asignaran — caían por ALTA por similitud, que no mira palabras. Y su similitud
// es alta justamente porque difieren en una sola palabra de muchas. El timer los escribía 4 veces
// por día, con confianza ALTA y sin que interviniera una persona.
//
// Se prueba sobre `veredictoDe` —el efecto— y no sobre `relacionDeNombres`, que era lo que el test
// anterior medía: probaba la palabra, no lo que la palabra provocaba.

const par = (actividad, candidata, similitud, unidad = 'M2') =>
  veredictoDe({ nombre: actividad, unidad, seccion: null, obra: null, hermanas: [] },
    [{ tareaTipoId: 't1', nombre: candidata, unidad, similitud }])

test('dos nombres que difieren en la palabra que cambia el trabajo NO se asignan', () => {
  const casos = [
    ['PINTURA AL LATEX EN MUROS EXTERNOS', 'PINTURA AL LATEX EN MUROS INTERNOS', 0.83],
    ['CONTRAPISO PARA MOSAICO e = 0,15 m', 'CONTRAPISO PARA MOSAICO e = 0,10 m', 0.88],
    ['DEMOLICION DE BACHE - 2M2', 'DEMOLICION DE BACHE - 1M2', 0.76],
    ['APLICACION DE ESMALTE SINTETICO 3:1 A PINCEL', 'APLICACION DE ESMALTE SINTETICO 3:1 A SOPLETE', 0.74],
    ['MAMPOSTERIA LADRILLON CERAMICO e = 0,30 m', 'MAMPOSTERIA LADRILLON CERAMICO e = 0,20 m', 0.63],
  ]
  for (const [a, b, sim] of casos) {
    const v = par(a, b, sim)
    assert.notEqual(v.veredicto, 'ALTA', `«${a}» se asignó sola a «${b}» con ${sim} de similitud`)
    assert.equal(v.tareaTipoId, undefined, `«${a}» quedó vinculada a «${b}»`)
  }
})

test('la sustitución se detecta por la FORMA de la diferencia, no por una lista de palabras', () => {
  // Una lista de palabras peligrosas nunca está completa. Se veta que dos nombres casi iguales
  // difieran en una palabra, sea cual sea.
  assert.ok(sustitucion('MURO INTERIOR DE LADRILLO', 'MURO EXTERIOR DE LADRILLO'))
  assert.ok(sustitucion('VIGA H17 FE 100', 'VIGA H17 FE 130'))
  // Contención: NO es sustitución, tiene su propio veto y su propio mensaje.
  assert.equal(sustitucion('HORMIGONADO', 'HORMIGONADO A MANO'), null)
  // Dos nombres que apenas se parecen tampoco: no comparten más de lo que difieren.
  assert.equal(sustitucion('REPLANTEO', 'PINTURA DE CIELORRASO'), null)
})

test('el rubro y la obra ya no bajan el umbral: salen del propio nombre', () => {
  // «el rubro MUROS nombra MURO» es un control validado contra la información que produce. Con eso
  // el umbral caía de 0,75 a 0,60 y el par de mampostería 0,20/0,30 se asignaba solo.
  const c = corroboracionesDe({ nombre: 'MURO DE LADRILLO', unidad: 'M2' },
    { nombre: 'MURO DE LADRILLO HUECO', unidad: 'M2', seccion: 'MUROS', obra: 'MURO PERIMETRAL' })
  const independientes = c.filter((x) => x.independiente !== false)
  assert.equal(independientes.every((x) => x.senal !== 'rubro' && x.senal !== 'obra'), true)
  assert.ok(c.some((x) => x.senal === 'rubro' && x.independiente === false), 'el rubro se sigue viendo, pero no corrobora')
})
