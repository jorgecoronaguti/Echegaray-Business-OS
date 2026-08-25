import { test, expect, type Page } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { conBase, entrar, laFila } from './util/obras-e2e'

// ALTA DE OBRA EN PASOS · PROBADA CONTRA LA BASE, NO CONTRA LA PANTALLA.
//
// ═══ QUÉ PRUEBA ═══
//
// Que dar de alta una obra por pantalla DEJA UNA FILA en `obra_canonica` con lo que se tipeó y sólo
// con lo que se tipeó, que el borrador sobrevive a irse a la mitad, y que el checklist de
// preparación declara los faltantes REALES de esa obra — leídos de la base, después de recargar.
//
// El paso de recargar es el que importa. Sin él lo único que se prueba es que React pintó algo; el
// checklist podría estar mostrando el estado que él mismo supuso en vez del que hay en Postgres.
//
// ═══ POR QUÉ LA MARCA NO ES `ZZ-E2E` (19/08/2026) ═══
//
// Todos los worktrees de este repo comparten UNA base de Supabase, y varios agentes corren la suite
// a la vez. `limpiar()` de `util/obras-e2e` borra TODO lo que diga `ZZ-E2E` —clientes, sus obras, sus
// actividades— y lo corre al ENTRAR a cada recorrido. Medido acá: la obra de este test desapareció a
// la mitad, con el cliente incluido, mientras otro agente arrancaba `obras-masivas.spec.ts`.
//
// El modo de falla es el peor: rojo sin defecto, apuntando a la línea equivocada. Es la misma
// familia que el servidor de otro worktree reusado por el puerto 3000 — el test no medía lo que
// decía medir. Por eso las filas de este recorrido llevan una marca PROPIA que ningún barrido de
// `%ZZ-E2E%` alcanza, y este archivo limpia lo suyo al entrar y al salir, gane o pierda.
const MARCA = 'ZZE2E-ALTA'

// ═══ QUÉ NO PRUEBA ═══
//
// El enmascarado de la línea «Contrato» para un usuario Obras. Este recorrido entra con el usuario
// `direccion` del entorno de prueba —el único con credenciales acá— y para él la línea existe. La
// regla en sí está probada en `orquestador/lib/preparacion-obra.test.mjs` («a quien no es
// Administración no se le muestra la línea de Contrato»), y el enmascarado de la columna en Postgres
// lo cubre `tests/autorizacion-por-obra.spec.ts`. Queda declarado: falta el recorrido de navegador
// con un usuario de nivel Obras sobre esta pantalla.

/** El borrador que crea este recorrido. La marca hace el borrado inequívoco. */
const nombreObra = () => `${MARCA} Obra ${Date.now()}`

async function limpiarAlta(sb: SupabaseClient) {
  // El orden importa: `obra_canonica` no se puede borrar con hijos que no cascadeen. `obra_actividad`
  // y `obra_asignacion` sí cascadean, pero se borran igual — si mañana alguno deja de hacerlo, esto
  // sigue limpiando en vez de dejar basura en el portafolio que mira el dueño.
  const { data: obras } = await sb.from('obra_canonica').select('id').ilike('nombre', `%${MARCA}%`)
  for (const o of obras ?? []) {
    await sb.from('obra_asignacion').delete().eq('obra_id', o.id)
    await sb.from('obra_actividad').delete().eq('obra_id', o.id)
    await sb.from('obra_canonica').delete().eq('id', o.id)
  }
  await sb.from('clientes').delete().ilike('nombre_comercial', `%${MARCA}%`)
}

/** El cliente se crea por la base y no por pantalla: lo que este recorrido prueba es el alta de la
 *  OBRA, y el alta del cliente ya tiene el suyo en `obras-cliente-y-obra.spec.ts`. */
async function clienteDePrueba(sb: SupabaseClient, sufijo: number): Promise<{ id: string; nombre: string }> {
  const nombre = `${MARCA} Cliente Alta ${sufijo}`
  const { data, error } = await sb.from('clientes')
    .insert({ nombre_comercial: nombre, slug: `zze2e-alta-cliente-${sufijo}`, activo: true })
    .select('id').single()
  if (error) throw new Error(`No pude crear el cliente de prueba: ${error.message}`)
  return { id: laFila(data, 'el cliente de prueba').id as string, nombre }
}

/** El texto de una línea del checklist, tal como lo lee el dueño. */
async function linea(page: Page, clave: string) {
  const fila = page.getByTestId(`preparacion-${clave}`)
  await expect(fila).toBeVisible()
  return { listo: await fila.getAttribute('data-listo'), texto: (await fila.innerText()).replace(/\s+/g, ' ').trim() }
}

test('alta de obra en pasos: la fila queda en la base, el borrador se recupera y el checklist declara lo que falta de verdad', async ({ page }) => {
  test.setTimeout(360000)
  const sb = await conBase()
  await limpiarAlta(sb)

  const marcaTiempo = Date.now()
  const nombre = nombreObra()
  // `idDeObra` de `services/alta.ts`: minúsculas, sin acentos, no alfanumérico → guiones. Se
  // calcula acá para EXIGIRLO, no para adivinarlo: el id de la obra va en la URL y en todas las
  // imputaciones, así que la regla que lo produce es contrato y no un detalle interno.
  const obraId = nombre.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

  try {
    await entrar(page)
    const cliente = await clienteDePrueba(sb, marcaTiempo)

    // ── PASO 1 · INFORMACIÓN Y CLIENTE: acá nace la obra ────────────────────
    await page.goto('/obras/nueva')
    await expect(page.getByTestId('pasos-alta')).toBeVisible()
    const alta = page.getByTestId('form-alta-obra')
    await alta.locator('input[name="nombre"]').fill(nombre)
    await alta.locator('select[name="cliente_id"]').selectOption({ label: cliente.nombre })
    await alta.locator('input[name="ubicacion"]').fill('Rawson, San Juan')
    await page.getByTestId('form-alta-obra-enviar').click()

    // El paso guarda Y AVANZA: si el redirect del servidor no ocurriera, esto queda en rojo.
    await page.waitForURL(/paso=responsable/, { timeout: 60000 })

    // El id que produjo la aplicación es el que se esperaba: si `idDeObra` cambiara, la URL de todas
    // las obras cambiaría con él y esto lo dice antes que un enlace roto.
    expect(page.url()).toContain(`obra=${obraId}`)

    // ── LA EVIDENCIA ES EL DATO EN SU DESTINO, NO LA PANTALLA QUE DIJO QUE SÍ ──
    //
    // `monto_contratado` NO entra en este select y no es un olvido: `authenticated` no tiene grant
    // de SELECT sobre esa columna de `obra_canonica` —medido, devuelve 42501 hasta para dirección—,
    // así que pedirla haría fallar la lectura ENTERA con «permission denied». Se lee más abajo por
    // `obra_panel`, que es la única puerta por la que lo comercial sale de la base.
    const { data: fila, error: eFila } = await sb.from('obra_canonica')
      .select('id, nombre, cliente_id, estado, etapa, tipo, ubicacion, jefe_obra, fecha_inicio_plan, fecha_fin_plan, drive_carpeta_id')
      .eq('id', obraId).maybeSingle()
    expect(eFila).toBeNull()
    const obra = laFila(fila, `la obra "${obraId}"`)
    expect(obra.nombre).toBe(nombre)
    expect(obra.cliente_id).toBe(cliente.id)
    expect(obra.ubicacion).toBe('Rawson, San Juan')
    // EL BORRADOR ES `etapa='previo'` CON `estado='activa'`. `estado='previo'` lo rechaza el CHECK
    // de `20260819T0300`: si alguien lo "arregla" a como decía el pedido, el alta deja de escribir.
    expect(obra.etapa).toBe('previo')
    expect(obra.estado).toBe('activa')
    expect(obra.tipo).toBe('obra')
    // NADA SE RELLENA SOLO. Cuatro columnas que el alta NO tocó tienen que seguir en NULL: un
    // default cómodo acá se convierte en un desvío calculado contra una ficción.
    expect(obra.jefe_obra).toBeNull()
    expect(obra.fecha_inicio_plan).toBeNull()
    expect(obra.drive_carpeta_id).toBeNull()
    const { data: panel, error: ePanel } = await sb.from('obra_panel').select('monto_contratado').eq('obra_id', obraId).maybeSingle()
    expect(ePanel).toBeNull()
    expect(laFila(panel, 'la obra en obra_panel').monto_contratado).toBeNull()

    // LO COMERCIAL NO SALE DE LA TABLA, NI PARA DIRECCIÓN. El enmascarado de `obra_panel` sería
    // decorativo si cualquiera pudiera leer la columna cruda: el grant por columna es la cerradura, y
    // este caso la prueba. Si alguien corriera `grant select on obra_canonica to authenticated` para
    // "arreglar" una consulta, esto se pone rojo antes de que el monto empiece a viajar.
    const cruda = await sb.from('obra_canonica').select('monto_contratado').eq('id', obraId)
    expect(cruda.error?.code).toBe('42501')

    // ── PASO 2 · RESPONSABLE: se guarda y se avanza ─────────────────────────
    const responsable = page.getByTestId('form-paso-responsable')
    await responsable.locator('input[name="jefe_obra"]').fill(`${MARCA} Jefe`)
    await page.getByTestId('form-paso-responsable-enviar').click()
    await page.waitForURL(/paso=fechas/, { timeout: 60000 })

    const { data: conJefe } = await sb.from('obra_canonica').select('jefe_obra').eq('id', obraId).maybeSingle()
    expect(laFila(conJefe, 'la obra con jefe').jefe_obra).toBe(`${MARCA} Jefe`)

    // ── PASO 4 · CONTRATO ENVIADO EN BLANCO: TIENE QUE QUEDAR NULL, NO $0 ───
    //
    // Es el defecto que este recorrido encontró y que el esquema del alta ya corrige. Con
    // `z.coerce.number()` antes de `z.literal('')`, el campo sin tocar se guardaba como CERO, y un
    // contrato de $0 hace que el checklist anuncie «monto y fechas cargados» sobre una obra sin
    // contrato. Si alguien invierte ese orden otra vez, esto se pone rojo.
    await page.goto(`/obras/nueva?obra=${obraId}&paso=contrato`)
    await page.getByTestId('form-paso-contrato-enviar').click()
    await page.waitForURL(/paso=drive/, { timeout: 60000 })
    const { data: sinContrato } = await sb.from('obra_panel').select('monto_contratado').eq('obra_id', obraId).maybeSingle()
    expect(laFila(sinContrato, 'la obra tras el paso Contrato').monto_contratado).toBeNull()

    // ── IRSE A LA MITAD NO PIERDE NADA ──────────────────────────────────────
    // Se sale del alta y se vuelve por el link del borrador: el paso 1 ya no pide nada porque la
    // obra existe, y lo cargado sigue ahí.
    await page.goto('/obras')
    await page.goto(`/obras/nueva?obra=${obraId}&paso=informacion`)
    await expect(page.getByTestId('cuerpo-informacion')).toContainText(nombre)
    await expect(page.getByTestId('cuerpo-informacion')).toContainText(cliente.nombre)

    // ── PASO 7 · CRONOGRAMA: una actividad, sin fechas y sin HH ─────────────
    // Sin fechas a propósito: es lo que hace que el checklist tenga que distinguir «no hay
    // cronograma» de «hay cronograma sin fechas de plan», que son dos trabajos distintos.
    await page.goto(`/obras/nueva?obra=${obraId}&paso=cronograma`)
    const acts = page.getByTestId('form-alta-actividad')
    await acts.locator('input[name="nombre"]').fill(`${MARCA} Replanteo`)
    // LAS HH SE CARGAN A PROPÓSITO, y no por comodidad: `crearActividad` (services/actions.ts) tiene
    // el MISMO defecto de orden en su `numOpt` que el alta ya corrigió, así que un campo numérico en
    // blanco llega a la base como 0 en vez de NULL. Ese archivo está fuera del alcance de este
    // trabajo y queda declarado en el informe. Dejar el campo vacío acá probaría el defecto ajeno en
    // lugar de esta pantalla; el caso «0 de N con HH plan» lo cubre la prueba unitaria.
    await acts.locator('input[name="hh_plan"]').fill('40')
    await page.getByTestId('form-alta-actividad-enviar').click()
    await expect(page.getByTestId('form-alta-actividad-ok')).toBeVisible({ timeout: 60000 })

    const { count: nActs } = await sb.from('obra_actividad')
      .select('id', { count: 'exact', head: true }).eq('obra_id', obraId)
    expect(nActs).toBe(1)

    // ── PASO 8 · CONFIRMAR: el checklist, LEÍDO DE NUEVO DEL SERVIDOR ───────
    await page.goto(`/obras/nueva?obra=${obraId}&paso=confirmar`)
    await page.reload()
    await expect(page.getByTestId('checklist-preparacion')).toBeVisible()

    // Lo que esta obra tiene de verdad: una actividad sin fechas, un jefe de obra, y nada más.
    expect(await linea(page, 'cronograma')).toMatchObject({ listo: 'si' })
    expect((await linea(page, 'cronograma')).texto).toContain('1 actividad cargada')

    const base = await linea(page, 'baseline')
    expect(base.listo).toBe('no')
    expect(base.texto).toContain('sin fechas de plan')

    expect((await linea(page, 'responsable')).listo).toBe('si')
    expect((await linea(page, 'responsable')).texto).toContain(`${MARCA} Jefe`)
    expect((await linea(page, 'responsable')).texto).toContain('0 de 1 actividad con responsable')

    const personal = await linea(page, 'personal')
    expect(personal.listo).toBe('no')
    expect(personal.texto).toContain('nadie asignado a la obra')

    const contrato = await linea(page, 'contrato')
    expect(contrato.listo).toBe('no')
    expect(contrato.texto).toContain('monto contratado sin cargar')
    // LA CIFRA NO ENTRA AL CHECKLIST NI PARA ADMINISTRACIÓN — acá no hay monto cargado, así que lo
    // que se exige es que la línea no invente un «$0».
    expect(contrato.texto).not.toContain('$')

    expect((await linea(page, 'drive')).listo).toBe('no')
    expect((await linea(page, 'hh_plan')).texto).toContain('1 de 1 actividad con HH plan')

    // ── Y EL MISMO CHECKLIST EN EL RESUMEN DE LA OBRA ───────────────────────
    // Es el mismo componente con la misma lectura: si acá dijera otra cosa, habría dos verdades
    // sobre la misma obra.
    // CAMBIO DE REGLA DECLARADO (Design 23/08): en el Resumen el checklist dejó de estar PLEGADO al
    // final del cuerpo y pasó ABIERTO a la columna de contexto, al lado de las métricas cuyos «sin
    // medir» explica (pantalla 02 del Design canónico). Lo que este test prueba no cambia —que es el
    // MISMO checklist con la MISMA lectura que el del alta—, así que se saca el clic de abrir y se
    // lee la línea directamente. `preparacion-abrir` ya no existe en esta pantalla.
    await page.goto(`/obras/${obraId}?vista=resumen`)
    await expect(page.getByTestId('preparacion')).toBeVisible()
    await expect(page.getByTestId('preparacion-cuenta')).toContainText('pendientes')
    expect((await linea(page, 'personal')).texto).toContain('nadie asignado a la obra')
  } finally {
    await limpiarAlta(sb)
  }
})

test('el checklist desaparece del Resumen cuando no falta nada', async ({ page }) => {
  // Un checklist entero en ✓ no es información: ocupa lugar y enseña a no mirarlo. La obra se
  // completa POR LA BASE —lo que se prueba acá es la desaparición, no el alta— y después se lee la
  // pantalla.
  test.setTimeout(360000)
  const sb = await conBase()
  await limpiarAlta(sb)

  const marcaTiempo = Date.now()
  const nombre = `${MARCA} Obra Lista ${marcaTiempo}`
  const obraId = nombre.toLowerCase().replace(/[^a-z0-9]+/g, '-')

  try {
    await entrar(page)
    const cliente = await clienteDePrueba(sb, marcaTiempo)

    const { error: eObra } = await sb.from('obra_canonica').insert({
      id: obraId, nombre, cliente_id: cliente.id, estado: 'activa', tipo: 'obra', etapa: 'previo',
      jefe_obra: `${MARCA} Jefe`, monto_contratado: 1000,
      fecha_inicio_plan: '2026-03-01', fecha_fin_plan: '2026-11-30', drive_carpeta_id: `${MARCA}-carpeta`,
    })
    expect(eObra).toBeNull()

    const { error: eAct } = await sb.from('obra_actividad').insert({
      obra_id: obraId, codigo: '1', clave: 'zze2e-alta/replanteo', nombre: `${MARCA} Replanteo`,
      inicio_plan: '2026-03-01', fin_plan: '2026-03-10',
      inicio_base: '2026-03-01', fin_base: '2026-03-10', sellada_en: new Date().toISOString(),
      hh_plan: 40,
    })
    expect(eAct).toBeNull()

    const { data: persona } = await sb.from('personas').select('id').limit(1).maybeSingle()
    const { error: eAsig } = await sb.from('obra_asignacion').insert({
      obra_id: obraId, persona_id: laFila(persona, 'una persona del plantel').id, rol: 'integrante',
      notas: MARCA,
    })
    expect(eAsig).toBeNull()

    await page.goto(`/obras/${obraId}?vista=resumen`)
    await expect(page.getByTestId('titular-obra')).toBeVisible()
    // El bloque NO EXISTE, no está vacío: `ocultarSiCompleto` devuelve null.
    await expect(page.getByTestId('preparacion')).toHaveCount(0)

    // Y en el alta, donde el checklist se muestra siempre, las siete líneas están en ✓.
    await page.goto(`/obras/nueva?obra=${obraId}&paso=confirmar`)
    await expect(page.getByTestId('checklist-preparacion')).toBeVisible()
    await expect(page.locator('[data-testid^="preparacion-"][data-listo="no"]')).toHaveCount(0)
  } finally {
    await limpiarAlta(sb)
  }
})


// ═══ LA PUERTA, NO SÓLO LA HABITACIÓN (19/08/2026) ═══
//
// `/obras/nueva` quedó terminada y sin un solo enlace: sólo se llegaba tipeando la URL. Eso es
// exactamente una pantalla «preparada para», que el dueño prohibió. Este test no mira el alta —eso
// ya está medido arriba—: mira que se pueda LLEGAR, que es la mitad que nadie prueba.
test('al alta de obra se llega desde el portafolio, no tipeando la URL', async ({ page }) => {
  test.setTimeout(120000)
  await entrar(page)
  await page.goto('/obras')
  await page.getByTestId('alta-obra-nueva').click()
  await page.waitForURL(/\/obras\/nueva/)
  await expect(page.getByTestId('pasos-alta'), 'la página del alta no dibujó sus pasos').toBeVisible()
})
