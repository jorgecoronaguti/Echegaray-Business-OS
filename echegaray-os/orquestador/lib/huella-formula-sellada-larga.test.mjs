import test from 'node:test'
import assert from 'node:assert/strict'
import { editadaPorElDueno, LARGO_FORMA } from './huella-forma.mjs'

// EL DEFECTO QUE ATRAPA (auditoría del 10/09/2026).
//
// `CAJA!H15` cambió de dueño entre dos corridas del MISMO día con el MISMO contenido en la celda:
// a las 14:50 «la escribo yo» (la reescribió), a las 16:50 «la editaste vos, la respeto». Lo único
// que cambió en el medio fue que la corrida de las 14:50 SELLÓ su valor — y el sello se guarda
// cortado en LARGO_FORMA caracteres.
//
// La guarda que existía para eso preguntaba `b.length >= LARGO_FORMA` con `b` ya NORMALIZADO, y
// normalizar acorta: a `'Cheques Emitidos'!` le saca las comillas. Con el sello midiendo menos de 300
// después de normalizar, la guarda no se encendía y se comparaba la fórmula entera contra su propio
// prefijo: «editada» para siempre, sobre una celda calculada que nadie tocó.

/** La fórmula real de CAJA!H15 (leída de `sheet_tab_firma`), reducida a lo que importa: es larga y
 *  cita pestañas con comillas, que es lo que hace que normalizar la acorte. */
const H15 = '=MIN($I7-(SUMPRODUCT(((\'Cheques Emitidos\'!$M$27:$M$400="▲ sin N° de comprobante — no se puede cruzar")'
  + '+(\'Cheques Emitidos\'!$M$27:$M$400="⚠ sin N° de comprobante — no se puede cruzar"))'
  + '*(\'Cheques Emitidos\'!$I$27:$I$400>=0)*(\'Cheques Emitidos\'!$I$27:$I$400<TODAY())'
  + '*IF(ISNUMBER(\'Cheques Emitidos\'!$F$27:$F$400);\'Cheques Emitidos\'!$F$27:$F$400;0))'
  + '+SUMPRODUCT(((\'Tarjeta de Credito\'!$L$32:$L$400="▲ sin N° de comprobante — no se puede cruzar")'
  + '+(\'Tarjeta de Credito\'!$L$32:$L$400="⚠ sin N° de comprobante — no se puede cruzar"))'
  + '*(\'Tarjeta de Credito\'!$H$32:$H$400>=0)*IF(ISNUMBER(\'Tarjeta de Credito\'!$E$32:$E$400);\'Tarjeta de Credito\'!$E$32:$E$400;0)));$I8)'

/** Cómo lo sella el OS: el crudo cortado en LARGO_FORMA. Ver `huellasDeEscritura`. */
const sellar = (v) => String(v).slice(0, LARGO_FORMA)

test('la fórmula es más larga que el sello, y al normalizarla el sello queda POR DEBAJO del tope', () => {
  assert.ok(H15.length > LARGO_FORMA, 'el caso sólo existe con una fórmula más larga que el sello')
  // Ésta es la condición exacta que hacía fallar la guarda vieja: el sello mide 300 en crudo y menos
  // de 300 después de que `normalizarFormula` le saque las comillas de los nombres de pestaña.
  const sello = sellar(H15)
  assert.equal(sello.length, LARGO_FORMA)
  assert.ok(sello.replace(/'/g, '').length < LARGO_FORMA, 'normalizar acorta: por eso la guarda no se encendía')
})

test('la misma fórmula contra su propio sello NO es una edición del dueño', () => {
  assert.equal(editadaPorElDueno(H15, sellar(H15)), false,
    'con el defecto daba true y la celda quedaba congelada para siempre')
})

test('el veredicto es el MISMO en dos corridas seguidas: es lo que no era estable', () => {
  const a = editadaPorElDueno(H15, sellar(H15))
  const b = editadaPorElDueno(H15, sellar(H15))
  assert.equal(a, b)
  assert.equal(a, false)
})

test('y sigue pudiendo dar rojo: si el dueño cambia la fórmula DENTRO del tramo sellado, se ve', () => {
  const editada = H15.replace('$I7-', '$I7*2-')
  assert.equal(editadaPorElDueno(editada, sellar(H15)), true, 'una edición real adentro del sello se declara')
  const otraFuncion = H15.replace('MIN(', 'MAX(')
  assert.equal(editadaPorElDueno(otraFuncion, sellar(H15)), true)
})

test('lo que el sello NO alcanza no se afirma: una edición fuera del tramo guardado calla', () => {
  // El sello sólo prueba el principio. Cambiar el final es indistinguible de no cambiarlo, y el lado
  // seguro para equivocarse es seguir manteniendo la celda, no congelarla.
  const finalDistinto = `${H15};0)`
  assert.equal(editadaPorElDueno(finalDistinto, sellar(H15)), false)
})

test('las fórmulas cortas siguen comparándose enteras', () => {
  assert.equal(editadaPorElDueno('=SUM(A1:A9)', '=SUM(A1:A9)'), false)
  assert.equal(editadaPorElDueno('=SUM(A1:A9)+1000', '=SUM(A1:A9)'), true)
  // El locale no es una edición, y un número que cambia dentro de la misma estructura tampoco.
  assert.equal(editadaPorElDueno('=SUM(A1;A9)', '=SUM(A1,A9)'), false)
})
