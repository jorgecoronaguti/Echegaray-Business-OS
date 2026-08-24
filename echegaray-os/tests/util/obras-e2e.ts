import { expect, type Page } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { MARCA_PRUEBA } from './rastro'

// LO COMPARTIDO POR LOS RECORRIDOS DEL MVP ERP DE OBRAS.
//
// No es un archivo de test —no termina en `.spec.ts` y Playwright no lo recoge—: es el cableado que
// usan los dos recorridos (`obras-cliente-y-obra` y `obras-ejecucion`). Vive separado por una razón
// concreta: la LIMPIEZA tiene que ser una sola. Dos copias del borrado se desincronizan, y la que
// se queda vieja deja filas de prueba en el Gantt que mira el dueño.

export const EMAIL = 'jorge.o.corona+direccion-test-1783513222134@gmail.com'
export const PASSWORD = 'TestPassword123!'

/** Todo lo que crean estos recorridos lleva esta marca en el nombre: hace el borrado inequívoco.
 *  Se REEXPORTA desde `rastro.ts`, que es donde vive la definición y donde está escrito por qué es
 *  ésta y no otra. Dos constantes con el mismo valor en dos archivos se separan el día que alguien
 *  cambia una — y ese día la limpieza deja de encontrar la mitad del residuo. */
export const MARCA = MARCA_PRUEBA
export const OBRA = 'le-comedor'

/**
 * LA MARCA DE UN RECORRIDO, NO LA DE TODOS.
 *
 * ═══ EL DEFECTO QUE ESTO EVITA (24/08/2026) ═══
 *
 * Los recorridos corren EN PARALELO sobre la MISMA obra, y cada uno arranca con `limpiar()`, que
 * borra por marca. Con una sola marca compartida, el barrido de arranque de un test le lleva
 * puestas las filas al que está a la mitad: la actividad recién creada desaparece del Gantt y la
 * asignación recién hecha desaparece de Personal. Medido: dos rojos que acusaban al producto de no
 * persistir lo que sí había persistido.
 *
 * Es la MISMA lección que `rastro.ts` ya dejó escrita para las personas de prueba; acá faltaba.
 * Todas las marcas siguen empezando con `ZZ-E2E`, así que el residuo se sigue reconociendo de un
 * vistazo y sigue ordenando último en cualquier listado.
 */
export const marcaDe = (recorrido: string) => `${MARCA}-${recorrido}`

/**
 * EL MENSAJE CON EL QUE POSTGRES AVISA QUE CORTÓ.
 *
 * Se busca el TEXTO y no un `testid`: las pantallas publican este corte de dos maneras distintas
 * —`EstadoError` en la ficha de la obra, un `Aviso` en la cartera de clientes— y un ancla técnica
 * sólo habría cubierto la primera. La frase la escribe la base, es la misma en las dos, y no
 * aparece en ninguna pantalla sana.
 */
const CORTE_DE_LA_BASE = 'canceling statement due to statement timeout'

/**
 * NAVEGAR SIN RENDIRSE ANTE UN CORTE DE LA BASE — Y SIN MEDIR EL CARTEL DE ERROR.
 *
 * ═══ QUÉ PROBLEMA RESUELVE, Y POR QUÉ NO ES AFLOJAR UN TEST ═══
 *
 * Los recorridos golpean en paralelo el mismo `next dev` y la misma obra, y cada pantalla dispara
 * una docena de consultas. Bajo esa ráfaga Postgres corta por `statement timeout` y la pantalla
 * dibuja su cartel —que es exactamente lo que tiene que hacer—. Ese rojo no señala nada de lo que
 * el test vino a medir; medido con el mismo usuario y sin carga, esas consultas vuelven en 200-800
 * ms. Reintentar no cambia ninguna aserción: las que siguen se hacen sobre la pantalla cargada.
 *
 * Y ADEMÁS EVITA UN FALSO VERDE: el cartel de error entra cómodo en 390 px. Un barrido de ancho que
 * lo midiera pasaría en verde sin haber visto la pantalla.
 *
 * EL CORTE SE MIRA PRIMERO, ANTES DEL ANCLA: si se esperara el ancla, cada intento fallido quemaría
 * su timeout entero y el presupuesto alcanzaría para tres intentos. Mirando el corte, un intento
 * fallido cuesta milisegundos y se reintenta muchas veces.
 */
async function insistir(page: Page, ir: () => Promise<unknown>, ruta: string, ancla?: string) {
  await expect(async () => {
    await ir()
    await expect(page.getByText(CORTE_DE_LA_BASE).first(),
      `${ruta}: la base cortó la consulta y la pantalla no llegó a dibujarse`).toHaveCount(0)
    if (ancla) await expect(page.getByTestId(ancla)).toBeVisible({ timeout: 15000 })
  }).toPass({ timeout: 90000 })
}

/** Abrir una ruta. El `ancla` es lo que esa pantalla TIENE que haber dibujado: sin él bastaría con
 *  que el navegador contestara, y contesta igual cuando lo que cargó fue el cartel de error. */
export async function abrir(page: Page, ruta: string, ancla: string) {
  await insistir(page, () => page.goto(ruta), ruta, ancla)
}

/** Para los barridos que recorren muchas rutas y no tienen un ancla propia por pantalla: alcanza
 *  con exigir que la pantalla no sea el cartel de la base cortada. */
export async function abrirSinError(page: Page, ruta: string) {
  await insistir(page, () => page.goto(ruta), ruta)
}

/** Lo mismo para una recarga: es el gesto con el que estos recorridos prueban que lo escrito
 *  PERSISTE, y perderlo por un corte de la base sería perder justamente la prueba. */
export async function recargar(page: Page, ancla: string) {
  await insistir(page, () => page.reload(), 'la recarga', ancla)
}

/**
 * `single()` devuelve `data: T | null`. Si el test llegó hasta acá la fila TIENE que existir: se
 * corta con un mensaje que dice qué faltó, en vez de arrastrar un `null` que explota diez líneas
 * después y manda a buscar el problema al lugar equivocado.
 */
export function laFila<T>(data: T | null, que: string): T {
  if (!data) throw new Error(`No encontré ${que} en la base: la escritura no llegó`)
  return data
}

export async function entrar(page: Page) {
  await page.goto('/login')
  await page.fill('input[name="email"]', EMAIL)
  await page.fill('input[name="password"]', PASSWORD)
  await page.click('button[type="submit"]')
  // 60 s Y NO 20. Medido contra producción el 20/08/2026, tres entradas seguidas: la PRIMERA
  // después de un despliegue tardó **16,4 s** —el arranque en frío de la función serverless— y las
  // dos siguientes 1,8 y 1,5 s. Con 20 s el humo contra producción daba rojo por estar del lado
  // equivocado de esa frontera, y el rojo no señalaba ningún defecto: señalaba que el despliegue
  // era reciente. Un test que falla por el reloj enseña a ignorar los rojos.
  await page.waitForURL(/\/(dashboard|flujo-caja|obras)/, { timeout: 60000 })
}

export async function conBase(): Promise<SupabaseClient> {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
  )
  await sb.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })
  return sb
}

/**
 * CERRAR LA SESIÓN DE ESTE CLIENTE, NO LA DEL USUARIO.
 *
 * ═══ EL DEFECTO QUE ESTO EVITA (24/08/2026) ═══
 *
 * `signOut()` sin argumentos es `scope: 'global'`: revoca TODOS los refresh tokens del usuario, en
 * todas las sesiones. Los recorridos comparten un solo usuario de prueba y corren en paralelo, así
 * que el `finally` del recorrido más corto deslogueaba el NAVEGADOR de los que seguían andando —el
 * test largo aparecía de golpe en la pantalla de «Ingresar» y moría esperando un elemento de una
 * página que ya no estaba mirando. El rojo no decía «te echaron»: decía «no encuentro el titular».
 *
 * `local` limpia el token de ESTE cliente y no toca el servidor, que es todo lo que un test
 * necesita para no dejar su sesión abierta.
 */
export async function salir(sb: SupabaseClient) {
  await sb.auth.signOut({ scope: 'local' })
}

/**
 * Limpieza por marca. Se corre ANTES y DESPUÉS: una corrida interrumpida no deja basura para la
 * siguiente y, sobre todo, no deja una fila de prueba en el Gantt que mira el dueño.
 *
 * @param marca La marca DEL RECORRIDO que llama (ver `marcaDe`). Por defecto barre la marca ancha,
 * que es lo que necesita un recorrido que corre solo — pero un recorrido que comparte obra con
 * otros en paralelo TIENE que pasar la suya: si no, su barrido de arranque borra el material del
 * que está a la mitad. Ese es exactamente el rojo que se pagó el 24/08/2026.
 */
export async function limpiar(sb: SupabaseClient, marca: string = MARCA) {
  await sb.from('obra_asignacion').delete().eq('obra_id', OBRA).ilike('notas', `%${marca}%`)
  await sb.from('certificados').delete().eq('obra_canonica_id', OBRA).ilike('numero', `%${marca}%`)
  await sb.from('obra_restriccion').delete().eq('obra_id', OBRA).ilike('descripcion', `%${marca}%`)
  await sb.from('obra_actividad').delete().eq('obra_id', OBRA).ilike('nombre', `%${marca}%`)
  const { data: cli } = await sb.from('clientes').select('id').ilike('nombre_comercial', `%${marca}%`)
  for (const c of cli ?? []) {
    await sb.from('cliente_documento').delete().eq('cliente_id', c.id)
    await sb.from('cliente_contacto').delete().eq('cliente_id', c.id)
    await sb.from('obra_canonica').delete().eq('cliente_id', c.id)
    await sb.from('clientes').delete().eq('id', c.id)
  }
}
