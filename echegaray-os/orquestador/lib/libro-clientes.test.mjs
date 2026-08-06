// EL CATÁLOGO DE CLIENTES — lo que tiene que romperse si alguien lo toca mal.
//
// Los tres defectos que este archivo atrapa, y cada uno ya tiene precio en el repo:
//
//  1. UN ALIAS EN DOS CLIENTES. La misma cadena mapeada a dos nombres canónicos hace que la plata de
//     esas filas se cuente dos veces adentro de la sección, y el residuo salga NEGATIVO — sin un solo
//     error, porque el subtotal del tronco sigue siendo el del libro. Es el mismo modo de falla que
//     "un rubro repetido" del cuadro de rubros.
//  2. ADIVINAR POR PARECIDO. "San Francisco" está adentro de "IMOTOR/San Francisco/JAVI SANCHEZ" y
//     también estaría adentro de un proveedor llamado "Corralón San Francisco". Un match por
//     substring acierta dos veces y falla la tercera en silencio.
//  3. CONFUNDIR UN CENTRO DE COSTO CON UN CLIENTE. `Compras!J` mezcla clientes con asignaciones
//     internas ("Administracion", "Taller", "F931", "UOCRA"). Tomarlas como clientes inventaría media
//     docena de clientes que no existen y repartiría gasto de estructura como si fuera de obra.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CLIENTES, ALIAS_INFERIDOS, SIN_CLIENTE, ROTULO_SIN_CLIENTE,
  clienteCanonico, esClienteCanonico, nombresDeClientes,
} from './libro-clientes.mjs'
import { movimiento, ENTRA, SALE } from './libro-movimientos.mjs'

test('el inventario no tiene duplicados: ni un nombre repetido, ni un alias en dos clientes', () => {
  const nombres = nombresDeClientes()
  assert.equal(new Set(nombres).size, nombres.length, `dos clientes con el mismo nombre: ${nombres}`)
  const alias = CLIENTES.flatMap((c) => c.alias.map((a) => a.trim().toUpperCase()))
  assert.equal(new Set(alias).size, alias.length,
    'un alias mapeado a dos clientes cuenta esa plata dos veces y deja el residuo negativo')
  // Y cada cliente se encuentra a sí mismo: un nombre canónico que no esté entre sus propios alias
  // haría que las filas que ya vienen canonizadas (la cartera) no caigan en su bloque.
  for (const c of CLIENTES) assert.equal(clienteCanonico(c.nombre), c.nombre, c.nombre)
})

test('cada alias del catálogo devuelve su cliente — con las cadenas EXACTAS del archivo', () => {
  // Copiadas del inventario vivo de `_MOVIMIENTOS` y de `Compras!J` el 06/08/2026. Si el dueño
  // renombra un cliente en el origen, la sub-línea empieza a sumar cero: acá es donde se ve.
  const casos = [
    ['LA ESTRELLA /ALIMENTOS DEL SUR SAS', 'LA ESTRELLA'],
    ['LA ESTRELLA', 'LA ESTRELLA'],
    ['Alimentos Del Sur SA', 'LA ESTRELLA'],
    ['IMOTOR/San Francisco/JAVI SANCHEZ', 'San Francisco'],
    ['San Francisco', 'San Francisco'],
    ['MESSINA', 'MESSINA'],
    ['Manufacturas Quimicas Juan Messina SA', 'MESSINA'],
    ['Quattropani - Melisa García SAS', 'Quattropani - Melisa García SAS'],
    ['ARCOR', 'ARCOR'],
    ['LIRIO DANIEL RAMIRO', 'LIRIO DANIEL RAMIRO'],
  ]
  for (const [crudo, esperado] of casos) assert.equal(clienteCanonico(crudo), esperado, crudo)
  // Mayúsculas y espacios de más no cambian el cliente: el archivo escribe " ARCOR " más de una vez.
  assert.equal(clienteCanonico('  arcor  '), 'ARCOR')
  assert.equal(clienteCanonico('la  estrella'), 'LA ESTRELLA')
})

test('NO adivina por parecido: un nombre que CONTIENE a un cliente no es ese cliente', () => {
  // El defecto que esto atrapa: con un match por substring, "Corralón San Francisco" —un proveedor—
  // le cargaría sus compras al cliente San Francisco. El match es por igualdad, y por eso esto da ''.
  assert.equal(clienteCanonico('Corralón San Francisco'), SIN_CLIENTE)
  assert.equal(clienteCanonico('ARCOR SAIC sucursal Arroyito'), SIN_CLIENTE)
  assert.equal(clienteCanonico('LA ESTRELLA DEL SUR SRL'), SIN_CLIENTE)
})

test('las asignaciones internas de Compras!J NO son clientes: son centros de costo', () => {
  // Las 15 cadenas que conviven con los clientes en la misma columna del archivo (06/08/2026).
  const internas = ['Administracion', 'Taller', 'TALLER', 'Almacen', 'Plan de pago', 'Obras', 'F931',
    'Credito Prendario', 'FCL', 'UOCRA', 'IERIC', 'FODECO', 'Sueldos', 'Vehiculos / Maquinas', 'Papa']
  for (const i of internas) {
    assert.equal(clienteCanonico(i), SIN_CLIENTE, `"${i}" no es un cliente: es una asignación interna`)
  }
  assert.equal(clienteCanonico(''), SIN_CLIENTE)
  assert.equal(clienteCanonico(null), SIN_CLIENTE)
  assert.equal(clienteCanonico(undefined), SIN_CLIENTE)
})

test('LAS INFERENCIAS ESTÁN DECLARADAS, y cada una dice su evidencia', () => {
  // Que dos cadenas distintas sean el mismo cliente es una lectura, no un dato del archivo. Este test
  // no la valida —eso lo firma el dueño— pero garantiza que ninguna se cuele sin quedar escrita.
  assert.ok(ALIAS_INFERIDOS.length > 0)
  for (const a of ALIAS_INFERIDOS) {
    assert.ok(esClienteCanonico(a.cliente), `"${a.cliente}" no es un cliente del catálogo`)
    assert.equal(clienteCanonico(a.alias), a.cliente, `el alias inferido "${a.alias}" no está en el catálogo`)
    assert.ok(a.evidencia && a.evidencia.length > 60, `"${a.alias}": una inferencia sin evidencia escrita no se acepta`)
    assert.ok(/pendiente del visto del dueño/.test(a.confianza), `"${a.alias}": una inferencia no se declara sola como validada`)
  }
  // Y ninguna cadena idéntica al nombre canónico se cuenta como inferencia: sería inflar la lista.
  for (const a of ALIAS_INFERIDOS) assert.notEqual(a.alias, a.cliente)
})

test('LA PARTICIÓN CIERRA: cada movimiento cae en un cliente o en el residuo, nunca en dos', () => {
  // Es la propiedad de la que depende la sección entera del cash flow. Se prueba sobre movimientos
  // reales del libro (los que `movimiento()` produce), no sobre el mapa: lo que importa es que la
  // columna `cliente` que se escribe en la pestaña sea una partición.
  const base = { fecha: 46000, importe: 100, estado: 'REAL', origen: { pestana: 'X', fila: 1 } }
  const libro = [
    movimiento({ ...base, signo: ENTRA, cliente: 'LA ESTRELLA /ALIMENTOS DEL SUR SAS', importe: 500 }),
    movimiento({ ...base, signo: SALE, cliente: 'LA ESTRELLA', importe: 200, origen: { pestana: 'X', fila: 2 } }),
    movimiento({ ...base, signo: SALE, cliente: 'Administracion', importe: 300, origen: { pestana: 'X', fila: 3 } }),
    movimiento({ ...base, signo: SALE, cliente: '', importe: 400, origen: { pestana: 'X', fila: 4 } }),
    movimiento({ ...base, signo: ENTRA, cliente: 'MESSINA', importe: 700, origen: { pestana: 'X', fila: 5 } }),
  ]
  const validos = new Set([...nombresDeClientes(), SIN_CLIENTE])
  for (const m of libro) assert.ok(validos.has(m.cliente), `"${m.cliente}" no es canónico ni vacío`)
  const porCliente = nombresDeClientes()
    .reduce((a, n) => a + libro.filter((m) => m.cliente === n).reduce((s, m) => s + m.importe, 0), 0)
  const residuo = libro.filter((m) => m.cliente === SIN_CLIENTE).reduce((s, m) => s + m.importe, 0)
  assert.equal(porCliente + residuo, libro.reduce((s, m) => s + m.importe, 0),
    'si esto no cierra, la sección POR CLIENTE muestra un residuo que no es el resto')
  // El caso que importa: la asignación interna NO se le cuelga a ningún cliente, cae en el residuo.
  assert.equal(residuo, 700, 'Administracion ($300) y la fila sin asignar ($400) van al residuo')
})

test('el rótulo del residuo dice las DOS cosas que contiene, porque contiene las dos', () => {
  // "Sin asignar" a secas mentiría: adentro también están los clientes que no llegaron al catálogo
  // (ADDATO, MACRO CONSTRUCCIONES, Mineral Del Rio) y las notas de crédito de proveedores.
  assert.equal(ROTULO_SIN_CLIENTE, 'Otros y sin asignar')
  assert.equal(esClienteCanonico(ROTULO_SIN_CLIENTE), false,
    'el residuo no puede ser también un cliente del catálogo: se contaría a sí mismo')
})
