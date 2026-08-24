import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  areasDeAdministracion, atencionNoLeida, chipsDeAtencion, cuenta, type ConteosHome,
} from './homeAdministracion.ts'

// Lo que la pantalla 00 no puede hacer nunca: inventar un cero, encender un aviso que no mide nada,
// ofrecerle al jefe de obra una puerta que el middleware le va a cerrar, y —sobre todo— dibujar una
// barra de atención vacía cuando lo que pasó es que no pudo leer.

const NADA: ConteosHome = {
  clientes: null, presupuestos: null, usuarios: null, personas: null, proveedores: null,
  compras: null, pendientes: null, correcciones: null, tareasTipo: null, documentos: null,
  proveedoresSinCuit: null, nombresSinResolver: null, comprasSinImputar: null,
  comprasSinResolver: null, comprasDuplicadas: null,
}

const CERO: ConteosHome = {
  clientes: 0, presupuestos: 0, usuarios: 0, personas: 0, proveedores: 0, compras: 0,
  pendientes: 0, correcciones: 0, tareasTipo: 0, documentos: 0, proveedoresSinCuit: 0,
  nombresSinResolver: 0, comprasSinImputar: 0, comprasSinResolver: 0, comprasDuplicadas: 0,
}

const con = (p: Partial<ConteosHome>): ConteosHome => ({ ...CERO, ...p })
const area = (c: ConteosHome, clave: string) =>
  areasDeAdministracion(c, 'direccion').find((a) => a.clave === clave)!

test('un permiso negado NO se cuenta como cero', async () => {
  // La línea donde un `?? 0` de más convierte un error de red en la afirmación «no hay ninguno».
  assert.equal(await cuenta(Promise.resolve({ count: null, error: { message: 'permission denied' } })), null)
  assert.equal(await cuenta(Promise.resolve({ count: 7, error: { message: 'permission denied' } })), null)
  // Y un cero LEÍDO sí es cero: la empresa puede no tener ningún proveedor sin CUIT.
  assert.equal(await cuenta(Promise.resolve({ count: 0, error: null })), 0)
  // PostgREST puede contestar sin error y sin número: eso tampoco es cero.
  assert.equal(await cuenta(Promise.resolve({ count: null, error: null })), null)
})

test('una lectura que falló NO se dibuja como cero', () => {
  for (const a of areasDeAdministracion(NADA, 'direccion')) {
    assert.equal(a.cuenta, null, `${a.clave} fabricó un contador sin haber podido leer`)
    assert.equal(a.aviso, null, `${a.clave} encendió el ⚠ sin haber podido leer`)
  }
})

test('un cero real se dice, y no enciende ningún aviso', () => {
  // Cero clientes es un hecho —la empresa arranca sin ninguno—; cero proveedores sin CUIT es que no
  // hay nada que resolver. Los dos se distinguen de «no pude contar», que es `null`.
  assert.equal(area(CERO, 'clientes').cuenta, 0)
  assert.equal(area(CERO, 'proveedores').aviso, null, '«0 sin CUIT» no es una señal, es ruido')
  assert.deepEqual(chipsDeAtencion(CERO, 'direccion'), [])
})

test('el ⚠ de Proveedores junta sus dos pendientes y los nombra', () => {
  const a = area(con({ proveedoresSinCuit: 14, nombresSinResolver: 1 }), 'proveedores')
  assert.equal(a.aviso, '14 sin CUIT · 1 nombre sin resolver')
})

test('PERSONAS no enciende el ⚠ por «sin obra asignada»: es un estado normal entre dos obras', () => {
  // El mockup lo pinta en ámbar. La regla del negocio (19/08) gana: un aviso siempre encendido deja
  // de leerse a la semana. Si alguien lo agrega, este test se pone rojo y hay que discutirlo.
  assert.equal(area(con({ personas: 18 }), 'personas').aviso, null)
})

test('cada chip lleva al FILTRO que lo contó, no a la pantalla en general', () => {
  const chips = chipsDeAtencion(con({
    comprasSinImputar: 3, comprasSinResolver: 2, comprasDuplicadas: 1,
  }), 'direccion')
  const href = (clave: string) => chips.find((c) => c.clave === clave)!.href
  // El `?f=` es el mismo valor que `aplicarFiltro` usa para contar: si se separaran, el chip diría
  // «3 sin obra» y la lista de allá mostraría otra cosa.
  assert.equal(href('compras-sin-imputar'), '/administracion/compras?f=sin-imputar')
  assert.equal(href('compras-sin-resolver'), '/administracion/compras?f=sin-resolver')
  assert.equal(href('duplicados'), '/administracion/compras?f=duplicados')
})

test('el chip escribe singular y plural, y el rojo es sólo del duplicado', () => {
  const uno = chipsDeAtencion(con({ proveedoresSinCuit: 1, comprasDuplicadas: 1 }), 'direccion')
  assert.equal(uno.find((c) => c.clave === 'sin-cuit')!.texto, 'proveedor sin CUIT')
  assert.equal(uno.find((c) => c.clave === 'sin-cuit')!.tono, 'warn')
  // Un comprobante duplicado que nadie mira se paga dos veces: es lo único que ya está mal.
  assert.equal(uno.find((c) => c.clave === 'duplicados')!.tono, 'neg')

  const varios = chipsDeAtencion(con({ proveedoresSinCuit: 14 }), 'direccion')
  assert.equal(varios[0].texto, 'proveedores sin CUIT')
})

test('la barra de atención vacía POR ERROR se distingue de la barra vacía porque no hay nada', () => {
  // Éste es el defecto caro: sin este flag, una base caída dibuja un área sin pendientes. «Un control
  // que no pudo mirar no dice que no está».
  assert.equal(atencionNoLeida(NADA), true)
  assert.equal(atencionNoLeida(CERO), false)
  assert.equal(chipsDeAtencion(NADA, 'direccion').length, 0)
})

test('el jefe de obra no ve las áreas del precio, y sí las suyas', () => {
  const suyas = areasDeAdministracion(CERO, 'jefe_obra').map((a) => a.clave)
  for (const cerrada of ['presupuestos', 'usuarios', 'documentos']) {
    assert.ok(!suyas.includes(cerrada), `${cerrada} se le ofrece al jefe y el middleware lo rebota`)
  }
  assert.deepEqual(suyas, ['clientes', 'personas', 'proveedores', 'compras', 'pendientes',
    'asistencia', 'base-maestra'])
  // Y tampoco le llegan chips a una pantalla que no puede abrir.
  for (const c of chipsDeAtencion(con({ proveedoresSinCuit: 1, comprasSinImputar: 1 }), 'jefe_obra')) {
    assert.ok(!c.href.startsWith('/presupuestos') && !c.href.startsWith('/documentos'))
  }
})

test('sin rol todavía cargado se falla CERRADO', () => {
  const sinRol = areasDeAdministracion(CERO, null).map((a) => a.clave)
  assert.ok(!sinRol.includes('usuarios'), 'una solapa que aparece medio segundo es peor que ninguna')
})

// ═══ LA BARRA DE LA ENTRADA Y LA DEL RESTO DEL ÁREA SON LA MISMA LISTA ═══
//
// Son dos archivos porque `NavAdministracionTabs` es `'use client'` y no se puede importar desde
// `node --test`. Esto es lo que impide que se desincronicen: `nav-secciones.test.ts` ya se había
// quedado con seis secciones mientras la barra real tenía diez, y nadie se enteró.
test('las diez áreas de la entrada son las mismas que declara la barra del área', () => {
  const fuente = readFileSync(
    fileURLToPath(new URL('../components/NavAdministracionTabs.tsx', import.meta.url)),
    'utf8',
  )
  const enLaBarra = [...fuente.matchAll(/\{\s*href:\s*'([^']+)'/g)].map((m) => m[1])
  const enLaEntrada = areasDeAdministracion(CERO, 'direccion').map((a) => a.href)
  assert.deepEqual(enLaEntrada, enLaBarra,
    'alguien agregó o movió una sección en un solo lado')
})
