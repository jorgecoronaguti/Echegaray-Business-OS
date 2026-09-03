// LOS TESTS DEL COSTO REAL POR OBRA. Cada uno prueba un DEFECTO concreto que ya existió o que la
// fuente puede producir mañana; ninguno acompaña al código.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  TIPO, GRANULARIDAD, EXCLUSION,
  tipoDeCompra, evaluarCompra, resolverObraDeJornal, filaDeJornal, cuadreDeCarga, filasDeJornales,
} from './costo-real-partida.mjs'
import { planilla, txt, num, frm, MAPA } from './jornales-fixture-por-obra.mjs'

// La normalización real la hace `public.norm_obra`. Acá se inyecta una equivalente para poder
// probar las REGLAS sin base: lo que se prueba es el orden de las reglas, no el normalizador.
const norm = (t) => String(t ?? '').toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, ' ').replace(/\b(la|el|los|las|de|del)\b/g, ' ')
  .replace(/\s+/g, ' ').trim()

const ALIAS = new Map([['estrella', 'la-estrella'], ['le galpon 9', 'le-galpon-9'], ['messina', 'messina']])

// ── EL TIPO SALE DE LA FAMILIA, Y LO DESCONOCIDO NO SE VUELVE MATERIAL ────────────────────────
test('una familia no mapeada es OTRO, nunca MATERIAL por descarte', () => {
  assert.equal(tipoDeCompra({ familiaMaterial: 'Hierro y malla' }), TIPO.MATERIAL)
  assert.equal(tipoDeCompra({ familiaMaterial: 'Alquiler y traslado de equipos' }), TIPO.EQUIPO)
  assert.equal(tipoDeCompra({ familiaMaterial: 'Subcontratos y mano de obra' }), TIPO.SUBCONTRATO)
  // 391 filas reales caen acá ($94,7 M). Si el default fuera MATERIAL, entrarían a la comparación
  // de precio comprado contra precio cotizado como si fueran materiales identificados.
  assert.equal(tipoDeCompra({ familiaMaterial: 'SIN CLASIFICAR' }), TIPO.OTRO)
  assert.equal(tipoDeCompra({}), TIPO.OTRO)
  assert.equal(tipoDeCompra({ familiaMaterial: 'Familia que todavía no existe' }), TIPO.OTRO)
})

// ── LO QUE NO ENTRA, NO ENTRA POR UN MOTIVO CON NOMBRE Y CON MONTO ────────────────────────────
const compra = (extra = {}) => ({
  fila: 60, obra_texto: 'LA ESTRELLA', proveedor: 'Alumetal', concepto: 'Perfiles C',
  familia_material: 'Chapa, perfiles y estructura metálica', importe: 100, iva: 21, total: 121,
  fecha: '2026-02-03T03:00:00.000Z', comprobante: '0038-00022124', anulada: false, ...extra,
})

test('el monto es el NETO y jamás el total con IVA', () => {
  const { fila } = evaluarCompra(compra(), { obraId: 'la-estrella' })
  assert.equal(fila.monto, 100)
  assert.equal(fila.fuente, 'compra_sheet')
  assert.equal(fila.fuenteId, '60')
  assert.equal(fila.granularidad, GRANULARIDAD.OBRA)
  assert.equal(fila.cotizacionPartidaId, null)
  // La fila llega de Postgres en snake_case. Sin esta línea, pasar `c` entero a tipoDeCompra dejaba
  // `familiaMaterial` en undefined y las 531 filas de la primera corrida real salieron OTRO.
  assert.equal(fila.tipo, TIPO.MATERIAL)
  assert.equal(fila.fecha, '2026-02-03')
  // La pestaña no discrimina cantidad por línea: un 1 de relleno convertiría el total del
  // comprobante en «precio unitario» y arruinaría la comparación contra el precio cotizado.
  assert.equal(fila.cantidad, null)
  assert.equal(fila.precioUnitario, null)
})

test('una fila con el neto en 0 no se carga: el total inflaría el costo hasta un 21%', () => {
  const r = evaluarCompra(compra({ importe: 0, total: 11423000 }), { obraId: 'la-estrella' })
  assert.equal(r.fila, undefined)
  assert.equal(r.excluida, EXCLUSION.SIN_NETO_DECLARADO)
  // NETO y BRUTO son magnitudes distintas y no se suman. El neto excluido es 0 —esa fila no declara
  // neto— y el bruto viaja aparte: sin él, 145 filas por $178,9 M se informarían como «$0» y
  // parecerían nada. Con él sumado al neto, el cuadre daba un residuo de $345 M que no existía.
  assert.equal(r.monto, 0)
  assert.equal(r.bruto, 11423000)
})

test('la fecha del driver es un Date, y un Date no se corta con slice(0,10)', () => {
  // Defecto real, encontrado en la primera corrida contra la base: el driver devuelve Date para las
  // columnas de fecha y `String(fecha).slice(0,10)` daba «Mon Jan 05», que Postgres rechaza. En los
  // tests no aparecía porque el fixture siempre traía la fecha como texto.
  const { fila } = evaluarCompra(compra({ fecha: new Date('2026-01-05T03:00:00.000Z') }), { obraId: 'la-estrella' })
  assert.equal(fila.fecha, '2026-01-05')
})

test('una nota de crédito entra con su signo negativo', () => {
  // Filtrar por `> 0` dejaría el costo inflado por el importe de las devoluciones: hay 8 filas así.
  const { fila } = evaluarCompra(compra({ importe: -250000 }), { obraId: 'la-estrella' })
  assert.equal(fila.monto, -250000)
})

test('la nómina cargada en Compras no entra: es la misma plata que JORNALES, a la mitad', () => {
  const r = evaluarCompra(compra({ proveedor: 'Sueldos', importe: 0, total: 6147450 }), { obraId: 'la-estrella' })
  assert.equal(r.excluida, EXCLUSION.NOMINA_EN_COMPRAS)
  assert.equal(r.monto, 0)
  assert.equal(r.bruto, 6147450)
})

test('sin obra canónica, o siendo un indirecto, la fila no se inventa una obra', () => {
  assert.equal(evaluarCompra(compra(), { obraId: null }).excluida, EXCLUSION.SIN_OBRA_CANONICA)
  assert.equal(evaluarCompra(compra(), { obraId: null, clasificacion: 'indirecto' }).excluida, EXCLUSION.NO_ES_OBRA)
  assert.equal(evaluarCompra(compra({ anulada: true }), { obraId: 'la-estrella' }).excluida, EXCLUSION.ANULADA)
})

// ── LA IMPUTACIÓN DE UN JORNAL: REGLAS ORDENADAS, NUNCA POR PARECIDO ──────────────────────────
test('el rótulo de OBRA gana al de CLIENTE cuando es un alias conocido', () => {
  const r = resolverObraDeJornal({ cliente: 'LA ESTRELLA', obra: 'LE Galpon 9' }, { alias: ALIAS, norm })
  assert.deepEqual([r.obraId, r.regla, r.frente], ['le-galpon-9', 'obra', null])
})

test('un frente que no es un alias NO se resuelve por parecido: queda declarado como frente', () => {
  // «GALPON 9» y «LE GALPON 9» difieren en dos letras y en una obra distinta. Elegir la más
  // parecida es el error que en Compras costó $1.831.905 en la obra equivocada.
  const r = resolverObraDeJornal({ cliente: 'LA ESTRELLA', obra: 'Galpon 9' }, { alias: ALIAS, norm })
  assert.deepEqual([r.obraId, r.regla, r.frente], ['la-estrella', 'cliente', 'Galpon 9'])
})

test('cuando nada coincide devuelve null, y no la obra más parecida', () => {
  const r = resolverObraDeJornal({ cliente: 'MESSINAS', obra: '' }, { alias: ALIAS, norm })
  assert.equal(r.obraId, null)
  assert.equal(r.regla, 'sin_alias')
})

test('un jornal se carga con sus horas y su valor hora, y avisa que es BRUTO', () => {
  const f = { ref: 'b499f501', persona: 'Quiroga Sebastian', rotuloCliente: 'LA ESTRELLA', horas: 80, valorHora: 5000, jornal: 400000 }
  const { fila } = filaDeJornal(f, { pestana: 'Obreros 26', hasta: '2026-01-15', obraId: 'la-estrella', regla: 'cliente', frente: 'Galpon 9' })
  assert.equal(fila.monto, 400000)
  assert.equal(fila.cantidad, 80)
  assert.equal(fila.precioUnitario, 5000)
  assert.equal(fila.unidad, 'HH')
  assert.equal(fila.tipo, TIPO.MANO_DE_OBRA)
  assert.equal(fila.fecha, '2026-01-15')
  // Identidad estructural: el nombre no identifica (hay homónimos y la persona cambia de fila).
  assert.equal(fila.fuenteId, 'Obreros 26|b499f501')
  assert.equal(fila.granularidad, GRANULARIDAD.FRENTE)
  assert.equal(fila.frenteTexto, 'Galpon 9')
  assert.match(fila.nota, /TOTAL SEMANA bruto \(banco \+ efectivo\), sin cargas sociales/)
})

test('el TOTAL SEMANA de la planilla le gana al producto recalculado', () => {
  // Y no es un empate ni «casi lo mismo»: en 2025 el producto no se puede derivar y el jornal sale
  // null, mientras la planilla tiene el número escrito.
  const f = { ref: 'b4f5', persona: 'Juan Bazan', rotuloCliente: 'ARCOR', horas: 44, valorHora: null, jornal: null }
  const { fila } = filaDeJornal(f, { pestana: 'JORNALES 25', hasta: '2025-01-10', obraId: 'arcor', regla: 'obra', frente: null, totalSemana: 132000, valorHora: 3300 })
  assert.equal(fila.monto, 132000)
  assert.equal(fila.precioUnitario, 3300)
  // cantidad × precioUnitario ≠ monto es un HECHO de la fuente, no un error: hay horas a otra tarifa.
  assert.notEqual(fila.cantidad * fila.precioUnitario, fila.monto)
})

test('una persona sin valor hora no se carga en 0: se declara sin valuar', () => {
  const f = { ref: 'b1f2', persona: 'X', rotuloCliente: 'LA ESTRELLA', horas: 40, valorHora: null, jornal: null }
  const r = filaDeJornal(f, { pestana: 'Obreros 26', hasta: '2026-01-15', obraId: 'la-estrella', regla: 'cliente', frente: null })
  assert.equal(r.excluida, EXCLUSION.SIN_VALUAR)
})

// ── EL CUADRE TIENE QUE PODER DECIR QUE NO ────────────────────────────────────────────────────
test('el cuadre da verde cuando todo peso está cargado o excluido con nombre', () => {
  const c = cuadreDeCarga({
    totalFuente: 1000,
    filas: [{ monto: 600 }, { monto: 100 }],
    excluidas: [{ excluida: EXCLUSION.SIN_NETO_DECLARADO, monto: 300 }],
  })
  assert.equal(c.cargado, 700)
  assert.equal(c.excluido, 300)
  assert.equal(c.cuadra, true)
})

test('el cuadre da ROJO si se pierde plata en el camino — la mutación que lo prueba', () => {
  // Se reintroduce el defecto: una exclusión que ocurre y NO se anota en ninguna lista.
  const c = cuadreDeCarga({ totalFuente: 1000, filas: [{ monto: 600 }], excluidas: [] })
  assert.equal(c.cuadra, false)
  assert.equal(c.residuo, 400)
})

// ── LOS DOS LAYOUTS DE JORNALES, LEÍDOS COMO SON ──────────────────────────────────────────────
// Ninguna coordenada se asume: en 2025 hay UN solo rótulo (col Q) y la plata cierra en P; en 2026
// hay CLIENTE (AC) y OBRA (AD) por separado y la plata cierra en AB. Si algún día se clavan las
// letras de una generación, la otra tiene que ponerse roja acá.
const COLS_2025 = { nombre: 'B', categoria: 'D', dia: 'F', horas: 'N', vh: 'O', total: 'P', cliente: 'Q', obra: null }
const COLS_2026 = { nombre: 'B', categoria: 'D', dia: 'F', horas: 'Z', vh: 'AA', total: 'AB', cliente: 'AC', obra: 'AD' }

test('layout 2025 calcado del archivo: el total no se puede recalcular y se lee de la planilla', () => {
  // La fórmula real es `=K5*L5+SUM(J5)*M5-N5` (la sexta columna de fecha va a otra tarifa) y `O` se
  // llama «TOTAL RECIBO», que es el neto de adelanto y está ANTES de «TOTAL SEMANA». Un `/^total/`
  // se quedaría con el recibo y cargaría de menos sin que nada lo delate. Éste es el defecto que la
  // primera corrida real destapó: 534 filas sin valuar y 72 bloques leyendo $0.
  const p = planilla()
  p.cruda({
    B: txt('OBRERO'), K: txt('DIAS / HORAS'), L: txt('$ HORA'), N: txt('ADELANTO'),
    O: txt('TOTAL RECIBO'), P: txt('TOTAL SEMANA'), Q: txt('OBRA'),
  })
  p.cruda({ A: txt('x'), B: txt('Obrero'), E: txt('6/1'), F: txt('7/1'), G: txt('8/1'), H: txt('9/1'), I: txt('10/1') })
  p.cruda({
    A: num(1), B: txt('Juan Bazan'), E: num(8), F: num(8), G: num(8), H: num(8), I: num(8),
    K: frm('=SUM(E3:J3)', 40), L: num(3300), N: num(10000),
    O: frm('=K3*L3+SUM(J3)*M3-N3', 122000), P: frm('=N3+O3', 132000), Q: txt('ARCOR'),
  })
  const r = filasDeJornales(p.grid('JORNALES 25'), { pestana: 'JORNALES 25', anio: 2025, mapa: MAPA, alias: new Map([['arcor', 'arcor']]), norm })
  assert.equal(r.filas.length, 1)
  assert.equal(r.filas[0].monto, 132000)
  assert.equal(r.filas[0].precioUnitario, 3300)
  assert.equal(r.filas[0].obraId, 'arcor')
  assert.equal(r.filas[0].fecha, '2025-01-10')
  // Un solo rótulo NO inventa un frente: cliente y obra son la misma columna.
  assert.equal(r.filas[0].granularidad, GRANULARIDAD.OBRA)
})

test('layout 2026 (CLIENTE en AC y OBRA en AD): el frente viaja declarado, no como partida', () => {
  const p = planilla()
  p.bloque(['5/1', '6/1', '7/1'], COLS_2026)
  p.persona({ nombre: 'Quiroga Sebastian', horas: [8, 8, 8], vh: 6000, cliente: 'LA ESTRELLA', obra: 'Mamposteria', cols: COLS_2026 })
  const r = filasDeJornales(p.grid('Obreros 26'), { pestana: 'Obreros 26', anio: 2026, mapa: MAPA, alias: ALIAS, norm })
  assert.equal(r.filas.length, 1)
  assert.equal(r.filas[0].obraId, 'la-estrella')
  assert.equal(r.filas[0].monto, 144000)
  assert.equal(r.filas[0].granularidad, GRANULARIDAD.FRENTE)
  assert.equal(r.filas[0].frenteTexto, 'Mamposteria')
  assert.equal(r.filas[0].cotizacionPartidaId, null)
})

test('el TOTAL MO de la planilla contrasta lo que se va a cargar, y puede no coincidir', () => {
  const p = planilla()
  p.bloque(['5/1', '6/1', '7/1'], COLS_2026)
  p.persona({ nombre: 'Quiroga Sebastian', horas: [8, 8, 8], vh: 6000, cliente: 'LA ESTRELLA', cols: COLS_2026 })
  p.cruda({ B: txt('TOTAL MO'), C: { formula: null, valor: '144000', numero: 144000, formato: null, derivada: false } })
  const ok = filasDeJornales(p.grid('Obreros 26'), { pestana: 'Obreros 26', anio: 2026, mapa: MAPA, alias: ALIAS, norm })
  assert.equal(ok.bloques[0].testigo, 144000)
  assert.equal(ok.bloques[0].concuerda, true)

  const q = planilla()
  q.bloque(['5/1', '6/1', '7/1'], COLS_2026)
  q.persona({ nombre: 'Quiroga Sebastian', horas: [8, 8, 8], vh: 6000, cliente: 'LA ESTRELLA', cols: COLS_2026 })
  q.cruda({ B: txt('TOTAL MO'), C: { formula: null, valor: '200000', numero: 200000, formato: null, derivada: false } })
  const mal = filasDeJornales(q.grid('Obreros 26'), { pestana: 'Obreros 26', anio: 2026, mapa: MAPA, alias: ALIAS, norm })
  assert.equal(mal.bloques[0].concuerda, false)
  assert.equal(mal.bloques[0].diferencia, -56000)
})

test('un bloque sin TOTAL MO escrito no contrasta — y eso NO es que contrastó bien', () => {
  const p = planilla()
  p.bloque(['5/1', '6/1', '7/1'], COLS_2026)
  p.persona({ nombre: 'Quiroga Sebastian', horas: [8, 8, 8], vh: 6000, cliente: 'LA ESTRELLA', cols: COLS_2026 })
  const r = filasDeJornales(p.grid('Obreros 26'), { pestana: 'Obreros 26', anio: 2026, mapa: MAPA, alias: ALIAS, norm })
  assert.equal(r.bloques[0].testigo, null)
  assert.equal(r.bloques[0].concuerda, null)
})

test('un rótulo desconocido no se carga y su plata queda contada aparte', () => {
  const p = planilla()
  p.bloque(['5/1', '6/1', '7/1'], COLS_2026)
  p.persona({ nombre: 'Perez Ana', horas: [8, 8, 8], vh: 5000, cliente: 'OBRA NUEVA SIN ALIAS', cols: COLS_2026 })
  const r = filasDeJornales(p.grid('Obreros 26'), { pestana: 'Obreros 26', anio: 2026, mapa: MAPA, alias: ALIAS, norm })
  assert.equal(r.filas.length, 0)
  assert.equal(r.excluidas.length, 1)
  assert.equal(r.excluidas[0].excluida, EXCLUSION.SIN_OBRA_CANONICA)
  assert.equal(r.excluidas[0].monto, 120000)
})
