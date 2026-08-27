// LOS DOS DEFECTOS QUE ESTE PARSER YA TUVO, Y LO QUE EL CIRCOT PUEDE Y NO PUEDE HACER.
//
// Las dos primeras pruebas no son hipotéticas: las dos fallas se produjeron sobre el PDF real de
// julio 2026 y se midieron. La primera dejó 38 de 171 filas sin leer; la segunda leyó las 171 y
// colgó 41 ítems de instalaciones del rubro VIDRIOS, que es peor porque no se queja.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { parsearManoDeObra, parsearRenglonItem, encabezadoDeRubro, importeAr, partirDescripcion } from './parser-mo.mjs'
import { buscar, contrastarManoDeObra, omisionesPotenciales, CONTRASTE, solapamiento } from './referencia.mjs'
import { cascadaCircot, evaluarChecklist, preguntasAgrupadas, ESTADO_CHECK, MODELO_III, CONFLICTO_CASCADA } from './modelo-galpon.mjs'

/** Un renglón como lo entrega la ingesta de PDF: fragmentos con su X. */
const fila = (...celdas) => ({
  texto: celdas.join(''),
  items: celdas.map((t, i) => ({ x: 50 + i * 100, y: 100, texto: t })),
})

test('DEFECTO 1: la unidad sin la etiqueta «Unid:» se lee igual — 38 filas del PDF real venían así', () => {
  const conEtiqueta = parsearRenglonItem(fila('Item:', 'pintura al agua en muros interiores', 'Unid: m2', '$ 2.477', '$ 4.972').items)
  const sinEtiqueta = parsearRenglonItem(fila('Item:', 'Acometida de energía; pilar y bajada', 'gl', '$ 173.435', '$ 348.071').items)
  assert.equal(conEtiqueta.ok, true)
  assert.equal(conEtiqueta.unidad, 'm2')
  assert.equal(sinEtiqueta.ok, true, 'sin etiqueta la unidad queda pegada a la descripción si se parsea por texto')
  assert.equal(sinEtiqueta.unidad, 'gl')
  assert.equal(sinEtiqueta.descripcion, 'Acometida de energía; pilar y bajada', 'la unidad NO puede quedar dentro de la descripción')
})

test('DEFECTO 2: los rubros SIN el prefijo «RUBRO:» también son rubros — si no, 41 ítems quedan en VIDRIOS', () => {
  const paginas = [[
    fila('RUBRO: VIDRIOS'),
    fila('Item:', 'vidrio float 4 mm', 'Unid: m2', '$ 1.000', '$ 2.000'),
    fila('INSTALACIONES ELÉCTRICAS'),
    fila('Item:', 'Boca de electricidad', 'u', '$ 3.000', '$ 6.000'),
  ]]
  const r = parsearManoDeObra(paginas, { periodo: '2026-07' })
  assert.equal(r.total, 2)
  assert.equal(r.items[0].rubro, 'VIDRIOS')
  assert.equal(r.items[1].rubro, 'INSTALACIONES ELÉCTRICAS', 'sin este reconocimiento el ítem hereda VIDRIOS y nada se rompe')
  assert.deepEqual(r.rubros, ['VIDRIOS', 'INSTALACIONES ELÉCTRICAS'])
})

test('el encabezado de página NO es un rubro: tiene el año', () => {
  assert.equal(encabezadoDeRubro(fila('CIRCOT - COSTOS ORIENTATIVOS MANO DE OBRA - JULIO 2026')), null)
  assert.equal(encabezadoDeRubro(fila('RUBROS / ITEMS')), null)
  assert.equal(encabezadoDeRubro(fila('EQUIPAMIENTO')), 'EQUIPAMIENTO')
})

test('un renglón que no se puede leer entero SALE DECLARADO, no descartado en silencio', () => {
  const r = parsearManoDeObra([[fila('Item:', 'algo raro sin unidad ni importes')]], { periodo: '2026-07' })
  assert.equal(r.total, 0)
  assert.equal(r.noLeidos.length, 1)
  assert.match(r.noLeidos[0].porQue, /importe/)
})

test('un importe mal formado devuelve null en vez de un número inventado', () => {
  assert.equal(importeAr('8.277'), 8277)
  assert.equal(importeAr('137.085'), 137085)
  assert.equal(importeAr('1.2.3'), null)
  assert.equal(importeAr('ocho mil'), null)
})

test('el calificativo que cambia qué incluye el precio se separa de la descripción', () => {
  assert.deepEqual(partirDescripcion('Hierro sobre encofrado. MO-'), { descripcion: 'Hierro sobre encofrado', observaciones: 'MO-' })
  assert.deepEqual(partirDescripcion('Replanteo'), { descripcion: 'Replanteo', observaciones: null })
})

test('EL DATASET IMPORTADO NO PIERDE FILAS: 171 ítems y 21 rubros del PDF de julio 2026', () => {
  const ruta = path.join(import.meta.dirname, '..', '..', 'datos', 'circot', 'mano-de-obra-2026-07.json')
  const d = JSON.parse(fs.readFileSync(ruta, 'utf8'))
  assert.equal(d.total, 171)
  assert.equal(d.rubros.length, 21)
  assert.equal(d.noLeidos.length, 0, 'si aparece un renglón no leído, el mes que viene se importó peor')
  assert.equal(d.items.filter((i) => i.rubro === 'VIDRIOS').length, 3, 'VIDRIOS tiene 3 ítems; 41 significaba que los rubros pelados no se detectaban')
  assert.ok(d.items.every((i) => i.clasificacion === 'REFERENCIA_EXTERNA_LOCAL'))
})

const REFERENCIA = {
  periodo: '2026-07',
  items: [
    { codigo: 'C-1', rubro: 'CERRAMIENTOS', descripcion: 'Mampost. Lad. Común 0,30 a revocar', unidad: 'm3', mo_min: 66915, mo_max: 134293, periodo: '2026-07' },
    { codigo: 'C-2', rubro: 'CERRAMIENTOS', descripcion: 'Mampost. Lad. Común 0,30 visto', unidad: 'm3', mo_min: 82207, mo_max: 164984, periodo: '2026-07' },
    { codigo: 'F-1', rubro: 'FUNDACIONES', descripcion: 'HºAº p/bases', unidad: 'm3', mo_min: 70207, mo_max: 140901, periodo: '2026-07' },
    { codigo: 'F-2', rubro: 'FUNDACIONES', descripcion: 'Hº de limpieza - e= 5 cm', unidad: 'm2', mo_min: 3082, mo_max: 6186, periodo: '2026-07' },
    { codigo: 'F-3', rubro: 'FUNDACIONES', descripcion: 'Encofrado p/superficie mojada', unidad: 'm2', mo_min: 13981, mo_max: 28059, periodo: '2026-07' },
  ],
}

test('LA TERMINACIÓN SEPARA: una mampostería «visto» no matchea contra la de «a revocar»', () => {
  const r = buscar({ nombre: 'Muro de ladrillo común 0,30 visto', unidad: 'm3' }, REFERENCIA)
  assert.ok(r.length >= 1)
  assert.equal(r[0].codigo, 'C-2')
  assert.ok(!r.some((x) => x.codigo === 'C-1'), 'C-1 dice «a revocar» y el elemento dice «visto»: es un conflicto, no un candidato peor')
  assert.ok(solapamiento('Mampost. Lad. Común 0,30 a revocar', 'Mampost. Lad. Común 0,30 visto') > 0.5, 'como TEXTO son casi la misma frase, que es justamente el problema')
})

test('una unidad distinta no se contrasta: comparar m³ contra un precio por m² es ruido', () => {
  const r = buscar({ nombre: 'Hormigón de limpieza', unidad: 'm3' }, REFERENCIA)
  assert.ok(!r.some((x) => x.unidad === 'm2'))
})

test('el contraste dice DÓNDE cae nuestra MO, y no corrige nada', () => {
  const dentro = contrastarManoDeObra({ nombre: 'Base de hormigón armado', unidad: 'm3', moUnitaria: 100000 }, REFERENCIA)
  assert.equal(dentro.estado, CONTRASTE.DENTRO)
  const alto = contrastarManoDeObra({ nombre: 'Base de hormigón armado', unidad: 'm3', moUnitaria: 300000 }, REFERENCIA)
  assert.equal(alto.estado, CONTRASTE.ALTO)
  assert.ok(alto.desvio > 0)
  assert.equal(alto.clasificacion, 'REFERENCIA_EXTERNA_LOCAL')
})

test('sin ítem comparable el contraste dice SIN_REFERENCIA en vez de forzar una banda', () => {
  const r = contrastarManoDeObra({ nombre: 'Cercha metálica reticulada', unidad: 'm', moUnitaria: 5000 }, REFERENCIA)
  assert.equal(r.estado, CONTRASTE.SIN_REFERENCIA)
})

test('LAS OMISIONES SÓLO SE PROPONEN, NUNCA SE INSERTAN — y sólo en rubros que el proyecto ya toca', () => {
  const partidas = [{ nombre: 'Base de hormigón armado', unidad: 'm3' }]
  const o = omisionesPotenciales(partidas, REFERENCIA)
  assert.ok(o.length >= 1)
  assert.ok(o.every((x) => x.estado === 'PENDIENTE_CONFIRMACION'), 'ninguna omisión entra confirmada')
  assert.ok(o.every((x) => x.rubro === 'FUNDACIONES'), 'el proyecto no toca CERRAMIENTOS: avisar de eso es ruido')
  assert.ok(o.some((x) => /Encofrado/.test(x.descripcion)), 'si hay bases de H°A° hay que preguntar por el encofrado')
})

test('LA CASCADA DEL CIRCOT REPRODUCE LOS TOTALES IMPRESOS de la página 3', () => {
  const r = cascadaCircot(227709122.22)
  assert.equal(r.costoEjecucionMaterial, 229672510.46)
  assert.equal(r.costoObra, 244018185.16)
  assert.equal(r.ingresoCalculado, 268420003.68)
  assert.equal(r.precioReferenciaCIRCOT, 330156604.52)
  assert.equal(Math.round((r.precioReferenciaCIRCOT / 543) * 100) / 100, 608023.21, 'precio por m² de la publicación')
})

test('la cascada VIAJA CON SU CONFLICTO SIN RESOLVER y no se hace pasar por precio de ECSAS', () => {
  const r = cascadaCircot(227709122.22)
  assert.equal(r.conflictos[0], CONFLICTO_CASCADA)
  assert.match(CONFLICTO_CASCADA.resolucion, /SIN RESOLVER/)
  assert.equal(r.precio, undefined, 'el campo se llama precioReferenciaCIRCOT y no precio: no es nuestro precio')
  assert.match(r.advertencia, /NO es la política de margen/)
})

test('las 25 incidencias del Modelo III suman 100 % del costo directo', () => {
  const suma = MODELO_III.reduce((a, x) => a + x.incidencia, 0)
  assert.ok(Math.abs(suma - 100) < 0.05, `suman ${suma}`)
})

test('EL CHECKLIST NO DECIDE SOLO: sin respuesta sobre el sanitario la línea queda FALTA_DATO', () => {
  const e = evaluarChecklist({ computadas: ['Replanteo general', 'Techo metálico de chapa'] })
  const sanitaria = e.find((x) => x.n === 24)
  assert.equal(sanitaria.estado, ESTADO_CHECK.FALTA_DATO, 'no está y NO se puede concluir que no corresponde')
  assert.ok(sanitaria.pregunta)
  assert.equal(e.find((x) => x.n === 1).estado, ESTADO_CHECK.CONFIRMADO, 'el replanteo sí está computado')
  assert.equal(e.find((x) => x.n === 6).estado, ESTADO_CHECK.APLICA, 'las bases aisladas van en todo galpón y no están: es una omisión')
})

test('una respuesta del proyecto cierra seis líneas de una vez, y queda escrita', () => {
  const e = evaluarChecklist({ computadas: [], respuestas: { sanitario: false } })
  const cerradas = e.filter((x) => x.estado === ESTADO_CHECK.NO_APLICA)
  assert.equal(cerradas.length, 6)
  assert.ok(cerradas.every((x) => /se respondió/.test(x.porQue)))
})

test('LAS PREGUNTAS SE AGRUPAN: primero las que destraban varias partidas, no 25 sueltas', () => {
  const e = evaluarChecklist({ computadas: [] })
  const p = preguntasAgrupadas(e)
  assert.ok(p.decisiones.length <= 3, 'sanitario, tanque y gas: tres decisiones')
  assert.equal(p.decisiones[0].dato, 'sanitario')
  assert.equal(p.decisiones[0].destraba.length, 6)
  assert.ok(p.total < 25, `${p.total} preguntas en vez de 25`)
})

test('DOS EVALUACIONES IDÉNTICAS del checklist dan exactamente lo mismo', () => {
  const a = evaluarChecklist({ computadas: ['Techo metálico'], respuestas: { sanitario: true } })
  const b = evaluarChecklist({ computadas: ['Techo metálico'], respuestas: { sanitario: true } })
  assert.deepEqual(a, b)
})
