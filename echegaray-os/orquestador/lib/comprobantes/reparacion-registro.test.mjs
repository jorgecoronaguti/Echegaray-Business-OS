// EL REPARADOR DEL REGISTRO — los tres casos que tiene que cumplir, contra los datos REALES del 15/08.
//
// Sin red, sin Postgres, sin Sheet: el planificador es núcleo puro y recibe las dos listas ya leídas.
// Los números son los que se midieron en vivo (ver el encabezado de `reparacion-registro.mjs`).

import test from 'node:test'
import assert from 'node:assert/strict'
import { planDeReparacion, ACCION } from './reparacion-registro.mjs'
import { huellas, conciliarRegistro } from './auditoria.mjs'
import { normalizar } from '../carga-comprobantes.mjs'

/** Una fila de Compras ya parseada, como la devuelve `registroDeFila`. */
const enCompras = (o) => ({ tipoCrudo: 'F A', numeroCrudo: o.numero, ...o })

// ── (a) NO TOCA UNA CLAVE CUYA CELDA NO COINCIDE ────────────────────────────

test('el reparador NO escribe la fila cuando la celda tiene otro comprobante', () => {
  // El registro dice que Alumetal 0036-00025942 está en la 811. En la 811 hay RSV 0011-00087469:
  // es el caso real. Sin la fila del comprobante en ningún lado, no hay nada que reparar.
  const compras = [enCompras({ fila: 811, proveedor: 'RSV', numero: '0011-00087469', total: 67797.51 })]
  const registro = [{
    clave: 'c:30567363372|0036-00025942', cuit: '30567363372', proveedor: 'Alumetal',
    numero: '0036-00025942', total: 201494007, fila: 811,
  }]
  const p = planDeReparacion(registro, compras)
  assert.equal(p.cambios.length, 0, 'propuso un cambio sobre una celda que no confirmó nada')
  assert.equal(p.salteadas.length, 1)
  assert.equal(p.salteadas[0].clave, 'c:30567363372|0036-00025942')
  assert.match(p.salteadas[0].motivo, /no (aparece|se pudo)/i)
})

test('una fila candidata con el MISMO correlativo pero OTRO proveedor y OTRO importe se saltea', () => {
  // El correlativo solo no alcanza: dos papeles distintos pueden compartir los últimos 8 dígitos.
  const compras = [enCompras({ fila: 900, proveedor: 'Ferretec', numero: '0008-00025942', total: 1234 })]
  const registro = [{
    clave: 'c:30567363372|0036-00025942', cuit: '30567363372', proveedor: 'Alumetal',
    numero: '0036-00025942', total: 201494007, fila: 811,
  }]
  const p = planDeReparacion(registro, compras)
  assert.equal(p.cambios.length, 0, 'emparejó dos comprobantes distintos por el correlativo')
  assert.equal(p.salteadas.length, 1)
})

// ── (b) LA HUELLA ENCUENTRA LA FILA CUANDO EL NOMBRE DIFIERE Y EL CUIT COINCIDE ──

test('huella por CUIT: el nombre de la celda difiere del registro y el comprobante se encuentra igual', () => {
  // Caso real de la fila 846: la celda dice «AXION SERVICENTRO MEDIA AGUA» (lo que tiene el
  // desplegable) y el registro «AXION SERVICENTRO DEL VALLE» (la razón social por CUIT). El vigía lo
  // reportaba como «figura cargado y NO está en Compras», y está perfectamente cargado.
  const cuitPorProveedor = new Map([
    [normalizar('AXION SERVICENTRO MEDIA AGUA'), '30549581710'],
  ])
  const enPestania = {
    fila: 846, proveedor: 'AXION SERVICENTRO MEDIA AGUA', numero: '00016-00029784', total: 172002.26,
  }
  const delRegistro = {
    clave: 'c:30549581710|00016-00029784', cuit: '30549581710',
    proveedor: 'AXION SERVICENTRO DEL VALLE', numero: '00016-00029784', total: 172002.26, fila: 846,
  }
  // Las dos caras comparten al menos una huella cuando el CUIT entra en juego.
  const hp = huellas(enPestania, { cuitPorProveedor })
  const hr = huellas(delRegistro, { cuitPorProveedor })
  assert.ok(hp.some((h) => hr.includes(h)), 'no comparten ninguna huella con el CUIT resuelto')
  assert.ok(hp[0].startsWith('cuit:'), 'la huella por CUIT no es la primera que se intenta')

  const c = conciliarRegistro([delRegistro], [enCompras(enPestania)], { cuitPorProveedor })
  assert.equal(c[0].estado, 'ok')
  assert.equal(c[0].filaReal, 846)
})

test('sin CUIT resuelto, el nombre distinto sigue encontrándose por número + importe exacto', () => {
  // La red de seguridad: cuando el CUIT no se puede resolver de ninguna fuente —es el caso de AXION
  // hoy, que no está ni en `Proveedores` ni en el libro fiscal— el número COMPLETO más el importe al
  // centavo siguen identificando el papel. Sin esto el falso positivo del vigía vuelve.
  const enPestania = {
    fila: 846, proveedor: 'AXION SERVICENTRO MEDIA AGUA', numero: '00016-00029784', total: 172002.26,
  }
  const delRegistro = {
    clave: 'c:30549581710|00016-00029784', cuit: '30549581710',
    proveedor: 'AXION SERVICENTRO DEL VALLE', numero: '00016-00029784', total: 172002.26, fila: 846,
  }
  const c = conciliarRegistro([delRegistro], [enCompras(enPestania)])
  assert.equal(c[0].estado, 'ok', 'el nombre distinto lo volvió a declarar desaparecido')
})

test('el nombre distinto NO empareja si el importe y el número tampoco coinciden', () => {
  const enPestania = { fila: 846, proveedor: 'OTRA COSA', numero: '00016-00029784', total: 999 }
  const delRegistro = {
    clave: 'c:30549581710|00016-00029784', cuit: '30549581710',
    proveedor: 'AXION SERVICENTRO DEL VALLE', numero: '00016-00029784', total: 172002.26, fila: 846,
  }
  assert.equal(conciliarRegistro([delRegistro], [enCompras(enPestania)])[0].estado, 'no_esta')
})

// ── (c) IDEMPOTENTE ─────────────────────────────────────────────────────────

test('correrlo dos veces no cambia nada la segunda: el plan sale vacío', () => {
  const compras = [
    enCompras({ fila: 797, proveedor: 'Alumetal', numero: '0038-00025942', total: 2014940.07 }),
    enCompras({ fila: 839, proveedor: 'Google', numero: '5640188724', total: 37.93 }),
  ]
  const registro = [
    { clave: 'c:1', cuit: '30567363372', proveedor: 'Alumetal', numero: '0036-00025942', total: 201494007, fila: 811 },
    { clave: 'p:google|0056-40188724', proveedor: 'Google', numero: '0056-40188724', total: 37.93, fila: null },
  ]
  const primera = planDeReparacion(registro, compras)
  assert.equal(primera.cambios.length, 2)

  // Se aplica el plan sobre una copia del registro, tal cual lo haría el UPDATE.
  const despues = registro.map((r) => {
    const c = primera.cambios.find((x) => x.clave === r.clave)
    return c ? { ...r, ...Object.fromEntries(c.campos.map((k) => [k.campo, k.nuevo])) } : r
  })
  const segunda = planDeReparacion(despues, compras)
  assert.equal(segunda.cambios.length, 0, 'la segunda corrida volvió a proponer cambios')
  assert.equal(segunda.salteadas.length, 0)
  assert.equal(segunda.sinCambio, 2)
})

// ── LO QUE SE REPARA, CAMPO POR CAMPO ───────────────────────────────────────

test('la fila movida, el importe centuplicado y el punto de venta se proponen juntos y con evidencia', () => {
  const compras = [enCompras({ fila: 797, proveedor: 'Alumetal', numero: '0038-00025942', total: 2014940.07 })]
  const registro = [{
    clave: 'c:30567363372|0036-00025942', cuit: '30567363372', proveedor: 'Alumetal',
    numero: '0036-00025942', total: 201494007, fila: 811,
  }]
  const p = planDeReparacion(registro, compras)
  assert.equal(p.cambios.length, 1)
  const c = p.cambios[0]
  assert.equal(c.filaReal, 797)
  assert.equal(c.accion, ACCION.REPARAR)
  const campo = (n) => c.campos.find((x) => x.campo === n)
  assert.deepEqual(campo('fila'), { campo: 'fila', viejo: 811, nuevo: 797 })
  assert.equal(campo('total').nuevo, 2014940.07)
  assert.equal(campo('numero').nuevo, '0038-00025942')
  // La clave NO se toca nunca: es lo que impide que el mismo comprobante entre dos veces.
  assert.ok(!c.campos.some((x) => x.campo === 'clave'), 'propuso tocar la clave de idempotencia')
})

test('la reserva sin fila se completa con la fila real y no propone nada más', () => {
  const compras = [enCompras({ fila: 826, proveedor: 'Combustibles Barcelo', numero: '00113-00014305', total: 100000 })]
  const registro = [{
    clave: 'c:33708332599|0011-00014305', cuit: '33708332599', proveedor: 'Combustibles Barcelo',
    numero: '0011-00014305', total: 100000, fila: null,
  }]
  const p = planDeReparacion(registro, compras)
  assert.equal(p.cambios.length, 1)
  assert.deepEqual(p.cambios[0].campos.find((x) => x.campo === 'fila'), { campo: 'fila', viejo: null, nuevo: 826 })
})

test('con --solo-fila el importe y el número quedan como están', () => {
  const compras = [enCompras({ fila: 797, proveedor: 'Alumetal', numero: '0038-00025942', total: 2014940.07 })]
  const registro = [{
    clave: 'c:1', cuit: '30567363372', proveedor: 'Alumetal', numero: '0036-00025942', total: 201494007, fila: 811,
  }]
  const p = planDeReparacion(registro, compras, { soloFila: true })
  assert.deepEqual(p.cambios[0].campos.map((x) => x.campo), ['fila'])
})

test('dos filas de Compras reclaman el mismo comprobante: se saltea, no se elige una', () => {
  const compras = [
    enCompras({ fila: 700, proveedor: 'Alumetal', numero: '0038-00025942', total: 2014940.07 }),
    enCompras({ fila: 797, proveedor: 'Alumetal', numero: '0038-00025942', total: 2014940.07 }),
  ]
  const registro = [{
    clave: 'c:1', cuit: '30567363372', proveedor: 'Alumetal', numero: '0036-00025942', total: 201494007, fila: 811,
  }]
  const p = planDeReparacion(registro, compras)
  assert.equal(p.cambios.length, 0)
  assert.match(p.salteadas[0].motivo, /más de una fila/i)
})

test('dos series del mismo proveedor con el mismo correlativo: desempata el número COMPLETO', () => {
  // Caso real: Corralón Progreso tiene `0004-00003370` en la fila 544 y `0006-00003370` en la 813.
  // El correlativo es el mismo y la huella los junta; el número entero los separa, y el entero es un
  // criterio MÁS estricto que el que los trajo, así que desempatar con él no afloja nada.
  const compras = [
    enCompras({ fila: 544, proveedor: 'Corralon Progreso', numero: '0004-00003370', total: 4433 }),
    enCompras({ fila: 813, proveedor: 'Corralon Progreso', numero: '0006-00003370', total: 35311.57 }),
  ]
  const registro = [{
    clave: 'c:30691111574|0006-00003370', cuit: '30691111574', proveedor: 'Corralon Progreso',
    numero: '0006-00003370', total: 35311.57, fila: 813,
  }]
  const p = planDeReparacion(registro, compras)
  assert.equal(p.salteadas.length, 0, 'no desempató y dejó sin reparar una entrada que sí se puede resolver')
  assert.equal(p.cambios.length, 0)
  assert.equal(p.sinCambio, 1, 'la fila 813 ya era la correcta')
})

test('si el número completo tampoco desempata, se saltea igual', () => {
  const compras = [
    enCompras({ fila: 544, proveedor: 'Corralon Progreso', numero: '0004-00003370', total: 4433 }),
    enCompras({ fila: 813, proveedor: 'Corralon Progreso', numero: '0005-00003370', total: 35311.57 }),
  ]
  const registro = [{
    clave: 'c:x', cuit: '30691111574', proveedor: 'Corralon Progreso',
    numero: '0006-00003370', total: 35311.57, fila: null,
  }]
  const p = planDeReparacion(registro, compras)
  assert.equal(p.cambios.length, 0)
  assert.match(p.salteadas[0].motivo, /más de una fila/i)
})
