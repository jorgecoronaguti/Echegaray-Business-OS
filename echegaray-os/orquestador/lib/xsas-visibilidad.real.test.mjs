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
import { filtrarPorVisibilidad, TACHADO } from './xsas-visibilidad.mjs'

const JEFE = { id: 'jefe@ecsas.com.ar', rol: 'jefe_obra', permisos: permisosDeRol('jefe_obra') }
const DIRECCION = { id: 'jorge@ecsas.com.ar', rol: 'direccion', permisos: permisosDeRol('direccion') }

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
  if (typeof x === 'number' && Number.isFinite(x) && Math.abs(x) >= 1000) out.set(ruta, x)
  // En un texto sólo cuentan las corridas de CINCO dígitos y los importes con símbolo o separador:
  // un año («2026-06») tiene cuatro y no es plata, y tratarlo como fuga haría que el oráculo pidiera
  // tachar la fecha de un período fiscal.
  else if (typeof x === 'string') {
    for (const m of x.matchAll(/-?\b\d{5,}\b|(\$|u\$s|usd)\s*[\d.,]+|-?\b\d{1,3}(\.\d{3})+\b/gi)) out.set(`${ruta}«${m.index}»`, m[0])
  }
  else if (Array.isArray(x)) x.forEach((v, i) => numerosGrandes(v, `${ruta}[${i}]`, out))
  else if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) numerosGrandes(v, ruta ? `${ruta}.${k}` : k, out)
  return out
}

/** Recorre lo filtrado y devuelve las rutas donde quedó un número que sólo puede ser plata. */
function fugas(datos, ruta = '', clave = '') {
  const out = []
  if (typeof datos === 'number' && Number.isFinite(datos)) {
    if (Math.abs(datos) >= UMBRAL && !CANTIDAD_VISIBLE.test(clave) && !IDENTIFICADOR.test(clave)) {
      out.push(`${ruta} = ${datos}`)
    }
    return out
  }
  if (typeof datos === 'string' && !IDENTIFICADOR.test(clave)) {
    // Un importe escrito adentro del texto cuenta igual que uno estructurado.
    const m = datos.match(/-?\b\d{5,}\b|(\$|u\$s|usd)\s*[\d.,]+|\b\d{1,3}(\.\d{3})+\b/i)
    if (m) out.push(`${ruta} ⊃ «${m[0]}»`)
    return out
  }
  if (!datos || typeof datos !== 'object') return out
  if (Array.isArray(datos)) {
    datos.forEach((v, i) => out.push(...fugas(v, `${ruta}[${i}]`, clave)))
    return out
  }
  for (const [k, v] of Object.entries(datos)) out.push(...fugas(v, ruta ? `${ruta}.${k}` : k, k))
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

  assert.ok(corridas.length >= 3,
    `el invariante corrió sobre ${corridas.length} tools reales; no alcanza. No corrieron: ${noCorrieron.join(' | ')}`)
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
