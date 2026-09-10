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

const codigo = () => readFileSync(
  fileURLToPath(new URL('./TablaClientes.tsx', import.meta.url)), 'utf8',
)

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
  assert.match(cobroDelCliente(), /cobrado=\{c\.cobrado\}/)
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

test('«11 obras» con 5 filas debajo se reemplaza por el desglose que las explica', () => {
  assert.deepEqual(
    frasesDeObras({ obras: 11, nEnCurso: 5, nCerradas: 6 }), ['5 en curso', '6 cerradas'],
    'el 11 y el 5 eran los dos ciertos y ninguno explicaba al otro',
  )
  assert.deepEqual(frasesDeObras({ obras: 1, nEnCurso: 0, nCerradas: 1 }), ['1 cerrada'])
  assert.deepEqual(frasesDeObras({ obras: 3, nEnCurso: 0, nCerradas: 3 }), ['3 cerradas'])
  assert.deepEqual(frasesDeObras({ obras: 1, nEnCurso: 1, nCerradas: 0 }), ['1 en curso'])
  assert.deepEqual(frasesDeObras({ obras: 0, nEnCurso: 0, nCerradas: 0 }), ['sin obras'])
})

test('sin leer la vista NO se escribe «0 en curso»: se dice el total y se dice que es total', () => {
  // Es el caso del jefe de obra, a quien `cliente_economia` le devuelve cero filas por `ve_economia()`.
  assert.deepEqual(
    frasesDeObras({ obras: 11, nEnCurso: null, nCerradas: null }), ['11 en total'],
    'un control que no pudo mirar no puede afirmar que no hay ninguna en curso',
  )
  assert.deepEqual(frasesDeObras({ obras: 0, nEnCurso: null, nCerradas: null }), ['sin obras'])
})

test('un cliente sin obras en curso no dibuja cuatro guiones: no hay universo que sumar', () => {
  // «Guiones por todos lados» fue textual del dueño. ARCOR y La Estrella dibujaban «—» en
  // Contratado, Costo MO, Costo mat. y Margen: cuatro huecos por cliente para decir lo que su
  // columna «Obras» ya dice en dos palabras («1 cerrada»). Un «—» significa «falta el dato»; acá no
  // falta ninguno, no hay pregunta.
  const src = codigo()
  assert.match(src, /sinUniverso=\{c\.enCurso\.length === 0\}/)
  assert.match(src, /sinUniverso \? '' : '—'/)
  // Y la celda de plata del cliente entra por la misma puerta.
  assert.match(src, /c\.enCurso\.length \? SIN_PRECIO_EN_OBRAS : ''/)
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
  // Los COSTOS se quedan: una compra es costo, no precio, y la ve todo rol interno.
  assert.match(src, /celda\(mo, 'costo-mo'\)/)
  assert.match(src, /celda\(mat, 'costo-materiales'\)/)
})

test('la grilla perdió exactamente una columna, no dos', () => {
  // Siete columnas: Cliente · Obras · OC·OP · Contratado · Costo MO · Costo mat. · Cobrado. Si el
  // literal y las celdas se desincronizan, la tabla se corre entera y nadie lo ve en un typecheck.
  assert.match(codigo(), /grid-cols-\[minmax\(0,1\.9fr\)_116px_156px_150px_124px_124px_150px\]/)
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
  assert.match(src, /cobro sin obra asignada/)
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
  assert.match(src, /if \(!disponible\) return <span className=\{SOLO_ANCHO\} data-testid=\{testid\} data-cobro="sin-imputacion" \/>/)
  assert.match(src, /disponible=\{o\.cobroDisponible\}/, 'la fila de la obra tiene que pasarlo')
  // La fila del CLIENTE no entra en la regla: su importe sale de `cliente_economia` y no depende de
  // que se pueda repartir nada. Si alguien le pasa `disponible`, la columna se apaga entera.
  const delCliente = src.slice(
    src.lastIndexOf('<Cobrado', src.indexOf('testid="cobro-cliente"')),
    src.indexOf('/>', src.indexOf('testid="cobro-cliente"')) + 2,
  )
  assert.doesNotMatch(delCliente, /disponible=/)
})
