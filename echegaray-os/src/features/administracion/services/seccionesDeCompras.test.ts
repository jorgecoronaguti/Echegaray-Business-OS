import test from 'node:test'
import assert from 'node:assert/strict'
import {
  SECCIONES_COMPRAS, seccionDeProveedores, seccionesDeCompras,
} from './seccionesDeCompras.ts'
import { areaActiva } from './areasAdmin.ts'
import { RUTAS_SOLO_ECONOMIA, puedeVerRuta } from '../../auth/types/areas.ts'

// LA FILA DE SECCIONES DE COMPRAS (dueño, 16/09/2026: «poné todo el módulo proveedores dentro de
// compras como sección»).
//
// Lo que estas pruebas impiden: que la lista vuelva a escribirse dos veces y diverja, que una
// sección aparezca colgada de otra (el cuarto nivel), que un conteo que nadie leyó se dibuje como 0,
// y que una sección quede fuera de la solapa que la contiene.

test('son CINCO secciones, en el orden que decidió el dueño', () => {
  // «Efectivo a rendir» entra el 22/09/2026 entre el maestro y la deuda (diseño efectivo-a-rendir, D01).
  assert.deepEqual(
    SECCIONES_COMPRAS.map((s) => s.titulo),
    ['Compras', 'Proveedores', 'A quién le debo', 'Nombres sin resolver', 'Efectivo'],
  )
})

test('LA FILA ES PLANA: ninguna sección cuelga de otra', () => {
  // ÉSTE es el defecto que la mudanza puede introducir. Si alguien vuelve a colgar «A quién le debo»
  // o «Nombres sin resolver» de una sección «Proveedores», aparece un cuarto nivel de navegación
  // (área → Compras → Proveedores → deuda) y la regla de diseño son DOS niveles simultáneos, que en
  // esta app ya se gastan en la barra del área y esta fila.
  //
  // Se comprueba con lo único que puede afirmarlo sin un navegador: las cuatro salen de la MISMA
  // llamada, todas al mismo tiempo, y no hay ninguna estructura anidada donde meter una quinta.
  const fila = seccionesDeCompras('proveedores')
  assert.equal(fila.length, 5)
  for (const v of fila) {
    assert.equal(Object.prototype.hasOwnProperty.call(v, 'vistas'), false,
      `${v.clave} trae sub-vistas propias: eso es un cuarto nivel`)
  }
  // Y exactamente UNA encendida: dos subrayados a la vez no dicen dónde está parado el que mira.
  assert.deepEqual(fila.filter((v) => v.activa).map((v) => v.clave), ['proveedores'])
})

test('cada `?vista=` de Proveedores abre su sección, y lo desconocido cae en el maestro', () => {
  assert.equal(seccionDeProveedores(undefined), 'proveedores')
  assert.equal(seccionDeProveedores(''), 'proveedores')
  assert.equal(seccionDeProveedores('maestro'), 'proveedores')
  assert.equal(seccionDeProveedores('cualquier-cosa'), 'proveedores')
  assert.equal(seccionDeProveedores('deuda'), 'deuda')
  assert.equal(seccionDeProveedores('resolver'), 'resolver')
})

test('la sección encendida es la que pide la URL de Proveedores', () => {
  for (const [vista, clave] of [[undefined, 'proveedores'], ['deuda', 'deuda'], ['resolver', 'resolver']] as const) {
    const activas = seccionesDeCompras(seccionDeProveedores(vista)).filter((v) => v.activa)
    assert.deepEqual(activas.map((v) => v.clave), [clave])
  }
})

test('un conteo que nadie leyó NO se dibuja como 0', () => {
  // «A quién le debo 0» afirma que no se le debe nada a nadie. Una pantalla que no pagó esa lectura
  // no puede hacer esa afirmación. `null` se omite; el componente no dibuja número.
  const desdeCompras = seccionesDeCompras('compras', { compras: 947 })
  assert.deepEqual(
    desdeCompras.map((v) => v.cuenta),
    [947, null, null, null, null],
  )
  // Y un 0 REAL sí se dibuja: es una lectura que devolvió cero, no una lectura que no se hizo.
  assert.equal(seccionesDeCompras('deuda', { deuda: 0 }).find((v) => v.clave === 'deuda')!.cuenta, 0)
})

test('sin `hrefs` propios, cada sección apunta a su ruta canónica', () => {
  assert.deepEqual(
    seccionesDeCompras('compras').map((v) => v.href),
    [
      '/administracion/compras',
      '/administracion/proveedores',
      '/administracion/proveedores?vista=deuda',
      '/administracion/proveedores?vista=resolver',
      // Efectivo va ÚLTIMO (dueño, 22/09/2026): en el medio se leía como un paso más de la cadena de compras.
      '/administracion/compras?vista=a-rendir',
    ],
  )
})

test('una pantalla puede estrechar SU destino para no tirar lo que está puesto, y sólo el suyo', () => {
  // Dentro de Proveedores, moverse entre secciones conserva el buscador y los recortes. Lo que la
  // pantalla NO puede cambiar es el rótulo ni el orden: eso es el contrato compartido.
  const fila = seccionesDeCompras('deuda', {}, {
    proveedores: '/administracion/proveedores?q=corralon&activo=todos',
  })
  assert.equal(fila.find((v) => v.clave === 'proveedores')!.href,
    '/administracion/proveedores?q=corralon&activo=todos')
  assert.equal(fila.find((v) => v.clave === 'compras')!.href, '/administracion/compras')
  assert.deepEqual(fila.map((v) => v.titulo),
    ['Compras', 'Proveedores', 'A quién le debo', 'Nombres sin resolver', 'Efectivo'])
})

// ═══ NINGUNA SECCIÓN SE QUEDA AFUERA DE SU SOLAPA ═══

test('las cuatro secciones encienden la solapa Compras de la barra del área', () => {
  // Sin esto, entrar a Proveedores apagaría la barra entera y la pantalla dejaría de decir dónde
  // está parado el que la mira — el mismo defecto que ya se pagó con Pendientes y Asistencia.
  for (const s of SECCIONES_COMPRAS) {
    assert.equal(areaActiva(s.href), 'compras', `${s.titulo} no enciende Compras`)
  }
  // Y la ficha de un proveedor, que es una subruta de la sección.
  assert.equal(areaActiva('/administracion/proveedores/abc-123'), 'compras')
  assert.equal(areaActiva('/administracion/proveedores/abc-123?vista=documentos'), 'compras')
})

test('la fila y la puerta usan el MISMO portero: el jefe de obra ve las cuatro', () => {
  // Una compra es COSTO, no PRECIO: el jefe de obra ve el costo de su obra, y el proveedor al que se
  // le compró. Si mañana alguien agrega una sección económica y se olvida de la lista, el jefe la ve
  // dibujada y el middleware lo rebota — un enlace que existe, se puede apretar y lleva a nada.
  for (const s of SECCIONES_COMPRAS) {
    const suya = puedeVerRuta('jefe_obra', s.href)
    if (suya) continue
    assert.ok(
      RUTAS_SOLO_ECONOMIA.some((r) => s.href === r || s.href.startsWith(`${r}/`)),
      `${s.href} no se le dibuja al jefe pero no está declarada en RUTAS_SOLO_ECONOMIA`,
    )
  }
  assert.deepEqual(
    SECCIONES_COMPRAS.filter((s) => puedeVerRuta('jefe_obra', s.href)).map((s) => s.clave),
    ['compras', 'proveedores', 'deuda', 'resolver', 'efectivo'],
  )
})
