import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// EL PARTE DIARIO DEL DISEÑO ERP OBRAS (06 a 1440 y M08 a 390, dueño 23/09/2026) — lo que se mide
// en el .html se lee en el .tsx. Cada test fija una medida o un texto que una «traducción» al
// design system volvería a perder: la grilla de 380 px del aside, el input de 62 px, los chips de
// 38 px, la primaria de 48 px del teléfono, y lo que el dueño retiró (el clima, el estado elegido).
//
// «NO QUIERO LAYOUT NUEVO» (dueño, 23/09/2026): el contrato es el 06/M08 literal. Cuatro columnas
// —Actividad · Producción hoy · Acumulado · Comentario—, «Quién vino» de sólo lectura, novedad de
// 88 px sin destino, y nada de equipos, «% ítem» ni «quién y con qué».

const fuente = (f: string) => readFileSync(join(import.meta.dirname, f), 'utf8')
const cliente = () => fuente('parte/ParteDiarioCliente.tsx')
const servidor = () => fuente('parte/ParteDiario.tsx')

test('la 06 es una grilla de 1fr + aside de 380 px con 52 px de aire, sobre padding 22/30/30', () => {
  const src = cliente()
  assert.match(src, /gridTemplateColumns: 'minmax\(0,1fr\) 380px', gap: '52px'/)
  assert.match(src, /padding: '22px 30px 30px'/)
  assert.match(src, /paddingLeft: '34px', borderLeft: `1px solid \$\{C\.borde\}`/)
})

test('un renglón por frente en curso: CUATRO columnas del 06, input de 62×30, fila de 60 con hairline, comentario «opcional»', () => {
  const src = cliente()
  assert.match(src, /un renglón por frente en curso/)
  assert.match(src, /<div>Actividad<\/div><div>Producción hoy<\/div><div>Acumulado<\/div><div>Comentario<\/div>/)
  assert.match(src, /const COLUMNAS = 'minmax\(0,1fr\) 132px 116px minmax\(0,1fr\)'/)
  assert.match(src, /width: '62px', height: '30px', padding: '0 9px'/)
  assert.match(src, /minHeight: '60px'/)
  assert.match(src, /placeholder="opcional"/)
  assert.equal(/<div>% ítem<\/div>|<div>Quién y con qué<\/div>|<div>Hecho hoy<\/div>/.test(src), false, 'volvieron las columnas que la 06 no dibuja')
})

test('la bloqueada lleva el borde izquierdo de 2 px en neg, dice «bloqueada» y no tiene input', () => {
  const src = cliente()
  assert.match(src, /borderLeft: `2px solid \$\{C\.neg\}`, paddingLeft: '12px', marginLeft: '-12px'/)
  assert.match(src, /color: C\.neg \}\}>bloqueada</)
})

test('quién vino son chips de 38 px de sólo lectura; sin marcar va en warn; sin horas editables', () => {
  const src = cliente()
  assert.match(src, /height: '38px', padding: '0 13px'/)
  assert.match(src, /sinMarcar \? C\.warn : C\.borde/)
  assert.equal(/name=\{`hh_/.test(src), false, 'volvieron las horas editables: las horas entran por Personal')
})

test('el aside lleva SÓLO novedades de 88 px y la primaria de 38 px; sin equipos ni destino de la novedad', () => {
  const src = cliente()
  assert.match(src, /Novedades del día/)
  assert.match(src, /height: '88px', padding: '10px'/)
  assert.match(src, /Lo que pasó y no entra en un número/)
  assert.match(src, /height: '38px', border: 0, borderRadius: '6px', background: C\.marca/)
  assert.match(src, /Guardar el parte/)
  assert.equal(/Equipos en la obra hoy|novedad_destino|DESTINOS_NOVEDAD/.test(src), false, 'volvió lo que la 06 no dibuja')
})

test('la M08 tiene la fecha grande con cuadros de 44, el input de 84×36, la gente de 56 con el cuadro de 64 y la primaria de 48 sobre la barra', () => {
  const src = cliente()
  assert.match(src, /width: '44px', height: '44px'/)
  assert.match(src, /height: '36px', width: '84px'/)
  assert.match(src, /minHeight: '56px'/)
  assert.match(src, /height: '36px', width: '64px'/)
  assert.match(src, /height: '48px'/)
  assert.match(src, /Registrar el parte/)
  assert.match(src, /no se registra/)
  assert.match(src, /Frentes en curso/)
})

test('los data-testid del contrato: renglón, producción, comentario y la primaria', () => {
  const src = cliente()
  assert.match(src, /data-testid=\{`parte-renglon-\$\{r\.id\}`\}/)
  assert.match(src, /data-testid=\{`parte-produccion-\$\{r\.id\}`\}/)
  assert.match(src, /data-testid=\{`parte-comentario-\$\{r\.id\}`\}/)
  assert.match(src, /data-testid="form-ejecucion-enviar"/)
})

test('sin clima y sin estado elegido: el dueño los retiró; el estado se deriva de los partes', () => {
  const src = cliente()
  assert.equal(/name="clima"|Clima</.test(src), false, 'volvió el clima al parte')
  assert.equal(/cambiarEstado|name="estado"/.test(src), false, 'volvió un selector de estado')
})

test('el servidor lee sólo lo que la 06 dibuja: el plantel asignado; nada de herramientas, equipos ni resumen de partes', () => {
  const src = servidor()
  assert.match(src, /getAsignaciones/)
  assert.equal(/movimientos_herramienta|from\('herramientas'\)|getActivosEnObra|getEquiposDePartes|getGenteDePartes|getResumenPartes/.test(src), false)
})
