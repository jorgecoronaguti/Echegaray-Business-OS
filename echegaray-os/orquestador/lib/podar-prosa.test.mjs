import test from 'node:test'
import assert from 'node:assert/strict'
import { podarProsa, podarCelda, recortarProcedencia, loQueQueda } from './podar-prosa.mjs'
import { auditarDiseno } from './diseno-unificado.mjs'
import { VACIO, limpiarCentinela } from './preservar-anotaciones.mjs'

const PARRAFO = 'Filas que dicen "materiales varios", "???" o están vacías. No se les imputa familia '
  + 'porque no hay con qué, y por eso quedan afuera del cuadro de arriba.'

test('la prosa se poda al CENTINELA, no a cadena vacía: si no, la pestaña la conserva', () => {
  // La cadena vacía significa «no es mi celda, conservá lo que hay»: podar así dejaría la prosa
  // intacta en el archivo. Ver `fusionar` en preservar-anotaciones.mjs.
  assert.equal(podarCelda(PARRAFO), VACIO)
})

test('el podador deja la grilla conforme al MISMO contrato que la mide', () => {
  const filas = [
    ['Proveedores — POSICIÓN AL DÍA', 'sobra'],
    ['En qué se va la plata · Compras · al 06/09 · y además una explicación larguísima de por qué esto es así, que dejó de declarar y empezó a explicar sin ningún freno'],
    ['esto se come el primer bloque'],
    [],
    ['1 · DEUDA COMERCIAL'],
    ['', PARRAFO],
    [],
    ['7 · LO QUE ARCA REGISTRÓ — la plomería, no es para leer'],
  ]
  const podada = podarProsa(filas, { pestana: 'Proveedores' })
  assert.deepEqual(auditarDiseno(limpiarCentinela(podada), { pestana: 'Proveedores' }), [])
  assert.equal(podada[0][0], 'Proveedores')
  assert.equal(podada[0][1], VACIO)
  assert.equal(podada[2][0], VACIO)
  assert.equal(podada[5][1], VACIO, 'el párrafo suelto se va entero, no se recorta')
  assert.equal(podada[7][0], '2 · LO QUE ARCA REGISTRÓ', 'la glosa se va y el bloque se renumera')
})

test('la entrada no se modifica: el generador sigue viendo lo suyo', () => {
  const filas = [['X'], ['y'], ['z'], ['', PARRAFO]]
  const copia = JSON.parse(JSON.stringify(filas))
  podarProsa(filas, { pestana: 'Proveedores' })
  assert.deepEqual(filas, copia)
})

test('una pestaña fuera de alcance no se toca ni un carácter', () => {
  const filas = [['CAJA — lo que hay'], [''], ['algo'], ['', PARRAFO]]
  assert.equal(podarProsa(filas, { pestana: 'CAJA' }), filas)
})

test('un título en fórmula se renumera sin perder la fórmula', () => {
  const filas = [['OBRAS'], ['de dónde sale'], [], [],
    ['=\"3 · COBRANZAS AL \"&TEXT(TODAY();\"dd/mm/yyyy\")']]
  const podada = podarProsa(filas, { pestana: 'OBRAS' })
  assert.match(podada[4][0], /^="1 · COBRANZAS AL "&TEXT/)
})

test('la procedencia se recorta por tramo, nunca a media palabra', () => {
  const t = 'Qué contesta esta pestaña con lujo de detalle y sin ahorrar una sola palabra de más · '
    + 'Compras y Cheques Emitidos · al 06/09/2026'
  const r = recortarProcedencia(t)
  assert.ok(r.length <= 120)
  assert.ok(!r.endsWith(' '))
  assert.ok(t.startsWith(r), 'recorta desde el final, no reescribe')
})

test('PUEDE dar rojo: sin podar, el contrato encuentra el párrafo', () => {
  const filas = [['Proveedores'], ['de dónde sale'], [], ['', PARRAFO]]
  assert.equal(auditarDiseno(filas, { pestana: 'Proveedores' }).length, 1)
})

test('podarCelda distingue los tres casos', () => {
  assert.equal(podarCelda('Deuda comercial'), null)
  assert.equal(podarCelda(PARRAFO), VACIO)
  assert.equal(podarCelda('4 · ARCA — la plomería, no es para leer'), '4 · ARCA')
})

test('un espejo _RAW no es del contrato: no se poda ni una celda', () => {
  const filas = [['_J_OBREROS'], [''], ['x'],
    ['', 'Apellido y nombre completo del operario tal como figura en el recibo, porque el nombre corto no alcanza para identificarlo']]
  assert.equal(podarProsa(filas, { pestana: '_J_OBREROS' }), filas)
})

test('una escritura PARCIAL no se come la fila: el encabezado sólo se toca en la pestaña entera', () => {
  const una = [['', 'ARCOR', '', 1402900]]
  assert.deepEqual(podarProsa(una, { pestana: 'Jornales por Quincena' }), una)
})

test('la glosa del título BAJA a la fila 2 cuando la 2 está vacía', () => {
  const filas = [['OBRAS — EL AÑO ENTERO, OBRA POR OBRA'], [''], [''], []]
  const podada = podarProsa(filas, { pestana: 'OBRAS' })
  assert.equal(podada[0][0], 'OBRAS')
  assert.equal(podada[1][0], 'EL AÑO ENTERO, OBRA POR OBRA')
  assert.deepEqual(auditarDiseno(limpiarCentinela(podada), { pestana: 'OBRAS' }), [])
})

test('si la fila 2 ya declara, la glosa del título no la pisa', () => {
  const filas = [['OBRAS — glosa vieja'], ['Qué contesta · Compras · al 06/09'], [''], []]
  assert.equal(podarProsa(filas, { pestana: 'OBRAS' })[1][0], 'Qué contesta · Compras · al 06/09')
})

test('el centinela no ciega la renumeración: un título con VACIO al lado sigue siendo un título', () => {
  const filas = [['Recurrentes'], ['de dónde sale'], [''], [],
    ['2 · SERVICIOS', VACIO, VACIO], [], ['3 · TOTAL', VACIO]]
  const podada = podarProsa(filas, { pestana: 'Recurrentes' })
  assert.equal(podada[4][0], '1 · SERVICIOS')
  assert.equal(podada[6][0], '2 · TOTAL')
})

// EL ATAJO AL PERÍODO EN CURSO NO ES PROSA (07/09). El dueño, el 13/08: "mantenme el boton de ir al
// dia en los dos". El contrato de minimalismo vaciaba la fila 3 ENTERA para dejar aire entre el
// encabezado y el primer bloque, y con eso borró el único control de las dos vistas del Cash Flow:
// A3 quedó vacía en el archivo vivo. Un contrato de formato no puede sacar un control que el dueño
// pidió — y la fila 3 sigue teniendo que estar limpia de todo lo demás.
test('la fila 3 se vacía salvo el atajo al período en curso', () => {
  const filas = [
    ['Cash Flow Semanal', 'algo'],
    ['Qué se cobra · del libro · al 7/09'],
    ['=HYPERLINK("https://x#gid=1&range=AH7";"Semana actual: "&"AH"&"  ·  7/09")', 'basura al lado'],
    ['1. Un bloque'],
  ]
  const out = podarProsa(filas, { pestana: 'Cash Flow Semanal' })
  assert.match(String(out[2][0]), /^=HYPERLINK\(/, 'el atajo de A3 sobrevive al podador')
  assert.equal(out[2][1], VACIO, 'lo que lo acompaña en la fila 3 sí se poda')
})

// Y el auditor no puede contarlo como desvío: si lo contara, la única forma de tener la pestaña
// conforme sería borrar el botón otra vez. El atajo llega como fórmula desde el generador y como su
// rótulo ya resuelto cuando se lee el archivo — las dos formas se reconocen.
test('el auditor no cuenta el atajo del período como fila 3 ocupada', () => {
  const base = ['Cash Flow Semanal', 'Qué se cobra · del libro · al 7/09']
  for (const a3 of ['=HYPERLINK("u";"Semana actual: AH")', 'Semana actual: AH  ·  7/09', 'Mes actual: AH  ·  sep 26']) {
    const mal = loQueQueda([[base[0]], [base[1]], [a3], ['1. Un bloque']], 'Cash Flow Semanal')
    assert.equal(mal.filter((x) => x.regla === 'sin-respiro').length, 0, `"${a3}" no es contenido: es el control`)
  }
})
