// LOS CONTROLES DE LA CARPETA DE COTIZACIONES, PROBADOS AL REVÉS.
//
// ═══ POR QUÉ CADA PRUEBA ARMA UN .xlsx DE VERDAD ═══
//
// Todos los controles de este circuito pueden devolver «0 hallazgos», y un 0 es exactamente lo que
// devuelve un control que no sabe mirar. Probarlos con objetos armados a mano no sirve: los cuatro
// defectos que aparecieron mientras se escribía esto —el valor cacheado de una celda en error, el
// rango que no empieza en A1, `cellFormula: false`, y `Number('')` valiendo 0— vivían TODOS en el
// tramo que va de los bytes a los objetos. Un test que empieza después de ese tramo los habría
// dejado pasar a los cuatro.
//
// Por eso cada prueba escribe un libro real, lo pasa por `estudiarTanda` —la misma función que usa
// el comando— y recién ahí mira el resultado. Y cada control tiene su par: uno que lo pone en ROJO
// y otro que lo deja en verde, porque un control que siempre da rojo es tan inútil como uno que
// siempre da verde.
import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { clasificar, CLASE, inventariar } from './inventario-drive.mjs'
import { filasDeHoja, leerArchivo } from './leer-archivo.mjs'
import { ERROR_DE_CELDA, textoDelError } from './celda.mjs'
import { encabezado, leerOferta, numero, porcentajeDelRotulo, refCelda } from './cotizacion-ecsas.mjs'
import { estudiarTanda, esCotizacionInterna, obraDe } from './estudio-cotizaciones.mjs'
import { TIPO, hallazgos } from './hallazgos-cotizacion.mjs'
import { aConocimientos, practicas } from './practica-cotizacion.mjs'
import { ESTADO, PROCEDENCIA, incorporar } from './biblioteca.mjs'
import { fusionarHallazgos } from '../../scripts/estudiar-cotizaciones-drive.mjs'

const require = createRequire(import.meta.url)
const XLSX = require('xlsx')

/** El código numérico con el que Excel guarda `#DIV/0!`. Su valor cacheado es 7, y ese 7 es el que
 *  se coló como si fuera plata hasta que el lector aprendió a distinguirlo. */
const DIV_CERO = 0x07

/** Un renglón de análisis: código, descripción, unidad y las horas por unidad al final. */
const filaAnalisis = (cod, desc, un, ofH, ayH) => [cod, null, desc, un, null, null, 1000, 500, 500, 0, 46000, null, ofH, ayH]

const ENCABEZADO_ANALISIS = ['COD T', 'COD R', 'DESCRIPCION', 'UN', 'CANTIDAD', 'COSTO', 'TOTAL', 'MO', 'MA', 'CS', 'FECHA', 'CONSIDERACIONES', 'OF E - OF', 'AY']
const ENCABEZADO_PRESUPUESTO = ['ID TAREA', 'ID', 'TAREA', 'U.', 'CANT.', 'COSTO U TOTAL', 'COEF. AJUSTE', 'SUBTOTAL', 'FECHA', 'COSTO MO', 'COSTO MA', 'COSTO CS']

/**
 * ARMA UN LIBRO CON LA MISMA FORMA QUE LA PLANTILLA REAL DE ECSAS.
 *
 * `ivaConFormula` y `subtotalRoto` existen para poder producir los dos casos que se encontraron en
 * Drive: el IVA tipeado a mano al lado de un error, y el cierre entero en `#DIV/0!`.
 */
function libroDeCotizacion({
  items = [['REPLANTEO', 'M2', 10, 100, 1000]], subtotal = 1000, iva = 210, total = 1210,
  ivaConFormula = true, subtotalRoto = false, partidas = [filaAnalisis('T1001', 'REPLANTEO', 'M2', 0.06, 0.06)],
  codigosUsados = ['T1001'], unidadesPresupuesto = ['M2'], coeficientesAjuste = [1], tareasExtra = [], rotuloGG = 'Gastos contables (0.6 % de CD)',
  coeficienteGG = 0.006, importeGG = 600, cliente = 'CLIENTE UNO', bloquesAjenos = [], notas = ['Nota 1: solo mano de obra'],
} = {}) {
  const oferta = [
    [], [], [], [], [], [],
    [cliente, null, null, null, null, ...bloquesAjenos],
    [], [], [], [],
    ['TAREA', 'UN', 'Cant', 'Precio Unicario', 'Sub Total'],
    [],
    ...items,
    [],
    [null, null, 'SUB TOTAL ', null, subtotal],
    [null, null, 'IVA', null, iva],
    [null, null, 'TOTAL', null, total],
    [],
    ...notas.map((n) => [n]),
    ['Forma de Pago: Anticipo 40%'],
  ]
  const hOferta = XLSX.utils.aoa_to_sheet(oferta)
  // 1-based: encabezado en la 12, una fila en blanco, los ítems, otra en blanco y ahí el SUB TOTAL.
  const filaCierre = 15 + items.length
  if (subtotalRoto) {
    hOferta[`E${filaCierre}`] = { t: 'e', v: DIV_CERO, w: '#DIV/0!' }
    hOferta[`E${filaCierre + 2}`] = { t: 'e', v: DIV_CERO, w: '#DIV/0!' }
  }
  if (ivaConFormula) hOferta[`E${filaCierre + 1}`] = { t: 'n', v: iva, f: `E${filaCierre}*0.21` }

  const presupuesto = [
    ['PRESUPUESTO GENERAL'], [], [], [], [], [],
    ENCABEZADO_PRESUPUESTO,
    ['ESTRUCTURA'],
    ...codigosUsados.map((c, i) => [1, c, `TAREA ${c}`, unidadesPresupuesto[i] ?? 'M2', 10, 100, coeficientesAjuste[i] ?? 1, 1000, 46000, 500, 500, 0]),
    ...tareasExtra.map((t) => [null, 'T9999', t, 'M2', 1, 1, 1, 1, 46000, 0, 0, 0]),
  ]
  const gg = [
    [0], [], [],
    ['COSTOS DIRECTOS (Sin IVA)', null, null, null, null, null, null, null, 100000],
    [], ['COSTOS INDIRECTOS (Sin IVA)', null, null, null, null, null, null, null, 50000],
    [], [null, 'Gastos Comunes de obra:'],
    [null, 'BAÑO QUIMICO', null, null, 50000, 'por mes', 3, 150000],
    [null, 'Gastos Generales de la Empresa:'],
    [null, rotuloGG, null, null, null, 1, coeficienteGG, importeGG],
    [], [], [], [], [], [], [], [], [], [], [], [], [], [], [],
    ['BENEFICIO', null, null, 0.15, 0.02, 0.17],
  ]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, hOferta, 'OFERTA')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(presupuesto), 'Presupuesto')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['ANALISIS DE COSTOS'], [], [], [], ENCABEZADO_ANALISIS, ...partidas]), 'Análisis')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(gg), 'GG')
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
}

/** Corre el circuito ENTERO —bytes, hash, parseo, lectura, práctica, hallazgos— igual que el comando. */
async function estudiar(libros) {
  const archivos = libros.map((l, i) => ({ driveId: `id${i}`, nombre: l.nombre, ruta: l.ruta, modificado: '2026-08-01' }))
  const porId = new Map(archivos.map((a, i) => [a.driveId, libros[i].bytes]))
  return estudiarTanda(archivos, { traer: (a) => porId.get(a.driveId), obtenidoEn: '2026-08-28' })
}

const libro = (nombre, ruta, opciones) => ({ nombre, ruta, bytes: libroDeCotizacion(opciones) })

// ═══════════════════ EL TRAMO QUE VA DE LOS BYTES A LOS OBJETOS ═══════════════════

test('una celda en error NO entra como número: el valor cacheado de #DIV/0! vale 7 y eso no es plata', async () => {
  const r = await leerArchivo(libroDeCotizacion({ subtotalRoto: true }), { nombre: 'x.xlsx' })
  const o = leerOferta(r.hojas.OFERTA)
  assert.equal(o.subtotal.valor, null, 'el subtotal de una celda en error tiene que ser null, no su caché')
  assert.equal(o.subtotal.error, '#DIV/0!')
})

test('el mismo libro SIN el error deja el subtotal legible: el control no es una constante', async () => {
  const r = await leerArchivo(libroDeCotizacion({ subtotal: 12345 }), { nombre: 'x.xlsx' })
  const o = leerOferta(r.hojas.OFERTA)
  assert.equal(o.subtotal.valor, 12345)
  assert.equal(o.subtotal.error, null)
})

test('las referencias de celda no se corren cuando el rango no empieza en A1', () => {
  const hoja = { '!ref': 'B3:C4', B3: { t: 's', v: 'hola' }, C4: { t: 'n', v: 9 } }
  const filas = filasDeHoja(XLSX, hoja)
  assert.equal(filas[2][1], 'hola', 'la fila 3 del Excel tiene que ser el índice 2')
  assert.equal(refCelda(1, 2), 'B3')
  assert.equal(filas[3][2], 9)
  assert.equal(refCelda(2, 3), 'C4')
})

test('un texto sin forma de número no vale 0: el nombre de un cliente no es un importe', () => {
  assert.equal(numero('MANUFACTURAS QUIMICAS JUAN MESSINAS'), null)
  assert.equal(numero(''), null)
  assert.equal(numero('1.234,56'), 1234.56)
  assert.equal(numero(0), 0, 'un cero SÍ es un número: una partida cotizada en cero es el dato que importa')
})

test('el encabezado se busca por texto y no por posición', () => {
  const filas = [[], ['basura'], ['TAREA', 'UN', 'Cant', 'Precio Unicario', 'Sub Total']]
  assert.deepEqual(encabezado(filas, ['TAREA', 'SUB TOTAL']), { fila: 2, columnas: { TAREA: 0, UN: 1, CANT: 2, 'PRECIO UNICARIO': 3, 'SUB TOTAL': 4 } })
  assert.equal(encabezado(filas, ['CODIGO']), null)
})

test('un PDF sin capa de texto se declara: no pasa por leído', async () => {
  const { PDFDocument } = await import('pdf-lib')
  const doc = await PDFDocument.create()
  doc.addPage([200, 200])
  const r = await leerArchivo(Buffer.from(await doc.save()), { nombre: 'escaneado.pdf' })
  assert.equal(r.ok, false)
  assert.equal(r.necesitaOcr, true)
  assert.match(r.porQue, /OCR/)
})

test('lo que no tiene adaptador se declara con el motivo, no desaparece', async () => {
  const r = await leerArchivo(Buffer.from('PKbasura'), { nombre: 'memoria.docx' })
  assert.equal(r.ok, false)
  assert.match(r.porQue, /Word/)
  assert.ok(r.hash, 'aunque no se pueda abrir tiene que quedar identificado por su hash')
})

// ═══════════════════ LOS HALLAZGOS, CADA UNO CON SU ROJO Y SU VERDE ═══════════════════

test('OFERTA_ROTA: da rojo con el cierre en error y verde sin él', async () => {
  const roto = await estudiar([libro('rota.xlsx', 'administracion/PRESUPUESTOS - CLIENTES/A/OBRA/rota.xlsx', { subtotalRoto: true })])
  const h = roto.hallazgos.filter((x) => x.tipo === TIPO.OFERTA_ROTA)
  assert.equal(h.length, 1)
  assert.match(h[0].afirmacion, /#DIV\/0!/)
  assert.equal(h[0].monto, 1000, 'tiene que decir cuánto vale la oferta que no dice cuánto vale')
  const sana = await estudiar([libro('sana.xlsx', 'administracion/PRESUPUESTOS - CLIENTES/A/OBRA/sana.xlsx')])
  assert.equal(sana.hallazgos.filter((x) => x.tipo === TIPO.OFERTA_ROTA).length, 0)
})

test('IVA_ESCRITO_A_MANO: da rojo sin fórmula y verde con fórmula', async () => {
  const mano = await estudiar([libro('mano.xlsx', 'administracion/PRESUPUESTOS - CLIENTES/A/OBRA/mano.xlsx', { ivaConFormula: false })])
  assert.equal(mano.hallazgos.filter((x) => x.tipo === TIPO.IVA_ESCRITO_A_MANO).length, 1)
  const conFormula = await estudiar([libro('ok.xlsx', 'administracion/PRESUPUESTOS - CLIENTES/A/OBRA/ok.xlsx', { ivaConFormula: true })])
  assert.equal(conFormula.hallazgos.filter((x) => x.tipo === TIPO.IVA_ESCRITO_A_MANO).length, 0)
})

test('SUBTOTAL_NO_CIERRA: da rojo cuando la suma de los ítems no es el subtotal', async () => {
  const malo = await estudiar([libro('m.xlsx', 'administracion/PRESUPUESTOS - CLIENTES/A/OBRA/m.xlsx', { subtotal: 998, iva: 209.58, total: 1207.58 })])
  const h = malo.hallazgos.filter((x) => x.tipo === TIPO.SUBTOTAL_NO_CIERRA)
  assert.equal(h.length, 1)
  assert.equal(h[0].monto, 2)
  const bueno = await estudiar([libro('b.xlsx', 'administracion/PRESUPUESTOS - CLIENTES/A/OBRA/b.xlsx')])
  assert.equal(bueno.hallazgos.filter((x) => x.tipo === TIPO.SUBTOTAL_NO_CIERRA).length, 0)
})

test('ROTULO_CONTRADICE_COEFICIENTE: el rótulo promete 0,6% y la planilla aplica 4%', async () => {
  const malo = await estudiar([libro('m.xlsx', 'administracion/PRESUPUESTOS - CLIENTES/A/OBRA/m.xlsx', { coeficienteGG: 0.04 })])
  const h = malo.hallazgos.filter((x) => x.tipo === TIPO.ROTULO_CONTRADICE_COEFICIENTE)
  assert.equal(h.length, 1)
  assert.equal(Math.round(h[0].monto), 3400, 'la plata es la diferencia de coeficiente aplicada al costo directo')
  assert.match(h[0].evidencia[1].ubicacion, /hoja GG · G11$/, 'sin la celda no es un hallazgo, es una impresión')
  const bueno = await estudiar([libro('b.xlsx', 'administracion/PRESUPUESTOS - CLIENTES/A/OBRA/b.xlsx', { coeficienteGG: 0.006 })])
  assert.equal(bueno.hallazgos.filter((x) => x.tipo === TIPO.ROTULO_CONTRADICE_COEFICIENTE).length, 0)
})

test('COEFICIENTE_INESTABLE no se dispara con un rótulo que no declara porcentaje: esa columna guarda meses', () => {
  const cot = (n, aplicado) => ({ id: n, nombre: n, obra: `obra${n}`, gg: { conceptos: [{ concepto: 'BAÑO QUIMICO', prometidoPorElRotulo: null, aplicado, importe: 1, celdaCoeficiente: 'G10', celdaImporte: 'H10' }] } })
  const sinPorcentaje = hallazgos([cot('a', 0.13), cot('b', 7.27), cot('c', 1)])
  assert.equal(sinPorcentaje.filter((x) => x.tipo === TIPO.COEFICIENTE_INESTABLE).length, 0)
  const conPorcentaje = (n, aplicado) => ({ id: n, nombre: n, obra: `obra${n}`, gg: { conceptos: [{ concepto: 'Gastos contables (0.6 % de CD)', prometidoPorElRotulo: 0.006, aplicado, importe: 1, celdaCoeficiente: 'G10', celdaImporte: 'H10' }] } })
  const inestable = hallazgos([conPorcentaje('a', 0.006), conPorcentaje('b', 0.04), conPorcentaje('c', 0.03)])
  assert.equal(inestable.filter((x) => x.tipo === TIPO.COEFICIENTE_INESTABLE).length, 1)
})

test('UNIDAD_CONTRADICTORIA: el mismo código medido en M2 y en ML entre dos cotizaciones', async () => {
  const dos = await estudiar([
    libro('a.xlsx', 'administracion/PRESUPUESTOS - CLIENTES/CLI/OBRA A/a.xlsx', { partidas: [filaAnalisis('T1001', 'REPLANTEO', 'M2', 0.06, 0.06)] }),
    libro('b.xlsx', 'administracion/PRESUPUESTOS - CLIENTES/CLI/OBRA B/b.xlsx', { partidas: [filaAnalisis('T1001', 'REPLANTEO', 'ML', 0.06, 0.06)] }),
  ])
  const h = dos.hallazgos.filter((x) => x.tipo === TIPO.UNIDAD_CONTRADICTORIA)
  assert.equal(h.length, 1)
  assert.match(h[0].afirmacion, /M2 y en ML|ML y en M2/)
  const iguales = await estudiar([
    libro('a.xlsx', 'administracion/PRESUPUESTOS - CLIENTES/CLI/OBRA A/a.xlsx'),
    libro('b.xlsx', 'administracion/PRESUPUESTOS - CLIENTES/CLI/OBRA B/b.xlsx'),
  ])
  assert.equal(iguales.hallazgos.filter((x) => x.tipo === TIPO.UNIDAD_CONTRADICTORIA).length, 0)
})

test('DATOS_DE_OTRO_CLIENTE: la oferta guarda el bloque de otro cliente a la derecha', async () => {
  const con = await estudiar([libro('a.xlsx', 'administracion/PRESUPUESTOS - CLIENTES/CLI/OBRA/a.xlsx', { bloquesAjenos: ['OTRO CLIENTE SA'] })])
  assert.equal(con.hallazgos.filter((x) => x.tipo === TIPO.DATOS_DE_OTRO_CLIENTE).length, 1)
  const sin = await estudiar([libro('b.xlsx', 'administracion/PRESUPUESTOS - CLIENTES/CLI/OBRA/b.xlsx')])
  assert.equal(sin.hallazgos.filter((x) => x.tipo === TIPO.DATOS_DE_OTRO_CLIENTE).length, 0)
})

test('COEFICIENTE_AJUSTE_SIN_CRITERIO: da rojo con un multiplicador distinto de 1 y verde con todos en 1', async () => {
  const con = await estudiar([libro('a.xlsx', 'administracion/PRESUPUESTOS - CLIENTES/CLI/OBRA/a.xlsx', { coeficientesAjuste: [1.5] })])
  const h = con.hallazgos.filter((x) => x.tipo === TIPO.COEFICIENTE_AJUSTE_SIN_CRITERIO)
  assert.equal(h.length, 1)
  assert.match(h[0].afirmacion, /T1001: 1\.5/)
  assert.equal(Math.round(h[0].monto), 333, 'la plata es la parte del precio que sale del multiplicador')
  const sin = await estudiar([libro('b.xlsx', 'administracion/PRESUPUESTOS - CLIENTES/CLI/OBRA/b.xlsx')])
  assert.equal(sin.hallazgos.filter((x) => x.tipo === TIPO.COEFICIENTE_AJUSTE_SIN_CRITERIO).length, 0)
})

test('un «coeficiente» de 1015 no se convierte en plata: sale aparte y sin monto', async () => {
  const r = await estudiar([libro('a.xlsx', 'administracion/PRESUPUESTOS - CLIENTES/CLI/OBRA/a.xlsx', { coeficientesAjuste: [1015] })])
  const imp = r.hallazgos.filter((x) => x.tipo === TIPO.COEFICIENTE_AJUSTE_IMPLAUSIBLE)
  assert.equal(imp.length, 1)
  assert.equal(imp[0].monto, null, 'multiplicar el subtotal por 1015 daría una cifra que se lee como plata y no lo es')
  assert.equal(imp[0].gravedad, 'ALTA')
  assert.equal(r.hallazgos.filter((x) => x.tipo === TIPO.COEFICIENTE_AJUSTE_SIN_CRITERIO).length, 0)
})

test('REFERENCIA_ROTA: da rojo con un #REF! en el presupuesto y verde sin él', async () => {
  const con = await estudiar([libro('a.xlsx', 'administracion/PRESUPUESTOS - CLIENTES/CLI/OBRA/a.xlsx', { tareasExtra: ['#REF!'] })])
  assert.equal(con.hallazgos.filter((x) => x.tipo === TIPO.REFERENCIA_ROTA).length, 1)
  const sin = await estudiar([libro('b.xlsx', 'administracion/PRESUPUESTOS - CLIENTES/CLI/OBRA/b.xlsx')])
  assert.equal(sin.hallazgos.filter((x) => x.tipo === TIPO.REFERENCIA_ROTA).length, 0)
})

test('una corrida que saltea NO borra los hallazgos de lo salteado', () => {
  const previos = [{ clave: 'vieja', tipo: 'X', gravedad: 'ALTA' }, { clave: 'compartida', tipo: 'X', gravedad: 'BAJA' }]
  const nuevos = [{ clave: 'compartida', tipo: 'X', gravedad: 'ALTA' }, { clave: 'nueva', tipo: 'X', gravedad: 'MEDIA' }]
  const fusion = fusionarHallazgos(previos, nuevos, { salteados: 3 })
  assert.deepEqual(fusion.map((h) => h.clave).sort(), ['compartida', 'nueva', 'vieja'])
  assert.equal(fusion.find((h) => h.clave === 'compartida').gravedad, 'ALTA', 'lo nuevo pisa lo viejo con la misma clave')
  assert.deepEqual(fusionarHallazgos(previos, nuevos, { salteados: 0 }), nuevos, 'sin salteados la lista nueva es completa y reemplaza')
})

test('lo que la columna G guarda para un rótulo sin porcentaje NO se publica como coeficiente', async () => {
  const r = await estudiar([
    libro('a.xlsx', 'administracion/PRESUPUESTOS - CLIENTES/CLI/OBRA A/a.xlsx'),
    libro('b.xlsx', 'administracion/PRESUPUESTOS - CLIENTES/CLI/OBRA B/b.xlsx'),
  ])
  const bano = r.practicas.find((p) => p.clave.startsWith('cotizacion.indirectos.bano_quimico'))
  assert.ok(bano, 'el concepto tiene que salir igual: lo que no puede es salir mal nombrado')
  assert.equal(bano.clave.endsWith('.valor_de_columna'), true)
  assert.match(bano.afirmacion, /NO es un coeficiente/)
  assert.equal(bano.unidad, null)
  const contables = r.practicas.find((p) => p.clave.startsWith('cotizacion.indirectos.gastos_contables'))
  assert.equal(contables.clave.endsWith('.coeficiente'), true)
  assert.equal(contables.unidad, 'fracción')
})

test('porcentajeDelRotulo lee lo que el rótulo promete, y null cuando no promete nada', () => {
  assert.equal(porcentajeDelRotulo('Libreria (0.15 % de CD)'), 0.0015)
  assert.equal(porcentajeDelRotulo('Gastos administrativos (4 % de CD) con amort.'), 0.04)
  assert.equal(porcentajeDelRotulo('BAÑO QUIMICO'), null)
})

// ═══════════════════ LA PRÁCTICA: NADA ASCIENDE SOLO ═══════════════════

test('la práctica sale CANDIDATO y EXPERIENCIA_ECSAS, nunca NORMA ni BASE_MAESTRA ni VALIDADO', async () => {
  const r = await estudiar([
    libro('a.xlsx', 'administracion/PRESUPUESTOS - CLIENTES/CLI/OBRA A/a.xlsx'),
    libro('b.xlsx', 'administracion/PRESUPUESTOS - CLIENTES/CLI/OBRA B/b.xlsx'),
  ])
  assert.ok(r.conocimientos.length > 0)
  for (const k of r.conocimientos) {
    assert.equal(k.estado, ESTADO.CANDIDATO)
    assert.equal(k.procedencia, PROCEDENCIA.EXPERIENCIA_ECSAS)
    assert.ok(k.evidencia?.textoLiteral, 'sin cita literal no entra')
    assert.match(k.condicion, /NO que sea correcto/)
  }
  // Y la puerta al disco lo acepta: si `incorporar` lo rechazara, nada llegaría a la biblioteca.
  const bib = incorporar({ documentos: [], conocimientos: [], huecos: [] }, { conocimientos: r.conocimientos, documentos: r.documentos })
  assert.equal(bib.conocimientos.length, r.conocimientos.length)
})

test('una práctica de una sola cotización no se emite como partida: un caso no es una costumbre', async () => {
  const una = await estudiar([libro('a.xlsx', 'administracion/PRESUPUESTOS - CLIENTES/CLI/OBRA A/a.xlsx')])
  assert.equal(una.practicas.filter((p) => p.clave.startsWith('cotizacion.partida.')).length, 0)
  const dos = await estudiar([
    libro('a.xlsx', 'administracion/PRESUPUESTOS - CLIENTES/CLI/OBRA A/a.xlsx'),
    libro('b.xlsx', 'administracion/PRESUPUESTOS - CLIENTES/CLI/OBRA B/b.xlsx'),
  ])
  assert.ok(dos.practicas.filter((p) => p.clave.startsWith('cotizacion.partida.')).length > 0)
})

test('la madurez cuenta OBRAS distintas, no archivos', async () => {
  const mismaObra = await estudiar([
    libro('a.xlsx', 'administracion/PRESUPUESTOS - CLIENTES/CLI/OBRA A/a.xlsx'),
    libro('b.xlsx', 'administracion/PRESUPUESTOS - CLIENTES/CLI/OBRA A/Viejo/b.xlsx'),
  ])
  const p = mismaObra.practicas.find((x) => x.clave.startsWith('cotizacion.partida.') && x.clave.endsWith('.unidad'))
  assert.equal(p.obrasDistintas, 1, 'dos archivos de la misma obra son UNA obra')
  assert.equal(p.madurez, 'A')
})

test('obraDe no devuelve el cajón del archivo como si fuera la obra', () => {
  assert.equal(obraDe('administracion/PRESUPUESTOS - CLIENTES/LA ESTRELLA/CIERRE PERIMETRAL/Cotizaciones Internas/x.xlsm'), 'LA ESTRELLA · CIERRE PERIMETRAL')
  assert.equal(obraDe('administracion/PRESUPUESTOS - CLIENTES/FRANCO QUATTROPANI/COTIZACION INTERNA/y.xlsm'), 'FRANCO QUATTROPANI')
  assert.notEqual(obraDe('administracion/PRESUPUESTOS - CLIENTES/X/Y/z.xlsm'), 'PRESUPUESTOS - CLIENTES')
})

// ═══════════════════ EL INVENTARIO ═══════════════════

test('la clasificación no engancha con todo: la carpeta se llama PRESUPUESTOS y eso no hace cotización a un plano', () => {
  assert.equal(clasificar({ nombre: 'Plano de Estructura.pdf', ruta: 'administracion/PRESUPUESTOS - CLIENTES/X/Plano de Estructura.pdf' }).clase, CLASE.PROYECTO)
  assert.equal(clasificar({ nombre: 'COTIZACION INTERNA.xlsm', ruta: 'administracion/PRESUPUESTOS - CLIENTES/X/COTIZACION INTERNA.xlsm' }).clase, CLASE.COTIZACION_ECSAS)
})

test('un recibo de sueldo guardado en presupuestos sigue siendo un recibo de sueldo', () => {
  const c = clasificar({ nombre: 'Recibo 2026-07 Q2 - PEREZ.pdf', ruta: 'administracion/PRESUPUESTOS - CLIENTES/X/Recibo 2026-07 Q2 - PEREZ.pdf' })
  assert.equal(c.clase, CLASE.NO_UTIL)
  assert.match(c.porQue, /legajo/)
})

test('todo archivo sale con una clase y un porqué, y las clases suman el total', () => {
  const inv = inventariar([
    { nombre: 'a.pdf', ruta: 'administracion/x/a.pdf' },
    { nombre: 'Horas Hombre - Pisos.xlsm', ruta: 'administracion/PRESUPUESTOS - CLIENTES/X/Horas Hombre - Pisos.xlsm' },
    { nombre: 'factura.pdf', ruta: 'administracion/Archivos GESTION ECSAS/FACTURAS A/factura.pdf' },
  ])
  assert.equal(inv.total, 3)
  assert.equal(Object.values(inv.porClase).reduce((a, b) => a + b, 0), 3)
  assert.equal(inv.porClase[CLASE.RENDIMIENTO], 1)
  for (const f of inv.fichas) assert.ok(f.porQue, 'ningún archivo puede quedar sin motivo')
})

// ═══════════════════ IDEMPOTENCIA ═══════════════════

test('lo ya estudiado no se vuelve a bajar: el hash recordado evita el viaje', async () => {
  const bytes = libroDeCotizacion()
  const archivo = { driveId: 'id1', nombre: 'a.xlsx', ruta: 'administracion/PRESUPUESTOS - CLIENTES/X/OBRA/a.xlsx', modificado: '2026-08-01' }
  let bajadas = 0
  const memoria = new Map()
  const opciones = {
    traer: () => { bajadas += 1; return bytes },
    hashConocido: (a) => memoria.get(`${a.driveId}:${a.modificado}`) ?? null,
    recordarHash: (a, h) => memoria.set(`${a.driveId}:${a.modificado}`, h),
  }
  const primera = await estudiarTanda([archivo], opciones)
  assert.equal(bajadas, 1)
  assert.equal(primera.cotizaciones.length, 1)
  const hashes = new Set(primera.documentos.map((d) => d.hash))
  const segunda = await estudiarTanda([archivo], { ...opciones, yaEstudiado: (h) => hashes.has(h) })
  assert.equal(bajadas, 1, 'la segunda corrida no puede volver a bajar el mismo contenido')
  assert.equal(segunda.salteados.length, 1)
  assert.equal(segunda.cotizaciones.length, 0)
})

test('un archivo modificado en Drive SÍ se vuelve a estudiar: la idempotencia no puede congelar', async () => {
  const archivo = { driveId: 'id1', nombre: 'a.xlsx', ruta: 'administracion/PRESUPUESTOS - CLIENTES/X/OBRA/a.xlsx', modificado: '2026-08-01' }
  const memoria = new Map()
  let bajadas = 0
  const opciones = {
    traer: () => { bajadas += 1; return libroDeCotizacion() },
    hashConocido: (a) => memoria.get(`${a.driveId}:${a.modificado}`) ?? null,
    recordarHash: (a, h) => memoria.set(`${a.driveId}:${a.modificado}`, h),
  }
  const primera = await estudiarTanda([archivo], opciones)
  const hashes = new Set(primera.documentos.map((d) => d.hash))
  await estudiarTanda([{ ...archivo, modificado: '2026-08-27' }], {
    ...opciones,
    traer: () => { bajadas += 1; return libroDeCotizacion({ subtotal: 5000 }) },
    yaEstudiado: (h) => hashes.has(h),
  })
  assert.equal(bajadas, 2)
})

test('una planilla que no es la plantilla de ECSAS se declara, no se fuerza', async () => {
  assert.equal(esCotizacionInterna(['Hoja1', 'Hoja2']), false)
  assert.equal(esCotizacionInterna(['Análisis', 'Presupuesto', 'GG', 'OFERTA']), true)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['a']]), 'Hoja1')
  const r = await estudiarTanda([{ driveId: 'x', nombre: 'otra.xlsx', ruta: 'administracion/x/otra.xlsx' }], { traer: () => XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) })
  assert.equal(r.noLeidos.length, 1)
  assert.match(r.noLeidos[0].porQue, /no es la plantilla de cotización interna/)
  assert.ok(r.noLeidos[0].hash, 'lo que no se pudo estudiar igual queda identificado')
})

test('el error de celda se puede nombrar, y un número no es un error', () => {
  assert.equal(textoDelError({ [ERROR_DE_CELDA]: true, texto: '#NAME?' }), '#NAME?')
  assert.equal(textoDelError(7), null)
})

test('practicas() sobre una lista vacía devuelve una lista vacía, no una excepción', () => {
  assert.deepEqual(practicas([]), [])
  assert.deepEqual(aConocimientos([]), [])
  assert.deepEqual(hallazgos([]), [])
})
