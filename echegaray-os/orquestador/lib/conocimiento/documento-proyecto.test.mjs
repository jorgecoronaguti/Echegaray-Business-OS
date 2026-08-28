// EL CONTRATO Y LA MEMORIA DE QUATTROPANI, EN LAS FRASES QUE DE VERDAD TIENEN.
//
// Todo el texto de abajo está COPIADO del `CONTRATO DE OBRA Y MEMORIA DESCRIPTIVA.docx` de la
// carpeta de Drive. No es prosa inventada para que el extractor quede bien: es exactamente lo que
// hay que poder leer, y por eso lo que este archivo prueba es lo que el motor va a encontrar.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CATEGORIA, cantidadesDe, categoriasDe, frasesConSeccion, hallazgo, huecosDeclarados, leerDocumentoDeProyecto,
} from './documento-proyecto.mjs'
import {
  CRUCE, contrastar, cruzarHechos, estaMedido, exclusionesContraComputo, raiz, terminosDeExclusion, terminosDiscriminantes,
} from './contrastar-documento.mjs'
import { CLASE_FUENTE, hecho } from '../plano/proyecto.mjs'

const MEMORIA = `CONTRATO DE LOCACIÓN DE OBRA

2. ALCANCE

La cotización aprobada forma parte integrante del presente contrato y comprende exclusivamente la ejecución de la mano de obra necesaria para la construcción de la obra.

5. PLAZO

El plazo estimado de ejecución de la obra es de ocho (8) meses a partir del inicio efectivo de los trabajos.

7. ADICIONALES

Los adicionales deberán ser aprobados por escrito por el locatario antes de su ejecución.

5. ESPECIFICACIONES CONSTRUCTIVAS DE ARQUITECTURA

El cerramiento superior y lateral de la nave se ejecuta con estructura metálica según plano.
El frente comercial se resuelve con cristal templado tipo Blindex (espesor mínimo según cálculo de presión de viento) y puertas pivotantes.
Se instalarán dos (2) tanques de reserva de polietileno tricapa con una capacidad de 600 litros cada uno.

8. SISTEMA DE COLUMNAS MIXTAS EN ALTURA Y TRANSICIÓN

Los paños de muros exteriores se ejecutan en ladrillón macizo de 20 cm asentados con mortero de cemento, cal y arena, según plano.
Todos los muros serán vistos. No se contempla revoques ni pintura en los muros.

10. PROTOCOLO DE PREVISIÓN PARA FUTURO ENTREPISO

Se ratifica que las estructuras correspondientes al entrepiso como su escalera metálica asociada, quedan completamente excluidas de los trabajos a ejecutar por la empresa constructora en esta etapa.

11. ALCANCE CONTRACTUAL Y RESPONSABILIDADES ADMINISTRATIVAS

El Locador tendrá a su exclusivo cargo la gestión integral de todas las tramitaciones técnicas y administrativas necesarias para la ejecución de la obra.
Atendiendo a las directrices sísmicas para zonas de alta peligrosidad (San Juan - Zona 4), los antepechos incorporarán un encadenado de refuerzo.`

test('la sección viaja con la frase: sin ella la exclusión no tiene sujeto', () => {
  const fs = frasesConSeccion(MEMORIA)
  const ex = fs.find((f) => /quedan completamente excluidas/.test(f.texto))
  assert.equal(ex.seccion, '10. PROTOCOLO DE PREVISIÓN PARA FUTURO ENTREPISO')
})

test('las ocho categorías se reconocen sobre las frases reales del contrato', () => {
  const l = leerDocumentoDeProyecto(MEMORIA, { documento: 'CONTRATO DE OBRA Y MEMORIA DESCRIPTIVA.docx' })
  for (const c of [CATEGORIA.ALCANCE, CATEGORIA.EXCLUSION, CATEGORIA.RESPONSABILIDAD, CATEGORIA.REQUISITO_CONTRACTUAL, CATEGORIA.CRITERIO_TECNICO, CATEGORIA.REFERENCIA_PLANO, CATEGORIA.SIN_DEFINIR]) {
    assert.ok((l.porCategoria[c] ?? 0) > 0, `no salió ningún hallazgo de ${c}`)
  }
})

test('las dos exclusiones del contrato salen, y son las que cambian el precio', () => {
  const l = leerDocumentoDeProyecto(MEMORIA, { documento: 'contrato.docx' })
  const ex = l.hallazgos.filter((h) => h.categoria === CATEGORIA.EXCLUSION).map((h) => h.textoLiteral)
  assert.ok(ex.some((t) => /entrepiso.*escalera.*excluidas/i.test(t)), 'falta la exclusión del entrepiso y la escalera')
  assert.ok(ex.some((t) => /No se contempla revoques ni pintura/i.test(t)), 'falta la exclusión de revoque y pintura')
})

test('el documento declara su propio hueco y eso vale más que deducirlo', () => {
  const l = leerDocumentoDeProyecto(MEMORIA, { documento: 'contrato.docx' })
  const h = huecosDeclarados(l)
  assert.ok(h.some((x) => /seg[uú]n c[aá]lculo de presi[oó]n de viento/i.test(x.textoLiteral)))
  assert.ok(h.every((x) => x.tipo === 'FALTA_DATO' && x.porQue.includes('el propio documento declara')))
})

test('una cantidad escrita con letra y número se lee: «dos (2) tanques»', () => {
  const c = cantidadesDe('Se instalarán dos (2) tanques de reserva con una capacidad de 600 litros cada uno.')
  assert.ok(c.some((x) => x.valor === '2' && x.unidad === 'tanques'))
  assert.ok(c.some((x) => x.valor === '600' && /lit/.test(x.unidad)))
})

test('una frase sin ningún marcador no produce hallazgos inventados', () => {
  assert.deepEqual(categoriasDe('El acceso peatonal principal se efectúa desde la Línea Municipal.'), [])
  const l = leerDocumentoDeProyecto('El acceso peatonal principal se efectúa desde la Línea Municipal mediante una rampa.', { documento: 'x.docx' })
  assert.equal(l.hallazgos.length, 0)
})

test('un hallazgo sin cita no se construye', () => {
  assert.equal(hallazgo({ categoria: CATEGORIA.EXCLUSION, documento: 'x', textoLiteral: 'corto' }), null)
  assert.equal(hallazgo({ categoria: CATEGORIA.EXCLUSION, textoLiteral: 'una frase suficientemente larga' }), null)
})

// ═══════════════ el contraste contra el motor ═══════════════

const medido = (elemento, atributo, valor) => hecho({ elemento, atributo, valor, clase: CLASE_FUENTE.CAD, documento: 'galpon.dwg', textoLiteral: `cota acotada ${valor}`, confianza: 'alta' })
const deducido = (elemento, atributo, valor) => hecho({ elemento, atributo, valor, clase: CLASE_FUENTE.PLANILLA, documento: 'computo-cliente.xlsx', textoLiteral: `fila del cómputo: ${valor}`, confianza: 'baja' })
const delDoc = (elemento, atributo, valor) => hecho({ elemento, atributo, valor, clase: CLASE_FUENTE.MEMORIA, documento: 'contrato.docx', textoLiteral: `la memoria dice ${valor}`, confianza: 'alta' })

test('confirmar algo MEDIDO y coincidir con algo DEDUCIDO no son el mismo resultado', () => {
  // Ésta es la regla del archivo. Si alguien unifica los dos casos en «coincide», este test da rojo:
  // una deducción confirmada por casualidad seguiría siendo una deducción, y el cruce diría que no.
  const r = cruzarHechos({
    delMotor: [medido('columna', 'altura_m', 3), deducido('cubierta', 'superficie_m2', 191.92)],
    delDocumento: [delDoc('columna', 'altura_m', 3), delDoc('cubierta', 'superficie_m2', 191.92)],
  })
  assert.deepEqual(r.map((x) => x.cruce), [CRUCE.CONFIRMA_MEDIDO, CRUCE.COINCIDE_CON_INFERENCIA])
  assert.match(r[1].porQue, /no se convierte en medición por coincidir/)
  assert.equal(estaMedido(medido('x', 'y', 1)), true)
  assert.equal(estaMedido(deducido('x', 'y', 1)), false)
})

test('dos valores distintos son CONFLICTO, nunca un promedio ni una elección', () => {
  const r = cruzarHechos({ delMotor: [medido('columna', 'altura_m', 3)], delDocumento: [delDoc('columna', 'altura_m', 5.6)] })
  assert.equal(r[0].cruce, CRUCE.CONFLICTO)
  assert.match(r[0].porQue, /elegir una sería arbitrario/)
})

test('lo que sólo dice el documento se APORTA, no corrige nada', () => {
  const r = cruzarHechos({ delMotor: [], delDocumento: [delDoc('muro', 'terminacion', 'visto')] })
  assert.equal(r[0].cruce, CRUCE.APORTA)
})

test('el cómputo que trae lo que el contrato excluye es el hallazgo más caro', () => {
  const l = leerDocumentoDeProyecto(MEMORIA, { documento: 'contrato.docx' })
  const items = [
    { descripcion: 'Provisión y montaje de escalera metálica de acceso al entrepiso' },
    { descripcion: 'Revoque grueso y fino sobre muros exteriores' },
    { descripcion: 'Provisión y colado de hormigón H-21 en bases' },
  ]
  const ch = exclusionesContraComputo(l.hallazgos, items)
  const chocados = [...new Set(ch.map((x) => x.item.descripcion))]
  assert.ok(chocados.some((d) => /escalera/i.test(d)))
  assert.ok(chocados.some((d) => /Revoque/i.test(d)))
  assert.ok(!chocados.some((d) => /hormigón H-21/i.test(d)), 'el hormigón no está excluido y no puede chocar')
  assert.ok(ch.every((x) => x.cruce === CRUCE.CONFLICTO_DE_ALCANCE && x.exclusion.textoLiteral))
})

test('un término corto no puede disparar una exclusión', () => {
  // Con cuatro letras entra «piso», que aparece en «contrapiso», «piso de hormigón» y en media obra:
  // toda la cotización quedaría marcada como excluida.
  const t = terminosDeExclusion('No se contempla el entrepiso ni el piso de la escalera.')
  assert.ok(t.includes('entrepiso'))
  assert.ok(t.includes('escalera'))
  assert.ok(!t.includes('piso'))
})

test('un término que nombra media obra deja de señalar una exclusión, y se dice', () => {
  // «estructuras» y «metalica» están en la exclusión del entrepiso Y en media cotización de un
  // galpón. Sin este corte, TODA la obra metálica de Quattropani quedaría marcada como excluida —un
  // falso conflicto que bloquea la cotización entera—. El corte se MIDE sobre el cómputo, no sale de
  // una lista de palabras: cuál término es genérico depende de la obra.
  const items = Array.from({ length: 16 }, (_, i) => ({ descripcion: i < 8 ? `Montaje de estructura metálica ${i}` : `Hormigón H-21 elemento ${i}` }))
  const { discriminantes, genericos } = terminosDiscriminantes(['entrepiso', 'escalera', 'metalica', 'estructuras'], items)
  assert.deepEqual(discriminantes.sort(), ['entrepiso', 'escalera'])
  assert.deepEqual(genericos.map((g) => g.termino).sort(), ['estructuras', 'metalica'])
  assert.match(genericos[0].porQue, /50% de las partidas/)
  // Y con pocas partidas NO se aplica: sobre tres ítems una frecuencia no es una frecuencia.
  assert.equal(terminosDiscriminantes(['metalica'], [{ descripcion: 'estructura metálica' }]).genericos.length, 0)
  assert.equal(raiz('revoques'), 'revoque')
})

test('el contraste no emite un veredicto: devuelve las cinco listas y su cuenta', () => {
  const l = leerDocumentoDeProyecto(MEMORIA, { documento: 'contrato.docx' })
  const r = contrastar({ hechosDelMotor: [medido('columna', 'altura_m', 3)], lecturas: [l], itemsDelComputo: [{ descripcion: 'Escalera metálica' }] })
  assert.equal(typeof r.cuenta[CRUCE.CONFLICTO_DE_ALCANCE], 'number')
  assert.ok(r.cuenta[CRUCE.CONFLICTO_DE_ALCANCE] > 0)
  assert.ok(r.conflictos.length > 0)
  assert.match(r.resumen, /choque\(s\) entre el cómputo y una exclusión/)
})
