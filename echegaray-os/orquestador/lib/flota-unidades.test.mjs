import test from 'node:test'
import assert from 'node:assert/strict'
import {
  resolverUnidad, unidadPorClave, UNIDADES, FAMILIAS, APODOS_SIN_MAPEAR, sqlUnidadesNombradas,
} from './flota-unidades.mjs'

// Todos los conceptos de este archivo son TEXTO REAL de la pestaña Compras (espejo costos_obra,
// enero-agosto 2026). No hay ni un caso inventado: cada uno es una forma de escribir que el dueño
// usó de verdad y que rompió alguna versión anterior de la regla.

test('la camioneta del prendario NO es el camión — el borde de palabra', () => {
  // SIN \b, "camion" matchea dentro de "Camioneta" y las 12 cuotas del prendario del Ford XLS
  // ($15.359.163) se le imputan al Mercedes 608D. Es el falso positivo más caro del archivo.
  const r = resolverUnidad('Cuota 21 — Prestamo Camioneta Ford XLS')
  assert.equal(r.clave, 'ford-xls')
  assert.ok(!r.unidades.includes('camion-608d'))
})

test('una carga que nombra DOS unidades no se le da a ninguna', () => {
  // El defecto del CASE improvisado: "la primera que matchea gana" imputa el 100% de estos litros a
  // una sola unidad. Son cuatro filas por $677.262 — plata inventada en el cuadro de esa unidad.
  for (const [txt, esperadas] of [
    ['Combustible — 50L C/U bobcat y camion', ['camion-608d', 'bobcat-s650']],
    ['combustible — Camion 70L y Maquina 20L', ['camion-608d']],
    ['Camión 30L / Bobcat 40L - Messina — Diesel 500 (70L) y Nafta súper (5L)', ['camion-608d', 'bobcat-s650']],
    ['Diesel 500 (26,5135 l) + Nafta Super (9,2807 l) - Bobcat y Toyota', ['bobcat-s650']],
  ]) {
    const r = resolverUnidad(txt)
    assert.equal(r.clave, null, txt)
    assert.equal(r.causa, 'compartido', txt)
    for (const e of esperadas) assert.ok(r.unidades.includes(e), `${txt} → falta ${e}`)
  }
})

test('"TIJE / AUTOELEVADOR" son dos equipos, no uno llamado TIJE', () => {
  const r = resolverUnidad('combustible — TIJE / AUTOELEVADOR')
  assert.equal(r.causa, 'compartido')
  assert.deepEqual([...r.unidades].sort(), ['autoelevador', 'tijera'])
})

test('"Ford" a secas es ambiguo: hay dos Ford', () => {
  const r = resolverUnidad('Ford — Diesel 500 (40 L) y Nafta super (5,01 L)')
  assert.equal(r.clave, null)
  assert.equal(r.causa, 'ambiguo')
  assert.match(r.detalle, /F100/)
})

test('"Toyota" a secas es ambiguo: hay tres Hilux', () => {
  assert.equal(resolverUnidad('Combustible — Toyota').causa, 'ambiguo')
})

test('los typos reales del dueño resuelven a la unidad correcta', () => {
  // Si estos no están declarados como identificador, cada typo es un gasto que se cae del cuadro.
  assert.equal(resolverUnidad('Combustible — Diesel 500 (Toyota EEA88S)').clave, 'hilux-eea885')
  assert.equal(resolverUnidad('Combustible — Toyota MNM 898').clave, 'hilux-nmn898')
})

test('la misma patente escrita de cualquier forma es la misma unidad', () => {
  for (const t of ['combustible — TOYOTA AD119YO', 'combustible — AD 119 YO', 'Toyota AD-119-YO']) {
    assert.equal(resolverUnidad(t).clave, 'hilux-ad119yo', t)
  }
  for (const t of ['combustible — EEA885', 'Toyota EEA-885 — Repuestos Varios', 'Combustible — Combustible EEA']) {
    assert.equal(resolverUnidad(t).clave, 'hilux-eea885', t)
  }
})

test('un apodo sin mapear se declara, no se adivina', () => {
  // Adivinar cuál de las tres Hilux es "HW DX 2018" sería fabricar dato. Declararlo lo convierte en
  // una pregunta con plata al lado, que es lo único que hace que alguien la conteste.
  const r = resolverUnidad('Combustible — HW DX 2018 — Diesel 500, 26,6904 L')
  assert.equal(r.clave, null)
  assert.equal(r.causa, 'apodo_sin_mapear')
  assert.equal(r.detalle, 'hw dx 2018')
  assert.equal(resolverUnidad('Combustible — Diesel 500 (Camioneta Emi)').causa, 'apodo_sin_mapear')
})

test('un texto sin unidad no inventa una', () => {
  const r = resolverUnidad('Combustible — Combustible')
  assert.equal(r.clave, null)
  assert.equal(r.causa, 'no_nombrada')
})

test('la familia nombrada junto a su unidad NO cuenta dos veces', () => {
  // "Toyota EEA 885" nombra la familia toyota Y la unidad eea885. Si la familia contara aparte, la
  // fila saldría "compartida" y las 15 cargas de la EEA885 se caerían del cuadro.
  const r = resolverUnidad('Combustible — Toyota EEA 885')
  assert.equal(r.clave, 'hilux-eea885')
  assert.equal(r.causa, null)
})

test('el registro sólo declara identificadores verificables', () => {
  for (const u of UNIDADES) {
    assert.ok(u.clave && u.nombre && u.tipo, `unidad incompleta: ${u.clave}`)
    assert.ok(u.fuente, `${u.clave} no declara de dónde salió`)
    // Nada de marca/modelo/año inventado: si hay patente o serie, tiene que haber fuente que la
    // respalde, y si no hay, el campo va en null — nunca completado por parecido.
    if (u.patente) assert.match(u.patente, /^[A-Z0-9]{6,7}$/, `patente sospechosa en ${u.clave}`)
    assert.ok(u.alias.length + u.ids.length > 0 || u.tipo === 'equipo_menor', `${u.clave} sin forma de reconocerse`)
  }
  assert.equal(new Set(UNIDADES.map((u) => u.clave)).size, UNIDADES.length, 'claves duplicadas')
})

test('la patente del camión sale de un papel, no de un supuesto', () => {
  // public.equipos la sembró como "sin patente confirmada". El nombre del archivo de RTO en la
  // carpeta del 608D dice VOI440. Es evidencia de nivel 2 (nombre leído, PDF no abierto) y la
  // fuente viaja al lado para que el dueño la confirme contra la cédula.
  const c = unidadPorClave('camion-608d')
  assert.equal(c.patente, 'VOI440')
  assert.match(c.fuente, /RTO - VOI440/)
})

test('los equipos alquilados están marcados como tales', () => {
  // Sumar el alquiler de la tijera al "costo de la flota propia" haría que una unidad que no es
  // nuestra compita en el cuadro con las que sí lo son.
  for (const k of ['tijera', 'excavadora-alquilada']) {
    assert.equal(unidadPorClave(k).tipo, 'alquilada', k)
  }
})

test('la traducción a SQL cubre todas las unidades', () => {
  const sql = sqlUnidadesNombradas('concepto')
  for (const u of UNIDADES) assert.ok(sql.includes(`'${u.clave}'`), `${u.clave} no viaja al SQL`)
  assert.ok(sql.startsWith('array_remove(array['), 'el SQL devuelve el array de claves nombradas')
  // El SQL NO puede decir "la primera que matchea": devuelve TODAS, y quien lo consume decide.
  assert.ok(!/limit 1/i.test(sql))
})

test('no hay alias de familia que pise el alias de una unidad', () => {
  const deUnidades = new Set(UNIDADES.flatMap((u) => u.alias))
  for (const f of Object.values(FAMILIAS)) {
    for (const a of f.alias) assert.ok(!deUnidades.has(a), `"${a}" es alias de familia y de unidad a la vez`)
  }
  for (const a of APODOS_SIN_MAPEAR) assert.ok(!deUnidades.has(a.apodo), `"${a.apodo}" es apodo y alias`)
})
