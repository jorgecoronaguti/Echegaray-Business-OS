import { test, expect, devices } from '@playwright/test'
import { entrarComo } from './util/login'
import { ADMIN, JEFE, servicio } from './util/identidades'
import { MARCA_PRUEBA } from './util/rastro'

// LA CARGA DE ASISTENCIA DESDE EL TELÉFONO, CON UN USUARIO DE ADENTRO — 08/09/2026.
//
// ═══ EL DEFECTO QUE ATRAPA, TEXTUAL DEL DUEÑO ═══
//
// *«probé el diseño del registro de la asistencia por el celular con mi usuario admin y es la misma
// pantalla que muestra la computadora»*. La experiencia de teléfono existía en `/campo/asistencia`
// y ningún rol de adentro llegaba a ella. Si `modoDeAsistencia` vuelve a devolver `quincena` para
// un teléfono, o si el bloque deja de renderizar, estos casos se ponen rojos.
//
// ═══ POR QUÉ UN DISPOSITIVO Y NO SÓLO `viewport: 390` (medido, no supuesto) ═══
//
// La elección móvil/escritorio se toma en el SERVIDOR con `sec-ch-ua-mobile`, así que el navegador
// tiene que mandar la pista de verdad. Medido con una sonda contra un servidor propio el 08/09:
//
//     default              ch=?0   ua-móvil=no
//     viewport 390x844     ch=?0   ua-móvil=no     ← un viewport chico NO es un teléfono
//     isMobile: true       ch=?0   ua-móvil=no     ← ni `isMobile` solo
//     devices['Pixel 5']   ch=?1   ua-móvil=sí     ← la pista sale del User-Agent emulado
//
// Por eso se parte de `devices['Pixel 5']` y se le fija el viewport en 390: el ANCHO que pidió el
// dueño con la IDENTIDAD de un teléfono real. Un test con `viewport: 390` a secas habría probado el
// camino de escritorio creyendo que probaba el del teléfono — y habría dado verde con el bug puesto.
//
// `defaultBrowserType` se deja AFUERA a propósito: Playwright rechaza un `test.use` de describe que
// cambie de navegador («forces a new worker»). Lo que hace falta de ese dispositivo es el
// User-Agent —de ahí sale la pista— y el tacto, no el motor.
const TELEFONO = {
  userAgent: devices['Pixel 5'].userAgent,
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: devices['Pixel 5'].deviceScaleFactor,
  isMobile: true,
  hasTouch: true,
}

// NADA DE ESTO ESCRIBE. Se abre la lista, se toca una obra y se mira que el formulario esté; las
// casillas nacen vacías y no se toca «Guardar el día». Escribir sobre una obra real fabricaría
// horas que nadie trabajó — es lo que ya pasó con las 77,4 HH de PISOS INDUSTRIALES.

test.describe('en el teléfono, Administración carga la asistencia del día', () => {
  test.use(TELEFONO)

  test('01 · la lista de obras, y tocar una abre el formulario de la jornada', async ({ page }) => {
    await entrarComo(page, ADMIN.email, ADMIN.password)
    await page.goto('/administracion/personas?vista=asistencia')

    // PASO 1 · LAS OBRAS. Sin `?modo=`: el teléfono lo tiene que decidir SOLO, que es todo el punto.
    await expect(page.getByTestId('asistencia-dia')).toBeVisible()
    await expect(page.getByTestId('obras-para-asistencia')).toBeVisible()
    // Y LA GRILLA DE ESCRITORIO NO SE DIBUJÓ. No está tapada con CSS: no se renderizó, así que el
    // teléfono no pagó la lectura de la quincena entera.
    await expect(page.getByTestId('grilla-asistencia')).toHaveCount(0)
    await page.screenshot({ path: 'qa-shots/asistencia-admin-390-obras.png', fullPage: true })

    const obras = page.getByTestId('obra-para-asistencia')
    const cuantas = await obras.count()
    if (cuantas === 0) test.skip(true, 'No hay obras activas en la base.')

    // ═══ EL CONTEO DE GENTE TIENE QUE SER UN NÚMERO EN ALGUNA OBRA ═══
    //
    // EL DEFECTO QUE ATRAPA, y que esta prueba encontró de verdad el 08/09: la lectura pedía
    // `obra_canonica_id` y esa columna en `obra_asignacion` se llama `obra_id`. PostgREST devolvía
    // error, el conteo caía a `null` y las nueve obras decían «sin conteo». El fallback fue honesto
    // —no publicó 0— pero el dato que decide cuál obra tocar no estaba. Si vuelve a romperse, acá
    // no queda ni una obra con un número y esto se pone rojo.
    const rotulos = await obras.getByTestId('asignados').allInnerTexts()
    const conGente = rotulos.findIndex((t) => /^[1-9]\d* persona/.test(t))
    expect(rotulos.some((t) => t !== 'sin conteo'),
      `Ninguna obra pudo contar su gente: ${rotulos.join(' | ')}`).toBe(true)
    if (conGente === -1) test.skip(true, 'Ninguna obra activa tiene gente asignada hoy.')

    // PASO 2 · EL DÍA Y LA CUADRILLA. Se toca la obra QUE TIENE GENTE: tocar la primera de la lista
    // hacía que la captura del formulario fuera en realidad la del aviso «nadie está asignado».
    await obras.nth(conGente).click()
    await expect(page.getByTestId('obra-de-la-jornada')).toBeVisible()
    await expect(page.getByTestId('elegir-dia')).toBeVisible()
    await expect(page.getByTestId('dia-anterior')).toBeVisible()
    await expect(page.getByTestId('dia-siguiente')).toBeVisible()

    await expect(page.getByTestId('form-asistencia')).toBeVisible()
    await expect(page.getByTestId('poner-jornada')).toBeVisible()
    await expect(page.getByTestId('guardar-dia')).toBeVisible()
    // LA CASILLA NACE VACÍA. Es el control que costó un revert: si nace con la jornada puesta, un
    // toque en Guardar escribe horas que nadie midió. NO se toca «Guardar»: esta es una obra real.
    await expect(page.getByTestId('horas').first()).toHaveValue('')
    await page.screenshot({ path: 'qa-shots/asistencia-admin-390-form.png', fullPage: true })
  })

  test('02 · «Ver la quincena completa» es la salida, y vuelve', async ({ page }) => {
    await entrarComo(page, ADMIN.email, ADMIN.password)
    await page.goto('/administracion/personas?vista=asistencia')
    await expect(page.getByTestId('asistencia-dia')).toBeVisible()

    // EL DEFECTO QUE ATRAPA: que el enlace no fuerce `modo=quincena` y devuelva la misma pantalla
    // de la que se quiso salir. Es el lazo que ya dejó `/campo/asistencia` girando sobre sí mismo
    // con el `?dia=…?obra=…`.
    await page.getByTestId('ver-quincena').click()
    await expect(page.getByTestId('grilla-asistencia')).toBeVisible()

    // Y LA VUELTA EXISTE: quien forzó la grilla en el teléfono no queda encerrado en ella.
    await page.getByTestId('ver-carga-del-dia').click()
    await expect(page.getByTestId('asistencia-dia')).toBeVisible()
  })

  test('03 · «Cargar asistencia» está en el menú de la cuenta, a un toque', async ({ page }) => {
    // EL DEFECTO QUE ATRAPA: la pantalla móvil existe y sigue sin haber cómo llegar. Es exactamente
    // la mitad del problema que reportó el dueño — la otra mitad la cubre el caso 01.
    await entrarComo(page, ADMIN.email, ADMIN.password)
    await page.goto('/administracion')
    await page.getByTestId('avatar-usuario').click()
    const ir = page.getByTestId('ir-cargar-asistencia')
    await expect(ir).toBeVisible()
    // ≥44px: se toca parado, en obra, con una mano.
    const caja = await ir.boundingBox()
    if (!caja) throw new Error('El atajo no tiene caja: no está renderizado.')
    expect(caja.height).toBeGreaterThanOrEqual(44)
    await ir.click()
    await expect(page.getByTestId('asistencia-dia')).toBeVisible()
  })
})

test.describe('en escritorio no cambia nada', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('04 · la quincena sigue siendo lo que se abre en 1440', async ({ page }) => {
    await entrarComo(page, ADMIN.email, ADMIN.password)
    await page.goto('/administracion/personas?vista=asistencia')
    await expect(page.getByTestId('grilla-asistencia')).toBeVisible()
    // Y NO SE COLÓ LA VISTA DEL TELÉFONO: si las dos se dibujaran, ésta sería la prueba de que se
    // están pagando las dos lecturas en cada carga.
    await expect(page.getByTestId('asistencia-dia')).toHaveCount(0)
    // El atajo del menú NO se le ofrece a quien tiene la grilla entera a la vista.
    await expect(page.getByTestId('ver-carga-del-dia')).toBeHidden()
    await page.screenshot({ path: 'qa-shots/asistencia-admin-1440-quincena.png', fullPage: true })
  })
})


// ═══ EL JEFE DE OBRA TRAE A ALGUIEN A SU OBRA, DESDE EL TELÉFONO (dueño, 08/09/2026, tarde) ═══
//
// *«al comenzar el día tengo que marcar la asistencia de las personas, pero ¿qué pasa si no
// modifiqué el lugar de trabajo? Tenés que habilitar a los jefes de obra a poder modificar las obras
// asignadas del personal»*.
//
// ═══ QUÉ PRUEBA QUE NO PRUEBE OTRA COSA ═══
//
// Los módulos puros ya prueban a quién ofrece la lista y quién puede escribir. Lo único que sólo se
// ve acá: que con la identidad JEFE —no ADMIN— el gesto entero funciona contra la base real, que la
// persona QUEDA en la cuadrilla con la casilla vacía, y que MOVER NO MARCA — `registros_hh` de esa
// persona no cambia ni en cantidad ni en suma. Ese último es el que importa: es el defecto que
// costó el revert de las 77,4 HH, mirado desde el gesto nuevo.
//
// ═══ TODO EL ESCENARIO ES FABRICADO. NINGUNA PERSONA REAL, NINGUNA OBRA REAL ═══
//
// La idea original era usar una persona REAL sin asignación vigente, como hace el test 08 de
// `asistencia-por-obra.spec.ts`. Dos razones por las que NO se hace:
//
// 1. MEDIDO CONTRA LA BASE EL 08/09: las 17 personas del plantel tienen asignación vigente hoy (21
//    asignaciones abiertas). Ese camino no existe y el test se salteaba entero — verde por vacío,
//    que es peor que rojo.
// 2. ESTA BASE ES LA QUE USA EL DUEÑO AHORA MISMO. El 08/09 le apareció «antes ZZ-E2E asistencia por
//    obra» en el acuse de una persona REAL: un E2E de escritura le había cerrado la asignación que
//    respalda su costo de mano de obra y se lo mostró en la cara. Un test no puede escribir sobre
//    gente real de una empresa viva, aunque después limpie.
//
// Así que la persona es de prueba, con ID FIJO y `es_prueba = true`, y se borra en el `finally`. El
// id fijo no es capricho: si una corrida se cae a la mitad, la siguiente la reusa en vez de dejar
// una persona nueva por cada intento.
//
// LO QUE ESTO NO PRUEBA, DECLARADO: el gesto sobre alguien con historia real de otras fuentes
// (JORNALES, cuadrillas, licencias). Prueba la mecánica y el efecto, no la convivencia. Y mientras
// la fila existe SE VE en las pantallas del dueño: `persona_plantel` filtra por `en_la_empresa` y
// NO por `es_prueba` (20260819T3100), así que una corrida que muera sin `finally` deja a «ZZ-E2E
// persona jefe» a la vista hasta que alguien la borre.
const OBRA_ORIGEN_TRAER = 'zz-e2e-traer-origen'
const OBRA_DESTINO_TRAER = 'zz-e2e-traer-destino'
const PERSONA_TRAER = 'e2e00000-0000-4000-8000-00000000e2e2'
const MARCA_TRAER = `${MARCA_PRUEBA} persona jefe`
// LAS HORAS VAN A UN DÍA PASADO, no a hoy: en el día de hoy ensuciarían la casilla que este mismo
// test afirma VACÍA, y la aserción dejaría de significar lo que dice.
const DIA_CON_HORAS = '2026-09-01'

type FilaAsignacion = { obra_id: string | null; desde: string | null; hasta: string | null }

/** Cuántos registros de horas tiene esa persona y cuánto suman. La evidencia de que mover no marcó. */
async function horasDe(personaId: string): Promise<{ n: number; suma: number }> {
  const sb = servicio()
  const r = await sb.from('registros_hh').select('id, horas').eq('persona_id', personaId)
  if (r.error) throw new Error(`No pude leer registros_hh: ${r.error.message}`)
  const filas = (r.data ?? []) as { horas: number | string | null }[]
  return { n: filas.length, suma: filas.reduce((t, f) => t + Number(f.horas ?? 0), 0) }
}

/** Una persona ZZ-E2E asignada a la obra ORIGEN y con horas cargadas ahí; la obra DESTINO vacía. */
async function prepararTraer(): Promise<{ id: string; nombre: string }> {
  const sb = servicio()
  for (const [id, nombre] of [
    [OBRA_ORIGEN_TRAER, `${MARCA_PRUEBA} traer origen`],
    [OBRA_DESTINO_TRAER, `${MARCA_PRUEBA} traer destino`],
  ]) {
    const o = await sb.from('obra_canonica')
      .upsert({ id, nombre, estado: 'activa', jornada_horas: 8.8 }).select('id')
    if (o.error) throw new Error(`No pude crear ${id}: ${o.error.message}`)
  }
  // CADA ESCRITURA SE MIRA. Un helper que ignora `.error` deja al test fallando en la aserción de la
  // pantalla con un mensaje que no dice nada del problema real — que fue no poder preparar nada.
  // `upsert` Y NO `insert`: con id fijo, una corrida anterior que se cayó antes del `finally` dejó
  // la fila puesta y un `insert` reventaría con clave duplicada — el test daría rojo por su propio
  // residuo y no por un defecto del producto.
  const persona = await sb.from('personas').upsert({
    id: PERSONA_TRAER, nombre_completo: MARCA_TRAER, en_la_empresa: true, es_prueba: true,
    categoria: 'Ayudante',
  }, { onConflict: 'id' }).select('id')
  if (persona.error) throw new Error(`No pude crear la persona de prueba: ${persona.error.message}`)
  const personaId = PERSONA_TRAER
  // ARRANCA LIMPIA. Lo que haya quedado de una corrida anterior sobre esta misma fila se saca ahora:
  // una asignación vieja haría que la lista no la ofreciera y el test culparía al producto.
  await sb.from('registros_hh').delete().eq('persona_id', personaId)
  await sb.from('obra_asignacion').delete().eq('persona_id', personaId)

  const asig = await sb.from('obra_asignacion').insert({
    obra_id: OBRA_ORIGEN_TRAER, persona_id: personaId, rol: 'integrante', desde: '2026-01-01',
  }).select('id')
  if (asig.error) throw new Error(`No pude asignarla al origen: ${asig.error.message}`)
  const horas = await sb.from('registros_hh').insert({
    obra_canonica_id: OBRA_ORIGEN_TRAER, persona_id: personaId, fecha: DIA_CON_HORAS,
    fecha_inicio_semana: DIA_CON_HORAS, horas: 8.8, tipo_hora: 'normal', actividad_id: null,
    fuente_legacy: 'e2e:traer-a-la-obra',
  }).select('id')
  if (horas.error) throw new Error(`No pude dejarle horas en el origen: ${horas.error.message}`)

  // EL `usuario_obra` DE QUIEN MIRA. Sin esto la obra de prueba sirve para un rol y no para el
  // siguiente, y este test entra justamente con una identidad que no es la de Dirección.
  const { data: usuarios } = await sb.from('perfiles').select('id').limit(50)
  for (const u of (usuarios ?? []) as { id: string }[]) {
    for (const obra of [OBRA_ORIGEN_TRAER, OBRA_DESTINO_TRAER]) {
      await sb.from('usuario_obra').upsert(
        { usuario_id: u.id, obra_canonica_id: obra, papel: 'jefe' },
        { onConflict: 'usuario_id,obra_canonica_id' },
      )
    }
  }
  return { id: personaId, nombre: MARCA_TRAER }
}

/** Barre TODO. Las horas primero: las claves foráneas mandan el orden. */
async function limpiarTraer(): Promise<void> {
  const sb = servicio()
  const obras = [OBRA_ORIGEN_TRAER, OBRA_DESTINO_TRAER]
  // POR ID, NO POR NOMBRE. El id es fijo y no depende de que el nombre haya quedado como se escribió;
  // y borrar `like 'ZZ-E2E%'` se llevaría puesto lo que otro spec esté usando en paralelo.
  for (const tabla of ['registros_hh', 'obra_asignacion', 'cuadrilla_integrante']) {
    await sb.from(tabla).delete().eq('persona_id', PERSONA_TRAER)
  }
  await sb.from('personas').delete().eq('id', PERSONA_TRAER)
  await sb.from('registros_hh').delete().in('obra_canonica_id', obras)
  await sb.from('obra_asignacion').delete().in('obra_id', obras)
  await sb.from('usuario_obra').delete().in('obra_canonica_id', obras)
  await sb.from('obra_canonica').delete().in('id', obras)
}

test.describe('el JEFE DE OBRA trae a alguien a su obra desde el teléfono', () => {
  test.use(TELEFONO)
  // EL TIEMPO SE CONFIGURA EN EL DESCRIBE, NO CON `test.setTimeout` ADENTRO. Son un login, una
  // navegación, una escritura y cuatro lecturas a la base; con otro build corriendo al lado la
  // corrida del 08/09 se cayó ANTES de entrar al cuerpo del test —«while setting up page»—, o sea
  // donde `setTimeout` todavía no había corrido. Un test que da rojo por la carga de la máquina
  // enseña a ignorar el rojo.
  test.describe.configure({ timeout: 180_000 })

  test('05 · traer a alguien lo pone en la cuadrilla con la casilla vacía, y NO le marca horas', async ({ page }) => {
    // ESCRIBE `obra_asignacion` Y `personas`: no corre solo. Es la regla que dejó el revert de las
    // 77,4 HH — un E2E de escritura que se dispara en cada corrida termina fabricando datos.
    test.skip(process.env.E2E_ESCRIBE_ASISTENCIA !== '1',
      'Escribe sobre obras y una persona ZZ-E2E propias. Se habilita con E2E_ESCRIBE_ASISTENCIA=1.')
    const hoy = new Date().toISOString().slice(0, 10)
    const ayer = new Date(Date.parse(`${hoy}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10)
    await limpiarTraer()
    const p = await prepararTraer()
    const horasAntes = await horasDe(p.id)
    expect(horasAntes, 'el escenario tiene que empezar con horas cargadas: si no, «no cambió» no dice nada')
      .toEqual({ n: 1, suma: 8.8 })

    try {
      await entrarComo(page, JEFE.email, JEFE.password)
      await page.goto(`/administracion/personas?vista=asistencia&obra=${OBRA_DESTINO_TRAER}`)

      // LA OBRA DESTINO ARRANCA SIN NADIE: el botón tiene que estar igual — es cuando más falta hace.
      await expect(page.getByTestId('obra-de-la-jornada')).toBeVisible()
      const abrir = page.getByTestId('abrir-traer')
      await expect(abrir).toBeVisible()
      // ≥44px: se toca parado, en obra, con una mano.
      const caja = await abrir.boundingBox()
      if (!caja) throw new Error('El botón no tiene caja: no está renderizado.')
      expect(caja.height).toBeGreaterThanOrEqual(44)
      await page.screenshot({ path: 'qa-shots/movil-traer-persona-390.png', fullPage: true })

      // LA LISTA. Se busca por nombre y la fila dice DE QUÉ OBRA VIENE: sin eso, sacarle un oficial
      // a otra obra activa se ve igual que tomar a alguien que no está en ninguna.
      await abrir.click()
      await expect(page.getByTestId('lista-traer')).toBeVisible()
      await page.getByTestId('buscar-para-traer').fill('persona jefe')
      const fila = page.getByTestId('candidato-traer').filter({ hasText: p.nombre }).first()
      await expect(fila).toBeVisible()
      await expect(fila.getByTestId('obra-del-candidato')).toHaveText(`(${MARCA_PRUEBA} traer origen)`)
      await page.screenshot({ path: 'qa-shots/movil-traer-persona-lista-390.png', fullPage: true })

      await fila.click()

      // ═══ SIN SALIR DE LA PANTALLA: el acuse, y la persona YA en la cuadrilla ═══
      const acuse = page.getByTestId('acuse-traer')
      await expect(acuse).toBeVisible({ timeout: 60_000 })
      await expect(acuse).toContainText(p.nombre)
      await expect(acuse).toContainText('Desde hoy en')
      // EL «ANTES» NOMBRA LO QUE SE CERRÓ. «Guardado» no diría nada: lo que hay que poder leer es de
      // dónde a dónde se movió, porque es lo que decide a qué obra se le imputa el costo.
      await expect(acuse).toContainText(`antes ${MARCA_PRUEBA} traer origen`)
      await expect(page.getByTestId('lista-traer')).toHaveCount(0)
      const suFila = page.getByTestId('fila-asistencia').filter({ hasText: p.nombre })
      await expect(suFila).toHaveCount(1)
      // LA CASILLA NACE VACÍA. Traer a alguien es decir dónde trabaja, no cuánto trabajó.
      await expect(suFila.getByTestId('horas')).toHaveValue('')
      await expect(suFila).toHaveAttribute('data-estado', 'sin_marcar')
      await page.screenshot({ path: 'qa-shots/movil-traer-persona-acuse-390.png', fullPage: true })

      // ═══ LA EVIDENCIA ES DEL EFECTO: SE LEE LA BASE, NO LA PANTALLA ═══
      const sb = servicio()
      const r = await sb.from('obra_asignacion')
        .select('obra_id, desde, hasta').eq('persona_id', p.id)
      expect(r.error).toBeNull()
      const puestas = (r.data ?? []) as FilaAsignacion[]
      const origen = puestas.find((a) => a.obra_id === OBRA_ORIGEN_TRAER)
      const destino = puestas.find((a) => a.obra_id === OBRA_DESTINO_TRAER)
      // LA HISTORIA NO SE BORRA: la asignación anterior sigue existiendo, cerrada AYER.
      expect(origen, 'la asignación anterior tiene que seguir en la base').toBeTruthy()
      expect(origen?.hasta).toBe(ayer)
      expect(destino, 'la asignación nueva tiene que estar escrita').toBeTruthy()
      expect(destino?.desde).toBe(hoy)
      expect(destino?.hasta).toBeNull()

      // MOVER NO MARCA: ni un registro más, ni una hora más — y tampoco uno menos.
      expect(await horasDe(p.id), 'traer a alguien tocó registros_hh').toEqual(horasAntes)
    } finally {
      await limpiarTraer()
    }
  })
})

// ═══ EL MISMO GESTO, SIN ESCRIBIR UNA SOLA FILA ═══
//
// El caso 05 prueba el EFECTO y por eso está apagado: escribe. Éste prueba lo que se puede probar
// sobre datos vivos —que el jefe tiene el control en la mano, que la lista abre con gente y que cada
// fila dice de qué obra viene— y NO TOCA NINGÚN CANDIDATO. Sin él, apagar el 05 dejaría la pantalla
// nueva sin ninguna evidencia de navegador en la corrida de todos los días.
test.describe('la lista de «traer a alguien» abre para el jefe, sin escribir nada', () => {
  test.use(TELEFONO)
  test.describe.configure({ timeout: 180_000 })

  test('06 · el jefe ve el botón y la lista con la obra de cada uno — sin elegir a nadie', async ({ page }) => {
    await entrarComo(page, JEFE.email, JEFE.password)
    await page.goto('/administracion/personas?vista=asistencia')
    const obras = page.getByTestId('obra-para-asistencia')
    await expect(obras.first()).toBeVisible()
    if (await obras.count() === 0) test.skip(true, 'No hay obras activas en la base.')
    // SE NAVEGA POR LA URL DE LA FILA, NO SE LA TOCA. Medido el 08/09: el `click` sobre la primera
    // obra entra en «element was detached from the DOM, retrying» y reintenta hasta el timeout —la
    // lista se vuelve a montar después de la hidratación—. Ese lazo no dice nada del gesto que este
    // test mide, que empieza DENTRO de la carga del día. Que tocar la fila lleve a la jornada ya lo
    // prueba el caso 01.
    const href = await obras.first().getAttribute('href')
    if (!href) throw new Error('La fila de obra no tiene href: la lista no se renderizó.')
    await page.goto(href)

    // EL BOTÓN, CON SU OBJETIVO TÁCTIL. La habilitación del dueño llega hasta la mano del jefe o no
    // llegó: `puedeCambiarObraActual` verde en el módulo puro no dibuja nada por sí solo.
    const abrir = page.getByTestId('abrir-traer')
    await expect(abrir).toBeVisible()
    const caja = await abrir.boundingBox()
    if (!caja) throw new Error('El botón no tiene caja: no está renderizado.')
    expect(caja.height).toBeGreaterThanOrEqual(44)
    await page.screenshot({ path: 'qa-shots/movil-traer-persona-390.png', fullPage: true })

    await abrir.click()
    await expect(page.getByTestId('lista-traer')).toBeVisible()
    await expect(page.getByTestId('buscar-para-traer')).toBeVisible()
    const candidatos = page.getByTestId('candidato-traer')
    // ═══ LA LISTA TIENE GENTE, Y CADA FILA DICE DE DÓNDE VIENE ═══
    //
    // EL DEFECTO QUE ATRAPA: que la lectura falle en silencio y la lista salga vacía. Una lista
    // vacía se ve igual que «todo el plantel ya está acá» y las dos cosas son opuestas. La empresa
    // tiene 17 personas y nueve obras activas: en cualquier obra sobra alguien a quien traer.
    await expect(candidatos.first()).toBeVisible()
    const rotulos = await candidatos.getByTestId('obra-del-candidato').allInnerTexts()
    expect(rotulos.length, 'la lista salió vacía: o la lectura falló, o el filtro se comió a todos')
      .toBeGreaterThan(0)
    // NI UN RÓTULO EN BLANCO: `null` se dibuja «(sin obra)», nunca vacío.
    expect(rotulos.every((t) => /^\(.+\)$/.test(t)), `rótulos: ${rotulos.join(' | ')}`).toBe(true)
    // ═══ Y NINGUNA FILA SIN NOMBRE ═══
    //
    // EL DEFECTO QUE ATRAPA, encontrado en la captura de 390px del 08/09: con el nombre y la obra en
    // la MISMA línea, quien tiene dos obras vigentes trae un rótulo de 60 caracteres que se queda con
    // todo el ancho, y dos filas de la lista se dibujaron con el paréntesis solo. Una fila sin nombre
    // no se puede elegir. Se compara contra los rótulos: cada fila tiene que aportar un nombre además
    // de su obra.
    const textos = await candidatos.allInnerTexts()
    const sinNombre = textos.filter((t, i) => t.replace(rotulos[i], '').trim() === '')
    expect(sinNombre, `filas sin nombre visible: ${sinNombre.join(' | ')}`).toEqual([])
    await page.screenshot({ path: 'qa-shots/movil-traer-persona-lista-390.png', fullPage: true })

    // EL BUSCADOR FILTRA DE VERDAD. Con un texto que no existe la lista queda en el estado vacío
    // —que dice cuál de los dos vacíos es— y NO se toca a nadie.
    await page.getByTestId('buscar-para-traer').fill('zzzzzznoexiste')
    await expect(page.getByTestId('traer-vacio')).toBeVisible()

    // Y SE SALE SIN HABER MOVIDO A NADIE.
    await page.getByTestId('cerrar-traer').click()
    await expect(page.getByTestId('lista-traer')).toHaveCount(0)
    await expect(page.getByTestId('acuse-traer')).toHaveCount(0)
  })
})
