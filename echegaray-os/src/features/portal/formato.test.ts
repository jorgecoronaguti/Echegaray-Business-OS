import test from 'node:test'
import assert from 'node:assert/strict'
import {
  fechaCortaPortal, haceTexto, millonesCorto, millonesDesnudo, millonesPortal, plazoTexto, porcentajePortal,
} from './formato.ts'

test('el portal escribe los importes con DOS decimales, como el mockup 29', () => {
  assert.equal(millonesPortal(26_400_000), '$ 26,40 M')
  assert.equal(millonesPortal(8_200_000), '$ 8,20 M')
  assert.equal(millonesPortal(1_560_000), '$ 1,56 M')
  assert.equal(millonesDesnudo(14_260_000), '14,26')
  assert.equal(millonesCorto(4_100_000), '4,10 M')
})

test('abajo del millón el portal NO cae al peso entero — el fondo de reparo del mockup es $ 0,64 M', () => {
  // El defecto: reusar `millones()` del canon, que devuelve `$ 640.000`. En una barra donde los
  // otros tres tramos están en millones, el que va en pesos enteros se lee como el más grande.
  assert.equal(millonesPortal(640_000), '$ 0,64 M')
})

test('un importe que no existe no se escribe como cero', () => {
  assert.equal(millonesPortal(null), null)
  assert.equal(millonesPortal(undefined), null)
  assert.equal(millonesPortal(''), null)
  assert.equal(millonesPortal(0), '$ 0,00 M')
})

test('un numeric que llega como texto se formatea igual', () => {
  assert.equal(millonesPortal('26400000'), '$ 26,40 M')
  assert.equal(millonesPortal('no es un número'), null)
})

test('la cabecera de obra fecha con año de dos dígitos', () => {
  assert.equal(fechaCortaPortal('2026-07-22'), '22/07/26')
  assert.equal(fechaCortaPortal('2026-11-28T00:00:00Z'), '28/11/26')
  assert.equal(fechaCortaPortal(null), null)
  assert.equal(fechaCortaPortal('22/07/2026'), null)
})

test('el que vence hoy dice «hoy», no «en 0 d»', () => {
  assert.equal(plazoTexto(24), 'en 24 d')
  assert.equal(plazoTexto(0), 'hoy')
  assert.equal(plazoTexto(-20), '20 d')
})

test('el sello del certificado a aprobar se lee en castellano', () => {
  assert.equal(haceTexto(2), 'hace 2 días')
  assert.equal(haceTexto(1), 'ayer')
  assert.equal(haceTexto(0), 'hoy')
  assert.equal(haceTexto(null), null)
})

test('el porcentaje lleva el espacio antes del signo, como todo el zip', () => {
  assert.equal(porcentajePortal(28), '28 %')
  assert.equal(porcentajePortal(5.9, 1), '5,9 %')
  assert.equal(porcentajePortal(null), null)
})
