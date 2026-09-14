// «DEJA COSAS PEGADAS» (QA, 15/09/2026) — la celda «Efect. red.».
//
// 1. ESCAPE NO CANCELABA: la celda no tenía `onKeyDown`. Con Escape lo tecleado quedaba pegado y el primer clic
//    afuera disparaba `onBlur` y guardaba. Ahora: Enter guarda, Escape revierte sin guardar, Tab guarda y pasa, y
//    salir sin haber tocado nada no guarda.
// 2. EL GUARDADO FALLABA SIEMPRE Y NO SE VEÍA: el upsert con el cliente autenticado es un INSERT … ON CONFLICT DO
//    UPDATE SET liquidacion_id, persona_id, efectivo_redondeado, y `authenticated` no tiene UPDATE sobre las dos
//    llaves. En la 01/09 ninguna de las 6 filas del QA quedó guardada; la celda sólo ponía un borde rojo con
//    `title`. Ahora escribe con la clave de servicio (como las `*_manual`), relee, y el error se ve en texto.
//
// MUTACIONES QUE LO PONEN ROJO: Escape que guarda; una relectura que acepta cero filas.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  debeGuardarAlSalir, escribirRedondeo, filaDelRedondeo, teclaDelRedondeo, verificarGuardadoDelRedondeo,
  type FilaDelRedondeo,
} from './efectivoRedondeado.ts'

const fuente = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')

test('ESCAPE REVIERTE SIN GUARDAR; ENTER Y TAB GUARDAN', () => {
  assert.equal(teclaDelRedondeo('Escape'), 'revertir', 'MUTACIÓN: Escape que guarda')
  assert.equal(teclaDelRedondeo('Enter'), 'guardar')
  assert.equal(teclaDelRedondeo('Tab'), 'guardar-y-pasar')
  assert.equal(teclaDelRedondeo('a'), null)
})

test('SALIR DEL CAMPO SIN HABER TOCADO NADA, O DESPUÉS DE ESCAPE, NO GUARDA', () => {
  assert.equal(debeGuardarAlSalir({ tocado: false, cancelado: false }), false, 'foco y blur sin tipear')
  assert.equal(debeGuardarAlSalir({ tocado: true, cancelado: true }), false, 'Escape y después clic afuera')
  assert.equal(debeGuardarAlSalir({ tocado: true, cancelado: false }), true)
})

test('GUARDAR SOBRE UNA LÍNEA QUE NO EXISTE CREA LA FILA: las dos llaves y el redondeo; los importes toman su default', () => {
  const f = filaDelRedondeo({ liquidacionId: 'q1', personaId: 'p1', valor: 266000 })
  assert.deepEqual(f, { liquidacion_id: 'q1', persona_id: 'p1', efectivo_redondeado: 266000 })
  assert.deepEqual(filaDelRedondeo({ liquidacionId: 'q1', personaId: 'p1', valor: null }).efectivo_redondeado, null)
})

/** Una tabla en memoria con la clave (liquidacion_id, persona_id): la línea puede no existir. */
function tablaFalsa(filas: FilaDelRedondeo[], opciones: { rechazaEnSilencio?: boolean; error?: string } = {}) {
  const escrituras: FilaDelRedondeo[] = []
  const upsert = async (fila: FilaDelRedondeo) => {
    escrituras.push(fila)
    if (opciones.error) return { data: null, error: { message: opciones.error } }
    if (opciones.rechazaEnSilencio) return { data: [], error: null }
    const i = filas.findIndex((f) => f.liquidacion_id === fila.liquidacion_id && f.persona_id === fila.persona_id)
    if (i >= 0) filas[i] = { ...filas[i], ...fila }; else filas.push(fila)
    return { data: [filas[i >= 0 ? i : filas.length - 1]], error: null }
  }
  return { upsert, escrituras, filas }
}

test('GUARDAR SOBRE UNA LÍNEA QUE NO EXISTE LA CREA Y LO RELEÍDO LO PRUEBA (01/09: 5 líneas, 6 personas tecleadas)', async () => {
  const t = tablaFalsa([{ liquidacion_id: 'q1', persona_id: 'otra', efectivo_redondeado: null }])
  const r = await escribirRedondeo(t.upsert, { liquidacionId: 'q1', personaId: 'maldonado', valor: 266000 })
  assert.deepEqual(r, { ok: true })
  assert.equal(t.filas.length, 2)
  assert.deepEqual(t.filas[1], { liquidacion_id: 'q1', persona_id: 'maldonado', efectivo_redondeado: 266000 })
})

test('UN RECHAZO EN SILENCIO O UN ERROR DE LA BASE NO SE ACUSA COMO GUARDADO', async () => {
  const silencio = await escribirRedondeo(tablaFalsa([], { rechazaEnSilencio: true }).upsert, { liquidacionId: 'q1', personaId: 'p', valor: 1000 })
  assert.equal(silencio.ok, false)
  const permiso = await escribirRedondeo(tablaFalsa([], { error: 'permission denied for table liquidacion_linea' }).upsert,
    { liquidacionId: 'q1', personaId: 'p', valor: 1000 })
  assert.deepEqual(permiso, { ok: false, error: 'No se guardó: permission denied for table liquidacion_linea' })
})

test('LA RELECTURA MANDA: cero filas es error, y un valor distinto también', () => {
  assert.deepEqual(verificarGuardadoDelRedondeo([], 266000), { ok: false, error: 'La base no guardó la fila.' },
    'MUTACIÓN: aceptar cero filas es el defecto que el QA encontró')
  assert.deepEqual(verificarGuardadoDelRedondeo([{ efectivo_redondeado: '266000.00' }], 266000), { ok: true })
  assert.deepEqual(verificarGuardadoDelRedondeo([{ efectivo_redondeado: null }], null), { ok: true })
  assert.equal(verificarGuardadoDelRedondeo([{ efectivo_redondeado: 265000 }], 266000).ok, false)
})

test('LA CELDA: onKeyDown con Escape, error visible junto al campo; LA ACCIÓN: clave de servicio y relectura', () => {
  const c = fuente('../components/liquidacion/CeldasDeLiquidacion.tsx')
  const celda = c.slice(c.indexOf('export function CeldaRedondeo('))
  assert.match(celda, /onKeyDown=\{/)
  assert.match(celda, /teclaDelRedondeo\(e\.key\)/)
  assert.match(celda, /debeGuardarAlSalir\(\{/)
  assert.match(celda, /data-testid=\{`redondeo-error-\$\{personaId\}`\}/, 'el error en texto, no sólo en el title')
  const a = fuente('./liquidacionActions.ts')
  const accion = a.slice(a.indexOf('export async function guardarEfectivoRedondeado('), a.indexOf('const cierreSchema'))
  assert.match(accion, /const admin = createAdminClient\(\)/)
  assert.match(accion, /escribirRedondeo\(\s*\(fila\) => admin\.from\('liquidacion_linea'\)/, 'escribe con la clave de servicio y relee')
  assert.ok(!/supabase\.from\('liquidacion_linea'\)/.test(accion), 'ninguna lectura ni escritura de la línea con la sesión')
  assert.ok(accion.indexOf('puedeLiquidar(') < accion.indexOf('createAdminClient()'), 'el permiso se pregunta antes de la clave de servicio')
  assert.ok(accion.indexOf("'cerrada'") < accion.indexOf('createAdminClient()'), 'la quincena cerrada se frena antes')
})

test('LAS OTRAS CELDAS DE LIQUIDACIÓN QUE GUARDAN AL SALIR: ESCAPE NO GUARDA DE REBOTE', () => {
  // Escape desmonta o desenfoca el input y el `blur` de ese evento todavía ve lo tecleado.
  const inline = fuente('../../../shared/components/ds/InlineEdit.tsx')
  assert.match(inline, /if \(e\.key === 'Escape'\) \{ e\.preventDefault\(\); cancelado\.current = true;/)
  assert.match(inline, /onBlur=\{\(\) => \{ if \(cancelado\.current\) \{ cancelado\.current = false; return \}/)
  const tarifa = fuente('../components/liquidacion/cuadro/CeldaTarifa.tsx')
  assert.match(tarifa, /cancelado\.current = true; setTexto\(null\)/)
  assert.match(tarifa, /onBlur=\{\(\) => \{ if \(cancelado\.current\) \{ cancelado\.current = false; return \} guardar\(\) \}\}/)
  const horas = fuente('../components/GrillaAsistenciaObra.tsx')
  assert.match(horas, /canceladas\.current\.add\(k\); volverAlValorAnterior\(k\)/)
  assert.match(horas, /onBlur=\{\(e\) => \{ if \(canceladas\.current\.delete\(k\)\) return; guardar\(fila, celda, e\.target\.value\) \}\}/)
})
