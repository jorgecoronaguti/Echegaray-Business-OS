import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { contarPorFiltro, perteneceAlCorte, type FilaDeConteo } from './personasService.ts'

// ═══ DIRECCIÓN ESTÁ EN EL PADRÓN, PERO NO ES UN OBRERO (dueño, 22/09/2026) ═══
//
// Textual: *«falta q agregues a rodrigo y a mi como receptores de plata»*. Para recibir efectivo a
// rendir hay que ser una PERSONA —`efectivo_entrega.persona_id` apunta a `personas`— y para firmar
// la conformidad desde el teléfono hay que tener el perfil atado a esa persona
// (`firmar_conformidad_entrega` exige `persona_id = mi_persona_id()`). Así que Rodrigo Echegaray y
// Jorge Corona entraron al padrón con `puesto = 'DIRECCIÓN'`.
//
// Medido en la base ANTES de escribir nada (ensayo en transacción con rollback, 22/09/2026): entrar
// al padrón los metía en tres listas que le piden a cada fila algo que a Dirección no le
// corresponde.
//
//   asistencia del día        18 → 20 personas a marcar presente o ausente, todos los días
//   señal «sin obra»           0 → 2 permanentes, con el verbo «Asignar» que nunca se puede cumplir
//   Plantel                   los rotulaba «Obreros»
//
// LA REGLA NO ES ESCONDER GENTE. Dirección no es un obrero al que se le marca asistencia ni se le
// reclama una obra: por eso la exclusión llega exactamente hasta donde la fila pide una acción que
// no corresponde. Donde la fila sólo CUENTA —el Plantel, la nómina de Analíticas, el padrón de
// categorías, el plantel de cada quincena— Dirección se queda: una fila escondida de un TOTAL lo
// hace mentir, una escondida de un RECLAMO lo hace honesto.
//
// Este archivo pone en rojo cualquiera de las tres exclusiones si alguien la saca.

const aqui = dirname(fileURLToPath(import.meta.url))
const fuente = (p: string) => readFileSync(join(aqui, p), 'utf8')
/** Sin comentarios: lo que se afirma es el código, no la prosa que lo explica. */
const codigo = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const fila = (x: Partial<FilaDeConteo> = {}): FilaDeConteo =>
  ({ en_la_empresa: true, obra_actual_id: 'quattropani', obra_actual: 'QP', puesto: null, ...x })

// ── 1 · LA SEÑAL «SIN ASIGNAR» ────────────────────────────────────────────────────────────────

test('«Sin asignar» no reclama obra a Dirección, y sigue reclamándosela a un obrero suelto', () => {
  const padron: FilaDeConteo[] = [
    fila(),
    fila({ obra_actual_id: null, obra_actual: null }),                            // un obrero suelto
    fila({ obra_actual_id: null, obra_actual: null, puesto: 'DIRECCIÓN' }),        // Rodrigo
    fila({ obra_actual_id: null, obra_actual: null, puesto: 'DIRECCIÓN' }),        // Jorge
  ]
  const c = contarPorFiltro(padron)
  assert.equal(c.sin_asignar, 1, 'Dirección volvió a contarse entre los que necesitan obra')
  // Y NO DESAPARECE DEL CENSO: «Plantel» los sigue contando a los cuatro. Si esto bajara a 2, la
  // exclusión habría dejado de ser un recorte de reclamo para volverse un borrado.
  assert.equal(c.plantel, 4, 'Dirección desapareció del plantel: el total del área ahora miente')
  assert.equal(c.en_obra, 1)
})

test('la regla del corte es UNA: Dirección fuera de «Sin asignar», adentro de «Plantel»', () => {
  const rodrigo = fila({ obra_actual_id: null, obra_actual: null, puesto: 'Dirección' })
  assert.equal(perteneceAlCorte(rodrigo, 'sin_asignar'), false)
  assert.equal(perteneceAlCorte(rodrigo, 'plantel'), true)
  // Un puesto parecido NO exime: «Administración» trabaja y se le asigna obra como a cualquiera.
  const admin = fila({ obra_actual_id: null, obra_actual: null, puesto: 'ADMINISTRACIÓN' })
  assert.equal(perteneceAlCorte(admin, 'sin_asignar'), true)
})

test('la lista del recorte y su chip cuentan lo mismo, y la entrada del área usa esa misma regla', () => {
  // Las dos caras del corte: el chip lo cuenta con `perteneceAlCorte` y la lista lo pide a la base.
  // Si la lista no sacara a Dirección, el chip diría 1 arriba de 3 filas.
  const svc = codigo(fuente('personasService.ts'))
  assert.match(svc, /filtro === 'sin_asignar' \? filas\.filter\(\(p\) => !esDireccion\(p\.puesto\)\) : filas/,
    'la lista de «Sin asignar» volvió a mostrar a Dirección y dejó de coincidir con su chip')
  assert.match(svc, /select\('en_la_empresa, obra_actual_id, obra_actual, puesto'\)/,
    'el conteo dejó de leer el puesto: sin ese dato la regla no puede aplicarse y vuelve a contar 2')

  // Y la entrada de Administración publica el MISMO número que Personal. Contarlo con `head: true`
  // era lo que impedía mirar el puesto: por eso la cuenta pasa por la regla, no por PostgREST.
  const entrada = codigo(fuente('entradaService.ts'))
  assert.match(entrada, /perteneceAlCorte\(f, 'sin_asignar'\)/,
    'la entrada del área volvió a contar «sin asignar» con su propia regla')
  assert.doesNotMatch(entrada, /is\('obra_actual_id', null\)/,
    'volvió el conteo por PostgREST, que no puede mirar el puesto')
})

// ── 2 · LA ASISTENCIA DEL DÍA ─────────────────────────────────────────────────────────────────

test('a Dirección no se le marca el día: no entra en la lista de la carga de asistencia', () => {
  // La lista es global (todo el plantel, no la gente de una obra), así que sin esta línea Rodrigo y
  // Jorge aparecían todos los días esperando que alguien declarara su jornada.
  assert.match(codigo(fuente('cargaDeAsistenciaService.ts')), /\.filter\(\(p\) => !esDireccion\(p\.puesto\)\)/,
    'la carga del día volvió a pedir la asistencia de Dirección')
})

// ── 3 · EL PLANTEL ────────────────────────────────────────────────────────────────────────────

test('el Plantel muestra a Dirección con su propio rótulo, y no la pinta de ámbar por no tener obra', () => {
  const tabla = codigo(fuente('../components/TablaPersonas.tsx'))
  // SIGUE EN LA LISTA —el Plantel es el censo— pero con el tercer grupo, no bajo «Obreros».
  assert.match(tabla, /agruparPorRolOrganizacional\(\s*personas, \(p\) => esJefeDeObra\(p\.puesto\), \(p\) => esDireccion\(p\.puesto\),\s*\)/,
    'Dirección volvió a caer en el grupo «Obreros» del plantel')
  assert.doesNotMatch(tabla, /const grupos = agruparPorRolOrganizacional\(personas, \(p\) => esJefeDeObra\(p\.puesto\)\)/)
  // El filo ámbar es la misma señal «sin obra asignada» dibujada en la fila: si el chip y la entrada
  // ya no la cuentan, pintarla igual deja dos filas en ámbar que nadie puede apagar.
  assert.match(tabla, /p\.en_la_empresa && !p\.obra_actual_id && !esDireccion\(p\.puesto\)/,
    'el filo ámbar volvió a reclamarle obra a Dirección')
  // Y la celda HOY no ofrece marcarle la jornada, por la misma razón que no se la ofrece al jefe.
  assert.match(tabla, /esJefe: esJefeDeObra\(p\.puesto\) \|\| esDireccion\(p\.puesto\)/,
    'la columna HOY volvió a ofrecer declarar la jornada de Dirección')
})

// ── 4 · DONDE DIRECCIÓN NO SE TOCA ────────────────────────────────────────────────────────────

test('ninguna cuenta de nómina, costo o quincena aprendió a esconder a Dirección', () => {
  // EL DEFECTO QUE ATRAPA: que mañana alguien «complete» la exclusión y la lleve a las pantallas
  // donde la fila no reclama nada, sólo suma. Ahí esconderla haría mentir a un total —cuánta gente
  // tiene la empresa, cuánto costó la mano de obra, qué plantel tuvo la quincena—, que es
  // exactamente el error opuesto y mucho más caro.
  for (const archivo of [
    'plantelDeLaQuincenaService.ts',    // el plantel que tuvo cada quincena
    'liquidacionPlantelActivo.ts',      // quién entra al cuadro de liquidación
    'costoObraQuincena.ts',             // el costo de mano de obra por obra
    '../../analiticas/services/empresa.ts', // el headcount de Analíticas
  ]) {
    assert.doesNotMatch(codigo(fuente(archivo)), /esDireccion/,
      `${archivo}: Dirección dejó de contarse donde su ausencia hace mentir a un total`)
  }
})
