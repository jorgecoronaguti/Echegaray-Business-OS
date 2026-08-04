// LOS FIXTURES DE ESTE ARCHIVO NO SON INVENTADOS: son las celdas REALES de la pestaña viva, leídas
// el 03/08/2026 del 'Flujo de Caja - Cash Flow'. Un test contra una fórmula de mentira prueba que el
// detector funciona contra mi propia idea del defecto; contra la fórmula que el dueño está mirando
// ahora mismo, prueba que atrapa EL defecto.
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  defectosDeBloque, geometriaSeccion1, planDeEscritura, proveedoresCableados, referenciasAFilaFija,
  ROTULOS_CONTRATO,
} from './proveedores-bloque-vivo.mjs'
import { formulaPorFactura, formulaPorProveedor, referenciasCompras, esRangoAbierto } from './proveedores-deuda-viva.mjs'

/** Proveedores!A18 — la fila-cabecera de Gruas San Blas, tal cual está hoy en el archivo. */
const A18_VIVA = '=IF(ROUND(SUMIFS(Compras!$O$4:$O;Compras!$E$4:$E;"Gruas San Blas";Compras!$X$4:$X;"Pendiente")'
  + '-SUMIFS(Compras!$T$4:$T;Compras!$E$4:$E;"Gruas San Blas";Compras!$X$4:$X;"Pendiente")'
  + '-SUMIFS(Compras!$U$4:$U;Compras!$E$4:$E;"Gruas San Blas";Compras!$X$4:$X;"Pendiente";Compras!$U$4:$U;">0")'
  + '-SUMIFS(Compras!$W$4:$W;Compras!$E$4:$E;"Gruas San Blas";Compras!$X$4:$X;"Pendiente";Compras!$W$4:$W;">0");0)>0;"Gruas San Blas";"")'

/** Proveedores!B19 — la fila de detalle de su única factura pendiente, tal cual está hoy. */
const B19_VIVA = '=IF(Compras!$X$796="Pendiente";Compras!$AD$796;"")'

/** Proveedores!B5 — el titular. Tiene literales, pero contra la columna de ESTADO: no es defecto. */
const B5_VIVA = '=SUMIFS(Compras!$O$4:$O;Compras!$X$4:$X;"Pendiente";Compras!$AJ$4:$AJ;1)'
  + '-SUMIFS(Compras!$T$4:$T;Compras!$X$4:$X;"Pendiente";Compras!$AJ$4:$AJ;1)'

/** Los rótulos que el dueño tiene puestos en Proveedores!A17:H17, textuales. */
const ENCABEZADOS_VIVOS = ['Proveedor / factura', 'Próximo pago', 'Comprobante', 'Importe', 'Obra', 'Tipo de Pago', 'Categoría', 'Comentarios']

const RANGOS = {
  prov: 'Compras!$E$4:$E', estado: 'Compras!$X$4:$X', comercial: 'Compras!$AJ$4:$AJ',
  total: 'Compras!$O$4:$O', pagado: 'Compras!$T$4:$T', parcial1: 'Compras!$U$4:$U',
  parcial2: 'Compras!$W$4:$W', fecha: 'Compras!$AD$4:$AD', comprobante: 'Compras!$H$4:$H',
  obra: 'Compras!$J$4:$J', tipoPago: 'Compras!$P$4:$P', categoria: 'Compras!$B$4:$B',
}

// ═══ EL DEFECTO 2 DEL DUEÑO: "me deja huecos cdo se va un q fue pagado" ═══════════════════════════

test('la fila-cabecera VIVA deja hueco: el nombre del proveedor está cableado en la celda', () => {
  assert.deepEqual(proveedoresCableados(A18_VIVA, RANGOS.prov), ['Gruas San Blas'])
  const { ok, huecos } = defectosDeBloque([{ dir: 'A18', formula: A18_VIVA }])
  assert.equal(ok, false)
  assert.equal(huecos.length, 1)
  assert.equal(huecos[0].proveedor, 'Gruas San Blas')
})

test('un literal contra la columna de ESTADO no es un hueco — el titular no puede dar falso positivo', () => {
  assert.deepEqual(proveedoresCableados(B5_VIVA, RANGOS.prov), [])
  assert.equal(defectosDeBloque([{ dir: 'B5', formula: B5_VIVA }]).ok, true)
})

// ═══ EL DEFECTO 1 DEL DUEÑO: "no se actualiza sola" ═══════════════════════════════════════════════

test('la fila de detalle VIVA está ciega: apunta a la fila 796 de Compras y a ninguna otra', () => {
  assert.deepEqual(referenciasAFilaFija(B19_VIVA), ['Compras!$X$796', 'Compras!$AD$796'])
  const { ok, ciegas } = defectosDeBloque([{ dir: 'B19', formula: B19_VIVA }])
  assert.equal(ok, false)
  assert.equal(ciegas.length, 2)
})

test('un rango ABIERTO no es una fila fija — la referencia que SÍ ve lo nuevo no se marca', () => {
  assert.deepEqual(referenciasAFilaFija('=SUMIFS(Compras!$O$4:$O;Compras!$X$4:$X;"Pendiente")'), [])
})

// ═══ LA CURA: LAS FÓRMULAS VIVAS NO TIENEN NINGUNO DE LOS DOS DEFECTOS ════════════════════════════

test('las dos fórmulas vivas pasan el mismo auditor que reprueba al bloque de hoy', () => {
  const celdas = [
    { dir: 'A18', formula: formulaPorFactura({ rangos: RANGOS, reserva: 20 }) },
    { dir: 'A18', formula: formulaPorProveedor({ rangos: RANGOS, libreta: 'PROV_LIBRETA', reserva: 20 }) },
  ]
  assert.deepEqual(defectosDeBloque(celdas), { ok: true, huecos: [], ciegas: [] })
})

test('toda referencia a Compras de la fórmula viva es un rango ABIERTO', () => {
  const f = formulaPorFactura({ rangos: RANGOS, reserva: 20 })
  const refs = referenciasCompras(f)
  assert.ok(refs.length > 0, 'la fórmula tiene que mirar Compras')
  for (const r of refs) assert.ok(esRangoAbierto(r), `referencia acotada: ${r}`)
})

test('un proveedor sin saldo NO ocupa fila: el bloque filtra por saldo antes de derramar', () => {
  const f = formulaPorProveedor({ rangos: RANGOS, libreta: 'PROV_LIBRETA', reserva: 20 })
  // El derrame se arma sobre `viva`, que es `base` ya filtrada por saldo > 0. Si el SORT se armara
  // sobre `base`, el pagado volvería a ocupar su renglón — que es el hueco de hoy con otra forma.
  assert.match(f, /viva;FILTER\(base;ROUND\(saldo;0\)>0\)/)
  assert.match(f, /SORT\(viva;/)
  assert.doesNotMatch(f, /SORT\(base;/)
})

// ═══ EL FORMATO DEL DUEÑO ES EL CONTRATO ══════════════════════════════════════════════════════════

test('con los rótulos VIVOS el plan sale, ancla en A18 y NO reclama la columna Comentarios', () => {
  const plan = planDeEscritura({ encabezados: ENCABEZADOS_VIVOS, filaEncabezado: 17, filaLimite: 38, pendientes: 11 })
  assert.equal(plan.ok, true)
  assert.equal(plan.ancla, 'A18')
  assert.equal(plan.ancho, 7)
  assert.match(plan.rango, /^A18:G\d+$/)
  assert.deepEqual(plan.columnasDelDueño, [{ columna: 'H', rotulo: 'Comentarios' }])
  assert.deepEqual(plan.avisos, [], 'con 11 pendientes el aire entra: no hay nada que avisar')
})

test('"Proveedor / factura" y "Tipo de Pago" son rótulos del DUEÑO: el plan se adapta a su grafía', () => {
  const plan = planDeEscritura({ encabezados: ENCABEZADOS_VIVOS, filaEncabezado: 17, filaLimite: 38, pendientes: 0 })
  assert.equal(plan.ok, true)
  assert.equal(ROTULOS_CONTRATO[0].clave, 'prov')
  assert.equal(ROTULOS_CONTRATO[5].clave, 'tipoPago')
})

test('si el dueño reordena una columna NO se escribe: un derrame no puede reordenar', () => {
  const movidos = ['Proveedor / factura', 'Comprobante', 'Próximo pago', 'Importe', 'Obra', 'Tipo de Pago', 'Categoría', 'Comentarios']
  const plan = planDeEscritura({ encabezados: movidos, filaEncabezado: 17, filaLimite: 38, pendientes: 5 })
  assert.equal(plan.ok, false)
  assert.match(plan.motivo, /otro orden/)
})

test('si falta un rótulo del contrato NO se escribe, y se dice cuál falta', () => {
  const sinObra = ['Proveedor / factura', 'Próximo pago', 'Comprobante', 'Importe', '', 'Tipo de Pago', 'Categoría']
  const plan = planDeEscritura({ encabezados: sinObra, filaEncabezado: 17, filaLimite: 38, pendientes: 5 })
  assert.equal(plan.ok, false)
  assert.match(plan.motivo, /obra/)
})

test('si los pendientes de HOY no entran antes de la sección 2 NO se escribe: sería una deuda recortada', () => {
  const plan = planDeEscritura({ encabezados: ENCABEZADOS_VIVOS, filaEncabezado: 17, filaLimite: 24, pendientes: 40 })
  assert.equal(plan.ok, false)
  assert.match(plan.motivo, /no entra/)
  assert.match(plan.motivo, /lo decide el dueño/)
})

test('que no entre el COLCHÓN no es motivo para no escribir: se acota y se avisa', () => {
  // La geometría REAL del 03/08: 20 filas entre la 18 y la 38, y 13 facturas pendientes. El aire
  // recomendado (21) no entra, pero los 13 pendientes sí. Negarse acá dejaría la pestaña rota por
  // prolijidad — y ese fue el resultado literal de la primera corrida del plan.
  const plan = planDeEscritura({ encabezados: ENCABEZADOS_VIVOS, filaEncabezado: 17, filaLimite: 38, pendientes: 13 })
  assert.equal(plan.ok, true)
  assert.equal(plan.reserva, 20)
  assert.equal(plan.rango, 'A18:G37', 'el derrame no puede pisar la fila 38, donde arranca la sección 2')
  assert.equal(plan.avisos.length, 1)
  assert.match(plan.avisos[0], /colchón quedó corto/)
})

// ═══ LA GEOMETRÍA SE ANCLA AL TEXTO, NO A LA FILA ═════════════════════════════════════════════════

/** La forma real de la pestaña (03/08): título en la 14, rótulos en la 17, sección 2 en la 38. */
const PESTAÑA_VIVA = () => {
  const filas = Array.from({ length: 45 }, () => [])
  filas[0] = ['Proveedores']
  filas[13] = ['1 · QUÉ SE DEBE Y CUÁNDO']
  filas[16] = ENCABEZADOS_VIVOS
  filas[17] = [A18_VIVA]
  filas[18] = ['', B19_VIVA]
  filas[37] = ['2 · CUENTA CORRIENTE POR PROVEEDOR']
  filas[39] = ['Proveedor', 'CUIT', 'Comprobantes', 'Comprado 2026', 'Plazo promedio', 'Qué se le compra']
  return filas
}

test('la geometría sale de los títulos del dueño: encabezado en la 17, límite en la 38', () => {
  const geo = geometriaSeccion1(PESTAÑA_VIVA())
  assert.equal(geo.filaEncabezado, 17)
  assert.equal(geo.filaLimite, 38)
  assert.deepEqual(geo.encabezados, ENCABEZADOS_VIVOS)
})

test('si el dueño inserta dos filas arriba, el ancla se corre con él y no queda apuntando al vacío', () => {
  const geo = geometriaSeccion1([[], [], ...PESTAÑA_VIVA()])
  assert.equal(geo.filaEncabezado, 19)
  assert.equal(planDeEscritura({ ...geo, pendientes: 11 }).ancla, 'A20')
})

test('los rótulos de la CUENTA CORRIENTE no son los de la sección 1 — el plan nunca cae ahí', () => {
  const geo = geometriaSeccion1(PESTAÑA_VIVA())
  const plan = planDeEscritura({ ...geo, pendientes: 11 })
  // La columna B de la sección 2 es el CUIT, cargado a mano. El rango del plan termina en la fila 37.
  assert.ok(Number(/:[A-Z]+(\d+)$/.exec(plan.rango)?.[1]) < geo.filaLimite, `${plan.rango} invade la sección 2`)
})
