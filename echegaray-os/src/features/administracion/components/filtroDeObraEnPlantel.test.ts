import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// ═══ EL FILTRO POR OBRA DEL PLANTEL — LA FUENTE, NO EL RENDER ═══
//
// Mismo método que `canonico-personal-v2.test.ts`: lo que se protege son DECISIONES ESCRITAS —de qué
// lectura sale cada número, qué control dibuja los chips, de dónde sale cada enlace— y no un
// comportamiento de render. La REGLA del recorte se prueba de verdad, sobre las funciones puras, en
// `services/recorteDeObra.test.ts`.
//
// LO QUE ESTE TEST NO PRUEBA: que la fila se vea bien en un navegador ni que entre en 390px. Eso lo
// mide `tests/shell-dos-areas.spec.ts` con un navegador real, y hace falta mirarlo.

const DIR = dirname(fileURLToPath(import.meta.url))
const pagina = () => readFileSync(join(DIR, '../../../app/(main)/administracion/personas/page.tsx'), 'utf8')

/** El archivo SIN sus comentarios: acá se pregunta «¿usa X?» y los comentarios explican por qué NO
 *  se usa X — o sea que nombran justo lo que se está prohibiendo. */
const sinComentarios = (texto: string) => texto
  .split('\n')
  .filter((l) => {
    const t = l.trim()
    return !(t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || t.startsWith('{/*'))
  })
  .join('\n')

/** La fila de filtros por obra: su propio componente. */
const bloqueDeObra = () => sinComentarios(readFileSync(join(DIR, 'FiltroDeObraEnPlantel.tsx'), 'utf8'))

test('la fila de obra usa el control compartido de la pantalla, no una pastilla propia', () => {
  // ═══ EL DEFECTO QUE ATRAPA ═══
  //
  // Un chip nuevo dibujado a mano —con su borde, su radio y su color— mete un segundo lenguaje visual
  // en la misma pantalla para el mismo gesto. El v2 le sacó el borde a este control justo para no
  // volver a dibujar la caja que la tabla acaba de perder (`FiltrosSuaves.tsx`).
  const bloque = bloqueDeObra()
  assert.match(bloque, /<FiltrosSuaves\s+testid="filtro-obra"/, 'la fila de obra dejó de usar FiltrosSuaves')
  // Y LA PANTALLA LA DIBUJA: un componente que nadie monta es una fila que no existe.
  assert.match(sinComentarios(pagina()), /<FiltroDeObraEnPlantel/)
  assert.doesNotMatch(bloque, /#[0-9A-Fa-f]{3,8}\b/, 'apareció un color suelto: los colores salen de los tokens')
  assert.doesNotMatch(bloque, /borderRadius|border:|background:/, 'la fila se puso a dibujar su propia pastilla')
  // NI UN DESPLEGABLE: con cinco obras, un `select` esconde detrás de un clic lo que se mira ANTES de
  // elegir —cuánta gente hay en cada una—, y deja de ser un filtro para ser un formulario.
  assert.doesNotMatch(bloque, /<select|<Select/)
})

test('el recorte vive en la URL: cada enlace sale de la regla, ninguno se arma a mano', () => {
  // ═══ EL DEFECTO QUE ATRAPA ═══
  //
  // Un chip con `onClick` guarda el recorte en el navegador: no se comparte por mensaje, no sobrevive
  // a recargar y no vuelve con el botón de atrás. Y en esta pantalla —Server Component— un `onClick`
  // como prop compila el typecheck y tumba la página en producción (React #419).
  const bloque = bloqueDeObra()
  assert.doesNotMatch(bloque, /onClick|useState|'use client'/)
  const enlaces = bloque.match(/href:/g) ?? []
  const porLaRegla = bloque.match(/href: hrefDe\(\{/g) ?? []
  assert.ok(enlaces.length >= 3, 'la fila se quedó sin enlaces')
  assert.equal(porLaRegla.length, enlaces.length,
    'un enlace de la fila de obra se arma por fuera de la regla: ése es el que va a perder el recorte')
  const src = sinComentarios(pagina())
  assert.match(src, /hrefDe=\{\(cambios\) => armarHref\(sp, cambios\)\}/)
  // Y `armarHref` NO VUELVE A ESCRIBIR LA REGLA: la comparte con las otras dos solapas de la pantalla.
  assert.match(src, /function armarHref[\s\S]{0,400}?return enlaceConservando\(RUTA/)
  assert.doesNotMatch(src.slice(src.indexOf('function armarHref'), src.indexOf('const hrefAsistencia')),
    /new URLSearchParams/, 'el enlace del Plantel volvió a armar la URL por su cuenta')
})

test('el recorte por obra NO cruza a las otras solapas: el mismo parámetro, otro vocabulario', () => {
  // ═══ EL DEFECTO QUE ATRAPA ═══
  //
  // En el Plantel `?obra=` es el ID (`quattropani`); en Horas es el RÓTULO del chip («ME - BSA»).
  // Arrastrarlo de una solapa a la otra dejaría la grilla vacía con un slug crudo en el cartel del
  // filtro. Las tres solapas se enlazan con la URL escrita desde cero, y así tiene que quedar.
  const src = sinComentarios(pagina())
  const barra = src.slice(src.indexOf('function vistasDe'), src.indexOf('function vacioDe'))
  // UNA PUERTA (17/09/2026): las solapas de Personal se definen UNA vez, en `solapasDePersonal`, y la
  // del Plantel arranca en la ruta desnuda —sin `?obra=` de ninguna otra vista—.
  assert.match(barra, /solapasDePersonal\(activa, veLaPlata\)/, 'la barra dejó de usar la definición única de las solapas')
  assert.doesNotMatch(barra, /obra/, 'una solapa se puso a arrastrar el recorte por obra de otra vista')
  const solapas = sinComentarios(readFileSync(join(DIR, 'asistencia/carga/SolapasDeAsistencia.tsx'), 'utf8'))
  assert.match(solapas, /titulo: 'Plantel', cuenta: null, activa: activa === 'personal', href: RUTA_PERSONAL \}/, 'la solapa Plantel dejó de arrancar limpia')
  assert.match(solapas, /titulo: 'Asistencia', cuenta: null, activa: activa === 'asistencia', href: hrefCargaDeAsistencia\(\{\}\) \}/)
})

test('el buscador manda la obra puesta: escribir un nombre no borra el recorte', () => {
  // ═══ EL DEFECTO QUE ATRAPA ═══
  //
  // Un formulario manda SÓLO lo que declara. Sin este campo oculto, buscar «gonzalez» con una obra
  // elegida contestaba sobre el plantel entero y el recorte desaparecía sin que nadie lo apagara. Es
  // el mismo defecto que ya se pagó en la solapa Horas.
  const src = sinComentarios(pagina())
  assert.match(src, /oculto: \{ f: [^}]*obra: obraElegida \}/)
})

test('los chips cuentan el PADRÓN y la tabla se recorta con la regla probada', () => {
  // ═══ EL DEFECTO QUE ATRAPA ═══
  //
  // Alimentar los chips con `personas` —la lista que ya pasó por el buscador y por el propio recorte—
  // haría dos cosas malas a la vez: «QP - SALÓN COMERCIAL 3» pasaría a «1» al teclear tres letras, y
  // al elegir una obra los demás chips caerían a cero, que es cuando un filtro deja de ser un filtro
  // y se vuelve un informe de sí mismo.
  const src = sinComentarios(pagina())
  assert.match(src, /obrasDelCorte\(filasDelPadron, filtro, obraElegida\)/)
  assert.match(src, /sinObraDelCorte\(filasDelPadron, filtro\)/)
  assert.doesNotMatch(src, /obrasDelCorte\(personas/)
  // LA TABLA SE RECORTA CON LA MISMA REGLA QUE CUENTA LOS CHIPS, no con un `filter` escrito acá.
  assert.match(src, /const personas = filtrarPorObra\(listado\.data \?\? \[\], obraElegida\)/)
  // Y EL PADRÓN NO ES UN VIAJE MÁS: sale de la lectura que ya contaba las cuatro pastillas.
  assert.match(src, /conteos: padron\.conteos, filasDelPadron: padron\.filas/)
  assert.equal((src.match(/getConteosDeFiltro\(/g) ?? []).length, 1)
})

test('la segunda fila se distingue de la primera y no repite su conteo', () => {
  // Dos hileras de pastillas idénticas se leen como una sola lista de opciones excluyentes: elegir una
  // obra parecería apagar «Plantel». Y el par «12/17» escrito dos veces deja de decir cuánto se está
  // viendo y pasa a ser ruido.
  const bloque = bloqueDeObra()
  assert.match(bloque, /rotulo="Obra"/)
  assert.doesNotMatch(bloque, /conteo=/)
})

test('marcar presente, tardanza o retiro NO tira el recorte: se revalida, no se navega', () => {
  // ═══ EL DEFECTO QUE ATRAPA ═══
  //
  // El pedido del dueño es filtrar por obra JUSTO en la pantalla donde marca asistencias y tardanzas.
  // Si alguna de esas acciones redirigiera a `/administracion/personas` —o si el botón hiciera un
  // `router.push` a la ruta pelada—, cada marca devolvería el plantel entero desde arriba: habría que
  // volver a poner la obra y a bajar hasta la fila después de CADA clic. Con `revalidatePath` la
  // página se rearma sobre la misma URL, con `?obra=` puesto y sin saltar de lugar.
  const acciones = readFileSync(join(DIR, '../services/presenciaDelDiaActions.ts'), 'utf8')
  assert.match(acciones, /revalidatePath\('\/administracion\/personas'\)/)
  assert.doesNotMatch(sinComentarios(acciones), /redirect\(/,
    'una acción de la celda HOY volvió a redirigir: el recorte por obra se pierde en cada marca')
  for (const boton of ['MarcaTardanzaHoy.tsx', 'BotonPresenteHoy.tsx', 'BotonQuitarPresente.tsx']) {
    assert.doesNotMatch(sinComentarios(readFileSync(join(DIR, boton), 'utf8')), /router\.|useRouter/,
      `${boton} navega por su cuenta y perdería el recorte de la URL`)
  }
})

test('la tabla vacía por el recorte dice que es el recorte', () => {
  // Una pastilla que dice «Plantel 17» arriba de una tabla vacía manda a buscar el problema al lugar
  // equivocado: lo que la vació está en la fila de abajo. Sin esta línea, la salida —«Todas»— no está
  // a la vista de quien no sabe que el recorte existe.
  const src = sinComentarios(pagina())
  assert.match(src, /function vacioDe\(filtro: FiltroPersonal, q\?: string, obra\?: string\)/)
  assert.match(src, /if \(obra\) return '[^']*«Todas»[^']*'/)
  assert.match(src, /vacio=\{vacioDe\(filtro, sp\.q, obraElegida\)\}/)
})
