import { test, expect, type Page } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { conBase, entrar, laFila } from './util/obras-e2e'

// LA CONVERSACIÓN DEL PRESUPUESTO · PROBADA CONTRA LA BASE, NO CONTRA LA PANTALLA.
//
// ═══ QUÉ PRUEBA ═══
//
// El circuito entero de la pantalla 15: se TIPEA una frase, el intérprete la vuelve una intención,
// el command layer la autoriza y la valida, y la fila cambia en Postgres. Cada afirmación se cierra
// leyendo el DESTINO —`cotizacion_partida.cantidad`, `cotizaciones.congelada_en`—, nunca el mensaje
// que la pantalla devolvió. Que el panel diga «Aplicado» no prueba que algo se aplicó.
//
// Cubre los cuatro defectos que el QA visual encontró el 29/08/2026 y que hasta hoy sólo tenían
// tests de estructura:
//
//   · el input mandaba `texto=''` porque `onSubmit` limpiaba en carrera → acá se TIPEA de verdad;
//   · el foco no volvía al campo → se verifica que el input quede enfocado después de enviar;
//   · el gate de congelar era decorativo → se fuerza el congelado y se lee `congelada_en`;
//   · «sanitaria 8,5M» tenía que preguntar y no escribir → se verifica que la fila no cambió.
//
// ═══ QUÉ NO PRUEBA ═══
//
// **El camino del modelo.** Todas las frases de este recorrido son de las que el intérprete
// determinístico resuelve. Que eso sea así se verifica con `origen-modelo`: el panel lo dibuja
// cuando la intención la dedujo el modelo, así que su ausencia prueba que TODO salió de la
// gramática.
//
// El canario ANTERIOR era la ausencia de `conversacion-degradada`, y la auditoría delta lo tumbó:
// ese cartel sólo aparece cuando el modelo se llamó Y FALLÓ. Un modelo que se llama y contesta bien
// lo deja ausente igual, así que la aserción era compatible con lo contrario de lo que afirmaba —
// un control que no puede decir que no. El de ahora mira el ORIGEN de la intención, que es el dato
// que distingue los dos casos.
//
// Lo que sigue sin probarse es el camino del modelo EN SÍ: sigue siendo el límite del DoD.
//
// ═══ POR QUÉ EL PRESUPUESTO SE CREA POR LA BASE ═══
//
// El alta de presupuesto y el alta de partida tienen sus propias pantallas. Lo que se prueba acá es
// la CONVERSACIÓN: armar el escenario por pantalla sumaría diez pasos que, cuando se rompan, van a
// dar rojo en este archivo acusando a la conversación de algo que no hizo. Mismo criterio que
// `obras-alta-y-preparacion.spec.ts` usa con su cliente.
//
// ═══ LA MARCA ES PROPIA DE ESTE RECORRIDO ═══
//
// Todos los worktrees comparten UNA base y varios agentes corren la suite a la vez. Un barrido por
// `%ZZ-E2E%` de otro spec le llevaría puestas las filas a éste a la mitad — ya pasó, y el modo de
// falla es rojo sin defecto apuntando a la línea equivocada.
const MARCA = 'ZZE2E-CONVERSACION'

/** La partida del escenario. El nombre lleva la marca a propósito: `coincide()` del command layer
 *  busca por inclusión, y un nombre común haría match con partidas de otros presupuestos. */
const PARTIDA = 'Mamposteria zze2e de ladrillo hueco'

interface Escenario { cotizacionId: string; partidaId: string; numero: string }

async function limpiar(sb: SupabaseClient) {
  const { data } = await sb.from('cotizaciones').select('id').ilike('numero', `${MARCA}%`)
  for (const c of data ?? []) {
    // `cotizacion_partida` y `cotizacion_alcance` cascadean, pero se borran igual: si mañana alguno
    // deja de hacerlo, esto sigue limpiando en vez de dejar basura en la cartera que mira el dueño.
    await sb.from('cotizacion_alcance').delete().eq('cotizacion_id', c.id)
    await sb.from('cotizacion_partida').delete().eq('cotizacion_id', c.id)
    await sb.from('cotizaciones').delete().eq('id', c.id)
  }
}

/**
 * EL ESCENARIO: un presupuesto con UNA partida valorizada y otra que bloquea.
 *
 * La primera tiene costo unitario, así que aporta precio y la cascada da un número: sin eso el gate
 * bloquearía por «SIN_PRECIO_CALCULABLE» y el paso del gate probaría otra cosa. La segunda no tiene
 * composición, y es la que mantiene un bloqueante vivo.
 */
async function montar(sb: SupabaseClient): Promise<Escenario> {
  const numero = `${MARCA}-${Date.now()}`
  const { data: cot, error } = await sb.from('cotizaciones').insert({
    numero, version: 1, vigente: false, estado: 'borrador',
    obra_nombre: `${MARCA} Ampliacion de panol`,
    pct_gastos_generales: 0.27, pct_beneficio: 0.15, pct_financiero: 0.02, factor_financiero: 0.5,
    pct_iibb: 0.035, pct_ganancias: 0.015, pct_cheque: 0.012, pct_iva: 0.21,
  }).select('id').single()
  if (error) throw new Error(`no pude crear el presupuesto de prueba: ${error.message}`)

  const { data: p, error: eP } = await sb.from('cotizacion_partida').insert({
    cotizacion_id: cot.id, orden: 1, rubro: 'Albanileria',
    codigo: 'ZZE2E-01', descripcion: PARTIDA, cantidad: 480, unidad: 'm2', costo_unitario: 25000,
  }).select('id').single()
  if (eP) throw new Error(`no pude crear la partida de prueba: ${eP.message}`)

  // La que bloquea: sin composición y sin costo. Es lo que hace que el gate diga que no.
  await sb.from('cotizacion_partida').insert({
    cotizacion_id: cot.id, orden: 2, rubro: 'Instalaciones',
    codigo: 'ZZE2E-02', descripcion: 'Instalacion sanitaria zze2e', cantidad: 1, unidad: 'gl',
  })

  return { cotizacionId: cot.id, partidaId: p.id, numero }
}

/** La cantidad que hay EN LA BASE. Es el único lugar donde se comprueba que algo se aplicó. */
async function cantidadEnBase(sb: SupabaseClient, partidaId: string): Promise<number | null> {
  const { data } = await sb.from('cotizacion_partida').select('cantidad').eq('id', partidaId).maybeSingle()
  return laFila(data, 'la partida de prueba').cantidad
}

/**
 * TIPEAR Y ENVIAR — con el teclado, no con `fill`.
 *
 * `fill()` setea el valor de una: no reproduce el defecto que el QA encontró, donde lo tipeado se
 * perdía entre la captura del FormData y la limpieza del input. `pressSequentially` escribe tecla
 * por tecla y `Enter` envía el formulario nativo, que es exactamente lo que hace una persona.
 */
async function decir(page: Page, frase: string) {
  const campo = page.getByTestId('entrada-conversacion')
  await campo.click()
  await campo.pressSequentially(frase, { delay: 8 })
  await expect(campo).toHaveValue(frase)
  await campo.press('Enter')
  await expect(page.getByTestId('respuesta-conversacion')).toBeVisible({ timeout: 20000 })
}

test.describe('conversación del presupuesto', () => {
  test.describe.configure({ mode: 'serial' })

  test('se le habla al presupuesto y la fila cambia en la base', async ({ page }) => {
    test.setTimeout(180_000)
    const sb = await conBase()
    await limpiar(sb)
    const esc = await montar(sb)

    try {
      await entrar(page)
      await page.goto(`/presupuestos/${esc.cotizacionId}`)
      await expect(page.getByTestId('conversacion')).toBeVisible({ timeout: 30000 })

      // ── 1 · «¿qué me falta para enviar?» — una CONSULTA, tipeada
      await decir(page, 'q me falta para enviar')
      await expect(page.getByTestId('respuesta-conversacion')).toHaveAttribute('data-tono', 'dato')
      await expect(page.getByTestId('bloqueos-conversacion')).toBeVisible()
      // El bloqueo que se ve es el de la partida sin composición, nombrada por su código.
      await expect(page.getByTestId('bloqueos-conversacion')).toContainText('ZZE2E-02')

      // EL CANARIO: `origen-modelo` se dibuja cuando la intención la dedujo el modelo. Su ausencia
      // prueba que esto salió de la gramática — a diferencia de `conversacion-degradada`, que sólo
      // aparece si el modelo falló y por lo tanto no distinguía «no se llamó» de «contestó bien».
      await expect(page.getByTestId('origen-modelo')).toHaveCount(0)
      await expect(page.getByTestId('conversacion-degradada')).toHaveCount(0)

      // EL FOCO VUELVE AL CAMPO. Era `false` antes del arreglo: había que hacer clic para seguir.
      await expect(page.getByTestId('entrada-conversacion')).toBeFocused()
      await expect(page.getByTestId('entrada-conversacion')).toHaveValue('')

      // ── 2 · la mutación: 480 → 520 m², CON el outlier de por medio.
      //
      // Mueve $1.000.000 sobre un costo conocido de $12.000.000 — más del 2 % de materialidad—, así
      // que el §20 manda preguntar antes de aplicar y NO aplicar solo. El primer intento tiene que
      // dejar la fila intacta: un cambio material que se aplica y después se pregunta ya movió el
      // precio, que es exactamente lo que el outlier engine existe para impedir.
      expect(await cantidadEnBase(sb, esc.partidaId)).toBe(480)
      await decir(page, `la ${PARTIDA} son 520 m2`)
      await expect(page.getByTestId('respuesta-conversacion')).toHaveAttribute('data-tono', 'pregunta')
      await expect(page.getByTestId('pregunta-conversacion')).toContainText('¿Lo aplico igual?')
      expect(await cantidadEnBase(sb, esc.partidaId)).toBe(480)

      // Y recién con el «sí» explícito, se aplica.
      await page.getByTestId('confirmar-outlier').click()
      await expect(page.getByTestId('cambios-conversacion')).toContainText('520', { timeout: 20000 })

      // ═══ EL EFECTO, NO EL MENSAJE ═══
      expect(await cantidadEnBase(sb, esc.partidaId)).toBe(520)

      // Y la fila de la pantalla, releída de cero: la tabla muestra lo mismo que la base. La
      // cantidad vive en una celda EDITABLE, así que se lee su valor y no el texto de la fila.
      await page.reload()
      const fila = page.getByRole('row', { name: /ZZE2E-01/ })
      await expect(fila.getByRole('textbox', { name: 'cantidad' })).toHaveValue('520')
      // EL RECÁLCULO, que es la mitad del punto: 520 × $25.000 = $13.000.000. Si la cantidad
      // cambiara sin que el subtotal la siga, el presupuesto estaría publicando un precio viejo.
      await expect(fila).toContainText('13.000.000')

      // ── 3 · «sanitaria 8,5M» — AMBIGUO: pregunta y NO escribe (§19)
      const { data: antes } = await sb.from('cotizacion_partida')
        .select('subcontratada, precio_subcontrato').eq('cotizacion_id', esc.cotizacionId)
        .eq('codigo', 'ZZE2E-02').maybeSingle()
      await decir(page, 'sanitaria zze2e 8,5M')
      await expect(page.getByTestId('pregunta-conversacion')).toBeVisible()
      await expect(page.getByTestId('pregunta-conversacion')).toContainText(/[Qq]ui[eé]n/)
      // Y el motivo NO repite el rubro dos veces («sanitaria sanitaria 8,5M»), que fue el QA 6.
      await expect(page.getByTestId('respuesta-conversacion')).not.toContainText('zze2e sanitaria zze2e')

      const { data: despues } = await sb.from('cotizacion_partida')
        .select('subcontratada, precio_subcontrato').eq('cotizacion_id', esc.cotizacionId)
        .eq('codigo', 'ZZE2E-02').maybeSingle()
      expect(despues).toEqual(antes)
    } finally {
      await limpiar(sb)
      await sb.auth.signOut({ scope: 'local' })
    }
  })

  test('con un bloqueante vivo, congelar no se ofrece y forzarlo rebota', async ({ page }) => {
    test.setTimeout(180_000)
    const sb = await conBase()
    await limpiar(sb)
    const esc = await montar(sb)

    try {
      await entrar(page)
      await page.goto(`/presupuestos/${esc.cotizacionId}`)

      // El gate del motor, dibujado: dice que NO y dice por qué.
      const gate = page.getByTestId('gate-freeze')
      await expect(gate).toBeVisible({ timeout: 30000 })
      await expect(gate).toHaveAttribute('data-ready', '0')
      await expect(page.getByTestId('gate-porque')).toContainText('NO se congela')
      await expect(page.getByTestId('issue-cola').first()).toBeVisible()

      // EL BOTÓN NO SE OFRECE, y el motivo va en el `title` — no en un disabled mudo.
      const boton = page.getByTestId('congelar')
      await expect(boton).toBeDisabled()
      await expect(boton).toHaveAttribute('title', /NO se congela/)

      // ═══ EL INTENTO FORZADO ═══
      //
      // La pantalla es la cerradura barata; la de verdad es la base. Se llama directo al RPC con la
      // sesión del usuario —lo mismo que haría un POST que se saltea la pantalla— y tiene que
      // rebotar. Sin este paso, lo único probado sería que el botón está gris.
      const forzado = await sb.rpc('cot_congelar_con_gate', {
        p_cotizacion_id: esc.cotizacionId,
        p_sha256: 'sha-forzado-e2e', p_partes: {}, p_resumen: 'intento forzado',
      })
      expect(forzado.error?.message ?? '').toMatch(/no se puede congelar/)

      // Y LA FILA, que es lo que prueba que no pasó nada.
      const { data } = await sb.from('cotizaciones').select('congelada_en').eq('id', esc.cotizacionId).maybeSingle()
      expect(laFila(data, 'el presupuesto de prueba').congelada_en).toBeNull()

      // La pantalla, recargada, sigue diciendo lo mismo: no quedó un estado a medias.
      await page.reload()
      await expect(page.getByTestId('gate-freeze')).toHaveAttribute('data-ready', '0')
    } finally {
      await limpiar(sb)
      await sb.auth.signOut({ scope: 'local' })
    }
  })
})
