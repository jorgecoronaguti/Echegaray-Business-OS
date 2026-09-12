import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// ═══ EL CANÓNICO «19 · PERSONAL», DESPUÉS DEL HANDOFF CRM / ADMINISTRACIÓN v4 ═══
//
// Mismo método que `canonico-proveedores-v2.test.ts`: lo que se protege son DECISIONES ESCRITAS
// —qué columnas hay, qué mide cada una, qué NO se dibuja porque no tiene fuente— y no un
// comportamiento de render. Montar React para leer un estilo que ya está literal en el archivo mete
// un runtime entero entre la afirmación y el hecho.
//
// LO QUE ESTE TEST NO PRUEBA: que la pantalla se vea así en un navegador, ni que las lecturas
// devuelvan lo que se espera. La REGLA de la celda PAPELES —lo único que decide algo acá— se prueba
// aparte y de verdad, sobre la función pura, en `services/pulsoDelPlantel.test.ts`.
//
// ═══ EL DEFECTO CARO QUE ATRAPA ═══
//
// Que la banda de señales vuelva por inercia al portar otra pantalla, o —peor— que se saque sin
// dejar dónde leer lo que falta. Las dos mitades van juntas: sacar la banda y dejar los recortes
// mudos no simplifica la pantalla, esconde el trabajo.

const DIR = dirname(fileURLToPath(import.meta.url))
const fuente = (a: string) => readFileSync(join(DIR, a), 'utf8')
const pagina = () => readFileSync(join(DIR, '../../../app/(main)/administracion/personas/page.tsx'), 'utf8')

/**
 * El archivo SIN sus comentarios.
 *
 * Varias de estas comprobaciones preguntan «¿esta pantalla usa X?», y los comentarios de este repo
 * explican POR QUÉ NO se usa X — o sea que nombran justo lo que se está prohibiendo. Sin el filtro,
 * el test se pone rojo por la explicación de la decisión correcta: el falso positivo que enseña a
 * borrar el comentario.
 */
const sinComentarios = (texto: string) => texto
  .split('\n')
  .filter((l) => {
    const t = l.trim()
    return !(t.startsWith('//') || t.startsWith('*') || t.startsWith('/*'))
  })
  .join('\n')

const codigoPagina = () => sinComentarios(pagina())
const codigoTabla = () => sinComentarios(fuente('TablaPersonas.tsx'))

// ── LA BANDA SE FUE, Y LO QUE DECÍA SIGUE LEGIBLE ───────────────────────────────────────────────

test('la banda de señales NO vuelve: lo que falta se lee en la fila y en su recorte', () => {
  // ═══ EL DEFECTO QUE ATRAPA ═══
  //
  // Hasta el handoff v4 la pantalla abría con «Lo que pide trabajo»: hasta tres señales antes de la
  // lista, contando lo que la fila ya dice en su propia celda. La v4 lo saca de las pantallas de
  // área. Las cuatro aserciones valen JUNTAS: sin el recorte con su cuenta, sacar la banda esconde
  // el trabajo en vez de acercarlo, y ése es el modo de falla que este test existe para impedir.
  const src = codigoPagina()
  assert.equal(src.includes('<TrabajoDeSeccion'), false, 'volvió la banda de señales')
  assert.equal(src.includes('senalesDePersonal'), false, 'volvió el cálculo que alimentaba la banda')
  assert.ok(src.indexOf('<CabeceraSeccion') > 0, 'la pantalla abre por su cabecera')
  assert.match(src, /cuenta: conteos\[f\.valor\]/, 'los recortes quedaron mudos al irse la banda')
})

test('los recortes cuentan LA POBLACIÓN DEL CORTE, no lo que sobrevive a la búsqueda', () => {
  // ═══ EL DEFECTO QUE ATRAPA ═══
  //
  // Alimentar el contador con `personas.length` —la lista ya filtrada— haría que «Sin asignar 4»
  // pasara a «Sin asignar 1» al escribir en el buscador: la empresa tendría menos trabajo pendiente
  // porque alguien tecleó tres letras. Los cuatro números salen de `count` sobre la base.
  const src = codigoPagina()
  assert.match(src, /getConteosDeFiltro\(supabase\)/)
  assert.doesNotMatch(src, /cuenta: personas\.length/)
  // Y EL QUE CUENTA NO PUEDE INVENTAR UN 0 CUANDO LA CONSULTA FALLA: `FiltrosSuaves` no dibuja el
  // número si viene `null`, y `getConteosDeFiltro` devuelve `null` —no 0— ante un error.
  //
  // ACÁ SE COMPRUEBA QUE LA RAMA DE ERROR EXISTE, NO CÓMO ESTÁ ESCRITA (12/09/2026). Esta línea decía
  // `assert.match(servicio, /return error \? null : count \?\? null/)`, o sea clavaba la forma EXACTA
  // de una expresión: el día que los cuatro `count` se juntaron en un viaje —medido, cada uno costaba
  // 216-250 ms de red para 1,4 ms de consulta— este test se puso en rojo sin que la garantía se
  // hubiera roto. La garantía de verdad se mide llamando al servicio con un cliente que falla, y eso
  // vive en `services/viajes-por-pantalla.test.ts` («las pastillas van SIN número — nunca en cero»),
  // que se comprobó en rojo revirtiendo el arreglo.
  const servicio = sinComentarios(fuente('../services/personasService.ts'))
  assert.match(servicio, /if \(error\) return \{[^}]*plantel: null/,
    'getConteosDeFiltro se quedó sin rama de error: una lectura fallida podría dibujar «Inactivos 0»')
})

test('las tres señales retiradas siguen teniendo dónde leerse, una por una', () => {
  // SIN OBRA: celda en ámbar + filo en la fila + el recorte «Sin asignar».
  const tabla = codigoTabla()
  assert.match(tabla, /'sin asignar'/)
  assert.match(tabla, /FILO_BLOQUEA/)
  const servicio = sinComentarios(fuente('../services/personasService.ts'))
  assert.match(servicio, /sin_asignar/)
  // EL DÍA DE HOY: es la columna HOY, persona por persona — la asistencia cargada, no el fichaje
  // (ver el test de abajo y `docs/engineering/UX_ASISTENCIA_VS_HORAS.md`).
  assert.match(tabla, /data-testid="hoy-persona"/)
  // PAPELES VENCIDOS: desde el 08/09/2026 la lista NO tiene celda de papeles (orden del dueño:
  // «quitar la columna Papeles de la sección Plantel»); la señal se lee en la ficha de la persona.
  // En su lugar la fila publica LEGAJO y ALTA, los del recibo de sueldo.
  assert.doesNotMatch(tabla, /data-testid="papeles-persona"/)
  assert.match(tabla, /data-testid="legajo-persona"/)
  assert.match(tabla, /data-testid="alta-persona"/)
})

// ── LA COLUMNA HOY DICE LA ASISTENCIA, NO EL FICHAJE ────────────────────────────────────────────

test('la columna HOY no vuelve a decir «sin fichar» sobre todo el plantel', () => {
  // ═══ EL DEFECTO QUE ATRAPA (08/09/2026, captura del dueño) ═══
  //
  // La celda escribía «● sin fichar», con punto ámbar, en las diecisiete filas: leía `estadoHoy()`
  // sobre `asistencia_marca`, una capacidad con cuatro marcas de prueba en toda su historia. El
  // silencio de una capacidad sin estrenar se publicaba como una novedad diaria sobre la gente.
  //
  // Revertir el arreglo devuelve `HOY_LABEL`/`estadoHoy` a este archivo y pone las tres en rojo.
  const tabla = codigoTabla()
  assert.doesNotMatch(tabla, /sin fichar|no fich|Fichados/i, 'la columna volvió a hablar de fichaje')
  assert.doesNotMatch(tabla, /HOY_LABEL|estadoHoy\(/, 'volvió el vocabulario del fichaje a la celda')
  // Dueño, 08/09/2026 (tarde): «no mezclemos eso de presente con las hs al lado, no sirve». La celda
  // HOY dice SÓLO la presencia; la cantidad tiene su columna (HH MES). Revertir devuelve la capa.
  assert.doesNotMatch(tabla, /data-capa="horas"/, 'la columna HOY volvió a pegar las horas al lado de la presencia')
  // Y lo que dibuja sale de la MISMA regla que `/administracion/personas/en-obra`: `clasificar()`
  // vía `rotuloHoy`. Una segunda copia del `if` sería una segunda definición de «ausencia».
  assert.match(tabla, /rotuloHoy\(/)
  assert.match(tabla, /hayMarcaDeHoy\(/, 'el ● de presencia dejó de derivarse de la falta de horas')
})

// ── LA COLUMNA PAPELES VOLVIÓ CONTANDO, NO CERTIFICANDO ─────────────────────────────────────────

test('la columna PAPELES se retiró de Plantel (08/09/2026, orden del dueño) y no volvió', () => {
  const tabla = codigoTabla()
  assert.doesNotMatch(tabla, /papeles-persona|CeldaPapeles|TINTA_PAPELES|rotuloDePapeles\(/)
  assert.ok(!tabla.includes('>Papeles<'), 'volvió el rótulo Papeles')
})

test('la celda PAPELES (retirada) no decidía nada por su cuenta: la regla sigue donde se puede probar', () => {
  // ═══ EL DEFECTO QUE ATRAPA ═══
  //
  // Escribir el `if` del rótulo dentro del JSX. Ahí la regla sólo se puede verificar montando React
  // o leyendo el archivo con una expresión regular —las dos formas de no probarla—, y es la regla
  // que decide si el OS afirma que un legajo está vacío. Vive en `rotuloDePapeles`, que se prueba
  // con `node --test` y sin base.
  // La regla vive en `pulsoDelPlantel.rotuloDePapeles` y se prueba en su propio test; la tabla ya
  // no la consume. Lo que se sostiene acá es que la lista no volvió a certificar vigencia.
  assert.doesNotMatch(codigoTabla(), /al día|vigente/i, 'la lista volvió a certificar vigencia')
})

test('una lectura que falló apaga SU columna y no publica una ausencia', () => {
  // ═══ EL DEFECTO QUE ATRAPA ═══
  //
  // `papelesLeidos` es lo que separa «no se pudo leer» de «no tiene papeles». Si alguien lo deduce
  // del mapa —«no está ⇒ no tiene»—, un error de RLS escribe «sin cargar» en 62 filas de un plantel
  // con 847 papeles cargados. Es la misma trampa que ya costó los seis falsos faltantes de Drive.
  assert.match(codigoPagina(), /papelesLeidos: papeles\.error == null/)
  // Y el error se sigue mostrando arriba con su texto: una columna apagada sin decir por qué es una
  // pantalla que se rompió en silencio.
  assert.match(codigoPagina(), /sin-lectura-\$\{f\.clave\}/)
})

test('a quien ya no está no se le pregunta por sus papeles ni por su día', () => {
  // «Inactivos» dibuja otra geometría —sin HOY, sin HH, sin PAPELES— y la página ni pide esas tres
  // lecturas. No es sólo ahorro: la columna diría «sin cargar» de 45 legajos cerrados hace un año.
  const tabla = codigoTabla()
  assert.match(tabla, /const COLS_BAJA/)
  assert.match(codigoPagina(), /const conPulso = filtro !== 'inactivos'/)
})

// ── LA GEOMETRÍA Y LAS COLUMNAS DEL HANDOFF v4 ───────────────────────────────────────────────────

test('la lista tiene las SIETE columnas (handoff v4 sin Papeles, más Legajo y Alta), con su grilla literal', () => {
  // ═══ 08/09/2026 ═══ Papeles se retiró por orden del dueño; entran LEGAJO (70px) y ALTA (90px),
  // los dos del recibo de sueldo. La grilla sigue siendo literal por la misma razón de siempre.

  // ═══ EL CONTRATO CAMBIÓ (05/09/2026) ═══
  //
  // `Administración v4 · Pantallas.dc.html`, bloque «1 · PERSONAL», dibuja seis columnas:
  // PERSONA · PUESTO · OBRA · HOY · HH MES · PAPELES, sobre
  // `minmax(220px,1.5fr) minmax(150px,1fr) 130px 110px 90px 130px`. El porte anterior tenía cinco:
  // el oficio iba pegado al nombre, en 11,5px, compitiendo por el ancho de lo único que identifica
  // una fila. No es «editar un test para que pase»: el diseño manda.
  //
  // ═══ EL DEFECTO QUE ATRAPA ═══
  //
  // Que la grilla y los rótulos dejen de tener la MISMA cantidad de pistas. Una columna de más o de
  // menos corre la fila entera respecto de su cabecera y la pantalla se sigue dibujando, con cada
  // dato bajo el rótulo equivocado — que es peor que no dibujarse.
  const src = codigoTabla()
  assert.ok(
    src.includes('grid-cols-[minmax(220px,1.5fr)_minmax(150px,1fr)_130px_110px_90px_70px_90px]'),
    'la grilla ancha dejó de ser la del handoff v4',
  )
  // «Obra» viaja por un ternario —«Última obra» en el corte de Inactivos—, así que se acepta el
  // rótulo escrito como hijo directo o como literal del ternario. Lo que se exige es que ESTÉ.
  // «Categoría» y no «Puesto» desde el 07/09/2026: el campo guarda la categoría de convenio, que
  // es la que decide la tarifa. Es el rótulo que pidió el dueño.
  for (const c of ['Persona', 'Categoría', 'Obra', 'Hoy', 'HH mes', 'Legajo', 'Alta']) {
    assert.ok(src.includes(`>${c}<`) || src.includes(`'${c}'`), `falta el rótulo ${c}`)
  }
  // Seis rótulos y seis celdas. Se cuentan sobre el cuerpo de la fila para que el encabezado no
  // infle el número.
  //
  // EL ANCLA ES LA FILA, NO EL `map` (08/09/2026). Antes cortaba en `{personas.map(` y el día que
  // la lista se partió en secciones —jefes de obra arriba, obreros abajo— ese texto dejó de
  // existir: `indexOf` devolvió -1, `slice(-1)` dejó UN carácter y las siete aserciones se
  // volvieron falsas de golpe, sin que la fila hubiera perdido ninguna celda. `fila-persona` es lo
  // que el test dice medir y no cambia con la forma de iterar.
  const cuerpo = src.slice(src.indexOf('data-testid="fila-persona"'))
  for (const celda of ['abrir-persona', 'categoria-persona', 'sin asignar', 'hoy-persona', 'hh-mes', 'legajo-persona', 'alta-persona']) {
    assert.ok(cuerpo.includes(celda), `la fila perdió la celda ${celda}`)
  }
})

test('CATEGORÍA sale de la regla probada y su ausencia va APAGADA, no en ámbar', () => {
  // ═══ EL DEFECTO QUE ATRAPA ═══
  //
  // Tres, y por eso van las aserciones juntas.
  //
  //   1. Que la columna se llene con `p.categoria ?? p.puesto` — un `??` pelado no MIRA el valor y
  //      publicaría «Albañil» como si fuera una categoría del convenio. La regla vive en
  //      `categoriaVisible` y se prueba sin React en `vocabularioPersona.test.ts`.
  //   2. Que la ausencia se pinte en ámbar por inercia, copiando la celda de OBRA. No saber la
  //      categoría de alguien no bloquea ninguna decisión de esta pantalla; no saber su obra sí.
  //      Ámbar es «esto bloquea» y gastarlo acá apaga la señal donde importa.
  //   3. Que vuelva el OFICIO. El 07/09/2026 el dueño pidió lo contrario —«quiero que se vea la
  //      categoría en lugar del puesto»— y la razón es económica: la categoría es lo que liquida.
  const src = codigoTabla()
  assert.match(src, /categoriaVisible\(p\.categoria, p\.puesto\)/)
  assert.match(src, /\{categoria \?\? 'sin categoría'\}/, 'la ausencia dejó de usar la palabra de la columna')
  assert.match(src, /color: categoria \? V\.tintaSuave : V\.tenue/, 'la ausencia de categoría se pintó de ámbar')
  assert.doesNotMatch(src, /oficioVisible/, 'volvió el oficio a la columna que el dueño pidió para la categoría')
})