import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { CUENTAS } from './caja-disponibilidades.mjs'

// CADA CUENTA DE CAJA SE FECHA CON SU PROPIA FUENTE.
//
// El dueño, tres veces en el día: "aún noto desactualizadas las fechas de todo lo que te he pasado en
// caja" y "cambiá las fechas de todo CAJA según corresponde según extracto bancario auditado". No
// estaban viejas: estaban PRESTADAS. Tres cuentas se fechaban con la fuente de otra —el arqueo decía
// TODAY() y la cartera decía la fecha de corte del extracto— y una fecha prestada no envejece nunca,
// así que la columna de antigüedad de al lado no podía avisar de nada.

const buscar = (re) => CUENTAS.find((c) => re.test(c.nombre))

test('las dos cajas de efectivo se fechan con el ARQUEO, no con hoy', () => {
  // Fechar un conteo de caja con TODAY() afirma que se contó hoy —sea cierto o no— y deja la alarma
  // de antigüedad clavada en "0 días": un arqueo de hace una semana se veía igual de fresco que el
  // de esta mañana. La fecha del arqueo la escribe el dueño al lado del importe que cuenta.
  assert.equal(buscar(/^caja en pesos/i).arqueo, 'CAJA_ARQUEO_ARS_FECHA')
  assert.equal(buscar(/^caja en d[oó]lares/i).arqueo, 'CAJA_ARQUEO_USD_FECHA')
})

test('ninguna cuenta del BANCO se fecha con el arqueo: su fecha es la del extracto', () => {
  for (const c of CUENTAS.filter((x) => x.banco && x.banco !== 'cartera')) {
    assert.equal(c.arqueo, undefined, `${c.nombre} no puede fecharse con un arqueo: su saldo sale del extracto`)
  }
})

test('la cartera de valores NO se fecha con el corte del extracto', () => {
  // Son cheques que todavía NO entraron al banco. El extracto no sabe nada de ellos, así que su
  // fecha de corte ahí es prestada: decía 31/07 porque era el último movimiento del banco, no
  // porque la cartera fuera de ese día.
  const cartera = CUENTAS.find((c) => c.banco === 'cartera')
  assert.ok(cartera, 'la cuenta de cartera tiene que existir')
  assert.equal(cartera.arqueo, undefined)
  assert.ok(cartera.formula || cartera.banco === 'cartera', 'la calcula el OS: su fecha es hoy')
})

test('toda cuenta que se carga a mano declara de dónde sale su fecha', () => {
  // El agujero por el que entró el defecto: una cuenta sin `arqueo`, sin `banco` y sin `formula`
  // caía en `previo(...)` —lo que hubiera en la celda— y ahí sobrevivía cualquier fecha vieja o
  // copiada de otra fila, sin que nada lo dijera.
  for (const c of CUENTAS) {
    const tieneFuente = Boolean(c.arqueo || c.banco || c.formula)
    assert.ok(tieneFuente, `"${c.nombre}" no declara de dónde sale su fecha: va a heredar la que haya`)
  }
})

test('el Fondo fijo sigue fuera del cuadro', () => {
  // El dueño: "quitá la fila de fondo fijo, no la voy a usar, no la consideres más".
  assert.equal(CUENTAS.some((c) => /fondo fijo/i.test(c.nombre)), false)
})

test('el generador NO pisa la fecha del arqueo con TODAY() más abajo', () => {
  // EL DEFECTO QUE ESTO CIERRA. La fila de "Caja en pesos" se arma bien arriba —con la fecha del
  // arqueo— y doscientas líneas más abajo dos asignaciones sueltas la volvían a poner en =TODAY().
  // El código decía una cosa y el Sheet mostraba otra, y sin mirar la celda viva no se notaba.
  const src = readFileSync(new URL('../scripts/caja-pestana.mjs', import.meta.url), 'utf8')
  const pisadas = [...src.matchAll(/filas\[(d0|dUsd) - 1\]\[5\] = ([^\n]+)/g)]
  assert.equal(pisadas.length, 2, 'siguen siendo las dos filas de caja física')
  for (const [, cual, valor] of pisadas) {
    assert.ok(!/TODAY\(\)/.test(valor), `la fecha de ${cual} no puede ser TODAY(): ${valor.trim()}`)
    assert.match(valor, /ARQ_(ARS|USD)_FECHA/, `la fecha de ${cual} sale del arqueo`)
  }
})
