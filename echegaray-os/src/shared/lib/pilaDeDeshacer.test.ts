// CMD+Z / CTRL+Z DESHACE EL ÚLTIMO CAMBIO EN TODA LA PLATAFORMA (dueño, 15/09/2026).
//
// Textual: *«tendria q funcionar el cmd + z (ctrl +z en windows) para deshacer cambio en la plataforma»* y
// *«Deshacer con Cmd/Ctrl+Z … en TODA la plataforma»*. Cada guardado exitoso apila { clave, rótulo, ruta, valor
// anterior, valor nuevo }; Cmd+Z con el foco FUERA de un input lo deshace con la misma acción del servidor.
//
// MUTACIONES QUE LO PONEN ROJO: interceptar el atajo dentro de un input; una pila sin límite.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  LIMITE_DE_PASOS, MENSAJE_CONFLICTO, apilar, atajoDeDeshacer, destinoEditable, esTecladoMac, hayConflicto, pilaVacia,
  quitarPaso, sinPasosDeOtraRuta, textoDelAtajoDeRehacer, textoDelAviso, tomarParaDeshacer, tomarParaRehacer,
  type PasoDeEdicion,
} from './pilaDeDeshacer.ts'

const RUTA = '/administracion/personas?vista=liquidacion&quincena=2026-09-01'
const paso = (n: number, e: Partial<PasoDeEdicion> = {}): PasoDeEdicion => ({
  id: `p${n}`, clave: 'celda-porBanco-rosales', rotulo: 'Banco de Rosales', ruta: RUTA,
  anterior: '230240', nuevo: String(250000 + n), anteriorTexto: '$230.240', nuevoTexto: '$250.000', ...e,
})

test('APILAR, DESHACER Y REHACER: el último primero, y rehacer vuelve a aplicarlo', () => {
  let p = apilar(apilar(pilaVacia(), paso(1)), paso(2))
  assert.equal(p.deshacer.length, 2)
  const d = tomarParaDeshacer(p)
  assert.equal(d?.paso.id, 'p2')
  p = d!.pila
  assert.equal(p.rehacer.length, 1)
  const r = tomarParaRehacer(p)
  assert.equal(r?.paso.id, 'p2')
  assert.equal(r!.pila.deshacer.length, 2)
  assert.equal(tomarParaDeshacer(pilaVacia()), null, 'nada que deshacer')
  assert.equal(tomarParaRehacer(pilaVacia()), null)
})

test('UN GUARDADO NUEVO BORRA LO QUE HABÍA PARA REHACER; UNO QUE NO CAMBIÓ NADA NO SE APILA', () => {
  const p = tomarParaDeshacer(apilar(pilaVacia(), paso(1)))!.pila
  assert.equal(apilar(p, paso(2)).rehacer.length, 0)
  assert.equal(apilar(pilaVacia(), paso(3, { anterior: '5', nuevo: '5' })).deshacer.length, 0)
})

test('SE GUARDAN 50 PASOS COMO MÁXIMO: se pierde el más viejo', () => {
  let p = pilaVacia()
  for (let i = 0; i < LIMITE_DE_PASOS + 5; i++) p = apilar(p, paso(i))
  assert.equal(p.deshacer.length, 50, 'MUTACIÓN: sin límite quedan 55')
  assert.equal(p.deshacer[0].id, 'p5')
})

test('CAMBIAR DE RUTA DESCARTA LO QUE YA NO ESTÁ EN PANTALLA', () => {
  const p = apilar(apilar(pilaVacia(), paso(1)), paso(2, { ruta: '/obras/x?tab=avance' }))
  assert.deepEqual(sinPasosDeOtraRuta(p, RUTA).deshacer.map((x) => x.id), ['p1'])
  // La quincena es parte de la ruta: otra quincena es otra pantalla.
  assert.deepEqual(sinPasosDeOtraRuta(p, `${RUTA.slice(0, -10)}2026-09-16`).deshacer, [])
  assert.deepEqual(quitarPaso(p, 'p1').deshacer.map((x) => x.id), ['p2'])
})

test('CONFLICTO: si el valor que se ve no es el que se guardó, no se pisa', () => {
  assert.equal(hayConflicto('250001', '250001'), false)
  assert.equal(hayConflicto('999', '250001'), true)
  assert.equal(hayConflicto(undefined, '250001'), false, 'sin celda viva decide el servidor')
  assert.equal(MENSAJE_CONFLICTO, 'cambió desde tu edición, no se deshizo')
})

test('EL ATAJO: Cmd+Z o Ctrl+Z deshace, Shift o Ctrl+Y rehace, y NUNCA dentro de un input', () => {
  const tecla = (e: Partial<Parameters<typeof atajoDeDeshacer>[0]>) =>
    atajoDeDeshacer({ key: 'z', metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, enEditable: false, ...e })
  assert.equal(tecla({ metaKey: true }), 'deshacer')
  assert.equal(tecla({ ctrlKey: true }), 'deshacer')
  assert.equal(tecla({ key: 'Z', metaKey: true, shiftKey: true }), 'rehacer')
  assert.equal(tecla({ key: 'y', ctrlKey: true }), 'rehacer')
  assert.equal(tecla({ metaKey: true, enEditable: true }), null, 'MUTACIÓN: interceptar dentro de un input rompe el deshacer del texto')
  assert.equal(tecla({ ctrlKey: true, altKey: true }), null)
  assert.equal(tecla({}), null)
  assert.equal(tecla({ key: 'x', metaKey: true }), null)
  assert.equal(destinoEditable({ tagName: 'INPUT' }), true)
  assert.equal(destinoEditable({ tagName: 'TEXTAREA' }), true)
  assert.equal(destinoEditable({ tagName: 'SELECT' }), true)
  assert.equal(destinoEditable({ tagName: 'DIV', isContentEditable: true }), true)
  assert.equal(destinoEditable({ tagName: 'BUTTON' }), false)
  assert.equal(destinoEditable(null), false)
})

test('EL AVISO DICE QUÉ CAMBIÓ', () => {
  assert.equal(textoDelAviso('deshacer', paso(0)), 'Deshecho: Banco de Rosales $250.000 → $230.240')
  assert.equal(textoDelAviso('rehacer', paso(0)), 'Rehecho: Banco de Rosales $230.240 → $250.000')
})

// ═══ DUEÑO, 17/09/2026: «así como está el deshacer cmd+z … tiene que estar el rehacer en toda la plataforma» ═══

test('CMD+Y TAMBIÉN REHACE (antes sólo Ctrl+Y, y en la Mac no pasaba nada)', () => {
  const tecla = (e: Partial<Parameters<typeof atajoDeDeshacer>[0]>) =>
    atajoDeDeshacer({ key: 'z', metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, enEditable: false, ...e })
  // MUTACIÓN QUE LO PONE ROJO: volver a `k === 'y' && e.ctrlKey && !e.metaKey`.
  assert.equal(tecla({ key: 'y', metaKey: true }), 'rehacer')
  assert.equal(tecla({ key: 'Y', metaKey: true }), 'rehacer')
  assert.equal(tecla({ key: 'y', ctrlKey: true }), 'rehacer')
  // CMD+A NO SE TOCA: es «seleccionar todo» y robarlo es inaceptable (pedido explícito).
  assert.equal(tecla({ key: 'a', metaKey: true }), null)
  assert.equal(tecla({ key: 'a', ctrlKey: true }), null)
  // Y sin modificador la «y» sigue siendo una letra.
  assert.equal(tecla({ key: 'y' }), null)
})

test('EL ATAJO DE REHACER SE PUEDE ESCRIBIR EN PANTALLA, CON EL TECLADO DE QUIEN MIRA', () => {
  // Nadie sabía que rehacer era Cmd+Shift+Z: el aviso tiene que decirlo.
  assert.equal(textoDelAtajoDeRehacer(true), '\u2318\u21e7Z')
  assert.equal(textoDelAtajoDeRehacer(false), 'Ctrl+Shift+Z')
  assert.equal(esTecladoMac('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'), true)
  assert.equal(esTecladoMac('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'), true)
  assert.equal(esTecladoMac('Mozilla/5.0 (Windows NT 10.0; Win64; x64)'), false)
  assert.equal(esTecladoMac(undefined), false)
})
