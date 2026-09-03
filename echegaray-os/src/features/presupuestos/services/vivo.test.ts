// LO QUE EL ENCABEZADO DEL ENTORNO AFIRMA, PROBADO.
//
// ═══ EL DEFECTO QUE ESTOS TESTS IMPIDEN ═══
//
// Un encabezado que dice «PRECIO FIRME $X» y «12 partidas confirmadas» es una afirmación sobre el
// presupuesto, y la forma más barata de que sea falsa es contar un `null` como cero: una partida sin
// cómputo entra como confirmada, una sin precio suma $0 y el precio firme se ve completo cuando le
// falta un paquete entero. Cada test de acá corresponde a una de esas formas de mentir.
//
// La MUTACIÓN que prueba que el control puede dar rojo está al final: se reimplementa `firmezaDe`
// con el `?? 0` que la haría mentir y se verifica que los mismos asserts se ponen rojos.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import type { Cola, Gate, PartidaDelMotor } from './cotizadorPuente.ts'
import {
  bloqueaElPrecio, bloqueosDeEnvio, certezaDe, estadoDeFila, firmezaDe, huecosDe, partirCascada,
  precioFirmeDe,
} from './vivo.ts'
import type { Escalon } from './cascada.ts'

function partida(p: Partial<PartidaDelMotor> = {}): PartidaDelMotor {
  return {
    id: 'p1', codigo: null, descripcion: 'Mampostería', rubro: null, unidad: 'm2',
    cantidad: 520, costoUnitario: 1000, subtotal: 520_000, hh: 300,
    subcontratada: false, precioSubcontrato: null, sinAnalisis: false, congelada: false,
    alcance: null,
    ...p,
  }
}

describe('los huecos de una fila se dicen por su nombre', () => {
  test('una fila completa no tiene huecos', () => {
    assert.deepEqual(huecosDe(partida()), [])
  })

  test('sin cómputo y sin análisis son DOS problemas, no uno', () => {
    const h = huecosDe(partida({ cantidad: null, sinAnalisis: true }))
    assert.deepEqual(h, ['sin cómputo', 'sin análisis'])
  })

  test('cantidad 0 NO es «sin cómputo»: es un número que alguien escribió', () => {
    assert.deepEqual(huecosDe(partida({ cantidad: 0 })), [])
  })

  test('una subcontratada sin precio no vale 0: le falta el precio', () => {
    assert.deepEqual(
      huecosDe(partida({ subcontratada: true, precioSubcontrato: null, sinAnalisis: false })),
      ['sin precio de subcontrato'],
    )
  })
})

describe('el estado de la fila', () => {
  test('la decisión de alcance gana sobre todo: una excluida no tiene huecos que resolver', () => {
    assert.equal(estadoDeFila(partida({ alcance: 'EXCLUIDO', cantidad: null, sinAnalisis: true })), 'excluido')
  })

  test('un alcance sin decidir es ambiguo, no incluido', () => {
    assert.equal(estadoDeFila(partida({ alcance: 'POR_DEFINIR' })), 'ambiguo')
  })

  test('un hueco que impide cotizar pinta la fila de falta', () => {
    assert.equal(estadoDeFila(partida({ cantidad: null, subtotal: null })), 'falta')
  })

  // ═══ EL DEFECTO MEDIDO EL 03/09/2026 CONTRA COT-2026-001 ═══
  //
  // 26 partidas importadas con `costo_unitario` cargado y sin análisis. La primera versión las
  // pintaba «con problema» a las 26 y al lado publicaba «26 partidas adentro del precio». Sin este
  // test, la regla vuelve sola en cuanto alguien agregue un hueco nuevo a `huecosDe`.
  test('sin análisis pero valorizada NO es un problema de precio', () => {
    const p = partida({ sinAnalisis: true, cantidad: 520, subtotal: 520_000 })
    assert.equal(bloqueaElPrecio(p), false)
    assert.equal(estadoDeFila(p), 'extraido')
    assert.deepEqual(huecosDe(p), ['sin análisis'], 'el hueco igual se nombra en la fila')
  })

  test('una subcontratada sin precio SÍ impide cotizar, aunque tenga cantidad', () => {
    assert.equal(bloqueaElPrecio(partida({ subcontratada: true, precioSubcontrato: null })), true)
  })

  test('la composición fijada es lo más cerca de confirmada que la fila puede decir', () => {
    assert.equal(estadoDeFila(partida({ congelada: true })), 'confirmado')
  })

  test('una fila valorizada y sin fijar es extraída, NUNCA confirmada', () => {
    assert.equal(estadoDeFila(partida()), 'extraido')
  })
})

describe('la certeza se cuenta, no se puntúa', () => {
  const lista = [
    partida({ id: 'a', congelada: true }),
    partida({ id: 'b' }),
    partida({ id: 'c', cantidad: null, subtotal: null }),
    partida({ id: 'd', alcance: 'EXCLUIDO' }),
  ]

  test('las excluidas salen del total: no son incertidumbre, son una decisión', () => {
    const c = certezaDe(lista)
    assert.equal(c.total, 3)
    assert.equal(c.excluidas, 1)
    assert.equal(c.confirmadas + c.porConfirmar + c.conProblema, c.total)
  })

  test('cada una cae en su casillero', () => {
    const c = certezaDe(lista)
    assert.equal(c.confirmadas, 1)
    assert.equal(c.porConfirmar, 1)
    assert.equal(c.conProblema, 1)
  })

  test('«sin alcance declarado» y «sin poder valorizar» se cuentan por separado', () => {
    // Los dos son «problema» y se arreglan de maneras opuestas: uno se resuelve hablando con el
    // cliente, el otro midiendo un plano o pidiendo un precio. Sumarlos borra esa diferencia.
    const c = certezaDe([
      partida({ id: 'a', alcance: 'POR_DEFINIR' }),
      partida({ id: 'b', cantidad: null, subtotal: null }),
    ])
    assert.equal(c.ambiguas, 1)
    assert.equal(c.faltantes, 1)
    assert.equal(c.conProblema, 2, 'el total sigue estando, pero no se muestra solo')
  })

  test('el criterio de «confirmada» viaja con el número: sin él no se puede discutir', () => {
    assert.match(certezaDe(lista).criterio, /autor ni fecha/)
  })

  test('la falta de genealogía se cuenta aparte, no se mezcla con lo que impide cotizar', () => {
    const c = certezaDe([
      partida({ id: 'a', sinAnalisis: true }),
      partida({ id: 'b', cantidad: null, subtotal: null, sinAnalisis: true }),
    ])
    assert.equal(c.conProblema, 1, 'sólo la que no se puede valorizar')
    assert.equal(c.porConfirmar, 1)
    assert.equal(c.sinGenealogia, 1, 'y la valorizada sin análisis igual se declara')
  })

  test('sin partidas no hay certeza inventada: todo en cero y sin problema', () => {
    const c = certezaDe([])
    assert.deepEqual([c.total, c.confirmadas, c.porConfirmar, c.conProblema, c.sinGenealogia], [0, 0, 0, 0, 0])
  })
})

describe('la firmeza: qué parte del precio ya está adentro', () => {
  test('una partida sin cantidad y sin precio NO suma como cero: queda pendiente y sin monto', () => {
    const f = firmezaDe([
      partida({ id: 'a' }),
      partida({ id: 'b', cantidad: null, subtotal: null }),
    ])
    assert.equal(f.firmes, 1)
    assert.equal(f.pendientes, 1)
    assert.equal(f.montoPendienteConocido, null, 'un 0 acá diría que lo que falta no cuesta nada')
    assert.equal(f.pendientesSinMonto, 1)
  })

  test('la plata conocida de una pendiente se suma; la que no se conoce se CUENTA', () => {
    const f = firmezaDe([
      partida({ id: 'a' }),
      partida({ id: 'b', subtotal: null, subcontratada: true, precioSubcontrato: 8_500_000 }),
      partida({ id: 'c', cantidad: null, subtotal: null }),
    ])
    assert.equal(f.pendientes, 2)
    assert.equal(f.montoPendienteConocido, 8_500_000)
    assert.equal(f.pendientesSinMonto, 1)
  })

  test('una excluida no es pendiente: se decidió que no se cotiza', () => {
    const f = firmezaDe([partida({ id: 'a' }), partida({ id: 'z', alcance: 'EXCLUIDO', subtotal: null })])
    assert.equal(f.pendientes, 0)
    assert.equal(f.firmes, 1)
  })

  test('cantidad presente y subtotal nulo tampoco es firme: el precio no la contiene', () => {
    assert.equal(firmezaDe([partida({ subtotal: null })]).firmes, 0)
  })
})

describe('el precio firme sale de la cascada y sólo si hay algo firme detrás', () => {
  const cascada = { estado: 'ok', costoDirecto: 1_000_000, ventaSinIva: 1_682_000, ventaFinal: null, iva: null, coeficienteSinIva: 1.682, porQue: null }

  test('con partidas firmes se publica el precio de la cascada, sin recalcularlo', () => {
    assert.equal(precioFirmeDe(cascada, firmezaDe([partida()])), 1_682_000)
  })

  test('sin una sola fila firme NO hay precio, aunque la vista devuelva un número', () => {
    const f = firmezaDe([partida({ cantidad: null, subtotal: null })])
    assert.equal(precioFirmeDe(cascada, f), null)
  })

  test('el $0 del coalesce no es un precio', () => {
    assert.equal(precioFirmeDe({ ...cascada, ventaSinIva: 0 }, firmezaDe([partida()])), null)
  })

  test('sin cascada no se inventa un precio', () => {
    assert.equal(precioFirmeDe(null, firmezaDe([partida()])), null)
  })
})

describe('la cascada se parte en ingeniería y decisión comercial', () => {
  const esc = (clave: Escalon['clave']): Escalon => ({ clave, rotulo: clave, pct: null, monto: 1, subtitulo: '' })
  const todos = ([
    'costo_directo', 'gastos_generales', 'costo_industrial', 'beneficio', 'financiero',
    'iibb', 'ganancias', 'subtotal', 'impuesto_cheque', 'venta_sin_iva', 'iva', 'venta_final',
  ] as Escalon['clave'][]).map(esc)

  test('ningún escalón se pierde en el reparto', () => {
    const { ingenieria, comercial, fiscal } = partirCascada(todos)
    assert.equal(ingenieria.length + comercial.length + fiscal.length, todos.length)
  })

  test('el beneficio es decisión comercial y el costo directo es ingeniería', () => {
    const { ingenieria, comercial } = partirCascada(todos)
    assert.ok(ingenieria.some((e) => e.clave === 'costo_directo'))
    assert.ok(comercial.some((e) => e.clave === 'beneficio'))
    assert.ok(!comercial.some((e) => e.clave === 'costo_directo'))
  })

  test('el IVA no es una decisión de la empresa: sale del tramo comercial', () => {
    const { comercial, fiscal } = partirCascada(todos)
    assert.ok(!comercial.some((e) => e.clave === 'iva'))
    assert.deepEqual(fiscal.map((e) => e.clave), ['iva', 'venta_final'])
  })
})

describe('los bloqueos llevan a su fila', () => {
  const issue = (type: string, entity: string, partidaId: string | null) => ({
    type, severity: 'BLOQUEANTE' as const, entity, impact: null,
    evidence: { partidaId }, recommended_action: null, detalle: 'falta', bloquea: true,
    porQueBloquea: null,
  })
  const cola = (bloqueantes: ReturnType<typeof issue>[]): Cola => ({
    issues: bloqueantes, bloqueantes, noBloqueantes: [], total: bloqueantes.length,
    nBloqueantes: bloqueantes.length, plataEnRiesgo: null, bloqueantesSinMedir: bloqueantes.length,
  })
  const gate = (blocking: Gate['blocking_issues']): Gate => ({
    ready: blocking.length === 0, blocking_issues: blocking, warnings: [], porQue: 'NO se congela',
  })

  test('dos filas con el mismo hueco y la misma descripción llevan a filas DISTINTAS', () => {
    // El defecto real de la cola vieja: `entity` cae a la descripción, y dos partidas iguales sin
    // código daban la misma clave. Enlazar las dos a la primera manda a arreglar la que ya está.
    const c = cola([
      issue('CANTIDAD_CRITICA_AUSENTE', 'Instalación sanitaria', 'row-1'),
      issue('CANTIDAD_CRITICA_AUSENTE', 'Instalación sanitaria', 'row-2'),
    ])
    const g = gate([
      { tipo: 'CANTIDAD_CRITICA_AUSENTE', entidad: 'Instalación sanitaria', detalle: null, impacto: null, accion: null },
      { tipo: 'CANTIDAD_CRITICA_AUSENTE', entidad: 'Instalación sanitaria', detalle: null, impacto: null, accion: null },
    ])
    assert.deepEqual(bloqueosDeEnvio(g, c).map((b) => b.partidaId), ['row-1', 'row-2'])
  })

  test('un bloqueo de la cotización entera no inventa una fila a la que ir', () => {
    const g = gate([
      { tipo: 'SIN_PRECIO_CALCULABLE', entidad: 'cotización', detalle: 'da $0', impacto: null, accion: null },
    ])
    const [b] = bloqueosDeEnvio(g, cola([]))
    assert.equal(b.partidaId, null)
    assert.equal(b.detalle, 'da $0')
  })

  test('sin bloqueos la lista está vacía: el botón de congelar es el que manda', () => {
    assert.deepEqual(bloqueosDeEnvio(gate([]), cola([])), [])
  })
})

describe('MUTACIÓN — el control puede dar rojo', () => {
  // Si esto pasara en verde con la versión mentirosa, los tests de arriba no estarían controlando
  // nada. Se reimplementa `firmezaDe` con el defecto clásico —`?? 0`— y se verifica que los mismos
  // asserts se rompen.
  const conCoalesce = (partidas: PartidaDelMotor[]) => {
    const dentro = partidas.filter((p) => p.alcance !== 'EXCLUIDO')
    return {
      firmes: dentro.length,
      pendientes: 0,
      montoPendienteConocido: dentro.reduce((a, p) => a + (p.subtotal ?? 0), 0),
      pendientesSinMonto: 0,
    }
  }

  test('con `?? 0` la partida sin cómputo se cuenta como firme y el hueco desaparece', () => {
    const lista = [partida({ id: 'a' }), partida({ id: 'b', cantidad: null, subtotal: null })]
    const bueno = firmezaDe(lista)
    const malo = conCoalesce(lista)

    assert.notEqual(malo.firmes, bueno.firmes)
    assert.equal(malo.pendientes, 0, 'la versión mentirosa no ve ninguna pendiente')
    assert.notEqual(malo.montoPendienteConocido, bueno.montoPendienteConocido)

    // Y el precio firme, que es lo que se publica, cambia de significado: con el defecto se publica
    // como si estuviera completo.
    const cascada = { estado: 'ok', costoDirecto: 520_000, ventaSinIva: 874_640, ventaFinal: null, iva: null, coeficienteSinIva: 1.682, porQue: null }
    assert.equal(precioFirmeDe(cascada, bueno), 874_640)
    assert.equal(bueno.pendientesSinMonto, 1, 'el bueno declara el hueco que el malo esconde')
  })
})
