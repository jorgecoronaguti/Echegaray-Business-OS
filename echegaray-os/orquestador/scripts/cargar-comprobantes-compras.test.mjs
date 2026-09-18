import test from 'node:test'
import assert from 'node:assert/strict'
import { escribirYVerificar, prepararPlan } from './cargar-comprobantes-compras.mjs'
import { colIndice } from '../lib/carga-comprobantes.mjs'
import { indexarCompras } from '../lib/comprobantes/compras-vivas.mjs'
import { destinosDeObra } from '../lib/comprobantes/obra-y-destino.mjs'
import { perfilesDeImputacion } from '../lib/imputacion-aprendida.mjs'
import { MARCA_A_MANO } from '../lib/comprobantes/lectura.mjs'
import { ALIAS, CLIENTE_ALIAS, OBRAS, CASOS_15_09 } from '../lib/comprobantes/anotacion-a-obra.fixture.mjs'

// ═══ EL LOG NO PUEDE FELICITAR SIN HABER ESCRITO (03/08) ═══
//
// LO MEDIDO. Corrida real contra el Sheet: el cargador imprimió
//
//   🔒 "Compras": la firma difiere de mi última escritura: la editaste — la tomo como tuya, no la piso.
//   ✔ Escritas 7 fila(s). Sin #ERROR.
//
// y las filas 800..806 quedaron VACÍAS. Los dos mensajes son ciertos por separado y juntos mienten: la
// guarda descartó los rangos y el chequeo de "#ERROR" no podía detectarlo, porque un rango vacío no tiene
// errores. Lo caro no es el mensaje: es que el paso siguiente (sync a Supabase, conciliación con ARCA) da
// por cargado un comprobante que no está, y el gasto desaparece sin que nadie lo busque.
//
// Estos tests fijan la regla: lo que prueba una escritura es el dato leído EN SU DESTINO. Si se revierte
// la verificación, el primero se pone rojo.

/** Cliente de Google falso: responde lo que responda la escritura, y devuelve el grid que se le indique. */
function googleFalso({ respuesta = {}, grid = [], fallaLectura = false } = {}) {
  const escrituras = []
  return {
    escrituras,
    async batchUpdateValues(_fileId, data, opciones) { escrituras.push({ data, opciones }); return respuesta },
    async readSheetGrid() { if (fallaLectura) throw new Error('sin red'); return { filas: grid } },
  }
}

/** Una fila del grid tal como la devuelve readSheetGrid: por índice de columna, con {valor}. */
function filaLeida(porLetra) {
  const f = []
  for (const [L, valor] of Object.entries(porLetra)) f[colIndice(L)] = { valor }
  return f
}

const PLAN = [
  { valores: { E: 'Combustibles Barcelo', H: '0001-00012345', M: 28479.3, N: 5981 } },
  { valores: { E: 'Ferretería Cobos', H: '0002-00000777', M: 5000, N: 1050 } },
]
const BLOQUE = { desde: 800, hasta: 801, plan: PLAN, fileId: 'SHEET-FALSO' }

test('el cargador FALLA si la guarda descartó los rangos: el destino quedó vacío', async () => {
  // Exactamente la corrida del 03/08: la guarda devuelve protegido y el destino no tiene nada.
  const google = googleFalso({
    respuesta: { protegido: true, bloqueadas: ['Compras'], porQue: { Compras: 'firma-editada' } },
    grid: [],
  })
  const r = await escribirYVerificar(google, BLOQUE)
  assert.equal(r.ok, false, 'no puede decir que escribió: las filas están vacías')
  assert.equal(r.vacias.length, 8, 'nombra cada celda que pidió escribir y no está')
  assert.match(r.motivo, /Compras/)
  assert.match(r.motivo, /firma-editada|candado/, 'y dice POR QUÉ no entró, no sólo que no entró')
})

test('el cargador FALLA también cuando la pestaña está candada a mano', async () => {
  const google = googleFalso({
    respuesta: { protegido: true, bloqueadas: ['Compras'], porQue: { Compras: 'candado-dueño' } },
    grid: [],
  })
  const r = await escribirYVerificar(google, BLOQUE)
  assert.equal(r.ok, false)
  assert.match(r.motivo, /candado-dueño/)
})

test('el cargador FALLA si el Sheet está congelado (freno de mano), y lo dice con ese nombre', async () => {
  // El freno devuelve la misma forma que la guarda ({protegido:true}); si no se distinguiera, el
  // diagnóstico mandaría al dueño a revisar un candado que no existe.
  const google = googleFalso({
    respuesta: { protegido: true, congelado: true, motivo: 'escritura de Sheets congelada por pedido del dueño\nsegunda línea' },
    grid: [],
  })
  const r = await escribirYVerificar(google, BLOQUE)
  assert.equal(r.ok, false)
  assert.match(r.motivo, /CONGELADA/)
})

test('el cargador FALLA si la API dijo que sí pero el destino no tiene el dato', async () => {
  // El caso más traicionero: nadie bloqueó nada, la respuesta es un 200 normal, y el dato no está.
  const google = googleFalso({ respuesta: { spreadsheetId: 'SHEET-FALSO', totalUpdatedCells: 8 }, grid: [] })
  const r = await escribirYVerificar(google, BLOQUE)
  assert.equal(r.ok, false, 'la respuesta de la API no es evidencia del efecto')
  assert.match(r.motivo, /destino/)
})

test('el cargador FALLA si no puede releer las filas — no afirma lo que no pudo verificar', async () => {
  const google = googleFalso({ respuesta: { totalUpdatedCells: 8 }, fallaLectura: true })
  const r = await escribirYVerificar(google, BLOQUE)
  assert.equal(r.ok, false)
  assert.match(r.motivo, /releer/)
})

test('el cargador da OK cuando las dos filas están de verdad en su destino', async () => {
  // El contrapeso: si esto fallara, la verificación sería un "siempre rojo" y no probaría nada. Los
  // valores vuelven formateados en es-AR, que es como los devuelve el Sheet real.
  const google = googleFalso({
    respuesta: { totalUpdatedCells: 8 },
    grid: [
      filaLeida({ E: 'Combustibles Barcelo', H: '0001-00012345', M: '$ 28.479,30', N: '$ 5.981,00' }),
      filaLeida({ E: 'Ferretería Cobos', H: '0002-00000777', M: '$ 5.000,00', N: '$ 1.050,00' }),
    ],
  })
  const r = await escribirYVerificar(google, BLOQUE)
  assert.equal(r.ok, true, r.motivo)
  assert.deepEqual(r.vacias, [])
  assert.deepEqual(r.distintas, [])
})

test('el cargador FALLA si entró una fila y la otra no (escritura partida al medio)', async () => {
  // Un 429 entre dos rangos ya partió una pestaña en este repo. "Escritas 2 filas" lo taparía.
  const google = googleFalso({
    respuesta: { totalUpdatedCells: 4 },
    grid: [filaLeida({ E: 'Combustibles Barcelo', H: '0001-00012345', M: '$ 28.479,30', N: '$ 5.981,00' })],
  })
  const r = await escribirYVerificar(google, BLOQUE)
  assert.equal(r.ok, false)
  assert.deepEqual(r.vacias.map((v) => v.fila), [801, 801, 801, 801], 'la fila que no entró es la 801')
})

test('la escritura del cargador pide soloFilasVacias: es un APPEND, no una reescritura', async () => {
  // Sin esta bandera el fajo se descarta entero cada vez que el dueño toca "Compras" — que es siempre.
  // Con ella, la guarda relee el destino y sólo escribe si lo confirma vacío (ver guarda-escritura.mjs).
  const google = googleFalso({
    respuesta: { totalUpdatedCells: 8 },
    grid: [
      filaLeida({ E: 'Combustibles Barcelo', H: '0001-00012345', M: '$ 28.479,30', N: '$ 5.981,00' }),
      filaLeida({ E: 'Ferretería Cobos', H: '0002-00000777', M: '$ 5.000,00', N: '$ 1.050,00' }),
    ],
  })
  await escribirYVerificar(google, BLOQUE)
  assert.equal(google.escrituras.length, 1)
  assert.equal(google.escrituras[0].opciones.soloFilasVacias, true)
  // Y escribe una columna por vez, en el bloque exacto que declaró (filas 800..801).
  assert.deepEqual(google.escrituras[0].data.map((d) => d.range).sort(),
    ['Compras!E800:E801', 'Compras!H800:H801', 'Compras!M800:M801', 'Compras!N800:N801'])
})

// ═══ LAS TRES BARRERAS QUE EL CARGADOR NO TENÍA Y EL BOT SÍ (03/08) ═══
//
// El bot de Mattermost INVOCA a este script para escribir: la escritura ya era una sola. Lo que no
// era una sola eran las decisiones de ANTES de escribir. Medido sobre el código de `main`:
//
//   · el duplicado contra la pestaña Compras VIVA (`compras-vivas.mjs`) lo miraba SÓLO el bot. Por
//     eso Claude Code cargó por segunda vez un tique de Combustibles Barcelo que ya estaba en la
//     fila 800: mismo número, mismo total al centavo, y este script escribió la fila igual;
//   · ARCA se cruzaba acá con un índice por NÚMERO PELADO, sin punto de venta y sin CUIT;
//   · "¿qué le falta?" tenía dos definiciones (ver `lib/comprobantes/faltantes.test.mjs`).
//
// `prepararPlan` es todo lo que se decide antes de tocar una celda, y por eso se prueba sin Google,
// sin Postgres y sin escribir nada. Si se revierte cualquiera de las tres, algo de acá se pone rojo.

/** Fila de la pestaña Compras tal como la devuelve `readSheetValues(RANGO)`: B categoría … O total. */
function filaCompras({ fecha, proveedor, tipo = '', numero, obra = '', detalle = '', total, categoria = '' }) {
  const r = []
  r[0] = categoria; r[1] = fecha; r[3] = proveedor; r[5] = tipo; r[6] = numero
  r[8] = obra; r[9] = detalle; r[13] = total
  return r
}

/** El índice de Compras con esas filas EN SU FILA REAL (la del Sheet, no la del array). */
function comprasCon(porFila = {}) {
  const filas = []
  for (const [fila, datos] of Object.entries(porFila)) filas[Number(fila) - 4] = filaCompras(datos)
  return { ok: true, ...indexarCompras(filas) }
}

const BARCELO_800 = {
  800: { fecha: '02/08/2026', proveedor: 'Combustibles Barcelo', numero: '00113-00014219', total: '$ 64.006,07' },
}
const TIQUE_BARCELO = {
  proveedor: 'Combustibles Barcelo', fecha: '02/08/2026', numero: '00113-00014219', total: 64006.07, iva: 11106.07,
}

test('EL DEFECTO: el cargador escribía de nuevo un comprobante que YA está en Compras', async () => {
  // El caso real, con los datos reales: el tique estaba en la fila 800 y entró por segunda vez.
  const r = await prepararPlan([TIQUE_BARCELO], {
    lista: ['Combustibles Barcelo'], indiceCompras: comprasCon(BARCELO_800),
  })
  assert.equal(r.plan.length, 0, 'no puede escribir una fila de un comprobante que ya está cargado')
  assert.equal(r.duplicados.length, 1)
  assert.equal(r.duplicados[0].fila, 800, 'y dice EN QUÉ FILA está, para que se pueda desmentir')
  assert.equal(r.duplicados[0].cierto, true, 'mismo número y mismo total al centavo es certeza, no sospecha')
  assert.deepEqual(r.rechazos, [], 'un duplicado no es un dato ilegible: se informa aparte')
})

test('el tique de una estación de servicio se caza SIN ARCA — es cuando más falta hace mirar Compras', async () => {
  // Un tique no electrónico puede legítimamente no estar en el padrón. "No figura en ARCA" no dice
  // NADA sobre si ya está cargado; el bot lo aprendió y el cargador lo ignoraba.
  const r = await prepararPlan([TIQUE_BARCELO], {
    lista: ['Combustibles Barcelo'], indiceCompras: comprasCon(BARCELO_800), arcaDe: async () => [],
  })
  assert.equal(r.plan.length, 0)
  assert.equal(r.arca.coinciden, 0)
})

test('un comprobante que NO está en Compras se carga igual: la barrera no bloquea lo legítimo', async () => {
  // El contrapeso. Sin esto, la barrera podría ser un "siempre rojo" y no probaría nada.
  const otro = { ...TIQUE_BARCELO, numero: '00113-00019999', total: 12345.5 }
  const r = await prepararPlan([otro], { lista: ['Combustibles Barcelo'], indiceCompras: comprasCon(BARCELO_800) })
  assert.equal(r.plan.length, 1)
  assert.deepEqual(r.duplicados, [])
  assert.equal(r.plan[0].valores.H, '00113-00019999')
})

test('ARCA NO cruza dos proveedores distintos que comparten el correlativo', async () => {
  // EL FALSO POSITIVO DEL ÍNDICE POR NÚMERO PELADO: ARCA guarda `punto_venta` y `numero` por
  // separado y SIN ceros a la izquierda (`4` y `3642`); Compras usa `0004-00003642`. Un índice por
  // el número solo mete en la misma clave al `0001-00003642` de un emisor y al `0004-00003642` de
  // otro. Acá la conciliación exige CAE, o CUIT+fecha+total, o CUIT+número — y coincidencia ÚNICA.
  //
  // EL IMPORTE ES EL MISMO A PROPÓSITO. Con importes distintos el control cruzado de `resolver` ya
  // descartaría el cruce, y el test pasaría aunque la identidad no se mirara — o sea, no probaría lo
  // que dice probar. Dos abonos mensuales iguales el mismo mes no son una hipótesis rebuscada.
  const ajeno = {
    emisor_cuit: '30111111118', emisor_nombre: 'PEREZ GARCIA MARISOL BIBIANA',
    punto_venta: '1', numero: '3642', fecha_emision: '2026-07-15', imp_total: 64006.07,
  }
  const r = await prepararPlan([{ ...TIQUE_BARCELO, cuit: '30222222229', numero: '0004-00003642' }], {
    lista: ['Combustibles Barcelo'], indiceCompras: comprasCon({}), arcaDe: async () => [ajeno],
  })
  assert.equal(r.arca.coinciden, 0, 'compartir el correlativo no es ser el mismo comprobante')
  assert.equal(r.arca.corregidos, 0)
  assert.equal(r.plan[0].valores.H, '0004-00003642', 'y el número NO se pisa con el del otro emisor')
})

test('ARCA corrige el número mal leído, y RECIÉN ENTONCES aparece el duplicado', async () => {
  // La cadena entera, con el caso real: la visión leyó `0004-00036542` (un dígito de más) y por eso
  // no colapsaba contra la fila 802. El orden es todo el arreglo: ARCA antes que la deduplicación,
  // porque se deduplica por el número. Corregirlo después sería corregirlo tarde.
  const arca = {
    emisor_cuit: '30111111118', emisor_nombre: 'PEREZ GARCIA MARISOL BIBIANA',
    punto_venta: '4', numero: '3642', fecha_emision: '2026-08-02', imp_total: 100000,
  }
  const leido = {
    proveedor: 'Corralón Progreso', cuit: '30111111118', fecha: '02/08/2026',
    numero: '0004-00036542', total: 100000, iva: 17355.37,
  }
  const compras = comprasCon({
    802: { fecha: '02/08/2026', proveedor: 'Corralón Progreso', numero: '0004-00003642', total: '$ 100.000,00' },
  })
  const r = await prepararPlan([leido], { lista: ['Corralón Progreso'], indiceCompras: compras, arcaDe: async () => [arca] })
  assert.equal(r.arca.corregidos, 1, 'el número bueno es el del libro fiscal, no el de la foto')
  assert.equal(r.plan.length, 0)
  assert.equal(r.duplicados[0].fila, 802, 'con el número corregido, colapsa contra la fila que ya estaba')
})

test('un PROBABLE frena la carga y se levanta con --cargar-igual, nunca solo', async () => {
  // Mismo proveedor, mismo día, mismo importe y OTRO número: puede ser el mismo con un dígito mal
  // leído o dos compras distintas. Las dos salidas son caras; ninguna se elige sin una persona.
  const compras = comprasCon({
    802: { fecha: '02/08/2026', proveedor: 'Corralón Progreso', numero: '0004-00003642', total: '$ 100.000,00' },
  })
  const leido = { proveedor: 'Corralón Progreso', fecha: '02/08/2026', numero: '0007-00009999', total: 100000 }
  const frenado = await prepararPlan([leido], { lista: ['Corralón Progreso'], indiceCompras: compras })
  assert.equal(frenado.plan.length, 0)
  assert.equal(frenado.duplicados[0].cierto, false, 'es una PREGUNTA, no una certeza')

  const forzado = await prepararPlan([leido], { lista: ['Corralón Progreso'], indiceCompras: compras, cargarIgual: true })
  assert.equal(forzado.plan.length, 1, 'ya lo miró una persona: es el equivalente del botón "Es otro, cargalo"')

  // Y la bandera NO levanta una coincidencia CIERTA: para eso habría que borrar la fila que ya está.
  const cierto = await prepararPlan([TIQUE_BARCELO], {
    lista: ['Combustibles Barcelo'], indiceCompras: comprasCon(BARCELO_800), cargarIgual: true,
  })
  assert.equal(cierto.plan.length, 0)
})

test('el "Es otro, cargalo" que el dueño ya apretó en el chat viaja en el fajo', async () => {
  // Sin esto, el bot preguntaba, el dueño contestaba, y el cargador volvía a encontrar el mismo
  // PROBABLE y bloqueaba una carga que una persona ya había autorizado.
  const compras = comprasCon({
    802: { fecha: '02/08/2026', proveedor: 'Corralón Progreso', numero: '0004-00003642', total: '$ 100.000,00' },
  })
  const r = await prepararPlan([{
    proveedor: 'Corralón Progreso', fecha: '02/08/2026', numero: '0007-00009999', total: 100000,
    duplicadoResuelto: 'otro',
  }], { lista: ['Corralón Progreso'], indiceCompras: compras })
  assert.equal(r.plan.length, 1)
})

test('no poder leer Compras NO se hace pasar por "no está cargado"', async () => {
  // La corrida ciega y la verificada no pueden verse iguales: la ciega es justo la que duplica.
  const r = await prepararPlan([TIQUE_BARCELO], {
    lista: ['Combustibles Barcelo'], indiceCompras: { ok: false, error: 'sin red' },
  })
  assert.equal(r.revisadoContraCompras, false, 'y quien informe tiene que poder decirlo')
  assert.equal(r.plan.length, 1, 'pero no bloquea: no poder verificar no es un error del comprobante')
})

test('la fecha del fajo se canoniza antes de buscar: "2/8/2026" es el mismo día que "02/08/2026"', async () => {
  // Un fajo escrito a mano trae la fecha como salga. Sin canonizarla, el índice de Compras —que
  // compara DD/MM/AAAA— no matchea nada y el duplicado pasa derecho.
  const r = await prepararPlan([{ ...TIQUE_BARCELO, fecha: '2/8/2026', numero: '113-14219' }], {
    lista: ['Combustibles Barcelo'], indiceCompras: comprasCon(BARCELO_800),
  })
  assert.equal(r.duplicados.length, 1, 'mismo comprobante escrito distinto sigue siendo el mismo')
})

// ═══ EL PROVEEDOR SE RESUELVE IGUAL POR LOS DOS CAMINOS (05/08) ═══
//
// El bot pasaba `porCuit` a `matchProveedor` y este cargador no. El mismo comprobante daba dos
// respuestas distintas según por dónde entrara: «DUBOS UGARTE PEDRO LUIS RAUL» —la razón social del
// padrón de quien en el desplegable se llama DUPEC— era un proveedor conocido para el chat y uno
// nuevo para la terminal. Un paso con dos implementaciones termina con dos verdades; acá quedó una.

test('el CUIT resuelve al proveedor del desplegable también desde el cargador', async () => {
  const r = await prepararPlan([{
    proveedor: 'DUBOS UGARTE PEDRO LUIS RAUL', cuit: '20-28773782-4',
    fecha: '04/08/2026', tipo: 'A', numero: '00009-00003204', total: 469564.7, iva: 81494.7,
  }], { lista: ['DUPEC', 'Combustibles Barcelo'], porCuit: new Map([['20287737824', 'DUPEC']]) })
  assert.deepEqual(r.nuevos, [], 'con el CUIT en el mapa no hay ningún proveedor nuevo que dar de alta')
  assert.equal(r.plan.length, 1)
  assert.equal(r.plan[0].valores.E, 'DUPEC', 'se escribe el nombre del desplegable, no la razón social')
})

// ═══ Y SI NADIE CONOCE ESE CUIT, EL PROVEEDOR SE DA DE ALTA (25/08) ═══
//
// Antes esto declaraba el proveedor «nuevo», escribía la razón social en una columna con desplegable
// ESTRICTO y ahí terminaba: la celda quedaba fuera del vocabulario de Proveedores, Cash Flow y CAJA,
// y el gasto entraba sin dueño. El dueño lo pidió al revés: «que lo cree y lo cargue».
//
// EL LÍMITE DECLARADO, que este test deja escrito a propósito: si ese CUIT pertenece a un proveedor
// que YA está en el desplegable pero cuyo CUIT no está anotado en ningún lado, el alta lo duplica.
// La única defensa contra eso es tener el CUIT cargado —en `public.proveedores` o en la pestaña
// `Proveedores`—, que es exactamente lo que el alta deja hecho para la próxima vez.
test('sin nadie que conozca el CUIT, el proveedor se da de alta en vez de quedar en rojo', async () => {
  const r = await prepararPlan([{
    proveedor: 'DUBOS UGARTE PEDRO LUIS RAUL', cuit: '20-28773782-4',
    fecha: '04/08/2026', tipo: 'A', numero: '00009-00003204', total: 469564.7, iva: 81494.7,
  }], { lista: ['DUPEC'] })
  assert.deepEqual(r.nuevos, [], 'ya no queda como un nombre suelto fuera del desplegable')
  assert.equal(r.altas.altas.length, 1)
  assert.equal(r.altas.altas[0].cuit, '20287737824')
  assert.deepEqual(r.altas.nombres, ['DUBOS UGARTE PEDRO LUIS RAUL'], 'el nombre entra al desplegable')
})

test('el maestro de app.ecsas identifica al proveedor aunque el Sheet no tenga el CUIT', async () => {
  const r = await prepararPlan([{
    proveedor: 'DUBOS UGARTE PEDRO LUIS RAUL', cuit: '20-28773782-4',
    fecha: '04/08/2026', tipo: 'A', numero: '00009-00003204', total: 469564.7, iva: 81494.7,
  }], { lista: ['DUPEC'], conocidos: { ok: true, proveedores: [{ id: 'p1', nombre: 'DUPEC', cuit: '20287737824' }], alias: [] } })
  assert.equal(r.altas.altas.length, 0, 'NO se crea un proveedor que ya existe')
  assert.equal(r.plan[0].valores.E, 'DUPEC', 'a la celda va el nombre canónico, no la razón social')
  assert.equal(r.altas.alias.length, 1, 'la variante queda registrada')
})

test('el proveedor sin CUIT legible sigue quedando declarado y no se inventa nada', async () => {
  const r = await prepararPlan([{
    proveedor: 'FERRETERIA SIN CUIT', fecha: '04/08/2026', tipo: 'A', numero: '0001-00000001', total: 1000, iva: 0,
  }], { lista: ['DUPEC'] })
  assert.deepEqual(r.nuevos, ['FERRETERIA SIN CUIT'])
  assert.equal(r.altas.altas.length, 0, 'sin identidad no hay alta')
  assert.deepEqual(r.altas.nombres, [], 'y no entra al desplegable estricto por su cuenta')
})

test('dos comprobantes del mismo proveedor nuevo en la misma tanda dan de alta UNA vez', async () => {
  const uno = { proveedor: 'Metalúrgica del Oeste', cuit: '20-28773782-4', fecha: '04/08/2026', tipo: 'A', total: 1000, iva: 0 }
  const r = await prepararPlan([
    { ...uno, numero: '0001-00000001' },
    { ...uno, numero: '0001-00000002' },
  ], { lista: ['DUPEC'] })
  assert.equal(r.plan.length, 2, 'los dos comprobantes se cargan')
  assert.equal(r.altas.altas.length, 1, 'pero el proveedor nace una sola vez')
})

test('un comprobante rechazado NO da de alta a su proveedor', async () => {
  const r = await prepararPlan([{
    proveedor: 'Metalúrgica del Oeste', cuit: '20-28773782-4', fecha: null, tipo: 'A', total: null, iva: null,
  }], { lista: ['DUPEC'] })
  assert.equal(r.plan.length, 0, 'el comprobante no se puede cargar')
  assert.equal(r.altas.altas.length, 0, 'y entonces no deja una ficha de proveedor que nadie pidió')
})

// ═══ LO ESCRITO A MANO MANDA SOBRE EL HISTORIAL (15/09/2026, fajo dc2d0273) ═══
//
// LO MEDIDO. Ocho tickets del canal, con la anotación transcripta en `anotacion_manuscrita` y
// copiada al concepto (`· a mano: "…"`). Las ocho filas entraron con la columna «Obra» VACÍA, sin
// Unidad de Negocio, y con el historial del proveedor proponiendo «LA ESTRELLA» a confirmar. El
// dueño: «no está leyendo bien… ni lo escrito a mano y no está ubicando bien en las obras».
//
// Estos tests fijan el orden: si `completarDesdeAnotacion` se saca de `prepararPlan`, o si vuelve a
// correr DESPUÉS del historial, el primero se pone rojo.

const CATALOGOS_REALES = { alias: ALIAS, canonicas: OBRAS, clienteAlias: CLIENTE_ALIAS }
// Los rótulos son los REALES de la columna J (los que hoy tiene `compra_sheet`): el de Quattropani
// es el largo, y por eso el cliente canónico «QUATTROPANI» no matchea por texto.
const LISTAS = { obras: ['LA ESTRELLA', 'San Francisco', 'MESSINA', 'Quattropani - Melisa García SAS', 'Taller', 'Administracion'], unidades: ['Civil', 'Estructura', 'Mantenimiento'] }
const COL = { unidad: 'I', obra: 'J', detalle: 'K', obraFila: 'L', proveedor: 'E', fecha: 'C', numero: 'H', concepto: 'M', neto: 'N', iva: 'O' }

/** El historial que proponía «LA ESTRELLA» para este proveedor: seis cargas, todas a esa obra. */
const HISTORIAL_ESTRELLA = perfilesDeImputacion(
  Array.from({ length: 6 }, () => ({ proveedor: 'Corralon Progreso', obra_texto: 'LA ESTRELLA', unidad_negocio: 'Civil', detalle: 'Galpón 9', concepto: 'materiales' })),
)

const tique = (anotacion) => ({
  proveedor: 'Corralon Progreso', fecha: '12/09/2026', numero: '0003-00001234', total: 121000, iva: 21000,
  concepto: `Cemento y hierro ${MARCA_A_MANO} "${anotacion}"`,
})

async function planCon(anotacion, { perfiles = HISTORIAL_ESTRELLA } = {}) {
  const r = await prepararPlan([tique(anotacion)], {
    lista: ['Corralon Progreso'], listas: LISTAS, col: COL, perfiles,
    destinos: destinosDeObra(CATALOGOS_REALES),
  })
  assert.equal(r.plan.length, 1, r.rechazos.map((x) => x.problemas.join(', ')).join(' · '))
  return r.plan[0]
}

test('EL DEFECTO: la obra escrita a mano no llegaba a la columna «Obra» — ahora llega, y con ella la Unidad y el Detalle', async () => {
  const p = await planCon('Estrella Filtraciones OFICINA Y FÁB. · c/c')
  assert.equal(p.obra.valor, 'OB-0006 · LE - OFICINA Y FÁBRICA DE PALITOS')
  assert.equal(p.obra.via, 'anotacion', 'no es «elegida por una persona»: la leyó un modelo de una foto')
  assert.equal(p.cols.unidad, 'Civil')
  assert.equal(p.cols.obraJ, 'LA ESTRELLA')
  assert.equal(p.cols.detalle, 'OFICINA Y FÁBRICA DE PALITOS')
  // Y la fila que se va a escribir las lleva de verdad, no sólo el informe.
  assert.equal(p.valores.L, 'OB-0006 · LE - OFICINA Y FÁBRICA DE PALITOS')
  assert.equal(p.valores.I, 'Civil')
})

test('la anotación le gana al historial: «LA ESTRELLA» con n=6 no pisa un «QUATTROPANI» escrito a mano', async () => {
  const p = await planCon('QUATTROPANI')
  assert.equal(p.obra.valor, 'OB-0008 · QP - SALÓN COMERCIAL', 'la columna Obra NO depende del desplegable de la J')
  // La J se escribe con el rótulo EXACTO del desplegable, que no es el cliente canónico: el puente
  // es `cliente_alias`. Y el historial no la puede llenar con el cliente de otra obra.
  assert.equal(p.cols.obraJ, 'Quattropani - Melisa García SAS')
  assert.notEqual(p.cols.obraJ, 'LA ESTRELLA', 'el historial no puede pisar lo que dice el papel')
  assert.equal(p.cols.detalle, 'SALÓN COMERCIAL', 'ni el detalle de la obra de otro cliente')
})

test('si el rótulo del cliente no está en el desplegable, la J queda VACÍA — nunca con el cliente de otra obra', async () => {
  const r = await prepararPlan([tique('QUATTROPANI')], {
    lista: ['Corralon Progreso'], col: COL, perfiles: HISTORIAL_ESTRELLA, destinos: destinosDeObra(CATALOGOS_REALES),
    listas: { obras: ['LA ESTRELLA'], unidades: ['Civil'] },
  })
  const p = r.plan[0]
  assert.equal(p.obra.valor, 'OB-0008 · QP - SALÓN COMERCIAL')
  assert.equal(p.cols.obraJ, null, 'dos clientes en la misma fila es peor que una celda vacía')
})

// ═══ QUÉ DECIDE LA COLUMNA «Obra» CUANDO NO HAY NADA ESCRITO A MANO — LA TRAZA (18/09/2026) ═══
//
// 14/09: el dueño inserta la columna «Obra» en L y se establece que REGISTRA UNA DECISIÓN: lo que
//        sale del historial del proveedor es una estadística sobre otros gastos, así que no se
//        escribe. Este test afirmaba eso (`p.obra.valor === null`).
// 17/09: el dueño reclama lo contrario para los casos deducibles — «no está completando todas las
//        columnas». El caso concreto es la fila 981 (Neumagom, neumáticos, taller): el sistema tenía
//        el historial que la resolvía y se la dejó para que la completara él a mano.
// 18/09: la regla pasa a ser **se escribe sólo lo inequívoco, lo demás se nombra como excepción**.
//        No es aflojar el criterio: es moverlo de «de dónde salió el dato» a «el dato resuelve UNA
//        obra o no». El origen se sigue declarando (`via: 'historial'`, más la marca `[historial:
//        obra]` en el Concepto) y la ambigüedad sigue frenando igual. Pesa además que el sync ya
//        imputaba el espejo `costos_obra` con esa misma J/K una hora después: la decisión se tomaba
//        igual, sólo que fuera de la celda, y el dueño tipeaba lo que el OS ya había resuelto.
//
// Los dos tests de acá abajo son las dos mitades de esa regla. El segundo es el que impide que
// «escribir lo deducible» se convierta en «escribir cualquier cosa».

test('J y K del HISTORIAL escriben la columna Obra cuando resuelven UNA obra — con la vía declarada', async () => {
  const p = await planCon('')
  assert.equal(p.cols.obraJ, 'LA ESTRELLA', 'lo firme del historial se sigue aplicando')
  assert.equal(p.aplicado.obra.n, 6)
  // Las seis cargas de este proveedor fueron a LA ESTRELLA con el detalle «Galpón 9»: J + K resuelven
  // una sola obra del catálogo. Antes del 18/09 esto quedaba en null y lo tipeaba el dueño.
  assert.equal(p.obra.valor, 'OB-0007 · LE - GALPÓN 9')
  assert.equal(p.valores.L, 'OB-0007 · LE - GALPÓN 9', 'y llega a la celda, no sólo al informe')
  assert.equal(p.obra.via, 'historial', 'sin la vía, una inferencia se lee como un dato del papel')
  assert.match(p.obra.porque, /historial del proveedor/)
  // Y queda declarado en el Concepto, que es lo que permite distinguirlo meses después.
  assert.match(p.valores.M, /\[historial:[^\]]*obra/)
})

test('EL LÍMITE: si la K del historial no nombra ninguna obra del cliente, la columna Obra queda VACÍA', async () => {
  // Mismo origen —todo del historial— y el resultado opuesto: «La Estrella» tiene siete obras en el
  // catálogo y «materiales» no nombra ninguna. Elegir la más frecuente sería imputar el costo a una
  // obra por estadística, que es exactamente lo que no se hace. Se deja vacía y se dice por qué.
  const genericos = perfilesDeImputacion(
    Array.from({ length: 6 }, () => ({ proveedor: 'Corralon Progreso', obra_texto: 'LA ESTRELLA', unidad_negocio: 'Civil', detalle: 'materiales', concepto: 'varios' })),
  )
  const p = await planCon('', { perfiles: genericos })
  assert.equal(p.cols.obraJ, 'LA ESTRELLA', 'la J sí se completa: ésa no es ambigua')
  assert.equal(p.obra.valor, null)
  assert.equal(p.valores.L, undefined, 'una celda vacía es mejor que una obra elegida por promedio')
  assert.match(p.obra.porque, /no nombra una obra de LA ESTRELLA/, 'y la excepción se nombra con el porqué')
})

test('los ocho del fajo dc2d0273, por el camino real del cargador', async () => {
  for (const c of CASOS_15_09) {
    const p = await planCon(c.anotacion)
    assert.equal(String(p.obra.valor).split(' · ')[0], c.codigo, `«${c.anotacion}» → ${p.obra.valor} (${p.obra.porque})`)
    assert.equal(p.cols.unidad, c.unidad, `«${c.anotacion}»: Unidad de Negocio`)
    if (c.detalle) assert.equal(p.cols.detalle, c.detalle, `«${c.anotacion}»: Detalle`)
    assert.ok(p.valores.L, 'la columna Obra se escribe, no se propone')
  }
})

test('sin catálogo de obras no se inventa nada: la fila entra igual y se dice por qué', async () => {
  const r = await prepararPlan([tique('SF Pisos Industriales')], {
    lista: ['Corralon Progreso'], listas: LISTAS, col: COL, perfiles: HISTORIAL_ESTRELLA, destinos: null,
  })
  assert.equal(r.plan.length, 1, 'no poder proponer la obra no es motivo para no cargar el gasto')
  assert.equal(r.plan[0].obra.valor, null)
  assert.match(r.plan[0].obra.porque, /sin catálogo/)
})
