import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  FUENTE, FALTA, marcasDeGrid, mapaDeRotulos, partesDeCelda, emparejarPersona, indicePersonas, resolutorDeObra,
  asignacionVigente, planDeRegistros, separarConflictos, resumir, columnasParaUpsert, SQL_UPSERT,
} from './jornales-a-registros-hh.mjs'
import { isoASerial } from './jornales-fixture.mjs'

// ── una grilla mínima con la forma REAL de «Obreros 26»: rótulos en la fila 1, bloque con fechas
//    seriales en F.., CLIENTE en AC (28) y OBRA en AD (29) ─────────────────────────────────────────
const txt = (v) => ({ valor: v, numero: null, formula: null })
const num = (n) => ({ valor: String(n), numero: n, formula: null })
const fx = (f, n) => ({ valor: String(n), numero: n, formula: f })
const fecha = (iso) => ({ valor: `${Number(iso.slice(8, 10))}/${Number(iso.slice(5, 7))}`, numero: isoASerial(iso), formula: null })
const vacio = () => ({ valor: null, numero: null, formula: null })
function fila(cols) { const r = Array.from({ length: 31 }, vacio); for (const [i, c] of Object.entries(cols)) r[Number(i)] = c; return r }
const DIAS = ['2026-05-04', '2026-05-05', '2026-05-06', '2026-05-07']
const fechas = () => Object.fromEntries(DIAS.map((d, i) => [5 + i, fecha(d)]))
const persona = (nombre, celdas, cliente, obra) => fila({ 0: num(1), 1: txt(nombre), 28: txt(cliente), 29: txt(obra), ...Object.fromEntries(celdas.map((c, i) => [5 + i, c])) })

function grid(extra = []) {
  return {
    offset: { fila: 0, col: 0 },
    filas: [
      fila({ 1: txt('OBRERO'), 28: txt('CLIENTE'), 29: txt('OBRA') }),
      fila({}),
      fila({ 1: txt('x'), ...fechas() }),
      persona('Aguero Cristian', [num(9), num(9), num(0), fx('=4+3*1,5', 8.5)], 'JAVIER SANCHEZ', 'Mamposteria'),
      persona('Eduardo Ochoa', [num(9), vacio(), num(9), num(8)], 'LA ESTRELLA', 'GALPON 9'),
      persona('Pablo Ramos', [num(9), num(9), num(9), num(9)], 'LA ESTRELLA', 'GALPON 9'),
      persona('Quiroga Sebastian', [num(9), num(9), num(9), num(9)], 'GAMA', 'GAMA'),
      ...extra,
      fila({ 5: fx('=SUM(F4:F7)', 36), 6: fx('=SUM(G4:G7)', 27), 7: fx('=SUM(H4:H7)', 27), 8: fx('=SUM(I4:I7)', 34) }),
    ],
  }
}

const PERSONAS = [
  { id: 'p-aguero', nombre_completo: 'AGUERO CRISTIAN DOMINGO', en_la_empresa: true, es_prueba: false },
  { id: 'p-ochoa', nombre_completo: 'OCHOA EDUARDO ARIEL', en_la_empresa: true, es_prueba: false },
  { id: 'p-ochoa-n', nombre_completo: 'OCHOA NICOLAS', en_la_empresa: false, es_prueba: false },
  { id: 'p-qsa', nombre_completo: 'QUIROGA SEBASTIAN ADOLFO', en_la_empresa: true, es_prueba: false },
  { id: 'p-qas', nombre_completo: 'QUIROGA ALEXANDER SEBASTIAN', en_la_empresa: true, es_prueba: false },
  { id: 'p-maldo', nombre_completo: 'MALDONADO BATISTA EMILIANO MIGUEL', en_la_empresa: true, es_prueba: false },
  { id: 'p-gonz-j', nombre_completo: 'GONZALEZ TOBARES JUAN GUILLERMO', en_la_empresa: true, es_prueba: false },
  { id: 'p-gonz-c', nombre_completo: 'GONZALEZ CARLOS SAMUEL', en_la_empresa: true, es_prueba: false },
  { id: 'p-e2e', nombre_completo: 'Pablo Ramos', en_la_empresa: false, es_prueba: true },
]
const CANONICAS = [
  { id: 'san-francisco', nombre: 'Galpones, Mampostería, Cancha de Padel', cliente_texto: 'San Francisco' },
  { id: 'sf-mamposteria', nombre: 'MAMPOSTERÍA', cliente_texto: 'San Francisco' },
  { id: 'la-estrella', nombre: 'La Estrella', cliente_texto: 'La Estrella' },
  { id: 'le-galpon-9', nombre: 'Galpón 9', cliente_texto: 'La Estrella' },
  { id: 'quattropani', nombre: 'SALÓN COMERCIAL', cliente_texto: 'Quattropani - Melisa García SAS' },
]
const ALIAS = new Map([['javier sanchez', 'san-francisco'], ['estrella', 'la-estrella'], ['la estrella', 'la-estrella'], ['quattropani', 'quattropani']])
const CLIENTE_ALIAS = new Map([['javier sanchez', 'SAN FRANCISCO']])
const resolver = resolutorDeObra({ alias: ALIAS, canonicas: CANONICAS, clienteAlias: CLIENTE_ALIAS })

test('marcasDeGrid: una marca por celda ESCRITA; la vacía no existe; el bloque con fecha repetida se descarta', () => {
  const { marcas, hallazgos } = marcasDeGrid(grid(), { pestana: 'Obreros 26', anio: 2026 })
  assert.equal(hallazgos.length, 0)
  assert.equal(marcas.length, 4 + 3 + 4 + 4)
  const ochoa = marcas.filter((m) => m.nombre === 'Eduardo Ochoa').map((m) => m.fecha)
  assert.deepEqual(ochoa, ['2026-05-04', '2026-05-06', '2026-05-07'])
  const roto = { offset: { fila: 0, col: 0 }, filas: [fila({ 1: txt('OBRERO') }), fila({ 5: fecha('2025-07-21'), 6: fecha('2025-07-21'), 7: fecha('2025-07-21') }), persona('Juan Bazan', [num(45000), num(3), num(2)], '', '')] }
  const r = marcasDeGrid(roto, { pestana: 'JORNALES 25', anio: 2025 })
  assert.equal(r.marcas.length, 0)
  assert.equal(r.hallazgos[0].tipo, FALTA.BLOQUE_DESCARTADO)
})

test('partesDeCelda: 0 es ausencia con la jornada de la obra; n es normal; las fórmulas separan extras', () => {
  assert.deepEqual(partesDeCelda({ escrita: true, valor_crudo: '0', horas: 0 }, { jornada: 8.8 }), [{ tipo_hora: 'ausencia', horas: 8.8, detalle: null }])
  assert.deepEqual(partesDeCelda({ escrita: true, valor_crudo: '9', horas: 9 }), [{ tipo_hora: 'normal', horas: 9, detalle: null }])
  const coef = partesDeCelda({ escrita: true, formula: '=4+3*1,5', valor_crudo: '8,5' })
  assert.deepEqual(coef.map((p) => [p.tipo_hora, p.horas]), [['normal', 4], ['extra_50', 3]])
  const cien = partesDeCelda({ escrita: true, formula: '=8+2*2', valor_crudo: '12' })
  assert.deepEqual(cien.map((p) => [p.tipo_hora, p.horas]), [['normal', 8], ['extra_100', 2]])
  const raro = partesDeCelda({ escrita: true, formula: '=9+4*1,3', valor_crudo: '14,2' })
  assert.equal(raro[1].tipo_hora, 'extra_50'); assert.equal(raro[1].horas, 4); assert.match(raro[1].detalle, /1\.3/)
  const suma = partesDeCelda({ escrita: true, formula: '=8+10', valor_crudo: '18' })
  assert.equal(suma[1].horas, 10); assert.match(suma[1].detalle, /recargo no declarado/)
  assert.equal(partesDeCelda({ escrita: true, valor_crudo: 'NO SE TOCA', horas: null, texto_no_numerico: true }), null)
  assert.equal(partesDeCelda({ escrita: true, valor_crudo: '45971', numero: 45971 }), null, 'una fecha leída como número no son horas')
  assert.deepEqual(partesDeCelda({ escrita: false, valor_crudo: null }), [])
  assert.deepEqual(partesDeCelda({ escrita: true, valor_crudo: '8', horas: 8 }, { licencia: true }), [{ tipo_hora: 'licencia', horas: 8, detalle: null }])
})

test('emparejarPersona: nombre y apellido dados vuelta, apodo por prefijo, homónimos parciales, prueba excluida', () => {
  const idx = indicePersonas(PERSONAS)
  assert.equal(emparejarPersona('Aguero Cristian', idx).persona.id, 'p-aguero')
  assert.equal(emparejarPersona('Eduardo Ochoa', idx).persona.id, 'p-ochoa')
  assert.equal(emparejarPersona('Ochoa Eduardo', idx).persona.id, 'p-ochoa')
  assert.equal(emparejarPersona('Emi Maldonado', idx).persona.id, 'p-maldo')
  assert.equal(emparejarPersona('Quiroga Sebastian', idx).persona.id, 'p-qsa', 'gana la que tiene apellido y primer nombre')
  assert.equal(emparejarPersona('Quiroga Alexander', idx).persona.id, 'p-qas')
  assert.equal(emparejarPersona('Gonzalez Juan', idx).persona.id, 'p-gonz-j')
  assert.equal(emparejarPersona('Pablo Ramos', idx).estado, FALTA.PERSONA_NO_ENCONTRADA, 'la persona de prueba no cuenta')
  assert.equal(emparejarPersona('Ochoa', idx).estado, FALTA.PERSONA_AMBIGUA)
  const idx2 = indicePersonas([{ id: 'z', nombre_completo: 'ZOGBE RAMOS WALTER LEONARDO' }, { id: 'g', nombre_completo: 'GONZALES ABEL VALENTIN' }, { id: 'g2', nombre_completo: 'GONZALEZ CARLOS SAMUEL' }])
  assert.equal(emparejarPersona('Zogber Leonardo', idx2).persona.id, 'z', 'la planilla escribe Zogber; el legajo, Zogbe')
  assert.equal(emparejarPersona('Gonzalez Valentin', idx2).persona.id, 'g', 's y z son la misma letra en un apellido')
  assert.equal(emparejarPersona('Gonzalez', idx2).estado, FALTA.PERSONA_AMBIGUA)
  assert.equal(emparejarPersona('Leonardo Sanchez 2', indicePersonas([{ id: 'x', nombre_completo: 'SANCHEZ ACOSTA LEONARDO G' }])).persona.id, 'x')
})

test('resolutorDeObra: alias > nombre canónico del MISMO cliente > alias del cliente > asignación > último bloque > nada', () => {
  assert.deepEqual(resolver({ cliente: 'JAVIER SANCHEZ', obra: 'JAVIER SANCHEZ' }), { obra_id: 'san-francisco', origen: 'obra_por_alias_cliente' })
  assert.deepEqual(resolver({ cliente: 'JAVIER SANCHEZ', obra: 'Mamposteria' }), { obra_id: 'sf-mamposteria', origen: 'obra_por_nombre' })
  assert.deepEqual(resolver({ cliente: 'LA ESTRELLA', obra: 'MAMPOSTERIA' }), { obra_id: 'la-estrella', origen: 'obra_por_alias_cliente' }, 'la MAMPOSTERÍA canónica es de San Francisco: no se cruza de cliente')
  assert.deepEqual(resolver({ cliente: 'LA ESTRELLA', obra: 'GALPON 9' }), { obra_id: 'le-galpon-9', origen: 'obra_por_nombre' })
  assert.deepEqual(resolver({ cliente: 'QUATTROPANI', obra: 'SALON COMERCIAL' }), { obra_id: 'quattropani', origen: 'obra_por_nombre' })
  assert.deepEqual(resolver({ cliente: 'LA ESTRELLA', obra: 'OFICINAS Y FABRICA' }, { asignacion: 'pisos-industriales' }), { obra_id: 'la-estrella', origen: 'obra_por_alias_cliente' }, 'el cliente por nombre canónico gana a la asignación')
  assert.deepEqual(resolver({ cliente: 'GAMA', obra: 'GAMA' }, { asignacion: 'arcor', ultima: 'la-estrella' }), { obra_id: null, origen: null }, 'un rótulo que no se reconoce NO se reemplaza por la asignación')
  assert.deepEqual(resolver({ cliente: '', obra: '' }, { asignacion: 'arcor', ultima: 'la-estrella' }), { obra_id: 'arcor', origen: 'obra_por_asignacion' })
  assert.deepEqual(resolver({ cliente: '', obra: '' }, { ultima: 'la-estrella' }), { obra_id: 'la-estrella', origen: 'obra_por_ultimo_bloque' })
  assert.deepEqual(resolver({ cliente: '', obra: '' }), { obra_id: null, origen: null })
})

test('asignacionVigente: fechas abiertas valen; dos obras a la vez no deciden', () => {
  const a = [{ persona_id: 'p', obra_id: 'x', desde: null, hasta: null }]
  assert.equal(asignacionVigente(a, 'p', '2026-05-04'), 'x')
  assert.equal(asignacionVigente([{ persona_id: 'p', obra_id: 'x', desde: '2026-06-01', hasta: null }], 'p', '2026-05-04'), null)
  assert.equal(asignacionVigente([...a, { persona_id: 'p', obra_id: 'y', desde: null, hasta: null }], 'p', '2026-05-04'), null)
})

test('planDeRegistros: filas por persona × día × obra × tipo; lo que no se traduce sale nombrado, no inventado', () => {
  const enfermo = persona('Aguero Cristian', [vacio(), vacio(), vacio(), num(8)], 'z. ENFERMEDAD', 'z. ENFERMEDAD')
  const { marcas } = marcasDeGrid(grid([enfermo]), { pestana: 'Obreros 26', anio: 2026 })
  const { filas, falta } = planDeRegistros(marcas, { personas: PERSONAS, resolver, jornadaPorObra: new Map([['sf-mamposteria', 9]]) })
  const aguero = filas.filter((f) => f.persona_id === 'p-aguero').sort((a, b) => a.fecha.localeCompare(b.fecha) || a.tipo_hora.localeCompare(b.tipo_hora))
  assert.deepEqual(aguero.map((f) => [f.fecha, f.tipo_hora, f.horas, f.obra_canonica_id]), [
    ['2026-05-04', 'normal', 9, 'sf-mamposteria'], ['2026-05-05', 'normal', 9, 'sf-mamposteria'],
    ['2026-05-06', 'ausencia', 9, 'sf-mamposteria'],
    ['2026-05-07', 'extra_50', 3, 'sf-mamposteria'], ['2026-05-07', 'licencia', 8, 'sf-mamposteria'], ['2026-05-07', 'normal', 4, 'sf-mamposteria'],
  ])
  const lic = aguero.find((f) => f.tipo_hora === 'licencia')
  assert.equal(lic.notas, 'enfermedad', 'la web etiqueta el motivo por la clave del catálogo')
  assert.equal(lic.origen_obra, 'obra_por_ultimo_bloque')
  assert.equal(aguero.find((f) => f.tipo_hora === 'ausencia').notas, null)
  assert.match(aguero[0].notas, /^JORNALES Obreros 26 f4 · JAVIER SANCHEZ · Mamposteria$/)
  assert.match(aguero.find((f) => f.tipo_hora === 'extra_50').notas, /=4\+3\*1,5/)
  assert.ok(filas.every((f) => f.fuente_legacy === FUENTE && f.horas > 0))
  assert.deepEqual(falta.personas.map((p) => [p.nombre, p.n_dias, p.horas]), [['Pablo Ramos', 4, 36]])
  assert.deepEqual(falta.obras.map((o) => [o.cliente, o.obra, o.horas, o.personas]), [['GAMA', 'GAMA', 36, ['QUIROGA SEBASTIAN ADOLFO']]])
  assert.equal(filas.filter((f) => f.persona_id === 'p-ochoa').length, 3, 'la celda vacía no genera fila')
  const mapa = mapaDeRotulos(filas)
  assert.deepEqual(mapa.find((r) => r.rotulo === 'LA ESTRELLA · GALPON 9'), { rotulo: 'LA ESTRELLA · GALPON 9', obra_id: 'le-galpon-9', origen: 'obra_por_nombre', filas: 3, horas: 26 })
})

test('separarConflictos: otra fuente no se toca; lo propio se MUEVE de obra si el rótulo ahora resuelve distinto; lo demás queda obsoleto, nunca borrado', () => {
  const filas = [
    { persona_id: 'p', fecha: '2026-05-04', obra_canonica_id: 'x', tipo_hora: 'normal', horas: 9 },
    { persona_id: 'p', fecha: '2026-05-05', obra_canonica_id: 'x', tipo_hora: 'normal', horas: 9 },
    { persona_id: 'p', fecha: '2026-05-07', obra_canonica_id: 'sub', tipo_hora: 'normal', horas: 8, notas: 'n2' },
  ]
  const existentes = [
    { id: 'a', persona_id: 'p', fecha: new Date('2026-05-04T03:00:00Z'), obra_canonica_id: 'x', tipo_hora: 'normal', fuente_legacy: 'web:asistencia-obra' },
    { id: 'b', persona_id: 'p', fecha: '2026-05-05', obra_canonica_id: 'x', tipo_hora: 'normal', fuente_legacy: FUENTE },
    { id: 'c', persona_id: 'p', fecha: '2026-05-06', obra_canonica_id: 'x', tipo_hora: 'normal', fuente_legacy: FUENTE },
    { id: 'd', persona_id: 'p', fecha: '2026-05-07', obra_canonica_id: 'madre', tipo_hora: 'normal', fuente_legacy: FUENTE },
  ]
  const r = separarConflictos(filas, existentes)
  assert.deepEqual(r.escribir.map((f) => f.fecha), ['2026-05-05'])
  assert.equal(r.conflictos.length, 1); assert.equal(r.conflictos[0].existentes[0].fuente_legacy, 'web:asistencia-obra')
  assert.deepEqual(r.obsoletas, ['p|2026-05-06|x|normal'], 'sin destino: queda, no se borra')
  assert.deepEqual(r.mover.map((m) => [m.id, m.desde, m.fila.obra_canonica_id]), [['d', 'madre', 'sub']], 'la misma persona-día-tipo cambió de obra: se mueve la fila existente')
})

test('resumir y columnasParaUpsert: las horas trabajadas no incluyen ausencias; el SQL no borra', () => {
  const filas = [
    { persona_id: 'a', fecha: '2026-05-04', obra_canonica_id: 'x', tipo_hora: 'normal', horas: 9, notas: 'n' },
    { persona_id: 'a', fecha: '2026-05-05', obra_canonica_id: 'x', tipo_hora: 'ausencia', horas: 8.8, notas: null },
    { persona_id: 'b', fecha: '2026-06-01', obra_canonica_id: 'y', tipo_hora: 'extra_50', horas: 2, notas: 'e' },
  ]
  const r = resumir(filas)
  assert.equal(r.personas, 2)
  assert.deepEqual(r.por_mes.map((m) => [m.clave, m.filas, m.horas, m.ausencias]), [['2026-05', 2, 9, 1], ['2026-06', 1, 2, 0]])
  assert.deepEqual(r.por_obra.map((o) => [o.clave, o.horas]), [['x', 9], ['y', 2]])
  const cols = columnasParaUpsert(filas)
  assert.equal(cols.length, 6); assert.deepEqual(cols[3], [9, 8.8, 2]); assert.deepEqual(cols[5], ['n', null, 'e'])
  assert.match(SQL_UPSERT, /on conflict/); assert.match(SQL_UPSERT, /fuente_legacy = 'sheet:jornales'/)
  assert.doesNotMatch(SQL_UPSERT, /delete/i)
})
