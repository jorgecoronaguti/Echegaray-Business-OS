import test from 'node:test'
import assert from 'node:assert/strict'
import {
  agruparPapeles, clasePapel, corto, esRetencion, VARIAS_OBRAS, type PapelCrudo,
} from './papelesCliente.ts'
import { PAPELES_MESSINA } from './papelesMessina.fixture.ts'

// SE PRUEBA CONTRA LOS 44 PAPELES REALES DE MESSINA, no contra objetos inventados. La trampa de
// este repo ya está pagada: un control construido con un item fabricado a mano mide una forma que
// el circuito no produce. Acá la forma es la de la base — números con ceros a la izquierda, la
// misma OC en dos mails, el certificado de retención que lleva el número de su orden de pago.

const uno = (p: Partial<PapelCrudo>): PapelCrudo => ({
  id: p.id ?? 'x', tipo: p.tipo ?? 'orden_compra', numero: p.numero ?? null, fecha: p.fecha ?? null,
  importe: p.importe ?? null, moneda: p.moneda ?? 'ARS', obra_id: p.obra_id ?? null,
  cita: p.cita ?? null, nombre_archivo: p.nombre_archivo ?? null,
})

test('un certificado de retención NUNCA se cuenta como orden de pago', () => {
  // EL DEFECTO QUE ATRAPA: los 12 comprobantes de retención de Messina llevan el NÚMERO DE SU OP
  // (`O_P_0000000005156_G00002353.pdf`). Contarlos como órdenes de pago duplica lo cobrado —de 12
  // OP por $138,1M pasaría a 24 por el mismo dinero contado dos veces—. La marca es el ARCHIVO, no
  // el `tipo` de la fila: si mañana el extractor los guarda como `orden_pago`, esto los sigue
  // sacando. Revertir `esRetencion` pone en rojo estas cuatro afirmaciones.
  assert.equal(esRetencion('O_P_0000000005156_G00002353.pdf'), true)
  assert.equal(esRetencion('0000000005156.pdf'), false)
  // EL MISMO PATRÓN QUE `orquestador/lib/ordenes-cliente.mjs` usa para escribir `tipo='retencion'`
  // al bajar el adjunto: cinco dígitos o más después de la G, con o sin extensión. Si una de las
  // dos reglas cambia sola, este caso se pone rojo.
  assert.equal(esRetencion('O_P_0000000004865_G00002208'), true)
  assert.equal(esRetencion('algo_G123.pdf'), false)
  // Y cuando la base ya lo dice, se le cree: la migración del 10/09 agregó el tipo `retencion`.
  assert.equal(clasePapel(uno({ tipo: 'retencion', nombre_archivo: 'certificado.pdf' })), 'retencion')
  assert.equal(clasePapel(uno({ tipo: 'otro', nombre_archivo: 'O_P_0000000000730_G00000347.pdf' })), 'retencion')
  assert.equal(
    clasePapel(uno({ tipo: 'orden_pago', numero: '0000000005156', nombre_archivo: 'O_P_0000000005156_G00002353.pdf' })),
    'retencion',
  )

  const p = agruparPapeles(PAPELES_MESSINA)
  assert.equal(p.op.length, 12)
  assert.equal(p.retenciones.length, 12)
  // El certificado 5156 cuelga de SU orden de pago, no es una orden más.
  const op5156 = p.op.find((o) => o.numeroCorto === '5156')
  assert.equal(op5156?.retenciones.length, 1)
  assert.equal(op5156?.retenciones[0].numeroCorto, '5156')
})

test('la factura nuestra no es una orden del cliente, y cita la OC que factura', () => {
  const p = agruparPapeles(PAPELES_MESSINA)
  assert.equal(p.facturas.length, 8)
  assert.equal(p.oc.length, 12)
  // A-1-225 cita la OC 2162: la OC sabe qué factura la respalda.
  const oc2162 = p.oc.find((o) => o.numeroCorto === '2162')
  assert.deepEqual(oc2162?.facturas.map((f) => f.numero), ['A-1-225'])
  // Y ninguna factura entra en el total de lo que el cliente encargó.
  assert.equal(p.totalOC.n, 12)
})

test('los totales de OC y OP de Messina, contados una sola vez', () => {
  const p = agruparPapeles(PAPELES_MESSINA)
  // MEDIDO sobre las 44 filas exportadas: las 12 OC suman $210.892.529,59 y las 12 OP
  // $138.327.430,07. Si una copia repetida volviera a sumar, estos números cambian.
  // Se redondea a centavos porque una suma de doce flotantes arrastra el error del binario, no
  // porque el número sea dudoso.
  const cent = (v: number | null) => (v === null ? null : Math.round(v * 100) / 100)
  assert.equal(cent(p.totalOC.importe), 210892529.59)
  assert.equal(cent(p.totalOP.importe), 138327430.07)
  assert.equal(p.totalOC.parcial, false)
  assert.equal(p.totalOP.parcial, false)
})

test('por obra: la OC de la obra CERRADA sigue estando', () => {
  // ME - BASES TANQUE SO2 está cerrada y tiene OC 1864, OP 4865 y dos facturas. La ficha la
  // escondía detrás de `?archivadas=1` y por eso el dueño no veía sus papeles.
  const p = agruparPapeles(PAPELES_MESSINA)
  const so2 = p.porObra.get('messina-bases-tanque-so2')
  assert.deepEqual(so2?.oc.map((o) => o.numeroCorto), ['1864'])
  assert.deepEqual(so2?.op.map((o) => o.numeroCorto), ['4865'])
  assert.equal(so2?.totalOC.importe, 10133750)
  assert.equal(so2?.totalOP.importe, 17115304.8)

  // PISOS 120 M² Y RAMPA tiene DOS órdenes de compra: el total de la obra son las dos.
  const pisos = p.porObra.get('messina-pisos-120-rampa')
  assert.equal(pisos?.totalOC.n, 2)
  assert.equal(pisos?.totalOC.importe, 8601752.71 + 2848649.02)
})

test('lo que no se pudo atribuir a una obra no se pierde: cuelga del cliente', () => {
  const p = agruparPapeles(PAPELES_MESSINA)
  // Medido: 2 OC y 5 OP de Messina llegaron sin obra. Se muestran igual — son trabajo pendiente de
  // atribución, no un hueco que se pueda callar.
  assert.deepEqual(p.sinObra.oc.map((o) => o.numeroCorto), ['1122', '865'])
  assert.deepEqual(p.sinObra.op.map((o) => o.numeroCorto), ['5146', '2983', '2336', '2151', '1476'])
  // Y el total del cliente las incluye: si sumara sólo las atribuidas, atribuir peor subiría el
  // total y atribuir mejor lo bajaría.
  assert.equal(p.totalOC.n, p.oc.length)
})

test('la misma OC llegada en dos mails es UNA orden y UN importe', () => {
  const p = agruparPapeles([
    uno({ id: 'a', numero: '00002-00002162', fecha: '2026-08-05', importe: 6060479.39, obra_id: 'limpieza' }),
    uno({ id: 'b', numero: '02-00002162', fecha: '2026-08-21', importe: 6060479.39, obra_id: null }),
  ])
  assert.equal(p.oc.length, 1)
  assert.equal(p.totalOC.importe, 6060479.39)
  // La fecha es la de la ORDEN, no la de la copia que llegó después…
  assert.equal(p.oc[0].fecha, '2026-08-05')
  assert.deepEqual(p.oc[0].ids, ['a', 'b'])
  // …y la obra la aporta cualquiera de las dos copias: perderla porque la segunda vino vacía sería
  // esconder el papel de su obra.
  assert.equal(p.oc[0].obraId, 'limpieza')
  assert.equal(corto('00002-00002162'), '2162')
})

test('una OP de varias obras va a nivel cliente Y LO DICE', () => {
  // HOY NO PASA y por eso el caso se construye a mano: las 12 OP de Messina tienen `cita` en null
  // (medido el 10/09/2026 sobre la tabla entera), así que el vínculo OP→factura está vacío. El día
  // que el extractor lea el detalle del PDF, esta regla ya está decidida y probada: una orden que
  // paga facturas de dos obras NO se imputa a ninguna de las dos.
  const p = agruparPapeles([
    uno({ id: 'f1', tipo: 'factura', numero: 'A-1-214', obra_id: 'obra-uno', cita: '2-1864' }),
    uno({ id: 'f2', tipo: 'factura', numero: 'A-1-215', obra_id: 'obra-dos', cita: '2-1923' }),
    uno({ id: 'op', tipo: 'orden_pago', numero: '0000000004865', importe: 17115304.8, cita: '1-214' }),
  ])
  const op = p.op[0]
  assert.equal(op.facturas.length, 1)
  assert.equal(op.obraId, 'obra-uno')

  const varias = agruparPapeles([
    uno({ id: 'f1', tipo: 'factura', numero: 'A-1-214', obra_id: 'obra-uno', cita: '2-1864' }),
    uno({ id: 'f2', tipo: 'factura', numero: 'A-1-215', obra_id: 'obra-dos', cita: '2-1864' }),
    uno({ id: 'op', tipo: 'orden_pago', numero: '4865', cita: '2-1864' }),
  ])
  assert.equal(varias.op[0].obraId, VARIAS_OBRAS)
  // Y no se imputa a ninguna de las dos obras: aparece a nivel cliente.
  assert.equal(varias.porObra.get('obra-uno')?.op.length, undefined)
  assert.equal(varias.sinObra.op.length, 1)
  // Y en este fajo no hay ninguna orden de compra: las dos facturas citan una OC que nunca llegó
  // por mail. Que la cita apunte a un papel ausente no puede fabricar la orden.
  assert.deepEqual(varias.oc, [])
})

test('el vínculo OP → OC existe cuando hay cita, y NO se inventa cuando no la hay', () => {
  const conCita = agruparPapeles([
    uno({ id: 'oc', numero: '00002-00001864', fecha: '2026-05-12', importe: 10133750 }),
    uno({ id: 'f', tipo: 'factura', numero: 'A-1-214', cita: '2-1864', obra_id: 'so2' }),
    uno({ id: 'op', tipo: 'orden_pago', numero: '0000000004865', cita: '1-214' }),
  ])
  assert.deepEqual(conCita.oc[0].pagadaPor, ['4865'])

  // LOS DATOS REALES: ninguna OP cita nada, así que ninguna OC puede decir quién la pagó. La
  // pantalla escribe «no consta» — emparejar por importe acertaría en 2 de 12 y sería una
  // inferencia dibujada como hecho.
  const real = agruparPapeles(PAPELES_MESSINA)
  assert.deepEqual(real.oc.flatMap((o) => o.pagadaPor), [])
  assert.deepEqual(real.op.flatMap((o) => o.facturas), [])
})

test('sin papeles no se rompe ni se inventa un cero', () => {
  const p = agruparPapeles([])
  assert.deepEqual(p.totalOC, { n: 0, importe: null, parcial: false })
  assert.equal(p.porObra.size, 0)
})
