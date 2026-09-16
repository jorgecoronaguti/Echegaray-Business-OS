// LOS GASTOS SIN OBRA ASIGNADA Y EL COSTO A LA FECHA, COMO LOS DIBUJA EL CRM (dueño, 13/09/2026).
//
// ═══ QUÉ DEFECTOS ATRAPA ═══
//
//  1 · QUE EL PIE DEL CLIENTE NO CIERRE CONTRA COMPRAS. Lo que la columna K no atribuye a una obra
//      tiene su propia fila; si el total del pie no la suma, San Francisco publica $ 22,5 M sobre
//      $ 57,65 M comprados y la diferencia se lee como plata que no se gastó.
//  2 · QUE «NO PUDE LEER» SE DIBUJE COMO «NO HAY». `costo_sin_obra` ausente (T1600 sin aplicar) o
//      `null` (rol) es otra cosa que una lista vacía.
//  3 · QUE LO COMPROMETIDO A FUTURO SE SUME COMO COSTO A LA FECHA, o que desaparezca sin nombrarse.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  armarCostosPorObra, armarGastosSinObra, importeSinObra, tituloMateriales, tituloSinObra,
  totalesDelCliente,
} from './costosDeObra.ts'

// San Francisco, medido contra la base el 13/09/2026 (verificar-costo-a-la-fecha-como-direccion).
const SF_OBRAS = [
  { obra_id: 'pisos-industriales', materiales: 22301886, n_comprobantes: 14, corte: '2026-09-13', puede_ver_tarifas: true },
  { obra_id: 'entrepiso-y-escalera', materiales: 108900, n_comprobantes: 1, corte: '2026-09-13', puede_ver_tarifas: true },
  { obra_id: 'instalacion-electrica', materiales: 90500, n_comprobantes: 2, corte: '2026-09-13', puede_ver_tarifas: true },
]
const SF_SIN_OBRA = {
  cliente_id: 'sf', materiales: 35150404, subcontratos: null, n_comprobantes: 151, comprometido_futuro: null,
  corte: '2026-09-13',
  detalles: [{ detalle: '(columna K vacía)', total: 16136863 }, { detalle: 'Trabajo al tanto', total: 4030000 }],
}

test('el pie suma las obras MÁS lo sin obra: San Francisco cierra en lo que Compras le imputa', () => {
  const costos = armarCostosPorObra(SF_OBRAS)!
  const sinObra = armarGastosSinObra([SF_SIN_OBRA])!.get('sf')!
  const t = totalesDelCliente(costos, SF_OBRAS.map((o) => o.obra_id), sinObra)
  assert.equal(t.materiales, 57651690, 'el total del cliente no es la suma de sus obras y lo sin obra')
  assert.equal(t.materialesSinObra, 35150404)
  // Sin la fila sin obra, el total es sólo lo atribuido — y el pie no dice «incl. … sin obra».
  const soloObras = totalesDelCliente(costos, SF_OBRAS.map((o) => o.obra_id))
  assert.equal(soloObras.materiales, 22501286)
  assert.equal(soloObras.materialesSinObra, null)
})

test('«no pude leer los gastos sin obra» y «no hay ninguno» son dos hechos', () => {
  assert.equal(armarGastosSinObra(undefined), null)
  assert.equal(armarGastosSinObra(null), null)
  assert.equal(armarGastosSinObra([])!.size, 0)
  assert.equal(importeSinObra(null), null, 'una fila sin gasto no se dibuja como $ 0')
})

test('la fila sin obra suma subcontratos y su title nombra los detalles, sin repartir', () => {
  const g = armarGastosSinObra([{ ...SF_SIN_OBRA, subcontratos: 865000, comprometido_futuro: 1200 }])!.get('sf')!
  assert.equal(importeSinObra(g), 36015404)
  const t = tituloSinObra(g)!
  assert.match(t, /al 13\/09/)
  assert.match(t, /151 comprobantes/)
  assert.match(t, /\(columna K vacía\) \$16\.136\.863 · Trabajo al tanto \$4\.030\.000/)
  assert.match(t, /No se reparten/)
  assert.match(t, /\$865\.000 de subcontratos/)
  assert.match(t, /\+ \$1\.200 por vencer, que no entra/)
})

test('materiales dice su corte y nombra lo por vencer sin sumarlo', () => {
  const [c] = armarCostosPorObra([{ ...SF_OBRAS[0], materiales_por_vencer: 500000, comprometido_futuro: 500000 }])!.values()
  const t = tituloMateriales(c)!
  assert.match(t, /Compras asignadas a la obra al 13\/09/)
  assert.match(t, /\+ \$500\.000 por vencer, que no entra/)
  assert.equal(c.materiales, 22301886, 'lo futuro no se suma al costo a la fecha')
  // Una obra con SÓLO compras a futuro igual explica su celda «—».
  const [f] = armarCostosPorObra([{ obra_id: 'x', materiales: null, comprometido_futuro: 10, puede_ver_tarifas: true }])!.values()
  assert.match(tituloMateriales(f)!, /por vencer/)
})
