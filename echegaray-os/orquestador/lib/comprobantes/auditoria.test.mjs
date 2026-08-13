// EL AUDITOR DE LO YA CARGADO. Sin red, sin Postgres, sin Sheet.
//
// El caso testigo es real y está documentado en `categoria.mjs`: la fila 840 —Rodamientos Cuyo,
// factura A 0012-00050057— quedó con Categoría `N`, o sea un gasto con factura registrado como si
// fuera en negro. Si este archivo no la agarra, el auditor no sirve.

import test from 'node:test'
import assert from 'node:assert/strict'
import { auditarCompras, informe, identidad, conciliarRegistro, DEFECTO, EN } from './auditoria.mjs'
import { auditar } from '../../scripts/auditar-comprobantes-cargados.mjs'

/** Arma una fila del rango `Compras!B4:O` a partir de sus columnas con nombre. */
function fila(o = {}) {
  const r = new Array(14).fill('')
  for (const [k, i] of Object.entries(EN)) if (o[k] != null) r[i] = o[k]
  return r
}

/** Una fila sana: factura A con número, aritmética que cierra, modalidad puesta, obra y detalle. */
const SANA = {
  categoria: 'B', fecha: '13/08/2026', proveedor: 'DUPEC', modalidad: 'Pago', tipo: 'F A',
  numero: '0004-00036542', unidad: 'Construcción', obra: 'MESSINA', detalle: 'Hormigón',
  concepto: 'Hormigón H21', importe: 100, iva: 21, total: 121,
}

/** El índice del rango → el número de fila del Sheet es índice + 4. */
const enFila = (n) => n - 4

function conFilas(mapa) {
  const alto = Math.max(...Object.keys(mapa).map(Number))
  const filas = new Array(enFila(alto) + 1).fill(null).map(() => fila())
  for (const [n, o] of Object.entries(mapa)) filas[enFila(Number(n))] = fila(o)
  return filas
}

test('LA FILA 840: factura A con número y Categoría N — el auditor la agarra y dice que va B', () => {
  const filas = conFilas({
    840: { ...SANA, proveedor: 'RODAMIENTOS CUYO', categoria: 'N', tipo: 'F A', numero: '0012-00050057' },
  })
  const r = auditarCompras(filas, { delBot: [840] })
  const h = r.hallazgos.find((x) => x.fila === 840 && x.defecto === DEFECTO.CATEGORIA)
  assert.ok(h, 'no detectó la categoría mal de la fila 840')
  assert.equal(h.dice, 'N')
  assert.equal(h.deberia, 'B')
  assert.equal(h.columna, 'B')
  assert.match(h.origen, /0012-00050057/)
  assert.equal(r.resumen[DEFECTO.CATEGORIA], 1)
})

test('SUELDOS, ARCA y SINDICATOS van B sin factura y NO son defecto: la regla no corre para los dos lados', () => {
  // Medido sobre el archivo real el 13/08: el lado "no hay comprobante ⇒ N" marcaba 163 filas y 145
  // eran obligaciones formales sin factura A/B/C —Sueldos, ARCA, SINDICATOS, Banco, FCL, SAC— que el
  // dueño marca B correctamente. B/N no es "¿hay papel?": es blanco o negro.
  const filas = conFilas({
    828: { ...SANA, proveedor: 'Sueldos', categoria: 'B', tipo: '', numero: '', concepto: 'Julio' },
    829: { ...SANA, proveedor: 'ARCA', categoria: 'B', tipo: '', numero: '', concepto: 'F931' },
    830: { ...SANA, proveedor: 'SINDICATOS', categoria: 'B', tipo: '', numero: '', concepto: 'UOCRA' },
  })
  const r = auditarCompras(filas, { delBot: [828, 829, 830] })
  assert.equal(r.hallazgos.filter((x) => x.defecto === DEFECTO.CATEGORIA).length, 0)
  // Y tampoco caen en `respaldo`: ninguno de esos proveedores emite comprobantes fiscales en la
  // pestaña, así que el criterio "este proveedor sí factura" los deja afuera solo.
  assert.equal(r.hallazgos.filter((x) => x.defecto === DEFECTO.RESPALDO).length, 0)
})

test('una fila B sin tipo ni número DE UN PROVEEDOR QUE SÍ FACTURA es falta de respaldo, no de categoría', () => {
  const filas = conFilas({
    800: { ...SANA, proveedor: 'Alumetal', tipo: 'F A', numero: '0038-00026005' },
    801: { ...SANA, proveedor: 'Alumetal', categoria: 'B', tipo: '', numero: '' },
  })
  const r = auditarCompras(filas, { delBot: [800, 801] })
  assert.equal(r.hallazgos.filter((x) => x.defecto === DEFECTO.CATEGORIA).length, 0)
  const h = r.hallazgos.find((x) => x.defecto === DEFECTO.RESPALDO)
  assert.ok(h, 'no marcó la falta de respaldo')
  assert.equal(h.fila, 801)
  assert.equal(h.columna, 'G/H')
  assert.match(h.origen, /emite comprobantes fiscales/)
})

test('una factura A SIN número se marca: sin número no hay idempotencia ni cruce con ARCA', () => {
  // La fila 669 real: Alumetal, F A, sin número, $18.166.380,84.
  const filas = conFilas({ 669: { ...SANA, proveedor: 'Alumetal', tipo: 'F A', numero: '' } })
  const h = auditarCompras(filas, { delBot: [669] }).hallazgos.find((x) => x.defecto === DEFECTO.RESPALDO)
  assert.ok(h)
  assert.equal(h.columna, 'H')
  assert.match(h.dice, /sin número/)
})

test('M ≠ Total − IVA se detecta con el número que debería decir', () => {
  const filas = conFilas({ 841: { ...SANA, importe: 121, iva: 21, total: 121 } })
  const h = auditarCompras(filas, { delBot: [841] }).hallazgos.find((x) => x.defecto === DEFECTO.ARITMETICA)
  assert.ok(h)
  assert.equal(h.columna, 'M')
  assert.equal(h.dice, 121)
  assert.equal(h.deberia, 100)
})

test('una diferencia de un peso NO se marca: es el redondeo del comprobante, no un error', () => {
  const filas = conFilas({ 841: { ...SANA, importe: 100.5, iva: 21, total: 121 } })
  assert.equal(auditarCompras(filas, { delBot: [841] }).hallazgos.filter((x) => x.defecto === DEFECTO.ARITMETICA).length, 0)
})

test('el DETALLE vacío NO se llena con el concepto: K es el destino en la obra, L es qué se compró', () => {
  // Medido sobre las 643 filas reales que tienen las dos columnas: K es igual a L en el 2%. La regla
  // que las igualaba producía 81 de los 82 hallazgos de detalle, y aplicarla habría envenenado el
  // vocabulario vivo de K con el que se resuelve la obra escrita a mano.
  const filas = conFilas({ 842: { ...SANA, detalle: '', concepto: 'Caño PVC 110 x 4m' } })
  const r = auditarCompras(filas, { delBot: [842] })
  assert.equal(r.hallazgos.filter((x) => x.defecto === DEFECTO.DETALLE).length, 0)
})

test('el DETALLE vacío SÍ se marca cuando el historial del proveedor en esa obra lo resuelve firme', () => {
  const mapa = {}
  for (let i = 0; i < 6; i++) mapa[800 + i] = { ...SANA, proveedor: 'DUPEC', obra: 'MESSINA', detalle: 'Galpon 9', concepto: '' }
  mapa[850] = { ...SANA, proveedor: 'DUPEC', obra: 'MESSINA', detalle: '', concepto: '' }
  const h = auditarCompras(conFilas(mapa), { delBot: [850] }).hallazgos.find((x) => x.defecto === DEFECTO.DETALLE)
  assert.ok(h, 'con seis cargas al mismo detalle el historial es firme')
  assert.equal(h.deberia, 'Galpon 9')
  assert.match(h.origen, /usó/)
})

test('el DETALLE vacío sin nada con qué llenarlo NO se marca: no se inventa una corrección', () => {
  const filas = conFilas({ 842: { ...SANA, detalle: '', concepto: '' } })
  assert.equal(auditarCompras(filas, { delBot: [842] }).hallazgos.filter((x) => x.defecto === DEFECTO.DETALLE).length, 0)
})

test('la OBRA vacía se marca sólo cuando el historial del proveedor la resuelve FIRME', () => {
  // Seis cargas del mismo proveedor a la misma obra, hechas por el dueño, y una del bot sin obra.
  const mapa = {}
  for (let i = 0; i < 6; i++) mapa[800 + i] = { ...SANA, proveedor: 'DUPEC', obra: 'MESSINA' }
  mapa[850] = { ...SANA, proveedor: 'DUPEC', obra: '' }
  const r = auditarCompras(conFilas(mapa), { delBot: [850] })
  const h = r.hallazgos.find((x) => x.defecto === DEFECTO.OBRA)
  assert.ok(h, 'con seis cargas a la misma obra el historial es firme y la obra vacía es un defecto')
  assert.equal(h.fila, 850)
  assert.equal(h.deberia, 'MESSINA')
  assert.match(h.origen, /6 de sus cargas/)
})

test('la OBRA vacía con historial repartido NO se marca: adivinarla imputa plata a la obra equivocada', () => {
  const mapa = {}
  for (let i = 0; i < 3; i++) mapa[800 + i] = { ...SANA, proveedor: 'X SA', obra: 'MESSINA', concepto: '' }
  for (let i = 0; i < 3; i++) mapa[810 + i] = { ...SANA, proveedor: 'X SA', obra: 'LA ESTRELLA', concepto: '' }
  mapa[850] = { ...SANA, proveedor: 'X SA', obra: '', concepto: '' }
  const r = auditarCompras(conFilas(mapa), { delBot: [850] })
  assert.equal(r.hallazgos.filter((x) => x.defecto === DEFECTO.OBRA).length, 0)
})

/** El libro fiscal como lo entrega `librofiscalPorCorrelativo`: correlativo → totales. */
const libro = (o) => new Map(Object.entries(o))

test('DUPLICADOS: sin libro fiscal no se afirma "duplicado" — se dice "a revisar"', () => {
  const filas = conFilas({
    838: { ...SANA, proveedor: 'DUPEC', tipo: 'F A', numero: '0004-00036542' },
    841: { ...SANA, proveedor: 'DUPEC', tipo: 'F A', numero: '0004-00036542' },
  })
  const r = auditarCompras(filas, { delBot: [838, 841] })
  const dup = r.hallazgos.filter((x) => x.defecto === DEFECTO.DUPLICADO)
  assert.equal(dup.length, 2)
  assert.match(dup[0].deberia, /revisar/)
  assert.match(dup[0].deberia, /838, 841/)
  assert.match(dup[0].origen, /no está en el libro fiscal/)
})

test('UNA FACTURA REPARTIDA ENTRE DOS OBRAS NO ES UN DUPLICADO: lo dice el libro fiscal', () => {
  // El caso real: Meglioli 0004-00000702, dos filas de $124.751 y el comprobante es de $249.502.
  // 13 de los 23 grupos que el auditor marcaba eran esto.
  const filas = conFilas({
    7: { ...SANA, proveedor: 'Meglioli', tipo: 'F A', numero: '0004-00000702', obra: 'San Francisco', importe: 103100, iva: 21651, total: 124751 },
    8: { ...SANA, proveedor: 'Meglioli', tipo: 'F A', numero: '0004-00000702', obra: 'ARCOR', importe: 103100, iva: 21651, total: 124751 },
  })
  const r = auditarCompras(filas, { delBot: [7, 8], totalesFiscales: libro({ '00000702': [249502] }) })
  assert.equal(r.hallazgos.filter((x) => x.defecto === DEFECTO.DUPLICADO).length, 0)
  assert.equal(r.repartos.length, 1, 'el reparto se declara, no se traga en silencio')
  assert.deepEqual(r.repartos[0].filas, [7, 8])
})

test('DUPLICADO CONFIRMADO: cada fila lleva el total entero del comprobante', () => {
  // El caso real: Ferretec 0008-00000333, cargada en febrero y otra vez en julio. $15.883,73 de más.
  const filas = conFilas({
    108: { ...SANA, proveedor: 'Ferretec', tipo: 'F A', numero: '0008-00000333', importe: 13127.05, iva: 2757, total: 15883.73 },
    722: { ...SANA, proveedor: 'Ferretec', tipo: 'F A', numero: '0008-00000333', importe: 13127, iva: 2757, total: 15883.73 },
  })
  const r = auditarCompras(filas, { delBot: [108, 722], totalesFiscales: libro({ '00000333': [15883.73] }) })
  const dup = r.hallazgos.filter((x) => x.defecto === DEFECTO.DUPLICADO)
  assert.equal(dup.length, 2)
  assert.match(dup[0].deberia, /una sola fila/)
  assert.match(dup[0].origen, /se contó de más/)
  assert.equal(r.repartos.length, 0)
})

test('la fila SIN importes que repite una identidad se marca aunque el reparto cierre', () => {
  // El caso real 743/773: la 743 tiene obra, detalle y concepto, y ningún importe.
  const filas = conFilas({
    743: { ...SANA, proveedor: 'La Aguilana', tipo: 'F A', numero: '00003-00000013', importe: '', iva: '', total: '' },
    773: { ...SANA, proveedor: 'La Aguilana', tipo: 'F A', numero: '00003-00000013', importe: 619987, iva: 130197, total: 750184.61 },
  })
  const dup = auditarCompras(filas, { delBot: [743, 773], totalesFiscales: libro({ '00000013': [750184.61] }) })
    .hallazgos.filter((x) => x.defecto === DEFECTO.DUPLICADO)
  assert.deepEqual(dup.map((h) => h.fila), [743], 'sólo la fila fantasma; la que tiene los importes no sobra')
  assert.match(dup[0].deberia, /borrar la fila/)
})

test('el SIGNO parte la clave: una nota de crédito con el mismo número NO es un duplicado', () => {
  assert.notEqual(
    identidad({ proveedor: 'DUPEC', tipo: 'A', numero: '0004-00036542', total: 121 }),
    identidad({ proveedor: 'DUPEC', tipo: 'NC', numero: '0004-00036542', total: -121 }))
})

test('sin número no hay identidad: dos gastos sueltos no se unen', () => {
  assert.equal(identidad({ proveedor: 'DUPEC', total: 100 }), null)
})

test('MODALIDAD vacía o fuera del desplegable se marca', () => {
  const filas = conFilas({
    841: { ...SANA, modalidad: '' },
    842: { ...SANA, modalidad: '30 DIAS FECHA FACTURA' },
  })
  const m = auditarCompras(filas, { delBot: [841, 842] }).hallazgos.filter((x) => x.defecto === DEFECTO.MODALIDAD)
  assert.equal(m.length, 2)
  assert.equal(m[0].columna, 'F')
})

test('TIPO: un número de comprobante fiscal sin letra en G se marca', () => {
  const filas = conFilas({ 843: { ...SANA, categoria: 'N', tipo: '', numero: '0012-00050057' } })
  const h = auditarCompras(filas, { delBot: [843] }).hallazgos.find((x) => x.defecto === DEFECTO.TIPO)
  assert.ok(h)
  assert.equal(h.columna, 'G')
})

test('TIPO: un punto de venta de CINCO dígitos también se mira — se escapaban por el canónico', () => {
  const filas = conFilas({ 684: { ...SANA, proveedor: 'Combustibles Barcelo', tipo: '', numero: '00123-00021485' } })
  assert.ok(auditarCompras(filas, { delBot: [684] }).hallazgos.find((x) => x.defecto === DEFECTO.TIPO))
})

test('TIPO: lo que NO tiene forma de comprobante fiscal en la celda no se reclama', () => {
  // `numeroCanonico` le da forma `0000-00000000` a cualquier cosa: el plan de pagos de ARCA
  // «W303094 C1-1V» salía `0001-00000001` (enganchaba el «1-1») y la factura de Google
  // «5472332541» salía `0054-72332541`. Siete de diecisiete hallazgos de tipo eran eso.
  const filas = conFilas({
    725: { ...SANA, proveedor: 'ARCA', tipo: 'N/A', numero: 'W303094 C1-1V' },
    839: { ...SANA, proveedor: 'Google', tipo: '', numero: '5640188724' },
    437: { ...SANA, proveedor: 'SINDICATOS', tipo: '', numero: '5666708' },
  })
  const r = auditarCompras(filas, { delBot: [725, 839, 437] })
  assert.equal(r.hallazgos.filter((x) => x.defecto === DEFECTO.TIPO).length, 0)
})

test('SÓLO se auditan las filas del bot: lo que cargó el dueño a mano no se toca', () => {
  const filas = conFilas({
    500: { ...SANA, categoria: 'N', tipo: 'F A', numero: '0001-00000001' },  // del dueño, mal, no se marca
    841: { ...SANA, categoria: 'N', tipo: 'F A', numero: '0002-00000002' },  // del bot, mal, sí se marca
  })
  const r = auditarCompras(filas, { delBot: [841] })
  assert.deepEqual([...new Set(r.hallazgos.map((h) => h.fila))], [841])
  assert.equal(r.filasDelBot, 1)
  assert.match(r.alcance, /cargadas por el bot/)
})

test('sin registro del bot se auditan todas Y SE DECLARA — no se lee el silencio como "no cargó nada"', () => {
  const filas = conFilas({ 500: { ...SANA, categoria: 'N', tipo: 'F A', numero: '0001-00000001' } })
  const r = auditarCompras(filas, { delBot: null })
  assert.match(r.alcance, /TODAS las filas/)
  assert.ok(r.hallazgos.length > 0)
})

test('una pestaña sana no inventa hallazgos', () => {
  const mapa = {}
  for (let i = 0; i < 8; i++) mapa[800 + i] = { ...SANA, numero: `0004-0000000${i}` }
  const r = auditarCompras(conFilas(mapa), { delBot: Object.keys(mapa).map(Number) })
  assert.deepEqual(r.hallazgos, [])
  assert.match(informe(r), /No se encontró ningún defecto/)
})

// ── LA PRUEBA DE QUE NO ESCRIBE ──────────────────────────────────────────────
//
// No alcanza con leer el código y afirmarlo: se le pasa un cliente de Google que EXPLOTA ante
// cualquier método que no sea `readSheetValues`, y una base que explota ante cualquier consulta que
// no sea un `select`. Si algún día alguien agrega una escritura "para arreglarlo de una", este test
// se pone rojo antes de que llegue al Sheet real.

function googleQueSoloLee(filas) {
  return new Proxy({
    readSheetValues: async () => filas,
  }, {
    get(t, k) {
      if (k in t) return t[k]
      if (typeof k === 'symbol') return undefined
      throw new Error(`el auditor intentó usar google.${String(k)} — SÓLO puede leer`)
    },
  })
}

test('el auditor NO escribe: cualquier método de Google que no sea leer explota', async () => {
  const filas = conFilas({ 840: { ...SANA, categoria: 'N', tipo: 'F A', numero: '0012-00050057' } })
  const consultas = []
  const port = {
    query: async (sql) => {
      if (!/^\s*select/i.test(sql)) throw new Error(`el auditor intentó escribir en Postgres: ${sql.slice(0, 60)}`)
      consultas.push(sql)
      // Dos lecturas y sólo dos: el registro del bot y el libro fiscal de ARCA.
      return /comprobantes_arca/.test(sql)
        ? { rows: [] }
        : { rows: [{ clave: 'c:1', proveedor: 'DUPEC', tipo: 'A', numero: '0012-00050057', total: 121, fila: 840 }] }
    },
  }
  const r = await auditar({ google: googleQueSoloLee(filas), port })
  assert.equal(r.filasDelBot, 1)
  assert.ok(r.hallazgos.some((h) => h.fila === 840 && h.defecto === DEFECTO.CATEGORIA))
  assert.equal(consultas.length, 2)
  assert.ok(consultas.some((s) => /comprobantes_arca/.test(s)), 'el libro fiscal es el árbitro de los duplicados: si no se consulta, no se puede afirmar ninguno')
})

test('si la base no contesta, el auditor sigue y lo declara en el alcance', async () => {
  const filas = conFilas({ 840: { ...SANA, proveedor: 'RODAMIENTOS CUYO', categoria: 'N', tipo: 'F A', numero: '0012-00050057' } })
  const port = { query: async () => { throw new Error('sin base') } }
  const r = await auditar({ google: googleQueSoloLee(filas), port })
  assert.match(r.alcance, /TODAS las filas/)
})

// ── EL REGISTRO DEL BOT MIENTE SOBRE LA FILA, Y ESO TAMBIÉN ES UN HALLAZGO ───
//
// Medido contra el archivo el 13/08: el registro decía que la fila 811 era Alumetal por $201.494.007
// y la 811 es RSV por $67.797,51; y DOS comprobantes distintos reclamaban la fila 840. La `fila` es
// informativa por diseño (lo dice la migración) y envejece cuando el dueño inserta o borra filas. Un
// auditor que le creyera auditaría la fila equivocada y le atribuiría al bot defectos ajenos.

test('la fila se RE-RESUELVE contra el archivo: el registro que apunta a otra fila se reporta', () => {
  const filas = conFilas({
    811: { ...SANA, proveedor: 'RSV', numero: '0011-00087469', concepto: '' },
    815: { ...SANA, proveedor: 'ALUMETAL', numero: '0036-00025942', concepto: '' },
  })
  const r = auditarCompras(filas, {
    registro: [{ clave: 'c:a', proveedor: 'ALUMETAL', tipo: 'A', numero: '0036-00025942', total: 121, fila: 811 }],
  })
  const h = r.hallazgos.find((x) => x.defecto === DEFECTO.REGISTRO)
  assert.ok(h, 'no detectó que el registro apunta a una fila que tiene otro comprobante')
  assert.equal(h.fila, 815)
  assert.match(h.dice, /fila 811/)
  assert.match(h.deberia, /fila 815/)
  // Y se audita la fila DONDE ESTÁ, no la que dice el registro.
  assert.deepEqual([...new Set(r.hallazgos.map((x) => x.fila))], [815])
})

test('registrado como cargado y NO está en Compras: el registro bloquea un gasto que no entró', () => {
  const filas = conFilas({ 811: { ...SANA, proveedor: 'RSV', numero: '0011-00087469', concepto: '' } })
  const r = auditarCompras(filas, {
    registro: [{ clave: 'c:a', proveedor: 'ALUMETAL', tipo: 'A', numero: '0036-00025942', total: 121, fila: 900 }],
  })
  const h = r.hallazgos.find((x) => x.defecto === DEFECTO.REGISTRO)
  assert.match(h.deberia, /no está en Compras/)
  assert.match(h.origen, /bloquea volver a cargarlo/)
})

test('una RESERVA sin fila se separa en dos casos opuestos: entró o no entró', () => {
  const filas = conFilas({ 820: { ...SANA, proveedor: 'ALUMETAL', numero: '0038-00026005', concepto: '' } })
  const r = auditarCompras(filas, {
    registro: [
      { clave: 'c:a', proveedor: 'ALUMETAL', tipo: 'A', numero: '0038-00026005', total: 121, fila: null },
      { clave: 'c:b', proveedor: 'GOOGLE', tipo: null, numero: '0056-40188724', total: 37.93, fila: null },
    ],
  })
  const res = r.hallazgos.filter((x) => x.defecto === DEFECTO.RESERVA)
  assert.equal(res.length, 2)
  assert.ok(res.some((x) => /SÍ está en Compras/.test(x.origen)), 'no distinguió la reserva que sí entró')
  assert.ok(res.some((x) => /no está en Compras/.test(x.origen)), 'no distinguió la reserva huérfana')
})

test('el punto de venta leído distinto no convierte un comprobante en desaparecido', () => {
  // El registro guardó 0001-00015177 y la celda dice 00015-00015177: el mismo papel.
  const filas = conFilas({ 812: { ...SANA, proveedor: 'VILLA DEL PINO', numero: '00015-00015177', concepto: '' } })
  const r = auditarCompras(filas, {
    registro: [{ clave: 'c:v', proveedor: 'VILLA DEL PINO', tipo: 'A', numero: '0001-00015177', total: 121, fila: 812 }],
  })
  assert.equal(r.hallazgos.filter((x) => x.defecto === DEFECTO.REGISTRO).length, 0)
  assert.equal(conciliarRegistro(
    [{ proveedor: 'VILLA DEL PINO', numero: '0001-00015177', total: 121, fila: 812 }],
    filas.map((f, i) => ({ ...registroDeFilaTest(f, i) })).filter((x) => x.proveedor))[0].estado, 'ok')
})

/** Igual que `registroDeFila`, importado aparte para no exportar de más desde el test. */
function registroDeFilaTest(f, i) {
  return { fila: i + 4, proveedor: String(f?.[EN.proveedor] ?? '').trim() || null, numero: String(f?.[EN.numero] ?? '').trim() || null, total: 121 }
}
