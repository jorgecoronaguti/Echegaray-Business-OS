// QUÉ LEE CADA SOLAPA DE LA OBRA — la matriz, en un solo lugar y en una función pura.
//
// ═══ POR QUÉ EXISTE ESTE ARCHIVO ═══
//
// El `Promise.all` del workspace ya cobraba por vista: cada lectura cuelga de un ternario
// (`vista === 'personal' ? getAsignaciones(...) : null`). Pero tres lecturas se habían quedado
// INCONDICIONALES, y dos de ellas no las usa ni la mitad de las solapas. La más cara del workspace
// —`obra_plan_vs_real`— era una de esas.
//
// ═══ LO MEDIDO (24/08/2026, PostgREST real, sesión de Dirección, mediana de 5) ═══
//
//   obra_plan_vs_real de UNA obra ······ 864 ms  (mínimo 390, máximo 2.586)
//   obra_plan_vs_real de las 17 obras ·· 488 ms
//
// Leer UNA obra sale más caro que leer las diecisiete: el `where obra_id = …` no baja a las CTEs
// agregadas de la vista (`hh`, `hh_plan`, `pres`, `cert` agrupan sobre TODAS las obras igual), así
// que el filtro no ahorra trabajo y encima empuja al planificador a un plan peor. Ese es el número
// que se pagaba en las TRES solapas que ni siquiera miran el resultado.
//
// `plan` lo consumen Resumen, Personal y Economía —y nadie más—. `restricciones` las consumen
// Resumen, Cronograma y Operación. Verificado contra el JSX del `page.tsx`: son las únicas que
// reciben la prop.
//
// ═══ Y NO ALCANZABA CON DECIDIR *SI* SE PIDE: HAY QUE DECIDIR *QUÉ COLUMNAS* (25/08/2026) ═══
//
// La solapa Personal y el Resumen se caían con «canceling statement due to statement timeout». El
// techo lo pone Postgres: el rol `authenticated` corre con `statement_timeout = 8s`.
//
// Medido con EXPLAIN (ANALYZE, BUFFERS) como Dirección sobre `quattropani` (135 actividades de las
// 377 que hay en la base), mediana de 5 — los buffers, no los ms, porque el tiempo depende de con
// quién más esté compitiendo la base y los buffers son el trabajo que se pide:
//
//   obra_plan_vs_real  select *                        9.413 buffers · 29,7 ms
//   obra_plan_vs_real  las 4 columnas de Personal      4.572 buffers · 15,5 ms   −51 %
//   obra_plan_vs_real  las 8 columnas de Economía      4.577 buffers · 16,4 ms   −51 %
//   obra_plan_vs_real  las 19 columnas del Resumen     9.405 buffers · 27,2 ms    −0 %
//
// POR QUÉ EL RESUMEN NO AHORRA NADA Y LAS OTRAS DOS AHORRAN LA MITAD: la vista se apoya en
// `actividad_fechas`, que recorre las 377 actividades de las diecisiete obras —el `where obra_id`
// no le llega— y cuesta 1.382 buffers cada vez que se la evalúa. `obra_plan_vs_real` la evalúa
// TRES veces (4.572 ≈ 3 × 1.382, que es exactamente el piso que paga hasta un `select obra_id`).
// Personal y Economía no dibujan ni una fecha del plan, así que al no pedirlas el planificador poda
// dos de las tres evaluaciones. El Resumen SÍ dibuja `forecast_fin` —una sola columna que lleva
// el bloque entero: pedirla sube de 4.572 a 9.211 buffers—, y por eso paga la vista completa.
//
// LO QUE NO ES: no es un índice que falte (medido: filtrar `actividad_fechas` por obra cuesta 1.378
// buffers contra 1.382 sin filtrar — bajar el filtro no ahorra nada, así que no hay migración de
// pushdown que valga la pena). Es que las vistas están apiladas y las hojas se re-evalúan.
//
// LA MATRIZ VIVE ACÁ Y NO EN EL `page.tsx` porque una regla que sólo existe adentro de un componente
// de servidor no se puede probar sin levantar el servidor y la base. Acá es una función pura y su
// test tarda milisegundos. Es la misma lección de `test-que-afirma-el-estado-del-mundo`.
//
// CÓMO SE AGREGA UNA LECTURA NUEVA: se agrega su bandera acá, se declara qué solapas la piden, y el
// test de la matriz obliga a decidirlo. Una lectura sin bandera es una lectura que pagan las seis.

/** ═══ EL INTERRUPTOR DE LA SOLAPA PERSONAL (25/08/2026) ═══
 *
 *  `TabPersonal` —la solapa entera: plantel, HH por actividad, imputaciones y `HoyEnObra`— se
 *  importa en el `page.tsx` y NUNCA se monta. Se cayó del JSX y nadie lo notó: ESLint lo venía
 *  avisando con diez warnings de variables sin usar (`asignaciones`, `causasDesvio`, `actividadHH`,
 *  las seis acciones de personal y el propio import del componente).
 *
 *  Mientras tanto `?vista=personal` disparaba SIETE consultas para tirarlas, entre ellas la más cara
 *  del workspace. Eso es lo que hacía caer la pantalla con `canceling statement due to statement
 *  timeout`: no se caía dibujando, se caía juntando datos que nadie iba a dibujar.
 *
 *  NO SE BORRÓ EL COMPONENTE NI SU CABLEADO: le falta el render, no los datos, y reponerlo es de
 *  quien esté portando el canónico 09. Lo que se cortó es el gasto, y se cortó DESDE ACÁ para que
 *  volver a prenderlo sea una sola línea en vez de reconstruir seis ternarios. `lecturasDeVista.test`
 *  ata las dos cosas: el día que `<TabPersonal` vuelva al `page.tsx`, el test se pone rojo hasta que
 *  esta constante diga `true`. */
export const PERSONAL_SE_DIBUJA = false

/** Las sub-vistas de la solapa Tareas. `null` cuando la solapa activa no es Tareas. */
export type SubTareas = 'arbol' | 'gantt' | 'parte' | null

/** Los tres recortes de `obra_plan_vs_real` que se piden hoy. `resumen` es la vista entera: no es
 *  que nadie lo haya mirado, es que el Resumen dibuja `forecast_fin` y medirlo dio el mismo costo
 *  que `select *` (9.405 contra 9.413 buffers). */
export type JuegoDeColumnasDelPlan = 'resumen' | 'personal' | 'economia'

/** Qué tiene que leer el workspace para dibujar esta solapa. Todo lo que diga `false` es una
 *  consulta a Supabase que NO sale — no una que sale y se descarta al renderizar. */
export type LecturasDeVista = {
  /** El plantel. Personal y el parte diario. */
  personas: boolean
  /** Las cuadrillas. Personal, el parte diario y el árbol de tareas. */
  cuadrillas: boolean
  /** Los partes de ejecución. El parte diario y «último movimiento» del Resumen. */
  partes: boolean
  /** `obra_plan_vs_real`. LA MÁS CARA: 864 ms medidos. Sólo Resumen, Personal y Economía. */
  plan: boolean
  /** QUÉ COLUMNAS de `obra_plan_vs_real` dibuja esta solapa. `null` cuando no la pide.
   *
   *  No es un detalle de la consulta: es la mitad del costo. Cada juego tiene su tipo `Pick<>` en
   *  `obrasService`, así que una solapa que empiece a dibujar una columna que no pidió no compila
   *  —en vez de dibujar `undefined`, que se lee igual que un dato que falta. */
  planColumnas: JuegoDeColumnasDelPlan | null
  /** `obra_restriccion`. Resumen (las abiertas) y Operación (los impedimentos). */
  restricciones: boolean
  /** Las CUATRO lecturas que sólo existen para la solapa Personal: `obra_asignacion`,
   *  `causa_desvio`, `registros_hh` y `obra_actividad_hh`. Van juntas porque las dibuja un solo
   *  componente: si no se monta, ninguna de las cuatro tiene destino. Ver `PERSONAL_SE_DIBUJA`. */
  personal: boolean
}

/**
 * La matriz completa, calculada de la vista y la sub-vista YA RESUELTAS por `resolverVistaObra`
 * —o sea, después de traducir los alias viejos (`?vista=gantt` → `tareas/gantt`)—. Recibe los
 * nombres canónicos, no lo que vino en la URL: decidir sobre el crudo haría que un marcador viejo
 * cobrara distinto que el link de la solapa.
 */
export function lecturasDeVista(vista: string, sub: SubTareas): LecturasDeVista {
  const enTareas = vista === 'tareas'
  const esArbol = enTareas && sub === 'arbol'
  const esParte = enTareas && sub === 'parte'

  // ═══ EL CRONOGRAMA DEJÓ DE PAGAR TRES LECTURAS (24/08/2026 · porte del canónico 07) ═══
  //
  // Las pedía para el PANEL de la actividad que vivía al lado del Gantt —plantel, partes e
  // impedimentos—. Ese panel es la pantalla 03 (Tareas): el canónico 07 dibuja plazo y nada más.
  // La 07 lee las actividades y los días hábiles de la obra, y con eso dibuja las tres capas.
  const enPersonal = vista === 'personal' && PERSONAL_SE_DIBUJA
  return {
    personas: enPersonal || esParte,
    cuadrillas: enPersonal || esParte || esArbol,
    partes: esParte || vista === 'resumen',
    plan: vista === 'resumen' || enPersonal || vista === 'economia',
    planColumnas: juegoDeColumnas(vista),
    restricciones: vista === 'resumen' || vista === 'operacion',
    personal: enPersonal,
  }
}

/** QUIÉN PIDE QUÉ RECORTE. Se calcula de la vista sola: la sub-vista de Tareas no lee el plan.
 *
 *  Devolver el juego y no un booleano deja el `page.tsx` sin decisión propia — si la matriz dice
 *  `personal`, el servicio pide las cuatro columnas de Personal y no hay una segunda tabla en el
 *  componente de servidor que se pueda desincronizar de ésta. */
function juegoDeColumnas(vista: string): JuegoDeColumnasDelPlan | null {
  if (vista === 'resumen') return 'resumen'
  if (vista === 'personal') return PERSONAL_SE_DIBUJA ? 'personal' : null
  if (vista === 'economia') return 'economia'
  return null
}
