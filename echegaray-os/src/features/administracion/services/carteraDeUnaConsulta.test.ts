// UNA CONSULTA POR PANTALLA — el control que se pone rojo cuando vuelven las diez.
//
// ═══ QUÉ DEFECTO ATRAPA ═══
//
// El defecto que este hito corrige no es un número equivocado: es un NÚMERO DE VIAJES. Y un número
// de viajes no se ve en ninguna pantalla —los diez y el uno dibujan lo mismo—, así que sin un test
// que los cuente la regresión es invisible hasta que alguien vuelve a cronometrar producción. Basta
// que alguien agregue «una consultita más» al `page.tsx` para volver a pagar un arranque en frío de
// ~800 ms bajo saturación.
//
// Los tres controles:
//
//   1 · `leerCarteraDeUnaConsulta` hace UN `rpc()` y CERO `from()`. Si mañana alguien agrega una
//       lectura suelta acá adentro, este test la cuenta y falla.
//   2 · Cada lista de la RPC aterriza en la clave que le corresponde. El riesgo real del cableado
//       es cruzar `obras_activas` con `obras_todas` —tienen columnas parecidas y ninguna pantalla
//       gritaría—, así que las dos listas del fixture son deliberadamente distintas.
//   3 · Un error de la RPC no se dibuja como «no hay nada»: `clientes` vuelve `null` y los papeles
//       llevan `fallo: true`. Una lista vacía por error es una afirmación falsa sobre la cartera.
//
// Lo que este test NO puede ver: que la RPC devuelva las mismas FILAS que las diez consultas. Eso
// es una propiedad de la base y se prueba contra la base real en
// `orquestador/lib/pantalla-clientes-rpc.pg.test.mjs`.

import test from 'node:test'
import assert from 'node:assert/strict'
import type { SupabaseClient } from '@supabase/supabase-js'
import { leerCarteraDeUnaConsulta } from './carteraDeUnaConsulta.ts'

/** Un cliente que cuenta lo que se le pide y devuelve el JSON que se le dé. */
function baseQueCuenta(respuesta: { data: unknown; error: { message: string } | null }) {
  const llamadas = { rpc: [] as string[], from: [] as string[] }
  const supabase = {
    rpc: (nombre: string) => { llamadas.rpc.push(nombre); return Promise.resolve(respuesta) },
    from: (tabla: string) => {
      llamadas.from.push(tabla)
      throw new Error(`la pantalla volvió a leer «${tabla}» por fuera de la RPC`)
    },
  } as unknown as SupabaseClient
  return { supabase, llamadas }
}

const CARTERA = {
  perfil: { id: 'u1', rol: 'direccion', nombre: 'Jorge', created_at: '2026-01-01', updated_at: '2026-01-01' },
  clientes: [
    { cliente_id: 'c1', slug: 'messina', nombre_comercial: 'Messina', n_obras_activas: 2, activo: true },
  ],
  // EN EJECUCIÓN: una sola. Es la lista que dibuja las filas indentadas.
  obras_activas: [
    { obra_id: 'o1', nombre: 'BSA', cliente_id: 'c1', avance_pct: 40, jefe_obra: ' Pablo ' },
  ],
  // TODAS: la activa MÁS una cerrada. Si el cableado cruzara las dos claves, el panel lateral
  // perdería la obra cerrada y `sinRepartir` dejaría de encontrar la obra bolsa.
  obras_todas: [
    { obra_id: 'o1', nombre: 'BSA', cliente_id: 'c1', estado: 'activa', avance_pct: 40 },
    { obra_id: 'o9', nombre: 'Bolsa', cliente_id: 'c1', estado: 'cerrada', avance_pct: null },
  ],
  // `public.obra_cuenta`: la fila de la pestaña OBRAS traducida a Postgres.
  cobrado_por_obra: [
    {
      obra_id: 'o1', cobrado_total: 1210, cobrado_neto: 1000, por_cobrar: 500, vencido: 0,
      proximo_cobro_fecha: '2026-09-18', proximo_cobro_medio: ' Efectivo ', imputacion: 'oc',
    },
    // Una obra SIN NINGUNA fila de Cobranzas no entra al mapa: eso no es «cobró cero», es que no
    // hay nada anotado contra ella, y la celda lo dice quedándose vacía.
    {
      obra_id: 'o9', cobrado_total: null, cobrado_neto: null, por_cobrar: null, vencido: null,
      proximo_cobro_fecha: null, proximo_cobro_medio: null, imputacion: null,
    },
  ],
  certificados: [
    { obra_canonica_id: 'o1', numero: '1', fecha_certificacion: '2026-08-01', fecha_facturacion: null, fecha_cobranza: null },
  ],
  papeles: [
    { id: 'p1', cliente_id: 'c1', obra_id: 'o1', tipo: 'oc', numero: '279', fecha: '2026-07-01', importe: 500, moneda: 'ARS', cita: null, nombre_archivo: 'oc.pdf', drive_file_id: null },
  ],
  economia_obras: [
    { obra_canonica_id: 'o1', contratado: 5000, costo_mo: 100, costo_materiales: 200, margen: 0.3, origen: 'obras' },
  ],
  contratos: ['c1'],
  economia_clientes: [
    { cliente_id: 'c1', contratado: 5000, contratado_en_curso: 5000, n_obras_en_curso: 1, n_obras_cerradas: 1, n_obras_con_precio: 1, n_obras_sin_precio: 0, costo_real: 300, facturado_90d: null, cobrado_90d: null, cobrado_total: 1210, cobrado_neto_total: 1000, saldo: null, vencido: null, por_vencer: null, pendiente_contractual: 4000 },
  ],
}

test('la cartera se lee en UN viaje y ninguna consulta suelta se cuela', async () => {
  const { supabase, llamadas } = baseQueCuenta({ data: CARTERA, error: null })
  await leerCarteraDeUnaConsulta(supabase)
  assert.deepEqual(llamadas.rpc, ['pantalla_clientes'])
  assert.deepEqual(llamadas.from, [], 'la pantalla leyó una tabla por fuera de la RPC')
})

test('cada lista de la RPC aterriza donde la pantalla la espera', async () => {
  const { supabase } = baseQueCuenta({ data: CARTERA, error: null })
  const r = await leerCarteraDeUnaConsulta(supabase)

  assert.equal(r.error, null)
  assert.equal(r.perfil?.rol, 'direccion')
  assert.equal(r.clientes?.length, 1)

  // EN EJECUCIÓN ≠ TODAS. Cruzar las dos claves es el error que este test existe para atrapar.
  assert.deepEqual(r.obras?.map((o) => o.obra_id), ['o1'])
  assert.deepEqual(r.todasLasObras.get('c1')?.map((o) => o.obra_id), ['o1', 'o9'])

  // BRUTO Y NETO SON DOS COLUMNAS, no una: el Sheet publica el bruto y el comparable contra lo
  // contratado es el neto. Confundirlos publicaba «100 %» sobre un contrato que no se cobró entero.
  assert.equal(r.cobrado?.por.get('o1')?.total, 1210)
  assert.equal(r.cobrado?.por.get('o1')?.neto, 1000)
  assert.equal(r.cobrado?.por.get('o1')?.porCobrar, 500)
  assert.equal(r.cobrado?.por.get('o1')?.proximo?.medio, 'Efectivo')
  assert.equal(r.cobrado?.por.get('o1')?.imputacion, 'oc')
  // La obra sin nada anotado NO entra al mapa: no cobró cero, no hay nada que decir de ella.
  assert.equal(r.cobrado?.por.has('o9'), false)
  // `obra_cuenta` reparte por obra POR CONSTRUCCIÓN (sale de `cobranza_imputacion`): que la RPC
  // haya respondido lo prueba, y la regla de «todo o nada» del dueño se cumple con un sí.
  assert.equal(r.cobrado?.disponible, true)

  assert.equal(r.certificados?.length, 1)
  assert.equal(r.economia?.get('o1')?.contratado, 5000)
  assert.equal(r.economiaCliente?.get('c1')?.pendiente_contractual, 4000)
  assert.equal(r.contratos?.has('c1'), true)
  assert.equal(r.papeles.fallo, false)
  assert.ok(r.papeles.porCliente.get('c1'), 'los papeles del cliente no llegaron')
})

test('un fallo de la RPC no se dibuja como una cartera vacía', async () => {
  const { supabase } = baseQueCuenta({ data: null, error: { message: 'permission denied' } })
  const r = await leerCarteraDeUnaConsulta(supabase)
  assert.equal(r.error, 'permission denied')
  // `null`, no `[]`: la pantalla dice «no pude leer los clientes» y no «no hay clientes».
  assert.equal(r.clientes, null)
  assert.equal(r.obras, null)
  assert.equal(r.cobrado, null)
  assert.equal(r.economiaCliente, null)
  assert.equal(r.contratos, null)
  assert.equal(r.papeles.fallo, true)
})

test('el rol que no ve economía recibe listas vacías, no null', async () => {
  // Es lo que hace `ve_economia()` adentro de las vistas: cero filas, no error. La pantalla
  // tampoco le ofrece las columnas — pero si esto se leyera como «no pude», el jefe de obra vería
  // un error en vez de una cartera sin cifras.
  const { supabase } = baseQueCuenta({
    data: { ...CARTERA, cobrado_por_obra: [], economia_clientes: [] }, error: null,
  })
  const r = await leerCarteraDeUnaConsulta(supabase)
  assert.equal(r.error, null)
  assert.equal(r.cobrado?.por.size, 0)
  assert.equal(r.economiaCliente?.size, 0)
})
