import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// LAS PANTALLAS DEL TELÉFONO DEL EFECTIVO — lo que un typecheck no ve y el dueño ya decidió.
//
//  1. Las decisiones del 22/09 no vuelven por un copy-paste del mockup: sin plazo («Rendís antes de»,
//     «a definir»), sin vencida, sin «valor legal … a definir», sin «Esperando revisión» (no hay
//     aprobación) y sin un formulario de devolución que la base rechaza.
//  2. Los colores salen de `tokens.ts` del teléfono, no escritos a mano (la regla de `porte-literal`).
//  3. El jefe no queda con una pantalla sin fallback de carga ni sin tiempo real.

const RAIZ = new URL('../../../..', import.meta.url).pathname

const PANTALLAS = [
  'src/app/(empleado)/mi-informacion/efectivo/page.tsx',
  'src/app/(empleado)/mi-informacion/efectivo/firmar/page.tsx',
  'src/app/(empleado)/mi-informacion/efectivo/rendir/page.tsx',
  'src/app/(empleado)/mi-informacion/efectivo/rendiciones/page.tsx',
  'src/app/(empleado)/mi-informacion/efectivo/rendiciones/[ticket]/page.tsx',
  'src/app/(empleado)/mi-informacion/efectivo/devolver/page.tsx',
  'src/app/(jefe)/obra/efectivo/page.tsx',
]
const COMPONENTES = [
  'Piezas.tsx', 'TarjetasHoy.tsx', 'FirmarConformidad.tsx', 'CamaraTicket.tsx', 'ResponderDato.tsx', 'NoCoincide.tsx',
  'EfectivoEnHoyJefe.tsx',
].map((f) => `src/features/efectivo/campo/components/${f}`)

const leer = (r: string) => readFileSync(join(RAIZ, r), 'utf8')

/** Sin comentarios: la cabecera CITA lo que se sacó, y eso es documentación, no pantalla. */
function soloCodigo(r: string): string {
  return leer(r).split('\n').filter((l) => {
    const t = l.trimStart()
    return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*') && !t.startsWith('{/*')
  }).join('\n')
}

test('las pantallas y los componentes existen donde este test los busca', () => {
  const faltan = [...PANTALLAS, ...COMPONENTES].filter((r) => !existsSync(join(RAIZ, r)))
  assert.deepEqual(faltan, [])
})

test('las decisiones del dueño del 22/09 no vuelven por el mockup', () => {
  const prohibido = [/Rendís antes de/, /a definir/i, /vencid/i, /Esperando revisión/, /Devolver y firmar/, /«aceptado»|· aceptado/, /Bloqueado/]
  const fallas: string[] = []
  for (const r of [...PANTALLAS, ...COMPONENTES]) {
    const codigo = soloCodigo(r)
    for (const p of prohibido) if (p.test(codigo)) fallas.push(`${r}: ${p}`)
  }
  assert.deepEqual(fallas, [], `\n${fallas.join('\n')}\n`)
})

test('M02 dice que la firma vale como conformidad interna', () => {
  assert.match(soloCodigo(PANTALLAS[1]), /conformidad interna/)
})

test('ninguna pantalla llama a la devolución: la registra quien recibe la plata', () => {
  const fallas = [...PANTALLAS, ...COMPONENTES, 'src/features/efectivo/campo/acciones.ts']
    .filter((r) => /registrar_devolucion_efectivo/.test(soloCodigo(r)))
  assert.deepEqual(fallas, [])
})

test('la paleta sale de tokens.ts y del kit del teléfono, no del DS de escritorio', () => {
  const fallas: string[] = []
  for (const r of [...PANTALLAS, ...COMPONENTES]) {
    const codigo = soloCodigo(r)
    const hex = codigo.match(/#[0-9A-Fa-f]{6}\b/g)
    if (hex) fallas.push(`${r}: color a mano ${[...new Set(hex)].join(', ')}`)
    if (/from '@\/shared\/components\/ds'/.test(codigo)) fallas.push(`${r}: importa el DS de escritorio`)
  }
  assert.deepEqual(fallas, [], `\n${fallas.join('\n')}\n`)
})

test('la cámara es el camino más corto: capture="environment" y galería aparte', () => {
  const c = soloCodigo('src/features/efectivo/campo/components/CamaraTicket.tsx')
  assert.match(c, /capture="environment"/)
  assert.match(c, /multiple/)
})

test('D15 tiene fallback de carga y se refresca en vivo', () => {
  assert.ok(existsSync(join(RAIZ, 'src/app/(jefe)/obra/efectivo/loading.tsx')))
  assert.match(soloCodigo(PANTALLAS[6]), /RefrescarEnVivo tablas=\{TABLAS_DE\.efectivoCampo\}/)
  assert.match(soloCodigo('src/app/(empleado)/mi-informacion/efectivo/layout.tsx'), /TABLAS_DE\.efectivoCampo/)
})

test('Hoy (empleado y jefe) muestra la tarjeta que decide `tarjetaDeHoy`', () => {
  assert.match(soloCodigo('src/app/(empleado)/hoy/page.tsx'), /tarjetaDeHoy\(/)
  assert.match(soloCodigo('src/app/(jefe)/obra/hoy/page.tsx'), /<EfectivoEnHoyJefe /)
  assert.match(soloCodigo(COMPONENTES[6]), /tarjetaDeHoy\(/)
})

// 01/10/2026 — dueño: «sólo los usuarios con nivel jefe de obra y admin rinden gastos, y admin tiene ABM de
// efectivo». La base lo aplica en `_efectivo_actua_por`; acá se fija que ninguna pantalla ofrezca rendir a
// quien la base va a rechazar, y que la migración lleve la regla.
test('rendir es de jefe de obra y Administración: las tres pantallas de rendir se cierran y los botones se esconden', () => {
  for (const r of ['rendir/page.tsx', 'rendir/sin-foto/page.tsx', 'rendir/confirmar/page.tsx']) {
    const src = leer(`src/app/(empleado)/mi-informacion/efectivo/${r}`)
    const guarda = src.indexOf('if (!ctx.puedeRendir)')
    assert.ok(guarda > 0, `${r}: falta la guarda de nivel`)
    assert.ok(guarda < src.indexOf('getMisEntregas(') || src.indexOf('getMisEntregas(') < 0, `${r}: la guarda va antes de leer datos`)
    assert.match(src.slice(guarda, guarda + 220), /<NoRinde \/>/, `${r}: sin el aviso «lo rinde Administración»`)
  }
  assert.match(leer('src/app/(empleado)/mi-informacion/efectivo/page.tsx'), /const puedeRendir = ctx\.puedeRendir && /)
  const escritorio = leer('src/app/(main)/mi-cuenta/efectivo/page.tsx')
  assert.equal((escritorio.match(/\{rinde && <BotonEnlace href="\/mi-informacion\/efectivo\/rendir/g) ?? []).length, 2)
  assert.match(leer('src/features/efectivo/campo/contexto.ts'), /puedeRendir: esAdministracion\(/)
})

test('la base cierra rendir por nivel: tener la entrega no alcanza, y el bot exige jefe de obra o Administración', () => {
  const sql = leer('supabase/migrations/20261001T0100_efectivo_reconocer_y_asignar.sql')
  const fn = sql.slice(sql.indexOf('create or replace function public._efectivo_actua_por('))
  assert.match(fn.slice(0, 900), /p_persona = public\.mi_persona_id\(\), false\) and coalesce\(public\.es_administracion\(\), false\)\)\s+or coalesce\(public\.ve_economia\(\), false\)/)
  assert.match(sql, /pf\.rol = 'jefe_obra', false\) and coalesce\(pf\.persona_id = v_persona, false\)/)
  assert.match(sql, /and not exists \(select 1 from efectivo_rendicion r0 where r0\.comprobante_id = c\.id\)/)
})
