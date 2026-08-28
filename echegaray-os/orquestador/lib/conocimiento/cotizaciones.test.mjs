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
import { practicas } from './practica-cotizacion.mjs'
import { registrosHistoricos } from './practica-historica.mjs'
import { ESTADO, PROCEDENCIA, incorporar } from './biblioteca.mjs'
import { fusionarHallazgos } from '../../scripts/estudiar-cotizaciones-drive.mjs'
import { estudiar, filaAnalisis, libro, libroDeCotizacion } from './cotizacion-fixture.mjs'

const require = createRequire(import.meta.url)
const XLSX = require('xlsx')


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
  // El IVA tipeado AL LADO de renglones que sí tienen fórmula. Sin esa fórmula del renglón la hoja
  // no tiene ninguna, y entonces «no veo la fórmula del IVA» no distingue un IVA tipeado de un
  // lector mal configurado: desde que el estudio publica lo que dicen los controles, ese caso sale
  // como NO_SE_PUDO_MIRAR y no como hallazgo. Es el fin de los 12 falsos rojos de 13 ofertas.
  const conRenglon = { formulasExtra: [{ hoja: 'OFERTA', celda: 'E14', formula: 'C14*D14', valor: 1000 }] }
  const mano = await estudiar([libro('mano.xlsx', 'administracion/PRESUPUESTOS - CLIENTES/A/OBRA/mano.xlsx', { ivaConFormula: false, ...conRenglon })])
  assert.equal(mano.hallazgos.filter((x) => x.tipo === TIPO.IVA_ESCRITO_A_MANO).length, 1)
  const conFormula = await estudiar([libro('ok.xlsx', 'administracion/PRESUPUESTOS - CLIENTES/A/OBRA/ok.xlsx', { ivaConFormula: true })])
  assert.equal(conFormula.hallazgos.filter((x) => x.tipo === TIPO.IVA_ESCRITO_A_MANO).length, 0)

  // Y la hoja sin NINGUNA fórmula no produce ni un hallazgo ni un verde: produce un «no miré».
  const ciega = await estudiar([libro('c.xlsx', 'administracion/PRESUPUESTOS - CLIENTES/A/OBRA/c.xlsx', { ivaConFormula: false })])
  assert.equal(ciega.hallazgos.filter((x) => x.tipo === TIPO.IVA_ESCRITO_A_MANO).length, 0)
  assert.equal(ciega.controles.corridas.find((c) => c.id === 'iva-escrito-a-mano').estado, 'NO_SE_PUDO_MIRAR')
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

test('la práctica sale CANDIDATO y PRACTICA_HISTORICA_ECSAS, nunca NORMA ni BASE_MAESTRA ni VALIDADO', async () => {
  const r = await estudiar([
    libro('a.xlsx', 'administracion/PRESUPUESTOS - CLIENTES/CLI/OBRA A/a.xlsx'),
    libro('b.xlsx', 'administracion/PRESUPUESTOS - CLIENTES/CLI/OBRA B/b.xlsx'),
  ])
  assert.ok(r.conocimientos.length > 0)
  for (const k of r.conocimientos) {
    assert.equal(k.estado, ESTADO.CANDIDATO)
    // EXPERIENCIA_ECSAS significa «lo medimos ejecutando». Un coeficiente tipeado en una planilla
    // no se midió ejecutando, y por eso tiene procedencia propia.
    assert.equal(k.procedencia, PROCEDENCIA.PRACTICA_HISTORICA_ECSAS)
    assert.ok(k.evidencia && Object.keys(k.evidencia).length, 'sin evidencia no entra')
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

test('una planilla que no es la plantilla de ECSAS ni una cotización se declara, no se fuerza', async () => {
  assert.equal(esCotizacionInterna(['Hoja1', 'Hoja2']), false)
  assert.equal(esCotizacionInterna(['Análisis', 'Presupuesto', 'GG', 'OFERTA']), true)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['a']]), 'Hoja1')
  const r = await estudiarTanda([{ driveId: 'x', nombre: 'otra.xlsx', ruta: 'administracion/x/otra.xlsx' }], { traer: () => XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) })
  assert.equal(r.noLeidos.length, 1)
  // El motivo ya no puede ser sólo «no es la plantilla interna»: con eso se cerraron las 48 de ARCOR.
  // Ahora tiene que decir también que el lector semántico miró y qué encontró, que es un motivo
  // con el que se puede hacer algo.
  assert.match(r.noLeidos[0].porQue, /no tiene las pestañas .* de la plantilla interna/)
  assert.match(r.noLeidos[0].porQue, /el lector semántico tampoco reconoce una planilla de cotización/)
  assert.ok(r.noLeidos[0].hash, 'lo que no se pudo estudiar igual queda identificado')
})

// ═══ EL CABLEADO: `planilla-semantica` estuvo escrita y desconectada, y eso es código muerto ═══
//
// `estudiarTanda` es la MISMA función que corre el comando. Estos tres tests entran por ahí a
// propósito: si alguien vuelve a dejar el lector semántico fuera de `estudiarUno`, la planilla de
// ARCOR vuelve a caer en `noLeidos` y los tres se ponen rojos a la vez.

/** La forma real de «ARSJ Planilla de Cotizacion»: encabezado en la fila 6, ítem en B, cierre con
 *  coeficientes al pie. NO tiene ninguna de las pestañas de la plantilla interna de ECSAS. */
const PLANILLA_DEL_CLIENTE = [
  [], ['', 'PLANILLA DE COTIZACION'],
  ['', 'Proyecto:', 'MURO CORTAFUEGO'], [], [],
  ['', 'ITEM', 'DESCRIPCION', 'UNIDAD', 'CANTIDAD', 'MATERIAL', 'MANO DE OBRA', 'PRECIO UNITARIO', 'PRECIO DEL ITEM', 'PRECIO DEL RUBRO'],
  ['', 1, 'TAREAS PRELIMINARES', '', '', '', '', '', '', 1000000],
  ['', 1.1, 'Traslado de equipos a obra', 'Gl', 1, null, 1000000, 1000000, 1000000],
  ['', 2, 'ESTRUCTURAS METALICAS', '', '', '', '', '', '', 4000000],
  ['', 2.1, 'Provisión y montaje de columnas C140', 'kg', 400, 7500, 2500, 10000, 4000000],
  [], ['', '', '', 'Subtotal', '', '', '', '', 5000000],
  ['', '', '', '', '', '', '', 'Gastos Generales', 0.15, 750000],
  ['', '', '', '', '', '', '', 'Beneficio', 0.18, 900000],
  ['', 'NOTA 1:', ' EL PRECIO FINAL NO INCLUYE IVA.'],
  ['', 'CONDICION DE PAGO:', 'ANTICIPO FINANCIERO 40%, SALDO CON CERTIFICACION QUINCENAL'],
]

const libroDelCliente = (filas = PLANILLA_DEL_CLIENTE, hoja = 'COTIZACION') => {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(filas), hoja)
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
}

const tandaDelCliente = (opciones = {}) => estudiarTanda(
  [{ driveId: 'arcor1', nombre: 'ARSJ Planilla de Cotizacion - Muro Cortafuego.xlsx', ruta: 'administracion/PRESUPUESTOS - CLIENTES/ARCOR - SAN JUAN/MURO CORTAFUEGO/ARSJ Planilla de Cotizacion.xlsx' }],
  { traer: () => libroDelCliente(), ...opciones },
)

test('la planilla en formato del cliente entra al circuito, no muere en noLeídos', async () => {
  const r = await tandaDelCliente()
  assert.equal(r.noLeidos.length, 0, 'con el lector semántico desconectado ésta vuelve a caer acá')
  assert.equal(r.cliente.length, 1)
  assert.equal(r.cliente[0].formatoCotizacion, 'CLIENTE')
  assert.equal(r.cliente[0].obra, 'ARCOR - SAN JUAN · MURO CORTAFUEGO')
  assert.equal(r.cotizaciones.length, 0, 'las dos familias no se mezclan: practicas() lee otra forma')
  assert.equal(r.cliente[0].items.length, 2)
})

test('la planilla del cliente produce conocimiento, no sólo un objeto leído', async () => {
  const r = await tandaDelCliente()
  assert.ok(r.practicasCliente.practicas.length > 0, 'leerla y no aprender nada de ella es leerla al pedo')
  const claves = r.conocimientos.map((k) => k.clave)
  assert.ok(claves.some((c) => c.startsWith('cotizacion_cliente.cierre.')), `sin coeficientes de cierre: ${claves.join(', ')}`)
  // Lo que enseña es el COEFICIENTE, no el importe: un GG de 750.000 depende del tamaño de la obra.
  const gg = r.conocimientos.find((k) => k.clave === 'cotizacion_cliente.cierre.gastos_generales')
  assert.ok(gg, 'falta el coeficiente de gastos generales')
  assert.equal(gg.valor, 0.15)
  // ═══ LA PROCEDENCIA: hay UN camino a la biblioteca, y no es EXPERIENCIA_ECSAS ═══
  // «Así se lo cotizamos a este cliente» es un número TIPEADO, no medido ejecutando. Con
  // EXPERIENCIA_ECSAS estos 98 los barría `retirarPracticasSuperadas()` en la corrida siguiente.
  assert.equal(gg.procedencia, 'PRACTICA_HISTORICA_ECSAS')
  assert.equal(gg.area, 'practica-historica-de-cotizacion')
  // Y la CITA tiene que llegar al disco: `cita`/`ubicacion`, que es lo que la biblioteca lee.
  // Escribiendo `textoLiteral`/`celda` se guardaron 458 citas y las 458 salieron vacías.
  assert.ok(gg.evidencia.archivos.some((a) => /ARSJ Planilla de Cotizacion/.test(a)), `sin archivo de evidencia: ${JSON.stringify(gg.evidencia.archivos)}`)
  // Y la fila de SUBTOTAL no se lee como coeficiente NUNCA: es un importe por definición.
  assert.ok(r.practicasCliente.sinCoeficiente.some((x) => x.concepto === 'SUBTOTAL'), 'una fila sin coeficiente legible tiene que quedar dicha, no descartada en silencio')
  assert.ok(!claves.includes('cotizacion_cliente.cierre.subtotal'), 'un SUBTOTAL de 0,994 es una celda de redondeo, no el coeficiente con el que se cotizó')
  assert.ok(r.documentos.some((d) => d.titulo.includes('ARSJ Planilla de Cotizacion')), 'la planilla leída tiene que quedar registrada')
})

test('un CERTIFICADO no enseña cómo se cotiza: sus cantidades son las ejecutadas', async () => {
  const filas = PLANILLA_DEL_CLIENTE.map((f, i) => (i === 1 ? ['', 'CERTIFICADO N° 3'] : f))
  const r = await estudiarTanda(
    [{ driveId: 'c1', nombre: 'CERTIFICADO 3.xlsx', ruta: 'administracion/PRESUPUESTOS - CLIENTES/FERRER HNOS/CERT/CERTIFICADO 3.xlsx' }],
    { traer: () => libroDelCliente(filas, 'Hoja1') },
  )
  assert.equal(r.cliente.length, 1, 'igual se lee y se registra')
  assert.equal(r.cliente[0].clase, 'CERTIFICADO')
  assert.equal(r.practicasCliente.practicas.length, 0, 'pero no puede enseñar una práctica de cotización')
})

test('el nombre no alcanza para declarar CERTIFICADO, y esa contradicción se declara', async () => {
  // LÍMITE CONOCIDO: la clase la decide la ESTRUCTURA. Un certificado cuyo título dice «PLANILLA DE
  // COTIZACION» entra como COTIZACION y SÍ enseña práctica. Lo único que impide que eso pase en
  // silencio es la discrepancia; si alguien la borra, este test se pone rojo.
  const r = await estudiarTanda(
    [{ driveId: 'c2', nombre: 'CERTIFICADO 1.xlsx', ruta: 'administracion/PRESUPUESTOS - CLIENTES/FERRER HNOS/CERT/CERTIFICADO 1.xlsx' }],
    { traer: () => libroDelCliente() },
  )
  assert.equal(r.cliente[0].clase, 'COTIZACION')
  assert.match(r.cliente[0].discrepancia ?? '', /el nombre «CERTIFICADO 1.xlsx» dice CERTIFICADO/)
})

test('el error de celda se puede nombrar, y un número no es un error', () => {
  assert.equal(textoDelError({ [ERROR_DE_CELDA]: true, texto: '#NAME?' }), '#NAME?')
  assert.equal(textoDelError(7), null)
})

test('practicas() sobre una lista vacía devuelve una lista vacía, no una excepción', () => {
  assert.deepEqual(practicas([]), [])
  assert.deepEqual(registrosHistoricos([]), [])
  assert.deepEqual(hallazgos([]), [])
})
