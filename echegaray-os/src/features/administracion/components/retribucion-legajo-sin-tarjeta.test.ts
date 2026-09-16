import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// LAS REGLAS VISUALES DEL DUEÑO, VERIFICADAS CONTRA EL FUENTE DE LA SECCIÓN RETRIBUCIÓN — el mismo
// filtro que `valor-hora-legajo-sin-tarjeta.test.ts`: se mide el código, no los comentarios. Atrapa
// la regresión mecánica; el layout en 390px lo sigue firmando alguien que abrió el navegador.

const DIR = dirname(fileURLToPath(import.meta.url))
const fuente = readFileSync(join(DIR, 'RetribucionDelLegajo.tsx'), 'utf8')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\*\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((l) => !l.trim().startsWith('//'))
  .join('\n')

test('ni una tarjeta, ni una sombra, ni un gradiente, ni un hex suelto', () => {
  assert.doesNotMatch(fuente, /boxShadow|shadow-card|<Card\b|<TarjetaFicha|borderRadius/)
  assert.doesNotMatch(fuente, /gradient/i)
  const hex = fuente.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []
  assert.deepEqual(hex, [], `salió del token: ${hex.join(', ')}`)
  assert.doesNotMatch(fuente, /V\.marca/, 'el amarillo es identidad, no estado')
})

test('es un componente de servidor y el historial está a la vista, no bajo un <details>', () => {
  assert.doesNotMatch(fuente, /'use client'|useState|onClick/)
  assert.doesNotMatch(fuente, /<details/)
  assert.match(fuente, /testid="historial-negro"/)
  assert.match(fuente, /testid="historial-blanco"/)
})

test('lo que falta se escribe con su motivo: sin neto, sin tarifa, fuera del plantel — nunca $0', () => {
  assert.match(fuente, /sin neto/)
  assert.match(fuente, /sin tarifa/)
  assert.match(fuente, /fuera del plantel/)
  // La plata se escribe con el MISMO formateador que los cuadros de Liquidación, contra los que se verifica.
  assert.match(fuente, /import \{ horas, pesos \} from '.\/liquidacion\/formato'/)
  assert.doesNotMatch(fuente, /toLocaleString|new Intl/)
})

test('cada período enlaza a su quincena en Liquidación: ahí se corrige, acá se lee', () => {
  assert.match(fuente, /href=\{`\$\{hrefLiquidacion\}\$\{f\.desde\}`\}/)
})
