// EL FILTRO, CONTRA LA SALIDA REAL DE LAS TOOLS — no contra un objeto que escribí yo.
//
// ═══ POR QUÉ ESTE ARCHIVO EXISTE APARTE (27/08/2026, auditoría) ═══
//
// El test de visibilidad que había usaba un objeto hecho a mano con los campos `costo_directo`,
// `venta_sin_iva` y `precio_unitario` — los tres elegidos por la misma persona que escribió el
// filtro. Probaba que el patrón matchea los nombres que ese patrón conoce. No podía ver `saldo`,
// `cobrado` ni `caja_hoy`, que son los que se fugaron en producción: `briefing.caja` publicó los
// cinco saldos que componen el total que había tachado.
//
// Un test sobre un fixture propio es la misma falla que la lista negra de nombres, un archivo más
// allá. Acá se corren las TOOLS DE VERDAD, con Postgres de verdad, y se afirma un INVARIANTE sobre
// lo que salga: para un actor sin `comercial.read`, después del filtro no puede quedar NINGÚN número
// grande cuya clave no sea una cantidad declarada.
//
// El invariante no depende de qué campos existan hoy: una tool nueva, o un campo nuevo en una tool
// vieja, entra a la prueba sin que nadie escriba una línea.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toolsDelNucleo } from './xsas-resolutores.mjs'
import { permisosDeRol, escribeAfuera } from './xsas-permisos.mjs'
import { filtrarPorVisibilidad, tacharComercial, TACHADO } from './xsas-visibilidad.mjs'

const JEFE = { id: 'jefe@ecsas.com.ar', rol: 'jefe_obra', permisos: permisosDeRol('jefe_obra') }
const DIRECCION = { id: 'jorge@ecsas.com.ar', rol: 'direccion', permisos: permisosDeRol('direccion') }

/** Cuántas tools reales tiene que haber recorrido el invariante para que valga. Se sube cuando la
 *  cobertura sube; bajarlo es una decisión que queda en el diff. */
export const PISO_DE_COBERTURA = 18

/**
 * ═══ EL ORÁCULO NO PUEDE COMPARTIR LA DEFINICIÓN CON LO QUE PRUEBA (auditoría round 3) ═══
 *
 * La primera versión de este archivo decidía qué era una fuga importando `UMBRAL`,
 * `CANTIDAD_VISIBLE` e `IDENTIFICADOR` del módulo bajo prueba: el día que entrara `saldo` a la lista
 * blanca, el filtro dejaría de tachar Y el detector dejaría de detectar — verde con la plata afuera.
 * Es el espejo un piso más arriba.
 *
 * El oráculo de acá abajo no sabe nada del filtro. Compara la salida de un rol que VE plata contra
 * la del que NO la ve, y exige que todo número grande que el primero recibe esté cambiado en el
 * segundo. No hay lista que ampliar para hacerlo pasar: para engañarlo habría que dejar de tachar,
 * que es exactamente lo que tiene que detectar.
 */
function numerosGrandes(x, ruta = '', out = new Map()) {
  // Un string que ES un número cuenta como número: así vuelve `numeric` de Postgres, y mirar sólo
  // el tipo de JavaScript dejaba fuera media tabla de condiciones financieras.
  const comoNumero = typeof x === 'number' ? x
    : (typeof x === 'string' && /^-?\d+([.,]\d+)?$/.test(x.trim()) ? Number(x.trim().replace(',', '.')) : NaN)
  // UN AÑO NO SE CUENTA, y es una regla del oráculo, no una lista importada del filtro: `anio: 2026`
  // y `periodo: "2026-06"` aparecen en media respuesta del OS y no son plata. El punto ciego que
  // deja es un importe de exactamente 1.900–2.099 pesos, que el filtro sí tacha y este detector no
  // verificaría — chico, conocido y escrito acá.
  const esAnio = Number.isInteger(comoNumero) && Math.abs(comoNumero) >= 1900 && Math.abs(comoNumero) <= 2099
  if (Number.isFinite(comoNumero) && Math.abs(comoNumero) >= 1000 && !esAnio) out.set(ruta, comoNumero)
  else if (typeof x === 'number') { /* chico: no es plata por tamaño */ }
  // En un texto sólo cuentan las corridas de CINCO dígitos y los importes con símbolo o separador:
  // un año («2026-06») tiene cuatro y no es plata, y tratarlo como fuga haría que el oráculo pidiera
  // tachar la fecha de un período fiscal.
  else if (typeof x === 'string') {
    // Desde CUATRO dígitos: el umbral del filtro es 1.000, y un oráculo que empieza en 10.000
    // sería ciego justo en la banda que el filtro sí cubre. El año se descarta por su rótulo.
    // En texto LIBRE el oráculo mira corridas de cinco dígitos, símbolo o separador de miles: es lo
    // que el filtro garantiza ahí. La banda 1.000–9.999 la cubre el camino de arriba, que ahora ve
    // también los números escritos como string.
    for (const m of x.matchAll(/-?\b\d{5,}\b|(\$|u\$s|usd)\s*[\d.,]+|-?\b\d{1,3}(\.\d{3})+\b/gi)) {
      out.set(`${ruta}«${m.index}»`, m[0])
    }
  }
  else if (Array.isArray(x)) x.forEach((v, i) => numerosGrandes(v, `${ruta}[${i}]`, out))
  else if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) numerosGrandes(v, ruta ? `${ruta}.${k}` : k, out)
  return out
}

test('ninguna tool real le filtra un número de plata a un rol sin comercial.read', async () => {
  // Con un cliente de Google de mentira entran también las tools que lo exigen —entre ellas
  // `briefing.caja`, que es la que se fugó—. Sin él ni siquiera estaba registrada y el invariante
  // no cubría el caso que lo motivó.
  const google = { readSheetValues: async () => [], listarArchivos: async () => [], descargarBytes: async () => Buffer.alloc(0) }
  const { mapa } = await toolsDelNucleo({ google, refrescar: true })
  const corridas = []
  const noCorrieron = []

  for (const [clave, tool] of mapa) {
    if ((tool?.schema?.input_schema?.required ?? []).length) continue
    // NINGUNA TOOL DE ESCRITURA SE CORRE EN UN TEST. Hoy `cotizacion.registrar` no inserta porque
    // valida sus argumentos antes; el día que una tenga defaults, esta suite escribiría en la base
    // de producción. Un test no puede tener efectos afuera.
    if (escribeAfuera(tool.capability)) continue
    let datos
    try { datos = await tool.run({}) } catch (e) { noCorrieron.push(`${clave}: ${String(e?.message ?? e).slice(0, 60)}`); continue }
    if (datos == null) { noCorrieron.push(`${clave}: devolvió null`); continue }
    corridas.push(clave)

    const texto = typeof datos?.resumen_texto === 'string' ? datos.resumen_texto : (datos?.texto ?? null)
    const ve = filtrarPorVisibilidad({ actor: DIRECCION, datos, respuesta: texto })
    const noVe = filtrarPorVisibilidad({ actor: JEFE, datos, respuesta: texto })

    const antes = numerosGrandes({ datos: ve.datos, respuesta: ve.respuesta })
    const despues = numerosGrandes({ datos: noVe.datos, respuesta: noVe.respuesta })
    const sobrevivientes = [...antes].filter(([ruta, valor]) => despues.get(ruta) === valor)
    assert.deepEqual(sobrevivientes.map(([r, v]) => `${r} = ${v}`), [],
      `${clave}: el jefe de obra recibió el mismo número grande que la dirección`)

    const hayTachado = JSON.stringify(noVe.datos ?? '').includes(TACHADO) || String(noVe.respuesta ?? '').includes(TACHADO)
    if (hayTachado) assert.match(noVe.degradacion ?? '', /tachada/, `${clave} tachó y no lo declaró`)
  }

  // El piso sigue al número real: con `>= 3` mientras cubre 21, el día que dejaran de registrarse
  // dieciocho el invariante pasaría sobre tres y nadie se enteraría. Un piso que no se mueve con la
  // cobertura mide otra cosa.
  assert.ok(corridas.length >= PISO_DE_COBERTURA,
    `el invariante corrió sobre ${corridas.length} tools reales y el piso es ${PISO_DE_COBERTURA}. No corrieron: ${noCorrieron.join(' | ')}`)
  console.log(`   [invariante] tools reales cubiertas: ${corridas.join(', ')}`)
})

test('el caso exacto que se fugó en producción: el total tachado y los sumandos publicados', () => {
  // Forma REAL de `briefing.caja`, copiada de la respuesta que el auditor sacó de la puerta viva.
  const briefing = {
    caja: {
      total: 78884376,
      cuentas: [
        { cuenta: 'Efectivo en pesos', saldo: 16490000 },
        { cuenta: 'Santander · cta cte ARS', saldo: 15696464 },
        { cuenta: 'Santander · cta cte USD', saldo: 1484110 },
        { cuenta: 'Balanz', saldo: 22530000 },
        { cuenta: 'Caja chica', saldo: 22683802 },
      ],
    },
    cobranzas_mes: { cobrado: 71980278, por_cobrar: 11723493 },
    proyeccion_7dias: { caja_hoy: 33670574, proyectado: 38480796 },
  }
  const r = filtrarPorVisibilidad({ actor: JEFE, datos: briefing, respuesta: null })
  assert.deepEqual([...numerosGrandes(r.datos).keys()], [], 'los sumandos son tan plata como el total')
  assert.equal(r.datos.caja.cuentas[0].saldo, TACHADO)
  assert.equal(r.datos.cobranzas_mes.cobrado, TACHADO)
  assert.equal(r.datos.proyeccion_7dias.caja_hoy, TACHADO)
  assert.equal(r.datos.caja.cuentas[0].cuenta, 'Efectivo en pesos', 'el nombre de la cuenta no es plata')
})

test('las cantidades del trabajo NO se tachan, que es el punto de tacharle sólo la plata', () => {
  const computo = {
    elementos: [{ nombre: 'correa', cantidad: 46, unidad: 'u', metros: 1240, kg: 8600 }],
    hh_previstas: 1200, documentos: { total: 33 }, personas: 19, anio: 2026, avance: 62,
    cotizacion_id: 'COT-XSAS-QUATTROPANI-edjp',
  }
  const r = filtrarPorVisibilidad({ actor: JEFE, datos: computo, respuesta: null })
  assert.equal(r.degradacion, null, 'un cómputo sin plata no se toca ni se declara recortado')
  assert.deepEqual(r.datos, computo)
})

test('los args de la acción ejecutada también se filtran', () => {
  const r = filtrarPorVisibilidad({
    actor: JEFE, datos: { ok: true }, respuesta: null,
    args: { cliente: 'Quattropani', monto_venta: 48500000, margen_pct: 23, cantidad: 46 },
  })
  assert.equal(r.args.monto_venta, TACHADO)
  assert.equal(r.args.cliente, 'Quattropani')
  assert.equal(r.args.cantidad, 46)
})

// ═══ LA CLASE ENTERA: PLATA QUE NO ES UN `number` DE JAVASCRIPT (28/08/2026) ═══
//
// Mordió una vez —`numeric` de Postgres vuelve como string y `tna: "0.55"` salía entera— y al
// cerrarlo el auditor encontró cuatro formas más de lo mismo. Una clase se cierra de una vez o
// vuelve: acá está enumerada la clase, no los casos.
test('todo escalar que sea un número se trata como número, venga como venga', () => {
  // Las claves son de plata a propósito: la clave dice QUÉ es y el tipo sólo dice cómo llegó. Un
  // `0.6278` bajo una clave que no nombra plata y por debajo del umbral se muestra, y está bien.
  const r = tacharComercial({
    saldo: 16490000,
    saldo_utilizado: 5000000n,   // pg con setTypeParser(20, BigInt), o plata en centavos
    deuda: '+4500',
    monto: '5e6',
    cft: '0.6278',               // así vuelve una columna numeric de Postgres
    importe: '1.234.567,89',
    saldos: ['16490000', '4500', 0.55],
  })
  for (const k of Object.keys(r.datos)) {
    const v = r.datos[k]
    const todos = Array.isArray(v) ? v : [v]
    for (const x of todos) assert.equal(x, TACHADO, `${k} salió sin tachar: ${JSON.stringify(x)}`)
  }
})

test('una fecha NO se destruye: el defecto del numeric, en espejo', () => {
  // `Object.entries(new Date())` es `[]`, así que la recursión de objetos la borraba entera para
  // todo rol sin `comercial.read`. Aquel filtraba de menos; éste destruía.
  const fecha = new Date('2026-08-28T03:00:00.000Z')
  const r = tacharComercial({ vence: fecha, saldo: 16490000 })
  assert.ok(r.datos.vence instanceof Date, 'la fecha tiene que seguir siendo una fecha')
  assert.equal(r.datos.vence.toISOString(), fecha.toISOString())
  assert.equal(r.datos.saldo, TACHADO)
})

test('y las cantidades siguen pasando aunque vengan como texto', () => {
  const r = tacharComercial({ cantidad: '46', metros: '1240', hh: '1200', anio: '2026', id: '900123' })
  assert.deepEqual(r.datos, { cantidad: '46', metros: '1240', hh: '1200', anio: '2026', id: '900123' })
  assert.deepEqual(r.campos, [])
})

// ═══ EL VETO BAJA POR EL CAMINO, NO SE EVALÚA EN LA HOJA (28/08/2026, auditoría) ═══
//
// El array heredaba la clave del padre y el objeto no: `{tna: ['0.55']}` se tachaba y
// `{tna: {actual: 0.55}}` pasaba. El mismo defecto en el contenedor de al lado — la hoja se llama
// `actual`, `vigente`, `obra`, y ninguna de las tres nombra plata.
test('la plata chica anidada bajo una clave de plata se tacha igual', () => {
  const r = tacharComercial({
    tna: { actual: 0.55 },
    cft: { vigente: 0.6278 },
    margen: { obra: 0.23 },
    condiciones: { tna: { actual: 0.55 } },
  })
  assert.equal(r.datos.tna.actual, TACHADO)
  assert.equal(r.datos.cft.vigente, TACHADO)
  assert.equal(r.datos.margen.obra, TACHADO)
  assert.equal(r.datos.condiciones.tna.actual, TACHADO, 'y a cualquier profundidad')
})

test('una clave de plata tacha cualquier escalar, lo sepa leer o no', () => {
  // `1,234.56` es formato US y `0x4E20` es hexadecimal: `comoNumero` no los resuelve, y al no ser
  // números el veto por clave ni llegaba a correr. Que no sepa leerlo no lo vuelve inofensivo.
  const r = tacharComercial({ saldo: '1,234.56', tna: '0x4E20', importe: 'aprox. mil quinientos' })
  assert.equal(r.datos.saldo, TACHADO)
  assert.equal(r.datos.tna, TACHADO)
  assert.equal(r.datos.importe, TACHADO)
})

test('y la salida sigue existiendo: una cantidad bajo un ancestro de plata se muestra', () => {
  // Es la única forma de escaparse de la herencia, y tiene que seguir funcionando: si no, el
  // cómputo entero desaparecería en cuanto colgara de un objeto llamado `costos`.
  const r = tacharComercial({ costos: { cantidad: 46, importe: 800, detalle: { unidad: 'u', metros: 1240, precio: 12 } } })
  assert.equal(r.datos.costos.cantidad, 46)
  assert.equal(r.datos.costos.detalle.unidad, 'u')
  assert.equal(r.datos.costos.detalle.metros, 1240)
  assert.equal(r.datos.costos.importe, TACHADO)
  assert.equal(r.datos.costos.detalle.precio, TACHADO)
})
