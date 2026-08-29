// EL MEDIDOR DE VENTANAS — que no pueda decir que sí cuando la fórmula mezcla, y que VEA TODO EL CUADRO.
//
// ═══ EL DEFECTO QUE ESTE ARCHIVO MANTIENE MUERTO (29/08/2026) ═══
//
// La primera versión del medidor enumeraba CUATRO filas a mano y el cuadro tiene 81. Las 77 restantes
// —36 aperturas por rubro, 28 por cliente, los netos y los saldos— eran invisibles: una glosa de
// `YA PASÓ EN EL AÑO` que citara la fila 49 (`resultado`, la mezcla misma, el $(23.136.331) que
// originó este trabajo) pasaba los 93 tests en verde. Y el test de completitud comparaba las cuatro
// claves declaradas contra una copia tipeada de esas mismas cuatro: nunca le preguntaba al cuadro.
//
// Por eso acá NO se tipea ninguna lista de filas. Todo sale de `meta.fila` de las grillas reales.

import test from 'node:test'
import assert from 'node:assert/strict'
import { ventanasDe, ventanaDeConcepto, sinClasificar, YA_PASO, PROYECCION } from './cash-flow-ventanas.mjs'
import { grillaMeses } from './cash-flow-meses.mjs'
import { grillaSemanal } from './cash-flow-semanas.mjs'
import { MEDIDAS } from './cash-flow-medidas.mjs'

/** Los mapas de filas REALES de las dos vistas. Ninguna clave escrita a mano. */
const FILAS = {
  mes: grillaMeses({ anio: 2026, refs: {} }).meta.fila,
  semana: grillaSemanal({ hoy: new Date(Date.UTC(2026, 7, 5)), anio: 2026, refs: {} }).meta.fila,
}

test('TODA fila del cuadro está clasificada — se le pregunta a la grilla, no a una lista', () => {
  for (const [tipo, fila] of Object.entries(FILAS)) {
    assert.deepEqual(sinClasificar(fila), [],
      `${tipo}: hay filas que el medidor no sabe clasificar, así que el titular podría citarlas sin que nada grite`)
    // Y son MUCHAS más que las cuatro medidas: si mañana alguien vuelve a mapear a mano, esto lo delata.
    assert.ok(Object.keys(fila).length > 40, `${tipo}: el cuadro tiene ${Object.keys(fila).length} filas`)
  }
})

test('cada familia de filas cae en la ventana que le corresponde, derivada de su clave', () => {
  for (const [tipo, fila] of Object.entries(FILAS)) {
    const de = (clave) => ventanaDeConcepto(clave).ventanas
    for (const clave of Object.keys(fila)) {
      const partes = clave.split('::')
      if (partes.includes('ingresoReal') || partes.includes('egresoReal')) {
        assert.deepEqual(de(clave), [YA_PASO], `${tipo} · ${clave}`)
      } else if (partes.includes('ingresoProyectado') || partes.includes('egresoProyectado')) {
        assert.deepEqual(de(clave), [PROYECCION], `${tipo} · ${clave}`)
      }
    }
    // Y no es un puñado: las aperturas por rubro y por cliente son la mayoría del cuadro.
    const aperturas = Object.keys(fila).filter((c) => c.includes('::') && de(c).length === 1)
    assert.ok(aperturas.length >= 30, `${tipo}: sólo ${aperturas.length} aperturas clasificadas`)
  }
})

test('LO QUE MEZCLA MEZCLA: el neto del período y la cabecera de un cliente pertenecen a las DOS', () => {
  const F = FILAS.mes
  // `resultado` es entra − sale con las cuatro medidas adentro: es LA mezcla, y citarla en cualquier
  // tarjeta tiene que dar rojo. Era la fila que alimentaba el titular que el dueño rechazó.
  assert.deepEqual(ventanaDeConcepto('resultado').ventanas, [YA_PASO, PROYECCION])
  assert.deepEqual(ventanasDe(`=N($N$${F.resultado})`, F), [YA_PASO, PROYECCION])
  // Las dos variaciones se calculan SOBRE el neto: heredan su naturaleza.
  for (const c of ['variacionPresupuesto', 'variacionMesAnterior']) {
    assert.deepEqual(ventanaDeConcepto(c).ventanas, [YA_PASO, PROYECCION], c)
  }
  // La cabecera de un cliente es la misma aritmética acotada a un cliente.
  const cabecera = Object.keys(F).find((c) => c.startsWith('cliente::') && c.split('::').length === 2)
  assert.ok(cabecera, 'el cuadro dejó de abrir por cliente')
  assert.deepEqual(ventanaDeConcepto(cabecera).ventanas, [YA_PASO, PROYECCION], cabecera)
})

test('un STOCK no pertenece a ninguna ventana, y por eso el cierre no da rojo contra sí mismo', () => {
  const F = FILAS.mes
  // Un saldo es la plata que hay en un instante, no un flujo. La tarjeta del cierre publica
  // `saldoFinal` de diciembre: una sola foto, con su fecha en el rótulo.
  assert.deepEqual(ventanasDe(`=N($M$${F.saldoFinal})`, F), [])
  assert.deepEqual(ventanasDe(`=N($B$${F.saldoInicial})`, F), [])
  assert.deepEqual(ventanasDe('=N(CAJA_TOTAL_DISPONIBLE)', F), [])
  assert.deepEqual(ventanasDe('', F), [])
})

test('ve las dos ventanas cuando la fórmula las mezcla, y una sola cuando no', () => {
  const F = FILAS.mes
  const T = (clave) => `$N$${F[clave]}`
  assert.deepEqual(ventanasDe(`=N(${T('ingresoReal')})-N(${T('egresoReal')})`, F), [YA_PASO])
  assert.deepEqual(ventanasDe(`=N(${T('ingresoProyectado')})-N(${T('egresoProyectado')})`, F), [PROYECCION])
  // LA MEZCLA — el defecto que el dueño rechazó: `ENTRA EN EL AÑO` sumaba lo cobrado con lo por cobrar.
  assert.deepEqual(ventanasDe(`=N(${T('ingresoReal')})+N(${T('ingresoProyectado')})`, F), [YA_PASO, PROYECCION])
  // Y también cuando la mezcla entra por una APERTURA, que es como se cuela sin que se note.
  const aperturaProy = Object.keys(F).find((c) => c.startsWith('ingresoProyectado::'))
  assert.deepEqual(ventanasDe(`=N(${T('ingresoReal')})+N($N$${F[aperturaProy]})`, F), [YA_PASO, PROYECCION], aperturaProy)
})

test('una referencia a OTRA pestaña no se lee como una fila propia', () => {
  const F = FILAS.semana
  // El titular del Semanal filtra `_MOVIMIENTOS` por columnas: `$A$2`, `$H$2`, `$J$2`. Sin descartar
  // las referencias con `!`, cualquier fila del cuadro que coincidiera con esos números daría una
  // ventana que la fórmula no cita, y un control que acusa de más se aprende a ignorar.
  assert.deepEqual(ventanasDe(`=FILTER(_MOVIMIENTOS!$A$${F.resultado}:$A)`, F), [])
  assert.deepEqual(ventanasDe(`=N('Cash Flow Mensual'!$N$${F.ingresoReal})`, F), [])
  // Pero la referencia LOCAL de la misma fórmula sí se ve.
  assert.deepEqual(ventanasDe(`=FILTER(_MOVIMIENTOS!$A$2:$A)+N($N$${F.ingresoReal})`, F), [YA_PASO])
})

test('la fila 9 no empareja con la 90 ni con la 19', () => {
  const solaparia = { ingresoReal: 9, egresoProyectado: 90 }
  assert.deepEqual(ventanasDe('=N($N$90)', solaparia), [PROYECCION])
  assert.deepEqual(ventanasDe('=N($N$9)', solaparia), [YA_PASO])
  assert.deepEqual(ventanasDe('=N($N$19)', solaparia), [])
})

test('las cuatro medidas declaradas son EXACTAMENTE las del cuadro', () => {
  // Es lo único que este módulo tipea. Si el cuadro gana una quinta medida y no entra, las filas que
  // cuelguen de ella quedan sin clasificar — y el test de completitud de arriba se pone rojo. Esto lo
  // dice antes y con el nombre.
  const declaradas = ['egresoProyectado', 'egresoReal', 'ingresoProyectado', 'ingresoReal']
  assert.deepEqual(MEDIDAS.map((m) => m.clave).sort(), declaradas)
  for (const clave of declaradas) assert.equal(ventanaDeConcepto(clave).conocido, true, clave)
})
