// LOS DEFECTOS QUE ESTOS TESTS ATRAPAN, uno por uno:
//
//   · LA PANTALLA CONTRADICIÉNDOSE CONSIGO MISMA. La cola queda vacía y «Herramientas · 1 sin
//     resolver» sigue encendido: dos números que salen del mismo hecho diciendo cosas distintas.
//   · UN COSTO DE ESTRUCTURA CONTADO COMO COSTO DE OBRA. Resolver «UOCRA» como estructura tiene que
//     sumar en la columna estructura; sumarlo en «a una obra» le mete a una obra plata de la
//     empresa, que es exactamente lo que esta pantalla existe para impedir.
//   · UN TEXTO QUE APARECE EN DOS FUENTES DESCONTADO DE UNA SOLA. Queda un pendiente fantasma en la
//     otra fuente, y nunca se puede bajar a cero.
//   · UN CONTADOR EN NEGATIVO cuando el refresh del servidor llega antes que la cuenta local.
//   · EL TRAMO ÁMBAR INVISIBLE. Un pendiente sobre 875 filas mide 0,1 % de la barra: sin piso, la
//     única señal de que hay trabajo no se dibuja.
//   · UNA CLASIFICACIÓN QUE LA PANTALLA OFRECE Y EL SERVIDOR RECHAZA. Las cuatro de acá tienen que
//     ser las cuatro del enum de Zod de `resolverImputacion`, ni una más.

import test from 'node:test'
import assert from 'node:assert/strict'
import type { GrupoPendiente, ResumenFuente } from './imputacionService.ts'
import {
  CLASIFICACIONES, desgloseDeFuente, filasPorTipo, pideObra, resumenTrasResolver, segmentosDeFuente,
} from './pendientesVista.ts'

const fila = (tipo: GrupoPendiente['filas'][number]['tipo'], id: string) => ({
  tipo, id, tabla: 't', referencia: null, fuente: null, fecha: null,
  descripcion: '', importe: null, recurso: null, texto: 'SERV. TECNICO',
})

const grupo = (clave: string, filas: GrupoPendiente['filas']): GrupoPendiente => ({
  clave, textos: [clave.toUpperCase()], filas, cantidad: filas.length, importe: 0,
  tipos: [...new Set(filas.map((f) => f.tipo))], origenes: [], sugerencia: null,
})

const resumen: ResumenFuente[] = [
  { tipo: 'compra', total: 875, obra: 553, estructura: 322, pendiente: 0, sin_texto: 0 },
  { tipo: 'pedido', total: 17, obra: 17, estructura: 0, pendiente: 0, sin_texto: 0 },
  { tipo: 'herramienta', total: 150, obra: 118, estructura: 30, pendiente: 1, sin_texto: 1 },
  { tipo: 'movimiento', total: 53, obra: 27, estructura: 25, pendiente: 1, sin_texto: 0 },
]
const de = (r: ResumenFuente[], t: string) => r.find((x) => x.tipo === t)!

test('resolver el texto lo saca del contador de LAS DOS fuentes en las que aparecía', () => {
  const g = grupo('serv tecnico', [fila('herramienta', 'h1'), fila('movimiento', 'm1')])
  const r = resumenTrasResolver(resumen, [g], [{ clave: 'serv tecnico', clasificacion: 'obra' }])
  assert.equal(de(r, 'herramienta').pendiente, 0, 'la cola quedó vacía y el contador sigue pidiendo trabajo')
  assert.equal(de(r, 'movimiento').pendiente, 0, 'quedó un pendiente fantasma en la otra fuente')
  assert.equal(de(r, 'herramienta').obra, 119)
  assert.equal(de(r, 'movimiento').obra, 28)
})

test('resolver como estructura NO suma en «a una obra»', () => {
  const g = grupo('uocra', [fila('compra', 'c1'), fila('compra', 'c2')])
  const base = [{ tipo: 'compra' as const, total: 875, obra: 553, estructura: 320, pendiente: 2, sin_texto: 0 }]
  const r = resumenTrasResolver(base, [g], [{ clave: 'uocra', clasificacion: 'indirecto' }])
  assert.equal(de(r, 'compra').obra, 553, 'un costo de la empresa se contó como costo de una obra')
  assert.equal(de(r, 'compra').estructura, 322)
  assert.equal(de(r, 'compra').pendiente, 0)
})

test('«mantenimiento» va a una obra y «excluido» no', () => {
  const g = grupo('taller', [fila('compra', 'c1')])
  const base = [{ tipo: 'compra' as const, total: 10, obra: 4, estructura: 5, pendiente: 1, sin_texto: 0 }]
  assert.equal(de(resumenTrasResolver(base, [g], [{ clave: 'taller', clasificacion: 'mantenimiento' }]), 'compra').obra, 5)
  assert.equal(de(resumenTrasResolver(base, [g], [{ clave: 'taller', clasificacion: 'excluido' }]), 'compra').estructura, 6)
})

test('el total y las filas sin texto no se tocan: resolver no crea ni borra filas', () => {
  const g = grupo('serv tecnico', [fila('herramienta', 'h1')])
  const r = resumenTrasResolver(resumen, [g], [{ clave: 'serv tecnico', clasificacion: 'obra' }])
  assert.equal(de(r, 'herramienta').total, 150)
  assert.equal(de(r, 'herramienta').sin_texto, 1, 'una fila sin texto no la resuelve ningún alias')
})

test('si el servidor ya descontó el pendiente, la cuenta local no lo deja en negativo', () => {
  const g = grupo('serv tecnico', [fila('herramienta', 'h1')])
  const yaSinPendientes: ResumenFuente[] = [
    { tipo: 'herramienta', total: 150, obra: 119, estructura: 30, pendiente: 0, sin_texto: 1 },
  ]
  const r = resumenTrasResolver(yaSinPendientes, [g], [{ clave: 'serv tecnico', clasificacion: 'obra' }])
  assert.equal(de(r, 'herramienta').pendiente, 0, 'el contador se fue a negativo')
})

test('sin nada resuelto el resumen vuelve tal cual, y una clave desconocida no mueve nada', () => {
  assert.equal(resumenTrasResolver(resumen, [], []), resumen)
  const r = resumenTrasResolver(resumen, [], [{ clave: 'no existe', clasificacion: 'obra' }])
  assert.deepEqual(r, resumen)
})

test('el tramo ámbar se ve aunque sea 1 pendiente sobre 875 filas, y desaparece cuando no hay', () => {
  const s = segmentosDeFuente({ tipo: 'compra', total: 875, obra: 553, estructura: 321, pendiente: 1, sin_texto: 0 })
  assert.equal(s.pendiente, '2.0%', 'el único indicio de trabajo mide 0,1 px y no se dibuja')
  const alDia = segmentosDeFuente({ tipo: 'compra', total: 875, obra: 553, estructura: 322, pendiente: 0, sin_texto: 0 })
  assert.equal(alDia.pendiente, '0.0%', 'una fuente al día dibuja ámbar igual')
})

test('una fuente vacía no divide por cero', () => {
  const s = segmentosDeFuente({ tipo: 'pedido', total: 0, obra: 0, estructura: 0, pendiente: 0, sin_texto: 0 })
  assert.deepEqual(s, { obra: '0%', estructura: '0%', pendiente: '0%' })
})

test('el desglose de la barra nombra los CINCO números, no los tres que se dibujan', () => {
  const t = desgloseDeFuente(de(resumen, 'herramienta'), 'Herramientas')
  for (const n of ['118', '30', '1 pendiente', '1 sin texto', '150 en total']) {
    assert.ok(t.includes(n), `el tooltip no dice «${n}»: la barra no se puede reconstruir`)
  }
})

test('filasPorTipo cuenta por fuente, no el total del grupo', () => {
  const g = grupo('x', [fila('compra', 'a'), fila('compra', 'b'), fila('movimiento', 'c')])
  assert.deepEqual(filasPorTipo(g), { compra: 2, movimiento: 1 })
})

test('las cuatro clasificaciones de la pantalla son las cuatro que acepta el servidor', () => {
  // El enum de Zod de `resolverImputacion`. Si acá aparece una quinta, el servidor la rechaza y el
  // botón queda ofreciendo algo que no se puede guardar.
  assert.deepEqual(CLASIFICACIONES.map((c) => c.clave), ['obra', 'mantenimiento', 'indirecto', 'excluido'])
  // Y la misma regla de coherencia que el servidor vuelve a aplicar: obra y mantenimiento piden
  // obra destino; estructura y excluido la prohíben.
  assert.deepEqual(CLASIFICACIONES.map((c) => pideObra(c.clave)), [true, true, false, false])
})
