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
  // Y el que cuenta no puede inventar un 0 cuando la consulta falla: `FiltrosSuaves` no dibuja el
  // número si viene `null`, y `getConteosDeFiltro` devuelve `null` —no 0— ante un error.
  const servicio = sinComentarios(fuente('../services/personasService.ts'))
  assert.match(servicio, /return error \? null : count \?\? null/)
})

test('las tres señales retiradas siguen teniendo dónde leerse, una por una', () => {
  // SIN OBRA: celda en ámbar + filo en la fila + el recorte «Sin asignar».
  const tabla = codigoTabla()
  assert.match(tabla, /'sin asignar'/)
  assert.match(tabla, /FILO_BLOQUEA/)
  const servicio = sinComentarios(fuente('../services/personasService.ts'))
  assert.match(servicio, /sin_asignar/)
  // SIN FICHAR HOY: es la columna HOY, persona por persona.
  assert.match(tabla, /data-testid="hoy-persona"/)
  // PAPELES VENCIDOS: baja a la celda PAPELES, que es lo único que puede decir DE QUIÉN.
  assert.match(tabla, /data-testid="papeles-persona"/)
})

// ── LA COLUMNA PAPELES VOLVIÓ CONTANDO, NO CERTIFICANDO ─────────────────────────────────────────

test('la celda PAPELES no decide nada por su cuenta: la regla vive donde se puede probar', () => {
  // ═══ EL DEFECTO QUE ATRAPA ═══
  //
  // Escribir el `if` del rótulo dentro del JSX. Ahí la regla sólo se puede verificar montando React
  // o leyendo el archivo con una expresión regular —las dos formas de no probarla—, y es la regla
  // que decide si el OS afirma que un legajo está vacío. Vive en `rotuloDePapeles`, que se prueba
  // con `node --test` y sin base.
  const tabla = codigoTabla()
  assert.match(tabla, /rotuloDePapeles\(/)
  assert.doesNotMatch(tabla, /al día|vigente/i, 'la celda volvió a certificar vigencia')
  // El color es lo único que queda del lado del componente: un `.ts` no puede afirmar un hex.
  assert.match(tabla, /TINTA_PAPELES/)
})

test('una lectura que falló apaga SU columna y no publica una ausencia', () => {
  // ═══ EL DEFECTO QUE ATRAPA ═══
  //
  // `papelesLeidos` es lo que separa «no se pudo leer» de «no tiene papeles». Si alguien lo deduce
  // del mapa —«no está ⇒ no tiene»—, un error de RLS escribe «sin cargar» en 62 filas de un plantel
  // con 847 papeles cargados. Es la misma trampa que ya costó los seis falsos faltantes de Drive.
  assert.match(codigoPagina(), /papelesLeidos: papeles\.error == null/)
  assert.match(codigoTabla(), /leidos: pulso\?\.papelesLeidos \?\? false/)
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

test('la lista tiene las SEIS columnas del handoff v4, con su grilla literal', () => {
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
    src.includes('grid-cols-[minmax(220px,1.5fr)_minmax(150px,1fr)_130px_110px_90px_130px]'),
    'la grilla ancha dejó de ser la del handoff v4',
  )
  // «Obra» viaja por un ternario —«Última obra» en el corte de Inactivos—, así que se acepta el
  // rótulo escrito como hijo directo o como literal del ternario. Lo que se exige es que ESTÉ.
  for (const c of ['Persona', 'Puesto', 'Obra', 'Hoy', 'HH mes', 'Papeles']) {
    assert.ok(src.includes(`>${c}<`) || src.includes(`'${c}'`), `falta el rótulo ${c}`)
  }
  // Seis rótulos y seis celdas. Se cuentan sobre el cuerpo de la fila para que el encabezado no
  // infle el número.
  const cuerpo = src.slice(src.indexOf('{personas.map('))
  for (const celda of ['abrir-persona', 'puesto-persona', 'sin asignar', 'hoy-persona', 'hh-mes', 'papeles-persona']) {
    assert.ok(cuerpo.includes(celda), `la fila perdió la celda ${celda}`)
  }
})

test('PUESTO sale de la regla probada y su ausencia va APAGADA, no en ámbar', () => {
  // ═══ EL DEFECTO QUE ATRAPA ═══
  //
  // Dos, y por eso van las tres aserciones juntas.
  //
  //   1. Que la columna se llene con `p.puesto ?? p.especialidad` — un `??` pelado no MIRA el
  //      valor y publica «OFICIAL» o «MEDIO OFICIAL» como si fueran oficios: son categorías del
  //      convenio, o sea lo que la persona cobra, no lo que sabe hacer. La regla vive en
  //      `oficioVisible` y se prueba sin React en `vocabularioPersona.test.ts`.
  //   2. Que la ausencia se pinte en ámbar por inercia, copiando la celda de OBRA. Medido el
  //      05/09/2026: 53 de 78 filas tienen con qué llenar la columna y 25 quedan sin puesto. No
  //      saber el oficio de alguien no bloquea ninguna decisión de esta pantalla; no saber su obra
  //      sí. Ámbar es «esto bloquea» y gastarlo en 25 filas apaga la señal donde importa.
  const src = codigoTabla()
  assert.match(src, /oficioVisible\(p\.especialidad, p\.puesto\)/)
  assert.match(src, /\{oficio \?\? 'sin puesto'\}/, 'la ausencia dejó de usar la palabra del mockup')
  assert.match(src, /color: oficio \? V\.tintaSuave : V\.tenue/, 'la ausencia de puesto se pintó de ámbar')
})
