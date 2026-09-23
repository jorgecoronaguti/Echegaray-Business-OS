// LA REGLA QUE DECIDE SI EL CHECKOUT QUE ESCRIBE EL SHEET SE ACTUALIZA SOLO.
//
// El defecto que este script existe para que no vuelva: el timer del Flujo de Caja corre desde un
// checkout aparte, ese checkout quedó días atrás, y una corrida con el generador viejo PISÓ 115
// fórmulas ya aplicadas a «Plantel». Silencioso: sin error, sin log rojo, y el dueño abrió el Sheet
// y no había cambiado nada.

import test from 'node:test'
import assert from 'node:assert/strict'
import { decidir, decidirReinicios, parsearShow, DAEMONS_DEL_REPO } from './produccion-al-dia.mjs'

test('al día no hace nada: no se toca un checkout que ya está donde tiene que estar', () => {
  assert.equal(decidir({ sucio: false, alDia: true, puedeAvanzar: true }).accion, 'nada')
})

test('atrasado y sin divergir: avanza, que es todo el punto del script', () => {
  const d = decidir({ sucio: false, alDia: false, puedeAvanzar: true })
  assert.equal(d.accion, 'avanzar')
  assert.match(d.porQue, /sin merge/)
})

test('con el árbol SUCIO no se toca, aunque esté atrasado', () => {
  // ═══ EL DEFECTO QUE ATRAPA ═══
  //
  // Que el script pise el trabajo sin commitear de quien esté depurando en ese checkout. Sería
  // reemplazar una forma de perder trabajo por otra — y encima automática.
  assert.equal(decidir({ sucio: true, alDia: false, puedeAvanzar: true }).accion, 'no-tocar')
  assert.equal(decidir({ sucio: true, alDia: false, puedeAvanzar: false }).accion, 'no-tocar')
  // El árbol sucio gana incluso sobre «al día»: no hay ninguna razón para tocarlo.
  assert.equal(decidir({ sucio: true, alDia: true, puedeAvanzar: true }).accion, 'no-tocar')
})

test('si producción DIVERGIÓ, avisa y NO mergea', () => {
  // ═══ POR QUÉ ESTO NO PUEDE SER UN `git pull` A SECAS ═══
  //
  // Un merge automático en el checkout que escribe el Sheet real es exactamente cómo se pierde una
  // pestaña: resuelve un conflicto solo, publica el resultado, y nadie lo miró. Si divergió, hace
  // falta una persona.
  const d = decidir({ sucio: false, alDia: false, puedeAvanzar: false })
  assert.equal(d.accion, 'avisar')
  assert.match(d.porQue, /una persona/)
  assert.notEqual(d.accion, 'avanzar')
})

test('la decisión es PURA: los mismos insumos dan lo mismo, y no hay más acciones que estas cuatro', () => {
  // Un quinto estado que caiga en un `undefined` haría que el llamador no haga nada sin decirlo.
  const acciones = new Set()
  for (const sucio of [true, false]) {
    for (const alDia of [true, false]) {
      for (const puedeAvanzar of [true, false]) {
        const d = decidir({ sucio, alDia, puedeAvanzar })
        assert.ok(d && typeof d.accion === 'string' && d.porQue, `sin decisión para ${JSON.stringify({ sucio, alDia, puedeAvanzar })}`)
        acciones.add(d.accion)
      }
    }
  }
  assert.deepEqual([...acciones].sort(), ['avanzar', 'avisar', 'nada', 'no-tocar'])
})

// ═══ EL SEGUNDO DEFECTO (23/09/2026): EL DISCO AVANZA, LOS DAEMONS NO ═══
//
// Avanzar el checkout arregla a los timers, que arrancan de cero. Los daemons (worker, bot, puerta
// de XSAS) siguen con el código viejo en memoria y systemd los muestra `active`. Se reiniciaron a
// mano. `decidirReinicios` es la regla que decide cuáles se reinician solos y cuáles no se tocan.

const ACTIVOS = Object.fromEntries(DAEMONS_DEL_REPO.map((d) => [d.unit, 'active']))
const MOVIO = { antes: 'aaaa1111', despues: 'bbbb2222' }

test('si el HEAD no se movió, no se reinicia nada: el código en memoria es el del disco', () => {
  const r = decidirReinicios({ antes: 'aaaa1111', despues: 'aaaa1111', unitActual: null, estados: ACTIVOS })
  assert.deepEqual(r, { reiniciar: [], omitidos: [] })
})

test('si el HEAD se movió, reinicia TODOS los daemons activos de la lista, en el orden de la lista', () => {
  const r = decidirReinicios({ ...MOVIO, unitActual: null, estados: ACTIVOS })
  assert.deepEqual(r.reiniciar, DAEMONS_DEL_REPO.map((d) => d.unit))
  assert.deepEqual(r.omitidos, [])
})

test('NUNCA reinicia el unit que lo está ejecutando: sería matarse a mitad del ExecStartPre', () => {
  const propio = DAEMONS_DEL_REPO[0].unit
  const r = decidirReinicios({ ...MOVIO, unitActual: propio, estados: ACTIVOS })
  assert.ok(!r.reiniciar.includes(propio))
  assert.equal(r.omitidos.length, 1)
  assert.equal(r.omitidos[0].unit, propio)
  assert.match(r.omitidos[0].porQue, /ExecStartPre/)
  // Los demás sí.
  assert.equal(r.reiniciar.length, DAEMONS_DEL_REPO.length - 1)
})

test('un daemon que NO está active no se reinicia: `restart` lo arrancaría, y parado está a propósito', () => {
  // ═══ EL DEFECTO QUE ATRAPA ═══
  //
  // Balanz y claude-remote están parados porque el dueño lo decidió. Un `systemctl restart` sobre un
  // unit inactivo lo ARRANCA. Reiniciar «todo lo de la lista» sin mirar el estado desharía esa decisión
  // en el próximo push, sin que nadie lo pida.
  const [a, b, ...resto] = DAEMONS_DEL_REPO.map((d) => d.unit)
  const estados = { ...ACTIVOS, [a]: 'inactive', [b]: 'activating' }
  const r = decidirReinicios({ ...MOVIO, unitActual: null, estados })
  assert.deepEqual(r.reiniciar, resto)
  assert.deepEqual(r.omitidos.map((o) => o.unit), [a, b])
  assert.match(r.omitidos[0].porQue, /inactive/)
  assert.match(r.omitidos[1].porQue, /activating/)
})

test('sin dato de estado no se reinicia a ciegas', () => {
  const r = decidirReinicios({ ...MOVIO, unitActual: null, estados: {} })
  assert.deepEqual(r.reiniciar, [])
  assert.equal(r.omitidos.length, DAEMONS_DEL_REPO.length)
  for (const o of r.omitidos) assert.match(o.porQue, /a ciegas/)
})

test('la lista de daemons es una sola, cerrada, y no incluye a los que están parados a propósito', () => {
  assert.ok(Object.isFrozen(DAEMONS_DEL_REPO))
  const unidades = DAEMONS_DEL_REPO.map((d) => d.unit)
  assert.equal(new Set(unidades).size, unidades.length, 'hay un unit repetido')
  for (const d of DAEMONS_DEL_REPO) {
    assert.match(d.unit, /^echegaray-.+\.service$/)
    assert.ok(d.porQue.length > 20, `${d.unit} sin porqué`)
  }
  // Parados a propósito o fuera del repo: si alguien los agrega, este test lo frena y obliga a leer el porqué.
  for (const prohibido of ['echegaray-claude-remote.service', 'echegaray-balanz-remoto.service', 'echegaray-os-tunnel.service']) {
    assert.ok(!unidades.includes(prohibido), `${prohibido} no va en la lista (ver comentario de DAEMONS_DEL_REPO)`)
  }
})

test('parsearShow lee bloques de `systemctl show -p Id,<prop> u1 u2…` y tolera propiedades vacías', () => {
  const salida = [
    'Id=echegaray-orq-worker.service', 'ActiveState=active', '',
    'Id=echegaray-balanz-remoto.service', 'ActiveState=inactive', '',
    'Id=echegaray-xsas-gateway.service', 'ActiveState=', '',
  ].join('\n')
  assert.deepEqual(parsearShow(salida, 'ActiveState'), {
    'echegaray-orq-worker.service': 'active',
    'echegaray-balanz-remoto.service': 'inactive',
    'echegaray-xsas-gateway.service': '',
  })
})
