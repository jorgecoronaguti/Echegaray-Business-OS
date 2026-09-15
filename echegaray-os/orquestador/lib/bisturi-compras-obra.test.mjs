// El plan de escritura de la columna «Obra» contra los encabezados REALES de Compras, antes y después
// de la inserción. Lo que se prueba sobre todo es cuándo NO escribe.
import test from 'node:test'
import assert from 'node:assert/strict'
import { planificarObra, relecturaConfirma } from './bisturi-compras-obra.mjs'
import { COMPRAS_2508, COMPRAS_CON_OBRA } from './encabezados-referencia.mjs'
import { claveDeCompra } from './compras-fila.mjs'

/** Una fila por rótulo: el test no sabe letras, igual que el código. */
function filaDe(encabezado, valores) {
  const f = new Array(encabezado.length).fill('')
  for (const [rotulo, v] of Object.entries(valores)) f[encabezado.indexOf(rotulo)] = v
  return f
}

const COMPRA = {
  ID: 53, Proveedor: 'CORRALÓN EL NORTE', Tipo: 'F A', 'N° Comprobante': '0003-00012345',
  'CUIT (OS)': '30712345678', Total: 121000, Importe: 100000, IVA: 21000,
}
const CLAVE = claveDeCompra({ cuit: '30712345678', tipo: 'F A', comprobante: '0003-00012345', proveedor: 'CORRALÓN EL NORTE' })
const CAMBIO = {
  id: 'k-1', fila: 57, clave: CLAVE, sheet_id: 53, valor_anterior: null,
  valor_nuevo: 'OB-0021 · ME - PLAYÓN DE AZUFRE', pedido_por: 'u-1', intentos: 1,
}
// El catálogo que el worker lee de `obra_canonica`: el valor a escribir tiene que ser una opción exacta.
const OBRAS = [
  { id: 'playon', codigo: 'OB-0021', nombre: 'ME - PLAYÓN DE AZUFRE', cliente_texto: 'MESSINA', fusionada_en: null },
  { id: 'galpon', codigo: 'OB-0007', nombre: 'LE - GALPÓN 9', cliente_texto: 'LA ESTRELLA', fusionada_en: null },
  { id: 'comedor', codigo: 'OB-0006', nombre: 'LE - COMEDOR', cliente_texto: 'LA ESTRELLA', fusionada_en: null },
]
const conObra = (obra) => filaDe(COMPRAS_CON_OBRA, { ...COMPRA, Obra: obra })

test('la clave de la fixture existe: sin ella los rechazos por huella serían triviales', () => {
  assert.ok(CLAVE, 'claveDeCompra tiene que dar una clave para una factura con número')
})

test('encuentra la columna por su rótulo: tras la inserción escribe L de ESA fila y nada más', () => {
  const p = planificarObra({ obras: OBRAS, cambio: CAMBIO, encabezado: COMPRAS_CON_OBRA, fila: conObra('') })
  assert.equal(p.accion, 'escribir')
  assert.equal(p.celda, 'Compras!L57')
  assert.equal(p.valor, 'OB-0021 · ME - PLAYÓN DE AZUFRE')
})

test('la letra sale del rótulo, no de una constante: con «Obra» en otro lugar escribe ahí', () => {
  const movido = [...COMPRAS_2508, 'Obra']              // al final: AO, como en el diseño viejo
  const p = planificarObra({ obras: OBRAS, cambio: CAMBIO, encabezado: movido, fila: filaDe(movido, COMPRA) })
  assert.equal(p.accion, 'escribir')
  assert.equal(p.celda, 'Compras!AO57')
})

test('sin la columna «Obra» NO escribe: difiere con motivo y deja la fila pendiente', () => {
  const p = planificarObra({ obras: OBRAS, cambio: CAMBIO, encabezado: COMPRAS_2508, fila: filaDe(COMPRAS_2508, COMPRA) })
  assert.equal(p.accion, 'diferir')
  assert.equal(p.motivo, 'sin_columna_obra')
  assert.equal(p.celda, undefined)
})

test('con «Obra» repetida aborta: difiere sin elegir una a ciegas', () => {
  const doble = [...COMPRAS_CON_OBRA, 'Obra']
  const p = planificarObra({ obras: OBRAS, cambio: CAMBIO, encabezado: doble, fila: filaDe(COMPRAS_CON_OBRA, COMPRA) })
  assert.equal(p.accion, 'diferir')
  assert.equal(p.motivo, 'layout_ambiguo')
  assert.match(p.detalle, /«Obra» aparece 2 veces/)
})

test('si la fila ya es otra compra (alguien insertó arriba), rechaza aunque el ID coincida', () => {
  const otra = filaDe(COMPRAS_CON_OBRA, { ...COMPRA, 'N° Comprobante': '0003-00099999', Obra: '' })
  const p = planificarObra({ obras: OBRAS, cambio: CAMBIO, encabezado: COMPRAS_CON_OBRA, fila: otra })
  assert.equal(p.accion, 'rechazar')
  assert.equal(p.motivo, 'huella_distinta')
})

test('si el ID no coincide también rechaza', () => {
  const p = planificarObra({ obras: OBRAS, cambio: { ...CAMBIO, sheet_id: 54 }, encabezado: COMPRAS_CON_OBRA, fila: conObra('') })
  assert.equal(p.accion, 'rechazar')
  assert.equal(p.motivo, 'huella_distinta')
})

test('sin clave de comprobante no hay identidad: rechaza antes de mirar la celda', () => {
  const p = planificarObra({ obras: OBRAS, cambio: { ...CAMBIO, clave: null }, encabezado: COMPRAS_CON_OBRA, fila: conObra('') })
  assert.equal(p.accion, 'rechazar')
  assert.equal(p.motivo, 'sin_huella')
})

test('si la celda cambió desde que la pantalla la miró (`esperado` distinto), NO la pisa', () => {
  const p = planificarObra({ obras: OBRAS, cambio: CAMBIO, encabezado: COMPRAS_CON_OBRA, fila: conObra('ES-TAL · Estructura – Taller') })
  assert.equal(p.accion, 'rechazar')
  assert.equal(p.motivo, 'celda_cambio')
  assert.match(p.detalle, /ES-TAL/)
})

test('cambiar una obra por otra pasa si la celda dice lo que la pantalla vio', () => {
  const p = planificarObra({ obras: OBRAS,
    cambio: { ...CAMBIO, valor_anterior: 'ES-ADM · Estructura – Administración' },
    encabezado: COMPRAS_CON_OBRA, fila: conObra('  ES-ADM · Estructura – Administración '),
  })
  assert.equal(p.accion, 'escribir')
})

test('idempotente: si la celda ya dice lo pedido, no vuelve a escribir', () => {
  const p = planificarObra({ obras: OBRAS, cambio: CAMBIO, encabezado: COMPRAS_CON_OBRA, fila: conObra('OB-0021 · ME - PLAYÓN DE AZUFRE') })
  assert.equal(p.accion, 'ya_aplicado')
})

test('un valor fuera del desplegable se rechaza sin leer nada más', () => {
  const p = planificarObra({ obras: OBRAS, cambio: { ...CAMBIO, valor_nuevo: 'la de Arcor' }, encabezado: COMPRAS_CON_OBRA, fila: conObra('') })
  assert.equal(p.accion, 'rechazar')
  assert.equal(p.motivo, 'valor_invalido')
})

test('«Sin obra – cliente» y vaciar la celda son valores legítimos', () => {
  const sin = planificarObra({ obras: OBRAS, cambio: { ...CAMBIO, valor_nuevo: 'Sin obra – LA ESTRELLA' }, encabezado: COMPRAS_CON_OBRA, fila: conObra('') })
  assert.equal(sin.accion, 'escribir')
  const vaciar = planificarObra({ obras: OBRAS,
    cambio: { ...CAMBIO, valor_anterior: 'OB-0007 · X', valor_nuevo: '' }, encabezado: COMPRAS_CON_OBRA, fila: conObra('OB-0007 · X'),
  })
  assert.equal(vaciar.accion, 'escribir')
  assert.equal(vaciar.valor, '')
})

test('una fila de encabezado o sin ID no es un renglón de datos', () => {
  assert.equal(planificarObra({ obras: OBRAS, cambio: { ...CAMBIO, fila: 3 }, encabezado: COMPRAS_CON_OBRA, fila: conObra('') }).motivo, 'fila_invalida')
  const sinId = filaDe(COMPRAS_CON_OBRA, { ...COMPRA, ID: '' })
  assert.equal(planificarObra({ obras: OBRAS, cambio: CAMBIO, encabezado: COMPRAS_CON_OBRA, fila: sinId }).motivo, 'fila_vacia')
})

test('la relectura compara texto normalizado: igual confirma, distinto no', () => {
  assert.equal(relecturaConfirma(' OB-0021 · X ', 'OB-0021 · X'), true)
  assert.equal(relecturaConfirma('ES-ADM · Estructura – Administración', 'OB-0021 · X'), false)
  assert.equal(relecturaConfirma(null, ''), true)
})

test('un valor con FORMA de obra que no es una opción exacta del catálogo se rechaza y no se escribe', () => {
  for (const v of ['OB-0021 · X', 'OB-0002 · X', 'Sin obra – FULANO INVENTADO', 'ES-TAL · Taller']) {
    const p = planificarObra({ obras: OBRAS, cambio: { ...CAMBIO, valor_nuevo: v }, encabezado: COMPRAS_CON_OBRA, fila: conObra('') })
    assert.equal(p.accion, 'rechazar', v)
    assert.equal(p.motivo, 'valor_invalido', v)
    assert.equal(p.celda, undefined)
  }
})

test('sin catálogo de obras NO escribe: difiere (no rechaza: la lectura que faltó se reintenta)', () => {
  for (const obras of [undefined, []]) {
    const p = planificarObra({ obras, cambio: CAMBIO, encabezado: COMPRAS_CON_OBRA, fila: conObra('') })
    assert.equal(p.accion, 'diferir')
    assert.equal(p.motivo, 'sin_catalogo')
  }
})

// ═══ LA HUELLA DE RESPALDO: fila SIN número de comprobante (15/09/2026) ═══
// El caso real: fila 806 · PEDRO TELLO · «Galpon 5» · $4.200.000 · sin comprobante. La RPC encoló con
// `clave` null y el worker la rechazó por `sin_huella`; el dueño la escribió a mano.
import { compararRespaldo, respaldoUsable } from './bisturi-compras-obra.mjs'

const SERIAL_10_09_2026 = 46275
const TELLO = {
  ID: 806, Proveedor: 'PEDRO TELLO', Tipo: '', 'N° Comprobante': '', 'CUIT (OS)': '',
  'Fecha factura': SERIAL_10_09_2026, Concepto: 'Galpon 5', Importe: 4200000, IVA: 0, Total: 4200000,
}
const RESPALDO = { proveedor: 'PEDRO TELLO', fecha: '2026-09-10', total: 4200000, concepto: 'Galpon 5', resincronizado: false }
const CAMBIO_806 = { ...CAMBIO, id: 'k-806', fila: 810, clave: null, sheet_id: 806, valor_nuevo: 'OB-0007 · LE - GALPÓN 9' }
const filaTello = (extra = {}) => filaDe(COMPRAS_CON_OBRA, { ...TELLO, Obra: '', ...extra })

test('la fixture no tiene clave de comprobante: si la tuviera, el respaldo no se miraría', () => {
  assert.equal(claveDeCompra({ cuit: '', tipo: '', comprobante: '', proveedor: 'PEDRO TELLO' }), null)
})

test('sin comprobante pero con respaldo coincidente (proveedor|fecha|total|concepto) ESCRIBE L de la fila', () => {
  const p = planificarObra({ obras: OBRAS, cambio: CAMBIO_806, encabezado: COMPRAS_CON_OBRA, fila: filaTello(), respaldo: RESPALDO })
  assert.equal(p.accion, 'escribir')
  assert.equal(p.celda, 'Compras!L810')
  assert.equal(p.nota, undefined)
})

test('proveedor distinto en la fila viva: rechaza por huella_distinta con el proveedor adentro', () => {
  const p = planificarObra({ obras: OBRAS, cambio: CAMBIO_806, encabezado: COMPRAS_CON_OBRA, fila: filaTello({ Proveedor: 'JUAN PÉREZ' }), respaldo: RESPALDO })
  assert.equal(p.accion, 'rechazar')
  assert.equal(p.motivo, 'huella_distinta')
  assert.match(p.detalle, /JUAN PÉREZ.*PEDRO TELLO/)
})

test('huella ausente por completo (sin clave, sin respaldo o respaldo sin proveedor): sigue siendo sin_huella', () => {
  for (const respaldo of [null, undefined, {}, { proveedor: '  ', fecha: '2026-09-10', total: 4200000 }]) {
    const p = planificarObra({ obras: OBRAS, cambio: CAMBIO_806, encabezado: COMPRAS_CON_OBRA, fila: filaTello(), respaldo })
    assert.equal(p.accion, 'rechazar')
    assert.equal(p.motivo, 'sin_huella')
    assert.equal(respaldoUsable(respaldo), false)
  }
})

test('fecha, total (más de un peso) o concepto distintos rechazan; un peso de flotante no', () => {
  const casos = [
    [{ 'Fecha factura': SERIAL_10_09_2026 + 1 }, /fecha 2026-09-11/],
    [{ Total: 4200002 }, /total 4200002/],
    [{ Concepto: 'Galpon 7' }, /Concepto/],
  ]
  for (const [extra, re] of casos) {
    const p = planificarObra({ obras: OBRAS, cambio: CAMBIO_806, encabezado: COMPRAS_CON_OBRA, fila: filaTello(extra), respaldo: RESPALDO })
    assert.equal(p.motivo, 'huella_distinta', JSON.stringify(extra))
    assert.match(p.detalle, re)
  }
  const ok = planificarObra({ obras: OBRAS, cambio: CAMBIO_806, encabezado: COMPRAS_CON_OBRA, fila: filaTello({ Total: 4200000.7 }), respaldo: RESPALDO })
  assert.equal(ok.accion, 'escribir')
})

test('el concepto sólo cuenta si compra_sheet lo tiene; proveedor compara sin mayúsculas ni espacios de más', () => {
  const sinConcepto = { ...RESPALDO, concepto: null, proveedor: 'pedro  tello' }
  const p = planificarObra({ obras: OBRAS, cambio: CAMBIO_806, encabezado: COMPRAS_CON_OBRA, fila: filaTello({ Concepto: 'lo que sea' }), respaldo: sinConcepto })
  assert.equal(p.accion, 'escribir')
  assert.equal(compararRespaldo({ proveedor: 'A', fecha: null, total: 10, concepto: null }, { proveedor: 'A', fecha: null, total: 10 }, 9), null)
})

test('con clave de comprobante el respaldo NO se mira: la clave manda', () => {
  const p = planificarObra({ obras: OBRAS, cambio: CAMBIO, encabezado: COMPRAS_CON_OBRA, fila: conObra(''), respaldo: { ...RESPALDO, proveedor: 'OTRO' } })
  assert.equal(p.accion, 'escribir')
})

test('el ID también se compara en el camino del respaldo', () => {
  const p = planificarObra({ obras: OBRAS, cambio: { ...CAMBIO_806, sheet_id: 805 }, encabezado: COMPRAS_CON_OBRA, fila: filaTello(), respaldo: RESPALDO })
  assert.equal(p.motivo, 'huella_distinta')
  assert.match(p.detalle, /ID 806/)
})

test('respaldo resincronizado después del pedido: escribe igual pero lo dice en la nota', () => {
  const p = planificarObra({ obras: OBRAS, cambio: CAMBIO_806, encabezado: COMPRAS_CON_OBRA, fila: filaTello(), respaldo: { ...RESPALDO, resincronizado: true } })
  assert.equal(p.accion, 'escribir')
  assert.match(p.nota, /resincronizado/)
})
