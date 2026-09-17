// GUARDAS DE FUENTE: NINGUNA PANTALLA DE QUINCENA VUELVE A CORTAR POR EL ESTADO DE HOY, Y DOS DEFECTOS DEL QA.
//
// 1. Dueño, 14/09/2026: *«cada quincena tiene q mostrar el plantel q tuvo activo»*. La regla es
//    `plantelDeLaQuincena` (se prueba en `liquidacionPlantelActivo.test.ts`); acá se prueba que los servicios
//    que cortaban con `en_la_empresa` ya no lo hacen, y que la proyección FUTURA sigue con el plantel de hoy.
// 2. Hidratación en `CeldaRedondeo`: el `style` del campo es un objeto fijo por ancho.
// 3. Cierre a 390 px: la tabla sellada rueda dentro de su caja y el nombre no se pisa con las horas.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const fuente = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '')
// UN CORTE, NO UN MAPEO: `enLaEmpresa: p.en_la_empresa !== false` sólo viaja para la marca de baja.
const CORTE = /\.filter\(\(p\) => p\.en_la_empresa|\.eq\('en_la_empresa', true\)|!p\.enLaEmpresa &&/

test('LOS SERVICIOS DE UNA QUINCENA NO CORTAN POR `en_la_empresa`', () => {
  for (const rel of [
    './asistenciaSemanaService.ts', './eslabonesLegajoService.ts', './exposicionConvenioService.ts',
    './grillaHorasQuincenaService.ts', './liquidacionCuadros.ts', './liquidacionQuincenaService.ts', './jornadaPorObraService.ts',
  ]) {
    assert.ok(!CORTE.test(sinComentarios(fuente(rel))), `${rel} vuelve a cortar por el estado de hoy`)
  }
  // La escalera de costo recorta con el plantel de la quincena.
  const costo = sinComentarios(fuente('./costoLecturas.ts'))
  const escalera = costo.slice(costo.indexOf('export async function getPlantelParaEscalera('))
  assert.match(escalera, /\.filter\(\(p\) => plantel\.has\(String\(p\.id\)\)\)/)
  assert.ok(!/en_la_empresa !== false/.test(escalera))
  // Y usan la regla única.
  assert.match(fuente('./liquidacionQuincenaService.ts'), /plantelDeLaQuincena\(personas, q, \{/)
  assert.match(fuente('./asistenciaSemanaService.ts'), /plantelDeLaQuincena\(/)
  assert.match(fuente('./jornadaPorObraService.ts'), /plantelDeLaQuincena\(/)
  assert.match(fuente('./plantelDeLaQuincenaService.ts'), /plantelDeLaQuincena\(personas, q, actividad, deprueba\)/)
  assert.match(fuente('./cuadroDeLaQuincenaService.ts'), /datos\.personas\.filter\(\(p\) => enPlantel\.has\(p\.id\)\)/)
  // `persona_plantel` publica sólo a quien está hoy: no nombra a nadie de una quincena.
  assert.ok(!/from\('persona_plantel'\)\.select\('id, nombre_completo, especialidad, categoria'\)/.test(fuente('./jornadaPorObraService.ts')))
})

test('LA PROYECCIÓN DE QUINCENAS FUTURAS SIGUE CON EL PLANTEL DE HOY', () => {
  const costo = fuente('./costoLecturas.ts')
  const proyectables = costo.slice(costo.indexOf('export async function getPersonasProyectables('), costo.indexOf('export interface JornalesDelSheet'))
  assert.match(proyectables, /p\.en_la_empresa === true && p\.es_prueba !== true/)
})

test('EL CUADRO MARCA A QUIEN YA NO ESTÁ, SIN SACARLO', () => {
  assert.match(fuente('./espejoDeJornales.ts'), /baja: marcaDeBaja\(\{ enLaEmpresa: p\.enLaEmpresa !== false, fechaEgreso: p\.fechaEgreso \?\? null \}\)/)
  assert.match(fuente('../components/liquidacion/cuadro/CeldaPersona.tsx'), /data-testid=\{`baja-\$\{fila\.personaId\}`\} title=\{fila\.baja\.titulo\}/)
})

test('HIDRATACIÓN: el `style` del redondeo no depende del estado; el sugerido y el error son atributos', () => {
  const c = fuente('../components/liquidacion/CeldasDeLiquidacion.tsx')
  const campo = c.slice(c.indexOf('export function CeldaRedondeo('))
  assert.match(campo, /style=\{estiloDelRedondeo\(ancho\)\}/)
  assert.match(campo, /data-sugerido=\{gris \? '1' : '0'\}/)
  assert.match(campo, /className="border border-line text-ink data-\[sugerido='1'\]:text-muted data-\[error='1'\]:border-neg"/)
  assert.ok(!/color: gris \?|error \? V\.neg : V\.linea/.test(sinComentarios(campo)), 'ningún estilo armado según el estado')
  assert.match(fuente('../components/liquidacion/cuadro/FiltrosDelEspejo.tsx'), /style=\{ESTILO_BUSCADOR\}/)
})

test('CIERRE A 390 PX: la tabla sellada rueda dentro de su caja, con ancho mínimo y el nombre con ellipsis', () => {
  const c = fuente('../components/liquidacion/solapas/cierre.tsx')
  assert.match(c, /const grilla = 'minmax\(180px, 1fr\)/)
  assert.match(c, /data-testid="cerrada-scroll" style=\{\{ \.\.\.MARCO_SCROLL/)
  assert.match(c, /minWidth: ANCHO_CERRADA/)
  assert.match(c, /<span title=\{f\.nombre\} style=\{\{ color: V\.tinta, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis'/)
})
