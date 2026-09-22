import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  codigoDeLectura, FORMATO_CODIGO, limpiarPrefijo, normalizarCodigo, prefijoDeNombre, problemaDelPrefijo, urlDeEtiqueta,
} from './codigo.ts'

test('lo que se tipea en obra termina en el mismo código que el QR', () => {
  assert.equal(normalizarCodigo('her 42'), 'HER-0042')
  assert.equal(normalizarCodigo('HER0042'), 'HER-0042')
  assert.equal(normalizarCodigo(' her-0042 '), 'HER-0042')
  assert.equal(normalizarCodigo('rod6'), 'ROD-0006')
  assert.equal(normalizarCodigo('equ_12'), 'EQU-0012')
  assert.equal(normalizarCodigo('HER-12345'), 'HER-12345')
})

test('una etiqueta ajena que ya estaba pegada se respeta', () => {
  assert.equal(normalizarCodigo('ecs-7741-qx'), 'ECS-7741-QX')
  assert.equal(normalizarCodigo('ecs 7741 qx'), 'ECS-7741-QX')
  assert.equal(normalizarCodigo('   '), null)
})

test('la URL de la etiqueta, en todas sus formas, da el código', () => {
  assert.equal(codigoDeLectura('https://app.ecsas.com.ar/h/HER-0042'), 'HER-0042')
  assert.equal(codigoDeLectura('https://app.ecsas.com.ar/h/HER-0042/'), 'HER-0042')
  assert.equal(codigoDeLectura('http://APP.ECSAS.COM.AR/h/her-0042?x=1'), 'HER-0042')
  assert.equal(codigoDeLectura('app.ecsas.com.ar/h/HER-0042'), 'HER-0042')
  assert.equal(codigoDeLectura(urlDeEtiqueta('ECS-7741-QX')), 'ECS-7741-QX')
})

test('un QR de otro sitio no es un código de Echegaray', () => {
  assert.equal(codigoDeLectura('https://wa.me/5492645555555'), null)
  assert.equal(codigoDeLectura('https://app.ecsas.com.ar/obras/OB-0012'), null)
  assert.equal(codigoDeLectura('x'.repeat(80)), null)
})

test('el código pelado leído por la cámara también sirve', () => {
  assert.equal(codigoDeLectura('HER-0042'), 'HER-0042')
  assert.equal(codigoDeLectura(''), null)
})

test('el código nuevo: tres letras del nombre y tres cifras', () => {
  assert.equal(normalizarCodigo('amo 7'), 'AMO-007')
  assert.equal(normalizarCodigo('AMO007'), 'AMO-007')
  assert.equal(normalizarCodigo('car-14'), 'CAR-014')
  assert.equal(normalizarCodigo('mar 1203'), 'MAR-1203')
  assert.equal(codigoDeLectura('https://app.ecsas.com.ar/h/AMO-007'), 'AMO-007')
  assert.match('AMO-007', FORMATO_CODIGO)
  assert.doesNotMatch('AM-007', FORMATO_CODIGO)
  assert.doesNotMatch('AMO-7', FORMATO_CODIGO)
  assert.doesNotMatch('ÁMO-007', FORMATO_CODIGO)
})

test('el prefijo sugerido sale del nombre igual que en la base', () => {
  assert.equal(prefijoDeNombre('Amoladora "4 HILTI - 4'), 'AMO')
  assert.equal(prefijoDeNombre('Arnés de seguridad 1'), 'ARN')
  assert.equal(prefijoDeNombre('ÉSCALERA'), 'ESC')
  assert.equal(prefijoDeNombre('Ñandú'), 'NAN')
  assert.equal(prefijoDeNombre('2 Llaves'), 'LLA')
  assert.equal(prefijoDeNombre('Pi'), 'PIX')
  assert.equal(prefijoDeNombre(''), 'XXX')
})

test('el campo del prefijo no deja escribir cualquier cosa', () => {
  assert.equal(limpiarPrefijo('cr-t9'), 'CRT')
  assert.equal(limpiarPrefijo('áéíóu'), 'AEI')
  assert.equal(limpiarPrefijo('12 3'), '')
  assert.equal(problemaDelPrefijo(''), 'Escribí tres letras')
  assert.equal(problemaDelPrefijo('CR'), 'Falta 1 letra')
  assert.equal(problemaDelPrefijo('C'), 'Faltan 2 letras')
  assert.equal(problemaDelPrefijo('CRT'), null)
})
