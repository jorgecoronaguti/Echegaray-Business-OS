import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PERSONAL_SE_DIBUJA, lecturasDeVista, type SubTareas } from './lecturasDeVista.ts'
import { COLUMNAS_PLAN } from './obrasService.ts'

// ═══ QUÉ DEFECTO ATRAPA ═══
//
// El workspace pedía `obra_plan_vs_real` y `obra_restriccion` en las SEIS solapas, y las usaba en
// tres. Medido contra PostgREST el 24/08/2026 con sesión de Dirección (mediana de 5 vueltas):
// `obra_plan_vs_real` de una obra son 864 ms —más que leer las diecisiete juntas, 488 ms, porque el
// filtro no baja a las CTEs agregadas de la vista—. Cronograma, Operación y Documentos pagaban esos
// 864 ms por un objeto que nunca llegaba a una prop.
//
// Si alguien vuelve a poner `plan: true` para todas las vistas, o saca el ternario del `Promise.all`
// y la lectura vuelve a salir siempre, este archivo se pone rojo por los dos lados: la matriz de
// abajo y la regla que lee el `page.tsx`.

const RAIZ = new URL('../../../..', import.meta.url).pathname
const PAGE = RAIZ + 'src/app/(main)/obras/[obra]/page.tsx'

/** Las ocho combinaciones vista/sub que el workspace sabe dibujar. */
const SOLAPAS: Array<[string, SubTareas]> = [
  ['resumen', null], ['tareas', 'arbol'], ['tareas', 'gantt'], ['tareas', 'parte'],
  ['personal', null], ['operacion', null], ['economia', null], ['documentos', null],
]

test('el plan sólo lo leen las solapas que lo DIBUJAN', () => {
  // La lista es la de las props `plan={...}` del `page.tsx`. Personal se cayó de ella el 25/08 no
  // porque hubiera dejado de necesitar el plan, sino porque su componente no estaba montado; volvió
  // el mismo día con el render. La lista se sigue leyendo del interruptor, no de una constante
  // escrita a mano, para que las dos cosas no puedan discrepar.
  const conPlan = SOLAPAS.filter(([v, s]) => lecturasDeVista(v, s).plan).map(([v]) => v).sort()
  assert.deepEqual(conPlan, PERSONAL_SE_DIBUJA
    ? ['economia', 'personal', 'resumen'] : ['economia', 'resumen'])
})

test('las restricciones sólo las leen Resumen y Operación', () => {
  const con = SOLAPAS.filter(([v, s]) => lecturasDeVista(v, s).restricciones).map(([v, s]) => s ? `${v}/${s}` : v)
  assert.deepEqual(con.sort(), ['operacion', 'resumen'])
})

test('el cronograma no paga NINGUNA de las cinco: dibuja el plan y los días hábiles', () => {
  // El canónico 07 no tiene panel de actividad: plantel, partes e impedimentos son de Tareas y de
  // Operación. El defecto que atrapa es el de siempre —una lectura que se dejó prendida «por si
  // acaso»— con el agravante de que acá se paga en cada visita al cronograma.
  const l = lecturasDeVista('tareas', 'gantt')
  assert.deepEqual(l, {
    personas: false, cuadrillas: false, partes: false, plan: false, planColumnas: null,
    restricciones: false, personal: false,
  })
})

test('ninguna solapa lee las cinco cosas: la matriz cobra por vista, no de fábrica', () => {
  for (const [v, s] of SOLAPAS) {
    const l = lecturasDeVista(v, s)
    // `planColumnas` no se cuenta: no es una lectura más, es CÓMO se pide `plan`, que ya está.
    const n = Object.entries(l).filter(([k, x]) => k !== 'planColumnas' && x).length
    assert.ok(n < 5, `${v}/${s} pide las cinco lecturas — si eso es correcto, hay que medirlo y decirlo acá`)
  }
})

test('la matriz no cambia según cómo se escribió la URL, sino según la vista ya resuelta', () => {
  // `resolverVistaObra` traduce los alias viejos ANTES de llegar acá. Una sub-vista que no existe no
  // puede activar lecturas: `?vista=tareas&sub=cualquiera` no es el Gantt.
  assert.equal(lecturasDeVista('tareas', null).plan, false)
  assert.equal(lecturasDeVista('tareas', null).restricciones, false)
  assert.equal(lecturasDeVista('gantt', null).restricciones, false)
})

test('el page.tsx pide plan y restricciones DETRÁS de la matriz, no siempre', () => {
  const fuente = readFileSync(PAGE, 'utf8')
  // El defecto original era literalmente estas dos líneas sin ternario adelante.
  assert.match(
    fuente, /necesita\.planColumnas === 'resumen' \? getPlanVsReal\(/,
    'getPlanVsReal volvió a ser incondicional',
  )
  assert.match(fuente, /necesita\.restricciones \? getRestricciones\(/, 'getRestricciones volvió a ser incondicional')
  assert.match(fuente, /lecturasDeVista\(vista,/, 'el page.tsx dejó de usar la matriz')
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// QUÉ DEFECTO ATRAPA ESTE SEGUNDO BLOQUE (25/08/2026)
//
// `?vista=personal` y el Resumen se caían con `canceling statement due to statement timeout`. El
// techo es del rol: `authenticated` corre con `statement_timeout = 8s`, y `pg_stat_statements` tenía
// registrados máximos de 4.209 ms para `obra_plan_vs_real` de una obra y 6.724 ms para la de todas.
//
// La causa no era un índice que faltara: la vista se apoya en `actividad_fechas`, que recorre las
// actividades de TODAS las obras —el `where obra_id` no le llega— y se re-evalúa TRES veces por
// consulta. Medido con EXPLAIN (ANALYZE, BUFFERS) como Dirección sobre `quattropani`, mediana de 5:
//
//   select *                     9.413 buffers    actividad_fechas, una evaluación   1.382 buffers
//   4 columnas (Personal)        4.572 buffers    ≈ 3 × 1.382 — ése es el piso irreductible
//   8 columnas (Economía)        4.577 buffers
//   19 columnas (Resumen)        9.405 buffers    `forecast_fin` arrastra el bloque entero
//
// Si alguien vuelve a poner `'*'` en el juego de Personal o de Economía —o borra una columna que la
// solapa sí dibuja— este bloque se pone rojo. Es la regla, no el rendimiento: lo que se afirma acá
// es QUÉ COLUMNAS dibuja cada solapa, y eso se puede probar sin base y sin servidor.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/** Lo que cada solapa lee de verdad del plan, verificado a mano contra el JSX que lo dibuja:
 *  Personal → `TabPersonal`; Economía → `TabEconomia`. */
const DIBUJA = {
  personal: ['obra_id', 'hh_plan', 'hh_real', 'desvio_hh_pct'],
  economia: [
    'obra_id', 'monto_presupuestado', 'margen_esperado', 'certificado', 'facturado', 'cobrado',
    'pendiente_certificar', 'por_cobrar_proyectado',
  ],
}

test('sólo las solapas que dibujan el plan piden un juego de columnas', () => {
  assert.equal(lecturasDeVista('resumen', null).planColumnas, 'resumen')
  assert.equal(lecturasDeVista('economia', null).planColumnas, 'economia')
  assert.equal(
    lecturasDeVista('personal', null).planColumnas, PERSONAL_SE_DIBUJA ? 'personal' : null,
  )
  for (const [vista, sub] of SOLAPAS) {
    const l = lecturasDeVista(vista, sub)
    // La bandera vieja y el juego nuevo no pueden contradecirse: si una dice que hay plan y la otra
    // que no, el `page.tsx` pide una consulta que nadie declaró o se saltea una que sí.
    assert.equal(l.plan, l.planColumnas !== null, `${vista}/${sub}: plan y planColumnas no coinciden`)
  }
})

test('Personal y Economía NO piden la vista entera — es la mitad del trabajo de la base', () => {
  for (const juego of ['personal', 'economia'] as const) {
    assert.notEqual(
      COLUMNAS_PLAN[juego], '*',
      `${juego} volvió a pedir obra_plan_vs_real completa: son 9.413 buffers contra 4.572`,
    )
    assert.deepEqual(
      COLUMNAS_PLAN[juego].split(','), DIBUJA[juego],
      `las columnas pedidas por ${juego} dejaron de ser las que dibuja`,
    )
  }
})

test('el Resumen pide la vista entera, y eso está declarado — no es un olvido', () => {
  // Medido: recortarlo a sus 19 columnas da 9.405 contra 9.413 buffers. Fingir un recorte acá sería
  // pagar un tipo `Pick<>` incómodo por cero milisegundos.
  assert.equal(COLUMNAS_PLAN.resumen, '*')
})

test('cada solapa consume el recorte que pidió, y no el de otra', () => {
  const fuente = readFileSync(PAGE, 'utf8')
  assert.match(fuente, /necesita\.planColumnas === 'personal' \? getPlanDePersonal\(/)
  assert.match(fuente, /necesita\.planColumnas === 'economia' \? getPlanDeEconomia\(/)
  // El defecto que esto atrapa: TabEconomia recibía `plan` (la vista entera del Resumen) mientras
  // su propia consulta recortada quedaba sin consumir — el ahorro medido no habría llegado nunca.
  assert.match(fuente, /<TabEconomia\s+plan=\{planEconomia\}/, 'TabEconomia dejó de usar su recorte')
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// QUÉ DEFECTO ATRAPA ESTE TERCER BLOQUE (25/08/2026) — EL MÁS CARO DE LOS TRES
//
// `TabPersonal` se importaba en el `page.tsx` y NUNCA se montaba: `<TabPersonal` sólo existía en el
// commit 605f8357 y se cayó del JSX sin que nadie lo notara. `?vista=personal` seguía disparando
// SIETE consultas —`obra_plan_vs_real`, `obra_asignacion`, `causa_desvio`, `registros_hh`,
// `obra_actividad_hh`, `persona_plantel` y `cuadrilla_panel`— para no pintar una sola fila, y con
// ellas se llevaba puesta la ficha entera de la obra por `statement timeout`.
//
// El riesgo de arreglarlo cortando por lo sano era el opuesto: que quien repusiera el render se
// encontrara la pantalla sin datos. Por eso las lecturas no se borraron, se apagaron desde UN
// interruptor, y este bloque ata las dos puntas EN LOS DOS SENTIDOS — si `<TabPersonal` vuelve al
// `page.tsx` y el interruptor sigue en `false`, esto se pone rojo; y si mañana el componente se
// vuelve a caer del JSX con el interruptor en `true`, también. El render volvió el 25/08.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test('las lecturas de Personal siguen al render de Personal, en los dos sentidos', () => {
  const montado = /<TabPersonal[\s/>]/.test(readFileSync(PAGE, 'utf8'))
  assert.equal(
    PERSONAL_SE_DIBUJA, montado,
    montado
      ? '`<TabPersonal` volvió al page.tsx: poné PERSONAL_SE_DIBUJA en true o la solapa dibuja vacío'
      : '`<TabPersonal` no está montado: PERSONAL_SE_DIBUJA tiene que ser false o se pagan 7 consultas para tirarlas',
  )
  const l = lecturasDeVista('personal', null)
  for (const clave of ['personal', 'personas', 'cuadrillas', 'plan'] as const) {
    assert.equal(l[clave], montado, `la lectura «${clave}» no sigue al render de Personal`)
  }
})

test('las cuatro lecturas propias de Personal pasan por la matriz, no por la vista suelta', () => {
  const fuente = readFileSync(PAGE, 'utf8')
  // El defecto: cuatro ternarios `vista === 'personal' ?` que ignoraban la matriz, así que apagar
  // la solapa en un lugar no apagaba nada.
  assert.doesNotMatch(
    fuente, /vista === 'personal' \?/,
    'una lectura de Personal volvió a decidirse sola, fuera de lecturasDeVista',
  )
  for (const lectura of ['getAsignaciones', 'getCausasDesvio', 'getActividadHH']) {
    assert.match(fuente, new RegExp(`necesita\\.personal \\? ${lectura}\\(`), `${lectura} no pasa por la matriz`)
  }
  assert.match(fuente, /necesita\.personal \|\| esParte \? getRegistrosHH\(/)
})
