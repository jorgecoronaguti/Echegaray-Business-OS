// EL DEFECTO QUE ESTE TEST IMPIDE: que exista el estado CANCELADO en la base y en el contrato, pero
// la pantalla no ofrezca cómo llegar a él o no lo entienda cuando llega.
//
// Son dos agujeros distintos y los dos ya pasaron en este repo con estados nuevos:
//   1 · el botón está, pero no llama al servicio que cancela de verdad (un control decorativo);
//   2 · el trabajo se cancela, pero el sondeo sigue preguntando cada 1,5 s para siempre, porque la
//       lista de estados terminales estaba escrita a mano en el hook y nadie la actualizó.
//
// No hay navegador acá, así que se verifica lo que se puede verificar sin uno: que el cableado
// exista y que la lista de estados finales viva en UN solo lugar (`esFinal`).

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const AQUI = dirname(fileURLToPath(import.meta.url))
const leer = (...partes: string[]) => readFileSync(join(AQUI, ...partes), 'utf8')

const CONVERSACION = leer('ConversacionLectura.tsx')
const ENTORNO = leer('EntornoLecturaPlano.tsx')
const HOOK = leer('..', 'hooks', 'useSondeoTrabajo.ts')

test('la columna de conversación ofrece cancelar mientras el trabajo corre', () => {
  assert.match(CONVERSACION, /data-testid="cancelar-lectura"/, 'sin control visible no hay forma de frenar una corrida que se paga')
  assert.match(CONVERSACION, /onClick=\{cancelando \? undefined : onCancelar\}/, 'el botón tiene que llamar al handler, no ser decorativo')
  assert.match(CONVERSACION, /estado === 'CANCELADO'/, 'la pantalla tiene que decir que se canceló, no quedar muda')
})

test('el entorno cablea el botón contra el servicio que cancela de verdad', () => {
  assert.match(ENTORNO, /cancelarLectura/, 'el callback tiene que pegarle al endpoint, no sólo limpiar el estado local')
  assert.match(ENTORNO, /onCancelar=\{cancelar\}/)
  assert.ok(!/setTrabajoId\(null\)[\s\S]{0,200}cancelarLectura/.test(ENTORNO),
    'cancelar no puede borrar el trabajo de la pantalla antes de que el servidor lo confirme')
})

test('el sondeo pregunta por los estados finales a esFinal — nunca a una lista escrita a mano', () => {
  assert.match(HOOK, /esFinal\(t\.estado\)/, 'el hook tiene que usar la única definición de "ya terminó"')
  assert.ok(!/estado === 'LISTO'/.test(HOOK), 'una lista literal en el hook es la que se olvida de actualizar el día que se agrega un estado')
})
