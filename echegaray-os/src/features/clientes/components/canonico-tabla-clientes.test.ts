// LA FILA DEL CLIENTE DE `/clientes`: DE DÓNDE SALE CADA NÚMERO QUE DIBUJA.
//
// ═══ QUÉ DEFECTO ATRAPA ═══
//
// Esta tabla dibuja, en la MISMA fila, dos números de plata que vienen de dos preguntas distintas:
//
//   COLUMNA «CONTRATADO»  lo contratado de las obras EN CURSO (`contratado_en_curso`). Es el que
//                         tiene que cerrar contra la suma de las filas de obra que cuelgan debajo.
//   BARRA «COBRADO»       lo cobrado ACUMULADO del cliente sobre lo contratado de TODAS sus obras
//                         (`cobrado_neto_total` / `contratadoTotal`). Va así porque `cobranzas`
//                         anota el cobro contra el CLIENTE y no contra la obra: dividir el cobro de
//                         todas las obras por el contrato de las que están en curso da más de 100 %
//                         en cuanto una obra se cierre, y no es un porcentaje de nada.
//
// El error fácil —y el que este test impide— es pasarle a la barra `c.contratado`, que es la
// columna de al lado: compila, se dibuja, y publica una fracción de dos universos distintos que
// nadie puede detectar mirando la pantalla. Es la misma clase de defecto que el hito H1 vino a
// cerrar, una capa más arriba.
//
// Y el `title` tiene que DECIRLO con palabras (`ambito="cliente"`): dos porcentajes con el mismo
// rótulo y distinto universo, sin nada que los distinga, es cómo nace la sexta definición.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const codigo = () => readFileSync(
  fileURLToPath(new URL('./TablaClientes.tsx', import.meta.url)), 'utf8',
)

/** El bloque de la barra de cobro DEL CLIENTE (la de la obra tiene su propio `testid`). */
function barraDelCliente(): string {
  const src = codigo()
  const donde = src.indexOf('testid="cobro-cliente"')
  assert.notEqual(donde, -1, 'no existe la barra de cobro del cliente: este test quedó mirando al aire')
  const abre = src.lastIndexOf('<BarraDeCobro', donde)
  return src.slice(abre, src.indexOf('/>', donde) + 2)
}

test('la barra de cobro del cliente NO usa el contratado de la columna de al lado', () => {
  const barra = barraDelCliente()
  assert.match(
    barra, /contratado=\{c\.contratadoTotal\}/,
    'el denominador de la barra del cliente tiene que ser el contratado de TODAS sus obras '
    + '(`contratadoTotal`). Con `c.contratado` —lo contratado EN CURSO— el numerador y el '
    + 'denominador son de universos distintos y la barra pasa el 100 % al cerrarse una obra.',
  )
  assert.doesNotMatch(barra, /contratado=\{c\.contratado\}/)
})

test('el título de la barra del cliente dice de qué universo habla', () => {
  assert.match(
    barraDelCliente(), /ambito="cliente"/,
    'sin `ambito="cliente"` el `title` dice «cobrado X de Y contratado», la misma frase que la fila '
    + 'de una obra, sobre dos números que no son de la obra',
  )
})

test('lo cobrado del cliente sale de la vista y no de la suma de sus obras', () => {
  // `c.cobrado` es `cliente_economia.cobrado_neto_total` (ver homeCartera). Lo que no puede volver
  // es que la barra use el mapa de `obra_cobranza`, que hasta el 10/09/2026 daba `null` en TODAS
  // las filas de cliente porque casi ninguna cobranza llega a una obra.
  assert.match(barraDelCliente(), /cobrado=\{c\.cobrado\}/)
})

test('la fila del cliente no vuelve a leer el campo del formulario de la obra', () => {
  // `obra_panel.monto_contratado` se retiró de todas las lecturas de clientes en el hito H1.
  assert.doesNotMatch(codigo(), /monto_contratado/)
})
