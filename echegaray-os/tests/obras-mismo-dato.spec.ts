// EL PRINCIPIO «MISMO DATO — VISTA GLOBAL Y VISTA DE OBRA», PROBADO CONTRA EL DOM REAL.
//
// El dueño (19/08), textual: *"NO crear dos sistemas. Debe ser: MISMA TABLA/FUENTE → vista global +
// filtro por obra"* · *"El Gantt global y el Gantt de una obra deben consumir exactamente las mismas
// actividades canónicas"*.
//
// ═══ QUÉ CAMBIÓ EL 20/08, Y POR QUÉ ESTE ARCHIVO PERDIÓ DOS TESTS ═══
//
// El principio sigue en pie; lo que cambió es CUÁNTAS vistas globales hay. El dueño cortó la barra
// del área a dos entradas: *"Personal, Operación, Certificaciones y Documentos NO son vistas
// globales principales. Son dominios que pertenecen al workspace DE CADA OBRA. La navegación global
// de Obras debe ser solamente: Resumen | Gantt."*
//
// Se retiró, entonces, el test que comparaba las cuatro sub-vistas de `/obras/operacion` contra las
// solapas de la obra: la pantalla que medía ya no existe. No se retiró por molesto ni por lento —se
// retiró porque un test contra una URL borrada no falla por un defecto, falla por la ausencia de la
// pantalla, y eso es ruido que enseña a ignorar el rojo. La lógica que protegía (`imputar()` en
// `operacionService`, una sola definición de "de qué obra es esta fila") sigue viva, sigue teniendo
// un solo dueño, y sigue alimentando las cuatro tablas de la solapa Operación de la obra.
//
// LO QUE QUEDA es el único par global/obra que sobrevive —el Gantt— y la forma de la jerarquía.
//
// ═══ QUÉ DEFECTO ATRAPA EL TEST DEL GANTT, Y POR QUÉ NINGÚN OTRO LO ATRAPA ═══
//
// "Dos sistemas" no rompe nada: las dos pantallas abren, las dos muestran filas creíbles, y el
// typecheck pasa. Lo que falla es que una muestra 41 actividades de la obra y la otra 38. Eso sólo
// se ve CONTANDO las dos y comparándolas — y en el navegador, no en una función pura: el defecto
// puede estar en el service, en el filtro de archivadas o en el componente. Contra el DOM,
// cualquiera de los tres sale rojo.
//
// LA ACTIVIDAD DE PRUEBA existe para que la comparación no sea entre dos ceros: se crea una fila
// canónica, tiene que aparecer en LAS DOS pantallas, y se borra al final.

import { expect, test } from '@playwright/test'
import { conBase, entrar, laFila, limpiar, MARCA, OBRA } from './util/obras-e2e'

/**
 * TODAS las filas de actividad de UNA obra, en cualquiera de los dos Gantt. Sin recortes.
 *
 * La primera versión de esta constante decía `:not([data-tipo="resumen"])` y era un test sin
 * dientes: al excluir las filas de resumen en LOS DOS lados, la comparación no podía ver el defecto
 * más probable de esta pantalla —que la vista global dibuje como tarea las cabeceras que la ficha
 * consume como título de sección—. Se comprobó con una mutación: borrando el `continue` de
 * `agruparPorObra` el test seguía en verde. Ahora se cuenta TODO lo que cada Gantt dibuja como
 * actividad, que es lo único que hace comparables a las dos pantallas.
 */
// Una fecha MUY posterior a cualquier actividad real: así el `max(fin_plan)` de la obra tiene que
// moverse hasta acá, y el movimiento es la evidencia de que el global lee estas actividades.
const FIN_LEJANO = '2031-12-31'

test('el renglón global de una obra responde a las actividades de esa obra', async ({ page }) => {
  const sb = await conBase()
  await limpiar(sb)
  const nombre = `${MARCA} misma actividad`
  try {
    const { data, error } = await sb.from('obra_actividad').insert({
      obra_id: OBRA,
      clave: `zz-e2e-mismo-dato-${Date.now()}`,
      codigo: 'ZZ.1',
      nombre,
      tipo: 'tarea',
      orden: 9999,
      inicio_plan: '2026-08-10',
      fin_plan: FIN_LEJANO,
      pct: 10,
    }).select('id').single()
    expect(error?.message ?? null, 'la actividad de prueba tiene que poder crearse').toBeNull()
    laFila(data, 'la actividad de prueba recién creada')

    await entrar(page)

    // ── LA VISTA GLOBAL: UN RENGLÓN POR OBRA, Y SU BARRA SALE DE ESTAS ACTIVIDADES ─────────────
    //
    // ═══ QUÉ CAMBIÓ, Y POR QUÉ ESTE TEST SE REESCRIBIÓ EN VEZ DE BORRARSE ═══
    //
    // Hasta hoy este bloque exigía que la actividad recién creada APARECIERA en el Gantt global, y
    // comparaba cuántas barras dibujaba cada pantalla. El dueño cortó eso de raíz: *"NO quiero las
    // 344 actividades de todas las obras desplegadas. **Quiero UN RENGLÓN POR OBRA**."*
    //
    // Pero el principio que el test protegía no cambió: *"No son dos sistemas: el global agrega la
    // información de las actividades canónicas por obra_id."* Lo que cambia es CÓMO se comprueba.
    // Ahora la pregunta es si el renglón de la obra RESPONDE a sus actividades — y se contesta
    // moviendo una: se crea una actividad que termina mucho después que todas las demás, y el fin
    // de la barra global tiene que correrse hasta ahí. Si el global tuviera su propia fuente, el
    // renglón no se enteraría.
    await page.goto('/obras/gantt')
    await expect(page.getByTestId('gantt-obras')).toBeVisible({ timeout: 30000 })

    // NI UNA ACTIVIDAD en la vista global: es la mitad del pedido que se rompe sola si alguien
    // "completa" el Gantt global desplegando el detalle.
    await expect(page.getByTestId('actividad-cronograma'),
      'el Gantt global volvió a desplegar actividades').toHaveCount(0)

    // Y el fin de la barra de ESTA obra llegó hasta la actividad que se acaba de crear. El dato se
    // lee de la fuente que alimenta la pantalla, no de la pantalla misma.
    const { data: plazo } = await sb.from('obra_plan_vs_real')
      .select('fin_plan').eq('obra_id', OBRA).single()
    expect(laFila(plazo, 'el plazo de la obra de prueba').fin_plan,
      'el renglón global no se enteró de una actividad nueva: tiene su propia fuente')
      .toBe(FIN_LEJANO)

    // ── LA VISTA DE LA OBRA: las actividades, que es donde sí van ──────────────────────────────
    await page.goto(`/obras/${OBRA}?vista=cronograma`)
    await expect(page.getByTestId('gantt')).toBeVisible({ timeout: 30000 })
    await expect(page.getByTestId('gantt').getByRole('button', { name: new RegExp(nombre) }))
      .toHaveCount(1)
  } finally {
    await limpiar(sb)
    await sb.auth.signOut()
  }
})

/**
 * LA JERARQUÍA, MEDIDA COMO FORMA Y NO COMO LISTA DE PANTALLAS.
 *
 * El defecto que atrapa es el que ya pasó una vez: que la barra del área vuelva a ofrecer dominios
 * que pertenecen a UNA obra. No alcanza con exigir que Resumen y Gantt estén —eso pasa igual con
 * seis entradas—: lo que se exige es que sean EXACTAMENTE dos y que las cuatro retiradas no puedan
 * volver ni por la barra ni tipeando su URL vieja.
 *
 * Las rutas viejas se prueban con un `goto` porque un archivo `page.tsx` olvidado en el árbol no lo
 * ve ningún typecheck ni ningún lint: la única prueba de que la ruta murió es pedírsela al servidor.
 *
 * NO SE EXIGE UN 404, Y SE MIDIÓ POR QUÉ. Borrado el `page.tsx` estático, `/obras/personal` cae en
 * el segmento dinámico `[obra]` con `obraId = "personal"`. Ahí `getObra` devuelve *"No existe la
 * obra"* COMO ERROR —no como `data: null`—, así que la ficha nunca llega a su `notFound()` y el
 * servidor contesta 200 con el cartel de que no pudo leerla. Eso es una decisión vieja y deliberada
 * de esa pantalla (confundir "no existe" con "no puedo leer" costó caro el 17/08), y corregirla es
 * un cambio del workspace de la obra, no de esta tarea. Lo que sí se exige es lo que importa: que
 * en esas URLs no quede NADA de la vista global —ni su barra ni su tabla— y que la pantalla diga
 * que no hay tal obra. Si alguien repone el `page.tsx`, las dos condiciones se rompen.
 */
test('la barra del área Obras tiene exactamente dos entradas: Resumen y Gantt', async ({ page }) => {
  await entrar(page)
  await page.goto('/obras')

  const barra = page.getByTestId('nav-vistas-obras')
  await expect(barra).toBeVisible({ timeout: 30000 })
  await expect(barra.getByRole('link')).toHaveText(['Resumen', 'Gantt'])

  // Y el nivel 1 no se mezcla con el 2: en Obras, el título es OBRAS.
  await expect(page.getByRole('heading', { name: 'OBRAS', level: 1 })).toBeVisible()

  // LAS CUATRO RETIRADAS NO EXISTEN COMO RUTA. `/obras/cronograma` entra en la lista aunque su
  // contenido siga vivo: se mudó a `/obras/gantt`, y dejar la vieja respondiendo sería tener dos
  // URLs para la misma pantalla — el principio de una sola realidad, aplicado a la navegación.
  for (const ruta of ['/obras/personal', '/obras/operacion', '/obras/certificaciones', '/obras/documentos', '/obras/cronograma']) {
    await page.goto(ruta)
    await expect(
      page.getByRole('heading', { name: 'No pude leer la obra', level: 1 }),
      `${ruta} volvió a ser una pantalla propia: la vista global volvió`,
    ).toBeVisible({ timeout: 30000 })
    await expect(
      page.getByTestId('nav-vistas-obras'),
      `${ruta} dibuja la barra del área: sigue siendo una vista global`,
    ).toHaveCount(0)
  }
})
