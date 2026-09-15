import { execFileSync } from 'node:child_process'
import { test, expect } from '@playwright/test'
import { entrarComo } from './util/login'
import { ADMIN, servicio } from './util/identidades'

// ═══ ESTE TEST ESCRIBE EN LA BASE REAL, Y POR ESO NO CORRE SOLO ═══
//
//   E2E_ESCRIBE_ASISTENCIA=1 E2E_BASE_URL=https://app.ecsas.com.ar \
//     npx playwright test tests/horas-dia-anterior-obra-cerrada.spec.ts --workers=1
//
// En esta VM Chromium no arranca sin las libs del sistema, que están bajadas sin root en
// `~/pwdeps/root` y `~/.local/pw-libs/root`: hay que anteponer `LD_LIBRARY_PATH=` con esos
// directorios o el navegador muere con `libatk-1.0.so.0: cannot open shared object file` y el
// informe dice «browser has been closed», que no se parece en nada a la causa.
//
// LO QUE SÓLO SE PUEDE PROBAR ACÁ (merge 068dce4f): que el editor de la celda, en la app viva, deja
// cargar las horas de un día pasado en una obra CERRADA cuya ventana cubre ese día, y que la fila
// queda en `registros_hh` con esa obra y la marca `web:correccion-horas`. `obrasPorFecha.test.ts`
// prueba la regla; que la lista la ofrezca, la acción la acepte con la RLS puesta y Postgres la guarde,
// sólo lo prueba la fila leída en su destino. El auditor firmó con ese límite abierto.
//
// ═══ SÓLO SOBRE LA PERSONA DE PRUEBA ═══
//
// `e2e…0001` (`es_prueba = true`). La grilla la muestra únicamente a una sesión de prueba
// (`sesion_es_de_prueba()`, y la cuenta de Dirección de QA lo es) y únicamente si tuvo actividad en la
// quincena: no tiene ingreso cargado. Por eso se le SIEMBRA una fila en la obra `prueba-e2e` otro día
// de la quincena. La alternativa era cargarle `fecha_ingreso`, que es tocar su legajo; la semilla vive
// en la misma tabla que se limpia y no deja nada que recordar.
//
// La obra destino SÍ es real: es lo que se prueba. La fila dura lo que dura el test y se borra en el
// `finally`; la persona es de prueba, así que ningún costo por obra la cuenta (`costoLecturas`).
const PERSONA = 'e2e00000-0000-4000-8000-000000000001'
const SEMILLA_OBRA = 'prueba-e2e'
const HORAS = 7
const MARCA = 'web:correccion-horas'

const hoyAR = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
const correr = (iso: string, n: number) => {
  const x = new Date(`${iso}T12:00:00Z`)
  x.setUTCDate(x.getUTCDate() + n)
  return x.toISOString().slice(0, 10)
}
const esHabil = (iso: string) => ![0, 6].includes(new Date(`${iso}T12:00:00Z`).getUTCDay())

const HOY = hoyAR()
const DESDE = `${HOY.slice(0, 8)}${Number(HOY.slice(8)) <= 15 ? '01' : '16'}`
const HASTA = DESDE.endsWith('01') ? `${HOY.slice(0, 8)}15` : correr(`${correr(`${HOY.slice(0, 7)}-28`, 4).slice(0, 7)}-01`, -1)
/** El día hábil más reciente ANTES de hoy dentro de la quincena abierta: pasado, y nunca liquidado. */
const FECHA = (() => {
  for (let f = correr(HOY, -1); f >= DESDE; f = correr(f, -1)) if (esHabil(f)) return f
  return null
})()
/** Otro día hábil pasado de la misma quincena, para la semilla. */
const SEMILLA = (() => {
  for (let f = DESDE; f < HOY; f = correr(f, 1)) if (esHabil(f) && f !== FECHA) return f
  return null
})()

interface FilaDB {
  id: string; persona_id: string; fecha: string; obra_canonica_id: string | null
  horas: number; tipo_hora: string; fuente_legacy: string | null
  creado_por: string | null; actualizado_por: string | null
}
interface ObraElegible { id: string; nombre: string; estado: string; soloPorEvidencia: boolean; ventana: unknown }

/** Lectura cruda por `db.mjs`, en otro proceso: no es el cliente que escribió. */
function db<T>(...args: string[]): T {
  const out = execFileSync('node', ['tests/util/horas-dia-anterior-db.mjs', ...args], { encoding: 'utf-8' })
  const ultima = out.trim().split('\n').pop() as string
  return JSON.parse(ultima) as T
}

/** El uuid de una cuenta, por su mail. Es contra ÉSTE que se compara `creado_por`: sin eso, «la fila
 *  está en la base» no distingue la que guardó la pantalla de la que guardó el propio spec. */
async function uuidDe(email: string): Promise<string> {
  const { data, error } = await servicio().auth.admin.listUsers({ perPage: 1000 })
  if (error) throw new Error(`no pude listar cuentas: ${error.message}`)
  const u = data?.users?.find((x) => x.email?.toLowerCase() === email.toLowerCase())
  if (!u) throw new Error(`no existe la cuenta ${email}: el test no crea usuarios.`)
  return u.id
}

// ═══ EL RASTRO VIEJO NO SE BORRA ═══
//
// La primera corrida encontró dos `asistencia_dia_retiro` de esta persona en la quincena, de corridas
// anteriores. Borrarlos por rango habría hecho pasar el residuo en cero borrando historia que este test
// no escribió. Se borra sólo el rastro nacido durante la corrida (`retirado_en >= INICIO`) y el residuo
// se compara contra lo que había antes, no contra cero.
const INICIO = new Date().toISOString()

async function limpiar(ids: string[]): Promise<string[]> {
  const sb = servicio()
  const errores: string[] = []
  const anotar = (que: string, r: { error: { message: string } | null }) => { if (r.error) errores.push(`${que}: ${r.error.message}`) }
  if (ids.length > 0) anotar('registro_hh_correccion', await sb.from('registro_hh_correccion').delete().in('registro_id', ids))
  anotar('registros_hh', await sb.from('registros_hh').delete().eq('persona_id', PERSONA).gte('fecha', DESDE).lte('fecha', HASTA))
  anotar('asistencia_dia', await sb.from('asistencia_dia').delete().eq('persona_id', PERSONA).gte('fecha', DESDE).lte('fecha', HASTA))
  anotar('asistencia_dia_retiro', await sb.from('asistencia_dia_retiro').delete().eq('persona_id', PERSONA)
    .gte('fecha', DESDE).lte('fecha', HASTA).gte('retirado_en', INICIO))
  return errores
}

test('LAS HORAS DE UN DÍA PASADO ENTRAN EN LA OBRA CERRADA CUYA VENTANA LO CUBRE, CON LA MARCA DE CORRECCIÓN', async ({ page }) => {
  test.skip(process.env.E2E_ESCRIBE_ASISTENCIA !== '1',
    'Escribe en registros_hh sobre la persona de prueba. Se habilita con E2E_ESCRIBE_ASISTENCIA=1.')
  test.skip(FECHA === null || SEMILLA === null, `La quincena ${DESDE} no tiene todavía dos días hábiles pasados.`)
  test.setTimeout(180_000)
  const fecha = FECHA as string

  // ── ANTES DE ESCRIBIR NADA: quincena abierta, persona de prueba, obra elegida por la regla ──────────
  const eleccion = db<{ liquidacion: string[]; cerradas: ObraElegible[]; activas: ObraElegible[] }>('elegir', fecha)
  expect(eleccion.liquidacion.every((e) => e !== 'cerrada'), `la quincena de ${fecha} está cerrada en Liquidación`).toBe(true)
  const { data: persona } = await servicio().from('personas').select('nombre_completo, es_prueba').eq('id', PERSONA).maybeSingle()
  const p = persona as { nombre_completo: string; es_prueba: boolean } | null
  if (!p || p.es_prueba !== true) throw new Error(`La persona ${PERSONA} no existe o no es de prueba: no se escribe.`)
  const cerrada = eleccion.cerradas.find((o) => o.soloPorEvidencia) ?? eleccion.cerradas[0]
  const obra = cerrada ?? eleccion.activas[0]
  if (!obra) throw new Error(`Ninguna obra admite horas el ${fecha}.`)
  test.info().annotations.push({
    type: cerrada ? 'obra cerrada' : 'SIN OBRA CERRADA: se usó una activa',
    description: JSON.stringify(obra),
  })

  // ANTES DE TOCAR NADA: registros_hh y asistencia_dia de la persona en la quincena tienen que estar en
  // cero —si no, una corrida anterior murió a mitad y el día elegido no se estrena—; lo demás es la base.
  const autor = await uuidDe(ADMIN.email)
  const base = db<Record<string, number>>('residuo', PERSONA, DESDE, HASTA, '')
  expect({ registros_hh: base.registros_hh, asistencia_dia: base.asistencia_dia },
    `la persona de prueba ya tiene horas o marcas en ${DESDE}–${HASTA}: limpiar a mano antes de correr`)
    .toEqual({ registros_hh: 0, asistencia_dia: 0 })

  let ids: string[] = []
  try {
    const semilla = await servicio().from('registros_hh').insert({
      persona_id: PERSONA, obra_canonica_id: SEMILLA_OBRA, fecha: SEMILLA, fecha_inicio_semana: SEMILLA,
      horas: 8, tipo_hora: 'normal', fuente_legacy: 'e2e',
    }).select('id')
    if (semilla.error) throw new Error(`No pude sembrar la actividad: ${semilla.error.message}`)
    ids = ((semilla.data ?? []) as { id: string }[]).map((f) => f.id)

    await page.setViewportSize({ width: 1440, height: 900 })
    await entrarComo(page, ADMIN.email, ADMIN.password)
    await page.goto(`/administracion/personas?vista=asistencia&modo=quincena&quincena=${DESDE}`)
    await expect(page.getByTestId('grilla-asistencia')).toBeVisible({ timeout: 45_000 })

    // ACOTADO A LA FILA DE LA PERSONA DE PRUEBA: `.first()` sobre la grilla ya le escribió a un empleado real.
    const fila = page.getByTestId('fila-quincena').filter({ hasText: p.nombre_completo })
    await expect(fila, 'la persona de prueba tiene que tener su fila').toHaveCount(1, { timeout: 30_000 })
    const abrir = fila.locator(`[data-testid="celda-abrir-editor"][aria-label*="${fecha}"]`)
    await expect(abrir, `el casillero del ${fecha}`).toHaveCount(1)
    await abrir.click()
    const editor = page.getByTestId('editor-celda')
    await expect(editor).toBeVisible()

    const selector = editor.getByTestId('editor-celda-obra')
    await expect(selector.locator(`option[value="${obra.id}"]`), `la lista del ${fecha} ofrece ${obra.id}`).toHaveCount(1)
    await selector.selectOption(obra.id)
    await editor.getByTestId('editor-celda-horas').click()
    const campo = editor.getByTestId('editor-celda-horas-campo')
    await campo.fill(String(HORAS))
    await page.screenshot({ path: 'tests/qa-shots/horas-dia-anterior-editor-1440.png' })
    await campo.press('Enter')

    // ═══ LA EVIDENCIA ES LA FILA EN POSTGRES, NO EL EDITOR QUE SE CERRÓ ═══
    let filas: FilaDB[] = []
    await expect.poll(() => {
      filas = db<FilaDB[]>('leer', PERSONA, fecha)
      return filas.length
    }, { timeout: 30_000, message: 'la fila no llegó a registros_hh' }).toBe(1)
    ids = [...ids, ...filas.map((f) => f.id)]
    console.log(`FILA_EN_LA_BASE ${JSON.stringify(filas[0])}`)
    expect(filas[0].persona_id).toBe(PERSONA)
    expect(filas[0].fecha).toBe(fecha)
    expect(filas[0].obra_canonica_id).toBe(obra.id)
    expect(filas[0].horas).toBe(HORAS)
    expect(filas[0].tipo_hora).toBe('normal')
    expect(filas[0].fuente_legacy).toBe(MARCA)
    // LA FIRMA DE QUIÉN LA ESCRIBIÓ: `default auth.uid()`. Si la fila la hubiera puesto el
    // `servicio()` de este mismo spec —service_role, sin sesión— vendría en null.
    expect(filas[0].creado_por, 'la fila no la escribió la sesión del navegador').toBe(autor)
    await expect(editor, 'el editor sólo se cierra si guardó').toBeHidden()
    await page.screenshot({ path: 'tests/qa-shots/horas-dia-anterior-grilla-1440.png' })
  } finally {
    const errores = await limpiar(ids)
    const quedo = db<Record<string, number>>('residuo', PERSONA, DESDE, HASTA, ids.join(','))
    console.log(`RESIDUO antes=${JSON.stringify(base)} despues=${JSON.stringify(quedo)} errores=${JSON.stringify(errores)}`)
    expect(errores, 'la limpieza no pudo borrar').toEqual([])
    expect(quedo, 'la base no volvió a como estaba antes de la corrida').toEqual({ ...base, registro_hh_correccion: 0 })
  }
})
