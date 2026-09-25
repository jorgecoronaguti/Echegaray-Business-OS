import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// ═══ EL CANÓNICO 09 (OBRA PERSONAL), CONTRA EL FUENTE DEL MOCKUP ═══
//
// Medidas leídas de `09 · Obra Personal.dc.html`: banda `background:#FAFAF8` con hairline abajo,
// `padding:0 20px`, buscador de 200px en CAJA (borde 1px, radio 6px) y pastillas con su contador en
// mono de 10,5px. La acción primaria —«Asignar a frente»— es amarilla y vive arriba, no escondida.
//
// LO QUE ESTE TEST NO PRUEBA: que se vea así, ni que asignar escriba. Eso es una captura y una
// lectura del efecto, y las hace quien no escribió esto.

const DIR = dirname(fileURLToPath(import.meta.url))
const fuente = (archivo: string) => readFileSync(join(DIR, archivo), 'utf8')

test('la banda es UNA sola y va a sangre del marco de la ficha de obra', () => {
  const src = fuente('ListaHoyEnObra.tsx')
  // El defecto que atrapa: dos bandas apiladas —la de sub-vistas y la de filtros— que le sacan
  // 40px de alto a la lista que la persona vino a leer.
  //
  // 24/08/2026 · ERA `-mx-4 px-4 lg:-mx-10 lg:px-10` Y ESTABA MAL EN LOS DOS NÚMEROS. El marco de
  // la ficha es `w-full px-5` —20px, sin variante por breakpoint—, así que en escritorio la banda
  // se salía 20px por lado: la auditoría del módulo midió `scrollWidth` 1300 contra `innerWidth`
  // 1280 en Operación y en Documentos, con la página entera scrolleando de costado. 20px además es
  // lo que dice el canónico: `padding:0 20px` en la banda de «09 · Obra Personal.dc.html» y en la
  // de «11 · Obra Operación.dc.html».
  assert.match(src, /-mx-5 .*border-y border-line bg-surface-quiet px-5 /)
  assert.match(src, /data-testid="banda-personal"/)
  assert.match(src, /\{navegacion\}/)
})

test('el buscador de la banda es el de CAJA, no el hairline de arriba de una tabla', () => {
  // Sobre #FAFAF8 el hairline inferior no se ve y el campo queda flotando sin decir dónde empieza.
  const src = fuente('ListaHoyEnObra.tsx')
  assert.match(src, /variante="caja"/)
  assert.match(src, /className="w-\[200px\]"/)
  const ds = readFileSync(join(DIR, '../../../shared/components/ds/Controles.tsx'), 'utf8')
  assert.match(ds, /rounded-\[6px\] border border-line bg-surface px-2 py-1/)
  // Y el default NO cambia: doce pantallas usan el de línea.
  assert.match(ds, /variante = 'linea'/)
})

test('08 · asignar una persona se abre AHÍ MISMO con la primaria de 32px (48 en el teléfono)', () => {
  const src = fuente('TabPersonal.tsx')
  // El pedido del dueño, literal: «si quiero editar edite ahí mismo, no me sirve que me cargue y me
  // lleve a otro lado». Por eso la primaria NO va en la cabecera como enlace (24/09/2026 se probó y
  // se volvió atrás: recargaba la página): es un `<details>` que abre el formulario en el lugar.
  assert.match(src, /<Alta titulo="Asignar persona" testid="alta-asignacion" primaria>/)
  assert.match(src, /<Alta titulo="Asignar persona" testid="alta-asignacion-telefono" primaria telefono>/)
  assert.doesNotMatch(src, /abrirAsignar/)
  // Y el formulario es UNO: dos copias se separan en el primer campo que se agregue.
  assert.equal((src.match(/testid="form-asignar"/g) ?? []).length, 1)
})

test('08 · las cargas que el diseño no dibuja hablan su lenguaje, y ninguna se perdió (24/09/2026)', () => {
  const src = fuente('TabPersonal.tsx')
  const hh = fuente('PersonalHH.tsx')
  const tel = fuente('TabPersonalTelefono.tsx')
  // El defecto que atrapa: volver a los tres `Plegable` del DS genérico al pie, con una SEGUNDA
  // tabla de asignaciones que repetía la de «Quién está asignado».
  assert.doesNotMatch(src, /<Plegable|<Tabla[\s>]|function TablaAsignaciones/)
  assert.doesNotMatch(hh, /<Tabla[\s>]|<Tr[\s>]|<BotonAccion/)
  // Cerrar y quitar viven en la fila del 08 (escritorio) y en la hoja de la fila (teléfono).
  assert.match(src, /testid="cerrar-asignacion"/)
  assert.match(src, /testid="quitar-asignacion"/)
  assert.match(tel, /testid="cerrar-asignacion-telefono"/)
  assert.match(tel, /testid="quitar-asignacion-telefono"/)
  assert.match(src, /cerradas\.map\(\(a, i\) => \(\s*\n\s*<FilaAsignado/, 'las cerradas perdieron su fila y con ella «Quitar»')
  // Las dos imputaciones y el borrado de horas siguen siendo puertas.
  assert.match(src, /<Imputar titulo="Imputar horas" testid="alta-hh"/)
  assert.match(src, /<Imputar titulo="Imputar a la cuadrilla" testid="alta-hh-masiva"/)
  assert.match(src, /<TablaHoras registros=\{registros\} borrarHoras=\{borrarHoras\} \/>/)
  assert.match(src, /<TablaProductividad actividades=\{actividadHH\} \/>/)
  assert.match(hh, /testid="borrar-hh"/)
  // Las filas se reordenan por áreas en el teléfono: la lista de horas se dibuja UNA vez y el botón
  // de quitar no se duplica entre las dos caras.
  assert.equal((src.match(/<TablaHoras /g) ?? []).length, 1)
  // Sin colores crudos: todo sale de `canon/tokens`.
  for (const [nombre, texto] of [['TabPersonal', src], ['PersonalHH', hh], ['TabPersonalTelefono', tel]]) {
    assert.doesNotMatch(texto, /#[0-9A-Fa-f]{6}\b/, `${nombre} tiene un hex suelto`)
  }
})

test('08 · las cuatro cifras del diseño, y el costo NO se calcula', () => {
  const src = fuente('TabPersonal.tsx')
  for (const r of ['Asignados', 'HH esta semana', 'HH acumuladas', 'Costo de esas horas']) {
    assert.match(src, new RegExp(`rotulo="${r}"`), `falta la cifra ${r}`)
  }
  // El costo sale de la definición única (costo_de_obras_a_la_fecha), nunca «no se calcula» fijo.
  assert.doesNotMatch(src, /falta="no se calcula"/)
  assert.match(src, /manoObra\.importe != null \? plataMillones\(manoObra\.importe\)/)
  // Las seis columnas de «Quién está asignado», literales.
  assert.match(src, /<div>Persona<\/div><div>Categoría<\/div><div>Cuadrilla<\/div><div>Rol<\/div><div style=\{\{ textAlign: 'right' \}\}>HH sem\.<\/div><div>Desde<\/div>/)
  assert.match(src, /Horas por semana/)
})

test('las pastillas y la lista filtran con la MISMA regla, que vive fuera del componente', () => {
  const src = fuente('ListaHoyEnObra.tsx')
  assert.match(src, /cuentasDeHoy, estadoDeFila, filtrarHoy, FILTROS_HOY/)
  // El defecto que atrapa: una pastilla que cuenta con un criterio escrito en el .tsx y una lista
  // que filtra con otro. Dicen dos números distintos de la misma jornada y ningún test lo ve,
  // porque `node --test` no sabe leer un `.tsx`.
  assert.equal(/\.filter\(\(f\) => f\.marca\?\.estado === 'activo'\)/.test(src), false)
})

// La banda compartida de Operación y Documentos (canónicos viejos 09/11/12) se retiró el 23/09/2026:
// el ERP Obras 09–14 dibuja su propio nivel 3 (SubsOperacion, IndiceDocumentos) y su geometría la
// afirma geometria-obras.test.ts.

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// QUÉ DEFECTO ATRAPA ESTE ÚLTIMO BLOQUE (25/08/2026)
//
// `?vista=personal` NO DIBUJABA NADA. `TabPersonal` estaba importado en el `page.tsx` de la obra y
// nunca se montaba: el componente entero —banda, buscador, filtros, «Hoy en obra», asignaciones,
// plan contra real e imputaciones— existía completo y la pantalla salía en blanco. La única señal
// eran diez warnings de ESLint por variables sin usar, que no ponen roja ninguna corrida.
//
// Un test que renderizara el componente NO habría visto nada: el componente estaba bien. El defecto
// vivía en el cableado de la página, y por eso lo que se afirma acá es el MONTAJE — que se monta,
// con qué datos, con qué acciones y EN QUÉ CONTENEDOR.
//
// LO QUE NO PRUEBA: que la pantalla se vea bien ni que asignar escriba en `obra_asignacion`. Eso es
// una captura y la lectura del efecto en la base, y las hace quien no escribió esto.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

const PAGE = join(DIR, '../../../app/(main)/obras/[obra]/page.tsx')
const page = () => readFileSync(PAGE, 'utf8')

test('la solapa Personal MONTA su componente: era el defecto, la pantalla salía vacía', () => {
  assert.match(
    page(), /\{vista === 'personal' && \(\s*\n\s*<TabPersonal/,
    'TabPersonal volvió a estar importado sin montarse: `?vista=personal` dibuja una pantalla vacía',
  )
})

test('TabPersonal recibe los siete datos reales de la obra, ninguno fabricado acá', () => {
  const src = page()
  // Cada prop apunta a una variable que sale del `Promise.all` de la página, no a un literal: un
  // `asignaciones={[]}` compilaría igual y dibujaría «nadie asignado» en una obra con veinte.
  for (const [prop, dato] of [
    ['obraId', 'obraId'], ['plan', 'planPersonal'], ['asignaciones', 'asignaciones'], ['personas', 'personas'],
    ['cuadrillas', 'cuadrillas'], ['actividades', 'acts'], ['actividadHH', 'actividadHH'],
    ['registros', 'registros'], ['causas', 'causasDesvio'],
  ]) {
    assert.match(src, new RegExp(`\\n\\s+${prop}=\\{${dato}\\}`), `TabPersonal perdió ${prop}={${dato}}`)
  }
})

test('las seis acciones de Personal van atadas a ESTA obra con bind, nunca con una arrow', () => {
  const src = page()
  // Dos defectos a la vez. Uno: una arrow escrita en el servidor no es una server action —React la
  // rechaza en el navegador y la solapa queda en blanco—, y ni el typecheck ni el build lo ven.
  // Dos: el `obraId` viaja en el `bind` y no en un campo del formulario, que sería editable desde
  // el navegador y dejaría escribir sobre la obra de al lado.
  for (const [prop, accion] of [
    ['asignar', 'asignarPersona'], ['cerrar', 'cerrarAsignacion'], ['quitar', 'quitarAsignacion'],
    ['imputar', 'imputarHH'], ['imputarMasivo', 'imputarHHMasivo'], ['borrarHoras', 'borrarHH'],
  ]) {
    assert.match(
      src, new RegExp(`\\n\\s+${prop}=\\{${accion}\\.bind\\(null, obraId\\)\\}`),
      `la acción ${prop} de Personal dejó de atarse con ${accion}.bind(null, obraId)`,
    )
  }
})

test('Personal se monta DENTRO del marco con aire, que es lo que su banda descuenta', () => {
  const src = page()
  // El defecto que atrapa: montarla arriba, de borde a borde, como la 03/05/07. La banda de la 09
  // ya sale del marco sola con `-mx-5`, y ese 5 es el `px-5` de este contenedor: afuera se saldría
  // 20px por lado y la página scrollearía de costado (medido el 24/08, `scrollWidth` 1300 contra
  // `innerWidth` 1280). Es el mismo montaje que Operación y Documentos, que dibujan la misma banda.
  const marco = src.indexOf("'w-full px-5 pb-6 pt-3.5'")
  assert.ok(marco > 0, 'el contenedor con aire de la ficha de obra cambió de medida')
  assert.ok(src.indexOf('<TabPersonal') > marco, 'TabPersonal se montó fuera del marco con aire')
})

test('la presencia de hoy se lee UNA sola vez, y adentro de la solapa', () => {
  // El defecto que atrapa: leer `presencia_del_dia` dos veces en la misma pantalla —por
  // `HoyEnObra` y por la solapa—, llegando en momentos distintos y publicando dos jornadas
  // distintas de la misma obra. Desde el diseño 08/M10 la solapa la lee ella (`getPresencia`) y
  // `HoyEnObra` ya no se monta acá.
  const src = fuente('TabPersonal.tsx')
  assert.equal((src.match(/getPresencia\(/g) ?? []).length, 1)
  assert.equal((src.match(/<HoyEnObra[\s/>]/g) ?? []).length, 0)
  assert.equal((page().match(/<HoyEnObra[\s/>]/g) ?? []).length, 0)
})

test('la obra la RECIBE la solapa, no la adivina de la primera fila que encuentre', () => {
  // El defecto que atrapa: `plan?.obra_id ?? asignaciones[0]?.obra_id ?? actividades[0]?.obra_id`.
  // En una obra recién abierta —sin línea base, sin nadie asignado y sin actividades— las tres
  // fuentes dan `undefined`, la banda no se dibujaba y con ella se caía «+ Asignar persona»: la
  // pantalla desde la que se asigna a la primera persona era la única que no dejaba asignar.
  const src = fuente('TabPersonal.tsx')
  assert.doesNotMatch(src, /const obraId = /, 'la solapa volvió a deducir la obra en vez de recibirla')
  assert.match(src, /\n\s+obraId: string\n/, 'TabPersonal dejó de recibir la obra por prop')
  // Y la banda del canónico ya no cuelga de que esa deducción haya salido bien.
  assert.doesNotMatch(src, /\{obraId && \(/, 'la banda de la 09 volvió a esconderse cuando falta el dato')
})
