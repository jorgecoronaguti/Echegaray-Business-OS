import { test, expect } from '@playwright/test'
import { entrar, conBase, OBRA } from './util/obras-e2e'

// EL DEFECTO QUE ESTE TEST REPRODUCE (19/08/2026). El dueño, con captura: guarda la obra, la pantalla
// dice "Obra guardada." y AL MISMO TIEMPO sigue el cartel "Cargando…", y el cambio no se ve hasta
// recargar a mano. Dos fallas distintas en el mismo gesto:
//   1. el indicador global se prende con CUALQUIER submit y sólo se apaga al cambiar de ruta — un
//      guardado en el lugar no cambia de ruta, así que queda corriendo hasta el límite de 2 minutos;
//   2. el valor nuevo no se refleja sin recargar.
// Se prueba sobre `ubicacion`, que es un campo libre, y se restaura al terminar.
const MARCA = 'ZZ-E2E ubicacion'

test('guardar la obra apaga el indicador y muestra el cambio sin recargar', async ({ page }) => {
  await entrar(page)
  await page.goto(`/obras/${OBRA}?vista=resumen`)
  const editar = page.getByText('Editar la obra')
  await editar.click()
  const campo = page.locator('input[name="ubicacion"]')
  await expect(campo).toBeVisible({ timeout: 30000 })
  const original = await campo.inputValue()
  const nuevo = `${MARCA} ${Date.now()}`
  await campo.fill(nuevo)
  await page.getByRole('button', { name: /Guardar la obra/i }).click()

  // 1 · el sistema confirma
  await expect(page.getByText('Obra guardada.')).toBeVisible({ timeout: 30000 })
  // 2 · y DEJA de decir que está cargando: el guardado terminó
  await expect(page.getByTestId('indicador-navegacion')).toBeHidden({ timeout: 15000 })
  // 3 · y el valor nuevo está en la pantalla sin que nadie recargue
  await expect(campo).toHaveValue(nuevo)

  // RESTAURO, Y LO VERIFICO EN LA BASE — NO CONTRA EL MENSAJE DE LA PANTALLA.
  //
  // "Obra guardada." del primer guardado sigue visible, así que esperarlo otra vez pasa al instante y
  // la comprobación corre antes de que la segunda escritura llegue. Se consulta el destino hasta que
  // dice lo que tiene que decir: el efecto, no el cartel que dijo que sí.
  await campo.fill(original)
  await page.getByRole('button', { name: /Guardar la obra/i }).click()
  const sb = await conBase()
  await expect.poll(async () => {
    const { data } = await sb.from('obra_canonica').select('ubicacion').eq('id', OBRA).single()
    return data?.ubicacion ?? ''
  }, { timeout: 30000 }).toBe(original)
})
