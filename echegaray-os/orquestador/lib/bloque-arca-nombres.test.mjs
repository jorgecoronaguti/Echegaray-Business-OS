import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  CABECERA_ARCA, LINEAS_ARCA, NOMBRES_ARCA, NOMBRES_ARCA_RETIRADOS, destinosDeArca, dondeViveCadaNombre,
  ubicarBloqueVivo, destinosDeLaPestana, norm,
} from './bloque-arca-nombres.mjs'
import { ARCA, ESPECIE, desalineados } from './rangos-nombrados.mjs'

const SRC = readFileSync(new URL('../scripts/proveedores-materiales-pestana.mjs', import.meta.url), 'utf8')

/** La grilla tal como la arma el generador: cabecera y debajo las seis líneas, en orden. */
const bloque = () => [
  [CABECERA_ARCA, 'Comprobantes', 'Monto'],
  ...LINEAS_ARCA.map((l, i) => [l.texto, 100 + i, 1000 + i]),
]

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// EL DEFECTO MEDIDO EN EL ARCHIVO VIVO (13/08/2026)
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// La pestaña "Proveedores" tiene TRES copias del bloque de cobertura: una fósil en la 126, la buena
// en la 177-182 y un fragmento huérfano en la 229-230. El reapuntado leía la columna A entera y se
// quedaba con LA ÚLTIMA fila cuyo texto empezaba con el rótulo, así que:
//
//   · ARCA_COMPRAS_TOTAL  → C126 = "2470-01545411"   (un número de comprobante donde promete plata)
//   · ARCA_EN_COMPRAS_N   → B229 = 456               (el fragmento huérfano; el bloque bueno dice 380)
//   · ARCA_SIN_NUMERO_*   → se quedaron en la 129, sobre un CUIT
//
// "El último" es anclar en la posición. Lo único que el generador puede afirmar es qué escribió él.

test('el destino sale de la grilla escrita: una copia MÁS ABAJO no se lo lleva', () => {
  // La pestaña arranca en la fila 52 (la frontera: arriba viven las tablas dinámicas).
  const FILA0 = 52
  const grid = [
    ['2 · CUENTA CORRIENTE POR PROVEEDOR'],
    [],
    ...bloque(),
    [],
    ['Proveedor según ARCA', 'CUIT', 'Comprobante'],
    ['TELEFONICA MOVILES ARGENTINA SOCIEDAD ANONIMA', '30-67881435-7', '2470-01545411'],
  ]
  // El fragmento huérfano de la 229-230, veinte filas más abajo, con OTRAS cifras del mismo concepto.
  while (grid.length < 40) grid.push([])
  grid.push([LINEAS_ARCA[2].texto, 456, 179091614.15])

  const { destinos, faltan, faltanSinNombre } = destinosDeArca(grid, FILA0)
  assert.deepEqual(faltan, [], 'las seis líneas están en la grilla')
  assert.deepEqual(faltanSinNombre, [])
  assert.equal(destinos.length, NOMBRES_ARCA.length)

  const donde = (n) => destinos.find((d) => d.name === n)
  // La cabecera está en el índice 2 de la grilla ⇒ fila 54; las seis líneas, de la 55 a la 60. La
  // quinta —"sin cargar en Compras"— es la única que publica: fila 59.
  assert.deepEqual(donde(ARCA.faltanN), { name: ARCA.faltanN, fila: 59, col: 2 })
  assert.deepEqual(donde(ARCA.faltanMonto), { name: ARCA.faltanMonto, fila: 59, col: 3 })
  // EL QUE DELATA EL DEFECTO ORIGINAL: con "la última aparición" ARCA_EN_COMPRAS_N caía en la fila 92
  // (el fragmento huérfano). Hoy ese nombre está RETIRADO, así que lo que se prueba es lo mismo un
  // paso antes: la copia de más abajo no puede generar ningún destino.
  assert.ok(!destinos.some((d) => d.fila > 60), 'ningún destino puede caer en la copia huérfana de más abajo')
})

test('un rótulo lejos de la cabecera NO se toma: ahí abajo vive la lista de faltantes', () => {
  // La línea QUE PUBLICA (la quinta, "sin cargar en Compras") es la que se manda lejos: si el
  // detector la adoptara, ARCA_FALTAN_N/MONTO —los dos únicos con lectores— apuntarían a la lista de
  // comprobantes que vive veinte filas más abajo, que es el defecto del 05/08 con otro nombre.
  const grid = [[CABECERA_ARCA], ...LINEAS_ARCA.filter((l) => !l.publica).map((l) => [l.texto])]
  while (grid.length < 26) grid.push([])
  grid.push([LINEAS_ARCA.find((l) => l.publica).texto, 58, 13837030])

  const { destinos, faltan } = destinosDeArca(grid, 1)
  assert.deepEqual(faltan, [LINEAS_ARCA.find((l) => l.publica).texto.trim()],
    'la línea lejana se declara ausente, no se adopta')
  assert.deepEqual(destinos, [], 'ningún nombre puede apuntar fuera del bloque')
})

test('sin cabecera no se publica NADA: las seis líneas se declaran ausentes', () => {
  const { destinos, faltan, faltanSinNombre, cabecera } = destinosDeArca([['otra cosa'], ['y otra']], 1)
  assert.equal(cabecera, null)
  assert.equal(destinos.length, 0)
  assert.equal(faltan.length + faltanSinNombre.length, LINEAS_ARCA.length)
  assert.ok(faltan.length, 'la línea que publica tiene que caer del lado que FRENA la corrida')
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// EL RÓTULO ES UN CONTRATO: UNA SOLA COPIA
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// El generador escribía "  · cargados SIN su N° de comprobante" y el reapuntado buscaba
// "· cargados sin su N° de comprobante". `startsWith` distingue mayúsculas: esa línea "no aparecía
// en la pestaña escrita" y sus dos nombres se quedaron sobre un CUIT. Dos literales del mismo texto
// en el mismo archivo divergen; la única cura es que haya uno.

test('el generador NO tiene ninguna copia de los rótulos: los toma de LINEAS_ARCA', () => {
  for (const l of LINEAS_ARCA) {
    assert.ok(!SRC.includes(`'${l.texto}'`), `el rótulo ${JSON.stringify(l.texto)} volvió a escribirse a mano en el generador`)
  }
  assert.ok(!SRC.includes(`'${CABECERA_ARCA}'`), 'la cabecera del bloque volvió a ser un literal del generador')
  assert.match(SRC, /const rotuloArca = \(nombre\) => LINEAS_ARCA\.find/)
  assert.match(SRC, /destinosDeArca\(hojaArca\.grid \|\| \[\], hojaArca\.filaArranque\)/,
    'la fila tiene que salir de la grilla escrita, no de releer la columna A de la pestaña')
})

test('una redacción distinta se declara AUSENTE — no engancha con la línea de al lado', () => {
  const grid = bloque()
  grid[4][0] = '  · cargados SIN su N° de comprobante'   // el "SIN" real del archivo vivo
  const { destinos, faltan, faltanSinNombre } = destinosDeArca(grid, 1)
  assert.deepEqual(faltanSinNombre, [LINEAS_ARCA[3].texto.trim()])
  assert.deepEqual(faltan, [], 'esa línea ya no publica: se avisa, pero no frena la corrida')
  // LO QUE NO PUEDE PASAR: que la línea de al lado —la que SÍ publica— se corra una fila para tapar
  // el hueco. Sus dos nombres tienen que seguir sobre su propia fila, la 6 de la grilla.
  assert.deepEqual(destinos.map((d) => [d.name, d.fila]), [[ARCA.faltanN, 6], [ARCA.faltanMonto, 6]])
})

test('la sangría no es parte del contrato: se compara sin los espacios de los bordes', () => {
  const grid = bloque().map((f) => [String(f[0]).trim(), ...f.slice(1)])
  const { faltan, faltanSinNombre } = destinosDeArca(grid, 1)
  assert.deepEqual([...faltan, ...faltanSinNombre], [])
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// EL CONTROL: DÓNDE QUEDÓ CADA NOMBRE, LEÍDO DEL ARCHIVO
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// `publicar` verifica el destino que se le PIDIÓ y, si no convence, no publica — y el nombre se
// queda donde estaba. Eso no lo miraba nadie: el 13/08 ARCA_COMPRAS_TOTAL siguió apuntando a C126
// con "2470-01545411" adentro y la corrida cerró con un aviso.

test('un nombre que quedó sobre un número de comprobante se detecta releyendo el archivo', () => {
  const SHEET = 864283094
  // Lo que devolvió `getNamedRanges` del archivo vivo el 13/08: fila 126 col 3 y fila 129 col 2/3.
  const rangos = [
    { name: ARCA.total, range: { sheetId: SHEET, startRowIndex: 125, startColumnIndex: 2 } },
    { name: ARCA.sinNumeroN, range: { sheetId: SHEET, startRowIndex: 128, startColumnIndex: 1 } },
    { name: ARCA.faltanMonto, range: { sheetId: SHEET, startRowIndex: 180, startColumnIndex: 2 } },
  ]
  const { destinos, ausentes, enOtraPestana } = dondeViveCadaNombre(
    [ARCA.total, ARCA.sinNumeroN, ARCA.faltanMonto, ARCA.ventasN], rangos, SHEET,
  )
  assert.deepEqual(ausentes, [ARCA.ventasN], 'un nombre que el archivo no tiene se dice, no se saltea')
  assert.deepEqual(enOtraPestana, [])
  assert.deepEqual(destinos.map((d) => [d.name, d.fila, d.col]), [
    [ARCA.total, 126, 3], [ARCA.sinNumeroN, 129, 2], [ARCA.faltanMonto, 181, 3],
  ])

  // Y lo que hay HOY en esas celdas, tal cual salió del archivo con UNFORMATTED_VALUE.
  const celda = { [ARCA.total]: '2470-01545411', [ARCA.sinNumeroN]: '23-36911157-4', [ARCA.faltanMonto]: 970225.76 }
  const malos = desalineados(destinos, (d) => celda[d.name])
  assert.deepEqual(malos.map((m) => m.name).sort(), [ARCA.sinNumeroN, ARCA.total].sort())
  assert.equal(malos.find((m) => m.name === ARCA.total).espera, 'importe')
  assert.equal(malos.find((m) => m.name === ARCA.total).encontro, 'texto')
})

test('un nombre que emigró a otra pestaña se reporta: ya no significa lo que promete', () => {
  const rangos = [{ name: ARCA.total, range: { sheetId: 999, startRowIndex: 3, startColumnIndex: 2 } }]
  const { destinos, enOtraPestana } = dondeViveCadaNombre([ARCA.total], rangos, 864283094)
  assert.deepEqual(enOtraPestana, [ARCA.total])
  assert.equal(destinos.length, 0, 'no se lo verifica como si viviera acá')
})

test('todo nombre que el bloque publica declara su especie: sin eso el control no controla nada', () => {
  assert.ok(NOMBRES_ARCA.length, 'el bloque tiene que publicar al menos el que sus lectores citan')
  for (const n of NOMBRES_ARCA) assert.ok(ESPECIE[n], `${n} no declara qué especie promete`)
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// LOS DIEZ NOMBRES SIN LECTOR (14/08/2026)
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// Medido sobre el archivo vivo recorriendo TODAS las fórmulas del libro: de los doce `ARCA_*`, sólo
// ARCA_FALTAN_MONTO (Materiales!B53, Proveedores!G11) y ARCA_FALTAN_N (Proveedores!H11) tienen quien
// los lea. Los otros diez vivían sobre `Proveedores!B124:C129` —CUITs y números de comprobante— y no
// los citaba nadie: diez anclas para volver a clavar cada dos horas y ninguna razón para tenerlas.

test('sólo publica el bloque los nombres que alguna fórmula del libro cita', () => {
  assert.deepEqual([...NOMBRES_ARCA].sort(), [ARCA.faltanMonto, ARCA.faltanN].sort())
  assert.equal(NOMBRES_ARCA.length + NOMBRES_ARCA_RETIRADOS.length, LINEAS_ARCA.length * 2,
    'cada línea aporta sus dos nombres a exactamente una de las dos listas')
  // NI UNO EN LAS DOS LISTAS: un nombre que se publica y se retira en la misma corrida es un
  // parpadeo —se crea y se borra cada dos horas— y toda fórmula que lo cite ve #NAME? la mitad del día.
  for (const n of NOMBRES_ARCA) assert.ok(!NOMBRES_ARCA_RETIRADOS.includes(n), `${n} está en las dos listas`)
})

test('los retirados son exactamente los diez que no cita nadie, y siguen escribiéndose en la pestaña', () => {
  assert.deepEqual([...NOMBRES_ARCA_RETIRADOS].sort(), [
    ARCA.comprobantes, ARCA.total, ARCA.notasN, ARCA.notasMonto,
    ARCA.enComprasN, ARCA.enComprasMonto, ARCA.sinNumeroN, ARCA.sinNumeroMonto,
    ARCA.ventasN, ARCA.ventasMonto,
  ].sort())
  // EL CUADRO NO PIERDE UNA LÍNEA. Lo que se retira es el NOMBRE, no la fila: el dueño sigue leyendo
  // las seis en la pestaña. Si esto se rompe, alguien confundió "sacar el rango" con "sacar el dato".
  assert.equal(LINEAS_ARCA.length, 6)
})

test('el generador emite las bajas en CADA corrida: un nombre que ya no se reapunta no se borra solo', () => {
  assert.match(SRC, /retirar\(\[\.\.\.NOMBRES_ARCA_RETIRADOS\]/,
    'sin el deleteNamedRange, el nombre retirado se queda para siempre donde quedó — hoy, sobre un CUIT')
})

test('las bajas se emiten ANTES del skip: si dependen de haber escrito, no corren el día que importa', () => {
  // Que estos diez no los cite nadie es un hecho del archivo, no de la corrida. Adentro del `else`
  // el arreglo tendría la misma disponibilidad que el defecto: ninguna, si la pestaña se saltea.
  const iBajas = SRC.indexOf('retirar([...NOMBRES_ARCA_RETIRADOS]')
  const iSkip = SRC.indexOf('const hojaArca = escritas.find')
  assert.ok(iBajas > 0 && iSkip > 0)
  assert.ok(iBajas < iSkip, 'el retiro tiene que correr aunque "Proveedores" quede fuera de la corrida')
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// UNA LÍNEA QUE NO SE EMITE NO DEJA SU NOMBRE DONDE ESTABA, Y LA CORRIDA NO SALE EN VERDE
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test('el generador cuenta como ERROR la línea que no encuentra, y verifica dónde quedó cada nombre', () => {
  assert.match(SRC, /err \+= sinRotulo\.length/,
    'una línea sin rótulo tiene que frenar el retiro de las pestañas viejas, no sólo avisar')
  assert.ok(!/Sus rangos con nombre NO se reapuntan — se quedan donde estaban/.test(SRC),
    '"se quedan donde estaban" sin verificar es exactamente el defecto que se está arreglando')
  // El resultado de la verificación tiene que SUMAR al contador de defectos. Se pregunta por las dos
  // piezas y no por una línea literal: el 14/08 el contador pasó a desglosarse por causa —"4 celdas en
  // error" contaba rangos con nombre y mandó a buscar un #REF! que no existía— y un test atado al
  // texto exacto de una línea se rompe con cada mejora de redacción sin decir nada sobre el comportamiento.
  assert.match(SRC, /const vivos = await verificarNombresVivos\(google, hojaArca\.sheetId\)/)
  assert.match(SRC, /err \+= vivos/,
    'si la verificación no suma al contador, un nombre mal apuntado deja la corrida en verde')
  assert.match(SRC, /if \(err\) process\.exitCode = 1/,
    'un rango mal apuntado es plata equivocada en otra pestaña: el paso se reporta FALLADO, no con un aviso')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// LA COLISIÓN QUE HABRÍA MATADO LA CORRIDA EN LA LÍNEA SIGUIENTE (14/08/2026)
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// `main()` ya tenía un `const retirar = OBSOLETAS.map(...)` —las PESTAÑAS obsoletas— doscientas líneas
// por debajo de la llamada nueva a la función `retirar` importada, que da de baja RANGOS CON NOMBRE.
// Un `const` sombrea el import en TODA la función, zona muerta temporal incluida: la llamada de
// arriba habría muerto con `ReferenceError: Cannot access 'retirar' before initialization`, en plena
// corrida y después de haber escrito la pestaña. Lo cazó eslint como "import sin usar", que es la
// forma amable de decir "esto que creés que llamás no es lo que llamás".

test('el generador no declara ninguna variable que sombree la función `retirar` importada', () => {
  assert.match(SRC, /import \{[^}]*\bretirar\b[^}]*\} from '\.\.\/lib\/rangos-nombrados\.mjs'/)
  assert.doesNotMatch(SRC, /\b(?:const|let|var|function)\s+retirar\b/,
    'una declaración local con ese nombre deja el import en zona muerta y la corrida muere al llamarlo')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// UBICAR EL BLOQUE VIVO LEYENDO LA PESTAÑA — EL CASO REAL DEL 15/08/2026
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// La columna A de "Proveedores" tal como se leyó del archivo vivo: una capa FÓSIL en 139-145 (la
// cabecera del bloque y dos de sus seis líneas, con filas de otra tabla metidas en los huecos) y el
// bloque BUENO en 177-182. Los nombres estaban clavados en B144/C144 — un CUIT y un comprobante.
const COL_A_REAL = new Map([
  [138, '5 · LO QUE ARCA FACTURÓ Y COMPRAS NO TIENE — 50 comprobantes'],
  [139, 'Cobertura del libro de IVA de ARCA'],
  [140, 'STARLINK ARGENTINA S R L'],
  [141, '· notas de crédito (restan)'],
  [142, 'PEREZ GARCIA MARISOL BIBIANA'],
  [143, 'DANPE S. R. L.'],
  [144, 'PEREZ GARCIA MARISOL BIBIANA'],
  [145, 'Comprobantes emitidos (ventas)'],
  [174, '6 · LO QUE ARCA REGISTRÓ — la plomería, no es para leer'],
  [176, 'Concepto'],
  // OJO CON ESTOS DOS: NO son los textos de LINEAS_ARCA. Son los que la Regla 0 dejó en la pestaña.
  [177, 'Comprobantes de compra (neto de notas de crédito)'],
  [178, '· notas de crédito (restan)'],
  [179, '· cargados en Compras, por N° de comprobante'],
  [180, '· cargados SIN su N° de comprobante'],
  [181, '· ⚠ sin cargar en Compras'],
  [182, 'Comprobantes emitidos (ventas)'],
  [183, 'ARCOR'],
])
const colAReal = (desde = 117, hasta = 222) =>
  Array.from({ length: hasta - desde + 1 }, (_, i) => [COL_A_REAL.get(desde + i) ?? ''])

test('ubica el bloque BUENO (177) y no la capa fósil, sobre la columna A real', () => {
  const u = ubicarBloqueVivo(colAReal(), 117)
  assert.equal(u.fila, 177)
  assert.deepEqual(u.filas, [177, 178, 179, 180, 181, 182])
})

// EL DEFECTO QUE ATRAPA: si el emparejamiento fuera por texto EXACTO contra `LINEAS_ARCA`, el bloque
// vivo no se reconocería —la pestaña dice "(neto de notas de crédito)" y "SIN" en mayúsculas— y los
// nombres se quedarían donde están. Que es exactamente lo que pasó: ARCA_FALTAN_* en B144/C144.
test('el ancla tolera lo que la Regla 0 cambia: la cola del rótulo y el SIN en mayúsculas', () => {
  const exacto = LINEAS_ARCA.map((l) => l.texto)
  assert.notEqual(exacto[0], COL_A_REAL.get(177), 'el texto mandado y el que quedó son distintos: eso es el punto')
  assert.notEqual(exacto[3].trim(), COL_A_REAL.get(180), 'el "SIN" en mayúsculas es el defecto del 13/08')
  const u = ubicarBloqueVivo(colAReal(), 117)
  assert.equal(u.fila, 177)
})

// EL DEFECTO QUE ATRAPA: "el último" eligió el fragmento huérfano de las filas 229-230 el 13/08 y
// publicó 456 · $179.091.614 donde el bloque bueno dice 380. Con la gramática de seis consecutivas,
// un fragmento no es candidato — no hay nada que elegir mal.
test('un fragmento suelto del bloque no es candidato: no alcanza con que el rótulo aparezca', () => {
  const col = [
    ['· cargados en Compras, por N° de comprobante'],
    ['· ⚠ sin cargar en Compras'],
    ['algo de otra tabla'],
  ]
  const u = ubicarBloqueVivo(col, 229)
  assert.equal(u.fila, null)
  assert.match(u.motivo, /no encontré/)
})

// EL DEFECTO QUE ATRAPA: con dos copias COMPLETAS no hay forma honesta de elegir, y elegir por
// posición es el defecto que este archivo persigue. Falla cerrado, con las dos filas dichas.
test('con dos bloques completos falla cerrado y nombra los candidatos', () => {
  const seis = LINEAS_ARCA.map((l) => [l.texto])
  const u = ubicarBloqueVivo([...seis, ['relleno'], ...seis], 100)
  assert.equal(u.fila, null)
  assert.deepEqual(u.candidatos, [100, 107])
  assert.match(u.motivo, /2 bloques completos/)
})

test('los destinos de la pestaña son los de la línea publicadora, en B y C', () => {
  const { destinos, ubicacion } = destinosDeLaPestana(colAReal(), 117)
  assert.equal(ubicacion.fila, 177)
  assert.deepEqual(destinos, [
    { name: ARCA.faltanN, fila: 181, col: 2 },
    { name: ARCA.faltanMonto, fila: 181, col: 3 },
  ])
})

// EL DEFECTO QUE ATRAPA: los dos caminos —la grilla que se escribe y la pestaña que quedó— tienen
// que dar la MISMA fila cuando la Regla 0 no tocó nada. Si divergen, uno de los dos está mintiendo.
test('sobre una grilla sin editar, la pestaña y la grilla escrita coinciden', () => {
  const grid = bloque()
  const porGrilla = destinosDeArca(grid, 177)
  const porPestana = destinosDeLaPestana(grid, 177)
  assert.deepEqual(porPestana.destinos, porGrilla.destinos)
})

// EL DEFECTO QUE ATRAPA: un ancla que matchea DOS líneas distintas haría que el bloque se reconociera
// corrido, y los nombres caerían una fila más arriba o más abajo sin que nada gritara.
test('ningún ancla matchea el rótulo de otra línea del bloque', () => {
  for (const a of LINEAS_ARCA) {
    const suyas = LINEAS_ARCA.filter((b) => norm(b.texto).includes(a.ancla))
    assert.equal(suyas.length, 1, `el ancla "${a.ancla}" matchea ${suyas.length} líneas: ${suyas.map((s) => s.texto).join(' | ')}`)
  }
})

test('cada línea declara su ancla y el ancla es prefijo-insensible del texto que manda', () => {
  for (const l of LINEAS_ARCA) {
    assert.ok(l.ancla, `la línea "${l.texto}" no declara ancla`)
    assert.ok(norm(l.texto).includes(l.ancla), `el ancla "${l.ancla}" no está en el texto que se manda`)
  }
})
