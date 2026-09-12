import test from 'node:test'
import assert from 'node:assert/strict'
import {
  armarCostosPorObra, textoManoObra, textoMateriales, tituloManoObra, tituloMateriales,
  totalesDelCliente,
} from './costosDeObra.ts'
import { alicuotasVigentes, multiplicadorDeCosto } from '../../administracion/services/costoHora.ts'

// ═══ QUÉ DEFECTOS ATRAPA ═══
//
//  1 · QUE UNA AUSENCIA SE DIBUJE COMO UN CERO. Son CUATRO ausencias y se leen distinto: sin compras
//      («—»), sin permiso (vacío), con horas que no se pueden valorizar («sin valorizar») y
//      valorizado a medias (el importe en ámbar). Si «sin valorizar» se dibujara «$ 0», la ficha
//      diría que una obra con 9.293 h no tuvo mano de obra — y hoy TODAS están en ese caso, porque
//      `costo_hora_alicuota` está vacía.
//  2 · QUE UN TOTAL PARCIAL SE PUBLIQUE COMO COMPLETO. El pie suma lo valorizado; si no dice cuántas
//      horas quedaron afuera, el número se lee como el costo de mano de obra del cliente.
//  3 · QUE LOS SUBCONTRATOS DESAPAREZCAN AL EXCLUIRLOS DE MATERIALES. Salen de la columna por no ser
//      material y tienen que quedar nombrados en el `title`; si no, son plata que la obra gastó y
//      ninguna cara del OS muestra.
//  4 · QUE EL MULTIPLICADOR DE LA RPC NO SEA EL DE LIQUIDACIÓN. El último caso compara la fórmula de
//      `multiplicador_de_costo` en SQL contra `multiplicadorDeCosto()` de TypeScript, que es la que
//      usa la solapa «Costo a la obra». Las dos implementaciones conviven por necesidad —la suma
//      cruza el cable agregada— y sin una comparación se separan en el primer cambio.
//  5 · QUE UN `numeric` QUE LLEGA COMO TEXTO DEJE LA CELDA VACÍA TENIENDO EL DATO.

/** La fila real de Quattropani, medida contra la base el 12/09/2026. */
const QUATTROPANI = {
  obra_id: 'quattropani',
  materiales: 42580345.01, subcontratos: 47461.82,
  n_comprobantes: 17, ultimo_comprobante: '2026-09-09',
  mano_obra: null, horas_valorizadas: null, horas_sin_tarifa: 492,
  personas_sin_tarifa: 4, multiplicador: null, puede_ver_tarifas: true,
}

test('las filas de costo_obra se indexan por obra y conservan lo medido', () => {
  const m = armarCostosPorObra([QUATTROPANI])
  assert.ok(m)
  const q = m.get('quattropani')
  assert.equal(q?.materiales, 42580345.01)
  assert.equal(q?.subcontratos, 47461.82)
  assert.equal(q?.nComprobantes, 17)
  assert.equal(q?.ultimoComprobante, '2026-09-09')
  assert.equal(q?.horasSinTarifa, 492)
  assert.equal(q?.multiplicador, null)
})

test('un numeric que llega como texto sigue siendo el número', () => {
  const m = armarCostosPorObra([{ ...QUATTROPANI, materiales: '42580345.01', n_comprobantes: '17' }])
  assert.equal(m?.get('quattropani')?.materiales, 42580345.01)
  assert.equal(m?.get('quattropani')?.nComprobantes, 17)
})

test('el null de la RPC NO se vuelve un Map vacío', () => {
  // `null` = no puedo decirlo (rol o cara); `[]` = ningún trabajo gastó nada. La pantalla dibuja
  // vacío en el primer caso y «—» en el segundo, y ésta es la única capa donde se pueden confundir.
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
  assert.match(t!, /Compras imputadas a la obra · 17 comprobantes · último 09\/09/)
  // LO QUE NO ENTRA, DICHO: sin esta frase la diferencia contra el «costo real» de la ficha de la
  // obra se lee como un error de uno de los dos números.
  assert.match(t!, /no entran nómina, cargas, ARCA ni financiero/)
  // Y LOS SUBCONTRATOS QUEDAN NOMBRADOS: salieron de la columna, no del sistema.
  assert.match(t!, /\$47\.462 de subcontratos/)
  // Sin compras no hay nada que respaldar: el title no inventa una explicación.
  assert.equal(tituloMateriales(armarCostosPorObra([{ ...QUATTROPANI, materiales: null }])!.get('quattropani')), null)
})

test('un comprobante en singular no dice «1 comprobantes»', () => {
  const t = tituloMateriales(armarCostosPorObra([{ ...QUATTROPANI, n_comprobantes: 1 }])!.get('quattropani'))
  assert.match(t!, /1 comprobante ·/)
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// MANO DE OBRA — LAS CUATRO AUSENCIAS, Y NINGUNA ES UN CERO
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test('con horas y sin alícuotas la celda dice «sin valorizar», NUNCA $ 0', () => {
  // EL CASO REAL DE HOY (12/09/2026): `costo_hora_alicuota` tiene cero filas, así que ninguna hora
  // de ninguna obra se puede convertir en costo. Un «$ 0» afirmaría que Quattropani no tuvo mano de
  // obra sobre 492 horas cargadas.
  const c = armarCostosPorObra([QUATTROPANI])!.get('quattropani')
  const celda = textoManoObra(c)
  assert.equal(celda.texto, 'sin valorizar')
  assert.equal(celda.parcial, true, 'la celda tiene que pedir trabajo: falta un dato que se puede cargar')
  const t = tituloManoObra(c, '2026-08-17')
  assert.match(t!, /492 h cargadas y SIN VALORIZAR · desde 17\/08/)
  assert.match(t!, /faltan las alícuotas de costo/)
  assert.match(t!, /4 personas sin valor hora/)
})

test('sin horas y sin compras la celda dice «—», y eso NO es un hueco de dato', () => {
  const c = armarCostosPorObra([{
    ...QUATTROPANI, materiales: null, n_comprobantes: 0,
    horas_sin_tarifa: null, personas_sin_tarifa: 0,
  }])!.get('quattropani')
  assert.deepEqual(textoManoObra(c), { texto: '—', parcial: false })
  // «—» es la base contestando que no hay ninguna hora: no hay nada que explicar ni que cargar.
  assert.equal(tituloManoObra(c, null), null)
})

test('sin permiso para leer las tarifas la celda queda VACÍA, no «sin valorizar»', () => {
  // `persona_tarifa` y `costo_hora_alicuota` tienen RLS por `liquida_sueldos()`, más angosto que
  // `es_administracion()`. «Sin valorizar» diría «falta cargar un dato» y lo que falta es permiso:
  // son dos hechos distintos y el segundo no se arregla cargando nada.
  const c = armarCostosPorObra([{ ...QUATTROPANI, puede_ver_tarifas: false }])!.get('quattropani')
  assert.deepEqual(textoManoObra(c), { texto: '', parcial: false })
  assert.match(tituloManoObra(c, '2026-08-17')!, /No puedo valorizar/)
})

test('valorizado COMPLETO: el importe, y el title muestra la cuenta', () => {
  const c = armarCostosPorObra([{
    ...QUATTROPANI, mano_obra: 4_152_000, horas_valorizadas: 492,
    horas_sin_tarifa: null, personas_sin_tarifa: 0, multiplicador: 1.524,
  }])!.get('quattropani')
  assert.deepEqual(textoManoObra(c), { texto: '$4.152.000', parcial: false })
  const t = tituloManoObra(c, '2026-08-17')
  assert.match(t!, /492 h × tarifa vigente × cargas \(×1,524\) · desde 17\/08/)
  assert.match(t!, /los subcontratos van aparte/)
})

test('valorizado a medias: el importe va en ámbar y el title dice cuántas horas faltan', () => {
  const c = armarCostosPorObra([{
    ...QUATTROPANI, mano_obra: 1_000_000, horas_valorizadas: 120,
    horas_sin_tarifa: 372, personas_sin_tarifa: 3, multiplicador: 1.524,
  }])!.get('quattropani')
  const celda = textoManoObra(c)
  assert.equal(celda.texto, '$1.000.000')
  assert.equal(celda.parcial, true, 'un importe al que le faltan 372 h no se dibuja como completo')
  const t = tituloManoObra(c, '2026-08-17')
  assert.match(t!, /^PARCIAL/)
  assert.match(t!, /Quedan 372 h sin valorizar/)
  assert.match(t!, /3 personas sin valor hora/)
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// EL PIE DE LA TABLA
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test('el pie suma las mismas filas que la tabla, y un total parcial lo declara', () => {
  const m = armarCostosPorObra([
    { ...QUATTROPANI, obra_id: 'a', materiales: 100, mano_obra: 10, horas_valorizadas: 1, horas_sin_tarifa: null },
    { ...QUATTROPANI, obra_id: 'b', materiales: 50, mano_obra: 5, horas_valorizadas: 1, horas_sin_tarifa: 8 },
    { ...QUATTROPANI, obra_id: 'c', materiales: null, mano_obra: null, horas_sin_tarifa: null },
  ])!
  const t = totalesDelCliente(m, ['a', 'b', 'c'])
  assert.equal(t.materiales, 150)
  assert.equal(t.manoObra, 15)
  assert.equal(t.manoObraParcial, true)
  assert.equal(t.horasSinValorizar, 8)
  // UNA OBRA QUE NO ESTÁ EN EL MAP NO SUMA NI RESTA: el pie no inventa una fila que la RPC no mandó.
  assert.equal(totalesDelCliente(m, ['a']).materiales, 100)
})

test('«no pude leerlos» y «no hay ninguno» son DOS hechos, y el pie los distingue', () => {
  // ═══ EL DEFECTO, VISTO EN LA CAPTURA (Quattropani, 12/09/2026) ═══
  //
  // Con la clave sin llegar —la migración todavía no aplicada— las celdas de la tabla quedaban
  // vacías (correcto) y el PIE de abajo escribía «MATERIALES —» y «MANO DE OBRA sin valorizar»: dos
  // afirmaciones sobre datos que no había leído. «—» dice «ningún trabajo tiene una compra
  // imputada» y Quattropani tiene 17 por $ 42,6 M.
  assert.equal(totalesDelCliente(null, ['quattropani']).legible, false)
  assert.equal(totalesDelCliente(armarCostosPorObra([QUATTROPANI])!, ['quattropani']).legible, true)
})

test('sin nada valorizado el pie dice null, no 0 — y sin costos tampoco', () => {
  const m = armarCostosPorObra([QUATTROPANI])!
  const t = totalesDelCliente(m, ['quattropani'])
  assert.equal(t.manoObra, null, 'un 0 acá se leería como «la mano de obra del cliente costó cero»')
  assert.equal(t.manoObraParcial, true)
  assert.equal(t.horasSinValorizar, 492)
  const vacio = totalesDelCliente(null, ['quattropani'])
  assert.equal(vacio.materiales, null)
  assert.equal(vacio.manoObra, null)
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// LA MISMA REGLA QUE LIQUIDACIÓN — LA PARTE QUE SE PUEDE PROBAR SIN LA BASE
//
// `public.multiplicador_de_costo(fecha)` (SQL) y `multiplicadorDeCosto(vigentes, 1)` (TS) tienen que
// dar lo mismo. La comparación contra la base real vive en `costo-por-obra.pg.test.mjs`; acá se fija
// la fórmula de TypeScript —que es la que la solapa «Costo a la obra» usa de verdad— para que un
// cambio en ella obligue a tocar también el SQL, que es lo que el test pg compara.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

const ALICUOTAS = [
  { concepto: 'cargas_sociales' as const, desde: '2026-01-01', porcentaje: 26.4, base: 'declarado' as const, fuente: 'handoff §5' },
  { concepto: 'art' as const, desde: '2026-01-01', porcentaje: 7.2, base: 'declarado' as const, fuente: 'handoff §5' },
  { concepto: 'fondo_cese' as const, desde: '2026-01-01', porcentaje: 8, base: 'total' as const, fuente: 'handoff §5' },
]

test('el multiplicador con proporción declarada 1 es 1 + Σ porcentaje/100, y sin alícuotas es null', () => {
  const v = alicuotasVigentes(ALICUOTAS, '2026-09-12')
  assert.equal(multiplicadorDeCosto(v, 1).valor, 1 + (26.4 + 7.2 + 8) / 100)
  // SIN UNA SOLA ALÍCUOTA VIGENTE, NULL — nunca 1. Es el estado REAL de la base hoy, y el que hace
  // que la columna diga «sin valorizar» en las trece obras.
  assert.equal(multiplicadorDeCosto(alicuotasVigentes(ALICUOTAS, '2025-12-31'), 1).valor, null)
  assert.equal(multiplicadorDeCosto({}, 1).valor, null)
  // Y LA VIGENTE NO ES LA ÚLTIMA FILA: una alícuota que arranca mañana no cambia lo de hoy.
  const futura = [...ALICUOTAS, { ...ALICUOTAS[0], desde: '2026-10-01', porcentaje: 30 }]
  assert.equal(multiplicadorDeCosto(alicuotasVigentes(futura, '2026-09-12'), 1).valor,
    1 + (26.4 + 7.2 + 8) / 100)
})
