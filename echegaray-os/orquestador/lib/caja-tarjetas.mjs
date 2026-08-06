// LAS CINCO TARJETAS EJECUTIVAS DE CAJA — LA PORTADA, EN CINCO NÚMEROS.
//
// ═══ POR QUÉ EXISTEN (05/08/2026) ═══
//
// El dueño, textual: *"no quiero que parezca una planilla. Quiero que parezca un producto de Treasury
// de nivel JPMorgan/Stripe Treasury/Mercury/Brex/Kyriba… Dirección debe entender la situación en menos
// de cinco segundos"*. Cinco segundos no alcanzan para leer una tabla: alcanzan para leer cinco
// números grandes. Todo lo demás de la pestaña es el detalle de estos cinco.
//
// LA FORMA DE UNA TARJETA ES SIEMPRE LA MISMA, y ésa es la mitad del diseño: rótulo chico en gris
// arriba, el número grande abajo, y UNA línea de contexto en gris que dice a qué fecha vale o qué
// habilita. Tres renglones, ni uno más. Un cuadro donde cada celda tiene una forma distinta obliga a
// decodificar antes de leer, y eso ya cuesta más de cinco segundos.
//
// ═══ NINGÚN NÚMERO NACE ACÁ ═══
//
// Cuatro de las cinco cifras son FÓRMULAS sobre el libro canónico (`_MOVIMIENTOS`) construidas con
// `terminoLibro`, o REFERENCIAS a la celda de la pestaña que ya calcula ese número. La quinta —el
// cuello de botella— es un INDEX/MATCH sobre la escalera de vencimientos que está tres filas más
// abajo. Ninguna tarjeta hace una cuenta propia: si el detalle cambia, la tarjeta cambia con él, y no
// puede existir la situación en la que el titular dice una cosa y la tabla de abajo otra.
//
// EL LIBRO SE CONSULTA POR `terminoLibro` Y NO A MANO. Escribir el SUMPRODUCT acá sería la segunda
// definición de "lo que sale en los próximos 30 días" — exactamente la enfermedad que el libro vino a
// curar (ver lib/libro-sumas.mjs). Si mañana el libro suma una columna, cambia un archivo.

import { terminoLibro, formulaLibro } from './libro-sumas.mjs'

/**
 * LOS ESTADOS QUE TODAVÍA NO PASARON POR EL BANCO.
 *
 * `REAL` queda AFUERA a propósito en toda proyección: un movimiento real ya está adentro del saldo
 * que publica el bloque de cuentas (por el extracto, o por la línea de movimientos posteriores al
 * corte). Sumarlo otra vez al proyectar sería contar la misma plata dos veces, que es el defecto más
 * caro y más silencioso de este archivo.
 */
export const NO_REAL = Object.freeze(['COMPROMETIDO', 'PROYECTADO', 'VENCIDO'])

/** El horizonte de la tarjeta de proyección, en días. Un mes es el ciclo con el que se decide acá. */
export const HORIZONTE = 30

/** Plata dibujada dentro de una frase. Sin decimales: en una línea de contexto los centavos son ruido. */
const plata = (e) => `TEXT(${e};"$#,##0")`
/** Una fecha dentro de una frase. dd/mm y no dd/mm/yyyy: el año se sobreentiende y ocupa lugar. */
const dia = (e) => `TEXT(${e};"dd/mm")`

/**
 * LAS CINCO TARJETAS, EN ORDEN. Puras: devuelven fórmulas, no tocan nada.
 *
 * El orden es el de la pregunta que se hace un tesorero, y no se negocia: cuánto tengo → cuánto ya
 * está comprometido → con cuánto termino el mes → cuál es el peor momento → cuándo es ese momento.
 * Leído de izquierda a derecha cuenta una historia; en cualquier otro orden son cinco números sueltos.
 *
 * @param {object} ref las celdas ya resueltas de la propia pestaña (referencias A1 absolutas)
 * @param {string} ref.total celda del total de disponibilidades
 * @param {string} ref.fecha celda de la fecha de ese total
 * @param {string} ref.piso celda del mínimo de la posición acumulada de la escalera
 * @param {string} ref.peorCaso celda de la punta de abajo de la banda de incertidumbre
 * @param {string} ref.fechaPiso celda de la fecha en la que cae el piso
 * @param {string} ref.tramos rango de los rótulos de los tramos
 * @param {string} ref.saldos rango de la posición acumulada, tramo por tramo
 * @returns {Array<{clave:string,rotulo:string,valor:string,contexto:string,especie:'plata'|'texto'}>}
 */
export function tarjetas(ref) {
  const faltan = ['total', 'fecha', 'piso', 'peorCaso', 'fechaPiso', 'tramos', 'saldos']
    .filter((k) => !ref?.[k])
  // FALLA CERRADO. Una referencia vacía produciría `=` o `=MIN()` — una celda en error en la primera
  // pantalla de la pestaña más mirada del archivo. Es barato romper acá y carísimo descubrirlo allá.
  if (faltan.length) throw new Error(`caja-tarjetas: faltan las referencias ${faltan.join(', ')}`)

  const ventana = { desde: 'TODAY()', hasta: `TODAY()+${HORIZONTE}`, estados: NO_REAL }
  const entra30 = terminoLibro({ ...ventana, signo: 1, medida: 'magnitud' })
  const sale30 = terminoLibro({ ...ventana, signo: -1, medida: 'magnitud' })
  const venceEn7 = terminoLibro({ signo: -1, estados: ['COMPROMETIDO'], hasta: 'TODAY()+7', medida: 'magnitud' })

  return [
    {
      clave: 'disponible',
      rotulo: 'CAJA DISPONIBLE',
      // NO SE RECALCULA: es la celda del total del bloque de cuentas, que ya vive tres filas abajo con
      // su detalle a la vista. Una segunda suma acá sería un número que puede diferir del de abajo.
      valor: `=${ref.total}`,
      contexto: `=IF(ISNUMBER(${ref.fecha});"al "&${dia(ref.fecha)}&" · bancos, caja y valores en cartera";"⚠ el bloque de cuentas todavía no publicó su fecha")`,
      especie: 'plata',
    },
    {
      clave: 'comprometida',
      rotulo: 'CAJA COMPROMETIDA',
      // MAGNITUD Y NO NETO: lo comprometido se lee como "cuánto debo", un número positivo. Con `neto`
      // saldría en negativo por el signo del egreso y la tarjeta diría "-$43.380.472 comprometidos",
      // que se lee como si la deuda fuera a favor.
      valor: formulaLibro({ signo: -1, estados: ['COMPROMETIDO'], medida: 'magnitud' }),
      contexto: `="de eso "&${plata(venceEn7)}&" vence antes del "&${dia('TODAY()+7')}`,
      especie: 'plata',
    },
    {
      clave: 'proyectada',
      rotulo: `CAJA PROYECTADA · ${HORIZONTE} DÍAS`,
      valor: `=${ref.total}+${terminoLibro(ventana)}`,
      // EN MILLONES, NO EN PESOS: el auditor de pantalla midió 48 caracteres en una columna de 38.
      // Un contexto que se corta no informa; el detalle exacto vive en la escalera de al lado.
      contexto: `="al "&${dia(`TODAY()+${HORIZONTE}`)}&" · +"&TEXT(${entra30}/1000000;"$#,##0.0")&"M · -"&TEXT(${sale30}/1000000;"$#,##0.0")&"M"`,
      especie: 'plata',
    },
    {
      clave: 'riesgo',
      rotulo: 'RIESGO DE LIQUIDEZ',
      // EL PISO, QUE ES EL NÚMERO CON EL QUE SE DECIDE CUÁNTA PLATA SE INMOVILIZA. No es el saldo de
      // hoy ni el de fin de mes: es el punto más bajo de todo el recorrido, y por debajo de él la
      // empresa no puede pasar sin pedir plata prestada.
      valor: `=${ref.piso}`,
      // Y NO SE PUBLICA SOLO: hay cheques cuya cobertura no se sabe. Con el piso a secas esa
      // ignorancia se lee como certeza. Si la banda es de ancho cero, la frase no aparece — una banda
      // que no existe es ruido.
      // Corto para su columna (el auditor midió 65 sobre 39): el detalle del peor caso está en la
      // escalera y en el anexo; acá alcanza con el número.
      contexto: `=IF(${ref.peorCaso}>=${ref.piso};"el punto más bajo del recorrido";"peor caso "&TEXT(${ref.peorCaso}/1000000;"$#,##0.0")&"M sin cobertura")`,
      especie: 'plata',
    },
    {
      clave: 'cuello',
      rotulo: 'PRÓXIMO CUELLO DE BOTELLA',
      // ES TEXTO A PROPÓSITO: "Esta semana" es accionable y "12/08" obliga a mirar el almanaque. Sale
      // del MISMO MATCH que produce el piso, así que no puede quedar señalando otro tramo.
      valor: `=IFERROR(INDEX(${ref.tramos};MATCH(MIN(${ref.saldos});${ref.saldos};0));"—")`,
      contexto: `=IF(ISNUMBER(${ref.fechaPiso});"toca su punto más bajo el "&${dia(ref.fechaPiso)};"cae en el tramo abierto: de acá en adelante")`,
      especie: 'texto',
    },
  ]
}
