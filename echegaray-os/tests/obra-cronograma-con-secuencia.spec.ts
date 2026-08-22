// EL CRONOGRAMA CON SECUENCIA DE VERDAD — el camino crítico y el arrastre, contra la base viva.
//
// Las cinco obras con actividades fechadas tienen CERO dependencias, así que el estado que se ve
// hoy es «sin secuencia». Ese estado ya lo mide `obra-cronograma-dotacion.spec.ts`. Lo que NO se
// puede probar con los datos como están es lo contrario: que en cuanto exista una secuencia, la
// pantalla deje de decir «sin secuencia», calcule el camino crítico y avise qué arrastra un
// movimiento. Sin esto, el día que alguien cargue la primera dependencia nadie se entera de que la
// pantalla se quedó en el estado vacío.
//
// ═══ SE AUTOLIMPIA, ANTES Y DESPUÉS ═══
//
// Escribe DOS dependencias en `messina`, identificadas por su par exacto (origen, destino), y las
// borra en el `finally`. También borra ANTES de empezar: una corrida interrumpida no puede dejarle
// al dueño un cronograma encadenado que él no armó.
//
// ═══ Y NO CORRE POR ACCIDENTE (21/08/2026) ═══
//
// El `finally` cubre el fallo del test, no la muerte del proceso: entre el `insert` y el `delete`
// hay una ventana en la que un `kill` deja dos dependencias que el dueño no cargó, en la obra viva,
// y sin nadie mirando. Un cronograma encadenado que apareció solo es peor que un test que no corrió.
//
// Por eso exige `E2E_ESCRIBE_EN_LA_BASE=si`. Se corre a mano, con alguien mirando; en una corrida
// automática se salta y lo dice. Es la misma lógica que el `--aplicar` de los importadores: la
// escritura sobre datos vivos no puede ser el comportamiento por defecto de nada.

import { expect, test } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { conBase, entrar } from './util/obras-e2e'

const OBRA = 'messina'
/** Encofrado de piso (2 d) → Hormigonado piso (1 d) → Desencofrado de losa (1 d). */
const ENC_PISO = 'a00e28fb-04f9-4e53-b3cf-68884820894c'
const HOR_PISO = 'dbd04ed1-49d0-4c06-8968-0f92c2ffbfe2'
const DESENC = 'a0ffb3f4-b3bc-4a35-946e-c16f3d0d6ac5'
const PARES = [[ENC_PISO, HOR_PISO], [HOR_PISO, DESENC]]

async function limpiar(sb: SupabaseClient) {
  for (const [origen, destino] of PARES) {
    await sb.from('obra_dependencia').delete().eq('obra_id', OBRA).eq('origen_id', origen).eq('destino_id', destino)
  }
}

const ESCRIBE = process.env.E2E_ESCRIBE_EN_LA_BASE === 'si'

test.skip(!ESCRIBE, 'escribe dependencias en la obra viva: correlo a mano con E2E_ESCRIBE_EN_LA_BASE=si')

test('con secuencia cargada aparece el camino crítico, y el arrastre dice qué corre', async ({ page }) => {
  test.slow()
  const sb = await conBase()
  await limpiar(sb)
  try {
    const { error } = await sb.from('obra_dependencia').insert(
      PARES.map(([origen_id, destino_id]) => ({ obra_id: OBRA, origen_id, destino_id, tipo: 'FS', lag_dias: 0 })),
    )
    expect(error, error?.message).toBeNull()

    await entrar(page)
    await page.goto(`/obras/${OBRA}/cronograma`)
    // Con dependencias, el aviso desaparece y el fin de obra deja de ser «sin secuencia».
    await expect(page.getByText('Sin secuencia cargada')).toHaveCount(0)
    await expect(page.getByTestId('kpis-obra')).not.toContainText('sin secuencia')
    await expect(page.getByTestId('cronograma')).toBeVisible()
    await page.screenshot({ path: 'capturas/07-cronograma-con-secuencia.png', fullPage: true })

    // La vista de camino crítico deja de estar vacía.
    await page.goto(`/obras/${OBRA}/cronograma?vista=critico`)
    await expect(page.getByText('No hay camino crítico que mostrar')).toHaveCount(0)
    await expect(page.getByText('Encofrado de piso')).toBeVisible()
    await page.screenshot({ path: 'capturas/07-cronograma-critico.png', fullPage: true })

    // El arrastre: mover Encofrado de piso +3 días arrastra las dos que le siguen y corre el fin.
    await page.goto(`/obras/${OBRA}/cronograma?sel=${ENC_PISO}&mover=3`)
    const popover = page.getByTestId('popover-arrastre')
    await expect(popover).toBeVisible()
    await expect(popover).toContainText('Hormigonado piso')
    await expect(popover).toContainText('Desencofrado de losa')
    await expect(popover).toContainText('Fin de obra')
    // CAMBIO DE COMPORTAMIENTO (este encargo): el popover DEJÓ DE SER una simulación ciega. Antes
    // acá se medía «todavía no escribe el plan» con los dos botones apagados; ahora escribe
    // `inicio_plan`/`fin_plan` y lo que se sigue midiendo es la promesa que hace: que la línea base
    // NO se toca. Ese texto es el contrato con quien va a apretar el botón.
    await expect(popover).toContainText('La línea base no se toca')
    await expect(popover.getByRole('button', { name: 'Mover igual' })).toBeEnabled()
    // Este test NO aprieta el botón: escribiría el plan de una obra viva, y lo único que esta
    // corrida se permite escribir son las dos dependencias que borra en el `finally`.
    await page.screenshot({ path: 'capturas/07-cronograma-arrastre.png', fullPage: true })
  } finally {
    await limpiar(sb)
    const { count } = await sb
      .from('obra_dependencia').select('id', { count: 'exact', head: true }).eq('obra_id', OBRA)
    expect(count, 'la obra tiene que quedar como estaba: sin dependencias de prueba').toBe(0)
  }
})
