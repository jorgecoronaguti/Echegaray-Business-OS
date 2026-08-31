// LOS DOCUMENTOS SE RELACIONAN, Y CUANDO SE CONTRADICEN ALGUIEN MANDA — O NADIE.
//
// Cada control de este archivo que puede decir «no hay conflicto» tiene al lado la corrida que lo
// pone a decir CONFLICTO. Un detector de conflictos que nunca vio uno no es un detector.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DOMINIO, VISTA, ambitoDe, dominioDe, familiaDe, mandaSobre, rangoDe, relacionar, vistaDe,
} from './relacion.mjs'
import { CLASE_FUENTE, ESTADO_HECHO, consolidar, hecho } from './proyecto.mjs'

const RAIZ = 'administracion/PRESUPUESTOS - CLIENTES/ARCOR - SAN JUAN/'

const doc = (name, path) => ({ name, path: path ?? `${RAIZ}${name}` })
const h = (o) => hecho({ textoLiteral: `dice ${o.valor}`, ...o })

test('la VISTA sale del rótulo del archivo, y no saberla no es «es una planta»', () => {
  assert.equal(vistaDe('E2 - Detalle de nudo columna-viga.pdf'), VISTA.DETALLE)
  assert.equal(vistaDe('Corte A-A.pdf'), VISTA.CORTE)
  assert.equal(vistaDe('Planta de fundaciones.pdf'), VISTA.PLANTA)
  assert.equal(vistaDe('ARSJ Planilla de computo - Filtro Sanitario.xlsx'), VISTA.PLANILLA)
  assert.equal(vistaDe('GALVARINI.pdf'), VISTA.INDETERMINADA)
})

test('el DOMINIO decide qué jerarquía aplica, y el atributo que no está en la tabla no habilita ninguna', () => {
  assert.equal(dominioDe('resistencia'), DOMINIO.ESPECIFICACION)
  assert.equal(dominioDe('espesor_m'), DOMINIO.GEOMETRIA)
  assert.equal(dominioDe('cantidad_insertada'), DOMINIO.CANTIDAD)
  assert.equal(dominioDe('ubicacion'), DOMINIO.ALCANCE)
  assert.equal(dominioDe('color_de_la_puerta'), DOMINIO.INDETERMINADO)
  assert.equal(rangoDe('PLANO', DOMINIO.INDETERMINADO), null)
})

test('EL PLIEGO NO ACOTA Y EL CAD NO ESPECIFICA: no tener autoridad no es tener poca', () => {
  assert.equal(rangoDe('PLIEGO', DOMINIO.GEOMETRIA), null)
  assert.equal(rangoDe('CAD', DOMINIO.ESPECIFICACION), null)
  assert.equal(rangoDe('CAD', DOMINIO.GEOMETRIA), 0)
  assert.equal(rangoDe('PLIEGO', DOMINIO.ALCANCE), 0)
})

test('el ÁMBITO salta las carpetas que agrupan y se queda con la que nombra la obra', () => {
  assert.equal(ambitoDe(`${RAIZ}OBRAS PERDIDAS/REPARACION DE LUCERAS/ARSJ Planilla.xls`, { carpetaObra: RAIZ }), 'REPARACION DE LUCERAS')
  assert.equal(ambitoDe(`${RAIZ}FILTRO SANITARIO/PROYECTO FINAL/computo.xlsx`, { carpetaObra: RAIZ }), 'FILTRO SANITARIO')
  assert.equal(ambitoDe(`${RAIZ}NOTA PARA SECONDI.docx`, { carpetaObra: RAIZ }), null)
})

test('la FAMILIA de revisiones ignora la marca de revisión, pero «PLANO 1» y «PLANO 2» siguen siendo dos', () => {
  assert.equal(familiaDe('Cocheras REV F.pdf'), familiaDe('Cocheras Rev D.pdf'))
  assert.notEqual(familiaDe('Plano 1.pdf'), familiaDe('Plano 2.pdf'))
  assert.equal(familiaDe('Cotizacion Final(1).xlsm'), familiaDe('Cotizacion Final.xlsm'))
})

test('UNA REVISIÓN VIEJA NO PISA A LA NUEVA — y la vieja sale igual, con su cita', () => {
  const docs = [doc('Cocheras Rev D.pdf'), doc('Cocheras REV F.pdf')]
  const rel = relacionar(docs, { carpetaObra: RAIZ })
  assert.equal(rel.superado.get('Cocheras Rev D.pdf').vigente, 'Cocheras REV F.pdf')
  const hechos = [
    h({ elemento: 'losa', atributo: 'espesor_m', valor: 0.12, clase: CLASE_FUENTE.PLANO, documento: 'Cocheras Rev D.pdf' }),
    h({ elemento: 'losa', atributo: 'espesor_m', valor: 0.15, clase: CLASE_FUENTE.PLANO, documento: 'Cocheras REV F.pdf' }),
  ]
  const c = consolidar(hechos, { relaciones: rel })
  assert.equal(c.conflictos.length, 0)
  assert.equal(c.hechos[0].estado, ESTADO_HECHO.RESUELTO_POR_JERARQUIA)
  assert.equal(c.hechos[0].valor, 0.15, 'gana la Rev F')
  assert.equal(c.hechos[0].desplazadas.length, 1)
  assert.equal(c.hechos[0].desplazadas[0].valor, 0.12)
  assert.match(c.hechos[0].desplazadas[0].textoLiteral, /0\.12/, 'la versión desplazada conserva su cita')
  // Y AL REVÉS NO CAMBIA NADA: el orden de entrada no puede decidir qué revisión rige.
  const alReves = consolidar([...hechos].reverse(), { relaciones: rel })
  assert.equal(alReves.hechos[0].valor, 0.15)
})

test('MUTACIÓN · sin el grafo de relaciones, ESAS MISMAS DOS REVISIONES son un CONFLICTO', () => {
  const hechos = [
    h({ elemento: 'losa', atributo: 'espesor_m', valor: 0.12, clase: CLASE_FUENTE.PLANO, documento: 'Cocheras Rev D.pdf' }),
    h({ elemento: 'losa', atributo: 'espesor_m', valor: 0.15, clase: CLASE_FUENTE.PLANO, documento: 'Cocheras REV F.pdf' }),
  ]
  const c = consolidar(hechos)
  assert.equal(c.conflictos.length, 1, 'el detector PUEDE decir conflicto: es lo que hace sin relaciones')
  assert.equal(c.hechos[0].valor, null)
})

test('LA MEMORIA MANDA SOBRE EL PLANO EN ESPECIFICACIÓN, Y EL PLANO SOBRE LA MEMORIA EN GEOMETRÍA', () => {
  const docs = [doc('Planta general.pdf'), doc('Memoria de calculo.pdf')]
  const rel = relacionar(docs, { carpetaObra: RAIZ })
  const spec = consolidar([
    h({ elemento: 'columna', atributo: 'resistencia', valor: 'H-21', clase: CLASE_FUENTE.PLANO, documento: 'Planta general.pdf' }),
    h({ elemento: 'columna', atributo: 'resistencia', valor: 'H-25', clase: CLASE_FUENTE.MEMORIA, documento: 'Memoria de calculo.pdf' }),
  ], { relaciones: rel })
  assert.equal(spec.hechos[0].valor, 'H-25', 'la resistencia la calculó el calculista')
  assert.equal(spec.hechos[0].estado, ESTADO_HECHO.RESUELTO_POR_JERARQUIA)

  const geo = consolidar([
    h({ elemento: 'columna', atributo: 'ancho', valor: 0.3, clase: CLASE_FUENTE.PLANO, documento: 'Planta general.pdf' }),
    h({ elemento: 'columna', atributo: 'ancho', valor: 0.4, clase: CLASE_FUENTE.MEMORIA, documento: 'Memoria de calculo.pdf' }),
  ], { relaciones: rel })
  assert.equal(geo.hechos[0].valor, 0.3, 'la cota está en la lámina, no en la memoria')
  // La prueba de que la jerarquía es POR DOMINIO y no un peso único: con `CLASE_FUENTE.peso`
  // (PLANO 2 < MEMORIA 3) el plano ganaría las dos, y la resistencia saldría H-21.
})

test('EL DETALLE MANDA SOBRE LA PLANTA EN GEOMETRÍA — misma clase, distinta vista', () => {
  const docs = [doc('Planta de fundaciones.pdf'), doc('Detalle de base tipo.pdf')]
  const rel = relacionar(docs, { carpetaObra: RAIZ })
  const c = consolidar([
    h({ elemento: 'base', atributo: 'ancho', valor: 1.0, clase: CLASE_FUENTE.PLANO, documento: 'Planta de fundaciones.pdf' }),
    h({ elemento: 'base', atributo: 'ancho', valor: 1.2, clase: CLASE_FUENTE.PLANO, documento: 'Detalle de base tipo.pdf' }),
  ], { relaciones: rel })
  assert.equal(c.hechos[0].valor, 1.2)
  assert.deepEqual(c.hechos[0].reglas, ['VISTA'])
})

test('CUANDO LA JERARQUÍA NO ALCANZA, EL RESULTADO ES CONFLICTO Y NO UN VALOR ELEGIDO EN SILENCIO', () => {
  const docs = [doc('Planta de fundaciones.pdf'), doc('Planta de fundaciones sector 2.pdf')]
  const rel = relacionar(docs, { carpetaObra: RAIZ })
  const c = consolidar([
    h({ elemento: 'base', atributo: 'ancho', valor: 1.0, clase: CLASE_FUENTE.PLANO, documento: 'Planta de fundaciones.pdf' }),
    h({ elemento: 'base', atributo: 'ancho', valor: 1.2, clase: CLASE_FUENTE.PLANO, documento: 'Planta de fundaciones sector 2.pdf' }),
  ], { relaciones: rel })
  assert.equal(c.conflictos.length, 1, 'misma clase, misma vista, ninguna superada: no hay regla que decida')
  assert.equal(c.hechos[0].valor, null)
  assert.equal(c.hechos[0].versiones.length, 2, 'las dos evidencias van adjuntas')
})

test('EL PLIEGO NO GANA UNA DISCUSIÓN DE COTAS: eso queda en CONFLICTO', () => {
  const docs = [doc('Planta general.pdf'), doc('Pliego de especificaciones.pdf')]
  const rel = relacionar(docs, { carpetaObra: RAIZ })
  const c = consolidar([
    h({ elemento: 'muro', atributo: 'espesor_m', valor: 0.2, clase: CLASE_FUENTE.PLANO, documento: 'Planta general.pdf' }),
    h({ elemento: 'muro', atributo: 'espesor_m', valor: 0.3, clase: CLASE_FUENTE.PLIEGO, documento: 'Pliego de especificaciones.pdf' }),
  ], { relaciones: rel })
  assert.equal(c.conflictos.length, 1)
  // Y EL MISMO PAR, EN ALCANCE, SÍ SE RESUELVE: es la prueba de que el CONFLICTO de arriba no es
  // una incapacidad del motor sino una decisión sobre ese dominio.
  const alc = consolidar([
    h({ elemento: 'muro', atributo: 'ubicacion', valor: 'incluido', clase: CLASE_FUENTE.PLANO, documento: 'Planta general.pdf' }),
    h({ elemento: 'muro', atributo: 'ubicacion', valor: 'excluido', clase: CLASE_FUENTE.PLIEGO, documento: 'Pliego de especificaciones.pdf' }),
  ], { relaciones: rel })
  assert.equal(alc.hechos[0].valor, 'excluido')
  assert.equal(alc.conflictos.length, 0)
})

test('DOS FUENTES DE MÁXIMA AUTORIDAD QUE SE CONTRADICEN NO SE RESUELVEN: es peor, no mejor', () => {
  const docs = [doc('estructura.dwg'), doc('estructura-taller.dwg'), doc('Planta general.pdf')]
  const rel = relacionar(docs, { carpetaObra: RAIZ })
  const c = consolidar([
    h({ elemento: 'C1', atributo: 'cantidad_insertada', valor: 8, clase: CLASE_FUENTE.CAD, documento: 'estructura.dwg' }),
    h({ elemento: 'C1', atributo: 'cantidad_insertada', valor: 12, clase: CLASE_FUENTE.CAD, documento: 'estructura-taller.dwg' }),
    h({ elemento: 'C1', atributo: 'cantidad_insertada', valor: 8, clase: CLASE_FUENTE.PLANO, documento: 'Planta general.pdf' }),
  ], { relaciones: rel })
  assert.equal(c.conflictos.length, 1, 'los dos CAD discrepan entre sí: desplazar al plano no resuelve nada')
  assert.equal(c.hechos[0].valor, null)
})

test('ARCOR · DOS OBRAS DEL MISMO CLIENTE NO SE CONTRADICEN — y sin ámbito sí lo hacían', () => {
  const docs = [
    doc('planilla.xls', `${RAIZ}RESTAURACION VESTUARIO HOMBRES/planilla.xls`),
    doc('planilla.xls', `${RAIZ}FILTRO SANITARIO/planilla.xls`),
  ]
  const rel = relacionar(docs, { carpetaObra: RAIZ })
  assert.equal(rel.ambitos.length, 2)
  const hechos = [
    h({ elemento: 'contrapiso', atributo: 'espesor_m', valor: 0.1, clase: CLASE_FUENTE.PLANILLA, documento: 'planilla.xls', lamina: 'HOMBRES' }),
    h({ elemento: 'contrapiso', atributo: 'espesor_m', valor: 0.15, clase: CLASE_FUENTE.PLANILLA, documento: 'planilla.xls', lamina: 'FILTRO' }),
  ]
  // MUTACIÓN CORRIDA: sin relaciones, esto es un conflicto falso. Es el defecto que el ámbito cierra.
  assert.equal(consolidar(hechos).conflictos.length, 1)
  // Con dos documentos homónimos en ámbitos distintos el grafo no puede separarlos por nombre: la
  // llave es el nombre y el nombre se repite. Se dice, no se disimula.
  assert.equal(rel.porNombre.size, 1, 'dos archivos con el mismo nombre colapsan en la llave: límite declarado')
})

test('ARCOR · ámbitos distintos con nombres distintos: dos hechos, cero conflictos', () => {
  const docs = [
    doc('ARSJ Planilla vestuario hombres.xls', `${RAIZ}RESTAURACION VESTUARIO HOMBRES/ARSJ Planilla vestuario hombres.xls`),
    doc('ARSJ Planilla filtro sanitario.xls', `${RAIZ}FILTRO SANITARIO/ARSJ Planilla filtro sanitario.xls`),
  ]
  const rel = relacionar(docs, { carpetaObra: RAIZ })
  const hechos = [
    h({ elemento: 'contrapiso', atributo: 'espesor_m', valor: 0.1, clase: CLASE_FUENTE.PLANILLA, documento: 'ARSJ Planilla vestuario hombres.xls' }),
    h({ elemento: 'contrapiso', atributo: 'espesor_m', valor: 0.15, clase: CLASE_FUENTE.PLANILLA, documento: 'ARSJ Planilla filtro sanitario.xls' }),
  ]
  assert.equal(consolidar(hechos).conflictos.length, 1, 'sin ámbito: conflicto falso')
  const c = consolidar(hechos, { relaciones: rel })
  assert.equal(c.conflictos.length, 0, 'con ámbito: dos obras distintas')
  assert.equal(c.hechos.length, 2)
  assert.deepEqual(c.hechos.map((x) => x.ambito).sort(), ['FILTRO SANITARIO', 'RESTAURACION VESTUARIO HOMBRES'])
})

test('el ESPEJO DE FORMATO no es una versión superada: la planilla es la fuente y el PDF la foto', () => {
  const rel = relacionar([doc('Cotizacion Final.xlsm'), doc('Cotizacion Final.pdf')], { carpetaObra: RAIZ })
  assert.equal(rel.superado.size, 0)
  assert.equal(rel.relaciones.ESPEJO_FORMATO, 1)
})

test('mandaSobre devuelve null cuando NO decide, que es un resultado y no una falla', () => {
  const rel = relacionar([doc('a.pdf'), doc('b.pdf')], { carpetaObra: RAIZ })
  const a = { clase: 'PLANO', documento: 'a.pdf' }
  const b = { clase: 'PLANO', documento: 'b.pdf' }
  assert.equal(mandaSobre(a, b, { dominio: DOMINIO.GEOMETRIA, relaciones: rel }), null)
  assert.equal(mandaSobre(a, { clase: 'CAD', documento: 'b.pdf' }, { dominio: DOMINIO.GEOMETRIA, relaciones: rel }).gana.clase, 'CAD')
})

test('DOS CORRIDAS DEL GRAFO dan exactamente lo mismo — es un modelo, no una heurística', () => {
  const docs = [doc('Cocheras REV F.pdf'), doc('Cocheras Rev D.pdf'), doc('Pliego.pdf'), doc('x.xls', `${RAIZ}CISTERNA/x.xls`)]
  const a = relacionar(docs, { carpetaObra: RAIZ })
  const b = relacionar([...docs].reverse(), { carpetaObra: RAIZ })
  assert.deepEqual(a.fichas.map((f) => f.nombre), b.fichas.map((f) => f.nombre))
  assert.deepEqual([...a.superado.keys()], [...b.superado.keys()])
  assert.deepEqual(a.relaciones, b.relaciones)
})

test('ARCOR · DOS ARCHIVOS HOMÓNIMOS EN CARPETAS DISTINTAS NO SON DOS VERSIONES', () => {
  // Medido en la corrida real: «bazaN.pdf» y «bazan.pdf» viven en dos carpetas y el modelo los
  // declaraba uno superado por el otro. Ninguno declara revisión: son dos documentos.
  const rel = relacionar([
    { name: 'bazaN.pdf', path: `${RAIZ}ARCOR/2025-02/bazaN.pdf` },
    { name: 'bazan.pdf', path: `${RAIZ}ARCOR/2025-03/bazan.pdf` },
  ], { carpetaObra: RAIZ })
  assert.equal(rel.superado.size, 0)
  assert.equal(rel.familias.length, 2)
})

test('MUTACIÓN · en la MISMA carpeta, el duplicado «(1)» de Drive SÍ es la misma familia', () => {
  const rel = relacionar([
    { name: '2025-02 F.931.pdf', path: `${RAIZ}ARCOR/2025-02 F.931.pdf`, modified_time: '2025-03-01' },
    { name: '2025-02 F.931 (1).pdf', path: `${RAIZ}ARCOR/2025-02 F.931 (1).pdf`, modified_time: '2025-03-09' },
  ], { carpetaObra: RAIZ })
  assert.equal(rel.familias.length, 1, 'el control puede decir «es la misma»: no quedó constante en 2')
  assert.equal(rel.superado.size, 1)
})
