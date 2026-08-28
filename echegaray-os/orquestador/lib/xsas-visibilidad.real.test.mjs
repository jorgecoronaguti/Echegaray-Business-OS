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
import { permisosDeRol } from './xsas-permisos.mjs'
import { filtrarPorVisibilidad, UMBRAL, CANTIDAD_VISIBLE, IDENTIFICADOR, TACHADO } from './xsas-visibilidad.mjs'

const JEFE = { id: 'jefe@ecsas.com.ar', rol: 'jefe_obra', permisos: permisosDeRol('jefe_obra') }

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
  const { mapa } = await toolsDelNucleo({ google: null })
  const corridas = []
  const noCorrieron = []

  for (const [clave, tool] of mapa) {
    // Sólo las que corren sin argumentos: pedirles uno inventado sería probar otra cosa.
    if ((tool?.schema?.input_schema?.required ?? []).length) continue
    let datos
    try { datos = await tool.run({}) } catch (e) { noCorrieron.push(`${clave}: ${String(e?.message ?? e).slice(0, 80)}`); continue }
    if (datos == null) { noCorrieron.push(`${clave}: devolvió null`); continue }
    corridas.push(clave)

    const visto = filtrarPorVisibilidad({
      actor: JEFE, datos,
      respuesta: typeof datos?.resumen_texto === 'string' ? datos.resumen_texto : (datos?.texto ?? null),
    })
    const fuga = fugas(visto.datos).concat(visto.respuesta ? fugas(visto.respuesta, 'respuesta') : [])
    assert.deepEqual(fuga, [], `${clave} dejó pasar plata: ${fuga.join(' · ')}`)

    // Y si tachó algo, tiene que DECIRLO. Declarar una protección que no ocurrió sería peor que no
    // filtrar; no declarar la que sí ocurrió deja al que lee creyendo que vio todo.
    const hayTachado = JSON.stringify(visto.datos ?? '').includes(TACHADO) || String(visto.respuesta ?? '').includes(TACHADO)
    if (hayTachado) assert.match(visto.degradacion ?? '', /tachada/, `${clave} tachó y no lo declaró`)
  }

  // Un invariante que no corrió sobre nada pasa siempre. Se exige piso, y lo que no pudo correr se
  // declara: «no pude mirar» no es «está bien».
  assert.ok(corridas.length >= 3,
    `el invariante corrió sobre ${corridas.length} tools reales; no alcanza. No corrieron: ${noCorrieron.join(' | ')}`)
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
  assert.deepEqual(fugas(r.datos), [], 'los sumandos son tan plata como el total')
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
