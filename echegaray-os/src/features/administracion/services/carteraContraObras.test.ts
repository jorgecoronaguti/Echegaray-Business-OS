// LA FILA DEL TRABAJO EN `/clientes` REPRODUCE LA FILA DE LA PESTAÑA OBRAS. MISMAS COLUMNAS, MISMOS
// NÚMEROS.
//
// ═══ EL DEFECTO QUE ESTE ARCHIVO IMPIDE (10/09/2026, cruce en vivo contra el Sheet) ═══
//
// El dueño puso la pantalla al lado de la pestaña OBRAS del «Flujo de Caja - Cash Flow» y los
// números no eran los mismos EN NINGUNA de las nueve obras. La causa no era una cuenta mal hecha:
// la app dibujaba `obra_cobranza.cobrado_neto` —SIN IVA— en una columna que en OBRAS es «Cobrado
// (total)», con IVA. Dos sistemas diciendo distinto del mismo hecho, que es el conflicto que la
// REALIDAD ÚNICA existe para cerrar.
//
// LA TABLA DE ABAJO ES LA PESTAÑA OBRAS, LEÍDA EL 10/09/2026 A LAS 17:20. No es una invención de
// prueba: es el estado del Sheet ese día, con su total al pie. Si alguien vuelve a dibujar el neto
// donde va el total, o suelta una de las cuatro columnas, este archivo se pone rojo con el nombre
// de la obra.
//
// ═══ LO QUE ESTE TEST *NO* PRUEBA, Y HAY QUE DECIRLO ═══
//
// Prueba el MAPEO —que lo que la vista publica llega intacto a la fila— y no que la vista publique
// estos números. Hoy no puede: `cobranza_imputacion` tiene 0 filas (medido el 10/09/2026 contra la
// base), así que `obra_cobranza` no reparte nada por obra y `vencido` / `proximo_cobro` todavía no
// son columnas de la vista. Mientras eso siga así, las celdas quedan VACÍAS en pantalla —nunca en
// cero— y este test cuida el día en que la migración las encienda.

import test from 'node:test'
import assert from 'node:assert/strict'
import type { ClientePanel } from '@/features/clientes/types'
import { armarCartera, type CobroDeObra, type ObraDeCartera } from './homeCartera.ts'
import type { EconomiaDeObra } from '@/features/clientes/services/economiaObras'

/** OBRA · contratado (neto) · cobrado (TOTAL, c/IVA) · por cobrar · ▲ vencido · próx. · medio. */
const OBRAS: [string, string, number, number | null, number, number | null, string, string][] = [
  ['messina', 'messina-pisos-120-rampa', 9_463_142, 8_465_136, 2_848_649, null, '2026-09-29', 'Transferencia'],
  ['messina', 'messina-bsa', 14_120_243, 4_848_135, 12_157_138, 12_157_138, '2026-09-17', 'Transferencia'],
  ['san-francisco', 'sf-pisos-industriales', 47_590_272, 13_794_360, 10_000_776, 10_000_776, '2026-09-18', 'Efectivo'],
  ['san-francisco', 'sf-instalacion-electrica', 40_000_000, 12_100_000, 10_000_000, 10_000_000, '2026-09-18', 'Efectivo'],
  ['san-francisco', 'sf-entrepiso-escalera', 7_728_254, 1_932_064, 1_932_064, 1_932_064, '2026-09-18', 'Efectivo'],
  ['quattropani', 'quattropani', 95_304_066, 107_877_569, 52_357_555, null, '2026-09-25', 'Transferencia'],
  ['messina', 'messina-adicional-tercer-muro', 10_000_000, null, 12_100_000, null, '2026-10-28', 'Transferencia'],
  ['messina', 'messina-playon-dilucion-acido', 20_090_868, null, 24_309_950, null, '2026-10-03', 'Transferencia'],
  ['messina', 'messina-playon-azufre', 102_500_000, 56_834_641, 58_075_000, null, '2026-09-22', 'Transferencia'],
]

/** El pie de la pestaña, tal cual. Cierra contra la suma de las nueve filas de arriba. */
const TOTAL = { contratado: 346_796_845, cobrado: 205_851_905, porCobrar: 183_781_131, vencido: 34_089_978 }

const clientes: ClientePanel[] = [...new Set(OBRAS.map(([c]) => c))].map((id) => ({
  cliente_id: id, slug: id, nombre_comercial: id, razon_social: null, cuit: null, direccion: null,
  telefono: null, email: null, responsable_id: null, responsable_nombre: null, drive_carpeta_id: null,
  activo: true, notas: null, n_obras: 1, n_obras_activas: 1, restricciones_abiertas: 0,
  avance_sincronizado_en: null, n_contactos: 0, n_documentos: 0,
}))

const obras: ObraDeCartera[] = OBRAS.map(([cliente, obraId]) => ({
  obra_id: obraId, nombre: obraId, cliente_id: cliente, avance_pct: null, jefe_obra: null,
}))

const economia = new Map<string, EconomiaDeObra>(OBRAS.map(([, obraId, contratado]) => [obraId, {
  obra_canonica_id: obraId, contratado, origen: 'oc-pesos',
}]))

/** Lo que `obra_cobranza` publica el día que la migración esté aplicada. El neto va a propósito
 *  distinto del total: si alguien vuelve a dibujar el neto, el número no coincide con OBRAS. */
const cobrado = {
  disponible: true,
  por: new Map<string, CobroDeObra>(OBRAS.map(([, obraId, , total, porCobrar, vencido, fecha, medio]) => [obraId, {
    total, neto: total === null ? null : Math.round(total / 1.21), porCobrar, vencido,
    proximo: { fecha, medio }, imputacion: 'oc' as const,
  }])),
}

const cartera = armarCartera({ clientes, obras, cobrado, certificados: [], economia })
const filas = new Map(cartera.flatMap((c) => c.enCurso.map((o) => [o.obra_id, o])))

test('cada trabajo publica las cinco columnas de la pestaña OBRAS, con sus números', () => {
  for (const [, obraId, contratado, total, porCobrar, vencido, fecha, medio] of OBRAS) {
    const f = filas.get(obraId)
    assert.ok(f, `${obraId} no llegó a la cartera`)
    assert.equal(f.contratado, contratado, `${obraId}: contratado`)
    // «—» EN OBRAS ES `null` ACÁ, NUNCA CERO: dos de las nueve todavía no cobraron nada y un 0
    // afirmaría que se midió un cobro de cero pesos.
    assert.equal(f.cobradoTotal, total, `${obraId}: «Cobrado» es el TOTAL de OBRAS, con IVA`)
    assert.equal(f.porCobrar, porCobrar, `${obraId}: por cobrar`)
    assert.equal(f.vencido, vencido, `${obraId}: vencido`)
    assert.deepEqual(f.proximo, { fecha, medio }, `${obraId}: próximo cobro`)
  }
})

test('el cobrado que se publica NO es el neto: ése era el defecto que el dueño vio', () => {
  const bsa = filas.get('messina-bsa')
  assert.equal(bsa?.cobradoTotal, 4_848_135)
  assert.notEqual(bsa?.cobradoTotal, bsa?.cobradoNeto, 'el neto sigue leído, pero no es la columna')
  // Y el neto queda disponible para quien tenga que restar contra lo contratado, que es neto.
  assert.equal(bsa?.cobradoNeto, Math.round(4_848_135 / 1.21))
})

test('las nueve filas cierran contra el pie de la pestaña', () => {
  const suma = (f: (o: NonNullable<ReturnType<typeof filas.get>>) => number | null) =>
    [...filas.values()].reduce((a, o) => a + (f(o) ?? 0), 0)
  assert.equal(suma((o) => o.contratado), TOTAL.contratado)
  assert.equal(suma((o) => o.cobradoTotal), TOTAL.cobrado)
  // El pie del Sheet redondea a la unidad; la suma de las nueve filas puede diferir en 1 peso.
  assert.ok(Math.abs(suma((o) => o.porCobrar) - TOTAL.porCobrar) <= 1)
  assert.equal(suma((o) => o.vencido), TOTAL.vencido)
})

test('sin las columnas nuevas la fila NO dice cero: dice nada', () => {
  const [c] = armarCartera({
    clientes: [clientes[0]],
    obras: [obras[0]],
    // La vista vieja: sin `vencido` ni `proximo_cobro`. Es el estado de producción hoy.
    cobrado: {
      disponible: true,
      por: new Map<string, CobroDeObra>([[obras[0].obra_id, {
        total: 8_465_136, neto: 6_996_806, porCobrar: 2_848_649, vencido: null, proximo: null,
        imputacion: 'oc',
      }]]),
    },
    certificados: [], economia,
  })
  assert.equal(c.enCurso[0].vencido, null, 'un 0 en «Vencido» afirmaría que este cliente no debe nada')
  assert.equal(c.enCurso[0].proximo, null)
})
