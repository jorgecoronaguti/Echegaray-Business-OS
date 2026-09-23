import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// EL PARTE DIARIO DEL DISEÑO ERP OBRAS (06 a 1440 y M08 a 390, dueño 23/09/2026) — lo que se mide
// en el .html se lee en el .tsx. Cada test fija una medida o un texto que una «traducción» al
// design system volvería a perder: la grilla de 380 px del aside, el input de 62 px, los chips de
// 38 px, la primaria de 48 px del teléfono, y lo que el dueño retiró (el clima, el estado elegido).

const fuente = (f: string) => readFileSync(join(import.meta.dirname, f), 'utf8')
const cliente = () => fuente('parte/ParteDiarioCliente.tsx')
const servidor = () => fuente('parte/ParteDiario.tsx')

test('la 06 es una grilla de 1fr + aside de 380 px con 52 px de aire, sobre padding 22/30/30', () => {
  const src = cliente()
  assert.match(src, /gridTemplateColumns: 'minmax\(0,1fr\) 380px', gap: '52px'/)
  assert.match(src, /padding: '22px 30px 30px'/)
  assert.match(src, /paddingLeft: '34px', borderLeft: `1px solid \$\{C\.borde\}`/)
})

test('un renglón por frente en curso: cinco columnas, input de 62×30, fila de 60 con hairline', () => {
  const src = cliente()
  assert.match(src, /un renglón por frente en curso/)
  assert.match(src, /<div>Tarea<\/div><div>Hecho hoy<\/div><div>Acumulado<\/div><div>% ítem<\/div><div>Quién y con qué<\/div>/)
  assert.match(src, /width: '62px', height: '30px', padding: '0 9px'/)
  assert.match(src, /minHeight: '60px'/)
})

test('la bloqueada lleva el borde izquierdo de 2 px en neg, dice «bloqueada» y no tiene input', () => {
  const src = cliente()
  assert.match(src, /borderLeft: `2px solid \$\{C\.neg\}`, paddingLeft: '12px', marginLeft: '-12px'/)
  assert.match(src, /color: C\.neg \}\}>bloqueada</)
})

test('quién vino son chips de 38 px; sin marcar va en warn', () => {
  const src = cliente()
  assert.match(src, /height: '38px', padding: '0 13px'/)
  assert.match(src, /sinMarcar \? C\.warn : C\.borde/)
})

test('el aside lleva equipos de la obra, novedades de 72 px con tres destinos y la primaria de 38 px', () => {
  const src = cliente()
  assert.match(src, /Equipos en la obra hoy/)
  assert.match(src, /height: '72px', padding: '10px'/)
  assert.match(src, /Lo que pasó y no entra en un número/)
  assert.match(src, /height: '38px', border: 0, borderRadius: '6px', background: C\.marca/)
  assert.match(src, /Guardar el parte/)
})

test('la M08 tiene la fecha grande con cuadros de 44, el input de 84×36, la gente de 56 y la primaria de 48 sobre la barra', () => {
  const src = cliente()
  assert.match(src, /width: '44px', height: '44px'/)
  assert.match(src, /height: '36px', width: '84px'/)
  assert.match(src, /minHeight: '56px'/)
  assert.match(src, /height: '48px'/)
  assert.match(src, /Registrar el parte/)
  assert.match(src, /sin parte cargado/)
})

test('sin clima y sin estado elegido: el dueño los retiró; el estado se deriva de los partes', () => {
  const src = cliente()
  assert.equal(/name="clima"|Clima</.test(src), false, 'volvió el clima al parte')
  assert.equal(/cambiarEstado|name="estado"/.test(src), false, 'volvió un selector de estado')
})

test('los activos salen del modelo nuevo de Herramientas, no del espejo del Sheet', () => {
  const src = servidor()
  assert.match(src, /getActivosEnObra/)
  assert.equal(/movimientos_herramienta|from\('herramientas'\)/.test(src), false)
})
