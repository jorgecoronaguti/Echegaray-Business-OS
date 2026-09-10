// LAS CELDAS DE PLATA DE LA CARTERA — una por columna, y cada una con su regla.
//
// Viven fuera de `TablaClientes` porque esa tabla pasó de cinco columnas a ocho el 10/09/2026
// («la fila del trabajo reproduce la fila de la pestaña OBRAS») y el archivo se iba a 600 líneas.
// La grilla es una cosa —qué columnas hay y cuándo se sueltan— y qué dice cada celda cuando el dato
// falta es otra: partidas, las dos se leen enteras.

import { pesos } from '@/shared/components/canon/formato'
import { V } from '@/shared/components/v2/patron'
import type { Imputacion, ObraEnCurso } from '@/features/administracion/services/homeCartera'
import { IVA_GENERAL, progresoDeCobroBruto, tituloDeCobro } from '@/features/clientes/services/progresoCobro'
import { ORIGEN_SUMA_VIVA, SIN_PRECIO_EN_OBRAS } from '@/features/clientes/services/economiaObras'

// ═══ LOS CORTES POR ANCHO, DECLARADOS UNA VEZ Y COMPARTIDOS CON LA GRILLA ═══
//
// Su `display` NUNCA va inline: un inline le gana a la media query y la celda seguiría ocupando sus
// píxeles inelásticos. Y siempre en px: una variante con otra unidad apaga TODOS los cortes del
// repositorio (ver `cortes-por-ancho-llegan-al-css.test.ts`).

/** Los papeles y el próximo cobro: lo primero que se suelta. */
export const SOLO_XL = 'max-[1399px]:hidden'
/** El saldo —por cobrar y vencido—: se suelta cuando ya no entra sin apretar el nombre. */
export const SOLO_ANCHO = 'max-[1199px]:hidden'
/** En 390px sólo entran quién es y cuánto se le contrató. */
export const SOLO_TABLET = 'max-[767px]:hidden'

/** El tono de los divisores y la pista de las barras. */
export const TONO = { divisorObra: '#F3F2EE', pista: '#EDECE8', textoObra: '#3A3A38' } as const

export const AYUDA_PROXIMO = 'La próxima cobranza esperada de este trabajo, con su medio de cobro '
  + '(Cobranzas). Es una PREVISIÓN: la prueba de que entró es el extracto del banco.'

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
  if (!veEconomia) return <span className={SOLO_TABLET} />
  // ═══ TODO O NADA (dueño, 10/09/2026 16:25: «uno con barra de progreso y otros no») ═══
  //
  // Mientras la base no pueda repartir el cobro por obra —`obra_cobranza.imputacion` sin aplicar—
  // NINGUNA fila de trabajo publica cobro. La única que tenía barra era Quattropani, y no porque se
  // supiera más de ella: su etiqueta de Cobranzas coincide con el id de su única obra. Una sola
  // barra en una columna vacía se lee como que las otras no cobraron.
  if (!disponible) return <span className={SOLO_TABLET} data-testid={testid} data-cobro="sin-imputacion" />
  if (imputacion === 'cliente') {
    return (
      <span
        className={`flex items-center justify-end ${SOLO_TABLET}`}
        data-testid={testid} data-cobro="sin-obra-asignada"
        title={'Cobranzas registra este cobro contra el CLIENTE y la vista no pudo repartirlo a un '
          + 'trabajo: el importe está en la fila del cliente, arriba. No es «no cobró».'}
        style={{ fontSize: '10.5px', color: V.tenue, textAlign: 'right' }}
      >
        cobro sin trabajo asignado
      </span>
    )
  }
  // EL DENOMINADOR SE LLEVA A LA ESPECIE DEL NUMERADOR: lo cobrado es bruto y lo contratado neto.
  const p = medible ? progresoDeCobroBruto(cobrado, contratado) : null
  // LA DEDUCCIÓN SE DECLARA. `unica-obra` es la única imputación que NO sale de la base: la deriva
  // `armarCartera` porque el cliente tiene un solo trabajo en curso y no hay entre qué repartir.
  const titulo = (imputacion === 'unica-obra'
    ? 'Cobranzas registra este cobro contra el CLIENTE, y se le atribuye a este trabajo por ser el '
      + 'ÚNICO en curso: no hay entre qué repartirlo. Es una deducción, no una imputación por OC. — '
    : '')
    + tituloDeCobro({ cobrado, contratado: contratado === null ? null : contratado * IVA_GENERAL, ambito, obrasSinPrecio })
  return (
    <span
      className={`flex flex-col items-end justify-center ${SOLO_TABLET}`}
      data-testid={testid} data-cobro={p ? String(p.pct) : 'sin-porcentaje'}
      data-imputacion={imputacion ?? undefined} title={titulo}
      style={{ gap: 2, textAlign: 'right' }}
    >
      {/* «—» ES «NINGUNA COBRANZA IMPUTADA», NO CERO: el `title` dice cuál de las dos. */}
      <span
        className="font-mono tabular-nums" data-testid={`${testid}-importe`}
        style={{ fontSize: tam, color: cobrado === null ? V.lupa : V.tinta }}
      >
        {cobrado === null ? '—' : pesos(cobrado)}
      </span>
      {/* «s/trabajo» ES UNA UNIDAD, NO UNA FRASE, y por eso va en la familia de la cifra. La
          explicación entera, en el `title`. */}
      {sinObra !== null && (
        <span
          className="font-mono tabular-nums" data-testid="cobro-sin-obra"
          title={'Cobrado que Cobranzas anota contra el CLIENTE y no contra un trabajo, así que '
            + 'todavía no se repartió. NO es deuda: es lo contrario. Por eso el porcentaje de cada '
            + 'trabajo de abajo es más bajo que el del cliente.'}
          style={{ fontSize: '10.5px', color: V.tenue }}
        >
          {pesos(sinObra)} s/trabajo
        </span>
      )}
      {p && (
        <span className="flex items-center justify-end" style={{ gap: 6 }}>
          <span style={{ display: 'flex', height: 4, width: 52, borderRadius: 2, background: TONO.pista, flexShrink: 0 }}>
            <span style={{ width: `${p.pct}%`, background: p.excede ? V.warn : V.grafito, borderRadius: 2 }} />
          </span>
          <span className="font-mono tabular-nums" style={{ fontSize: '10.5px', color: V.tenue, flexShrink: 0 }}>
            {p.pct} %
          </span>
        </span>
      )}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// EL SALDO DEL TRABAJO — por cobrar, vencido, y cuándo entra
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * UNA CIFRA DE COBRANZAS. VACÍA CUANDO LA VISTA NO PUBLICA LA COLUMNA, y nunca un cero.
 *
 * `obra_cobranza` todavía no publica `vencido` ni `proximo_cobro` (la migración que las agrega está
 * en curso). Un «$ 0» en Vencido afirmaría que este cliente no debe nada atrasado, que es
 * exactamente la conclusión que hace que nadie revise. Un hueco no se rellena.
 */
export function CifraDeCobranza({ valor, tam, alarma = false, testid, clase }: {
  valor: number | null; tam: string; alarma?: boolean; testid: string; clase: string
}) {
  return (
    <span
      className={`font-mono tabular-nums ${clase}`} data-testid={testid}
      data-vacia={valor === null ? '' : undefined}
      style={{
        fontSize: tam, textAlign: 'right',
        color: valor === null ? V.lupa : alarma ? V.warn : V.tintaSuave,
      }}
    >
      {valor === null ? '' : `${alarma ? '▲ ' : ''}${pesos(valor)}`}
    </span>
  )
}

/** `29/09 · Transferencia`. La fecha en mono —se compara de arriba abajo— y el medio en texto. */
export function ProximoCobro({ proximo, clase }: {
  proximo: { fecha: string | null; medio: string | null } | null
  clase: string
}) {
  if (!proximo?.fecha && !proximo?.medio) return <span className={clase} data-testid="proximo-cobro" />
  const dia = proximo.fecha ? proximo.fecha.slice(8, 10) + '/' + proximo.fecha.slice(5, 7) : null
  return (
    <span
      className={`flex flex-col items-end justify-center ${clase}`} data-testid="proximo-cobro"
      title={AYUDA_PROXIMO} style={{ gap: 1, textAlign: 'right' }}
    >
      {dia && <span className="font-mono tabular-nums" style={{ fontSize: '11.5px', color: V.tintaSuave }}>{dia}</span>}
      {proximo.medio && (
        <span className="truncate" style={{ fontSize: '10.5px', color: V.tenue }}>{proximo.medio}</span>
      )}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// LO CONTRATADO DE UN TRABAJO — con la marca de cuando no es un precio
// ─────────────────────────────────────────────────────────────────────────────────────────────

const AYUDA_SUMA_VIVA = 'OBRAS no publica precio para este trabajo: el número es la SUMA VIVA de lo '
  + 'que Cobranzas lleva registrado como venta, y sube cada vez que se factura. No es lo que el '
  + 'trabajo vale, y por eso puede quedar por debajo de las órdenes de compra que el cliente mandó.'

export function ContratadoDeObra({ o, veEconomia }: { o: ObraEnCurso; veEconomia: boolean }) {
  const viva = o.origenContratado === ORIGEN_SUMA_VIVA
  return (
    <span
      className="flex items-center justify-end"
      data-testid="contratado-obra"
      data-origen={o.origenContratado ?? undefined}
      title={viva ? AYUDA_SUMA_VIVA : undefined}
      style={{ textAlign: 'right', gap: 1 }}
    >
      {/* LA SEÑAL ES LA MISMA MARCA QUE YA USA LA TABLA PARA «este total no es lo que parece»: el
          «·» del total parcial de papeles. La frase entera vive en el `title`, que es donde el OS
          pone la trazabilidad de un número. */}
      <span
        className={o.contratado === null ? '' : 'font-mono tabular-nums'}
        data-testid="contratado-suma-viva-marca"
        style={{ fontSize: '11.5px', color: o.contratado === null ? V.warn : V.apagado }}
      >
        {veEconomia ? (o.contratado === null ? SIN_PRECIO_EN_OBRAS : pesos(o.contratado)) : ''}
        {veEconomia && viva && o.contratado !== null ? ' ·' : ''}
      </span>
    </span>
  )
}

