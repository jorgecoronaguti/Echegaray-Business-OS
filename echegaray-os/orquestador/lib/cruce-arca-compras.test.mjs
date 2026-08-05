// Cada test de acá prueba UN DEFECTO. Si se revierte el arreglo, el test se pone rojo.
//
// El defecto original que cubren todos: los controles de Materiales, Estructura y Recurrentes se
// validaban contra Compras, que es la misma fuente que producen. Un ✓ que sólo probaba saber sumar.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  conciliar, verificarIdentidad, veredicto, ventanaDeArca, periodosDesalineados, mesDeEmision,
  RUBROS_SIN_COMPROBANTE_FISCAL, RUBROS_COMERCIALES,
} from './cruce-arca-compras.mjs'

const clave = (c) => `${Number(c.punto_venta)}-${Number(c.numero)}`
/** Un comprobante de ARCA de mentira. Factura A por defecto. */
const fac = (o) => ({ tipo_comprobante: '1', periodo: '2026-06', fecha_emision: '2026-06-15', emisor_nombre: 'PROV', punto_venta: '1', numero: '1', imp_total: 0, ...o })
/** Una fila de Compras de mentira. Rubro comercial y dentro de la ventana por defecto. */
const fil = (o) => ({ fila: 4, periodo: '2026-06', prov: 'PROV', provNorm: 'PROV', comprobante: '', total: 0, rubro: 'Materiales Civil', ...o })

test('DIRECCIÓN 1 — ARCA registró un comprobante que Compras no tiene', () => {
  const r = conciliar({
    comprobantes: [fac({ numero: '683', punto_venta: '2', emisor_nombre: 'MB EMPRENDIMIENTOS', imp_total: 815257 })],
    filasCompras: [],
    clave,
  })
  assert.equal(r.arcaSinCompras.length, 1)
  assert.equal(r.totales.arcaSinCompras, 815257)
  assert.equal(r.totales.comprasSinArca, 0)
  // Y el veredicto tiene que traer el comprobante, no sólo el monto: con "difieren en $815.257"
  // nadie puede ir a buscar el papel.
  const v = veredicto(r)
  assert.equal(v.estado, 'hallazgo')
  assert.match(v.texto, /0002-00000683/)
  assert.match(v.texto, /MB EMPRENDIMIENTOS/)
})

test('DIRECCIÓN 2 — Compras tiene una fila que ARCA no respalda', () => {
  // ARCA tiene que traer ALGO, si no la ventana está vacía y el control dice "no puedo verificar"
  // (que es lo correcto, y lo prueba su propio test). Acá el libro existe y la fila igual no está.
  const r = conciliar({
    comprobantes: [fac({ numero: '5', imp_total: 100 })],
    filasCompras: [
      fil({ fila: 377, comprobante: '1-5', total: 100 }),
      fil({ fila: 378, prov: 'Alumetal', total: 11423000 }),
    ],
    clave,
  })
  assert.equal(r.comprasSinArca.length, 1)
  assert.equal(r.totales.comprasSinArca, 11423000)
  assert.equal(r.totales.arcaSinCompras, 0)
  const v = veredicto(r)
  assert.match(v.texto, /fila 378/)
  assert.match(v.texto, /Alumetal/)
})

test('EL NETO CERO QUE ESCONDE DOS ERRORES — las dos direcciones se informan por separado', () => {
  // $500.000 de cada lado. La diferencia agregada es EXACTAMENTE cero y sin embargo hay dos defectos
  // distintos, que se arreglan en dos lugares distintos. Un control que informara sólo el neto daría
  // ✓ verde acá — que es la razón por la que informa las dos direcciones.
  const r = conciliar({
    comprobantes: [fac({ numero: '900', imp_total: 500000, emisor_nombre: 'EL QUE FALTA' })],
    filasCompras: [fil({ fila: 50, prov: 'EL OTRO', total: 500000 })],
    clave,
  })
  assert.equal(r.totales.comprasUniverso - r.totales.arcaNeto, 0, 'el neto agregado es cero')
  assert.equal(r.totales.arcaSinCompras, 500000)
  assert.equal(r.totales.comprasSinArca, 500000)
  const v = veredicto(r)
  assert.equal(v.estado, 'hallazgo', 'un neto de cero NO puede dar ✓ si hay hueco de los dos lados')
  assert.match(v.texto, /EL QUE FALTA/)
  assert.match(v.texto, /EL OTRO/)
})

test('UN PROVEEDOR SIN FACTURA NO ES UN ERROR — va en su línea, con su monto, ni sumado ni escondido', () => {
  const r = conciliar({
    comprobantes: [fac({ numero: '7', imp_total: 250 })],
    filasCompras: [
      fil({ fila: 9, comprobante: '1-7', total: 250 }),
      fil({ fila: 10, prov: 'CUADRILLA', total: 142559222, rubro: 'Nómina · Jornales de obra' }),
      fil({ fila: 11, prov: 'ARCA', total: 783684, rubro: 'Impuestos' }),
    ],
    clave,
  })
  assert.equal(r.totales.comprasSinArca, 0, 'los jornales NO contaminan el hueco')
  assert.equal(r.comprasSinArca.length, 0)
  assert.equal(r.totales.fueraDeArca, 143342906, 'pero SÍ se declaran, con su monto')
  assert.equal(r.fueraDeArca.length, 2)
  // Y no se convierten en un ✓ silencioso: la línea existe y es visible.
  assert.equal(veredicto(r).estado, 'ok')
})

test('ARCA SIN DATOS DEL PERÍODO — dice "no puedo verificar", NUNCA ✓ verde', () => {
  const r = conciliar({
    comprobantes: [],
    filasCompras: [fil({ fila: 4, total: 9999999 })],
    clave,
  })
  assert.equal(r.ventana.vacia, true)
  const v = veredicto(r)
  assert.equal(v.estado, 'no_verificable')
  assert.match(v.texto, /NO PUEDO VERIFICAR/)
  assert.doesNotMatch(v.texto, /✓/, 'sin la fuente independiente el control no puede afirmar nada')
})

test('LA VENTANA — una fila fuera del alcance de ARCA no es un hueco, es una fila fuera de ventana', () => {
  // Compras tiene facturas hasta diciembre; ARCA llega hasta el último período replicado. Contar
  // agosto como "sin respaldo fiscal" inventaría un hallazgo que nadie puede resolver.
  const r = conciliar({
    comprobantes: [fac({ periodo: '2026-07', numero: '1', imp_total: 100 })],
    filasCompras: [
      fil({ fila: 20, periodo: '2026-08', total: 9337667 }),
      fil({ fila: 21, periodo: '2026-07', comprobante: '1-1', total: 100 }),
    ],
    clave,
  })
  assert.equal(r.totales.comprasSinArca, 0)
  assert.equal(r.totales.fueraDeVentana, 9337667)
  assert.equal(r.fueraDeVentana[0].fila, 20)
  assert.equal(r.totales.comprasConRespaldo, 100)
})

test('la ventana se DEDUCE de lo que ARCA trajo, no se escribe a mano', () => {
  const v = ventanaDeArca([fac({ periodo: '2026-01' }), fac({ periodo: '2026-07' }), fac({ periodo: '2026-03' })])
  assert.deepEqual(v.periodos, ['2026-01', '2026-03', '2026-07'])
  assert.equal(v.desde, '2026-01')
  assert.equal(v.hasta, '2026-07')
  assert.equal(v.vacia, false)
})

test('un período de DDJJ distinto al mes de emisión se AVISA, no se asume', () => {
  // Hoy los 537 comprobantes replicados coinciden. El control no se apoya en que siga siendo así.
  assert.equal(periodosDesalineados([fac({ periodo: '2026-06', fecha_emision: '2026-06-15' })]).length, 0)
  const raros = periodosDesalineados([fac({ periodo: '2026-07', fecha_emision: '2026-06-30' })])
  assert.equal(raros.length, 1)
})

test('una nota de crédito no es carga faltante y entra restando en el neto', () => {
  const r = conciliar({
    comprobantes: [
      fac({ numero: '1', imp_total: 1000 }),
      fac({ tipo_comprobante: '3', numero: '2', imp_total: 300 }),
    ],
    filasCompras: [fil({ fila: 4, comprobante: '1-1', total: 1000 })],
    clave,
  })
  assert.equal(r.totales.arcaNeto, 700)
  assert.equal(r.totales.notasDeCredito, 300)
  assert.equal(r.totales.arcaSinCompras, 0, 'la NC no es una factura que falte cargar')
})

test('LA IDENTIDAD ES EXACTA Y NO DEJA RESIDUO: respaldado + sin respaldo = lo que la vista lista', () => {
  // LA IDENTIDAD ANTERIOR ERA `Compras(universo) − ARCA(neto)` y despejaba el sobrante como
  // "facturas cargadas por un importe distinto al que ARCA registró". Los dos lados no eran el mismo
  // universo (ARCA es TODAS las compras), así que en Recurrentes escribió −$203.592.436 de diferencia
  // y −$212.255.479 de residuo CON UNA CAUSA INVENTADA. Ésta parte el MISMO conjunto en dos.
  const r = conciliar({
    comprobantes: [
      fac({ numero: '1', imp_total: 1000 }),
      fac({ numero: '2', imp_total: 700, emisor_nombre: 'FALTA' }),
      fac({ tipo_comprobante: '3', numero: '3', imp_total: 200 }),
    ],
    filasCompras: [
      fil({ fila: 4, comprobante: '1-1', total: 1000 }),
      fil({ fila: 5, prov: 'SIN RESPALDO', total: 450 }),
    ],
    clave,
  })
  const id = verificarIdentidad(r)
  assert.equal(id.ok, true)
  assert.equal(id.diferencia, 0, 'exacta: no hay residuo al que ponerle nombre')
  assert.equal(id.universo, 1450)
  assert.equal(id.reconstruido, 1450)
  assert.equal(r.totales.comprasConRespaldo, 1000)
  assert.equal(r.totales.comprasSinArca, 450)
  assert.equal(verificarIdentidad(r).diferencia, 0)
})

test('LA COBERTURA ES UNA PROPORCIÓN DEL PROPIO UNIVERSO, no una comparación contra el libro entero', () => {
  const r = conciliar({
    comprobantes: [fac({ numero: '1', imp_total: 750 }), fac({ numero: '9', imp_total: 999999, emisor_nombre: 'DE OTRO RUBRO' })],
    filasCompras: [
      fil({ fila: 4, comprobante: '1-1', total: 750 }),
      fil({ fila: 5, prov: 'SIN FACTURA', total: 250 }),
    ],
    clave,
  })
  // El libro tiene $1.000.749 y la vista $1.000: la cobertura NO los compara, mide 750 sobre 1000.
  assert.equal(r.totales.cobertura, 0.75)
  assert.notEqual(r.totales.arcaNeto, r.totales.comprasUniverso)
})

test('sin universo comparable la cobertura es null, no 0 ni 1', () => {
  // Un 0% invitaría a leer "no hay nada respaldado" y un 100% "está todo bien". No hay dato.
  const r = conciliar({ comprobantes: [fac({ numero: '1', imp_total: 10 })], filasCompras: [], clave })
  assert.equal(r.totales.cobertura, null)
})

test('un rubro que no está en ninguna de las dos listas no desaparece en silencio', () => {
  const r = conciliar({
    comprobantes: [],
    filasCompras: [fil({ fila: 9, total: 12345, rubro: 'Rubro que nadie declaró' })],
    clave,
  })
  assert.equal(r.totales.comprasSinArca, 0)
  assert.equal(r.totales.rubroDesconocido, 12345)
  assert.equal(r.rubroDesconocido.length, 1)
})

test('LA MISMA FACTURA NO PUEDE SALIR EN LAS DOS DIRECCIONES — "Alumetal" es "ALUMETAL S A"', () => {
  // EL DEFECTO (04/08, primera corrida contra datos vivos). `conciliar` le pasaba a `cruzar` la
  // identidad como normalizador de razón social, así que la fila de Compras "Alumetal" nunca
  // emparejaba con el comprobante de ARCA "ALUMETAL S A". Los mismos $18.166.381 salían a la vez como
  // "ARCA lo registró y Compras no lo tiene" Y como "Compras lo cargó sin respaldo fiscal". El
  // control se contradecía a sí mismo e inflaba los dos huecos.
  const r = conciliar({
    comprobantes: [fac({ emisor_nombre: 'ALUMETAL S A', punto_venta: '38', numero: '25267', imp_total: 18166381 })],
    filasCompras: [fil({ fila: 669, prov: 'Alumetal', comprobante: '', total: 18166381 })],
    clave,
  })
  assert.equal(r.arcaSinCompras.length, 0, 'ARCA no puede reclamar una factura que Compras sí tiene')
  assert.equal(r.comprasSinArca.length, 0, 'y Compras no puede figurar sin respaldo por la misma factura')
  assert.equal(r.totales.comprasConRespaldo, 18166381)
})

test('el período se compara contra un Date de Postgres, no contra su texto', () => {
  // EL DEFECTO: `String(new Date(...)).slice(0,7)` da "Wed Jun". Los 537 comprobantes replicados
  // salían "desalineados" cuando los 537 coinciden. Una alarma que suena siempre se apaga.
  assert.equal(mesDeEmision(new Date(Date.UTC(2026, 5, 15))), '2026-06')
  assert.equal(mesDeEmision('2026-06-15'), '2026-06')
  assert.equal(periodosDesalineados([fac({ periodo: '2026-06', fecha_emision: new Date(Date.UTC(2026, 5, 15)) })]).length, 0)
  assert.equal(periodosDesalineados([fac({ periodo: '2026-07', fecha_emision: new Date(Date.UTC(2026, 5, 15)) })]).length, 1)
})

test('EL CRUCE VA CONTRA COMPRAS ENTERA — una factura cargada en otro rubro NO es "ARCA sin Compras"', () => {
  // EL DEFECTO (04/08). El cruce corría sólo contra el universo comercial dentro de la ventana, así
  // que una factura cargada en un rubro de nómina, o con fecha fuera de la ventana, figuraba como
  // "ARCA la registró y Compras no la tiene". Eso daba $13.090.051 donde ARCA_FALTAN_MONTO —el número
  // que Proveedores ya publica— daba $13,8M: dos cifras parecidas con nombres parecidos.
  const r = conciliar({
    comprobantes: [
      fac({ numero: '1', imp_total: 500 }),
      fac({ numero: '2', imp_total: 900 }),
    ],
    filasCompras: [
      // Cargada, pero en un rubro que NO es comercial: existe en Compras igual.
      fil({ fila: 4, comprobante: '1-1', total: 500, rubro: 'Nómina · Gremiales' }),
      // Cargada, pero con fecha fuera de la ventana de ARCA: también existe.
      fil({ fila: 5, comprobante: '1-2', total: 900, periodo: '2026-11' }),
    ],
    clave,
  })
  assert.equal(r.arcaSinCompras.length, 0, 'están cargadas: el rubro y el mes no cambian ese hecho')
  assert.equal(r.totales.arcaSinCompras, 0)
})

test('el universo de la VISTA sigue siendo el recorte, aunque el cruce mire Compras entera', () => {
  const r = conciliar({
    comprobantes: [fac({ numero: '1', imp_total: 500 })],
    filasCompras: [
      fil({ fila: 4, comprobante: '1-1', total: 500 }),
      fil({ fila: 5, prov: 'JORNALES', total: 90000, rubro: 'Nómina · Jornales de obra' }),
    ],
    clave,
  })
  assert.equal(r.totales.comprasUniverso, 500, 'los jornales no entran en el universo de una vista comercial')
  assert.equal(r.totales.fueraDeArca, 90000, 'pero se declaran')
})

test('las dos listas de rubros no se pisan — un rubro no puede ser comercial y no-fiscal a la vez', () => {
  const cruce = RUBROS_COMERCIALES.filter((r) => RUBROS_SIN_COMPROBANTE_FISCAL.includes(r))
  assert.deepEqual(cruce, [])
})
