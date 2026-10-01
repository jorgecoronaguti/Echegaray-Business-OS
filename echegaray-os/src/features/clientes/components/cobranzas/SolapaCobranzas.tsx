// LA SECCIÓN DE COBRANZAS DEL CLIENTE: SU ESTADO DE CUENTA.
//
// ═══ LOS PEDIDOS, EN ORDEN ═══
//
// 10/09/2026 · «Necesito una sección exclusiva por cliente con todo lo que involucre cobranzas…
//              toda la información de la pestaña Cobranzas del Sheet… bien organizada por cliente
//              (con OC si corresponde).»
// 11/09/2026 · «Es realmente muy difícil de entender…» → los totales de cada bloque pasaron a ser
//              la suma exacta de sus renglones, y la pestaña se partió en por cobrar / cobrado.
// 24/09/2026 · «Muchos datos sin sentido, necesito saber cuánto cobré en negro, cuánto en blanco,
//              cuánto fue lo que se contrató y cuánto falta cobrar.» → cuatro cifras y ninguna más.
// 01/10/2026 · filtro por fecha de factura y por fecha de cobro. Y el mismo día: «esto realmente es
//              inservible e inusable… no puedo saber nada de las cobranzas de ningún cliente… no se
//              entiende, revisar y rehacer toda esa sección».
//
// ═══ QUÉ ESTABA MAL EL 01/10, MEDIDO SOBRE LA FICHA DE MESSINA ═══
//
// 1 · TRECE TABLITAS PARA VEINTISÉIS RENGLONES. Cada obra era un bloque con su título, su lista de
//     órdenes de compra con importes, su propio encabezado de columnas y uno o dos renglones. No
//     había una columna que se pudiera recorrer con la vista: ni las fechas ni los importes.
// 2 · LA AGENDA NO ESTABA ORDENADA. «Por cobrar» se ordenaba por fecha DENTRO de cada obra, así que
//     para saber qué entra primero había que leer las trece.
// 3 · NINGÚN RENGLÓN DECÍA SU ESTADO NI SU FECHA DE FACTURA. El filtro nuevo recortaba por una fecha
//     que no estaba en pantalla.
// 4 · LO COBRADO ESTABA PLEGADO debajo de todo: la historia del cliente no se veía sin buscarla.
// 5 · LA CABECERA CAMBIABA CON LOS FILTROS y pegaba el recorte al rótulo: con «Por cobrar» elegido
//     decía «COBRADO EN BLANCO · POR COBRAR — nada cobrado en blanco», que se lee como que el
//     cliente nunca pagó nada.
//
// ═══ CÓMO ESTÁ ORGANIZADA AHORA ═══
//
// A · LA CABECERA ES LA POSICIÓN DEL CLIENTE, ENTERA Y FIJA: contratado · cobrado en blanco ·
//     cobrado en negro · falta cobrar. No se mueve con los filtros.
// B · UNA SOLA TABLA —un estado de cuenta, en el lenguaje de la tabla «Certificados y facturas» de
//     la pantalla 28 del diseño—: documento, las dos fechas del Sheet (factura y cobro), el
//     circuito, neto, IVA, monto y el ESTADO en palabras. La obra es la segunda línea del documento.
// C · DOS BANDAS QUE NO SE PISAN, LAS DOS ABIERTAS: por cobrar, por fecha de cobro —la agenda, de
//     corrido entre todas las obras—, y cobrado, con lo último que entró primero. El total de cada
//     banda es la suma de sus renglones y va en la columna MONTO, para verificarlo bajando la vista.
// D · LOS FILTROS MIDEN EN LAS BANDAS, Y LO DICEN: «3 de 11 filas». Así el número de una banda
//     filtrada no se confunde con la posición de arriba.
// E · LAS ANULADAS existen en el Sheet y no suman: van al final, plegadas y dichas.
//
// LO QUE NO ESTÁ, A PROPÓSITO: costo, avance, HH, materiales. Ésta es la cara COMERCIAL de la
// relación; el ERP vive en el módulo Obras, a un clic desde la obra de cada renglón.

import { pesos } from '@/shared/components/canon/formato'
import { V } from '@/shared/components/v2/patron'
import { CifrasDeFicha, type CifraDeFicha } from '@/shared/components/v2/segundoNivel'
import { FiltrosSuaves } from '@/shared/components/v2/FiltrosSuaves'
import { C } from '../canon/tokens'
import {
  filasSinImporte, ordenarPorCobro, partirEnSecciones, recortar,
  totalDeFilas, totalesDeCobranzas, totalPorCircuito, vencidoDeFilas,
  type EnSuMoneda, type FilaCobranza, type RecorteCobranza,
} from '../../services/cobranzasCliente'
import { filtrarPorFechas, hayFechasActivas, type FiltroDeFechas as FechasDelFiltro } from '../../services/filtroDeFechasCobranza'
import { COLS_COBRANZA, EncabezadoDeColumnas, FilaDeCobranza } from './FilaDeCobranza'
import { FiltroDeFechas } from './FiltroDeFechas'

const AYUDA_CONTRATADO = 'El precio de venta de las obras del cliente, de OBRAS. Es la única cifra '
  + 'de esta tira que NO sale de la pestaña Cobranzas, y por eso va aparte.'
const AYUDA_POR_COBRAR = 'Lo que falta cobrar, con IVA: las filas que no están cobradas ni '
  + 'anuladas.'
const AYUDA_VENCIDO = 'De lo que falta cobrar, lo vencido como lo publica la pestaña: estado '
  + 'Pendiente con fecha de cobro anterior a hoy.'
const AYUDA_BANDA = 'La suma exacta de los renglones de esta banda que se están viendo.'
const AYUDA_COBRADO_BLANCO = 'Lo COBRADO de las filas «B» (con factura), con IVA. Criterio PERCIBIDO: sólo lo que ya '
  + 'entró. Lo cobrado en dólares se suma valuado al tipo de cambio de la planilla.'
const AYUDA_COBRADO_NEGRO = 'Lo COBRADO de las filas «N» (sin factura ni IVA). Criterio PERCIBIDO: sólo lo que ya '
  + 'entró. Lo cobrado en dólares se suma valuado al tipo de cambio de la planilla.'

const usd = (n: number) => `U$S ${Math.round(n).toLocaleString('es-AR')}`

/**
 * UNA CIFRA EN SU MONEDA: lo que entró en pesos y lo que entró en dólares, cada uno en la suya y sin sumarlos
 * («$ 84.581.019 + U$S 15.400»; dueño, 24/09/2026). El total valuado en pesos va en la ayuda.
 */
function enSuMoneda(rotulo: string, m: EnSuMoneda, falta: string, titulo: string): CifraDeFicha {
  if (m.pesos == null) return { rotulo, valor: null, falta, titulo }
  if (!m.usd) return { rotulo, valor: pesos(m.pesos), falta, titulo }
  const partes = [m.ars ? pesos(m.ars) : null, usd(m.usd)].filter(Boolean)
  return { rotulo, valor: partes.join(' + '), falta, titulo: `${titulo} Todo junto, valuado en pesos: ${pesos(m.pesos)}.` }
}

export function SolapaCobranzas({
  filas, obras, contratado, contratadoUsd, recorte, hrefRecorte, fechas, hrefSinFechas,
}: {
  /** `null` = no se pudieron leer. «No pude leerlas» no se dibuja como «no tiene ninguna». */
  filas: FilaCobranza[] | null
  /** Las obras del cliente: de acá sale el nombre que cada renglón lleva en su segunda línea. */
  obras: { obra_id: string; nombre: string }[]
  /** Lo contratado del cliente (neto), de `cliente_economia`. Es la única cifra de la cabecera que
   *  NO sale de esta pestaña, y por eso lleva su rótulo aparte. */
  contratado: number | null
  /** El contrato en dólares, cuando lo hay: la moneda del contrato se dice, no se esconde. */
  contratadoUsd: number | null
  recorte: RecorteCobranza
  hrefRecorte: (r: RecorteCobranza) => string
  /** Los rangos de fecha de la URL (`fdesde` `fhasta` `cdesde` `chasta`), ya validados. */
  fechas: FechasDelFiltro
  /** La dirección actual sin los parámetros de fecha: conserva solapa y recorte. */
  hrefSinFechas: string
}) {
  if (filas === null) {
    return (
      <p data-testid="cobranzas-sin-leer" style={{ fontSize: '12.5px', color: V.warn, padding: '10px 0' }}>
        No pude leer las cobranzas de este cliente. NO significa que no tenga: significa que la
        consulta falló.
      </p>
    )
  }

  // ═══ LA CABECERA ES LA POSICIÓN DEL CLIENTE; LOS FILTROS MIDEN EN LAS BANDAS (01/10/2026) ═══
  //
  // Del 11/09 al 01/10 la cabecera medía el recorte y lo pegaba al rótulo, para que no hubiera dos
  // «por cobrar» distintos en pantalla. El remedio produjo el defecto que el dueño fotografió: con
  // «Por cobrar» elegido la cabecera decía «COBRADO EN BLANCO · POR COBRAR — nada cobrado en
  // blanco». Ahora son dos preguntas con dos lugares: arriba, cuánto se contrató, cuánto entró y
  // cuánto falta, del cliente entero; abajo, cada banda suma lo que se ve y dice de cuántas («3 de
  // 11 filas»), así que un número filtrado no se puede leer como la posición.
  const posicion = totalesDeCobranzas(filas)
  const todas = partirEnSecciones(filas)
  // El filtro de fechas entra ANTES del recorte y por el mismo camino: opciones y filas salen de la
  // misma población, así que no pueden contradecirse.
  const enFechas = filtrarPorFechas(filas, fechas)
  const visibles = recortar(enFechas, recorte)
  const { porCobrar, cobrado, anuladas } = partirEnSecciones(visibles)
  const obraDe = new Map(obras.map((o) => [o.obra_id, o]))

  // ═══ CUATRO CIFRAS Y NINGUNA MÁS (dueño, 24/09/2026) ═══
  // La plata en dólares se dice en dólares: si todo lo de una cifra es U$S, la cifra es U$S y el
  // valor en pesos va en la ayuda; si es mixta, se dicen las dos partes sin sumarlas.
  const cifras: CifraDeFicha[] = [
    {
      rotulo: 'Contratado',
      valor: contratadoUsd != null
        ? usd(contratadoUsd)
        : contratado != null ? pesos(contratado) : null,
      falta: 'sin precio en OBRAS',
      titulo: AYUDA_CONTRATADO,
    },
    enSuMoneda('Cobrado en blanco', posicion.cobradoBlanco, 'nada cobrado en blanco', AYUDA_COBRADO_BLANCO),
    enSuMoneda('Cobrado en negro', posicion.cobradoNegro, 'nada cobrado en negro', AYUDA_COBRADO_NEGRO),
    enSuMoneda('Falta cobrar', posicion.pendienteEnSuMoneda, 'nada pendiente', AYUDA_POR_COBRAR),
  ]

  return (
    <div data-testid="solapa-cobranzas">
      <CifrasDeFicha cifras={cifras} testid="cifras-cobranzas" />
      <div style={{ padding: '14px 20px 0' }}>
        <FiltrosSuaves
          testid="filtro-cobranzas"
          conteo={{ n: visibles.length, total: filas.length, sustantivo: 'filas' }}
          opciones={[
            { clave: 'todo', etiqueta: 'Todo', href: hrefRecorte('todo'), activo: recorte === 'todo' },
            { clave: 'pendiente', etiqueta: 'Por cobrar', href: hrefRecorte('pendiente'), activo: recorte === 'pendiente', cuenta: recortar(enFechas, 'pendiente').length },
            { clave: 'cobrado', etiqueta: 'Cobrado', href: hrefRecorte('cobrado'), activo: recorte === 'cobrado', cuenta: recortar(enFechas, 'cobrado').length },
            { clave: 'b', etiqueta: 'B', href: hrefRecorte('b'), activo: recorte === 'b', cuenta: recortar(enFechas, 'b').length },
            { clave: 'n', etiqueta: 'N', href: hrefRecorte('n'), activo: recorte === 'n', cuenta: recortar(enFechas, 'n').length },
          ]}
          despues={(
            <FiltroDeFechas
              hrefSinFechas={hrefSinFechas}
              hayActivas={hayFechasActivas(fechas)}
              conFactura={filas.some((f) => f.fecha_venta !== undefined)}
              valores={{
                fdesde: fechas.factura.desde ?? '', fhasta: fechas.factura.hasta ?? '',
                cdesde: fechas.cobro.desde ?? '', chasta: fechas.cobro.hasta ?? '',
              }}
            />
          )}
        />

        {visibles.length === 0
          ? (
            <p data-testid="cobranzas-vacio" style={{ fontSize: '12.5px', color: V.apagado, padding: '10px 0' }}>
              {filas.length === 0
                ? 'Este cliente no tiene ninguna fila en la pestaña Cobranzas.'
                : 'Ninguna fila entra en este recorte.'}
            </p>
          )
          : (
            <div data-testid="estado-de-cuenta" style={{ marginBottom: 24 }}>
              <EncabezadoDeColumnas />
              {/* LA AGENDA: lo que falta cobrar, por fecha de cobro y de corrido entre todas las obras. */}
              <Seccion
                clave="por-cobrar" titulo="Por cobrar" filas={ordenarPorCobro(porCobrar, 'asc')}
                deCuantas={todas.porCobrar.length} obraDe={obraDe}
              />
              {/* LA HISTORIA: lo cobrado, con lo último que entró primero. Abierta: es la mitad de lo
                  que el dueño viene a mirar. */}
              <Seccion
                clave="cobrado" titulo="Cobrado" filas={ordenarPorCobro(cobrado, 'desc')}
                deCuantas={todas.cobrado.length} obraDe={obraDe}
              />
              {/* LAS ANULADAS EXISTEN EN EL SHEET Y NO SUMAN EN NINGÚN TOTAL. Esconderlas del todo es
                  cómo un total deja de cuadrar contra el archivo sin que nadie sepa por qué. */}
              <Seccion
                clave="anuladas" titulo="Anuladas" filas={ordenarPorCobro(anuladas, 'desc')}
                deCuantas={todas.anuladas.length} obraDe={obraDe} plegada
                sinTotal="no suman en ningún total"
              />
            </div>
          )}
      </div>
    </div>
  )
}

/**
 * UNA BANDA DEL ESTADO DE CUENTA Y SUS RENGLONES.
 *
 * EL TOTAL DE LA BANDA ES LA SUMA DE LAS FILAS QUE TIENE DEBAJO Y NADA MÁS —`totalDeFilas`—, y va
 * en la columna MONTO: un número que cierra tiene que poder verificarse a ojo, bajando la vista por
 * la misma columna. `plegada` la dibuja como `<details>`: funciona sin JavaScript.
 */
function Seccion({ clave, titulo, filas, deCuantas, obraDe, plegada = false, sinTotal }: {
  clave: string
  titulo: string
  filas: FilaCobranza[]
  /** Cuántas filas tiene esta banda SIN filtros: «3 de 11» dice que lo que se ve es una parte. */
  deCuantas: number
  obraDe: Map<string, { obra_id: string; nombre: string }>
  plegada?: boolean
  /** Cuando la banda no publica un total sumable, la frase que dice por qué. */
  sinTotal?: string
}) {
  if (filas.length === 0) return null
  const vencido = vencidoDeFilas(filas)
  const sinImporte = filasSinImporte(filas)
  const { b, n } = totalPorCircuito(filas)
  const cuenta = filas.length === deCuantas
    ? `${filas.length} ${filas.length === 1 ? 'fila' : 'filas'}`
    : `${filas.length} de ${deCuantas} filas`
  const detalle = { fontSize: '11.5px', color: V.tenue } as const

  const banda = (
    <div
      className={`grid gap-[14px] ${COLS_COBRANZA}`}
      style={{
        alignItems: 'baseline', padding: '10px 0', background: C.tenueFondo,
        borderBottom: `1px solid ${V.lineaFuerte}`, cursor: plegada ? 'pointer' : undefined,
      }}
    >
      {/* Todo lo que no es el total va en una sola celda que llega hasta la columna MONTO. */}
      <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1 min-w-0" style={{ gridColumn: '1 / -3' }}>
        <span style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: V.tinta }}>
          {plegada && <span aria-hidden style={{ color: V.tenue, marginRight: 6 }}>▸</span>}
          {titulo}
        </span>
        <span className="font-mono tabular-nums" data-testid={`cuenta-seccion-${clave}`} style={detalle}>{cuenta}</span>
        {vencido != null && (
          <span className="font-mono tabular-nums" title={AYUDA_VENCIDO} style={{ fontSize: '11.5px', color: C.neg }}>
            vencido {pesos(vencido)}
          </span>
        )}
        {/* LOS DOS CIRCUITOS, que suman el total de la banda sin resto. Sólo cuando hay de los dos. */}
        {b != null && n != null && (
          <span className="font-mono tabular-nums" data-testid={`circuitos-seccion-${clave}`} title="Los dos circuitos de esta banda. Suman su total sin resto." style={detalle}>
            B {pesos(b)} · N {pesos(n)}
          </span>
        )}
        {/* UNA FILA SIN IMPORTE NO SUMA, y un total que no lo dice vuelve a ser un total que no
            cierra, sólo que en silencio: `total_bruto` es nullable en la pestaña. */}
        {sinImporte > 0 && (
          <span className="font-mono tabular-nums" data-testid="sin-importe-seccion" style={detalle}>
            +{sinImporte} sin importe
          </span>
        )}
        {sinTotal && <span style={{ fontSize: '11.5px', color: V.tenue }}>{sinTotal}</span>}
      </span>
      <span
        className="font-mono tabular-nums" data-testid={`total-seccion-${clave}`} title={AYUDA_BANDA}
        style={{ fontSize: '13px', fontWeight: 600, color: V.tinta, textAlign: 'right', whiteSpace: 'nowrap' }}
      >
        {sinTotal ? '' : pesos(totalDeFilas(filas)) ?? '—'}
      </span>
      <span className="max-[899px]:hidden" />
    </div>
  )

  const cuerpo = filas.map((f) => (
    <FilaDeCobranza key={f.cobranza_id} f={f} obra={f.obra_id ? obraDe.get(f.obra_id) ?? null : null} />
  ))

  if (!plegada) {
    return <section data-testid={`seccion-${clave}`}>{banda}{cuerpo}</section>
  }
  return (
    <details data-testid={`seccion-${clave}`}>
      <summary style={{ listStyle: 'none' }} className="[&::-webkit-details-marker]:hidden">{banda}</summary>
      {cuerpo}
    </details>
  )
}
