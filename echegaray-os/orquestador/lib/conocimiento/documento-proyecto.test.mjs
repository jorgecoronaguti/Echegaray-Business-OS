// EL CONTRATO Y LA MEMORIA DE QUATTROPANI, EN LAS FRASES QUE DE VERDAD TIENEN.
//
// Todo el texto de abajo está COPIADO del `CONTRATO DE OBRA Y MEMORIA DESCRIPTIVA.docx` de la
// carpeta de Drive. No es prosa inventada para que el extractor quede bien: es exactamente lo que
// hay que poder leer, y por eso lo que este archivo prueba es lo que el motor va a encontrar.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CATEGORIA, aConocimientos, cantidadesDe, categoriasDe, frasesConSeccion, hallazgo, huecosDeclarados,
  huellaDeFrase, leerDocumentoDeProyecto,
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

test('un borrador propio NO contradice al contrato del cliente', () => {
  // Apareció al abrir los `.docx`: «Charlar de diagrama de GANT.docx» y «Diagrama IA.docx» —una
  // nota de trabajo y una salida de un modelo— entraban como PLIEGO con confianza alta y discutían
  // de igual a igual con el contrato firmado. De los 8 conflictos medidos en QUATTROPANI, 5 eran eso.
  const nota = hecho({ elemento: 'columna', atributo: 'material', valor: 'metalico', clase: CLASE_FUENTE.NOTA_INTERNA, documento: 'Charlar de diagrama de GANT.docx', textoLiteral: 'columnas metálicas del galpón', confianza: 'alta' })
  const r = cruzarHechos({ delMotor: [nota], delDocumento: [delDoc('columna', 'material', 'hormigon_armado')] })
  assert.equal(r[0].cruce, CRUCE.SOLO_MENCIONES)
  assert.match(r[0].porQue, /un borrador propio no contradice a un contrato/)
})

test('la clave sale del CONTENIDO de la cláusula, no de su posición', () => {
  // ═══ EL MISMO ERROR QUE `materiales-fusion.mjs` ARREGLÓ EN EL CUADRO 5 DE OBRAS ═══
  // La clave era `…{categoria}.{n}` con `n` la posición dentro de su categoría. Reingerir el
  // documento con una cláusula INTERCALADA corre todo lo que sigue: cada clave queda apuntando a
  // otra cláusula, la biblioteca conserva la vieja bajo esa clave y la nueva se pierde. En silencio
  // y sin un solo error. Emparejar por POSICIÓN en vez de por IDENTIDAD.
  //
  // MUTACIÓN QUE LO PONE ROJO: volver `n` al ordinal en `aConocimientos`.
  const conocimiento = (k) => k
  const lectura = leerDocumentoDeProyecto(MEMORIA, { documento: 'Contrato.docx', clase: CLASE_FUENTE.PLIEGO })
  const claveDe = (r) => new Map(aConocimientos(r, { conocimiento }).candidatos.map((k) => [k.afirmacion, k.clave]))
  const antes = claveDe(lectura)

  // La MISMA lectura con una cláusula nueva intercalada ANTES de las que ya existían de su
  // categoría — que es lo que pasa cuando el contrato se corrige agregando un párrafo arriba.
  const primera = lectura.hallazgos.find((h) => h.categoria === CATEGORIA.EXCLUSION)
  const intercalada = hallazgo({
    categoria: CATEGORIA.EXCLUSION,
    documento: 'Contrato.docx',
    seccion: primera.seccion,
    textoLiteral: 'No se incluye la provisión ni la colocación de aberturas de aluminio.',
    cantidades: [],
  })
  const i = lectura.hallazgos.indexOf(primera)
  const reingerido = { ...lectura, hallazgos: [...lectura.hallazgos.slice(0, i), intercalada, ...lectura.hallazgos.slice(i)] }
  const despues = claveDe(reingerido)

  assert.equal(despues.size, antes.size + 1, 'la cláusula nueva tiene que sumar un conocimiento')
  // ═══ LO QUE IMPORTA NO ES QUE LA CLAVE EXISTA: ES A QUÉ CLÁUSULA APUNTA ═══
  // Con el ordinal, `exclusion.1` sigue existiendo después de la reingesta — pero apunta a OTRA
  // cláusula. La biblioteca conserva el conocimiento viejo bajo esa clave (gana el que ya estaba) y
  // las cláusulas corridas no entran nunca. Nada falla, nada avisa.
  const mudadas = [...antes].filter(([texto, clave]) => despues.get(texto) !== clave)
  assert.deepEqual(mudadas.map(([t, c]) => `${c} ← «${t.slice(0, 60)}»`), [],
    `${mudadas.length} cláusula(s) cambiaron de clave al reingerir: cada una queda emparejada con la que no es`)
  // Y la intercalada entra con una clave que antes no existía.
  const nuevas = [...despues].filter(([texto]) => !antes.has(texto))
  assert.equal(nuevas.length, 1)
  assert.ok(![...antes.values()].includes(nuevas[0][1]), 'la cláusula nueva no puede pisar la clave de otra')

  // La huella ignora el ruido de formato y NO ignora el contenido.
  assert.equal(huellaDeFrase('No se contempla revoques ni pintura.'), huellaDeFrase(' No se  contempla revoques ni pintura. '))
  assert.notEqual(huellaDeFrase('U$S 31500 + IVA'), huellaDeFrase('U$S 3150 + IVA'))
})

test('la CLASE llega a la biblioteca: si no, la nota interna es indistinguible del contrato', () => {
  // El blindaje de `cruzarHechos` cubría el CRUCE y nada más. Las frases del borrador igual se
  // grababan con procedencia DOCUMENTO_PROYECTO y confianza MEDIA, o sea con la misma cara que las
  // del contrato firmado: quien después leyera la biblioteca no tenía cómo saber cuál era cuál.
  const conocimiento = (k) => k
  const delContrato = leerDocumentoDeProyecto(MEMORIA, { documento: 'Contrato de Obra.docx', clase: CLASE_FUENTE.PLIEGO })
  const delBorrador = leerDocumentoDeProyecto(MEMORIA, { documento: 'Charlar de diagrama de GANT.docx', clase: CLASE_FUENTE.NOTA_INTERNA })
  assert.equal(delContrato.clase, 'PLIEGO')
  assert.equal(delBorrador.clase, 'NOTA_INTERNA')

  const a = aConocimientos(delContrato, { conocimiento })
  const b = aConocimientos(delBorrador, { conocimiento })
  assert.ok(a.candidatos.length > 0 && b.candidatos.length > 0)
  assert.equal(a.candidatos[0].evidencia.clase, 'PLIEGO')
  assert.equal(a.candidatos[0].confianza, 'MEDIA')
  assert.equal(b.candidatos[0].evidencia.clase, 'NOTA_INTERNA')
  assert.equal(b.candidatos[0].confianza, 'BAJA', 'un apunte propio no puede entrar con la confianza de un contrato')
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

test('el VERBO de la exclusión no es un término suyo: «excluidas» sólo encuentra otra exclusión', () => {
  // Pasaba el filtro de largo y salía como discriminante. Buscar «excluidas» en el cómputo no puede
  // señalar una partida: si aparece, aparece en otra frase de exclusión.
  const t = terminosDeExclusion('Se ratifica que las estructuras del entrepiso quedan completamente excluidas de los trabajos.')
  assert.ok(t.includes('entrepiso'))
  assert.ok(!t.includes('excluidas'), `el verbo se coló: ${t.join(', ')}`)
  assert.ok(!terminosDeExclusion('No se incluye entrepiso ni escalera; de ser requeridos, se cotizaran como adicional.').includes('requeridos'))
})

test('«no se pudo medir» no puede salir igual que «los medí y ninguno era genérico»', () => {
  // Con menos partidas que el mínimo el corte no corre, y `estructuras`/`metalica` pasaban como
  // discriminantes sin que nadie supiera que el filtro no había mirado. El hallazgo más caro del
  // circuito estaba apoyado en un filtro que podía no haberse ejecutado, y no lo decía.
  const terminos = ['entrepiso', 'escalera', 'metalica', 'estructuras']
  const pocos = [{ descripcion: 'Estructuras metálicas de cubierta' }, { descripcion: 'Entrepiso de losa' }]
  const chico = terminosDiscriminantes(terminos, pocos)
  assert.equal(chico.medido, false)
  assert.deepEqual(chico.discriminantes, terminos, 'no se descarta nada: no hay con qué')
  assert.match(chico.porQue, /NO corrió/)

  const muchos = Array.from({ length: 12 }, (_, i) => ({ descripcion: `Provisión y montaje de estructuras metálicas ${i}` }))
  const grande = terminosDiscriminantes(terminos, muchos)
  assert.equal(grande.medido, true)
  assert.deepEqual(grande.discriminantes, ['entrepiso', 'escalera'])
  // Y el que no pudo medir tiene que llegar hasta arriba: si se queda en la función, no sirve.
  const l = leerDocumentoDeProyecto(MEMORIA, { documento: 'contrato.docx' })
  const r = contrastar({ lecturas: [l], itemsDelComputo: pocos })
  assert.ok(r.exclusionesSinMedir.length > 0)
  assert.match(r.resumen, /el filtro de términos genéricos NO pudo medir/)
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
