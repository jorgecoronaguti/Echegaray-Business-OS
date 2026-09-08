import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// ═══ QUÉ DEFECTO ATRAPA ═══
//
// El modificador de opacidad de Tailwind (`border-ink/30`, `from-ink/15`, `bg-neg-soft/50`) NO
// funciona sobre un color declarado como `var(--os-ink)`: el alfa tiene que entrar ADENTRO de la
// función de color y ahí ya hay una variable opaca. Tailwind no avisa — emite la regla con el color
// PLENO o no la emite. Medido en `CAMPO` (src/shared/components/ds/Controles.tsx): el borde de foco
// que el diseño pide al 30% se pintaba al 100%, y el degradé al 15% no existía en el CSS compilado.
//
// El arreglo es declarar cada color del tema como `rgb(var(--os-x-rgb) / <alpha-value>)`, con los
// canales sueltos publicados en `globals.css`. Eso deja DOS declaraciones del mismo color —el hex
// de siempre, que consume el CSS y los `style` en línea, y los canales, que consume Tailwind—, y
// dos declaraciones del mismo valor se separan solas el día que alguien cambia una.
//
// Este test lee los dos archivos y exige las dos cosas:
//   1 · ningún color del tema declarado sin `<alpha-value>` (si vuelve a entrar uno plano, rojo);
//   2 · cada `--os-x-rgb` existe y dice EXACTAMENTE lo mismo que su `--os-x` en hexadecimal.
//
// Es un test de texto a propósito: el defecto no rompe ninguna pantalla —todo se ve, sólo que con
// el color equivocado— y no hay valor de retorno que mirar. Lo único que lo delata es la
// declaración. Mismo criterio que `navegacion-sin-anchor-crudo.test.ts`.

const CONFIG = fileURLToPath(new URL('../../tailwind.config.ts', import.meta.url))
const CSS = fileURLToPath(new URL('./globals.css', import.meta.url))

/** El bloque `colors: { … }` de la config, con las llaves balanceadas. */
function bloqueDeColores(config: string): string {
  const arranque = config.indexOf('colors: {')
  assert.notEqual(arranque, -1, 'tailwind.config.ts tiene que declarar un bloque `colors`')
  let nivel = 0
  for (let i = config.indexOf('{', arranque); i < config.length; i++) {
    if (config[i] === '{') nivel++
    else if (config[i] === '}' && --nivel === 0) return config.slice(arranque, i + 1)
  }
  throw new Error('el bloque `colors` de tailwind.config.ts no cierra')
}

/** `#1f1f1e` → `31 31 30`. Sólo hex de seis dígitos: el tema no usa otra forma. */
function canalesDe(hex: string): string {
  const n = parseInt(hex.slice(1), 16)
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`
}

const CON_ALFA = /^rgb\(var\(--os-([a-z0-9-]+)-rgb\) \/ <alpha-value>\)$/

/**
 * Los reparos, en texto. Función pura sobre los DOS textos para poder probarla con un config roto
 * a mano: un control que no puede dar rojo no controla nada.
 */
export function reparosDeTema(config: string, css: string): string[] {
  const reparos: string[] = []
  const bloque = bloqueDeColores(config)

  for (const [, valor] of bloque.matchAll(/'([^']*)'/g)) {
    const m = CON_ALFA.exec(valor)
    if (!m) {
      reparos.push(`color del tema sin \`<alpha-value>\`: '${valor}' — el modificador de opacidad`
        + ' (text-x/60) se va a pintar pleno o no va a generar regla')
      continue
    }
    const token = m[1]
    const canales = new RegExp(`--os-${token}-rgb:\\s*([0-9]+ [0-9]+ [0-9]+)\\s*;`).exec(css)
    if (!canales) {
      reparos.push(`\`--os-${token}-rgb\` no está declarada en globals.css: la clase no va a pintar nada`)
      continue
    }
    const hex = new RegExp(`--os-${token}:\\s*(#[0-9a-fA-F]{6})\\s*;`).exec(css)
    if (!hex) {
      reparos.push(`\`--os-${token}\` no está declarada en globals.css con un hex de seis dígitos`)
      continue
    }
    const esperado = canalesDe(hex[1])
    if (canales[1] !== esperado) {
      reparos.push(`\`--os-${token}\` dice ${hex[1]} (= ${esperado}) y \`--os-${token}-rgb\` dice`
        + ` ${canales[1]}: el mismo color declarado dos veces y distinto`)
    }
  }
  return reparos
}

test('cada color del tema admite el modificador de opacidad y coincide con su hex', () => {
  const reparos = reparosDeTema(readFileSync(CONFIG, 'utf8'), readFileSync(CSS, 'utf8'))
  assert.deepEqual(reparos, [])
})

test('el bloque colors declara los colores del tema, no dos strings sueltos', () => {
  // Si mañana el bloque se arma con una función (`c('ink')`), el barrido de arriba no ve ningún
  // literal y pasa VACÍO — verde por no haber mirado nada. Este piso lo impide.
  const bloque = bloqueDeColores(readFileSync(CONFIG, 'utf8'))
  const literales = [...bloque.matchAll(/'([^']*)'/g)].length
  assert.ok(literales >= 20, `el bloque \`colors\` declara ${literales} colores literales: son 24`)
})

test('el control puede dar rojo', () => {
  const css = readFileSync(CSS, 'utf8')
  const plano = "colors: { ink: 'var(--os-ink)' }"
  assert.match(reparosDeTema(plano, css)[0] ?? '', /sin `<alpha-value>`/)

  const inexistente = "colors: { ink: 'rgb(var(--os-inventado-rgb) / <alpha-value>)' }"
  assert.match(reparosDeTema(inexistente, css)[0] ?? '', /no está declarada/)

  const desfasado = css.replace('--os-ink-rgb: 31 31 30;', '--os-ink-rgb: 31 31 99;')
  const bueno = "colors: { ink: 'rgb(var(--os-ink-rgb) / <alpha-value>)' }"
  assert.match(reparosDeTema(bueno, desfasado)[0] ?? '', /declarado dos veces y distinto/)
  assert.deepEqual(reparosDeTema(bueno, css), [])
})
