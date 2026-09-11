// LA SECCIÓN EXCLUSIVA DE COBRANZAS DEL CLIENTE.
//
// ═══ EL PEDIDO ORIGINAL (dueño, 10/09/2026) ═══
//
// «Necesito una sección exclusiva por cliente con todo lo que involucre cobranzas; quiero que
// lleves toda la información de la pestaña Cobranzas del Sheet Flujo de Fondos bien organizada por
// cliente (con OC si corresponde)… usá tu habilidad de UX al máximo.»
//
// ═══ LA CORRECCIÓN (dueño, 11/09/2026) ═══
//
// «Es realmente muy difícil de entender lo que hiciste en la sección Cobranzas dentro de Clientes;
// revisala, usá tu skill de UX y mejorala por completo, eso no es útil así como está.»
//
// ═══ QUÉ ESTABA MAL, MEDIDO ═══
//
// 1 · LOS TOTALES DE UN GRUPO NO CERRABAN CON SUS RENGLONES. El encabezado de cada trabajo decía
//     «facturado · cobrado · pendiente» con TRES DENOMINADORES DISTINTOS —facturado contaba sólo
//     las filas B; cobrado y pendiente contaban B+N—, así que por construcción no podían sumar.
//     Playón de Azufre publicaba «facturado $78,0 M» arriba de renglones que sumaban $114,9 M.
//     Un total que no cierra no es un número impreciso: es un número que no se puede usar.
// 2 · LO QUE FALTA COBRAR ESTABA MEZCLADO CON LO QUE YA ENTRÓ, renglón contra renglón, y la
//     primera pregunta del dueño —«¿cuánto me debe hoy y cuándo entra lo próximo?»— exigía leer
//     veinticuatro filas y sumarlas mentalmente.
// 3 · LOS CONCEPTOS SE TRUNCABAN con «…» exactamente donde estaba el dato que explicaba el
//     renglón: la orden de compra, el tipo de cambio, la condición de pago.
// 4 · NUEVE COLUMNAS DEL MISMO PESO y una columna «estado» que repetía en cada fila, en tres
//     colores, algo que la estructura ya podía decir gratis.
//
// ═══ CÓMO ESTÁ ORGANIZADA AHORA, Y POR QUÉ ═══
//
// A · LA CABECERA CONTESTA LA PRIMERA PREGUNTA Y NADA MÁS: POR COBRAR · VENCIDO · PRÓXIMO COBRO
//     (fecha, importe y el medio en el rótulo). Recién después —y ahí sí como marco, no como
//     respuesta— vienen contratado, facturado y cobrado. Es una tira de valores con su rótulo
//     chico arriba, no seis tarjetas: la jerarquía la dan el orden y el aire.
// B · EL CUERPO SE PARTE EN TRES POBLACIONES QUE NO SE PISAN —por cobrar · cobrado · anuladas— y
//     recién adentro de cada una se agrupa por trabajo. Ése es el cambio que hace que un total sea
//     verificable: el número del encabezado de un grupo es, por construcción, la suma de los
//     renglones que tiene debajo (`totalDeFilas`), y su test lo prueba sobre las filas reales.
// C · LO QUE FALTA COBRAR VA ARRIBA Y ABIERTO, ORDENADO POR FECHA DE COBRO: es la agenda. Lo
//     cobrado va abajo y PLEGADO, ordenado al revés —lo último que entró, primero—: es historia, y
//     el dueño autorizó plegarla. Las anuladas quedan al final, plegadas y dichas: existen en el
//     Sheet y no suman en ningún total.
// D · LOS DOS CIRCUITOS SE DICEN, NO SE PINTAN. Cada fila lleva su letra —B con comprobante, N
//     sin— y cada grupo publica el corte «B $x · N $y» cuando tiene de los dos. Nunca en ámbar:
//     una fila N no es un problema, es otro circuito.
// E · EL ÁMBAR ES SÓLO LO VENCIDO, y va pegado a la fecha que lo causó.
// F · NINGÚN PÁRRAFO EXPLICATIVO PERMANENTE. Lo que hay que explicar de un número vive en el
//     `title` de su rótulo o de su fila, que es donde el OS pone la trazabilidad.
//
// LO QUE NO ESTÁ, A PROPÓSITO: costo, avance, HH, materiales. Ésta es la cara COMERCIAL de la
// relación; el ERP vive en el módulo Obras.

import Link from 'next/link'
import { pesos } from '@/shared/components/canon/formato'
import { V } from '@/shared/components/v2/patron'
import { CifrasDeFicha, type CifraDeFicha } from '@/shared/components/v2/segundoNivel'
import { FiltrosSuaves } from '@/shared/components/v2/FiltrosSuaves'
import {
  agruparCobranzas, filasSinImporte, ordenarPorCobro, partirEnSecciones, proximoCobro, recortar,
  totalDeFilas, totalesDeCobranzas, totalPorCircuito, vencidoDeFilas,
  type FilaCobranza, type RecorteCobranza,
} from '../../services/cobranzasCliente'
import type { Orden } from '../../services/papelesCliente'
import { OrdenesDeLaObra } from '../OrdenesDeLaObra'
import { dia, EncabezadoDeColumnas, FilaDeCobranza } from './FilaDeCobranza'

const AYUDA_CONTRATADO = 'El precio de venta de las obras del cliente, de OBRAS. Es la única cifra '
  + 'de esta tira que NO sale de la pestaña Cobranzas, y por eso va aparte.'
const AYUDA_FACTURADO = 'Lo FACTURADO: las filas «B» de la pestaña, que son las que tienen '
  + 'comprobante. Criterio DEVENGADO — se facturó, todavía no entró. Las filas «N» no llevan '
  + 'comprobante y por eso no suman acá: no se compara contra «cobrado», que sí las cuenta.'
const AYUDA_COBRADO = 'Lo COBRADO, total con IVA. Criterio PERCIBIDO: sólo lo que ya entró, con el '
  + 'mismo predicado que la pestaña OBRAS y que la cuenta del cliente.'
const AYUDA_POR_COBRAR = 'Lo que falta cobrar, con IVA: las filas que no están cobradas ni '
  + 'anuladas. Es la suma exacta de los renglones del bloque «Por cobrar» que se está viendo — con '
  + 'un recorte puesto, mide el recorte, y el rótulo lo dice.'
const AYUDA_VENCIDO = 'De lo que falta cobrar, lo que ya pasó su plazo: EMISIÓN + 30 días, el reloj '
  + 'de la pestaña OBRAS. No es «pasó la fecha de cobro», que se re-tipea cada vez que un cobro se '
  + 'posterga y está condenado a cero por construcción.'
const AYUDA_PROXIMO = 'La próxima fecha de cobro pendiente y la suma de TODO lo que cae ese día. Es '
  + 'una PREVISIÓN: la prueba de que entró es el extracto del banco.'

/** Una cifra de plata, o el motivo por el que no hay ninguna. Nunca un cero por una ausencia. */
function cifra(
  rotulo: string, valor: number | null, falta: string, titulo: string, tono?: 'warn',
): CifraDeFicha {
  return {
    rotulo, valor: valor == null ? null : pesos(valor), falta, titulo,
    tono: valor ? tono : undefined,
  }
}

export function SolapaCobranzas({
  filas, obras, obrasConOC, contratado, contratadoUsd, recorte, hrefRecorte,
}: {
  /** `null` = no se pudieron leer. «No pude leerlas» no se dibuja como «no tiene ninguna». */
  filas: FilaCobranza[] | null
  /** Las obras del cliente, EN EL ORDEN de la ficha: dos listas del mismo cliente ordenadas
   *  distinto se leen como dos clientes. */
  obras: { obra_id: string; nombre: string }[]
  /** Las órdenes de compra de cada obra, con su PDF. La misma lista que dibuja la lista de
   *  `/clientes`: dos formatos del mismo papel se separan en cuanto uno aprende algo. */
  obrasConOC: Map<string, Orden[]>
  /** Lo contratado del cliente (neto), de `cliente_economia`. Es la única cifra de la cabecera que
   *  NO sale de esta pestaña, y por eso lleva su rótulo aparte. */
  contratado: number | null
  /** El contrato en dólares, cuando lo hay: la moneda del contrato se dice, no se esconde. */
  contratadoUsd: number | null
  recorte: RecorteCobranza
  hrefRecorte: (r: RecorteCobranza) => string
}) {
  if (filas === null) {
    return (
      <p data-testid="cobranzas-sin-leer" style={{ fontSize: '12.5px', color: V.warn, padding: '10px 0' }}>
        No pude leer las cobranzas de este cliente. NO significa que no tenga: significa que la
        consulta falló.
      </p>
    )
  }

  const visibles = recortar(filas, recorte)
  // ═══ LA CABECERA MIDE LO QUE SE ESTÁ VIENDO, NO OTRA COSA (auditoría, 11/09/2026) ═══
  //
  // Medía sobre `filas` mientras las bandas medían sobre el recorte: con `?cob=n` la cabecera decía
  // POR COBRAR $114.916.324 arriba de una banda que decía $18.750.000. Dos rótulos iguales y dos
  // números distintos en la misma pantalla es exactamente el defecto que esta pestaña vino a matar.
  // El rótulo lleva el recorte pegado para que nadie tenga que deducir de qué población habla.
  const total = totalesDeCobranzas(visibles)
  const proximo = proximoCobro(visibles)
  const { porCobrar, cobrado, anuladas } = partirEnSecciones(visibles)
  const RECORTADO: Record<string, string> = { pendiente: 'por cobrar', cobrado: 'cobrado', b: 'B', n: 'N' }
  /** El recorte pegado al rótulo — salvo cuando el rótulo YA lo dice: «Por cobrar · por cobrar»
   *  no agrega información, agrega ruido. */
  const conRecorte = (rotulo: string) => {
    const r = RECORTADO[recorte]
    return !r || rotulo.toLowerCase().startsWith(r.toLowerCase()) ? rotulo : `${rotulo} · ${r}`
  }

  const cifras: CifraDeFicha[] = [
    // LAS TRES PRIMERAS SON LA RESPUESTA A «¿cuánto me debe hoy y cuándo entra lo próximo?».
    cifra(conRecorte('Por cobrar'), total.pendiente, 'nada pendiente', AYUDA_POR_COBRAR),
    cifra(conRecorte('Vencido'), total.vencido, 'nada vencido', AYUDA_VENCIDO, 'warn'),
    {
      // EL MEDIO VA EN EL RÓTULO Y NO EN EL VALOR: el valor es cifra —mono tabular— y el medio es
      // una palabra. Mezclarlos en una celda es exactamente lo que la regla del módulo prohíbe.
      // Sin medio único en el día, el rótulo NO elige uno: ver `proximoCobro`.
      rotulo: proximo?.medio ? `Próximo cobro · ${proximo.medio}` : conRecorte('Próximo cobro'),
      valor: proximo
        ? `${dia(proximo.fecha)}${proximo.importe != null ? ` · ${pesos(proximo.importe)}` : ''}`
        : null,
      falta: 'sin cobros previstos',
      titulo: AYUDA_PROXIMO,
    },
    // Y ESTAS TRES SON EL MARCO, NO LA RESPUESTA: de dónde viene la relación y cuánto lleva.
    {
      rotulo: 'Contratado',
      valor: contratadoUsd != null
        ? `U$S ${Math.round(contratadoUsd).toLocaleString('es-AR')}`
        : contratado != null ? pesos(contratado) : null,
      falta: 'sin precio en OBRAS',
      titulo: AYUDA_CONTRATADO,
    },
    cifra(conRecorte('Facturado (B)'), total.facturado, 'ninguna fila B', AYUDA_FACTURADO),
    cifra(conRecorte('Cobrado c/IVA'), total.cobrado, 'nada cobrado todavía', AYUDA_COBRADO),
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
            { clave: 'pendiente', etiqueta: 'Por cobrar', href: hrefRecorte('pendiente'), activo: recorte === 'pendiente', cuenta: recortar(filas, 'pendiente').length },
            { clave: 'cobrado', etiqueta: 'Cobrado', href: hrefRecorte('cobrado'), activo: recorte === 'cobrado', cuenta: recortar(filas, 'cobrado').length },
            { clave: 'b', etiqueta: 'B', href: hrefRecorte('b'), activo: recorte === 'b', cuenta: recortar(filas, 'b').length },
            { clave: 'n', etiqueta: 'N', href: hrefRecorte('n'), activo: recorte === 'n', cuenta: recortar(filas, 'n').length },
          ]}
        />

        {visibles.length === 0 && (
          <p data-testid="cobranzas-vacio" style={{ fontSize: '12.5px', color: V.apagado, padding: '10px 0' }}>
            {filas.length === 0
              ? 'Este cliente no tiene ninguna fila en la pestaña Cobranzas.'
              : 'Ninguna fila entra en este recorte.'}
          </p>
        )}

        {/* LA AGENDA: lo que falta cobrar, arriba, abierto y por fecha de cobro. */}
        <Seccion
          clave="por-cobrar" titulo="Por cobrar" abierta plegable={false}
          filas={porCobrar} sentido="asc" obras={obras} obrasConOC={obrasConOC}
          ayudaTotal={AYUDA_POR_COBRAR}
        />
        {/* LA HISTORIA: lo cobrado, abajo y plegado —salvo que sea lo único que queda a la vista—,
            con lo último que entró primero. */}
        <Seccion
          clave="cobrado" titulo="Cobrado" abierta={porCobrar.length === 0} plegable
          filas={cobrado} sentido="desc" obras={obras} obrasConOC={obrasConOC}
          ayudaTotal={AYUDA_COBRADO}
        />
        {/* LAS ANULADAS EXISTEN EN EL SHEET Y NO SUMAN EN NINGÚN TOTAL. Esconderlas del todo es cómo
            un total deja de cuadrar contra el archivo sin que nadie sepa por qué. */}
        <Seccion
          clave="anuladas" titulo="Anuladas" abierta={porCobrar.length === 0 && cobrado.length === 0}
          plegable filas={anuladas} sentido="desc" obras={obras} obrasConOC={obrasConOC}
          sinTotal="no suman en ningún total"
        />
      </div>
    </div>
  )
}

/**
 * UNA DE LAS TRES POBLACIONES DE LA PESTAÑA.
 *
 * La banda de la sección publica SU total —la suma de todas sus filas visibles— y adentro se agrupa
 * por trabajo. `plegable` la dibuja como `<details>`: funciona sin JavaScript, que es lo que tiene
 * que pasar en un Server Component.
 */
function Seccion({
  clave, titulo, filas, sentido, obras, obrasConOC, abierta, plegable, ayudaTotal, sinTotal,
}: {
  clave: string
  titulo: string
  filas: FilaCobranza[]
  sentido: 'asc' | 'desc'
  obras: { obra_id: string; nombre: string }[]
  obrasConOC: Map<string, Orden[]>
  abierta: boolean
  plegable: boolean
  ayudaTotal?: string
  /** Cuando la sección no publica un total sumable, la frase que dice por qué. */
  sinTotal?: string
}) {
  if (filas.length === 0) return null
  const grupos = agruparCobranzas(filas, obras)
  const vencido = vencidoDeFilas(filas)
  const sinImporte = filasSinImporte(filas)

  const banda = (
    <span style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', width: '100%' }}>
      <span style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: V.tinta }}>
        {plegable && <span aria-hidden style={{ color: V.tenue, marginRight: 6 }}>▸</span>}
        {titulo}
      </span>
      <span className="font-mono tabular-nums" style={{ fontSize: '11.5px', color: V.tenue }}>
        {filas.length} {filas.length === 1 ? 'fila' : 'filas'}
      </span>
      {vencido != null && (
        <span className="font-mono tabular-nums" style={{ fontSize: '11.5px', color: V.warn }} title={AYUDA_VENCIDO}>
          ▲ vencido {pesos(vencido)}
        </span>
      )}
      {/* UNA FILA SIN IMPORTE NO SUMA, Y UN TOTAL QUE NO LO DICE VUELVE A SER UN TOTAL QUE NO
          CIERRA — sólo que en silencio. `total_bruto` es nullable en la pestaña. */}
      {sinImporte > 0 && (
        <span className="font-mono tabular-nums" data-testid="sin-importe-seccion" style={{ fontSize: '11.5px', color: V.tenue }}>
          +{sinImporte} sin importe
        </span>
      )}
      <span style={{ flex: 1 }} />
      {sinTotal
        ? <span style={{ fontSize: '11px', color: V.tenue }}>{sinTotal}</span>
        : (
          <span
            className="font-mono tabular-nums" data-testid={`total-seccion-${clave}`} title={ayudaTotal}
            style={{ fontSize: '14px', fontWeight: 600, color: V.tinta }}
          >
            {pesos(totalDeFilas(filas)) ?? '—'}
          </span>
        )}
    </span>
  )

  // CON UN SOLO TRABAJO, EL TOTAL DEL GRUPO ES EL DE LA SECCIÓN: publicarlo dos veces a veinte
  // píxeles de distancia se lee como un número que no cierra, que es justo lo que se vino a arreglar.
  const cuerpo = grupos.map((g) => (
    <GrupoDeTrabajo
      key={g.obra_id ?? 'sin-obra'}
      titulo={g.titulo}
      sinObra={g.obra_id === null}
      filas={ordenarPorCobro(g.filas, sentido)}
      ordenes={g.obra_id ? obrasConOC.get(g.obra_id) ?? [] : []}
      href={g.obra_id ? `/obras/${g.obra_id}` : null}
      conTotal={!sinTotal && grupos.length > 1}
    />
  ))

  const filoBanda = {
    display: 'flex', alignItems: 'baseline', gap: 12, padding: '8px 0',
    borderBottom: `1px solid ${V.lineaFuerte}`, cursor: plegable ? 'pointer' : undefined,
    listStyle: 'none' as const,
  }

  if (!plegable) {
    return (
      <section data-testid={`seccion-${clave}`} style={{ marginBottom: 24 }}>
        <div style={filoBanda}>{banda}</div>
        {cuerpo}
      </section>
    )
  }
  return (
    <details data-testid={`seccion-${clave}`} open={abierta} style={{ marginBottom: 24 }}>
      <summary style={filoBanda} className="[&::-webkit-details-marker]:hidden">{banda}</summary>
      {cuerpo}
    </details>
  )
}

/**
 * UN TRABAJO DENTRO DE UNA SECCIÓN.
 *
 * EL TOTAL DEL ENCABEZADO ES LA SUMA DE LAS FILAS QUE TIENE DEBAJO Y NADA MÁS —`totalDeFilas`—, y
 * se dibuja ALINEADO SOBRE LA COLUMNA «TOTAL» que suma: un número que cierra tiene que poder
 * verificarse a ojo, bajando la vista por la misma columna.
 */
function GrupoDeTrabajo({ titulo, filas, ordenes, href, sinObra, conTotal }: {
  titulo: string
  filas: FilaCobranza[]
  ordenes: Orden[]
  href: string | null
  sinObra: boolean
  conTotal: boolean
}) {
  const vencido = vencidoDeFilas(filas)
  const sinImporte = filasSinImporte(filas)
  const { b, n } = totalPorCircuito(filas)
  return (
    <div data-testid="grupo-cobranzas" style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, padding: '12px 0 4px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '12.5px', fontWeight: 600, color: sinObra ? V.apagado : V.tinta }}>
          {titulo}
        </span>
        {/* EL PUENTE AL ERP, UNA VEZ POR GRUPO Y NOMBRADO. No cuelga de cada fila: el módulo Obras
            es otro sistema y el dueño mandó dejar de mezclarlos. */}
        {href && (
          <Link href={href} prefetch={false} data-testid="ver-en-obras" style={{ fontSize: '10.5px', color: V.tenue }}>
            Ver en Obras →
          </Link>
        )}
        {sinObra && (
          // NO ES UN CHIP DE ADORNO: dice por qué estas filas están juntas, que es lo único que un
          // grupo llamado «sin obra» no puede callar.
          <span style={{ fontSize: '10.5px', color: V.tenue }}>
            Cobranzas las anota contra el cliente: ningún papel las ató a una obra
          </span>
        )}
        <span style={{ flex: 1 }} />
        {conTotal && (
          <span
            className="font-mono tabular-nums" data-testid="total-grupo-cobranzas"
            title="La suma exacta de los renglones de este trabajo en este bloque."
            style={{ fontSize: '12.5px', fontWeight: 600, color: V.tinta }}
          >
            {pesos(totalDeFilas(filas)) ?? '—'}
          </span>
        )}
      </div>
      {/* LAS OC DEL TRABAJO, con su número, su día, su importe y su PDF. Mismo componente que la
          lista de `/clientes`: dos formatos del mismo papel se separan en cuanto uno aprende algo. */}
      {ordenes.length > 0 && (
        <div style={{ paddingBottom: 4 }}>
          <OrdenesDeLaObra ordenes={ordenes} veEconomia sangria={0} />
        </div>
      )}
      {/* EL CORTE QUE CIERRA: vencido (subconjunto) y los dos circuitos, que suman el total de
          arriba sin resto. Sólo se dibuja cuando dice algo — un grupo de un solo circuito y sin
          nada vencido no necesita repetir su propio total en dos lugares. */}
      {(vencido != null || sinImporte > 0 || (b != null && n != null)) && (
        <div
          className="font-mono tabular-nums" data-testid="corte-grupo-cobranzas"
          style={{ display: 'flex', gap: 14, paddingBottom: 4, fontSize: '11px', color: V.tenue, flexWrap: 'wrap' }}
        >
          {vencido != null && <span title={AYUDA_VENCIDO} style={{ color: V.warn }}>▲ vencido {pesos(vencido)}</span>}
          {sinImporte > 0 && (
            <span data-testid="sin-importe-grupo" title="Filas de este trabajo que no traen importe en la pestaña: se ven, y no suman en el total de arriba.">
              +{sinImporte} sin importe
            </span>
          )}
          {b != null && n != null && (
            <span title="Los dos circuitos de este bloque. Suman el total del trabajo sin resto.">
              B {pesos(b)} · N {pesos(n)}
            </span>
          )}
        </div>
      )}
      <EncabezadoDeColumnas />
      {filas.map((f) => <FilaDeCobranza key={f.cobranza_id} f={f} />)}
    </div>
  )
}
