// LOS DEFECTOS DEL 14/08 — TODOS MEDIDOS SOBRE LOS FAJOS REALES DE PRODUCCIÓN.
//
// Ninguno de estos casos es inventado. Salen de `comunicacion.comprobante_fajos` de la base de
// producción: la tanda de siete fotos que el dueño mandó el 13/08 y volvió a mandar el 14/08, y lo
// que quedó trabado en el fajo abierto `00774873` cuando él escribió:
//
//   «me tiene q poder cargar todas las filas porque no puedo estar revisando cada comprobante»
//   «no se q comprobante quedo afuera porque no estoy revisando todo el tiempo, son muchos»
//
// El fajo abierto tenía NUEVE ítems. Ninguno de los siete papeles que representaban estaba de verdad
// perdido: seis eran resolubles con datos que el sistema ya tenía en la mano.

import test from 'node:test'
import assert from 'node:assert/strict'
import { colapsarRepetidos, estaCompleto, faltantesDelChat } from '../../lib/comprobantes/fajo.mjs'
import { claveComprobante, numeroCanonico, clavesEquivalentes, puntoDeVenta } from '../../lib/comprobantes/lectura.mjs'
import { conciliarConArca, aplicarArca } from '../../lib/comprobantes/arca.mjs'
import { necesitaRevision } from '../../lib/comprobantes/vision.mjs'
import { marcarYaCargados, marcarEnCompras, armarItem } from './flujo.mjs'
import { rendicionDeAdjuntos, textoRendicion } from '../../lib/comprobantes/rendicion.mjs'
import { buscarEnCompras, indexarCompras } from '../../lib/comprobantes/compras-vivas.mjs'
import { filaCompras } from './dobles.mjs'

const AHORA = new Date('2026-08-14T12:00:00Z')

/**
 * Un ítem del fajo, con la forma exacta que tiene en Postgres.
 *
 * El número se canoniza igual que en `normalizar_lectura`: lo que se guarda en el ítem NO es lo que
 * transcribió el modelo, es el número ya normalizado. Construirlo a mano sin canonizar probaría un
 * camino que en producción no existe.
 */
const it = (comprobante, extra = {}) => {
  const c = { esNotaCredito: false, ...comprobante, numero: numeroCanonico(comprobante.numero) }
  return { comprobante: c, clave: claveComprobante(c)?.clave ?? null, leidoEn: AHORA.toISOString(), ...extra }
}

// ═══ 1 · EL PUNTO DE VENTA PARTÍA LA CLAVE EN DOS ════════════════════════════

test('el mismo comprobante con el punto de venta impreso con un cero de más da UNA sola clave', () => {
  // Caso real: el ticket de Clavero/Axion se leyó `00016-00029784` en una foto y `0016-00029784` en
  // otra. Eran dos claves distintas, así que no colapsaban entre sí ni contra el registro.
  assert.equal(numeroCanonico('00016-00029784'), '0016-00029784')
  assert.equal(numeroCanonico('0016-00029784'), '0016-00029784')
  assert.equal(numeroCanonico('00113-00014352'), '0113-00014352', 'Combustibles Barcelo, 13/08')
  assert.equal(puntoDeVenta('00001'), '0001')
  // Un punto de venta de CINCO dígitos significativos es legítimo y se respeta.
  assert.equal(numeroCanonico('12345-00000001'), '12345-00000001')
})

test('la clave vieja se sigue buscando: arreglar la clave no puede duplicar un gasto', () => {
  // En `comprobantes_cargados` hay claves escritas con la forma anterior (medido: dos, entre ellas
  // `c:33708332599|00113-00014352`). Si sólo se buscara la nueva, esos comprobantes se volverían a
  // cargar — el arreglo produciendo justo el duplicado que la clave existe para impedir.
  const eq = clavesEquivalentes('c:33708332599|0113-00014352')
  assert.ok(eq.includes('c:33708332599|00113-00014352'))
  assert.ok(!eq.includes('c:33708332599|0113-00014352'), 'la propia no cuenta como equivalente')
  assert.deepEqual(clavesEquivalentes('p:google|0056-40188724').length, 2)
})

// ═══ 2 · LA NOTA DE DÉBITO CHOCABA CONTRA LA FACTURA ═════════════════════════

test('una NOTA DE DÉBITO con el mismo número que la factura NO comparte su clave', () => {
  // La ND es el instrumento de los intereses y las diferencias de cambio: comparte numeración con la
  // factura. Con la clave vieja, `ND A 0038-00002807` de Trielec daba la MISMA clave que la factura
  // de la fila 844 — la reserva no la devolvía y el bot contestaba «ya estaba cargado» sobre un gasto
  // que nunca entró. Un mensaje de éxito tapando plata perdida.
  const base = { cuit: '30558640355', numero: '0038-00002807', tipo: 'A' }
  const factura = claveComprobante(base).clave
  const debito = claveComprobante({ ...base, esNotaDebito: true }).clave
  const credito = claveComprobante({ ...base, esNotaCredito: true }).clave
  assert.notEqual(factura, debito)
  assert.notEqual(credito, debito)
  assert.equal(factura, 'c:30558640355|0038-00002807', 'la factura NO cambia de clave: el registro sigue valiendo')
  assert.equal(debito, 'c:30558640355|ND|0038-00002807')
})

test('la letra NO entra en la clave: sin ella el mismo papel entraría dos veces', () => {
  // Es la decisión del 04/08 y este arreglo no la toca. La letra es el dato menos confiable del
  // papel; hacerla parte de la identidad convierte un problema de OCR en un gasto perdido.
  const conLetra = claveComprobante({ cuit: '30558640355', numero: '0038-00002807', tipo: 'A' }).clave
  const sinLetra = claveComprobante({ cuit: '30558640355', numero: '0038-00002807', tipo: null }).clave
  assert.equal(conLetra, sinLetra)
})

// ═══ 3 · EL MISMO NÚMERO CON OTRO IMPORTE NO ES EL MISMO COMPROBANTE ═════════

const repoConRegistro = (fila) => ({ yaCargados: async () => new Map([['c:30549581710|0003-00004295', fila]]) })

test('CON-SEC ×3: el segundo comprobante con el mismo número y otro importe NO se rechaza', async () => {
  // Medido en la pestaña viva: `Con-Sec 00003-00004295` aparece TRES veces, con importes distintos
  // ($1.191.294,61 · $436.294,54 · $72.410,03). Con la clave sola, el segundo y el tercero se
  // rechazaban con un mensaje de éxito y el gasto no entraba a ningún lado.
  const items = [it({ cuit: '30549581710', numero: '0003-00004295', total: 436294.54, fecha: '05/08/2026', proveedor: 'Con-Sec' })]
  await marcarYaCargados(null, items, repoConRegistro({ fila: 700, total: 1191294.61, numero: '0003-00004295' }))
  assert.equal(items[0].yaCargado, undefined, 'no se da por cargado')
  assert.equal(items[0].registroOtroImporte.fila, 700, 'y se declara contra qué fila y con qué dato no coincide')
  assert.equal(items[0].registroOtroImporte.total, 1191294.61)
})

test('el mismo número con el MISMO importe sí se da por cargado', async () => {
  const items = [it({ cuit: '30549581710', numero: '0003-00004295', total: 1191294.61, fecha: '05/08/2026' })]
  await marcarYaCargados(null, items, repoConRegistro({ fila: 700, total: 1191294.61 }))
  assert.equal(items[0].yaCargado.fila, 700)
})

test('FAIL-CLOSED: si Compras no se pudo leer, el registro vuelve a mandar', async () => {
  // La duda la resuelve el destino. Sin destino no hay quién la resuelva, y entre preguntar de más y
  // duplicar un gasto se pregunta.
  const items = [it({ cuit: '30549581710', numero: '0003-00004295', total: 436294.54, fecha: '05/08/2026' })]
  await marcarYaCargados(null, items, repoConRegistro({ fila: 700, total: 1191294.61 }))
  marcarEnCompras(items, { ok: false, error: 'no pude leer la pestaña' })
  assert.equal(items[0].yaCargado.fila, 700, 'sin poder mirar Compras no se levanta el freno')
})

// ═══ 4 · DOS FOTOS DEL MISMO PAPEL, DOS LECTURAS DISTINTAS ═══════════════════

const TRIELEC_MAL = it(
  { cuit: '30558640355', proveedor: 'Trielec', numero: '0001-00002807', fecha: '12/08/2026', total: 220540034, neto: 177854866, iva: 37349522, otrosTributos: 5335646 },
  { origen: { fileId: 'a1', nombre: 'IMG_7573.jpg' }, escala: { n: 15, max: 508378.69 } })
const TRIELEC_BIEN = it(
  { cuit: '30558640355', proveedor: 'Trielec', numero: '0038-00002807', fecha: '12/08/2026', total: 2205400.34, neto: 1778548.66, iva: 373495.22, otrosTributos: 53356.46 },
  { origen: { fileId: 'a2', nombre: 'IMG_7573.HEIC' }, escala: { n: 15, max: 508378.69 } })

test('TRIELEC: de las dos lecturas del mismo papel gana la que se puede cargar, no la primera', () => {
  // El 14/08 el fajo abierto tenía el Trielec de $220.540.034 esperando un click, mientras el bueno
  // ($2.205.400,34) ya estaba en la fila 844. Un click de distancia de duplicar el gasto ×100.
  const { items } = colapsarRepetidos([TRIELEC_MAL, TRIELEC_BIEN], { ahora: AHORA })
  assert.equal(items.length, 1, 'las dos fotos son el mismo papel')
  assert.equal(items[0].comprobante.total, 2205400.34)
  assert.equal(items[0].comprobante.numero, '0038-00002807')
  assert.equal(items[0].copias.length, 1, 'la descartada se cuenta igual: ningún adjunto desaparece')
  assert.equal(items[0].lecturasDescartadas[0].total, 220540034, 'y se declara qué decía la otra lectura')
})

test('el orden en que llegan las fotos no cambia el resultado', () => {
  const { items } = colapsarRepetidos([TRIELEC_BIEN, TRIELEC_MAL], { ahora: AHORA })
  assert.equal(items.length, 1)
  assert.equal(items[0].comprobante.total, 2205400.34)
})

test('CLAVERO: tres lecturas del mismo ticket colapsan en una sola línea', () => {
  const foto = (numero, proveedor, id) => it(
    { cuit: '30549581710', proveedor, numero, fecha: '09/08/2026', total: 172002.26 },
    { origen: { fileId: id, nombre: 'IMG_7574.HEIC' }, proveedorNuevo: true })
  const { items } = colapsarRepetidos([
    foto('00016-00029784', 'AXION SERVICENTRO DEL VALLE', 'b1'),
    foto('0016-00029784', 'CLAVERO ROGELIO E HIJOS SOC DE HECHO', 'b2'),
    foto('00016-00029754', 'CLAVERO ROGELIO E HIJOS SOC. DE HECHO', 'b3'),
  ], { ahora: AHORA })
  assert.equal(items.length, 1, 'el dueño mandó UN ticket, no tres')
  assert.equal(items[0].comprobante.numero, '0016-00029784',
    'gana el número que dos lecturas independientes leyeron igual')
})

test('EL VETO: dos papeles distintos con el mismo nombre de archivo NO se fusionan', () => {
  // Es lo que impide perder un gasto. Si la fecha, el importe y el correlativo difieren los tres, son
  // dos comprobantes, por más que los dos archivos se llamen `image.jpg`.
  const uno = it({ cuit: '30111111119', proveedor: 'X', numero: '0001-00000001', fecha: '01/08/2026', total: 1000 },
    { origen: { fileId: 'c1', nombre: 'image.jpg' } })
  const otro = it({ cuit: '30111111119', proveedor: 'X', numero: '0001-00000002', fecha: '02/08/2026', total: 2000 },
    { origen: { fileId: 'c2', nombre: 'image.JPG' } })
  const { items } = colapsarRepetidos([uno, otro], { ahora: AHORA })
  assert.equal(items.length, 2, 'unir dos gastos distintos es peor que mostrar dos veces el mismo')
})

test('lo que el veto no unió se DECLARA: vino de la misma foto', () => {
  // Pinturería Córdoba: una lectura dijo $426.219,42 (la verdadera, la confirma ARCA) y la otra
  // $42.621.942 con otro CUIT, otro número y el año cambiado. No se fusionan —los tres datos duros
  // difieren— pero decirlo le ahorra al dueño ir a buscar la foto.
  const bien = it({ cuit: '30621517429', proveedor: 'Pintureria Cordoba', numero: '0042-00057984', fecha: '11/08/2026', total: 426219.42 },
    { origen: { fileId: 'd1', nombre: 'IMG_7576.HEIC' } })
  const mal = it({ cuit: '30716304663', proveedor: 'Pintureria Cordoba', numero: '0042-00393288', fecha: '11/08/2025', total: 42621942 },
    // La escala es la evidencia real que lo traba: $42,6M es 47× lo más grande que este proveedor
    // facturó nunca. Es lo que hace que este renglón exista en el mensaje.
    { origen: { fileId: 'd2', nombre: 'IMG_7576.jpg' }, escala: { n: 5, max: 902341.69 } })
  const { items } = colapsarRepetidos([bien, mal], { ahora: AHORA })
  assert.equal(items.length, 2)
  assert.equal(items[1].mismaFotoQue[0].total, 426219.42)
  // Y el mensaje lo dice, que es lo que le ahorra al dueño ir a mirar la foto.
  const r = rendicionDeAdjuntos({ fileIds: ['d1', 'd2'], items })
  assert.match(textoRendicion(r), /salió de la misma foto que Pintureria Cordoba \$426\.219, que sí entró/)
})

// ═══ 4 bis · «NO SÉ QUÉ COMPROBANTE QUEDÓ AFUERA» ═══════════════════════════

test('el adjunto que no entró se nombra por lo que dice el papel, no por el archivo', () => {
  // El mensaje que recibió el dueño decía, textual:
  //     ⚠ 1 no entró: IMG_7574.HEIC (falta saber quién es el proveedor)
  // Con eso no puede saber cuál es sin abrir el canal y mirar la foto — que es exactamente lo que
  // dijo que no puede hacer: «son muchos».
  const item = it(
    { proveedor: 'AXION SERVICENTRO DEL VALLE', cuit: null, numero: '00016-00029784', fecha: '09/08/2026', total: 172002.26 },
    { origen: { fileId: 'e1', nombre: 'IMG_7574.HEIC' }, proveedorNuevo: true })
  const r = rendicionDeAdjuntos({ fileIds: ['e1'], items: [item] })
  const texto = textoRendicion(r)
  assert.match(texto, /\$172\.002 del 09\/08/, 'el importe y la fecha son lo que le permite reconocerlo')
  assert.match(texto, /\(`IMG_7574\.HEIC`\)$/m, 'el archivo va al final, como referencia secundaria')
  assert.ok(!/^· `IMG_7574/m.test(texto), 'y nunca como identificación')
})

test('el que NO se pudo leer lo dice así, porque hay que sacar la foto de nuevo', () => {
  const r = rendicionDeAdjuntos({
    fileIds: ['e2'],
    problemas: [{ fileId: 'e2', nombre: 'IMG_7580.HEIC', error: 'no pude convertir el HEIC' }],
  })
  assert.match(textoRendicion(r), /· no pude leer ni el importe.*\(`IMG_7580\.HEIC`\)/)
})

test('VILLA DEL PINO: el punto de venta mal leído ya no se pregunta, se resuelve', () => {
  // La fila 841 dice `0001-00015751`, $99.998,98 del 12/08. La foto se leyó `0015-00015751`. Mismo
  // proveedor, mismo día, mismo importe al centavo y los mismos ocho dígitos: es ÉSE. Preguntarlo era
  // hacerle revisar un comprobante que el sistema ya sabía cuál era.
  const filas = [
    ...Array.from({ length: 837 }, () => []),
    filaCompras('12/8/2026', 'VILLA DEL PINO', 'F A', '0001-00015751', 'Administracion', 'Camion', 'Gasoil', '$ 99.998,98'),
  ]
  const r = buscarEnCompras(
    { proveedor: 'VILLA DEL PINO', cuit: '30714340677', numero: '0015-00015751', fecha: '12/08/2026', total: 99998.98 },
    { ok: true, ...indexarCompras(filas) })
  assert.equal(r.que, 'cargado', 'no es un "puede que sea": es ése')
  assert.equal(r.fila, 841)
  assert.match(r.via, /correlativo/)
})

test('el mismo día y el mismo importe SIN el correlativo sigue siendo una pregunta', () => {
  // Dos compras del mismo día por la misma plata al mismo proveedor existen. Sin el correlativo no
  // hay certeza, y la certeza es lo que separa cargar de duplicar.
  const filas = [
    ...Array.from({ length: 837 }, () => []),
    filaCompras('12/8/2026', 'VILLA DEL PINO', 'F A', '0001-00099999', 'Administracion', 'Camion', 'Gasoil', '$ 99.998,98'),
  ]
  const r = buscarEnCompras(
    { proveedor: 'VILLA DEL PINO', numero: '0015-00015751', fecha: '12/08/2026', total: 99998.98 },
    { ok: true, ...indexarCompras(filas) })
  assert.equal(r.que, 'probable')
})

// ═══ 4 ter · EL CUIT RESUELVE AL PROVEEDOR QUE EL PAPEL NO DEJÓ LEER ════════

test('el CUIT resuelve el proveedor contra el padrón cuando la pestaña no lo tiene', () => {
  // Caso real y recurrente: la factura trae la razón social del padrón («TRIELEC S A», medido en
  // `comprobantes_arca`) y el desplegable el nombre de fantasía («Trielec»). Sin el CUIT cargado a
  // mano en la pestaña `Proveedores`, el bot declaraba proveedor nuevo y frenaba.
  const listas = {
    ok: true,
    proveedores: ['Trielec', 'Combustibles Barcelo'],
    obras: ['Estrella'],
    // La pestaña NO tiene este CUIT; el padrón sí.
    porCuit: {},
    nombresPorCuit: new Map([['30558640355', ['TRIELEC S A']]]),
  }
  const item = armarItem({
    lectura: { emisor: 'TRIELEC SOCIEDAD ANONIMA COMERCIAL', cuit: '30558640355', letra: 'A', numero: '0038-00002807', fecha: '12/08/2026', total: '2.205.400,34' },
    listas,
    ahora: AHORA,
  })
  assert.equal(item.comprobante.proveedor, 'Trielec')
  assert.equal(item.proveedorNuevo, false)
})

test('un CUIT que ninguna fuente conoce sigue siendo un proveedor nuevo', () => {
  // No inventar sigue mandando: si nadie sabe quién es, se dice que no se sabe.
  const item = armarItem({
    lectura: { emisor: 'CLAVERO ROGELIO E HIJOS', cuit: '30549581710', letra: 'A', numero: '0016-00029784', fecha: '09/08/2026', total: '172.002,26' },
    listas: { ok: true, proveedores: ['Trielec'], obras: [], porCuit: {}, nombresPorCuit: new Map() },
    ahora: AHORA,
  })
  assert.equal(item.proveedorNuevo, true)
})

// ═══ 5 · ARCA TENÍA EL DATO BUENO Y EL COMPROBANTE SE FRENABA IGUAL ══════════

const FILA_ARCA_BARCELO = {
  emisor_cuit: '33708332599', emisor_nombre: 'COMBUSTIBLES BARCELO SRL',
  punto_venta: '103', numero: '3797', cae: '86327692337683', fecha_emision: '2026-08-10',
  imp_total: 100000.07, total_iva: 15008.72, neto_gravado: 71470.11,
}

test('BARCELO: el IVA verificado por ARCA manda sobre el que leyó el modelo', () => {
  // El modelo metió el impuesto interno del combustible adentro del IVA: leyó $27.183,14 donde el
  // libro fiscal dice $15.008,72. La suma CERRABA, así que la aritmética no tenía nada que decir,
  // pero el IVA daba el 38% del neto y el comprobante se frenaba pidiéndole al dueño que lo corrija
  // a mano — teniendo el dato correcto, del organismo, ya en memoria.
  const c = {
    cuit: '33708332599', proveedor: 'Combustibles Barcelo', numero: '0103-00003797',
    cae: '86327692337683', fecha: '10/08/2026', total: 100000.08, iva: 27183.14, neto: 71470.11,
    otrosTributos: 1346.83, esNotaCredito: false,
  }
  const r = conciliarConArca(c, [FILA_ARCA_BARCELO])
  assert.equal(r.estado, 'coincide')
  assert.equal(r.via, 'cae')
  const bloque = aplicarArca(c, r)
  assert.equal(c.iva, 15008.72, 'el IVA sale del libro fiscal')
  assert.equal(c.total, 100000.07)
  assert.equal(bloque.importesCorregidos.iva, 27183.14, 'y queda escrito qué se había leído')
  // Y con eso el comprobante deja de estar trabado.
  const item = { comprobante: c, leidoEn: AHORA.toISOString() }
  assert.deepEqual(faltantesDelChat(item, { ahora: AHORA }), [])
  assert.equal(estaCompleto(item, { ahora: AHORA }), true)
})

test('un comprobante SIN registro en ARCA no se toca', () => {
  const c = { cuit: '30558640355', numero: '0038-00002807', total: 2205400.34, iva: 373495.22 }
  const antes = { ...c }
  aplicarArca(c, conciliarConArca(c, []))
  assert.deepEqual(c, antes, 'no estar en ARCA es información, no una licencia para cambiar nada')
})

// ═══ 6 · UN DATO IMPOSIBLE SE RELEE ANTES DE PREGUNTAR ═══════════════════════

test('un IVA imposible dispara la segunda lectura en vez de frenar el comprobante', () => {
  // Antes esto se descubría cuando ya no se podía hacer nada más que preguntar. Es calculable sobre
  // el JSON crudo, cuando todavía se puede pedir otra lectura.
  const motivos = necesitaRevision({
    total: '5.223,36', numero: '0113-00010489', fecha: '04/08/2026',
    neto_gravado: '5.223,35', iva_21: '0,01', otros_tributos: '0',
    anotacion_manuscrita: 'Estrella',
  }, { ahora: AHORA })
  assert.ok(motivos.some((m) => /IVA leído no puede ser cierto/.test(m)))
})

test('una fecha imposible también', () => {
  const motivos = necesitaRevision({
    total: '5.223,36', numero: '0113-00010489', fecha: '05/12/2003',
    neto_gravado: '4.316,82', iva_21: '906,54', otros_tributos: '0',
    anotacion_manuscrita: 'Estrella',
  }, { ahora: AHORA })
  assert.ok(motivos.some((m) => /fecha leída no puede ser cierta/.test(m)))
})

test('una lectura sana NO gasta una segunda llamada', () => {
  const motivos = necesitaRevision({
    total: '36.460,30', numero: '0113-00010489', fecha: '05/08/2026',
    neto_gravado: '28.479,30', iva_21: '5.981,00', otros_tributos: '2.000,00',
    anotacion_manuscrita: 'Estrella',
  }, { ahora: AHORA })
  assert.deepEqual(motivos, [])
})
