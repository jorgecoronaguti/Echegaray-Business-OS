/**
 * TAREA REAL Nº1 DEL DEV ROUTER — poner al día `tests/liquidacion-fidelidad.spec.ts`.
 *
 * POR QUÉ ÉSTA, de las tres candidatas del dueño:
 *   · el `console.error` de WebSocket tras un revalidate necesita navegador y app viva — no hay
 *     node_modules en este worktree y el dueño está operando: no se puede verificar acá.
 *   · el timer `_UOCRA_RAW` → `uocra_escala` toca el Sheet real de Google y escribe en Postgres:
 *     es D3 por dos motivos y estaba explícitamente fuera de alcance.
 *   · ésta modifica código real, está pendiente de verdad (quedó vieja el 15 y el 16/09) y tiene
 *     un resultado VERIFICABLE sin navegador, sin base y sin tocar producción.
 *
 * QUIÉN LA HACE: un modelo del Hub por Inference Providers, con `CLAUDE_UNAVAILABLE=1`.
 * Claude no puede llamarse. Si el modelo no la saca, la tarea queda bloqueada y persistida.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { ejecutorHF } from '../ejecutores.mjs'
import { tramo } from '../contexto.mjs'
import { tests, sintaxisTS, diff } from '../verificar.mjs'

const SPEC = 'tests/liquidacion-fidelidad.spec.ts'
const GRILLA = 'src/features/administracion/components/liquidacion/GrillaEspejoQuincena.tsx'
const INVARIANTE = 'src/features/administracion/components/liquidacion/cuadro/e2eAlDia.test.mjs'

const ANCLA_INICIO = "    const tabla = page.getByTestId('espejo-encabezado')"
const ANCLA_FIN = '    // LA FILA DE TOTAL:'

/** El bloque exacto del spec que hay que poner al día. Se localiza por ancla, no por número de línea. */
export function bloqueActual(raiz) {
  const texto = readFileSync(path.join(raiz, SPEC), 'utf8')
  const a = texto.indexOf(ANCLA_INICIO)
  const b = texto.indexOf(ANCLA_FIN, a)
  if (a === -1 || b === -1) throw new Error('no se encontró el bloque por sus anclas')
  return { texto, a, b, bloque: texto.slice(a, b) }
}

/** CONTEXTO MÍNIMO: el tramo de `PLATA`, los rótulos del pie y el bloque a corregir. Nada más. */
export function contextoDeLaTarea(raiz) {
  const grilla = readFileSync(path.join(raiz, GRILLA), 'utf8')
  const iPlata = grilla.slice(0, grilla.indexOf('const PLATA')).split('\n').length
  const iFin = grilla.slice(0, grilla.indexOf('const ANCHO_DE_BANDA')).split('\n').length
  const plata = tramo(raiz, GRILLA, { desde: iPlata, hasta: iFin })
  const pie = [...grilla.matchAll(/cifra\('([^']+)'/g)].map((m) => m[1])
  const { bloque } = bloqueActual(raiz)
  return {
    fragmentos: [
      { ruta: GRILLA, texto: `COLUMNAS QUE EL CUADRO DIBUJA HOY (fuente de verdad):\n${plata.texto}\n\nRÓTULOS QUE EL PIE SABE DIBUJAR:\n${[...new Set(pie)].join(', ')}` },
      { ruta: SPEC, texto: `BLOQUE DEL SPEC A CORREGIR (tal cual está hoy):\n${bloque}` },
    ],
    bloque,
    tokensAprox: Math.round((plata.texto.length + bloque.length + pie.join('').length) / 4),
  }
}

const INSTRUCCION = `Este bloque de un test de Playwright quedó viejo: enumera columnas que el componente ya no dibuja y se olvida de otras que sí dibuja.

Reescribí el bloque entero para que:
1. La lista del \`for (const c of [...])\` del encabezado enumere EXACTAMENTE los rótulos de la constante PLATA, en su mismo orden, SIN el carácter ✎, y con 'Persona' al principio.
2. Las aserciones de orden con \`i('...')\` usen sólo rótulos que existan en PLATA.
3. La lista del \`for (const p of [...])\` del pie use sólo rótulos de la lista del pie.
4. No cambies el estilo, los comentarios podés actualizarlos, y no toques nada fuera del bloque.

Respondé ÚNICAMENTE con el bloque TypeScript corregido, empezando en "    const tabla = page.getByTestId('espejo-encabezado')". Sin \`\`\`, sin explicación, sin texto antes ni después.`

/** Limpia el vallado de markdown si el modelo lo puso igual. */
function limpiar(s) {
  return s.replace(/^\s*```[a-z]*\n/i, '').replace(/\n```\s*$/i, '').replace(/^\s*```\s*$/gm, '').trimEnd()
}

/** Arma la tarea que `correrTarea()` va a ejecutar. */
export function tarea(raiz, { modelo, proveedor = null } = {}) {
  const ctx = contextoDeLaTarea(raiz)
  const restaurar = () => execFileSync('git', ['checkout', '--', SPEC], { cwd: raiz })

  return {
    id: `spec-liq-${modelo.split('/').pop()}`,
    titulo: 'poner al día el bloque del cuadro en tests/liquidacion-fidelidad.spec.ts',
    objetivo: 'que el spec enumere las columnas que el componente dibuja hoy, ni una de más ni una de menos',
    categoria: 'correccion-post-test',
    archivos: [SPEC],
    contextoTokens: ctx.tokensAprox,
    revertir: restaurar,
    intentos: {
      // No hay ejecutor determinístico para esta tarea: la lista correcta hay que DERIVARLA del
      // componente y reescribir prosa de aserciones. Se deja explícito en vez de fingir un D0.
      hf: async ({ reparacion, ultimoFallo }) => {
        const extra = ultimoFallo
          ? `\n\nTU INTENTO ANTERIOR FALLÓ. El verificador dijo, textual:\n${ultimoFallo.cola}\nCorregí exactamente eso.`
          : ''
        const r = await ejecutorHF({
          modelo, proveedor, instruccion: INSTRUCCION + extra, fragmentos: ctx.fragmentos, maxTokens: 2600,
        })
        if (!r.ok) return r
        const salida = limpiar(r.salida)
        if (!salida.startsWith("    const tabla = page.getByTestId('espejo-encabezado')")) {
          return { ...r, ok: false, porQue: `el modelo no devolvió el bloque pedido (empieza con: ${JSON.stringify(salida.slice(0, 70))})` }
        }
        const { texto, a, b } = bloqueActual(raiz)
        writeFileSync(path.join(raiz, SPEC), `${texto.slice(0, a)}${salida}\n\n${texto.slice(b)}`)
        return { ...r, edicion: { ruta: SPEC, bytes: salida.length }, reparacion }
      },
    },
    plan: [
      () => tests(raiz, [INVARIANTE]),
      () => sintaxisTS(raiz, SPEC),
      () => diff(raiz),
    ],
  }
}
