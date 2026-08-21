// LOS NOMBRES DE ESTAS PRUEBAS SON NOMBRES REALES DEL DATA ROOM, no inventados: salieron de
// `drive_index` el 21/08/2026. Si alguna se pone roja, el asistente volvió a contestar de más
// sobre un archivo que no puede leer, o a colgarle un tipo a un archivo que no lo declara.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  TIPO_DOC, SENAL, LECTURA, EXIGIDOS_POR_OBRA,
  legibilidadDe, clasificarDocumento, revisionDe, rutaDeclaraSuperado,
  agruparRevisiones, citarDocumento, coberturaDocumental,
} from './documentacion-obra.mjs'

const SF = 'administracion/PRESUPUESTOS - CLIENTES/JAVIER SANCHEZ'

test('el DWG existe y NO se lee: la limitación viaja con el archivo', () => {
  const l = legibilidadDe({ name: 'ARQUITECTURA GALPONES SAN FRANCISCO DEL MONTE.dwg' })
  assert.equal(l.puede, false)
  assert.equal(l.forma, LECTURA.noLegible)
  assert.match(l.motivo, /CAD/)
  // el .bak de respaldo del CAD tampoco
  assert.equal(legibilidadDe({ name: 'estructura galpon Ante 2 (1).bak' }).puede, false)
})

test('la extensión final manda sobre el mime: ".pDF" en mayúscula y ".xls.pdf" son PDF', () => {
  assert.equal(legibilidadDe({ name: 'ARSJ LEGAJO DE PLANOS - Piso de Ecopatio (1).pDF' }).forma, LECTURA.texto)
  assert.equal(
    legibilidadDe({ name: 'ARSJ Planilla de Cotizacion - Nivelacion de cocheras Rev B.xls.pdf', mime_type: 'application/vnd.ms-excel' }).forma,
    LECTURA.texto,
  )
})

test('una imagen se ve pero no se lee, y lo dice', () => {
  const l = legibilidadDe({ name: 'DIAGRAMA DE GANTT 1.png' })
  assert.equal(l.puede, false)
  assert.equal(l.forma, LECTURA.imagen)
})

test('las planillas de cómputo sí se leen (xlsx, xlsm, xls)', () => {
  for (const n of ['COMPUTO.xlsx', 'PRESUPUESTO V.2.xlsm', 'ARSJ Planilla de Cotizacion - Nivelacion de cocheras Rev C.xls']) {
    assert.equal(legibilidadDe({ name: n }).forma, LECTURA.planilla, n)
  }
})

test('el nombre que declara qué es, gana: señal fuerte', () => {
  assert.deepEqual(
    { ...clasificarDocumento({ name: 'Plano estructuras E1.pdf', path: `${SF}/Plano estructuras E1.pdf` }) },
    { tipo: TIPO_DOC.planoEstructura, senal: SENAL.nombre, confianza: 'alta' },
  )
  assert.equal(clasificarDocumento({ name: 'Plano SANITARIO.pdf', path: `${SF}/Plano SANITARIO.pdf` }).tipo, TIPO_DOC.planoInstalacion)
  assert.equal(clasificarDocumento({ name: 'Plano de Arquitectura.pdf' }).tipo, TIPO_DOC.planoArquitectura)
  assert.equal(clasificarDocumento({ name: 'Memoria Descriptiva ECSAS - PUENTE DE PLAYA.docx' }).tipo, TIPO_DOC.memoria)
  assert.equal(clasificarDocumento({ name: 'COMPUTO.xlsx' }).tipo, TIPO_DOC.computo)
})

test('"Instalacion Electrica" a secas es una obra, no un plano — hace falta señal de gráfico', () => {
  // el nombre de la CARPETA de obra no puede convertir todo lo que cuelga en un plano
  assert.notEqual(clasificarDocumento({ name: 'Gastos -  Instalacion Electrica JS (1).pdf' }).tipo, TIPO_DOC.planoInstalacion)
  // pero el plano de esa carpeta sí lo es
  assert.equal(
    clasificarDocumento({ name: 'PLANO 1.pdf', path: `${SF}/Instalacion Electrica/PLANO 1.pdf` }).tipo,
    TIPO_DOC.planoGeneral,
  )
})

test('cuando el nombre no dice nada, la carpeta MÁS CERCANA decide — y baja la confianza', () => {
  const c = clasificarDocumento({
    name: 'Cerramiento Cancha de paddle y mamposteria frente.xlsm',
    path: `${SF}/ADICIONALES/Cerramiento Cancha de paddle y mamposteria frente.xlsm`,
  })
  assert.equal(c.tipo, TIPO_DOC.adicional)
  assert.equal(c.senal, SENAL.carpeta)
  assert.equal(c.confianza, 'media')
})

test('lo que no declara nada queda `desconocido` — inventarle un tipo es la alucinación', () => {
  const c = clasificarDocumento({ name: 'GALVARINI.pdf', path: 'administracion/PRESUPUESTOS - CLIENTES/GALVARINI.pdf' })
  assert.equal(c.tipo, TIPO_DOC.desconocido)
  assert.equal(c.senal, SENAL.ninguna)
})

test('"PRESUPUESTOS - CLIENTES" no convierte en presupuesto a todo el data room', () => {
  // si la cascada mirara el path entero, esto sería `presupuesto`
  const c = clasificarDocumento({ name: 'Recibo 10.pdf', path: `${SF}/CERTIFICADOS/Recibo 10.pdf` })
  assert.equal(c.tipo, TIPO_DOC.certificado)
})

test('la revisión se lee del nombre, y no declararla NO es revisión cero', () => {
  assert.deepEqual(revisionDe('ARSJ Nivelacion de cocheras - Legajo de Planos Rev C.pdf'), { etiqueta: 'Rev C', orden: 3 })
  assert.deepEqual(revisionDe('PRESUPUESTO v2 - JS.pdf'), { etiqueta: 'v2', orden: 2 })
  assert.equal(revisionDe('Plano estructuras E1.pdf'), null)
})

test('la carpeta "ARCHIVOS VIEJOS" declara superado, y le gana a la revisión más alta', () => {
  assert.equal(rutaDeclaraSuperado(`${SF}/Archivos viejos/PRESUPUESTO v2 - JS.pdf`), true)
  assert.equal(rutaDeclaraSuperado(`${SF}/PRESUPUESTO - JS.pdf`), false)
  const g = agruparRevisiones([
    { name: 'PRESUPUESTO v2 - JS.pdf', path: `${SF}/Archivos viejos/PRESUPUESTO v2 - JS.pdf`, drive_file_id: 'viejo', modified_time: '2025-01-01' },
    { name: 'PRESUPUESTO - JS.pdf', path: `${SF}/PRESUPUESTO - JS.pdf`, drive_file_id: 'vive', modified_time: '2024-01-01' },
  ])
  assert.equal(g.length, 1, 'las dos son la misma familia')
  assert.equal(g[0].vigente.drive_file_id, 'vive')
})

test('el caso real Nivelación de Cocheras: Rev C rige sobre Rev B aunque la fecha diga otra cosa', () => {
  const g = agruparRevisiones([
    { name: 'ARSJ Nivelacion de cocheras - Legajo de Planos Rev B.pdf', drive_file_id: 'B', modified_time: '2025-04-17T03:00:00Z', path: 'x/y.pdf' },
    { name: 'ARSJ Nivelacion de cocheras - Legajo de Planos Rev C.pdf', drive_file_id: 'C', modified_time: '2025-04-29T03:00:00Z', path: 'x/z.pdf' },
  ])
  assert.equal(g.length, 1)
  assert.equal(g[0].vigente.drive_file_id, 'C')
  assert.equal(g[0].superadas.length, 1)
  assert.match(g[0].criterio, /revisión declarada/)
})

test('la fecha de Drive NO desempata cuando hay revisión declarada (un guardado no es una revisión)', () => {
  // caso real: una "Rev C 29:5:2025" con modified_time del 20/08/2025 (alguien la abrió y guardó)
  const g = agruparRevisiones([
    { name: 'ARSJ Planilla de Cotizacion - Nivelacion de cocheras Rev C 29:5:2025.xls', drive_file_id: 'C', modified_time: '2025-08-20T03:00:00Z', path: 'x/a.xls' },
    { name: 'ARSJ Planilla de Cotizacion - Nivelacion de cocheras Rev B.xls', drive_file_id: 'B', modified_time: '2025-04-23T03:00:00Z', path: 'x/b.xls' },
  ])
  assert.equal(g[0].vigente.drive_file_id, 'C')
})

test('dos archivos con la MISMA revisión no se desempatan a ojo: se declara ambigua', () => {
  const g = agruparRevisiones([
    { name: 'Legajo de Planos Muro Rev E.pdf', drive_file_id: 'uno', modified_time: '2024-09-13T03:00:00Z', path: 'x/1.pdf' },
    { name: 'Legajo de Planos Muro Rev E (1).pdf', drive_file_id: 'dos', modified_time: '2024-09-20T03:00:00Z', path: 'x/2.pdf' },
  ])
  assert.equal(g.length, 1)
  assert.match(g[0].ambigua, /declaran Rev E/)
})

test('sin origen en Drive no hay cita: falla cerrado', () => {
  const c = citarDocumento({ name: 'Plano estructuras E1.pdf', path: `${SF}/Plano estructuras E1.pdf` })
  assert.equal(c.ok, false)
  assert.match(c.motivo, /no se puede volver a abrir/)
})

test('la cita lleva documento, página y origen', () => {
  const c = citarDocumento(
    { name: 'Plano estructuras E1.pdf', path: `${SF}/Plano estructuras E1.pdf`, drive_file_id: 'abc123', modified_time: '2025-01-02' },
    { pagina: 3 },
  )
  assert.equal(c.ok, true)
  assert.match(c.texto, /Plano estructuras E1\.pdf/)
  assert.match(c.texto, /p\. 3/)
  assert.match(c.texto, /Drive abc123/)
  assert.equal(c.origen, 'https://drive.google.com/file/d/abc123/view')
})

test('la cita de una planilla cita la HOJA, no la página', () => {
  const c = citarDocumento({ name: 'COMPUTO.xlsx', drive_file_id: 'x1' }, { hoja: 'Hormigón' })
  assert.match(c.texto, /hoja "Hormigón"/)
  assert.equal(c.pagina, null)
})

test('la cobertura dice qué falta, y no confunde "parece" con "está"', () => {
  const docs = [
    { name: 'Plano de Arquitectura.pdf', path: 'obra/PLANOS FINALES/Plano de Arquitectura.pdf', drive_file_id: '1' },
    { name: 'Plano de Estructura.pdf', path: 'obra/PLANOS FINALES/Plano de Estructura.pdf', drive_file_id: '2' },
    { name: 'COMPUTO.xlsx', path: 'obra/COMPUTO.xlsx', drive_file_id: '3' },
    { name: 'Galpon_2.dwg', path: 'obra/PLANOS FINALES/Galpon_2.dwg', drive_file_id: '4' },
  ]
  const c = coberturaDocumental(docs, { exigidos: EXIGIDOS_POR_OBRA })
  assert.deepEqual(c.faltantes, [TIPO_DOC.presupuesto, TIPO_DOC.contrato])
  assert.equal(c.presentes.length, 3)
  assert.equal(c.no_legibles.length, 1)
  assert.equal(c.no_legibles[0].name, 'Galpon_2.dwg')
})

test('un tipo que sólo aparece por carpeta NO cuenta como presente', () => {
  const c = coberturaDocumental(
    [{ name: 'ECHEGARAY C 2.pdf', path: 'obra/Presupuestos de Materiales/ECHEGARAY C 2.pdf', drive_file_id: '9' }],
    { exigidos: [TIPO_DOC.presupuesto] },
  )
  assert.deepEqual(c.faltantes, [])
  assert.equal(c.presentes.length, 0)
  assert.equal(c.solo_por_carpeta.length, 1)
})

test('un PDF y su planilla de origen NO son dos revisiones: son el mismo documento en dos formatos', () => {
  // caso real de Quattropani: el informe daba la PLANILLA como "superada" por su propia exportación
  const g = agruparRevisiones([
    { name: 'Cotizacion Final.pdf', path: 'obra/COTIZACION INTERNA/Cotizacion Final.pdf', drive_file_id: 'pdf', modified_time: '2026-05-27T03:00:00Z' },
    { name: 'Cotizacion Final.xlsm', path: 'obra/COTIZACION INTERNA/Cotizacion Final.xlsm', drive_file_id: 'xlsm', modified_time: '2026-08-07T03:00:00Z' },
  ])
  assert.equal(g.length, 1)
  assert.equal(g[0].superadas.length, 0, 'ninguna está superada')
  assert.equal(g[0].formatos.length, 1)
  assert.equal(g[0].formatos[0].drive_file_id, 'pdf')
})

test('mismo formato y misma familia SÍ es una versión superada', () => {
  const g = agruparRevisiones([
    { name: 'Cotizacion Final.pdf', path: 'obra/Cotizacion Final.pdf', drive_file_id: 'nuevo', modified_time: '2026-07-27T03:00:00Z' },
    { name: 'Cotizacion Final.pdf', path: 'obra/Archivos viejos/Cotizacion Final.pdf', drive_file_id: 'viejo', modified_time: '2026-07-15T03:00:00Z' },
  ])
  assert.equal(g.length, 1)
  assert.equal(g[0].vigente.drive_file_id, 'nuevo')
  assert.equal(g[0].superadas.length, 1, 'mismo nombre y mismo formato: es una versión, no otro formato')
  assert.equal(g[0].formatos.length, 0)
})

test('"Copia de X" es otra familia que "X": no se fusionan por parecido', () => {
  // el data room de Quattropani tiene las dos, en carpetas distintas, y no son la misma cosa
  const g = agruparRevisiones([
    { name: 'Cotizacion Final.pdf', path: 'obra/COTIZACION INTERNA/Cotizacion Final.pdf', drive_file_id: 'a', modified_time: '2026-05-27T03:00:00Z' },
    { name: 'Copia de Cotizacion Final.pdf', path: 'obra/Contrato de Obra/Copia de Cotizacion Final.pdf', drive_file_id: 'b', modified_time: '2026-07-15T03:00:00Z' },
  ])
  assert.equal(g.length, 2, 'parecerse no es ser la misma familia')
})
