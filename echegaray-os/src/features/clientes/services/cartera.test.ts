import test from 'node:test'
import assert from 'node:assert/strict'
import { avisoDeDatos, faltaUnDatoQueFrena, recortarCartera, separarArchivados, totalesCartera } from './cartera.ts'
import { senalesDeClientes } from './senalesClientes.ts'

// ═══ QUÉ DEFECTOS ATRAPA ═══
//
// 1. Que «Datos faltantes» vuelva a ser sólo el CUIT. Si eso pasa, las dos señales que abren la
//    pantalla aterrizan en un recorte que NO las contiene: el que toca «Cargar» sobre «1 obra sin
//    contrato» cae en una lista donde esa obra no está, y da por hecho que ya se resolvió.
// 2. Que una lectura fallida se dibuje como «no hay nada que cargar». Un `null` que se filtra igual
//    que un cero convierte una base caída en la afirmación «la cartera está completa».
// 3. Que la etiqueta ámbar de la fila crezca a tres avisos: el recorte mira tres datos, la etiqueta
//    sigue mirando uno. Son dos decisiones distintas y comparten archivo.

const cliente = (x: Partial<Parameters<typeof faltaUnDatoQueFrena>[0]> = {}) => ({
  cuit: '30-71042318-4', telefono: '+54 351 512-3344', n_obras_activas: 1, contratado: 1_000_000, ...x,
})

test('«datos faltantes» mira las TRES cosas que frenan el cobro, no sólo el CUIT', () => {
  assert.equal(faltaUnDatoQueFrena(cliente()), false)
  assert.equal(faltaUnDatoQueFrena(cliente({ cuit: null })), true, 'sin CUIT no se factura')
  assert.equal(faltaUnDatoQueFrena(cliente({ telefono: null })), true, 'sin teléfono no se reclama')
  assert.equal(faltaUnDatoQueFrena(cliente({ contratado: null })), true, 'sin contrato no se certifica')
  // Un campo con espacios está tan vacío como uno en `null`, y así entró más de un teléfono.
  assert.equal(faltaUnDatoQueFrena(cliente({ cuit: '   ' })), true)
})

test('el recorte de la pantalla y la etiqueta de la fila NO son el mismo conjunto', () => {
  const sinTelefono = cliente({ telefono: null })
  assert.equal(recortarCartera([sinTelefono], 'sin-datos').length, 1, 'el recorte lo tiene que traer')
  assert.equal(avisoDeDatos(sinTelefono), null, 'la fila no lleva etiqueta: la etiqueta es sólo el CUIT')
})

test('el verbo de cada señal aterriza en el recorte que produjo su número', () => {
  const lista = [cliente(), cliente({ cuit: null }), cliente({ contratado: null })]
  const senales = senalesDeClientes(lista, 2)
  assert.deepEqual(senales.map((s) => s.href), ['/clientes?vista=sin-datos', '/clientes?vista=sin-datos'])
  // Los dos clientes incompletos son exactamente los que el recorte devuelve.
  assert.equal(senales[0].numero, recortarCartera(lista, 'sin-datos').length)
})

test('cero no se dibuja y sin leer SÍ se dibuja: no son lo mismo', () => {
  assert.deepEqual(senalesDeClientes([cliente()], 0), [], 'una cartera completa no reclama nada')

  const sinLeer = senalesDeClientes(null, null)
  assert.equal(sinLeer.length, 2, 'una lectura fallida no puede callarse')
  assert.deepEqual(sinLeer.map((s) => s.numero), [null, null], 'y no puede inventarse un 0')
  for (const s of sinLeer) assert.match(s.bloquea, /No pude leer/)
})

test('las dos señales cuentan unidades distintas y por eso no se suman', () => {
  const s = senalesDeClientes([cliente({ cuit: null })], 3)
  assert.equal(s[0].numero, 1)
  assert.match(s[0].texto, /cliente/)
  assert.equal(s[1].numero, 3)
  assert.match(s[1].texto, /obras/)
})

test('archivar saca de la lista, y el total de contratado nunca es 0 por ausencia', () => {
  const { activos, archivados } = separarArchivados([
    { activo: true, ...cliente() }, { activo: false, ...cliente() },
  ])
  assert.equal(activos.length, 1)
  assert.equal(archivados.length, 1)
  assert.equal(totalesCartera([cliente({ contratado: null })]).contratado, null)
})
