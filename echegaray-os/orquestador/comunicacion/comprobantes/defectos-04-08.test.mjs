// LOS CINCO DEFECTOS DEL 04/08, MEDIDOS EN PRODUCCIÓN, CADA UNO CON SU TEST.
//
// Ese día el bot cargó cinco fotos y salió mal. El dueño lo corrigió a mano. Lo que sigue es cada
// defecto reproducido con los importes REALES del papel —no con ejemplos— y el camino completo:
// foto en el canal → lo que queda en el fajo → lo que se le manda al cargador.
//
//   1. ALUMETAL: número `0036-…` por `0038-…` y total ×100. Entraron $201M falsos y el duplicado no
//      se detectó porque el número Y el importe estaban mal los dos.
//   2. VILLA DEL PINO: total ×100.
//   3. HORMISERV: nota de crédito ÷1000 y con el signo al revés.
//   4. Columna P con "Importe" y "30 DIAS FECHA FACTURA"; columna K con "Rodrigo Echegaray".
//   5. Filas sin categoría (B), sin unidad (I), sin obra (J) y sin detalle (K).
//
// Si se revierte cualquiera de los arreglos, algo de acá se pone rojo.

import test from 'node:test'
import assert from 'node:assert/strict'
import { procesarPost, armarItem } from './flujo.mjs'
import { aFajoJson } from './escritura.mjs'
import { repoMemoria, portGuarda, mmFalso, filaCompras } from './dobles.mjs'
import { indexarCompras, buscarEnCompras, HALLAZGO } from '../../lib/comprobantes/compras-vivas.mjs'
import { estaCompleto, preguntasDe } from '../../lib/comprobantes/fajo.mjs'
import { valoresInput, COL } from '../../lib/carga-comprobantes.mjs'

const URL = 'https://chat.ecsas.com.ar/comprobantes/accion?t=SECRETO'
const ACTOR = { plataforma_user_id: 'u_rodrigo', plataforma_username: 'rodrigo', channel_type: 'P', channel_id: 'c_comprobantes' }

/** Los desplegables ESTRICTOS de Compras, con las cinco columnas que se leen del Sheet. */
const LISTAS = Object.freeze({
  ok: true,
  proveedores: ['ALUMETAL', 'Villa del Pino', 'HORMISERV', 'Corralon Progreso'],
  obras: ['LA ESTRELLA', 'MESSINA', 'Vehiculos / Maquinas'],
  unidades: ['Materiales', 'Servicios', 'Estructura'],
  categorias: ['Materiales', 'Combustible', 'Servicios'],
  tiposPago: ['Efectivo', 'Transferencia', 'Débito', 'Tarjeta Crédito', 'Echeq', 'Cheque'],
})

/** La lectura de ALUMETAL tal como el modelo la devolvió el 04/08: número y total mal. */
const alumetalMalLeida = (over = {}) => ({
  emisor: 'ALUMETAL', cuit: '30567363372', letra: 'A', es_nota_credito: false,
  numero: '0036-00025942', fecha: '31/07/2026',
  neto_gravado: '1.624.951,67', iva_21: '341.239,85', iva_105: '0', otros_tributos: '48.748,55',
  total: '201.494.007,00',
  condicion_venta: 'Cuenta Corriente', concepto: 'Perfiles de aluminio',
  anotacion_manuscrita: 'Estrella c/c', legible: true, dudas: [], ...over,
})

/** La fila 797 de Compras: ESA factura, ya cargada, con el número y el importe buenos. */
const FILAS_CON_797 = (() => {
  const filas = []
  filas[797 - 4] = filaCompras('31/7/2026', 'ALUMETAL', 'F A', '0038-00025942', 'LA ESTRELLA', 'Aberturas', 'Perfiles', '$ 2.014.940,07', 'Materiales')
  return filas
})()

function armar({ lecturas, filas = [], listas = LISTAS } = {}) {
  const repo = repoMemoria()
  const mm = mmFalso({ archivos: { f1: { name: 'factura.jpg', mime: 'image/jpeg' } } })
  let i = 0
  return {
    repo,
    d: {
      port: portGuarda(), repo, mattermost: mm, url: URL,
      leer: async () => ({ ok: true, crudo: lecturas[Math.min(i++, lecturas.length - 1)] }),
      listas: async () => listas,
      comprasDe: async () => ({ ok: true, ...indexarCompras(filas) }),
    },
  }
}

const post = (o = {}) => ({
  fileIds: ['f1'], actor: ACTOR, channelId: 'c_comprobantes', postId: 'p1', rootPostId: 'p1',
  ahora: new Date('2026-08-04T10:00:00Z'), ...o,
})

const itemDe = (repo, r) => repo._fajos.get(r.fajoId).items[0]

// ═══ 1 · LOS $201 MILLONES NO SE ESCRIBEN ════════════════════════════════════

test('ALUMETAL ×100: NO se carga, se dice qué no cierra con los números, y se ofrece Corregir', async () => {
  const { d, repo } = armar({ lecturas: [alumetalMalLeida()] })
  const r = await procesarPost(d, post())

  const it = itemDe(repo, r)
  assert.equal(estaCompleto(it), false, 'un importe que no cierra NO se carga: así entraron los $201M')
  assert.equal(aFajoJson([it]).length, 0, 'y no llega ni al fajo que se le manda al cargador')

  // Los números concretos, no un "revisá los importes".
  assert.match(r.texto, /los importes no cierran/)
  assert.match(r.texto, /\$2\.014\.940,07/, 'lo que suman sus propios sumandos')
  assert.match(r.texto, /\$201\.494\.007,00/, 'lo que dice el total leído')
  assert.ok(preguntasDe(it).some((p) => /Corregir/.test(p)), 'la salida es corregir, no cargar igual')
})

test('VILLA DEL PINO ×100: mismo control, mismo resultado', async () => {
  const lectura = {
    emisor: 'Villa del Pino', cuit: '30612345678', letra: 'A', numero: '00015-00015177',
    fecha: '01/08/2026', neto_gravado: '73.458,37', iva_21: '15.426,26', otros_tributos: '16.116,04',
    total: '10.500.067,00', concepto: 'Gulf combustible', anotacion_manuscrita: 'Ford XLS', legible: true,
  }
  const { d, repo } = armar({ lecturas: [lectura] })
  const r = await procesarPost(d, post())
  assert.equal(estaCompleto(itemDe(repo, r)), false)
  assert.match(r.texto, /\$105\.000,67/)
})

test('el mismo comprobante BIEN leído se carga sin decir una palabra del control', async () => {
  const { d, repo } = armar({ lecturas: [alumetalMalLeida({ numero: '0038-00025942', total: '2.014.940,07' })] })
  const r = await procesarPost(d, post())
  assert.equal(estaCompleto(itemDe(repo, r)), true, 'el control no puede sonar en una carga correcta')
  assert.doesNotMatch(r.texto, /los importes no cierran/)
})

// ═══ 2 · EL ORDEN DE MAGNITUD, CUANDO LA ARITMÉTICA NO ALCANZA ══════════════

test('$201M contra un proveedor cuyo máximo histórico son $16,6M: se pregunta, no se escribe', async () => {
  // Acá los sumandos ACOMPAÑAN al total mal leído (el modelo se equivocó igual en los cuatro), así
  // que la identidad cierra y no hay nada que la delate. Lo único que queda es la historia.
  const historia = [16_600_000, 12_000_000, 8_400_000, 5_100_000, 900_000].map((t, k) =>
    filaCompras(`${10 + k}/6/2026`, 'ALUMETAL', 'F A', `0038-0002500${k}`, 'LA ESTRELLA', 'Aberturas', 'Perfiles', `$ ${t.toLocaleString('es-AR')},00`, 'Materiales'))
  const { d, repo } = armar({
    lecturas: [alumetalMalLeida({
      numero: '0038-00099999', neto_gravado: '162.495.167,00', iva_21: '34.123.985,00',
      otros_tributos: '4.874.855,00', total: '201.494.007,00',
    })],
    filas: historia,
  })
  const r = await procesarPost(d, post())
  const it = itemDe(repo, r)
  assert.deepEqual(it.escala, { n: 5, max: 16_600_000 }, 'la evidencia viaja en el ítem, no el veredicto')
  assert.equal(estaCompleto(it), false)
  assert.match(r.texto, /12\.14×|12,14×/)
  assert.match(r.texto, /\$16\.600\.000,00/)
})

test('una compra grande DE VERDAD se destraba escribiendo el total: no es un callejón sin salida', () => {
  const it = {
    comprobante: {
      proveedor: 'ALUMETAL', fecha: '31/07/2026', numero: '0038-00099999',
      neto: 162495167, iva: 34123985, otrosTributos: 4874855, total: 201494007,
    },
    escala: { n: 5, max: 16_600_000 },
  }
  assert.equal(estaCompleto(it), false)
  // `totalTipeado` lo pone el formulario de Corregir: una persona miró el papel y escribió el número.
  const tipeado = { ...it, comprobante: { ...it.comprobante, totalTipeado: true } }
  assert.equal(estaCompleto(tipeado), true)
})

// ═══ 3 · EL DUPLICADO QUE NO DEPENDE DEL NÚMERO BIEN LEÍDO ══════════════════

test('EL CASO REAL: 0036 contra 0038, mismo día y mismo proveedor, es un PROBABLE duplicado', () => {
  const indice = { ok: true, ...indexarCompras(FILAS_CON_797) }
  const r = buscarEnCompras({
    proveedor: 'ALUMETAL', numero: '0036-00025942', fecha: '31/07/2026', total: 201494007,
  }, indice)
  assert.ok(r, 'con el número Y el importe mal, las dos pasadas viejas quedaban ciegas')
  assert.equal(r.que, HALLAZGO.PROBABLE, 'se pregunta: dos facturas consecutivas también difieren en un dígito')
  assert.equal(r.fila, 797)
  assert.match(r.via, /un digito/)
})

test('el mismo número a un dígito pero de OTRO DÍA no es un duplicado', () => {
  const indice = { ok: true, ...indexarCompras(FILAS_CON_797) }
  assert.equal(buscarEnCompras({ proveedor: 'ALUMETAL', numero: '0036-00025942', fecha: '01/08/2026', total: 5 }, indice), null)
})

test('el mismo número a un dígito pero de OTRO PROVEEDOR no es un duplicado', () => {
  const indice = { ok: true, ...indexarCompras(FILAS_CON_797) }
  assert.equal(buscarEnCompras({ proveedor: 'HORMISERV', numero: '0036-00025942', fecha: '31/07/2026', total: 5 }, indice), null)
})

test('dos dígitos de distancia NO alcanzan: eso ya es otro comprobante', () => {
  const indice = { ok: true, ...indexarCompras(FILAS_CON_797) }
  assert.equal(buscarEnCompras({ proveedor: 'ALUMETAL', numero: '0036-00025943', fecha: '31/07/2026', total: 5 }, indice), null)
})

// ═══ 3 bis · LA NOTA DE CRÉDITO DE HORMISERV: EL SIGNO ═════════════════════

test('HORMISERV: la letra dice NOTA DE CREDITO y el flag dice que no — manda la letra, va NEGATIVO', () => {
  // Se cargó $686,07 POSITIVA cuando el papel dice $686.070,00 y va en negativo. El ÷1000 lo caza la
  // aritmética; el signo lo cazaba nadie: con `es_nota_credito:false` los importes salían en positivo
  // aunque el tipo quedara en "N C". Una nota de crédito contada como compra ya costó $41,9M.
  const it = armarItem({
    lectura: {
      emisor: 'HORMISERV', letra: 'NOTA DE CREDITO A', es_nota_credito: false,
      numero: '00005-00000386', fecha: '29/07/2026',
      neto_gravado: '567.000,00', iva_21: '119.070,00', total: '686.070,00',
    },
    listas: LISTAS,
  })
  const c = it.comprobante
  assert.equal(c.esNotaCredito, true)
  assert.equal(c.tipo, 'NC')
  assert.equal(c.total, -686070, 'el signo se aplica en la lectura, no en la escritura')
  assert.equal(c.iva, -119070)
  assert.equal(c.neto, -567000)
  assert.match(it.clave, /\|NC\|/, 'y la clave la separa de una factura con el mismo número')
})

test('la nota de crédito bien leída sigue cerrando: el signo no rompe la aritmética', () => {
  const it = armarItem({
    lectura: {
      emisor: 'HORMISERV', letra: 'A', es_nota_credito: true, numero: '00005-00000386',
      fecha: '29/07/2026', neto_gravado: '567.000,00', iva_21: '119.070,00', total: '686.070,00',
      categoria: 'Servicios',
    },
    listas: LISTAS,
  })
  assert.equal(estaCompleto(it), true)
  assert.equal(aFajoJson([it])[0].total, -686070)
})

test('el ÷1000 de HORMISERV no se carga: sus propios sumandos lo desmienten', () => {
  const it = armarItem({
    lectura: {
      emisor: 'HORMISERV', letra: 'A', es_nota_credito: true, numero: '00005-00000386',
      fecha: '29/07/2026', neto_gravado: '567.000,00', iva_21: '119.070,00', total: '686,07',
    },
    listas: LISTAS,
  })
  assert.equal(estaCompleto(it), false)
  assert.ok(preguntasDe(it).some((p) => /no cierran/.test(p)))
})

// ═══ 4 · NINGUNA CELDA CON BASURA ═══════════════════════════════════════════

test('la columna P NO recibe "Importe" ni "30 DIAS FECHA FACTURA": queda vacía', () => {
  for (const basura of ['Importe', '30 DIAS FECHA FACTURA', 'Cuenta Corriente', 'contra entrega']) {
    const it = armarItem({ lectura: { emisor: 'ALUMETAL', total: '100', forma_pago: basura }, listas: LISTAS })
    assert.equal(it.comprobante.formaPago, null, `"${basura}" no es una forma de pago`)
    assert.equal(valoresInput({ ...it.comprobante, formaPago: basura })[COL.formaPago], undefined,
      'y la última defensa tampoco lo escribe, venga por donde venga')
  }
})

test('lo que SÍ es una forma de pago entra, aunque esté en mayúsculas', () => {
  const it = armarItem({ lectura: { emisor: 'ALUMETAL', total: '100', forma_pago: 'TRANSFERENCIA' }, listas: LISTAS })
  assert.equal(it.comprobante.formaPago, 'Transferencia')
  assert.equal(valoresInput(it.comprobante)[COL.formaPago], 'Transferencia')
})

test('la columna K NO recibe lo que el modelo eligió si esa obra lo usó UNA sola vez', () => {
  // `Rodrigo Echegaray` es un texto de las observaciones de la factura. Aparece una vez en la
  // columna K de esa obra, así que no es vocabulario: es ruido, y el modelo no puede elegirlo.
  const listas = {
    ...LISTAS,
    detalles: { 'LA ESTRELLA': ['Aberturas', 'Rodrigo Echegaray'] },
    detallesFirmes: { 'LA ESTRELLA': ['Aberturas'] },
  }
  const lectura = { emisor: 'ALUMETAL', total: '100', obra: 'LA ESTRELLA', detalle_obra: 'Rodrigo Echegaray' }
  assert.equal(armarItem({ lectura, listas }).comprobante.detalleObra, null)
  assert.equal(armarItem({ lectura: { ...lectura, detalle_obra: 'Aberturas' }, listas }).comprobante.detalleObra, 'Aberturas')
})

test('un valor que NO está en el desplegable no llega a una celda, aunque el modelo lo proponga', () => {
  const it = armarItem({
    lectura: { emisor: 'ALUMETAL', total: '100', obra: 'OBRA QUE NO EXISTE', unidad_negocio: 'civil', categoria: 'Varios' },
    listas: LISTAS,
  })
  assert.equal(it.comprobante.obra, null)
  assert.equal(it.comprobante.unidad, undefined)
  assert.equal(it.comprobante.categoria, undefined)
})

// ═══ 5 · LA CATEGORÍA (B) QUEDA CARGADA ═════════════════════════════════════

test('la CATEGORÍA sale del desplegable y viaja al cargador', () => {
  const it = armarItem({
    lectura: { emisor: 'ALUMETAL', total: '100', categoria: 'Materiales' },
    listas: LISTAS,
  })
  assert.equal(it.comprobante.categoria, 'Materiales')
  assert.equal(valoresInput(it.comprobante)[COL.categoria], 'Materiales')
})

test('sin categoría, el comprobante NO se carga solo: se pregunta con el menú de la columna B', async () => {
  const { d, repo } = armar({ lecturas: [alumetalMalLeida({ numero: '0038-00025942', total: '2.014.940,07' })] })
  const r = await procesarPost(d, post())
  const it = itemDe(repo, r)
  assert.equal(it.comprobante.categoria, undefined, 'el papel no la dice')
  const menus = (r.attachments ?? []).flatMap((b) => b.actions ?? []).filter((a) => a.type === 'select')
  assert.ok(menus.some((m) => m.id === 'categoria'), 'la columna B se pregunta como las otras')
})

// ═══ 6 · LO ESCRITO A MANO VIAJA AL CONCEPTO, LITERAL ═══════════════════════

test('la transcripción literal va a la columna L, aunque además se haya usado para imputar', async () => {
  const { d, repo } = armar({
    lecturas: [alumetalMalLeida({ numero: '0038-00025942', total: '2.014.940,07', anotacion_manuscrita: 'Estrella c/c' })],
  })
  const r = await procesarPost(d, post())
  const it = itemDe(repo, r)
  assert.equal(it.comprobante.obra, 'LA ESTRELLA', 'la anotación además imputó')
  const [json] = aFajoJson([{ ...it, comprobante: { ...it.comprobante, categoria: 'Materiales' } }])
  assert.equal(json.concepto, 'Perfiles de aluminio · a mano: "Estrella c/c"')
})

test('los cuatro manuscritos reales del 04/08 se transcriben tal cual', () => {
  const casos = [
    ['Ford XLS', 'Gulf combustible · a mano: "Ford XLS"'],
    ['Estrella c/c', 'Cemento · a mano: "Estrella c/c"'],
    ['SF. Cuenta cte', 'Hierro · a mano: "SF. Cuenta cte"'],
    ['Camion · Corpodos Pagos', 'Gasoil · a mano: "Camion · Corpodos Pagos"'],
  ]
  const conceptos = ['Gulf combustible', 'Cemento', 'Hierro', 'Gasoil']
  casos.forEach(([anotacion, esperado], k) => {
    const [json] = aFajoJson([{
      comprobante: {
        proveedor: 'ALUMETAL', fecha: '31/07/2026', numero: '0038-00025942', total: 100,
        neto: null, concepto: conceptos[k], anotacion,
      },
    }])
    assert.equal(json.concepto, esperado)
  })
})

test('sin nada escrito a mano el concepto queda como estaba, y la marca no se duplica', () => {
  const base = { proveedor: 'ALUMETAL', fecha: '31/07/2026', numero: '0038-00025942', total: 100 }
  assert.equal(aFajoJson([{ comprobante: { ...base, concepto: 'Cemento' } }])[0].concepto, 'Cemento')
  const yaMarcado = 'Cemento · a mano: "Estrella"'
  assert.equal(aFajoJson([{ comprobante: { ...base, concepto: yaMarcado, anotacion: 'Estrella' } }])[0].concepto, yaMarcado)
})
