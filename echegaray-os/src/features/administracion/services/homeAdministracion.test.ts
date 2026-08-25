import test from 'node:test'
import assert from 'node:assert/strict'
import {
  areasDeAdministracion, atencionNoLeida, chipsDeAtencion, cuenta, resumenDeTrabajo,
  senalesDeTrabajo, senalesVivas,
  type ConteosAtencion, type ConteosHome,
} from './homeAdministracion.ts'

// Lo que la pantalla 00 no puede hacer nunca: inventar un cero, publicar una señal que no mide
// nada, ofrecerle al jefe de obra una puerta que el middleware le va a cerrar, y —sobre todo—
// callar una señal que no se pudo leer, que es como una base caída se disfraza de área sin trabajo.

const NADA: ConteosHome = {
  clientes: null, personas: null, proveedores: null, compras: null, tareasTipo: null,
  documentos: null, proveedoresSinCuit: null, nombresSinResolver: null, comprasSinImputar: null,
  comprasSinResolver: null, comprasDuplicadas: null, pendientes: null, correcciones: null,
}

const CERO: ConteosHome = {
  clientes: 0, personas: 0, proveedores: 0, compras: 0, tareasTipo: 0, documentos: 0,
  proveedoresSinCuit: 0, nombresSinResolver: 0, comprasSinImputar: 0, comprasSinResolver: 0,
  comprasDuplicadas: 0, pendientes: 0, correcciones: 0,
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

test('una lectura que falló NO se dibuja como cero en la barra', () => {
  for (const a of areasDeAdministracion(NADA, 'direccion')) {
    assert.equal(a.cuenta, null, `${a.clave} fabricó un contador sin haber podido leer`)
  }
})

test('un cero real se dice, y no enciende ninguna señal', () => {
  assert.equal(area(CERO, 'clientes').cuenta, 0)
  assert.deepEqual(senalesDeTrabajo(CERO, 'direccion'), [])
  assert.deepEqual(chipsDeAtencion(CERO, 'direccion'), [])
})

test('«Trabajo» cuenta SEÑALES VIVAS, no una tabla', () => {
  const c = con({ proveedoresSinCuit: 14, comprasDuplicadas: 1 })
  assert.equal(senalesVivas(c, 'direccion'), 2)
  assert.equal(areasDeAdministracion(c, 'direccion', senalesVivas(c, 'direccion'))[0].cuenta, 2)
  // Sin nada que leer, el contador no es 0: es que no se sabe.
  assert.equal(senalesVivas(NADA, 'direccion'), null)
})

// ═══ EL LIBRO MAYOR ═══

test('LA SEÑAL QUE NO SE PUDO LEER SE DIBUJA, y dice que no se pudo leer', () => {
  // ÉSTE es el defecto que los chips tenían: descartaban el `null` igual que al 0, así que «no pude
  // contar los duplicados» y «no hay duplicados» se veían idénticos — y el segundo es una
  // afirmación que la pantalla no puede hacer si no pudo mirar. Si alguien vuelve a filtrar los
  // `null` junto con los ceros, este test se pone rojo.
  const s = senalesDeTrabajo(con({ comprasDuplicadas: null }), 'direccion')
  const dup = s.find((x) => x.clave === 'duplicados')
  assert.ok(dup, 'la señal que no se pudo leer desapareció de la lista')
  assert.equal(dup.numero, null, 'una lectura fallida no puede publicar un número')
  assert.match(dup.bloquea, /no pude leerlo/i)
  // Y la campanita no la muestra: un chip sin número no es un chip.
  assert.ok(!chipsDeAtencion(con({ comprasDuplicadas: null }), 'direccion').some((c) => c.clave === 'duplicados'))
})

test('cada señal trae su cifra, qué bloquea, dónde y el VERBO', () => {
  // Criterio 2 del patrón: «una frase que nombra el obstáculo y un botón que lo resuelve». Una fila
  // sin verbo es un chip que cuenta, que es exactamente lo que esta pantalla dejó de ser.
  const todas = senalesDeTrabajo(con({
    proveedoresSinCuit: 14, nombresSinResolver: 82, comprasSinImputar: 3, comprasSinResolver: 2,
    comprasDuplicadas: 1, pendientes: 1, correcciones: 4,
  }), 'direccion')
  assert.equal(todas.length, 7, 'las siete señales tienen que poder dibujarse a la vez')
  for (const s of todas) {
    assert.ok(s.texto.trim(), `${s.clave} sin texto`)
    assert.ok(s.bloquea.trim(), `${s.clave} no dice qué bloquea`)
    assert.ok(s.accion.trim(), `${s.clave} no trae verbo`)
    assert.ok(s.donde.trim(), `${s.clave} no dice dónde se arregla`)
    assert.ok(s.href.startsWith('/'), `${s.clave} no lleva a ninguna parte`)
  }
})

test('el rojo va primero, y es UNO solo', () => {
  const todas = senalesDeTrabajo(con({
    proveedoresSinCuit: 14, comprasDuplicadas: 1, pendientes: 1,
  }), 'direccion')
  assert.equal(todas[0].clave, 'duplicados', 'lo que ya está mal se lee antes que lo que falta')
  // Un comprobante duplicado que nadie mira se paga dos veces; los demás son datos que faltan, y
  // pintarlos de rojo haría que el rojo dejara de significar algo.
  assert.deepEqual(todas.filter((s) => s.tono === 'neg').map((s) => s.clave), ['duplicados'])
})

test('cada señal lleva al FILTRO que la contó, no a la pantalla en general', () => {
  const s = senalesDeTrabajo(con({
    comprasSinImputar: 3, comprasSinResolver: 2, comprasDuplicadas: 1,
    proveedoresSinCuit: 14, nombresSinResolver: 82,
  }), 'direccion')
  const href = (clave: string) => s.find((x) => x.clave === clave)!.href
  // El `?f=` es el mismo valor que `aplicarFiltro` usa para contar: si se separaran, la fila diría
  // «3 sin obra» y la lista de allá mostraría otra cosa.
  assert.equal(href('compras-sin-imputar'), '/administracion/compras?f=sin-imputar')
  assert.equal(href('compras-sin-resolver'), '/administracion/compras?f=sin-resolver')
  assert.equal(href('duplicados'), '/administracion/compras?f=duplicados')
  assert.equal(href('sin-cuit'), '/administracion/proveedores?cuit=falta')
  assert.equal(href('nombres'), '/administracion/proveedores?vista=resolver')
})

test('la señal escribe singular y plural', () => {
  const uno = senalesDeTrabajo(con({ proveedoresSinCuit: 1 }), 'direccion')
  assert.equal(uno[0].texto, 'proveedor sin CUIT')
  const varios = senalesDeTrabajo(con({ proveedoresSinCuit: 14 }), 'direccion')
  assert.equal(varios[0].texto, 'proveedores sin CUIT')
})

test('NINGUNA señal es «personas sin obra asignada»', () => {
  // El mockup del 23/08 lo pintaba en ámbar. La regla del negocio (19/08) gana: estar entre dos
  // obras es un estado NORMAL, y un aviso siempre encendido deja de leerse a la semana. La barra ya
  // no tiene ⚠ y el libro mayor no puede recuperar esa señal por la ventana.
  const claves = senalesDeTrabajo(con({ personas: 18 }), 'direccion').map((s) => s.clave)
  assert.deepEqual(claves, [], 'una persona sin obra asignada no es trabajo pendiente')
})

test('la lista vacía POR ERROR se distingue de la vacía porque no hay nada', () => {
  assert.equal(atencionNoLeida(NADA), true)
  assert.equal(atencionNoLeida(CERO), false)
  // Con TODO en null igual se dibujan las siete filas diciendo que no se pudieron leer; lo que la
  // pantalla usa para poner el cartel es este flag.
  assert.equal(senalesDeTrabajo(NADA, 'direccion').length, 7)
  assert.equal(chipsDeAtencion(NADA as ConteosAtencion, 'direccion').length, 0)
})

test('el jefe de obra no ve los destinos del precio, y sí los suyos', () => {
  const suyas = areasDeAdministracion(CERO, 'jefe_obra').map((a) => a.clave)
  assert.deepEqual(suyas, ['trabajo', 'clientes', 'personas', 'proveedores', 'compras', 'base-maestra'])
  // Y tampoco le llegan señales a una pantalla que no puede abrir.
  for (const s of senalesDeTrabajo(con({ proveedoresSinCuit: 1, comprasSinImputar: 1 }), 'jefe_obra')) {
    assert.ok(!s.href.startsWith('/presupuestos') && !s.href.startsWith('/documentos'))
  }
})

test('el resumen no escribe «0 urgentes», y avisa cuando no pudo contar todo', () => {
  // Un cero no es una noticia: «7 señales · 11 registros · 0 urgentes» hace leer una palabra fuerte
  // para enterarse de que no pasa nada.
  const sinRojo = senalesDeTrabajo(con({ proveedoresSinCuit: 14, pendientes: 1 }), 'direccion')
  assert.equal(resumenDeTrabajo(sinRojo), '2 señales · 15 registros')

  const conRojo = senalesDeTrabajo(con({ comprasDuplicadas: 1, proveedoresSinCuit: 14 }), 'direccion')
  assert.equal(resumenDeTrabajo(conRojo), '2 señales · 15 registros · 1 urgente')

  // Y si una no se pudo leer, el total NO se presenta como si fuera todo: los que faltan podrían
  // ser muchos o ninguno, y sumar sólo lo leído sin decirlo publica un total falso.
  const conHueco = senalesDeTrabajo(con({ proveedoresSinCuit: 14, pendientes: null }), 'direccion')
  assert.equal(resumenDeTrabajo(conHueco), '2 señales · al menos 14 registros · 1 sin leer')
})
