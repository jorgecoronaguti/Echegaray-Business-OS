// LOS DEFECTOS QUE LA AUDITORÍA DE CIERRE RECHAZÓ EL 14/08. Cada test nombra el suyo.
//
// Todos son de NÚCLEO PURO: sin red, sin Postgres, sin Sheet. Lo que se prueba es el defecto, no el
// arreglo — revertir cualquiera de los seis cambios pone uno de estos en rojo.

import test from 'node:test'
import assert from 'node:assert/strict'
import { filaModeloDeFormulas, letraDeIndice, valoresInput, GRUPOS_FORMULA, COL } from '../carga-comprobantes.mjs'
import { conMarcaDeOrigen, sinMarcaDeOrigen, dimensionesInferidas, tieneMarcaDeOrigen } from './marca-origen.mjs'
import { completarUno } from './imputacion-historial.mjs'
import { perfilesDeImputacion, palabrasConcepto } from '../imputacion-aprendida.mjs'
import { descalces, avisoDescalces, anotarDescalces, tituloDescalce, vigilar } from './vigilancia.mjs'
import { revisarFilasEscritas, debeAgregarProveedores } from '../../scripts/cargar-comprobantes-compras.mjs'
import { testConBotones } from './botones-de-prueba.mjs'
import { botonesActivos } from './fajo.mjs'

// ════════════════════════════════════════════════════════════════════════════
// 1 · PASTE_FORMULA COPIA DESDE LA ÚLTIMA FILA, Y 408 DE 842 TIENEN LA O PEGADA
// ════════════════════════════════════════════════════════════════════════════

/** Una fila de grilla con fórmula en todas las columnas de `GRUPOS_FORMULA`. */
function filaConFormulas(salvo = []) {
  const f = []
  for (const [a, b] of GRUPOS_FORMULA) {
    for (let i = colIdx(a); i <= colIdx(b); i++) f[i] = { formula: '=A1', valor: '1' }
  }
  for (const L of salvo) f[colIdx(L)] = { formula: null, valor: '123456,78' }
  return f
}
const colIdx = (L) => { let n = 0; for (const c of L) n = n * 26 + (c.charCodeAt(0) - 64); return n - 1 }

test('la fila modelo NO es la última: si la última tiene la O pegada a mano, se busca más arriba', () => {
  // Las filas 741, 742 y 743 de la vida real: la 743 es la última con datos y su columna O es un
  // literal. Copiar de ahí con PASTE_FORMULA baja el TOTAL DE OTRA FACTURA a las filas nuevas.
  const filas = [filaConFormulas(), filaConFormulas(), filaConFormulas(['O'])]
  const r = filaModeloDeFormulas(filas, { desde: 741 })
  assert.equal(r.fila, 742, 'copió de la fila con el literal en O')
})

test('cuando la última fila SÍ tiene todas las fórmulas, se usa esa', () => {
  const filas = [filaConFormulas(['O']), filaConFormulas()]
  assert.equal(filaModeloDeFormulas(filas, { desde: 800 }).fila, 801)
})

test('sin ninguna fila con fórmulas NO se degrada a copiar un literal: se declara cuál falta', () => {
  const r = filaModeloDeFormulas([filaConFormulas(['O']), filaConFormulas(['O', 'Y'])], { desde: 10 })
  assert.equal(r.fila, null, 'eligió una fila sin fórmula: bajaría un número falso')
  assert.deepEqual(r.faltan.sort(), ['O', 'Y'], 'no dice qué columna falta y nadie sabe qué arreglar')
})

test('una fila más corta que el ancho de las fórmulas no cuenta como modelo', () => {
  // `readSheetGrid` devuelve las filas recortadas en la última celda con contenido: una fila corta
  // NO tiene fórmula en AH/AI, y tratarla como modelo dejaría esas columnas sin estampar.
  assert.equal(filaModeloDeFormulas([[{ formula: '=1' }]], { desde: 4 }).fila, null)
})

test('letraDeIndice es la inversa exacta de colIndice en el rango que se usa', () => {
  for (const L of ['A', 'D', 'O', 'Q', 'Y', 'AA', 'AH', 'AI', 'AJ']) {
    assert.equal(letraDeIndice(colIdx(L)), L)
  }
})

// ════════════════════════════════════════════════════════════════════════════
// 2 · UN NÚMERO EQUIVOCADO NO ES UN #ERROR: EL CONTROL DE ARITMÉTICA EN LOS DOS CAMINOS
// ════════════════════════════════════════════════════════════════════════════

/** Una fila releída de `Compras!A..AD` con los importes puestos. Índices: M=12, N=13, O=14, AC=28. */
function filaLeida({ importe, iva, total, rubro = 'Materiales' }) {
  const f = new Array(29).fill(null).map(() => ({ valor: '' }))
  f[0] = { valor: 'C-844' }
  f[4] = { valor: 'Alumetal' }
  f[12] = { valor: importe }
  f[13] = { valor: iva }
  f[14] = { valor: total }
  f[28] = { valor: rubro }
  return f
}

test('EL DEFECTO: la O bajó como literal de otra factura y no hay ni un #ERROR', () => {
  // Importe + IVA = 1.000.000, y el Total dice 2.014.940,07 porque PASTE_FORMULA copió el número de
  // la factura de arriba. Buscar #ERROR devuelve 0: la fila se ve perfecta y está mal.
  const r = revisarFilasEscritas([filaLeida({ importe: '826.446,28', iva: '173.553,72', total: '2.014.940,07' })], { desde: 844 })
  assert.equal(r.errores, 0, 'no hay #ERROR, y ése es exactamente el punto')
  assert.equal(r.noCierran.length, 1, 'el control de aritmética no vio el total de otra factura')
  assert.equal(r.noCierran[0].fila, 844)
})

test('cuando la aritmética cierra, no se inventa un hallazgo', () => {
  const r = revisarFilasEscritas([filaLeida({ importe: '30.479,30', iva: '5.981,00', total: '36.460,30' })], { desde: 845 })
  assert.deepEqual(r.noCierran, [])
  assert.equal(r.sinRubro, 0)
})

test('la fila sin Rubro de caja se cuenta aparte: es informativo, no un defecto de plata', () => {
  const r = revisarFilasEscritas([filaLeida({ importe: '100', iva: '21', total: '121', rubro: '' })], { desde: 846 })
  assert.equal(r.sinRubro, 1)
  assert.deepEqual(r.noCierran, [])
})

test('el #ERROR se sigue viendo: los dos controles son de efectos distintos', () => {
  const f = filaLeida({ importe: '100', iva: '21', total: '121' })
  f[14] = { valor: '#REF!' }
  const r = revisarFilasEscritas([f], { desde: 847 })
  assert.equal(r.errores, 1)
})

// ════════════════════════════════════════════════════════════════════════════
// 3 · `nuevos.size` SOBRE UN ARRAY — LA BANDERA MUERTA
// ════════════════════════════════════════════════════════════════════════════

test('EL DEFECTO: `--add-proveedores` con un ARRAY de nuevos tiene que entrar', () => {
  // `prepararPlan` devuelve `nuevos: [...set]`. Con `nuevos.size` esto daba undefined → falsy, y la
  // bandera no agregaba nada NI AVISABA, mientras el proveedor sí se escribía en la columna E, que
  // tiene validación estricta: celda en rojo y fuera del vocabulario de los cruces.
  assert.equal(debeAgregarProveedores(true, ['ALUMETAL S.A.']), true)
  assert.equal(['ALUMETAL S.A.'].size, undefined, 'un array no tiene .size — de ahí salía el falsy')
})

test('sin la bandera no se toca el desplegable del dueño, y sin nuevos tampoco', () => {
  assert.equal(debeAgregarProveedores(false, ['X']), false)
  assert.equal(debeAgregarProveedores(true, []), false)
  assert.equal(debeAgregarProveedores(true, null), false)
})

// ════════════════════════════════════════════════════════════════════════════
// 4 · LA IMPUTACIÓN INFERIDA SE ESCRIBÍA COMO SI FUERA DATO
// ════════════════════════════════════════════════════════════════════════════

/** Historia con la que el perfil de un proveedor queda FIRME (n≥5 y ≥80% en la misma obra). */
const HISTORIA = Array.from({ length: 8 }, () => ({
  proveedor: 'Combustibles Barcelo', unidad_negocio: 'Obras', obra_texto: 'San Francisco',
  detalle: 'Civil', concepto: 'gasoil autoelevador', categoria: 'B',
}))

test('EL DEFECTO: la obra deducida del promedio quedaba indistinguible de la escrita en el papel', () => {
  const perfiles = perfilesDeImputacion(HISTORIA)
  const c = { proveedor: 'Combustibles Barcelo', concepto: 'gasoil', total: 36460.3 }
  const { aplicado } = completarUno(c, perfiles)
  assert.equal(c.obra, 'San Francisco')
  assert.equal(c.obraVia, 'historial', 'sin la vía no hay de dónde sacar la marca')
  assert.ok(aplicado.obra?.n >= 5)
  // Y la marca LLEGA A LA CELDA: la columna L la escribe `valoresInput`, no un comentario del código.
  const v = valoresInput({ ...c, fecha: '05/01/2026', total: 36460.3 })
  assert.match(v[COL.concepto], /\[historial: obra/, 'la celda no dice que la imputación se dedujo')
})

test('lo escrito a mano en el papel MANDA: no se marca lo que no se dedujo', () => {
  const perfiles = perfilesDeImputacion(HISTORIA)
  const c = { proveedor: 'Combustibles Barcelo', concepto: 'gasoil', obra: 'Messina', total: 100 }
  completarUno(c, perfiles)
  assert.equal(c.obra, 'Messina', 'el historial pisó la decisión del dueño sobre ESE gasto')
  assert.equal(c.obraVia, undefined)
  // La marca sí aparece —el detalle y la unidad SÍ salieron del historial— pero NO nombra la obra:
  // decir «obra por historial» sobre una obra que escribió el dueño sería mentir al revés.
  const v = valoresInput({ ...c, fecha: '05/01/2026' })
  assert.equal(tieneMarcaDeOrigen(v[COL.concepto]), true)
  assert.doesNotMatch(v[COL.concepto], /historial:[^\]]*obra/, 'marcó como inferida una obra del papel')
})

test('si NADA se dedujo, la fila no lleva marca: la marca significa algo cuando está', () => {
  const perfiles = perfilesDeImputacion(HISTORIA)
  const c = {
    proveedor: 'Combustibles Barcelo', concepto: 'gasoil', total: 100,
    obra: 'Messina', detalleObra: 'Techos', unidad: 'Obras', categoria: 'B',
  }
  completarUno(c, perfiles)
  const v = valoresInput({ ...c, fecha: '05/01/2026' })
  assert.equal(v[COL.concepto], 'gasoil')
})

test('LA COLUMNA K SE LLAMA DISTINTO EN CADA VÍA: no se unifica adivinando', () => {
  // En el comprobante del CHAT, `detalle` es el desglose del IVA —`{iva21, iva105}`— y la columna K
  // se llama `detalleObra`. El primer intento de unificar escribía los dos nombres: leía el objeto
  // del IVA como «K ya está resuelta» y NUNCA imputaba el detalle, además de pisar el desglose.
  const perfiles = perfilesDeImputacion(HISTORIA)
  const delChat = { proveedor: 'Combustibles Barcelo', concepto: 'gasoil', total: 100, detalle: { iva21: 5981 } }
  completarUno(delChat, perfiles)
  assert.equal(delChat.detalleObra, 'Civil', 'el desglose del IVA se leyó como si fuera la columna K')
  assert.deepEqual(delChat.detalle, { iva21: 5981 }, 'le escribió texto al desglose del IVA')

  // En el `fajo.json` del cargador, la columna K SÍ se llama `detalle`, y el que llama lo declara.
  const delCargador = { proveedor: 'Combustibles Barcelo', concepto: 'gasoil', total: 100 }
  completarUno(delCargador, perfiles, { campoDetalle: 'detalle' })
  assert.equal(delCargador.detalle, 'Civil')
  assert.equal(delCargador.detalleVia, 'historial')
})

test('un proveedor sin historia no recibe imputación ni marca: se pregunta, no se adivina', () => {
  const perfiles = perfilesDeImputacion([{ proveedor: 'Nuevo SRL', obra_texto: 'X', concepto: 'algo' }])
  const c = { proveedor: 'Nuevo SRL', concepto: 'algo', total: 10 }
  const { aplicado } = completarUno(c, perfiles)
  assert.deepEqual(aplicado, {})
  assert.equal(c.obra, undefined)
})

test('la marca nombra QUÉ dimensión se dedujo, y es idempotente', () => {
  assert.equal(conMarcaDeOrigen('cemento x 30', ['obra']), 'cemento x 30 [historial: obra]')
  assert.equal(conMarcaDeOrigen('cemento x 30', ['obra', 'detalle']), 'cemento x 30 [historial: obra, detalle]')
  // Volver a marcar no apila marcas: la fila se puede reescribir sin ensuciarse.
  const una = conMarcaDeOrigen('cemento', ['obra'])
  assert.equal(conMarcaDeOrigen(una, ['obra', 'unidad']), 'cemento [historial: obra, unidad]')
  assert.equal(conMarcaDeOrigen('cemento', []), 'cemento', 'marcó una fila que salió entera del papel')
})

test('la marca NO envenena el aprendizaje: no entra al bag de palabras del concepto', () => {
  // Si entrara, «historial» y «detalle» aparecerían en todas las obras de todos los proveedores
  // marcados y `refinarObraPorConcepto` perdería filo — el OS aprendería de su propio metadato.
  const palabras = palabrasConcepto('gasoil autoelevador [historial: obra, detalle]')
  assert.deepEqual(palabras, ['gasoil', 'autoelevador'])
  assert.equal(sinMarcaDeOrigen('[historial: obra]'), null, 'un concepto que era sólo marca deja de ser null')
})

test('dimensionesInferidas sólo cuenta el historial: elegir o leer no es inferir', () => {
  assert.deepEqual(dimensionesInferidas({ obraVia: 'historial', detalleVia: 'eleccion' }), ['obra'])
  assert.deepEqual(dimensionesInferidas({ obraVia: 'manuscrita', unidadVia: 'historial' }), ['unidad'])
})

// ════════════════════════════════════════════════════════════════════════════
// 5 · EL CONTROL QUE EXISTE Y NADIE DISPARA
// ════════════════════════════════════════════════════════════════════════════

/** El caso real del 14/08: Alumetal figura cargada en la fila 840 y en Compras no está. */
const ALUMETAL = {
  clave: 'c:30712345678|A|0031-00002661', proveedor: 'Alumetal', numero: '0031-00002661',
  total: -1095076.13, filaRegistrada: 840, filaReal: null, estado: 'no_esta',
}
const MOVIDA = {
  clave: 'c:1|A|0001-00000797', proveedor: 'RSV', numero: '0001-00000797',
  total: 67797.51, filaRegistrada: 811, filaReal: 797, estado: 'fila_movida',
}

test('EL DEFECTO VIVO: el comprobante registrado que no está en Compras se detecta y se cuantifica', () => {
  const d = descalces({ conciliado: [ALUMETAL, MOVIDA, { estado: 'ok', clave: 'z' }] })
  assert.equal(d.disponible, true)
  assert.equal(d.sinGasto.length, 1, 'no separó la plata del rastro')
  assert.equal(d.sinRastro.length, 1)
  assert.equal(Math.round(d.plata), 1095076, 'el importe en juego no llega al aviso')
})

test('sin registro NO se afirma que no hay descalces: "no pude mirar" ≠ "no hay"', () => {
  const d = descalces({})
  assert.equal(d.disponible, false)
  assert.equal(d.total, 0)
})

test('el aviso dice la plata y separa lo que cuesta dinero de lo que cuesta trazabilidad', () => {
  const a = avisoDescalces(descalces({ conciliado: [ALUMETAL, MOVIDA] }), { nuevos: 2 })
  assert.match(a, /NO están en Compras/)
  assert.match(a, /1\.095\.076/, 'el aviso no dice cuánta plata hay en juego')
  assert.match(a, /apuntan a otra fila/, 'mezcló el descalce de rastro con el de plata')
  assert.equal(avisoDescalces(descalces({ conciliado: [{ estado: 'ok' }] })), null, 'habla cuando no hay nada que decir')
})

test('el título del descalce lleva la CLAVE y no la fila: la fila es lo que está en discusión', () => {
  assert.match(tituloDescalce(ALUMETAL), /c:30712345678/)
  assert.equal(tituloDescalce(ALUMETAL), tituloDescalce({ ...ALUMETAL, filaRegistrada: 999 }))
})

test('anotar es idempotente: correrlo dos veces no produce dos ítems de backlog', async () => {
  const insertados = []
  const abiertos = new Set()
  const port = {
    query: async (sql, p) => {
      if (/select id from public.backlog_autonomo/.test(sql)) {
        return { rows: abiertos.has(p[0]) ? [{ id: 1 }] : [] }
      }
      insertados.push(p[0]); abiertos.add(p[0]); return { rows: [] }
    },
  }
  const primera = await anotarDescalces(port, [ALUMETAL, MOVIDA])
  assert.equal(primera.anotados, 2)
  const segunda = await anotarDescalces(port, [ALUMETAL, MOVIDA])
  assert.equal(segunda.anotados, 0)
  assert.equal(segunda.yaEstaban, 2)
  assert.equal(insertados.length, 2)
})

test('el impacto es ALTA cuando hay plata en juego y MEDIA cuando sólo falla el rastro', async () => {
  const vistos = []
  const port = {
    query: async (sql, p) => {
      if (/select id from/.test(sql)) return { rows: [] }
      vistos.push({ titulo: p[0], impacto: p[3] }); return { rows: [] }
    },
  }
  await anotarDescalces(port, [ALUMETAL, MOVIDA])
  assert.equal(vistos[0].impacto, 'alta')
  assert.equal(vistos[1].impacto, 'media')
})

test('si la base no contesta, el descalce SIGUE avisándose: se degrada el registro, no la detección', async () => {
  const port = { query: async () => { throw new Error('no such table') } }
  const r = await vigilar({ auditar: async () => ({ conciliado: [ALUMETAL] }), port })
  assert.equal(r.ok, true)
  assert.match(r.aviso, /NO están en Compras/)
  assert.equal(r.resumen.anotados, null, 'dijo que anotó cuando no pudo')
})

test('la vigilancia NUNCA lanza: que el auditor falle no puede tumbar la carga que la disparó', async () => {
  const r = await vigilar({ auditar: async () => { throw new Error('Google 500') }, port: null })
  assert.equal(r.ok, false)
  assert.equal(r.aviso, null)
  assert.match(r.motivo, /Google 500/)
})

// ════════════════════════════════════════════════════════════════════════════
// 6 · LAS COLUMNAS DE ARRAYFORMULA, DECLARADAS Y NO SUPUESTAS
// ════════════════════════════════════════════════════════════════════════════

/** AC rubro de caja · AD fecha de caja · AE familia · AF sub-rubro · AJ ¿comercial? */
const PROHIBIDAS = ['AC', 'AD', 'AE', 'AF', 'AJ']

test('ninguna columna de ARRAYFORMULA está en los grupos que se estampan por copyPaste', () => {
  // Es la mitad que faltaba: `valoresInput` ya se probaba, pero el copyPaste de fórmulas también
  // escribe, y escribir ahí —aunque sea una fórmula— bloquea el derrame desde la fila 4.
  const alcanzadas = new Set()
  for (const [a, b] of GRUPOS_FORMULA) {
    for (let i = colIdx(a); i <= colIdx(b); i++) alcanzadas.add(letraDeIndice(i))
  }
  for (const L of PROHIBIDAS) assert.equal(alcanzadas.has(L), false, `copyPaste iba a pisar ${L}`)
})

test('el contrato de columnas nombra las cinco prohibidas, y ninguna es de input', () => {
  for (const L of PROHIBIDAS) {
    assert.ok(Object.values(COL).includes(L), `${L} desapareció del contrato de columnas`)
  }
  const v = valoresInput({
    proveedor: 'X', fecha: '05/01/2026', tipo: 'A', numero: '0001-00000001',
    concepto: 'algo', iva: 21, total: 121, condicion: 'Contado', obra: 'O', unidad: 'U', detalle: 'D',
  })
  for (const L of PROHIBIDAS) assert.equal(Object.hasOwn(v, L), false, `valoresInput escribió en ${L}`)
})

// ════════════════════════════════════════════════════════════════════════════
// 7 · EL INTERRUPTOR DE LAS TARJETAS SE ENCIENDE POR TEST, NO POR ARCHIVO
// ════════════════════════════════════════════════════════════════════════════

test('el interruptor viene APAGADO, que es como corre producción', () => {
  assert.equal(botonesActivos(), false)
})

testConBotones('adentro de testConBotones el interruptor está encendido', () => {
  assert.equal(botonesActivos(), true)
})

test('y se restaura al salir: un test no le cambia la configuración al siguiente', () => {
  assert.equal(botonesActivos(), false, 'la variable quedó pegada del test anterior')
  assert.equal(process.env.ORQ_COMPROBANTES_BOTONES, undefined)
})
