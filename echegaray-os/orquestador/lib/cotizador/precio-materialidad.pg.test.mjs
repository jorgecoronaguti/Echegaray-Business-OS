// LA REGRESIÓN QUE EL DUEÑO PIDIÓ, TEXTUAL: «NO cargar manualmente los cuatro precios de
// Quattropani. Usarlos como REGRESIÓN del sistema.»
//
// Los cuatro son el PANEL DE CHAPA TRAPE, el VIAJE DE TATÚ, el HIERRO LISO ø16 y la PLACA DE YESO, y
// explican —según él— el 92% del riesgo económico bloqueado de la oferta.
//
// ═══ POR QUÉ ESTE TEST NO LOS NOMBRA COMO ENTRADA ═══
//
// Lo que se prueba NO es que el sistema conozca esos cuatro códigos: eso se consigue escribiéndolos
// en una lista, y una lista escrita a mano no encuentra el quinto el día que aparezca. Lo que se
// prueba es que el ALGORITMO los encuentre solo, partiendo de la cotización entera y sin ninguna
// pista: se le pasan los 107 recursos, se le pide que priorice por riesgo económico, y los cuatro
// tienen que salir arriba.
//
// Los códigos aparecen SÓLO en la aserción —del lado del resultado esperado, nunca de la entrada—.
// Si alguien intentara «ayudar» al algoritmo cableándolos, este archivo seguiría en verde y por eso
// el test negativo del final invierte el criterio de orden y comprueba que se pone rojo.
//
// SÓLO LEE. Ninguna escritura: la base es compartida.

import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { getPool } from '../db.mjs'
import { resolverCatalogo, pesosDeCotizacion } from './precio-fuentes.pg.mjs'
import { riesgoDeRecurso, priorizar } from './precio-materialidad.mjs'

/** La oferta real del Salón Comercial, adjudicada, $84,9 M de costo de referencia. Es el caso donde
 *  el dueño midió el 92%. */
const COTIZACION = 'a6426117-7dde-4506-94be-3870aa6a1637'

/** Lo que el dueño señaló. Está acá y NO en el módulo: es el resultado esperado, no una entrada. */
const LOS_CUATRO = ['154', '243', '333', '367']

const pool = getPool()
const query = (s, p) => pool.query(s, p)
after(async () => { await pool.end() })

async function riesgosDeLaOferta(hoy = new Date()) {
  const { pesos, total } = await pesosDeCotizacion({ query }, COTIZACION)
  assert.ok(total > 0, 'la cotización de regresión desapareció de la base o perdió sus precios')
  const { resoluciones } = await resolverCatalogo({ query }, { pesos, codigos: Object.keys(pesos), hoy })
  const bloqueados = resoluciones.filter(({ resolucion }) => resolucion.resultado !== 'VIGENTE')
  return {
    total,
    bloqueados: bloqueados.length,
    riesgos: bloqueados.map(({ recurso, resolucion }) => riesgoDeRecurso({
      recurso, resolucion, impacto: (pesos[recurso.codigo] ?? 0) * total, hoy,
    })),
  }
}

test('el algoritmo ENCUENTRA los cuatro solo, sin que nadie se los diga', async () => {
  const { riesgos, bloqueados } = await riesgosDeLaOferta()
  assert.ok(bloqueados > 40, `esperaba decenas de recursos bloqueados y hay ${bloqueados}: la oferta cambió`)

  // Se mira el RANKING, no el corte: cuáles son los cuatro que más plata ponen en riesgo. Dónde se
  // pare de consultar es otra decisión y la contesta el test de abajo.
  const p = priorizar(riesgos, { objetivo: 0.9 })
  const arriba = p.ordenados.slice(0, 4).map((x) => x.codigo).sort()
  assert.deepEqual(arriba, LOS_CUATRO,
    `los cuatro del dueño tienen que salir arriba solos. Salió: ${p.ordenados.slice(0, 6).map((x) => `${x.codigo} $${Math.round(x.riesgo)}`).join(' · ')}`)
})

test('esos cuatro explican ~92% del riesgo, que es el número que el dueño dijo', async () => {
  const { riesgos } = await riesgosDeLaOferta()
  const total = riesgos.reduce((a, r) => a + (r.riesgo ?? 0), 0)
  const deLosCuatro = riesgos.filter((r) => LOS_CUATRO.includes(String(r.codigo))).reduce((a, r) => a + (r.riesgo ?? 0), 0)
  const pct = deLosCuatro / total
  assert.ok(pct > 0.88 && pct < 0.97, `el dueño dijo 92% y la cuenta da ${(pct * 100).toFixed(1)}%`)
})

test('cubrir el 92% del riesgo cuesta CUATRO consultas, no cincuenta y ocho', async () => {
  const { riesgos, bloqueados } = await riesgosDeLaOferta()
  const p = priorizar(riesgos, { objetivo: 0.92 })
  assert.deepEqual([...p.elegidos.map((x) => x.codigo)].sort(), LOS_CUATRO,
    `el conjunto mínimo que cubre el 92% tiene que ser exactamente esos cuatro; salió ${p.elegidos.length} de ${bloqueados}`)
  assert.ok(p.riesgoQueQuedaAfuera < p.riesgoCubierto / 10, 'lo que queda sin resolver tiene que ser marginal frente a lo resuelto')
})

test('los SIN_PRECIO no se cuentan como riesgo cero: salen aparte y se atienden', async () => {
  const { riesgos } = await riesgosDeLaOferta()
  const p = priorizar(riesgos, { objetivo: 0.9 })
  assert.ok(p.noMedidos.length > 0, 'esta oferta tiene recursos sin precio: si no aparecen, se los tragó el 0')
  for (const x of p.noMedidos) assert.equal(x.riesgo, null)
})

test('MUTACIÓN QUE LO PONE ROJO — ordenar por antigüedad en vez de por plata', async () => {
  // Es el criterio ingenuo que el módulo reemplaza. Si el ranking por edad diera el mismo conjunto,
  // `precio-materialidad.mjs` no estaría haciendo nada y el test de arriba pasaría por casualidad.
  const { riesgos } = await riesgosDeLaOferta()
  const porEdad = [...riesgos]
    .filter((r) => Number.isFinite(Number(r.impacto)))
    .sort((a, b) => (b.error ?? 0) - (a.error ?? 0) || String(a.codigo).localeCompare(String(b.codigo)))
    .slice(0, 4).map((x) => x.codigo).sort()
  assert.notDeepEqual(porEdad, LOS_CUATRO,
    'si ordenar por edad diera los mismos cuatro, el módulo de materialidad sería decorativo')
})
