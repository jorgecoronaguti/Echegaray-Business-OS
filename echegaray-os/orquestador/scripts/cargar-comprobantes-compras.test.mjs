import test from 'node:test'
import assert from 'node:assert/strict'
import { escribirYVerificar, prepararPlan } from './cargar-comprobantes-compras.mjs'
import { colIndice } from '../lib/carga-comprobantes.mjs'
import { indexarCompras } from '../lib/comprobantes/compras-vivas.mjs'

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

/** Fila de la pestaña Compras tal como la devuelve `readSheetValues(RANGO)`: C fecha … O total. */
function filaCompras({ fecha, proveedor, tipo = '', numero, obra = '', detalle = '', total }) {
  const r = []
  r[0] = fecha; r[2] = proveedor; r[4] = tipo; r[5] = numero; r[7] = obra; r[8] = detalle; r[12] = total
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
