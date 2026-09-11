// LA FILA DEL CLIENTE DE `/clientes`: DE DÓNDE SALE CADA NÚMERO QUE DIBUJA, Y QUÉ NO PUEDE DECIR.
//
// ═══ QUÉ DEFECTO ATRAPA ═══
//
// Esta tabla dibuja, en la MISMA fila, números de plata que vienen de preguntas distintas:
//
//   COLUMNA «CONTRATADO»  lo contratado de las obras EN CURSO (`contratado_en_curso`). Es el que
//                         tiene que cerrar contra la suma de las filas de obra que cuelgan debajo.
//   CELDA «COBRADO»       lo cobrado ACUMULADO del cliente (`cobrado_neto_total`) sobre lo
//                         contratado de TODAS sus obras (`contratadoTotal`). Va así porque
//                         `cobranzas` anota el cobro contra el CLIENTE y no contra la obra.
//   COLUMNA «OC · OP»     el total de los PDF que mandó el cliente, CON IVA. Nunca se resta ni se
//                         compara directo contra lo contratado, que es neto.
//
// El error fácil —y el que este test impide— es pasarle al cobro `c.contratado`, que es la columna
// de al lado: compila, se dibuja, y publica una fracción de dos universos distintos que nadie puede
// detectar mirando la pantalla.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { frasesDeObras } from '../services/cartera.ts'

// LA TABLA SON DOS ARCHIVOS DESDE EL 10/09/2026: la GRILLA —qué columnas hay y cuándo se sueltan—
// y las CELDAS —qué dice cada una cuando el dato falta—. El canon mira las dos juntas, en ese orden,
// porque las reglas que prueba cruzan de una a la otra (la fila pasa la prop, la celda la dibuja).
const codigo = () => ['./TablaClientes.tsx', './CeldasDeCartera.tsx']
  .map((f) => readFileSync(fileURLToPath(new URL(f, import.meta.url)), 'utf8'))
  .join('\n')

/** El bloque de la celda de cobro DEL CLIENTE (la de la obra tiene su propio `testid`). */
function cobroDelCliente(): string {
  const src = codigo()
  const donde = src.indexOf('testid="cobro-cliente"')
  assert.notEqual(donde, -1, 'no existe la celda de cobro del cliente: este test quedó mirando al aire')
  const abre = src.lastIndexOf('<Cobrado', donde)
  return src.slice(abre, src.indexOf('/>', donde) + 2)
}

test('el cobro del cliente NO se divide por el contratado de la columna de al lado', () => {
  const celda = cobroDelCliente()
  assert.match(
    celda, /contratado=\{c\.contratadoTotal\}/,
    'el denominador del cliente tiene que ser el contratado de TODAS sus obras (`contratadoTotal`), '
    + 'no el de las que están en curso: el cobro es acumulado y no distingue obra',
  )
  assert.doesNotMatch(celda, /contratado=\{c\.contratado\}/)
})

test('lo cobrado del cliente sale de la vista y no de la suma de sus obras', () => {
  assert.match(cobroDelCliente(), /cobrado=\{c\.cobradoTotal\}/)
})

// ═══ LA COLUMNA «COBRADO» ES EL TOTAL CON IVA, COMO EN LA PESTAÑA OBRAS (10/09/2026) ═══
//
// El dueño cruzó esta pantalla contra OBRAS y no coincidía ninguna de las nueve obras: la app
// dibujaba `cobrado_neto`. El neto se sigue leyendo —es lo único comparable contra un contratado
// neto— pero no es lo que la columna publica.

test('ninguna celda de esta tabla dibuja el cobrado NETO', () => {
  const src = codigo()
  assert.doesNotMatch(src, /cobrado=\{o\.cobradoNeto\}/)
  assert.doesNotMatch(src, /cobrado=\{c\.cobradoNeto\}/)
  assert.match(src, /cobrado=\{o\.cobradoTotal\}/, 'la fila del trabajo publica el total, igual que OBRAS')
  assert.match(src, /Cobrado c\/IVA/, 'y el rótulo dice la especie: sin eso, dos columnas vecinas invitan a restar')
})

test('la barra lleva el contrato a la especie del cobro, y lo declara', () => {
  const src = codigo()
  assert.match(src, /progresoDeCobroBruto/, 'dividir bruto por neto da porcentajes que no existen')
  assert.match(src, /contratado × 1,21/, 'el supuesto del IVA se declara en el `title` de la columna')
})

// ═══ EL PORCENTAJE NO SE PUBLICA CON UN DENOMINADOR INCOMPLETO ═══
//
// `cobrado_neto_total` suma TODAS las obras del cliente y `contratado` sólo las que tienen precio en
// OBRAS. San Francisco publicaba «100 % cobrado» dividiendo $132.415.646 —de sus 5 obras— por
// $109.592.102 —de 4—. El importe es un hecho y se publica igual; el porcentaje, no.

test('el % del cliente sólo sale si NINGUNA de sus obras quedó sin precio', () => {
  assert.match(
    cobroDelCliente(), /medible=\{c\.obrasSinPrecio === 0\}/,
    'sin esta condición, una obra sin precio en OBRAS convierte la fracción en dos universos',
  )
})

test('la fila del cliente no vuelve a leer el campo del formulario de la obra', () => {
  // `obra_panel.monto_contratado` es la definición que el hito H1 borró: la que sumaba las obras
  // cerradas de Messina y publicaba $1.504 de contratado en Quattropani.
  assert.doesNotMatch(codigo(), /monto_contratado/)
})

// ═══ LO QUE EL DUEÑO MANDÓ SACAR (10/09/2026) ═══

// ═══ LOS NÚMEROS DE LAS OC, DEBAJO DEL NOMBRE (dueño, 10/09/2026 16:20) ═══
//
// «Esta pantalla sigue sin mostrar el nº de OC». A la mañana los retiré porque colgaban del nombre
// en monoespaciado y mezclaban OC con OP; el error fue sacarlos en vez de arreglarlos: con el total
// solo, ME - BSA muestra «5 OC» y ningún número, y el número es lo que se busca —es lo que el
// cliente cita en su orden de pago y en su factura—.

test('cada trabajo dibuja los números de SUS órdenes de compra, y el detalle se abre desde la fila', () => {
  const src = codigo()
  assert.match(src, /<OrdenesDeLaObra ordenes=\{ocDeLaObra\}/, 'los números no se dibujan')
  // La fila crece a dos líneas SOLO cuando hay números: si no, el hueco se ve como un error.
  assert.match(src, /ocDeLaObra\.length \? ALTO_V2\.hijaConOrdenes : ALTO_V2\.hija/)
  // EL BOTÓN DE LA CELDA SE FUE porque la FILA ENTERA abre el detalle: dos puertas al mismo panel,
  // una encima de la otra, eran dos zonas de clic para lo mismo.
  assert.match(src, /href=\{hrefOrdenes\(o\.obra_id\)\}/)
})

// ═══ EL TOTAL DE OC ES EL DE LA VENTANA, Y EL HISTÓRICO SE NOMBRA APARTE ═══
//
// BSA absorbió `bsa-planta` con tres OC de 2024 por $38.321.214: la celda sumaba todo y publicaba
// «$ 49.886.583 · 5 OC» al lado de un contratado de $17,7 M. Son dos años distintos comparados sin
// avisar.

test('la celda de OC publica la ventana del contratado y no suma el histórico', () => {
  const src = codigo()
  assert.match(src, /pesos\(o\.ocCivaVentana\)/)
  // EL HISTÓRICO NO SE DIBUJA: era el segundo renglón que el dueño llamó confuso. Se dice entero en
  // el `title`, y sobre todo NO se suma al total de la ventana.
  assert.match(src, /son órdenes de otros años/)
  assert.doesNotMatch(src, /ocCivaVentana \+ .*ocCivaHistorico/, 'los dos totales no se suman')
})

test('un trabajo sin OC lo dice, en vez de dejar la celda vacía', () => {
  // Quattropani no tiene orden de compra: tiene un contrato en dólares, que se lee en la columna
  // Contratado. Una celda vacía en una columna de papeles se lee como «se perdió el papel».
  assert.match(codigo(), /n === 0\n\s+\? 'sin OC'/)
})

test('la moneda del contrato se dice: U$S arriba y su valuación de hoy debajo', () => {
  const src = codigo()
  assert.match(src, /o\.contratadoUsd != null\n\s+\? dolares\(o\.contratadoUsd\)/)
  assert.match(src, /data-testid="contratado-en-pesos"/)
  assert.match(src, /≈ \{pesos\(o\.contratado\)\}/)
  // Y el TC con el que se valuó, en el `title`: sin eso el número en pesos cambia solo y nada lo dice.
  assert.match(src, /valuado al tipo de cambio de hoy/)
})

test('cobrar más que el contrato NO se pinta de alarma, se explica', () => {
  const src = codigo()
  assert.doesNotMatch(src, /p\.excede \? V\.warn/, 'el ámbar de este OS significa problema, y esto es plata cobrada')
  assert.doesNotMatch(src, /\{p\.pct\} %<\/span>\s*\)\s*: null/)
})

test('la fila no vuelve a marcar en ámbar lo que la pantalla ya no explica', () => {
  const src = codigo()
  assert.doesNotMatch(
    src, /FILO_BLOQUEA/,
    'el filo ámbar decía «le falta el CUIT o el teléfono» sin nada en pantalla que lo dijera: '
    + 'es una cifra sin rótulo, y el dueño mandó sacar esas aclaraciones dos veces',
  )
  assert.doesNotMatch(src, /sin teléfono|sin jefe|sin medir|sin certificar/)
})

test('los rótulos de las dos columnas de papeles dicen que llevan IVA', () => {
  // El Adicional Tercer Muro: OC $12.100.000 contra $10.000.000 contratados = el mismo número ×1,21.
  // Sin el «c/IVA» en el rótulo, las dos columnas vecinas invitan a una resta que da $2.100.000 de
  // nada. La unidad va en el RÓTULO y no sólo en el `title`: si no, hay que pasar el mouse.
  const src = codigo()
  assert.match(src, />OC c\/IVA</)
  assert.match(src, />OP c\/IVA</)
})

test('«sin obra en curso» dejó de escribirse en la celda de plata', () => {
  const src = codigo()
  assert.doesNotMatch(
    src, /'sin obra en curso'/,
    'ARCOR decía «1 obra», «sin obra en curso» y «ninguna obra en ejecución» en la misma fila: '
    + 'lo dice la columna Obras, una sola vez',
  )
  assert.doesNotMatch(src, /'ninguna obra en ejecución'/)
})

// ═══ CUÁNTAS OBRAS TIENE — la frase, probada sin pantalla ═══

test('«11 obras» con 5 filas debajo se reemplaza por el desglose que las explica, EN UNA LÍNEA', () => {
  // UNA cadena y no dos: dibujarlas en dos renglones de 12 y 10,5px metía dos escalas en una celda
  // —«hay mezcla de diseño», dueño 10/09/2026— y sugería que el segundo número era menos cierto.
  assert.equal(frasesDeObras({ obras: 11, nEnCurso: 5, nCerradas: 6 }), '5 en curso · 6 cerradas')
  assert.equal(frasesDeObras({ obras: 1, nEnCurso: 0, nCerradas: 1 }), '1 cerrada')
  assert.equal(frasesDeObras({ obras: 3, nEnCurso: 0, nCerradas: 3 }), '3 cerradas')
  assert.equal(frasesDeObras({ obras: 1, nEnCurso: 1, nCerradas: 0 }), '1 en curso')
  assert.equal(frasesDeObras({ obras: 0, nEnCurso: 0, nCerradas: 0 }), 'sin obras')
})

test('sin leer la vista NO se escribe «0 en curso»: se dice el total y se dice que es total', () => {
  // Es el caso del jefe de obra, a quien `cliente_economia` le devuelve cero filas por `ve_economia()`.
  assert.equal(
    frasesDeObras({ obras: 11, nEnCurso: null, nCerradas: null }), '11 en total',
    'un control que no pudo mirar no puede afirmar que no hay ninguna en curso',
  )
  assert.equal(frasesDeObras({ obras: 0, nEnCurso: null, nCerradas: null }), 'sin obras')
})

test('un cliente sin trabajos en curso no dibuja guiones: no hay universo que sumar', () => {
  // «Guiones por todos lados» fue textual del dueño. Un «—» significa «falta el dato»; a un cliente
  // sin nada en curso no le falta ninguno — no hay pregunta. Su columna «Trabajos» ya dice
  // «1 terminada» y la celda vacía se lee contra esa frase.
  assert.match(codigo(), /c\.enCurso\.length \? SIN_PRECIO_EN_OBRAS : ''/)
})

test('el «·» de un total incompleto lleva su explicación', () => {
  // «$ 524.163.838 · 148 OC ·»: noventa de esas OC no declaran importe en el PDF, y el punto final
  // se lee como un tipeo. Sin `title`, el total afirma más de lo que sabe.
  const total = readFileSync(fileURLToPath(new URL('./TotalDePapeles.tsx', import.meta.url)), 'utf8')
  assert.match(total, /title=\{total\.parcial \? PARCIAL : undefined\}/)
  assert.match(total, /const PARCIAL = /)
})

// ═══ LA COLUMNA MARGEN SE FUE (dueño, 10/09/2026 15:33) ═══
//
// «Quitá esa columna Margen, no es útil». El margen es una pregunta de la OBRA —contra su costo
// real, su avance y su certificación— y acá se dibujaba contra un contratado que en cuatro de las
// cinco filas de Messina no era un precio sino la suma viva de Cobranzas.

test('la tabla no dibuja el margen ni su porcentaje', () => {
  const src = codigo()
  assert.doesNotMatch(src, />\{veEconomia \? 'Margen' : ''\}</)
  assert.doesNotMatch(src, /pctTexto|margenPct/, 'el % del margen se fue con la columna')
  assert.doesNotMatch(src, /data-testid="margen"/)
})

// ═══ SEIS COLUMNAS, Y NI UNA MÁS (dueño, 10/09/2026 18:12) ═══
//
// «Columnas que no solicité… te había pedido columnas determinadas.» Las que pidió a lo largo del
// día son estas seis, en este orden. Este caso es el que impide que vuelva a crecer.

test('la grilla declara las seis columnas que el dueño pidió, y ninguna más', () => {
  const src = codigo()
  assert.match(src, /grid-cols-\[minmax\(0,1\.7fr\)_150px_140px_120px_150px_150px\]/)
  for (const rotulo of ['>Cliente<', '>Obras<', '>OC c/IVA<', '>OP c/IVA<', "'Contratado'",
    'Cobrado c/IVA']) {
    assert.ok(src.includes(rotulo), `falta la columna «${rotulo}»`)
  }
  // Se miran los RÓTULOS dibujados, no el fuente entero: el archivo explica en prosa qué columnas
  // sacó y por qué, y una prosa correcta no puede poner roja la regla que describe.
  const rotulos = src.slice(src.indexOf('<RotuloCol>Cliente</RotuloCol>'), src.indexOf('{clientes.map('))
  for (const prohibida of ['Por cobrar', 'Vencido', 'Próx. cobro', 'ppto.', 'Margen', 'Últ. mov.']) {
    assert.ok(!rotulos.includes(prohibida), `volvió una columna que el dueño no pidió: «${prohibida}»`)
  }
})

// ═══ LA BARRA POR OBRA, PREPARADA PARA CUANDO LA BASE LA PUEDA DAR ═══
//
// `obra_cobranza.imputacion` la agrega la migración que reparte el cobro por obra (la OC de la
// columna H de Cobranzas atada a `cliente_orden.obra_id`). La lectura ya la pide —`select`
// tolerante, probado en los dos mundos en `homeCartera.test.ts`— y la fila ya sabe qué hacer con
// cada valor. Al aplicar la migración, la barra enciende sin una segunda entrega.

test('una obra cuyo cobro no se pudo repartir lo DICE, y no dibuja un importe ajeno', () => {
  const src = codigo()
  assert.match(src, /imputacion === 'cliente'/)
  assert.match(src, /cobro sin trabajo asignado/)
  assert.match(src, /imputacion=\{o\.imputacion\}/, 'la fila de la obra tiene que pasarla')
  // Y la del CLIENTE no la pasa: la imputación es una propiedad de la OBRA, y el cobro del cliente
  // es la bolsa entera — ahí no hay nada que repartir.
  const delCliente = src.slice(src.lastIndexOf('<Cobrado', src.indexOf('testid="cobro-cliente"')), src.indexOf('/>', src.indexOf('testid="cobro-cliente"')) + 2)
  assert.doesNotMatch(delCliente, /imputacion=/)
})

test('los números de las OC siguen debajo del nombre, con su PDF', () => {
  // «1 OC» cuenta; «OC 2173» identifica, y es lo que el cliente cita en su orden de pago. El número
  // vive en la línea de abajo del nombre —de `cliente_orden`, con su archivo— y el TOTAL en su
  // columna, que sale de la vista. Dos fuentes, dos preguntas, y ninguna pisa a la otra.
  const src = codigo()
  assert.match(src, /<OrdenesDeLaObra ordenes=\{ocDeLaObra\} veEconomia=\{veEconomia\} \/>/)
})

// ═══ UN SOLO TRATAMIENTO PARA EL HUECO (dueño, 10/09/2026 18:10) ═══
//
// La columna tenía TRES formas de decir «acá no hay número»: «—», la celda en blanco y la frase
// «cobro sin obra asignada» en tipografía de texto dentro de una columna de plata. Ahora hay una
// sola y el MOTIVO —que es lo que cambia— vive en el `title`.

test('la celda de cobro dice el hueco de UNA sola forma, y el motivo va en el `title`', () => {
  const src = codigo()
  assert.match(src, /const sinDato = !disponible \|\| imputacion === 'cliente' \|\| cobrado === null/)
  assert.match(src, /\{sinDato \? '—' : pesos\(cobrado\)\}/)
  assert.match(src, /const porQueNoHay =/, 'sin el motivo, el «—» es un hueco mudo')
  assert.match(src, /disponible=\{o\.cobroDisponible\}/, 'la fila de la obra tiene que pasarlo')
  // La fila del CLIENTE no entra en la regla: su importe sale de `cliente_economia` y no depende de
  // que se pueda repartir nada. Si alguien le pasa `disponible`, la columna se apaga entera.
  const delCliente = src.slice(
    src.lastIndexOf('<Cobrado', src.indexOf('testid="cobro-cliente"')),
    src.indexOf('/>', src.indexOf('testid="cobro-cliente"')) + 2,
  )
  assert.doesNotMatch(delCliente, /disponible=/)
})

// ═══ UNA CELDA, UNA TIPOGRAFÍA (dueño, 10/09/2026 16:25: «hay mezcla de diseño») ═══
//
// La regla del módulo Administración —la de Personal y Proveedores— es: la CIFRA va en mono
// tabular con su sufijo de unidad en la misma familia; una FRASE va en la tipografía del texto.
// Nunca las dos en la misma celda. Lo que estaba mal, en la misma fila:
//
//   «$ 10.000.000» en mono con «suma de Cobranzas» en texto debajo → dos familias y dos escalas.
//   «$ 233.366.292» en mono con «16 OC» en texto al lado          → dos familias.
//   «5 en curso» a 12px con «6 cerradas» a 10,5px debajo          → dos escalas.
//   «sin precio en OBRAS» en mono                                 → una frase con cara de terminal.

test('el sufijo de unidad va en la familia de la cifra, no en la del texto', () => {
  const total = readFileSync(fileURLToPath(new URL('./TotalDePapeles.tsx', import.meta.url)), 'utf8')
  // Los tres renglones que dibuja —con permiso, sin permiso y el sufijo— tienen que ser mono.
  assert.equal((total.match(/font-mono tabular-nums/g) ?? []).length, 3, '«16 OC» quedó en otra familia')
  assert.doesNotMatch(total, /className="tabular-nums"/, 'tabular sin mono es la familia del texto')
})

test('«suma de Cobranzas» dejó de ser un segundo renglón: es la marca «·» y el `title`', () => {
  const src = codigo()
  assert.doesNotMatch(src, /suma de Cobranzas\s*\n\s*<\/span>/, 'volvió como texto dibujado')
  assert.match(src, /viva && o\.contratado !== null && o\.contratadoUsd == null \? ' ·' : ''/)
  assert.match(src, /AYUDA_SUMA_VIVA/, 'la frase entera tiene que seguir estando en el `title`')
})

test('una frase no se dibuja en monoespaciado, y una cifra sí', () => {
  const src = codigo()
  assert.match(src, /c\.contratado === null \? '' : 'font-mono tabular-nums'/)
  assert.match(src, /o\.contratado === null && o\.contratadoUsd === null \? '' : 'font-mono tabular-nums'/)
  // Y la celda de «Obras» es una frase entera: nunca mono.
  const obras = src.slice(src.indexOf('data-testid="obras-cliente"') - 260, src.indexOf('data-testid="obras-cliente"') + 260)
  assert.doesNotMatch(obras, /font-mono/)
})

test('el pie de la tabla no explica nada con un párrafo', () => {
  const pagina = readFileSync(
    fileURLToPath(new URL('../../../app/(main)/clientes/page.tsx', import.meta.url)), 'utf8',
  )
  // La skill de diseño lo prohíbe con nombre: «no párrafos explicativos permanentes». Lo que haya
  // que explicar de un número vive en el `title` de su columna.
  assert.doesNotMatch(pagina, /Cobranzas registra el cobro contra el CLIENTE/)
  assert.doesNotMatch(pagina, /no hay leads ni etapa de venta/)
  // Lo que NO es un párrafo y se queda: la puerta de vuelta a los archivados, un verbo con número.
  assert.match(pagina, /pie-archivados/)
})

test('la atribución DEDUCIDA se declara: la barra sale, pero el `title` dice que se dedujo', () => {
  // `unica-obra` es la única imputación que NO sale de la base. Un hecho y una inferencia no se
  // pueden publicar iguales (regla de oro 2): el número se dibuja —esconderlo sería peor— y la
  // frase del `title` lo antepone todo.
  const src = codigo()
  assert.match(src, /imputacion === 'unica-obra'/)
  assert.match(src, /ÚNICO en curso: no hay entre qué repartirlo/)
  assert.match(src, /data-imputacion=\{imputacion \?\? undefined\}/, 'sin esto no es auditable desde afuera')
  // Y NO entra por la puerta del hueco, que es la de dos o más candidatas: con `unica-obra` la
  // celda dibuja el importe y la barra, y lo que se declara es que el número se DEDUJO.
  assert.match(src, /imputacion === 'cliente' \|\| cobrado === null/)
  assert.doesNotMatch(src, /sinDato = [^\n]*'unica-obra'/)
})

// ═══ EL RÓTULO QUE MENTÍA (auditoría independiente, 10/09/2026) ═══
//
// «Costo MO» y «Costo mat.» NO son el costo real: son la explosión del PRESUPUESTO
// (`obra_egreso_proyectado`, sumada por `obra_economia_sheet`). El real vive en
// `obra_panel.costo_real` y está en CERO en 8 de las 9 obras. Un «Costo» al lado de un
// «Contratado» invita a restar y a leer margen REAL donde hay margen proyectado.

test('el costo de la obra NO se dibuja en el CRM: ni el presupuestado ni el real', () => {
  // «Administración es un CRM y Obra un ERP: no mezcles cosas con obras» (dueño, 10/09/2026 17:15).
  // El costo se decide contra el avance, el certificado y el costo real — tres cosas que no se
  // miran desde la ficha de un cliente. La prohibición vive además en `definiciones.json`, que la
  // barre sobre todo el repositorio; acá se cuida la pantalla concreta.
  const src = codigo()
  for (const prohibido of ['MO ppto.', 'Mat. ppto.', 'Costo MO', 'Costo mat.', 'costo-mo',
    'costo-materiales', 'costoMo', 'costoMateriales', 'obra_egreso_proyectado', 'costo_real']) {
    assert.ok(!src.includes(prohibido), `el ERP volvió al CRM: «${prohibido}»`)
  }
})

// ═══ EL TRABAJO SE ABRE DENTRO DEL CRM, Y EL ERP ES UN ENLACE NOMBRADO ═══
//
// La fila iba a `/obras/<id>`: un clic y el dueño estaba en otro módulo —que él mismo describe como
// descuidado— sin haber pedido irse. El detalle que el CRM sí contesta (sus OC, sus OP, su PDF)
// vive en el panel lateral de esta misma pantalla.

test('la fila del trabajo abre el detalle del CRM, no la ficha del ERP', () => {
  const src = codigo()
  const fila = src.slice(src.indexOf('data-testid="fila-obra"') - 700, src.indexOf('data-testid="fila-obra"') + 200)
  assert.match(fila, /href=\{hrefOrdenes\(o\.obra_id\)\}/, 'la fila tiene que abrir el panel del CRM')
  assert.doesNotMatch(fila, /href=\{`\/obras\//, 'la fila entera no puede saltar al ERP')
})

test('la lista NO repite el enlace al ERP debajo de cada obra', () => {
  // Colgaba de cada fila y repetía en toda la pantalla un enlace al módulo del que el dueño mandó
  // separar éste (10/09/2026 18:12). El puente sigue existiendo UNA vez, adentro del detalle.
  const src = codigo()
  assert.doesNotMatch(src, /Ver en Obras →/)
  const panel = readFileSync(fileURLToPath(new URL('./PanelOrdenes.tsx', import.meta.url)), 'utf8')
  assert.match(panel, /Ver esta obra en el módulo Obras →/)
  assert.match(panel, /data-testid="ver-en-obras"/)
})

test('el avance físico de la obra no se dibuja en el CRM', () => {
  const src = codigo()
  assert.doesNotMatch(src, /o\.avance/, 'cuánto lleva ejecutado es del ERP: acá la barra es la del cobro')
  assert.doesNotMatch(src, /porcentajeCanon/)
})

// ═══ POR COBRAR Y VENCIDO: EN EL TRABAJO SÍ, EN EL CLIENTE NO ═══
//
// `cliente_cuenta_corriente` publica un «vencido» con OTRO reloj —`fecha_cobro < hoy`, que se
// re-tipea cada vez que el cobro se posterga y está condenado a cero por construcción—. La pestaña
// OBRAS usa emisión + 30 días. Dos relojes en la misma columna son dos definiciones.

test('el saldo, el vencido y el próximo cobro NO son columnas de esta lista', () => {
  // La capacidad no se perdió: `obra_cuenta` los publica y `getCobradoPorObra` los lee. Lo que no
  // pueden es estar acá, porque el dueño pidió seis columnas y éstas no son ninguna de ellas.
  const src = codigo()
  assert.doesNotMatch(src, /valor=\{o\.porCobrar\}|valor=\{o\.vencido\}|proximo=\{o\.proximo\}/)
  assert.doesNotMatch(src, /CifraDeCobranza|ProximoCobro/)
})

test('el cobro sin repartir se dibuja en la fila del CLIENTE y en ninguna otra', () => {
  const src = codigo()
  // «s/obra» DEJÓ DE SER UN RENGLÓN DIBUJADO (10/09/2026 18:10): ARCOR mostraba «$42.326.347» y
  // debajo «$42.326.347 s/trabajo», el mismo número dos veces. Se dice en el `title`.
  assert.doesNotMatch(src, /data-testid="cobro-sin-obra"/)
  assert.match(src, /sinObra=\{c\.cobradoSinObra\}/)
  assert.match(src, /repartió entre sus obras/)
  // La fila de la OBRA no lo pasa: su cobro es el suyo, y un «sin asignar» ahí no significaría nada.
  const deLaObra = src.slice(
    src.lastIndexOf('<Cobrado', src.indexOf('testid="cobro-obra"')),
    src.indexOf('/>', src.indexOf('testid="cobro-obra"')) + 2,
  )
  assert.doesNotMatch(deLaObra, /sinObra=/)
})

// ═══ UNA SOLA BARRA POR TRABAJO, Y CON SU BASE ESCRITA (dueño, 11/09/2026) ═══
//
// «Me está mostrando dos barras de progreso sin respetar lo que marca el diseño»: la fila del
// cliente dibujaba barra cuando ninguna obra quedaba sin precio (Quattropani) y no cuando alguna sí
// (Messina). Y «$ 107,9 M» cobrado contra «$ 95,3 M» contratado con un 94 % al lado se lee como una
// lectura errada, porque la base (× 1,21) no se veía.

test('la barra es sólo de la fila del trabajo, y el porcentaje dice contra qué mide', () => {
  const src = codigo()
  assert.match(src, /const p = ambito === 'obra' && medible && !sinDato \? progresoDeCobroBruto/)
  assert.match(src, /millones\(contratado \* IVA_GENERAL\)/, 'la base del porcentaje se escribe en millones')
  assert.match(src, /\$\{p\.pct\} % de \$\{base\}/)
  assert.doesNotMatch(src, /\{p\.pct\} %\{p\.excede \? ' \+' : ''\}/, 'el «+» mudo se fue: cuando excede se dice la base superada')
  // La OP del trabajo va apilada: la cifra y su rótulo en dos líneas enteras, nunca partidas.
  assert.match(src, /testid="total-op-obra" veEconomia=\{veEconomia\} apilado/)
})
