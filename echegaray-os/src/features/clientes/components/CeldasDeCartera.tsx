// LAS CELDAS DE PLATA DE LA CARTERA — una por columna, y cada una con su regla.
//
// Viven fuera de `TablaClientes` porque esa tabla pasó de cinco columnas a ocho el 10/09/2026
// («la fila del trabajo reproduce la fila de la pestaña OBRAS») y el archivo se iba a 600 líneas.
// La grilla es una cosa —qué columnas hay y cuándo se sueltan— y qué dice cada celda cuando el dato
// falta es otra: partidas, las dos se leen enteras.

import { pesos, millones } from '@/shared/components/canon/formato'
import { V } from '@/shared/components/v2/patron'
import type { Imputacion, ObraEnCurso } from '@/features/administracion/services/homeCartera'
import { IVA_GENERAL, progresoDeCobroBruto, tituloDeCobro } from '@/features/clientes/services/progresoCobro'
import { ORIGEN_OC_CLIENTE, ORIGEN_SUMA_VIVA, SIN_PRECIO_EN_OBRAS } from '@/features/clientes/services/economiaObras'

// ═══ LOS CORTES POR ANCHO, DECLARADOS UNA VEZ Y COMPARTIDOS CON LA GRILLA ═══
//
// Su `display` NUNCA va inline: un inline le gana a la media query y la celda seguiría ocupando sus
// píxeles inelásticos. Y siempre en px: una variante con otra unidad apaga TODOS los cortes del
// repositorio (ver `cortes-por-ancho-llegan-al-css.test.ts`).

/** El detalle económico: OC, OP y lo cobrado. `25v2:154`. */
export const SOLO_ANCHO = 'max-[1249px]:hidden'
/** «Obras»: en 350px sólo entran quién es y cuánto se le contrató. */
export const SOLO_TABLET = 'max-[767px]:hidden'

/** El tono de los divisores y la pista de las barras. */
export const TONO = { divisorObra: '#F3F2EE', pista: '#EDECE8', textoObra: '#3A3A38' } as const

// ─────────────────────────────────────────────────────────────────────────────────────────────
// LO COBRADO — el importe siempre, y la barra sólo cuando el denominador existe
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * ═══ POR QUÉ EL IMPORTE Y NO SÓLO EL PORCENTAJE ═══
 *
 * La versión de agosto dibujaba SÓLO una barra, y la barra necesita numerador y denominador. Con
 * Cobranzas anotando el cobro contra el CLIENTE y seis obras de Messina sin precio en OBRAS, la
 * columna entera decía «—»: ARCOR cobró $41.086.884 y La Estrella $168.065.740 y la pantalla no lo
 * publicaba. El importe es un HECHO de Cobranzas y no depende de ningún denominador.
 *
 * ═══ CUÁNDO NO HAY BARRA ═══
 *
 * · sin contratado → no hay contra qué medir.
 * · `medible === false` → el denominador no cubre lo que el numerador suma (el cliente con obras
 *   sin precio: San Francisco publicaba «100 %» dividiendo el cobro de 5 obras por el contrato de 4).
 *
 * EL RELLENO ES GRAFITO, NO AMARILLO. El `#FDC900` es la MARCA —1,6:1 sobre blanco— y el énfasis del
 * OS es el grafito. Un único color de énfasis, que es la regla del dueño.
 */
export function Cobrado({ cobrado, contratado, medible, veEconomia, testid, ambito = 'obra', tam, obrasSinPrecio = null, imputacion = null, disponible = true, sinObra = null }: {
  cobrado: number | null
  contratado: number | null
  /**
   * CÓMO LLEGÓ EL COBRO A ESTE TRABAJO. `cliente` = la vista no pudo repartirlo —la etiqueta de
   * Cobranzas nombra al CLIENTE— y entonces este trabajo NO tiene un cobro propio: la fila lo dice
   * con palabras y no dibuja ni el importe ni la barra.
   */
  imputacion?: Imputacion | null
  /** ¿El denominador cubre lo mismo que el numerador? Sin eso, importe sí y porcentaje no. */
  medible: boolean
  veEconomia: boolean
  testid: string
  ambito?: 'obra' | 'cliente'
  tam: string
  obrasSinPrecio?: number | null
  /** ¿La base puede contestar esta pregunta para un trabajo? Es todo o nada: ver abajo. */
  disponible?: boolean
  /**
   * CUÁNTO DE LO COBRADO NO LLEGÓ A NINGÚN TRABAJO. Sólo en la fila del CLIENTE, y sólo si hay algo.
   * Sin este renglón, San Francisco muestra tres trabajos al 25–29 % mientras el cliente lleva el
   * 50 %, y la diferencia se lee como plata que falta cobrar. Es lo contrario de una deuda.
   */
  sinObra?: number | null
}) {
  if (!veEconomia) return <span className={SOLO_ANCHO} />
  // ═══ UN SOLO TRATAMIENTO PARA EL HUECO (dueño, 10/09/2026 18:10) ═══
  //
  // La columna tenía TRES formas de decir «acá no hay número»: un «—», una celda en blanco y la
  // frase «cobro sin trabajo asignado» en tipografía de texto dentro de una columna de plata. El
  // dueño las vio en la misma pantalla. Ahora hay una sola —el «—»— y el MOTIVO, que es lo que
  // cambia de un caso a otro, vive en el `title`.
  const sinDato = !disponible || imputacion === 'cliente' || cobrado === null
  const porQueNoHay = !disponible
    ? 'La base todavía no puede repartir el cobro por obra: no hay pregunta que contestar acá.'
    : imputacion === 'cliente'
      ? 'Cobranzas registra este cobro contra el CLIENTE y no se pudo repartir a una obra: el '
        + 'importe está en la fila del cliente, arriba. NO es «no cobró».'
      : 'Ninguna cobranza imputada a esta obra. NO es cobrado $ 0: es que no hay ninguna fila de '
        + 'Cobranzas atada a ella.'
  // EL DENOMINADOR SE LLEVA A LA ESPECIE DEL NUMERADOR: lo cobrado es bruto y lo contratado neto.
  // ═══ UNA SOLA BARRA, Y ES LA DEL TRABAJO (dueño, 11/09/2026: «me está mostrando dos barras de
  //     progreso sin respetar lo que marca el diseño») ═══
  // La fila del CLIENTE dibujaba una segunda barra cuando ninguna de sus obras quedaba sin precio:
  // Quattropani —una obra— salía con dos barras iguales y Messina con una. El cobro del cliente es
  // la bolsa entera y se publica como cifra; la fracción sólo tiene sentido trabajo por trabajo.
  const p = ambito === 'obra' && medible && !sinDato ? progresoDeCobroBruto(cobrado, contratado) : null
  // LA BASE DEL PORCENTAJE SE ESCRIBE: «$107,9 M cobrado» al lado de «$95,3 M contratado» con una
  // barra al 94 % es una contradicción a la vista —107 no es el 94 % de 95—. El denominador es el
  // contrato llevado a la especie del cobro (× 1,21) y se dice ahí mismo, en la escala de millones.
  const base = p && contratado !== null ? millones(contratado * IVA_GENERAL) : null
  // LA DEDUCCIÓN SE DECLARA. `unica-obra` es la única imputación que NO sale de la base: la deriva
  // `armarCartera` porque el cliente tiene un solo trabajo en curso y no hay entre qué repartir.
  const titulo = (imputacion === 'unica-obra'
    ? 'Cobranzas registra este cobro contra el CLIENTE, y se le atribuye a este trabajo por ser el '
      + 'ÚNICO en curso: no hay entre qué repartirlo. Es una deducción, no una imputación por OC. — '
    : '')
    + (sinDato ? `${porQueNoHay} ` : '')
    + tituloDeCobro({ cobrado, contratado: contratado === null ? null : contratado * IVA_GENERAL, ambito, obrasSinPrecio })
    // ═══ POR QUÉ EL DENOMINADOR NO ES EL NÚMERO DE LA COLUMNA DE AL LADO ═══
    //
    // Quattropani: cobrado $107.877.339 al lado de un contratado de $95.303.124. Puestos así, el
    // cobro parece exceder el contrato en $12,6 M, y no lo excede: uno lleva IVA y el otro no. El
    // `title` escribe la cuenta entera para que nadie la haga a ojo.
    + (sinObra !== null
        ? ` — ${pesos(sinObra)} de ese cobro Cobranzas lo anota contra el CLIENTE y todavía no se `
          + 'repartió entre sus obras. NO es deuda: es lo contrario, y por eso el porcentaje de cada '
          + 'obra de abajo es más bajo que el de esta fila'
        : '')
    + (contratado === null || ambito !== 'obra'
        ? ''
        : ` — la fracción compara el cobro CON IVA contra el contrato llevado a la misma especie `
          + `(${pesos(contratado)} × 1,21 = ${pesos(contratado * IVA_GENERAL)}): lo contratado es `
          + 'neto y lo cobrado no, y restarlos directo da una diferencia que no existe')
  return (
    <span
      className={`flex flex-col items-end justify-center ${SOLO_ANCHO}`}
      data-testid={testid} data-cobro={p ? String(p.pct) : 'sin-porcentaje'}
      data-imputacion={imputacion ?? undefined} title={titulo}
      style={{ gap: 2, textAlign: 'right' }}
    >
      {/* «—» ES «ACÁ NO HAY NÚMERO», NUNCA CERO: el `title` dice cuál de los tres motivos es. */}
      <span
        className="font-mono tabular-nums" data-testid={`${testid}-importe`}
        style={{ fontSize: tam, color: sinDato ? V.lupa : V.tinta }}
      >
        {sinDato ? '—' : pesos(cobrado)}
      </span>
      {/* «s/obra» DEJÓ DE SER UN RENGLÓN DIBUJADO (dueño, 10/09/2026 18:12: «columnas que no
          solicité… confusa»). Lo que no se repartió sigue dicho, y en el único lugar donde el OS
          pone la trazabilidad de un número: el `title` de la celda. */}
      {p && (
        <span className="flex items-center justify-end" style={{ gap: 6 }}>
          <span style={{ display: 'flex', height: 4, width: 40, borderRadius: 2, background: TONO.pista, flexShrink: 0 }}>
            {/* EL RELLENO ES SIEMPRE GRAFITO, TAMBIÉN CUANDO EXCEDE (10/09/2026). El ámbar de este
                OS significa PROBLEMA —«rojo/naranja sólo para problemas», regla del dueño— y haber
                cobrado más que el contrato es plata que entró: son adicionales facturados fuera del
                contrato. La barra se queda en 100 % y el `title` dice cuánto y por qué. */}
            <span style={{ width: `${p.pct}%`, background: V.grafito, borderRadius: 2 }} />
          </span>
          {/* NUNCA UN PORCENTAJE MAYOR A 100: `progresoDeCobro` lo acota, y lo que sobra se dice
              con palabras en el `title`. Un «113 %» en rojo se lee como un defecto de la pantalla. */}
          <span
            className="font-mono tabular-nums" data-excede={p.excede ? '' : undefined}
            style={{ fontSize: '10.5px', color: V.tenue, flexShrink: 0 }}
          >
            {p.excede ? `> ${base}` : `${p.pct} % de ${base}`}
          </span>
        </span>
      )}
    </span>
  )
}

// ═══ «POR COBRAR», «▲ VENCIDO» Y «PRÓX. COBRO» SE FUERON (dueño, 10/09/2026 18:12) ═══
//
// «Sección cliente todo mal, inentendible, con columnas que no solicité… te había pedido columnas
// determinadas.» Las tres columnas venían de traducir la pestaña OBRAS entera a la pantalla, y la
// pestaña es del ERP: acá alcanzan las seis que el dueño pidió a lo largo del día —CLIENTE, OBRAS,
// OC, OP, CONTRATADO, COBRADO—. La CAPACIDAD no se perdió: `obra_cuenta` las publica y
// `getCobradoPorObra` las lee, así que el día que se pidan es una celda, no una entrega.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// LO CONTRATADO DE UN TRABAJO — con la marca de cuando no es un precio
// ─────────────────────────────────────────────────────────────────────────────────────────────

const AYUDA_SUMA_VIVA = 'OBRAS no publica precio para este trabajo: el número es la SUMA VIVA de lo '
  + 'que Cobranzas lleva registrado como venta, y sube cada vez que se factura. No es lo que el '
  + 'trabajo vale, y por eso puede quedar por debajo de las órdenes de compra que el cliente mandó.'

/** «U$S 63.000» — el contrato en su moneda. Sin centavos: un contrato redondo no lleva decimales. */
const dolares = (v: number) => `U$S ${Math.round(v).toLocaleString('es-AR')}`

/**
 * LO CONTRATADO DE UN TRABAJO — LA MONEDA DEL CONTRATO SE DICE, NO SE ESCONDE.
 *
 * ═══ EL CASO QUE LO ORIGINÓ (dueño, 10/09/2026: «pésimo por donde lo mires») ═══
 *
 * Quattropani - SALÓN COMERCIAL se contrató en U$S 63.000. La fila publicaba sólo los pesos
 * —$95.303.124— y ese número cambia SOLO de un día para otro, porque es una valuación al tipo de
 * cambio vivo. Sin la moneda escrita, el dueño ve un contrato que se mueve sin que nadie lo toque.
 *
 * Ahora se dibujan los dos: el contrato arriba (U$S) y su valuación de hoy debajo, con el TC en el
 * `title`. Las dos son cifras, así que las dos van en mono tabular: una celda, una tipografía.
 *
 * ═══ Y DE DÓNDE SALE EL NÚMERO, CUANDO NO ES UN PRECIO DE OBRAS ═══
 *
 *   `oc-cliente`  lo respalda una ORDEN DE COMPRA del cliente y la fila lo dice con su número
 *                 («según OC 2256»), que es un papel verificable.
 *   `suma-viva`   no hay papel: es lo que Cobranzas lleva registrado como venta y sube al facturar.
 *                 La marca es el «·», y la frase entera vive en el `title`.
 *
 * La `nota` de la vista —«OC $X c/IVA vs Cobranzas $Y»— va al `title` cuando existe: una diferencia
 * escrita se resuelve; una que sólo existe entre dos pantallas, no.
 */
export function ContratadoDeObra({ o, veEconomia }: { o: ObraEnCurso; veEconomia: boolean }) {
  const viva = o.origenContratado === ORIGEN_SUMA_VIVA
  const porOC = o.origenContratado === ORIGEN_OC_CLIENTE
  const titulo = [
    o.contratadoUsd != null && o.tipoCambio != null
      ? `Contrato de ${dolares(o.contratadoUsd)}, valuado al tipo de cambio de hoy `
        + `($${Math.round(o.tipoCambio).toLocaleString('es-AR')}): el número en pesos cambia todos `
        + 'los días y el contrato no.'
      : null,
    viva ? AYUDA_SUMA_VIVA : null,
    porOC && o.referencia
      ? `${o.referencia}: OBRAS no declara precio para este trabajo, pero la orden de compra del `
        + 'cliente lo respalda. Es un papel verificable, no una suma que sube al facturar.'
      : null,
    o.nota,
  ].filter(Boolean).join(' — ')
  if (!veEconomia) return <span data-testid="contratado-obra" />
  return (
    <span
      className="flex flex-col items-end justify-center"
      data-testid="contratado-obra"
      data-origen={o.origenContratado ?? undefined}
      title={titulo || undefined}
      style={{ textAlign: 'right', gap: 1 }}
    >
      {/* LA CIFRA. En dólares cuando el contrato es en dólares: es la que no se mueve. */}
      <span
        className={o.contratado === null && o.contratadoUsd === null ? '' : 'font-mono tabular-nums'}
        data-testid="contratado-suma-viva-marca"
        style={{
          fontSize: '11.5px',
          color: o.contratado === null && o.contratadoUsd === null ? V.warn : V.apagado,
        }}
      >
        {o.contratadoUsd != null
          ? dolares(o.contratadoUsd)
          : o.contratado === null ? SIN_PRECIO_EN_OBRAS : pesos(o.contratado)}
        {viva && o.contratado !== null && o.contratadoUsd == null ? ' ·' : ''}
      </span>
      {/* EL SEGUNDO RENGLÓN: la valuación de hoy, o el papel que respalda el número. Uno u otro
          —nunca los dos—: dos renglones bajo una cifra es la caja que el patrón v2 sacó. */}
      {o.contratadoUsd != null && o.contratado !== null && (
        <span className="font-mono tabular-nums" data-testid="contratado-en-pesos" style={{ fontSize: '10.5px', color: V.tenue }}>
          ≈ {pesos(o.contratado)}
        </span>
      )}
      {/* «SEGÚN OC 2256» VA EN EL `title` Y NO DIBUJADO (dueño, 10/09/2026 18:12). Es la
          trazabilidad del número, no una segunda cifra: escrita al lado, mete texto en una columna
          de plata y vuelve la fila ilegible. */}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// LAS ÓRDENES DE COMPRA DEL TRABAJO — el total de la VENTANA, y el histórico aparte
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * ═══ POR QUÉ DOS TOTALES Y NO UNO ═══
 *
 * BSA absorbió `bsa-planta` y con ella tres OC de 2024 por $38.321.214. La celda sumaba todo y
 * publicaba «$ 49.886.583 · 5 OC» al lado de un contratado de $17,7 M: dos magnitudes de años
 * distintos comparadas sin avisar. `oc_civa_ventana` es lo que el cliente emitió DENTRO del año que
 * acota el contratado; el resto se nombra —«+ $38,3 M histórico»— y NO se suma.
 *
 * ═══ Y CUANDO NO HAY NINGUNA OC, PERO SÍ CONTRATO ═══
 *
 * Quattropani no tiene orden de compra: tiene un contrato en dólares. La celda decía nada, y una
 * celda vacía en una columna de papeles se lee como «se perdió el papel». Dice «Contrato U$S 63.000
 * · sin OC», que es el hecho.
 */
export function OrdenesDelTrabajo({ o, veEconomia, clase }: {
  o: ObraEnCurso; veEconomia: boolean; clase: string
}) {
  const n = o.ocNVentana ?? 0
  const historico = o.ocCivaHistorico != null && o.ocCivaHistorico > 0 ? o.ocCivaHistorico : null
  const titulo = [
    'Órdenes de compra del cliente por este trabajo, CON IVA, dentro del año que acota lo '
    + 'contratado (obra_economia_cartera). El importe es el total del PDF: no se resta contra lo '
    + 'contratado, que es neto.',
    historico ? `${pesos(historico)} más son órdenes de otros años —típicamente de una obra `
      + 'fusionada— y por eso no se suman acá.' : null,
    o.nota,
  ].filter(Boolean).join(' ')
  // UNA SOLA LÍNEA Y UNA SOLA TIPOGRAFÍA: «$ 12.100.000 · 1 OC». El histórico de la obra fusionada
  // NO se dibuja —era el segundo renglón que el dueño llamó confuso— y vive en el `title`.
  return (
    <span
      className={`flex items-center justify-end font-mono tabular-nums ${clase}`}
      data-testid="oc-trabajo" title={titulo}
      style={{ fontSize: '11.5px', color: n === 0 ? V.tenue : V.tinta, textAlign: 'right' }}
    >
      {n === 0
        ? 'sin OC'
        : `${veEconomia && o.ocCivaVentana != null ? `${pesos(o.ocCivaVentana)} · ` : ''}${n} OC`}
    </span>
  )
}
