import test from 'node:test'
import assert from 'node:assert/strict'
import { ESLint } from 'eslint'

// EL CONTROL TIENE QUE PODER DECIR QUE NO.
//
// `eslint.config.mjs` configura `@shadcn/lint` para que un agente que escribe pantalla reciba, en
// el error, el componente dueño del estilo y el token que corresponde. Una configuración así falla
// callada: si el alias del design system deja de resolver —ya pasó: `components.json` apuntaba a
// `@/components/ui`, una carpeta que no existe— el linter deja de reconocer los componentes, no
// reporta NADA, y `npm run lint` sale verde mientras el sistema visual se desarma.
//
// Este archivo le da de comer al linter código que SÍ viola cada regla y exige que la marque, y
// código que NO la viola —los tokens propios del proyecto, el `style` del patrón v2, los px
// medidos del handoff— y exige que lo deje pasar. Verde acá significa que el control puede decir
// que no; sin esto, verde sólo significaba que el control estaba mudo.

const RUTA = 'src/features/prueba/components/PruebaDelLinter.tsx'

const linter = new ESLint({ cwd: process.cwd() })

/** Sólo las reglas del sistema visual: los avisos de TypeScript sobre el fixture no vienen al caso. */
async function reglas(codigo: string): Promise<string[]> {
  const [resultado] = await linter.lintText(codigo, { filePath: RUTA })
  return resultado.messages.flatMap((m) => (m.ruleId?.startsWith('shadcn/') ? [m.ruleId] : []))
}

const IMPORTS = [
  "import { Td } from '@/shared/components/ds/Tabla'",
  "import { Num } from '@/shared/components/ds/texto'",
  "import { IconoDocumento } from '@/shared/components/iconos'",
].join('\n')

const pantalla = (cuerpo: string) => `${IMPORTS}\n\nexport function P() {\n  return ${cuerpo}\n}\n`

test('marca el color puesto desde afuera sobre un componente del design system', async () => {
  const salida = await reglas(pantalla('<Td className="text-muted">x</Td>'))
  assert.ok(
    salida.includes('shadcn/no-restyle'),
    `no-restyle no reportó: el reconocimiento de componentes está roto. Salió: ${salida.join(', ')}`
  )
})

test('marca la paleta cruda de Tailwind donde el OS tiene token', async () => {
  const salida = await reglas(pantalla('<span className="text-slate-400">x</span>'))
  assert.ok(salida.includes('shadcn/no-raw-colors'), salida.join(', '))
})

test('marca el color escrito en hex a mano', async () => {
  // El hex va partido a propósito: el barrido de colores (5f409c1c) lo reemplazó por el token y el
  // test dejó de probar lo que dice. Partido, ningún codemod lo reconoce como color.
  const salida = await reglas(pantalla('<span className="border-[#' + 'E7E6E2]">x</span>'))
  assert.ok(salida.includes('shadcn/no-arbitrary-values'), salida.join(', '))
})

test('el className armado en tiempo de ejecución es ERROR, no aviso', async () => {
  const codigo = `${IMPORTS}\n\nexport function P({ t }: { t: string }) {\n  return <Num className={\`text-[13px] \${t}\`}>1</Num>\n}\n`
  const [resultado] = await linter.lintText(codigo, { filePath: RUTA })
  const duro = resultado.messages.find((m) => m.ruleId === 'shadcn/require-static-classes')
  assert.ok(duro, resultado.messages.map((m) => m.ruleId).join(', '))
  assert.equal(duro.severity, 2)
})

// ── Y LO QUE NO SE PUEDE MARCAR ──

test('los tokens propios del proyecto NO son clases desconocidas', async () => {
  // Con Tailwind v3 el linter no puede leer el tema y `no-unknown-classes` daba 217 falsos
  // positivos sobre clases que existen. Si alguien la enciende sin migrar a v4, esto se pone rojo.
  const salida = await reglas(
    pantalla('<div className="h-fila rounded-card border-line bg-surface text-ink">x</div>')
  )
  assert.deepEqual(salida, [], `el linter marcó tokens que sí existen: ${salida.join(', ')}`)
})

test('el patrón del OS —estilo en línea con los tokens de v2— pasa', async () => {
  const salida = await reglas(
    `import { V } from '@/shared/components/v2/patron'\n\nexport function P() {\n  return <div style={{ color: V.tinta, background: V.fondo }}>x</div>\n}\n`
  )
  assert.deepEqual(salida, [], salida.join(', '))
})

test('los px medidos del handoff pasan; lo que no pasa es el color a mano', async () => {
  const salida = await reglas(
    pantalla('<span className="text-[12.5px] tracking-[-0.01em] w-[380px]">x</span>')
  )
  assert.deepEqual(salida, [], salida.join(', '))
})

test('un icono puede tomar el color de su contexto', async () => {
  const salida = await reglas(pantalla('<IconoDocumento className="text-faint" />'))
  assert.deepEqual(salida, [], salida.join(', '))
})
