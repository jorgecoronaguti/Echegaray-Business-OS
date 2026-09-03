// LO LEÍDO HASTA AHORA TIENE QUE SER LO MISMO QUE VA A QUEDAR, sólo que menos.
//
// El defecto que estos controles atrapan: si el parcial contara los elementos a mano en vez de
// pasar por la MISMA fusión que usa `correr()`, una columna vista en la planta y otra vez en el
// corte se contaría dos veces mientras se lee y una sola al terminar. El dueño vería el cómputo
// bajar solo, y ninguna de las dos cifras sería explicable.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lecturaHastaAhora } from './parcial.mjs'
import { razonar } from './razonamiento.mjs'
import { vistaDePasos, ESTADO } from './pasos-vista.mjs'

const columna = (id, sobre = {}) => ({
  id, nombre: 'columna de carga', forma: 'PRISMA',
  dimensiones: { ancho: { valor: 0.3 }, alto: { valor: 0.3 }, largo: { valor: 3.5 } },
  repeticion: { cantidad: { valor: 8 } },
  ...sobre,
})

const lam = (archivo, elementos) => ({
  archivo, lamina: { codigo: archivo.replace('.pdf', ''), vistas: ['planta'] },
  grilla: { largoTotal: 40, anchoTotal: 32 }, elementos, proyecto: {},
})

test('sin nada leído devuelve la forma de una corrida, vacía — no null ni un cómputo inventado', () => {
  const r = lecturaHastaAhora()
  assert.deepEqual(r.laminas, [])
  assert.deepEqual(r.computo.items, [])
  assert.ok(razonar(r), 'tiene que poder entrar a `razonar()` tal cual: es el mismo contrato')
})

test('la MISMA columna vista en dos láminas es UNA sola en el cómputo parcial', () => {
  const r = lecturaHastaAhora({
    laminas: [lam('A-01.pdf', [columna('C1')]), lam('A-07.pdf', [columna('C1')])],
  })
  assert.equal(r.computo.items.length, 1, 'sin la fusión, el cómputo parcial contaría doble mientras lee y simple al cerrar')
})

test('las vistas recortadas suman al parcial junto con las láminas — no lo reemplazan', () => {
  const r = lecturaHastaAhora({
    laminas: [lam('A-01.pdf', [columna('C1')])],
    porRegion: [{ archivo: 'A-01.pdf', elementos: [columna('V1', { nombre: 'viga de fundación' })] }],
  })
  assert.deepEqual(r.computo.items.map((i) => i.id).sort(), ['C1', 'V1'])
})

test('los documentos viajan enteros: un plano ilegible llega al razonamiento parcial', () => {
  const documentos = { planos: { legibles: [], noLegibles: [{ name: 'E-02.pdf' }] } }
  const r = lecturaHastaAhora({ laminas: [lam('A-01.pdf', [columna('C1')])], documentos })
  // Se comprueba sobre el RAZONAMIENTO, no sobre el texto del resumen: mientras la lectura está
  // abierta el resumen no publica conclusiones, pero el dato tiene que estar ahí para cuando cierre.
  assert.deepEqual(razonar(r).barrido.noLegibles, ['E-02.pdf'], 'sin esto, al cerrar la lectura el barrido diría que todo se pudo abrir')
  const abierto = vistaDePasos(razonar(r), { items: r.computo.items, cerrada: false }).find((p) => p.id === 'p7')
  assert.equal(abierto.estado, ESTADO.EN_CURSO, 'el barrido ya leyó una lámina: no está pendiente')
  const cerrado = vistaDePasos(razonar(r), { items: r.computo.items, cerrada: true }).find((p) => p.id === 'p7')
  assert.ok(cerrado.resumen.includes('E-02.pdf'), 'al cerrar, el documento que no se pudo abrir se dice con nombre')
})
