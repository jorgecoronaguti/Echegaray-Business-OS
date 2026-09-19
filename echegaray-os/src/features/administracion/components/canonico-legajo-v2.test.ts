import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// ═══ EL CANÓNICO «20 · PERSONA LEGAJO 360 v2», VERIFICADO CONTRA EL FUENTE ═══
//
// LOS DEFECTOS CAROS QUE ATRAPA:
//
//  · LA VUELTA DEL SLAB. Esta ficha se coronó con un `EntityHeader` blanco y después con un slab
//    grafito; el v2 no tiene ninguna cabecera de color.
//  · UNA ARROW EN LUGAR DE `args`/`bind`. `accion={() => darDeBaja(id)}` compila, pasa `build` y
//    deja la pantalla EN BLANCO en producción.
//  · AFIRMAR SOBRE LO QUE NO SE LEYÓ. Publicar 0 HH sin haber leído los registros diría que la
//    persona no trabajó este mes.
//  · MANDAR A OTRA PANTALLA EN LUGAR DEL NÚMERO. Las HH se leían sólo en dos caras y las otras
//    cuatro escribían «se lee en Horas» donde iba la cifra. Dueño, 17/09/2026: *«la pantalla, en
//    vez del número, manda a otra pantalla; eso no es un dato, es una excusa»*.
//  · DECIR «AL DÍA» SOBRE LOS PAPELES. El legajo no lleva vencimientos — eso sería afirmar un
//    control que nadie está haciendo.
//  · EL NOMBRE DE UNA TABLA EN PANTALLA. Los avisos y los pies explicaban la implementación con
//    `documento_legajo` entre comillas invertidas. En pantalla nunca van nombres de tablas.
//  · EL MISMO BLOQUE DOS VECES. La tira de $/h vive en la cabecera de las seis caras: repetirla
//    dentro de la solapa Retribución la mostraba dos veces seguidas en la misma pantalla.

const DIR = dirname(fileURLToPath(import.meta.url))
const fuente = (a: string) => readFileSync(join(DIR, a), 'utf8')
const pagina = () => readFileSync(join(DIR, '../../../app/(main)/administracion/personas/[id]/page.tsx'), 'utf8')

const sinComentarios = (texto: string) => texto
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .split('\n')
  .filter((l) => {
    const t = l.trim()
    return !(t.startsWith('//') || t.startsWith('*') || t.startsWith('/*'))
  })
  .join('\n')

const codigoPagina = () => sinComentarios(pagina())
const codigoCostado = () => sinComentarios(fuente('CostadoLegajo.tsx'))

test('el legajo abre con la miga y el nombre, sin slab y sin PageShell', () => {
  const src = codigoPagina()
  assert.match(src, /<Migas/)
  assert.match(src, /<TituloDeFicha/)
  assert.doesNotMatch(src, /CabeceraFicha|BarraContexto|<PageShell/)
  assert.doesNotMatch(src, /TiraMetricas|TarjetaFicha/, 'el v2 no dibuja tarjetas ni métricas en celdas')
})

test('el nombre se dibuja en oración pero el dato no se toca', () => {
  assert.match(codigoPagina(), /oracion\(persona\.nombre_completo\)/)
})

test('dar de baja y reincorporar van por `args`, nunca por una arrow', () => {
  const src = codigoPagina()
  assert.match(src, /accion=\{darDeBaja\} args=\{\[id\]\}/)
  assert.match(src, /accion=\{reincorporar\} args=\{\[id\]\}/)
  assert.doesNotMatch(src, /accion=\{\(\) =>/)
})

// LAS HH SE LEEN EN LAS SEIS CARAS (dueño, 17/09/2026). El control cambia de objeto: antes cuidaba
// que la ausencia de lectura se declarara; ahora cuida que la lectura OCURRA en todas las caras, que
// no haya vuelto la excusa, y que un error de lectura no se disfrace de «sin imputar».
test('las horas se leen en todas las caras, no sólo en dos', () => {
  const src = codigoPagina()
  assert.ok(!/vista === 'horas' \|\| vista === 'resumen'/.test(src), 'las HH ya no dependen de la cara')
  // En el mismo paralelo que las otras tres lecturas de la cabecera, no en un `await` suelto.
  assert.match(src, /const \[asignaciones, documentos, valorHora, horas\] = await Promise\.all\(/)
})

test('la cifra de HH nunca manda a otra pantalla en lugar del número', () => {
  // Sin comentarios: la cabecera del archivo CITA la frase vieja para explicar por qué se fue, y
  // prohibirla también ahí enseñaría a borrar el porqué en vez de sacarlo de la pantalla.
  assert.ok(!codigoPagina().includes('se lee en Horas'), 'eso no es un dato, es una excusa')
})

test('una lectura de HH que falló no se escribe «sin imputar»', () => {
  // «sin imputar» afirma que nadie cargó horas. Si la consulta falló, lo que no se pudo es mirar.
  const src = codigoPagina()
  assert.match(src, /falta: horas\.error \? 'no se pudo leer' : 'sin imputar'/)
  assert.equal((src.match(/falta: horas\.error \? 'no se pudo leer' : 'sin imputar'/g) ?? []).length, 2,
    'las dos cifras de HH —mes y año— distinguen el error de la ausencia')
})

test('las HH se escriben con su unidad y el punto de miles, no como «1605»', () => {
  const src = codigoPagina()
  assert.match(src, /hh\(mes\.trabajadas\)/)
  assert.match(src, /hh\(anio\.trabajadas\)/)
  assert.match(src, /toLocaleString\('es-AR'[^)]*\)\} h/)
})

test('la primaria amarilla existe SÓLO cuando hay algo que resolver con ella', () => {
  const src = codigoPagina()
  assert.equal((src.match(/<AccionPrimaria/g) ?? []).length, 1)
  assert.match(src, /!egresada && !vigente && \(\s*<AccionPrimaria/)
})

test('la ficha nunca PUBLICA que los papeles estén «al día»', () => {
  const src = codigoPagina()
  assert.doesNotMatch(src, />\s*al día\s*</, 'sin fecha de vencimiento eso afirma un control que nadie hace')
  assert.doesNotMatch(src, /tonoIndicador/, 'el indicador verde del aside anterior no puede volver')
})

// ═══ EN PANTALLA NUNCA VA UN NOMBRE DE TABLA (dueño, 17/09/2026) ═══
//
// *«Un cartel técnico con el nombre de una tabla y comillas invertidas. En pantalla NUNCA van
// nombres de tablas ni explicaciones de implementación: es la regla del OS.»*
//
// Se mira el CÓDIGO SIN COMENTARIOS: los comentarios de este repo SÍ nombran las tablas —es donde
// tienen que estar— y prohibirlos ahí enseñaría a borrar la trazabilidad en vez de sacarla de la
// vista del usuario.
test('ningún nombre de tabla llega a la pantalla del legajo', () => {
  const fuentes = [codigoPagina(), sinComentarios(fuente('RetribucionDelLegajo.tsx')),
    sinComentarios(fuente('ValorHoraDelLegajo.tsx')), codigoCostado(),
    sinComentarios(fuente('../services/valorHoraDelLegajo.ts'))]
  const TABLAS = /documento_legajo|persona_tarifa|persona_legajo|recibo_sueldo_linea|registros_hh|entidad_cambio|asistencia_dia/
  for (const src of fuentes) {
    const sucia = src.split('\n').find((l) => TABLAS.test(l))
    assert.ok(sucia === undefined, `nombre de tabla en código dibujado: ${sucia}`)
  }
})

// ═══ LA SOLAPA AUDITORÍA SE FUE, Y NO PUEDE VOLVER SOLA ═══
test('el legajo no ofrece la cara de auditoría ni la dibuja', () => {
  const src = codigoPagina()
  assert.ok(!/BloqueAuditoria|getBitacora|v === 'auditoria'|vista === 'auditoria'/.test(src),
    'la solapa, su lectura y su bloque se retiraron')
  assert.ok(!/auditoria/i.test(sinComentarios(fuente('../services/vistasFicha.ts'))),
    'la clave no puede quedar en la lista: dibujaría una solapa sin contenido')
})

// UN FAVORITO CON `?v=auditoria` NO PUEDE DAR 404 NI PANTALLA VACÍA: la clave desconocida cae en
// «resumen», que es la misma red que atrapa cualquier `?v=` mal escrito.
test('un ?v= que ya no existe cae en el resumen', () => {
  assert.match(codigoPagina(), /VISTAS_FICHA\.find\(\(v\) => v === sp\.v\) \?\? 'resumen'/)
})

// LA RETRIBUCIÓN YA NO ESTÁ AUSENTE (dueño, 15/09/2026: «quiero ver a primer golpe de vista cuánto
// se le está pagando por hora»). Sale de `persona_tarifa` y no de `persona_legajo`, que sigue sin
// publicar la columna. El control cambia de objeto: antes cuidaba que la ausencia se declarara; ahora
// cuida que el número esté arriba y que no se dibuje a partir de una lectura que la RLS negó.
test('el $/h que se paga está arriba del todo, antes de los avisos y de la tira de cifras', () => {
  const src = codigoPagina()
  assert.match(src, /<ValorHoraDelLegajo/)
  assert.doesNotMatch(src, /falta: 'no llega a esta pantalla'/, 'la retribución ya llega: el cartel viejo miente')
  const tira = src.indexOf('<ValorHoraDelLegajo')
  assert.ok(tira > 0 && tira < src.indexOf('<CifrasDeFicha'), 'el $/h va ANTES de la tira de cifras')
  assert.ok(tira < src.indexOf('<AvisoDeFicha'), 'el $/h va ANTES de los avisos')
})

test('el $/h no se dibuja a partir de una lectura que la RLS negó', () => {
  const src = codigoPagina()
  // `liquida_sueldos()` excluye al jefe de obra, que abre este legajo, y devuelve cero filas SIN
  // error: sin pasarle el permiso, «no puedo ver» se dibujaría igual que «nadie lo cargó».
  assert.match(src, /const liquida = liquidaSueldos\(rolActor\)/)
  assert.match(src, /puedeVer: liquida,/)
})

test('la solapa Retribución se esconde Y se cierra sin permiso, y su lectura no corre en otra vista', () => {
  const src = codigoPagina()
  // Esconder el tab y leer igual dejaría los sueldos en el HTML para el que sepa mirar la respuesta.
  assert.match(src, /liquida \|\| v !== 'retribucion'/, 'la solapa no se ofrece a quien no liquida sueldos')
  assert.match(src, /vista === 'retribucion' && !liquida/, '`?v=retribucion` a mano dice «sin permiso»')
  assert.match(src, /vista === 'retribucion' && liquida\s*\?\s*await getRetribucionDelLegajo/, 'la lectura cara sólo en su solapa y con permiso')
  // La tira de arriba enlaza a la sección sólo para quien puede entrar.
  assert.match(src, /hrefRetribucion=\{liquida \? href\('retribucion'\) : null\}/)
})

test('el estado sale de `en_la_empresa` y no de la fecha de egreso', () => {
  // Hay 15 personas que se fueron sin baja documentada: por la fecha figurarían activas.
  assert.match(codigoPagina(), /const egresada = !persona\.en_la_empresa/)
})

test('el costado acompaña a las seis caras y no se vuelve una solapa', () => {
  const src = codigoPagina()
  assert.match(src, /<CostadoDeFicha/)
  assert.match(src, /<CostadoLegajo/)
  // Y es lo único que se reemplaza cuando se abre el panel de edición.
  assert.match(src, /editar\s*\n?\s*\? \(/)
})

// ═══ EL MISMO NÚMERO UNA SOLA VEZ EN LA PANTALLA (dueño, 17/09/2026) ═══
//
// La tira `ValorHoraDelLegajo` vive en la cabecera de las SEIS caras. Cualquier otro lugar que
// dibuje `rotulo.pactado`/`rotulo.recibo`/`rotulo.piso` lo está repitiendo en la misma pantalla.
test('el $/h vigente se dibuja UNA vez: el bloque no se repite dentro de Retribución', () => {
  const seccion = sinComentarios(fuente('RetribucionDelLegajo.tsx'))
  assert.ok(!seccion.includes('retribucion-vigente'))
  assert.ok(!/d=\{rotulo\.(pactado|recibo|piso)\}/.test(seccion),
    'esos tres números ya están en la tira de la cabecera, treinta píxeles más arriba')
})

test('el costado no repite el $/h que la tira de arriba ya publica', () => {
  assert.ok(!codigoPagina().includes("k: 'Retribución'"))
})

test('un rótulo del costado sin nada debajo no se dibuja', () => {
  assert.match(codigoCostado(), /meses\.length > 0 && \(/)
})

test('un mes sin registros escribe «—» y nunca 0', () => {
  assert.match(codigoCostado(), /m\.horas \?\? '—'/)
})

test('la solapa de la cuenta se esconde Y la cara se cierra', () => {
  const src = codigoPagina()
  assert.match(src, /veLaCuenta \|\| v !== 'usuario'/, 'la solapa no se ofrece')
  assert.match(src, /vista === 'usuario' && !veLaCuenta/, '`?v=usuario` a mano tampoco entra')
})
