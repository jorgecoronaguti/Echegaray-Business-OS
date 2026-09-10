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

test('cada obra dibuja los números de SUS órdenes de compra, y el total sigue abriendo el detalle', () => {
  const src = codigo()
  assert.match(src, /<OrdenesDeLaObra ordenes=\{ocDeLaObra\}/, 'los números no se dibujan')
  // La fila crece a dos líneas SOLO cuando hay números: si no, el hueco se ve como un error.
  assert.match(src, /ocDeLaObra\.length \? ALTO_V2\.hijaConOrdenes : ALTO_V2\.hija/)
  // Y el total de la obra SÍ tiene que seguir abriendo su detalle: los números de la línea son las
  // cuatro primeras, el panel las tiene todas con su archivo y su atribución.
  assert.match(src, /AbrirOrdenes/)
  assert.match(src, /testid="abrir-ordenes-obra"/)
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

test('el rótulo de la columna de papeles dice que llevan IVA', () => {
  // El Adicional Tercer Muro: OC $12.100.000 contra $10.000.000 contratados = el mismo número ×1,21.
  // Sin el «c/IVA» en el rótulo, las dos columnas vecinas invitan a una resta que da $2.100.000 de
  // nada. La unidad va en el RÓTULO y no sólo en el `title`: si no, hay que pasar el mouse.
  assert.match(codigo(), /OC · OP c\/IVA/)
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

test('la grilla declara las ocho columnas del CRM, y ninguna de costo', () => {
  // Cliente · Trabajos · OC·OP · Contratado · Cobrado · Por cobrar · ▲ Vencido · Próx. cobro. Si el
  // literal y las celdas se desincronizan, la tabla se corre entera y nadie lo ve en un typecheck.
  const src = codigo()
  assert.match(src, /grid-cols-\[minmax\(0,1\.6fr\)_100px_140px_132px_152px_126px_122px_112px\]/)
  for (const rotulo of ['Trabajos', 'OC · OP c/IVA', 'Contratado', 'Cobrado c/IVA', 'Por cobrar',
    '▲ Vencido', 'Próx. cobro']) {
    assert.ok(src.includes(rotulo), `falta la columna «${rotulo}»`)
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

test('con una sola OC la celda dice CUÁL, no cuántas', () => {
  // «1 OC» cuenta; «OC 2173» identifica. Con dos o más se vuelve al conteo: enumerarlas en la celda
  // es volver a los rótulos que el dueño mandó sacar.
  const src = codigo()
  assert.match(src, /totalOC\.n === 1 \? \(deLaObra\?\.oc\[0\]\?\.numeroCorto \?\? null\) : null/)
  assert.match(src, /numero=\{unicaOC\}/)
})

test('la celda de cobro de la obra no dibuja NADA mientras la base no pueda repartir', () => {
  const src = codigo()
  assert.match(src, /if \(!disponible\) return <span className=\{SOLO_TABLET\} data-testid=\{testid\} data-cobro="sin-imputacion" \/>/)
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
  assert.match(src, /viva && o\.contratado !== null \? ' ·' : ''/)
  assert.match(src, /AYUDA_SUMA_VIVA/, 'la frase entera tiene que seguir estando en el `title`')
})

test('una frase no se dibuja en monoespaciado, y una cifra sí', () => {
  const src = codigo()
  assert.match(src, /c\.contratado === null \? '' : 'font-mono tabular-nums'/)
  assert.match(src, /o\.contratado === null \? '' : 'font-mono tabular-nums'/)
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
  // Y NO entra por la puerta de «cobro sin obra asignada», que es la de dos o más candidatas.
  const corte = src.indexOf("if (imputacion === 'cliente')")
  assert.ok(corte > src.indexOf("imputacion === 'unica-obra'") - 4000)
  assert.match(src.slice(corte, corte + 200), /cobro sin trabajo asignado|data-cobro="sin-obra-asignada"/)
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

test('el puente al ERP existe, es secundario y está nombrado', () => {
  const src = codigo()
  assert.match(src, /testid="ver-en-obras"/)
  assert.match(src, /Ver en Obras →/)
  // Y es un botón, no un ancla: un `<a>` dentro del `<a>` de la fila es HTML inválido.
  assert.match(src, /<AbrirOrdenes\n\s+href=\{`\/obras\/\$\{o\.obra_id\}`\}/)
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

test('el saldo se publica por trabajo y la fila del cliente lo deja vacío a propósito', () => {
  const src = codigo()
  assert.match(src, /valor=\{o\.porCobrar\}/)
  assert.match(src, /valor=\{o\.vencido\}/)
  assert.match(src, /proximo=\{o\.proximo\}/)
  assert.doesNotMatch(src, /valor=\{c\.vencido\}|valor=\{c\.saldo\}|c\.porVencer/)
  assert.match(src, /data-testid="vencido-cliente" \/>/, 'la celda existe y va vacía: la grilla no se corre')
})

test('una columna que la base no publica se dibuja vacía, nunca en cero', () => {
  // `obra_cobranza` todavía no tiene `vencido` ni `proximo_cobro`. Un «$ 0» ahí afirmaría que no
  // hay mora, que es justo la conclusión que hace que nadie revise.
  const src = codigo()
  assert.match(src, /valor === null \? '' :/)
  assert.match(src, /data-vacia=\{valor === null \? '' : undefined\}/)
})

test('el cobro sin repartir se dibuja en la fila del CLIENTE y en ninguna otra', () => {
  const src = codigo()
  assert.match(src, /data-testid="cobro-sin-obra"/)
  assert.match(src, /sinObra=\{c\.cobradoSinObra\}/)
  // La fila de la OBRA no lo pasa: su cobro es el suyo, y un «sin asignar» ahí no significaría nada.
  const deLaObra = src.slice(
    src.lastIndexOf('<Cobrado', src.indexOf('testid="cobro-obra"')),
    src.indexOf('/>', src.indexOf('testid="cobro-obra"')) + 2,
  )
  assert.doesNotMatch(deLaObra, /sinObra=/)
})
