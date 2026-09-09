// EL EXTRACTO SE LEE DESDE LA WEB, Y SÓLO LO LEE QUIEN LIQUIDA.
//
// El defecto que este spec atrapa ya estaba en producción: `banco_movimientos` nació con RLS y una
// policy de lectura, pero SIN `grant select`. Una policy no otorga: filtra sobre un permiso que
// tiene que existir antes. PostgREST cortaba en el catálogo y devolvía 403 con `message` vacío, así
// que la solapa Recibos degradaba a «sin extracto» y la conciliación del lote de haberes se apagaba
// entera — sin distinguir «no se giró» de «no pude mirar», que es la peor confusión posible en un
// control de pagos.
//
// Se miden las TRES cosas que la migración `20260909T1840` decide, porque cualquiera de las tres
// puede romperse sola:
//   1. Dirección LEE (si vuelve el 403, esto se pone rojo).
//   2. Jefe de obra NO ve ninguna fila (si alguien reapunta la policy a `es_administracion()`,
//      que lo incluye desde el 19/08/2026, esto se pone rojo).
//   3. `importe` sigue cerrado para todos (el GRANT es por columna: la web sólo cuenta si HAY
//      movimientos, no lee cuánto se pagó a quién).
import { test, expect } from '@playwright/test'
import { ADMIN, CAMPO, JEFE, entrar, pedir } from './util/identidades'

const VENTANA = 'banco_movimientos?select=id,fecha&fecha=gte.2000-01-01&limit=5'
const DETALLE = 'banco_movimientos?select=importe&limit=1'

test('Dirección lee el extracto; jefe de obra y campo no ven una sola fila', async () => {
  const direccion = await pedir(await entrar(ADMIN.email, ADMIN.password), VENTANA)
  expect(direccion.status, `Dirección no puede leer el extracto: ${JSON.stringify(direccion.cuerpo)}`)
    .toBeLessThan(300)
  // No alcanza con el 200: sin filas la pantalla degrada igual y el test no diría nada.
  expect(direccion.filas.length, 'la base contestó vacío: sin filas no hay conciliación posible')
    .toBeGreaterThan(0)

  for (const quien of [JEFE, CAMPO]) {
    const r = await pedir(await entrar(quien.email, quien.password), VENTANA)
    expect(r.filas, `${quien.email} vio filas del extracto bancario`).toEqual([])
  }
})

test('el detalle del extracto no se abre: el GRANT es por columna', async () => {
  for (const quien of [ADMIN, JEFE, CAMPO]) {
    const r = await pedir(await entrar(quien.email, quien.password), DETALLE)
    expect(r.status, `${quien.email} leyó el importe del extracto desde la web`).toBe(403)
  }
})
