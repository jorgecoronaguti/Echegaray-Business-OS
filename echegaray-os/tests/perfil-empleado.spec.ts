// EL PERFIL EMPLEADO, EN EL NAVEGADOR — con una persona vinculada y datos de verdad.
//
// Lo que mide `perfil-empleado-rls.spec.ts` es la cerradura. Esto mide la PUERTA: que las catorce
// pantallas abran, que la barra de tres contextos funcione, que el teléfono no se corra de costado
// y —sobre todo— que las dos escrituras que el empleado sí puede hacer lleguen a Postgres.
//
// LA EVIDENCIA ES DEL EFECTO. Cada escritura se comprueba leyendo la fila con la clave de servicio,
// no mirando el cartelito verde de la pantalla: una pantalla que dice «guardado» sin haber guardado
// es exactamente el defecto que estos tests existen para atrapar.

import { test, expect, type Page } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { CAMPO, servicio } from './util/identidades'
import { entrarComo } from './util/login'
import { montar, limpiar, type Escenario } from './util/empleado'

let admin: SupabaseClient
let esc: Escenario

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  admin = servicio()
  esc = await montar(admin)
})

test.afterAll(async () => { await limpiar(admin) })

async function entrar(page: Page) {
  await entrarComo(page, CAMPO.email, CAMPO.password)
}

test('el empleado aterriza en HOY y ve su obra, su cuadrilla y su trabajo', async ({ page }) => {
  await entrar(page)
  // El middleware lo trae acá desde cualquier ruta que no sea suya: es su pantalla de inicio.
  await expect(page).toHaveURL(/\/hoy/)

  await expect(page.getByTestId('mi-obra')).toContainText('ZZ-EMPLEADO Obra')
  await expect(page.getByTestId('mi-obra')).toContainText('Ruta 5 km 12')
  await expect(page.getByTestId('mi-cuadrilla')).toContainText('ZZ-EMPLEADO Cuadrilla')
  await expect(page.getByTestId('trabajo-de-hoy')).toContainText('Muro sur')

  // PENDIENTES: el apto médico que le piden aparece aunque no haya entrado a Documentos.
  await expect(page.getByTestId('pendiente-documento')).toContainText('Apto medico')
})

test('NO SE LE MUESTRA UN SOLO NÚMERO DE LA PLATA DE LA OBRA', async ({ page }) => {
  await entrar(page)
  const texto = (await page.getByTestId('shell-empleado').textContent()) ?? ''
  for (const palabra of ['Contratado', 'Presupuesto', 'Margen', 'Certificado', 'Facturado']) {
    expect(texto, `«${palabra}» apareció en la pantalla del empleado`).not.toContain(palabra)
  }
})

test('la barra de tres contextos lleva a los tres, y marca dónde estás', async ({ page }) => {
  await entrar(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByTestId('barra-contextos')).toBeVisible()

  await page.getByTestId('nav-mi-trabajo').click()
  await page.waitForURL(/\/mi-trabajo/)
  await expect(page.getByTestId('nav-mi-trabajo')).toHaveAttribute('aria-current', 'page')

  await page.getByTestId('nav-mi-informacion').click()
  await page.waitForURL(/\/mi-informacion/)
  await expect(page.getByTestId('nav-mi-informacion')).toHaveAttribute('aria-current', 'page')

  // CAMBIO DE REGLA DECLARADO (Design 23/08) · Employee shell: la barra de contextos «se usa sólo en
  // las pantallas raíz; las de detalle llevan back en el topbar». Antes la barra seguía abajo en la
  // subpantalla y lo que se probaba era que su tab quedara encendido. Ahora la subpantalla no la
  // dibuja: lo que hay que probar es que NO deja a nadie encerrado — arriba está la flecha, con el
  // destino en su `aria-label`, y el objetivo mide 48px.
  await page.getByTestId('ir-legajo').click()
  await page.waitForURL(/\/mi-informacion\/legajo/)
  await expect(page.getByTestId('barra-contextos')).toHaveCount(0)
  await expect(page.getByTestId('topbar-detalle')).toBeVisible()
  const volver = page.getByTestId('volver')
  await expect(volver).toHaveAttribute('aria-label', 'Volver a Mi información')
  expect((await volver.boundingBox())?.height).toBeGreaterThanOrEqual(44)

  await volver.click()
  await page.waitForURL(/\/mi-informacion$/)
  await expect(page.getByTestId('barra-contextos')).toBeVisible()
})

test('el teléfono no se corre de costado en ninguna pantalla del perfil', async ({ page }) => {
  // Doce rutas, cada una compilándose por primera vez en `next dev`: el tope por defecto de 30 s no
  // alcanza y el fallo que da —«target page closed»— no se parece en nada a un desborde.
  test.setTimeout(4 * 60 * 1000)
  await entrar(page)
  await page.setViewportSize({ width: 390, height: 844 })
  const rutas = [
    '/hoy', '/mi-trabajo', '/mi-trabajo/tareas', `/mi-trabajo/tareas/${esc.actividad}`,
    '/mi-trabajo/reportar', '/mi-informacion', '/mi-informacion/legajo', '/mi-informacion/horas',
    '/mi-informacion/asistencia', '/mi-informacion/documentos',
    `/mi-informacion/documentos/${esc.documentoSolicitado}`, '/mi-informacion/recibos',
  ]
  const desbordes: string[] = []
  for (const r of rutas) {
    const res = await page.goto(r, { waitUntil: 'domcontentloaded' })
    expect(res?.status(), `${r} no abrió`).toBeLessThan(400)
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {})
    const corrimiento = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    if (corrimiento > 1) desbordes.push(`${r}: ${corrimiento}px`)
  }
  expect(desbordes, `\n${desbordes.join('\n')}\n`).toEqual([])
})

test('MI LEGAJO muestra su identidad, y su DNI', async ({ page }) => {
  await entrar(page)
  await page.goto('/mi-informacion/legajo')
  await expect(page.getByTestId('identidad')).toContainText('30111222')
  await expect(page.getByTestId('situacion-laboral')).toContainText('Oficial')
  await expect(page.getByTestId('asignaciones')).toContainText('ZZ-EMPLEADO Obra')
  // La retribución pactada no sale por la API para nadie, y menos acá.
  await expect(page.getByTestId('shell-empleado')).not.toContainText('Retribución')
})

test('REGISTRAR ENTRADA escribe en Postgres, y después ofrece la salida', async ({ page }) => {
  await entrar(page)
  const hoy = new Date()
  const fecha = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`
  await admin.from('asistencia_marca').delete().eq('persona_id', esc.yo).eq('fecha', fecha)

  await page.goto('/hoy')
  const boton = page.getByTestId('registrar-marca')
  await expect(boton).toHaveAttribute('data-tipo', 'entrada')
  await boton.click()

  // EL EFECTO EN LA BASE, no el cartel de la pantalla.
  await expect.poll(async () => {
    const { data } = await admin.from('asistencia_marca').select('tipo').eq('persona_id', esc.yo).eq('fecha', fecha)
    return (data ?? []).map((x) => x.tipo)
  }, { timeout: 15000 }).toEqual(['entrada'])

  // Y LA ACCIÓN CAMBIA. El handoff: una sola acción, «Registrar entrada → Registrar salida».
  await page.reload()
  await expect(page.getByTestId('registrar-marca')).toHaveAttribute('data-tipo', 'salida')
  await page.getByTestId('registrar-marca').click()
  await expect.poll(async () => {
    const { data } = await admin.from('asistencia_marca').select('tipo').eq('persona_id', esc.yo).eq('fecha', fecha)
    return (data ?? []).map((x) => x.tipo).sort()
  }, { timeout: 15000 }).toEqual(['entrada', 'salida'])

  // Con el día cerrado NO queda ninguna acción: ofrecer «entrada» otra vez duplicaría el día.
  await page.reload()
  await expect(page.getByTestId('registrar-marca')).toHaveCount(0)
  await expect(page.getByTestId('estado-asistencia')).toHaveAttribute('data-estado', 'completo')

  await admin.from('asistencia_marca').delete().eq('persona_id', esc.yo).eq('fecha', fecha)
})

test('REPORTAR UN PROBLEMA entra como impedimento de la actividad', async ({ page }) => {
  await entrar(page)
  await admin.from('obra_restriccion').delete().eq('obra_id', esc.obra)

  await page.goto(`/mi-trabajo/tareas/${esc.actividad}`)
  await page.getByTestId('reportar-problema').click()
  await page.waitForURL(/\/mi-trabajo\/reportar/)

  await page.getByTestId('descripcion-problema').fill('ZZ no llegaron los bloques y estamos parados')
  // «¿Frena el trabajo?» es obligatorio: sin elegir, el botón no se puede tocar.
  await expect(page.getByTestId('enviar-problema')).toBeDisabled()
  await page.getByTestId('frena-si').click()
  await page.getByTestId('enviar-problema').click()

  await expect.poll(async () => {
    const { data } = await admin.from('obra_restriccion')
      .select('descripcion, estado, frena, actividad_id, tipo').eq('obra_id', esc.obra)
    return data ?? []
  }, { timeout: 20000 }).toMatchObject([{
    estado: 'abierta', frena: true, actividad_id: esc.actividad, tipo: 'sin_clasificar',
  }])

  // Y VUELVE A APARECER DONDE IMPORTA: en Hoy, como pendiente, y en la tarea como bloqueo.
  await page.goto('/hoy')
  await expect(page.getByTestId('pendiente-impedimento')).toContainText('no llegaron los bloques')
  await page.goto(`/mi-trabajo/tareas/${esc.actividad}`)
  await expect(page.getByTestId('tarea-frenada')).toBeVisible()

  await admin.from('obra_restriccion').delete().eq('obra_id', esc.obra)
})

test('la tarea no le ofrece «marcar avance», y dice quién lo carga', async ({ page }) => {
  // Un botón que va a rebotar contra un 42501 es peor que no tenerlo: enseña que la pantalla miente.
  await entrar(page)
  await page.goto(`/mi-trabajo/tareas/${esc.actividad}`)
  await expect(page.getByTestId('quien-carga-avance')).toContainText('jefe de obra')
  await expect(page.getByTestId('shell-empleado')).not.toContainText('Marcar avance')
})

test('MIS DOCUMENTOS le pide el que falta, y no le muestra los recibos', async ({ page }) => {
  await entrar(page)
  await page.goto('/mi-informacion/documentos')
  await expect(page.getByTestId('aviso-documentos')).toContainText('1 documento')
  await expect(page.getByTestId('lista-documentos')).toContainText('Apto medico')
  // 652 de los 847 papeles del legajo son recibos: acá no van.
  await expect(page.getByTestId('lista-documentos')).not.toContainText('Recibo 2026-07')
})

test('RECIBOS: el PDF está y el importe dice que no está publicado — nunca $ 0', async ({ page }) => {
  await entrar(page)
  await page.goto('/mi-informacion/recibos')
  await expect(page.getByTestId('lista-recibos')).toContainText('Julio 2026')
  await expect(page.getByTestId('lista-recibos')).not.toContainText('$ 0')
  await page.getByTestId('fila-recibo').first().click()
  await page.waitForURL(/\/mi-informacion\/recibos\//)
  await expect(page.getByTestId('neto-sin-publicar')).toContainText('Todavía no liquidado')
  await expect(page.getByTestId('pdf-recibo')).toBeVisible()
})

test('MIS HORAS enfrenta las dos puntas sólo cuando existen las dos', async ({ page }) => {
  await entrar(page)
  await page.goto('/mi-informacion/horas?ver=mes-pasado')
  // El escenario tiene HH del 03/08 y ninguna marca de asistencia de ese mes: con una sola punta, el
  // pendiente NO se calcula. Es la regla que evita acusar a la obra de no imputar.
  await expect(page.getByTestId('sin-contraste')).toBeVisible()
})

test('el escritorio es la misma experiencia, no otra', async ({ page }) => {
  await entrar(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/hoy')
  // Los tres contextos suben al header y la barra de abajo desaparece.
  await expect(page.getByTestId('nav-hoy-desktop')).toBeVisible()
  await expect(page.getByTestId('barra-contextos')).toBeHidden()
  // Y aparece la columna derecha del handoff: pendientes, mi mes y los papeles de la obra.
  await expect(page.getByTestId('mi-mes')).toBeVisible()
  await expect(page.getByTestId('documentos-de-obra').or(page.getByTestId('sin-documentos-obra'))).toBeVisible()
})

test('una cuenta sin persona vinculada ve la explicación, no una pantalla vacía', async ({ page }) => {
  await admin.from('perfiles').update({ persona_id: null }).eq('id', esc.usuarioId)
  try {
    await entrar(page)
    await expect(page.getByTestId('sin-vinculo')).toContainText('no está vinculada')
    await page.goto('/mi-informacion/legajo')
    await expect(page.getByTestId('sin-vinculo')).toBeVisible()
  } finally {
    await admin.from('perfiles').update({ persona_id: esc.yo }).eq('id', esc.usuarioId)
  }
})
