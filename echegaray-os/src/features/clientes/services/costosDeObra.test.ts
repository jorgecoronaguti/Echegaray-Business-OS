import test from 'node:test'
import assert from 'node:assert/strict'
import {
  armarCostosPorObra, armarGastosSinObra, textoManoObra, textoMateriales, textoSubcontratos, textoTotalManoObra,
  textoTotalSubcontratos, tituloManoObra, tituloMateriales, tituloSubcontratos, totalesDelCliente,
} from './costosDeObra.ts'

// ═══ QUÉ DEFECTOS ATRAPA ═══
//
//  1 · QUE UNA AUSENCIA SE DIBUJE COMO UN CERO. Son CUATRO ausencias y se leen distinto: sin compras
//      («—»), sin permiso (vacío), con horas que no se pueden valorizar («sin valorizar») y
//      valorizado a medias (el importe en ámbar).
//  2 · QUE UN TOTAL PARCIAL SE PUBLIQUE COMO COMPLETO. El pie suma lo valorizado y dice cuántas horas
//      quedaron afuera.
//  3 · QUE LOS SUBCONTRATOS DESAPAREZCAN AL EXCLUIRLOS DE MATERIALES.
//  4 · QUE VUELVA EL MULTIPLICADOR O EL VALOR HORA IMPLÍCITO DEL JEFE (20260915T0800): la mano de obra es
//      recibo + negro por quincena, y el `title` no puede volver a explicarla como «× cargas».
//  5 · QUE UN ESTIMADO SE DIBUJE COMO UN REAL: la celda dice «est.».
//  6 · QUE UN `numeric` QUE LLEGA COMO TEXTO DEJE LA CELDA VACÍA TENIENDO EL DATO.
//
// Cambio de contrato (14/09/2026): se fueron `multiplicador` e `implicito` de la RPC, y con ellos los
// casos que los probaban acá. `multiplicadorDeCosto` sigue probado en `costoHora.test.ts`.

/** La fila real de Quattropani, medida contra la base el 12/09/2026, con la forma de 20260915T0800. */
const QUATTROPANI = {
  obra_id: 'quattropani',
  materiales: 42580345.01, subcontratos: 47461.82,
  n_comprobantes: 17, ultimo_comprobante: '2026-09-09',
  mano_obra: null, mano_obra_real: null, mano_obra_estimada: null,
  horas_valorizadas: null, horas_sin_tarifa: 492, personas_sin_tarifa: 4,
  falta_dato: [
    { persona_id: 'a', nombre: 'AGUERO CRISTIAN', quincena: '2026-08-16', horas: '60', origen: 'negro: sin tarifa (FALTA_DATO)' },
    { persona_id: 'a', nombre: 'AGUERO CRISTIAN', quincena: '2026-09-01', horas: '40', origen: 'negro: sin tarifa (FALTA_DATO)' },
  ],
  sellado_hasta: null, puede_ver_tarifas: true,
}

test('las filas de costo_obra se indexan por obra y conservan lo medido', () => {
  const q = armarCostosPorObra([QUATTROPANI])?.get('quattropani')
  assert.equal(q?.materiales, 42580345.01)
  assert.equal(q?.subcontratos, 47461.82)
  assert.equal(q?.nComprobantes, 17)
  assert.equal(q?.ultimoComprobante, '2026-09-09')
  assert.equal(q?.horasSinTarifa, 492)
  assert.deepEqual(q?.faltaDato.map((f) => [f.nombre, f.quincena, f.horas]),
    [['AGUERO CRISTIAN', '2026-08-16', 60], ['AGUERO CRISTIAN', '2026-09-01', 40]])
})

test('un numeric que llega como texto sigue siendo el número', () => {
  const m = armarCostosPorObra([{ ...QUATTROPANI, materiales: '42580345.01', n_comprobantes: '17', mano_obra: '3572782.1' }])
  assert.equal(m?.get('quattropani')?.materiales, 42580345.01)
  assert.equal(m?.get('quattropani')?.nComprobantes, 17)
  assert.equal(m?.get('quattropani')?.manoObra, 3572782.1)
})

test('el null de la RPC NO se vuelve un Map vacío', () => {
  assert.equal(armarCostosPorObra(null), null)
  assert.equal(armarCostosPorObra(undefined), null)
  assert.equal(armarCostosPorObra([])?.size, 0)
})

test('materiales: el importe en es-AR sin decimales, y «—» cuando no hay ninguna compra', () => {
  const m = armarCostosPorObra([QUATTROPANI])!
  assert.equal(textoMateriales(m.get('quattropani')), '$42.580.345')
  assert.equal(textoMateriales(null), '—')
  const sinCompras = armarCostosPorObra([{ ...QUATTROPANI, materiales: null, n_comprobantes: 0 }])!
  assert.equal(textoMateriales(sinCompras.get('quattropani')), '—')
})

test('el title de materiales dice qué entra, cuántos comprobantes y qué quedó aparte', () => {
  const t = tituloMateriales(armarCostosPorObra([QUATTROPANI])!.get('quattropani'))
  assert.match(t!, /Compras asignadas a la obra a la fecha, pagadas y pendientes \(Compras, columna K\) · 17 comprobantes · último 09\/09/)
  assert.match(t!, /No entran nómina, cargas, ARCA ni financiero/)
  assert.match(t!, /\$47\.462 de subcontratos/)
  assert.equal(tituloMateriales(armarCostosPorObra([{ ...QUATTROPANI, materiales: null }])!.get('quattropani')), null)
})

test('un comprobante en singular no dice «1 comprobantes»', () => {
  const t = tituloMateriales(armarCostosPorObra([{ ...QUATTROPANI, n_comprobantes: 1 }])!.get('quattropani'))
  assert.match(t!, /1 comprobante ·/)
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// MANO DE OBRA — LAS CUATRO AUSENCIAS, Y NINGUNA ES UN CERO
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test('con horas y sin nada valorizado la celda dice «sin valorizar», NUNCA $ 0, y nombra a quién falta', () => {
  const c = armarCostosPorObra([QUATTROPANI])!.get('quattropani')
  assert.deepEqual(textoManoObra(c), { texto: 'sin valorizar', parcial: true, estimado: false })
  const t = tituloManoObra(c, '2026-08-17')
  assert.match(t!, /492 h cargadas y SIN VALORIZAR · desde 17\/08/)
  assert.match(t!, /4 personas sin dato \(tarifa en negro o neto mensual\): AGUERO CRISTIAN\./)
})

test('sin horas y sin compras la celda dice «—», y eso NO es un hueco de dato', () => {
  const c = armarCostosPorObra([{
    ...QUATTROPANI, materiales: null, n_comprobantes: 0, horas_sin_tarifa: null, personas_sin_tarifa: 0, falta_dato: [],
  }])!.get('quattropani')
  assert.deepEqual(textoManoObra(c), { texto: '—', parcial: false, estimado: false })
  assert.equal(tituloManoObra(c, null), null)
})

test('sin permiso para leer recibos y tarifas la celda queda VACÍA, no «sin valorizar»', () => {
  const c = armarCostosPorObra([{ ...QUATTROPANI, puede_ver_tarifas: false }])!.get('quattropani')
  assert.deepEqual(textoManoObra(c), { texto: '', parcial: false, estimado: false })
  assert.match(tituloManoObra(c, '2026-08-17')!, /No puedo valorizar/)
})

test('valorizado COMPLETO con recibos: el importe, y el title explica recibo + negro, sin multiplicador', () => {
  const c = armarCostosPorObra([{
    ...QUATTROPANI, mano_obra: 4_152_000, mano_obra_real: 4_152_000, horas_valorizadas: 492,
    horas_sin_tarifa: null, personas_sin_tarifa: 0, falta_dato: [], sellado_hasta: '2026-08-31', corte: '2026-09-14',
  }])!.get('quattropani')
  assert.deepEqual(textoManoObra(c), { texto: '$4.152.000', parcial: false, estimado: false })
  const t = tituloManoObra(c, '2026-08-17')!
  assert.match(t, /492 h · desde 17\/08 hasta 14\/09: costo total empleador del recibo \+ parte en negro/)
  assert.match(t, /\$4\.152\.000 con recibo del estudio/)
  assert.match(t, /Quincenas selladas hasta 31\/08; la abierta, en vivo/)
  assert.match(t, /los subcontratos van aparte/)
  // EL DEFECTO VIEJO NO VUELVE POR EL TEXTO: ni «× cargas (×1,671)» ni «valor hora implícito».
  assert.doesNotMatch(t, /cargas \(×|implícito|multiplicador/)
})

test('lo estimado se marca: la celda dice que hay estimado y el title cuánto', () => {
  const c = armarCostosPorObra([{
    ...QUATTROPANI, mano_obra: 3_572_782, mano_obra_real: null, mano_obra_estimada: 3_572_782,
    horas_valorizadas: 318, horas_sin_tarifa: null, personas_sin_tarifa: 0, falta_dato: [],
  }])!.get('quattropani')
  assert.equal(textoManoObra(c).estimado, true)
  assert.match(tituloManoObra(c, null)!, /\$3\.572\.782 ESTIMADO \(quincenas sin recibo todavía\)/)
  assert.match(tituloManoObra(c, null)!, /Ninguna quincena sellada/)
})

test('valorizado a medias: el importe va en ámbar y el title dice cuántas horas y quién falta', () => {
  const c = armarCostosPorObra([{
    ...QUATTROPANI, mano_obra: 1_000_000, mano_obra_real: 1_000_000, horas_valorizadas: 120,
    horas_sin_tarifa: 372, personas_sin_tarifa: 3,
  }])!.get('quattropani')
  const celda = textoManoObra(c)
  assert.equal(celda.texto, '$1.000.000')
  assert.equal(celda.parcial, true, 'un importe al que le faltan 372 h no se dibuja como completo')
  const t = tituloManoObra(c, '2026-08-17')!
  assert.match(t, /^PARCIAL/)
  assert.match(t, /Quedan 372 h sin valorizar: 3 personas sin dato/)
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// EL PIE DE LA TABLA
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test('el pie suma las mismas filas que la tabla, y un total parcial o estimado lo declara', () => {
  const m = armarCostosPorObra([
    { ...QUATTROPANI, obra_id: 'a', materiales: 100, mano_obra: 10, mano_obra_estimada: 4, horas_valorizadas: 1, horas_sin_tarifa: null },
    { ...QUATTROPANI, obra_id: 'b', materiales: 50, mano_obra: 5, horas_valorizadas: 1, horas_sin_tarifa: 8 },
    { ...QUATTROPANI, obra_id: 'c', materiales: null, mano_obra: null, horas_sin_tarifa: null },
  ])!
  const t = totalesDelCliente(m, ['a', 'b', 'c'])
  assert.equal(t.materiales, 150)
  assert.equal(t.manoObra, 15)
  assert.equal(t.manoObraParcial, true)
  assert.equal(t.manoObraEstimada, 4)
  assert.equal(t.horasSinValorizar, 8)
  assert.deepEqual(textoTotalManoObra(t), { texto: '$15', parcial: true, estimado: true })
  assert.equal(totalesDelCliente(m, ['a']).materiales, 100)
})

test('«no pude leerlos» y «no hay ninguno» son DOS hechos, y el pie los distingue', () => {
  assert.equal(totalesDelCliente(null, ['quattropani']).legible, false)
  assert.equal(totalesDelCliente(armarCostosPorObra([QUATTROPANI])!, ['quattropani']).legible, true)
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// SUBCONTRATOS (dueño, 14/09/2026): su columna, y la reclasificación no cambia el costo directo
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test('SUBCONTRATOS: su columna, con proveedor y comprobante en el title', () => {
  const c = armarCostosPorObra([{
    ...QUATTROPANI, materiales: 37380345.01, subcontratos: 5247461.82, n_subcontratos: 6,
    subcontratos_detalle: [
      { proveedor: 'Pedro Fredes', comprobante: null, fecha: '2026-08-24', total: '1040000', motivo: 'proveedor' },
      { proveedor: 'Pedro Tello', comprobante: 'A 0003-00012345', fecha: '2026-08-31', total: 47461.82, motivo: 'proveedor' },
    ],
  }])!.get('quattropani')
  assert.equal(textoSubcontratos(c), '$5.247.462')
  const t = tituloSubcontratos(c)!
  assert.match(t, /Pedro Fredes · 24\/08 · \$1\.040\.000/)
  assert.match(t, /Pedro Tello · A 0003-00012345 · 31\/08 · \$47\.462/)
  // LA FAMILIA POR TEXTO YA NO RECLASIFICA (auditor, 14/09/2026): el title no puede volver a nombrarla.
  assert.doesNotMatch(t, /por familia|familia «Subcontratos/)
  assert.match(t, /No están en Materiales ni en Mano de obra/)
  assert.equal(textoSubcontratos(armarCostosPorObra([{ ...QUATTROPANI, subcontratos: null }])!.get('quattropani')), '—')
  assert.equal(tituloSubcontratos(armarCostosPorObra([{ ...QUATTROPANI, subcontratos: null, subcontratos_detalle: [] }])!.get('quattropani')), null)
})

test('el total del cliente suma subcontratos APARTE: materiales no los incluye y el costo directo no cambia', () => {
  const m = armarCostosPorObra([
    { ...QUATTROPANI, obra_id: 'a', materiales: 100, subcontratos: 40 },
    { ...QUATTROPANI, obra_id: 'b', materiales: 50, subcontratos: null },
  ])!
  const sinObra = armarGastosSinObra([{ cliente_id: 'c', materiales: 30, subcontratos: 7, n_comprobantes: 2 }])!.get('c')!
  const t = totalesDelCliente(m, ['a', 'b'], sinObra)
  assert.equal(t.materiales, 180, 'los subcontratos sin obra no pueden sumarse en Materiales')
  assert.equal(t.subcontratos, 47)
  assert.equal(textoTotalSubcontratos(t), '$47')
  assert.equal((t.materiales ?? 0) + (t.subcontratos ?? 0), 100 + 40 + 50 + 30 + 7, 'reclasificar cambió el costo directo')
})

test('sin nada valorizado el pie dice null, no 0 — y sin costos tampoco', () => {
  const t = totalesDelCliente(armarCostosPorObra([QUATTROPANI])!, ['quattropani'])
  assert.equal(t.manoObra, null, 'un 0 acá se leería como «la mano de obra del cliente costó cero»')
  assert.equal(t.manoObraParcial, true)
  assert.equal(t.horasSinValorizar, 492)
  const vacio = totalesDelCliente(null, ['quattropani'])
  assert.equal(vacio.materiales, null)
  assert.equal(vacio.manoObra, null)
})
