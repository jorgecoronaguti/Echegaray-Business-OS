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
  LIMITE_DE_PASOS, MENSAJE_CONFLICTO, MENSAJE_SIN_ANTERIOR, apilar, atajoDeDeshacer, coincideConLoEsperado,
  destinoEditable, esTecladoMac, hayConflicto, motivoParaNoRestaurar, pilaVacia, quitarPaso, sinPasosDeOtraRuta,
  textoDelAtajoDeRehacer, textoDelAviso, tomarParaDeshacer, tomarParaRehacer, type PasoDeEdicion,
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
  // El aviso dice QUIÉN: «otra persona». «cambió desde tu edición» no explicaba nada a quien lo leía.
  assert.equal(MENSAJE_CONFLICTO, 'la celda la cambió otra persona: no se deshizo')
})

// ═══ AUDITORÍA 18/09/2026: NINGUNA ESCRITURA PUEDE VACIAR UNA CELDA CARGADA POR OTRA PERSONA ═══
//
// Pedidos: otra persona asignó X, el select no adoptó la prop y siguió en `''`, esta persona eligió Y y Cmd+Z
// escribió NULL sobre la X. La regla vive acá, en la plataforma: deshacer hacia `''` no escribe, salvo que la
// celda declare que el vacío es un valor con contenido (Liquidación: vuelve al calculado, servidor verifica).
//
// MUTACIÓN QUE LO PONE ROJO: que `motivoParaNoRestaurar` devuelva `null` con `anterior === ''`.

test('DESHACER HACIA VACÍO SE RECHAZA: no había un valor anterior que restaurar', () => {
  const sinAnterior = paso(1, { anterior: '', nuevo: 'act-X', anteriorTexto: 'sin asignar', nuevoTexto: 'Excavación' })
  assert.equal(motivoParaNoRestaurar('deshacer', sinAnterior), MENSAJE_SIN_ANTERIOR)
  assert.equal(MENSAJE_SIN_ANTERIOR, 'no había un valor anterior que restaurar: no se deshizo')
  // Con un anterior real, se deshace.
  assert.equal(motivoParaNoRestaurar('deshacer', paso(2, { anterior: 'act-X', nuevo: 'act-Y' })), null)
  // Rehacer un vaciado es repetir lo que esta persona hizo: no entra en la regla (viaja con `esperado`).
  assert.equal(motivoParaNoRestaurar('rehacer', paso(3, { anterior: 'act-X', nuevo: '' })), null)
  assert.equal(motivoParaNoRestaurar('rehacer', sinAnterior), null)
})

test('LA EXCEPCIÓN ES DECLARADA: `vacioRestaurable` (el vacío vuelve al calculado, no vacía la celda)', () => {
  const liquidacion = paso(1, { anterior: '', nuevo: '250000', vacioRestaurable: true })
  assert.equal(motivoParaNoRestaurar('deshacer', liquidacion), null)
  // `false` explícito vale lo mismo que ausente.
  assert.equal(motivoParaNoRestaurar('deshacer', { ...liquidacion, vacioRestaurable: false }), MENSAJE_SIN_ANTERIOR)
})

test('LA COMPROBACIÓN DEL SERVIDOR: lo que hay hoy en la base contra lo que la pantalla vio', () => {
  // NULL y `''` son el mismo vacío: una celda «sin asignar» que la pantalla vio vacía coincide.
  assert.equal(coincideConLoEsperado(null, ''), true)
  assert.equal(coincideConLoEsperado(undefined, ''), true)
  // La celda la cargó otra persona y la pantalla la vio vacía: NO coincide. Es exactamente el caso de la auditoría.
  assert.equal(coincideConLoEsperado('act-X', ''), false)
  assert.equal(coincideConLoEsperado(null, 'act-X'), false)
  assert.equal(coincideConLoEsperado('act-X', 'act-X'), true)
  assert.equal(coincideConLoEsperado('act-X', 'act-Y'), false)
  // Un número guardado se compara como número: la celda de Presupuestos dibuja «123,5» y la base tiene 123.5.
  assert.equal(coincideConLoEsperado(123.5, '123,5'), true)
  assert.equal(coincideConLoEsperado(34, '34,00'), true)
  assert.equal(coincideConLoEsperado(123.5, '123'), false)
  assert.equal(coincideConLoEsperado(0, ''), false, 'un cero guardado no es un vacío')
  assert.equal(coincideConLoEsperado(5, 'abc'), false)
  // Texto: sin espacios en las puntas, y sensible al contenido.
  assert.equal(coincideConLoEsperado(' contrato ', 'contrato'), true)
  assert.equal(coincideConLoEsperado('contrato', 'Contrato'), false)
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
  // UN SELECT NO ES EDITABLE (18/09/2026): el foco queda en él después de elegir y el navegador no tiene texto que
  // deshacer ahí. Con `true`, Cmd+Z no hacía nada hasta clicar afuera — lo encontró el auditor en Pedidos.
  assert.equal(destinoEditable({ tagName: 'SELECT' }), false)
  assert.equal(destinoEditable({ tagName: 'select' }), false)
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
