// LA COMPOSICIÓN DE LA PARTIDA — dos orígenes, una forma, y el control que los cruza.
//
// ═══ LOS DEFECTOS QUE ATRAPA ═══
//
// 1. LA LÍNEA SIN PRECIO CONTADA COMO CERO. Un recurso sin precio cargado en la base maestra hace
//    `costo_con_desperdicio = null`. Si el desglose lo sumara como 0, la sección MATERIALES daría
//    un total más chico que el real y NADIE lo notaría: el número se ve, es plausible y está mal.
//    Acá la línea sale con subtotal `null`, el total de la sección la excluye, y `sinPrecio` la
//    cuenta para que la pantalla la denuncie.
// 2. LA LÍNEA CUYO RECURSO YA NO EXISTE, descartada en silencio. Perderla bajaría el desglose y
//    haría que el control contra el costo unitario acuse una diferencia sin causa visible.
// 3. EL DESGLOSE QUE NO CIERRA CONTRA EL COSTO UNITARIO. Son dos caminos independientes hacia la
//    misma cifra —la suma de líneas y `analisis_costo.costo_directo`— y que discrepen es
//    exactamente el aviso que un control tiene que dar.

import test from 'node:test'
import assert from 'node:assert/strict'
import { desdeCongelada, desdeViva, desglosar, desgloseCierra } from './composicion.ts'

test('las dos fuentes producen la MISMA forma: la pantalla no tiene dos ramas', () => {
  const congelada = desdeCongelada([{
    orden: 0, recurso_codigo: 'MO01', recurso_nombre: 'Oficial', unidad: 'hs', tipo: 'mano_obra',
    cantidad: '17', costo_unitario: '384.88', desperdicio: '0', fecha_precio: '2026-01-01',
  }])
  const viva = desdeViva([{
    orden: 0, cantidad: 17,
    recurso: { codigo: 'MO01', nombre: 'Oficial', unidad: 'hs', tipo: 'mano_obra',
      costo_con_desperdicio: 384.88, desperdicio: 0, fecha_precio: '2026-01-01' },
  }])
  assert.deepEqual(congelada, viva)
})

test('una línea sin precio NO se suma como cero: sale null y la sección la cuenta como deuda', () => {
  const d = desglosar(desdeViva([
    { orden: 0, cantidad: 8.5, recurso: { codigo: 'M1', nombre: 'Cemento', unidad: 'bolsa', tipo: 'material', costo_con_desperdicio: 9840, desperdicio: 0.02, fecha_precio: null } },
    { orden: 1, cantidad: 0.45, recurso: { codigo: 'M2', nombre: 'Arena', unidad: 'm³', tipo: 'material', costo_con_desperdicio: null, desperdicio: 0, fecha_precio: null } },
  ]))
  const mats = d.secciones.find((s) => s.clave === 'materiales')!
  assert.equal(mats.total, 8.5 * 9840)
  assert.equal(mats.sinPrecio, 1)
  assert.equal(mats.lineas[1].subtotal, null)
})

test('si TODA la sección está sin precio, su total es null: un 0 diría que no cuesta nada', () => {
  const d = desglosar(desdeViva([
    { orden: 0, cantidad: 6.8, recurso: { codigo: 'E1', nombre: 'Hormigonera', unidad: 'h', tipo: 'equipo', costo_con_desperdicio: null, desperdicio: 0, fecha_precio: null } },
  ]))
  assert.equal(d.secciones.find((s) => s.clave === 'equipos')!.total, null)
  assert.equal(d.totalDesglose, null)
})

test('la línea cuyo recurso ya no resuelve se muestra, no se descarta en silencio', () => {
  const l = desdeViva([{ orden: 0, cantidad: 2, recurso: null }])
  assert.equal(l[0].recurso_nombre, 'recurso no encontrado')
  assert.equal(l[0].costo_unitario, null)
  assert.equal(desglosar(l).secciones.find((s) => s.clave === 'otros')!.lineas.length, 1)
})

test('las cargas sociales van DENTRO de mano de obra, no en un bloque aparte', () => {
  const d = desglosar(desdeViva([
    { orden: 0, cantidad: 17, recurso: { codigo: 'MO1', nombre: 'Oficial', unidad: 'hs', tipo: 'mano_obra', costo_con_desperdicio: 100, desperdicio: 0, fecha_precio: null } },
    { orden: 1, cantidad: 17, recurso: { codigo: 'CS1', nombre: 'Cargas sociales', unidad: 'hr', tipo: 'carga_social', costo_con_desperdicio: 51.9, desperdicio: 0, fecha_precio: null } },
  ]))
  assert.equal(d.secciones.length, 1)
  assert.equal(d.secciones[0].clave, 'mano_obra')
  assert.equal(d.secciones[0].total, 17 * 100 + 17 * 51.9)
})

test('la incidencia por sección suma 100 cuando todas tienen precio', () => {
  const d = desglosar(desdeViva([
    { orden: 0, cantidad: 1, recurso: { codigo: 'MO1', nombre: 'Oficial', unidad: 'hs', tipo: 'mano_obra', costo_con_desperdicio: 50, desperdicio: 0, fecha_precio: null } },
    { orden: 1, cantidad: 1, recurso: { codigo: 'M1', nombre: 'Cemento', unidad: 'bolsa', tipo: 'material', costo_con_desperdicio: 30, desperdicio: 0, fecha_precio: null } },
    { orden: 2, cantidad: 1, recurso: { codigo: 'E1', nombre: 'Vibrador', unidad: 'h', tipo: 'equipo', costo_con_desperdicio: 20, desperdicio: 0, fecha_precio: null } },
  ]))
  assert.equal(d.incidencia.mano_obra, 50)
  assert.equal(d.incidencia.materiales, 30)
  assert.equal(d.incidencia.equipos, 20)
})

test('sin base contra la que medir, la incidencia es null y no cero', () => {
  const d = desglosar([])
  assert.deepEqual(d.incidencia, { mano_obra: null, materiales: null, equipos: null })
  assert.equal(d.totalDesglose, null)
})

test('el desglose se CRUZA contra el costo unitario de la vista, no lo reemplaza', () => {
  assert.deepEqual(desgloseCierra(429057, 429057), { cierra: true, diferencia: 0 })
  assert.equal(desgloseCierra(429057.4, 429057).cierra, true)
  const roto = desgloseCierra(400000, 429057)
  assert.equal(roto.cierra, false)
  assert.equal(roto.diferencia, -29057)
})

test('sin uno de los dos números no hay control que dar, y no se inventa un error', () => {
  assert.deepEqual(desgloseCierra(null, 429057), { cierra: true, diferencia: null })
  assert.deepEqual(desgloseCierra(429057, null), { cierra: true, diferencia: null })
})
