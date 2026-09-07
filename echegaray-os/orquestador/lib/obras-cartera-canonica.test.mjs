// EL CONTROL QUE LA MIGRACIÓN PROMETIÓ Y NO EXISTÍA.
//
// Los casos NO son inventados: son los tres que se midieron en la base productiva el 07/09/2026
// cuando el dueño pidió que el Gantt reflejara el inicio y el fin de cada obra.
//
//   · pisos-industriales    la base decía 22/08 → 02/10 y la pestaña OBRAS 05/08 → 30/09
//   · entrepiso-y-escalera  la base decía 10/08 → 18/09 y la pestaña OBRAS 10/08 → 21/08
//   · sf-mamposteria        la base la tenía `cerrada` y la pestaña seguía listándola
//
// EL DEFECTO QUE ATRAPA, y por qué ningún otro test lo ve: una fecha equivocada en `obra_canonica`
// no rompe nada. El Gantt dibuja la barra, el typecheck pasa, la página abre y el color es el
// mismo. El único síntoma es que dos fuentes dicen cosas distintas de la misma obra, y eso sólo se
// ve comparándolas — que es literalmente lo único que hace este archivo.

import test from 'node:test'
import assert from 'node:assert/strict'
import { diferenciasDeCartera, idCanonicoDe, sqlDeCorreccion } from './obras-cartera-canonica.mjs'
import { obrasVendidas } from './obras-datos.mjs'

const VINCULOS = new Map([
  ['sf-pisos-industriales', 'pisos-industriales'],
  ['sf-entrepiso-escalera', 'entrepiso-y-escalera'],
  ['quattropani-salon-comercial', 'quattropani'],
])

// EL FIXTURE SE CONSTRUYE CON LA MISMA FORMA QUE `obrasVendidas`, Y ESO NO ES ESTILO.
// La primera versión de estos tests llamaba `id` a lo que el módulo real llama `clave`: los ocho
// pasaban en verde y el script contra la base declaraba que las DIEZ obras faltaban, porque leía
// `v.id` y ahí no había nada. Un fixture con otra forma que el dato real prueba el fixture.
const vendida = (clave, inicio, fin) => ({ clave, obra: clave.toUpperCase(), cliente: 'X', inicio, fin })
const canonica = (id, fecha_inicio_plan, fecha_fin_plan, estado = 'activa') =>
  ({ id, estado, fecha_inicio_plan, fecha_fin_plan })

test('el id canónico sale del vínculo declarado, y sin vínculo la clave del Sheet ES el id', () => {
  assert.equal(idCanonicoDe('sf-pisos-industriales', VINCULOS), 'pisos-industriales')
  assert.equal(idCanonicoDe('messina-playon-azufre', VINCULOS), 'messina-playon-azufre')
})

test('la cartera que coincide no produce ni un hallazgo', () => {
  const d = diferenciasDeCartera(
    [vendida('sf-pisos-industriales', '2026-08-05', '2026-09-30')],
    VINCULOS,
    [canonica('pisos-industriales', '2026-08-05', '2026-09-30')],
  )
  assert.deepEqual(d, [])
})

test('la fecha que la base cambió por su cuenta se declara, con las dos versiones', () => {
  // EL CASO REAL DEL 07/09: la base decía 22/08 → 02/10 y el Sheet 05/08 → 30/09. Diecisiete días
  // de arranque que el Gantt dibujaba como si fueran ciertos.
  const d = diferenciasDeCartera(
    [vendida('sf-pisos-industriales', '2026-08-05', '2026-09-30')],
    VINCULOS,
    [canonica('pisos-industriales', '2026-08-22', '2026-10-02')],
  )
  assert.equal(d.length, 1)
  assert.equal(d[0].tipo, 'fechas_distintas')
  assert.equal(d[0].id, 'pisos-industriales')
  assert.equal(d[0].esperado, '2026-08-05 → 2026-09-30')
  assert.equal(d[0].encontrado, '2026-08-22 → 2026-10-02')
})

test('una obra de la pestaña que en la base no está activa NO pasa como si nada', () => {
  const d = diferenciasDeCartera(
    [vendida('sf-mamposteria', '2026-08-07', '2026-08-19')],
    VINCULOS,
    [canonica('sf-mamposteria', '2026-08-07', '2026-08-19', 'cerrada')],
  )
  assert.equal(d.length, 1)
  assert.equal(d[0].tipo, 'no_esta_activa')
  assert.equal(d[0].encontrado, 'cerrada')
})

test('la obra que no existe en la base se distingue de la que difiere', () => {
  const d = diferenciasDeCartera([vendida('obra-nueva', '2026-09-01', '2026-09-30')], VINCULOS, [])
  assert.equal(d.length, 1)
  assert.equal(d[0].tipo, 'falta_en_la_base')
  assert.equal(d[0].encontrado, null)
})

test('una obra sin fechas en la base no se lee como si coincidiera', () => {
  // `null → null` contra `05/08 → 30/09` tiene que ser un hallazgo. Comparar con `==` sobre campos
  // nulos es la forma clásica de que un control diga que sí sobre una fila vacía.
  const d = diferenciasDeCartera(
    [vendida('sf-pisos-industriales', '2026-08-05', '2026-09-30')],
    VINCULOS,
    [canonica('pisos-industriales', null, null)],
  )
  assert.equal(d.length, 1)
  assert.equal(d[0].encontrado, '— → —')
})

test('el SQL de corrección toca sólo las fechas, y sólo de las que difieren', () => {
  const vendidas = [
    vendida('sf-pisos-industriales', '2026-08-05', '2026-09-30'),
    vendida('sf-mamposteria', '2026-08-07', '2026-08-19'),
  ]
  const hallazgos = diferenciasDeCartera(vendidas, VINCULOS, [
    canonica('pisos-industriales', '2026-08-22', '2026-10-02'),
    canonica('sf-mamposteria', '2026-08-07', '2026-08-19', 'cerrada'),
  ])
  const sql = sqlDeCorreccion(vendidas, VINCULOS, hallazgos)
  assert.equal(sql.split('\n').length, 1, 'sólo la obra con fechas distintas se corrige')
  assert.match(sql, /update public\.obra_canonica set fecha_inicio_plan = '2026-08-05'::date/)
  assert.match(sql, /where id = 'pisos-industriales';$/)
  // QUE UNA OBRA SALGA DE LA CARTERA ES UNA DECISIÓN DEL DUEÑO: Mampostería salió el 07/09 porque
  // está cobrada entera. Un control que la reactivara solo estaría deshaciendo esa decisión.
  assert.ok(!sql.includes('estado'), 'el control no puede reactivar una obra archivada')
  assert.ok(!sql.includes('sf-mamposteria'), 'la obra archivada no se toca')
})

test('las diez obras de la pestaña tienen inicio y fin declarados, sin excepción', () => {
  // Es el supuesto sobre el que se apoya todo lo de arriba: si mañana alguien agrega una obra a la
  // pestaña sin fechas, el control las compararía contra `undefined` y no diría nada.
  assert.equal(obrasVendidas.length > 0, true)
  for (const o of obrasVendidas) {
    // LA CLAVE SE LLAMA `clave`. Es el campo por el que el control encuentra la obra en Postgres:
    // si alguien lo renombra, el control diría «faltan las diez» en vez de romperse.
    assert.equal(typeof o.clave, 'string', 'la obra de la pestaña tiene que traer su clave')
    assert.match(o.inicio ?? '', /^\d{4}-\d{2}-\d{2}$/, `${o.clave} sin fecha de inicio`)
    assert.match(o.fin ?? '', /^\d{4}-\d{2}-\d{2}$/, `${o.clave} sin fecha de fin`)
    assert.ok(o.inicio <= o.fin, `${o.clave} termina antes de empezar`)
  }
})
