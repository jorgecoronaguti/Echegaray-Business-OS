// LA SECCIÓN EXCLUSIVA DE COBRANZAS DEL CLIENTE — la pestaña del Sheet, organizada por trabajo.
//
// ═══ EL PEDIDO (dueño, 10/09/2026 18:20) ═══
//
// «Necesito una sección exclusiva por cliente con todo lo que involucre cobranzas; quiero que
// lleves toda la información de la pestaña Cobranzas del Sheet Flujo de Fondos bien organizada por
// cliente (con OC si corresponde)… usá tu habilidad de UX al máximo.»
//
// ═══ CÓMO ESTÁ ORGANIZADA, Y POR QUÉ ASÍ ═══
//
// 1 · LA CABECERA CONTESTA LA PREGUNTA ENTERA en una línea de cifras sin tarjetas: contratado,
//     facturado, cobrado, pendiente, vencido y cuándo entra el próximo. Son SEIS valores con su
//     rótulo chico arriba — no seis cards con sombra, que es lo que la regla del dueño prohíbe con
//     nombre («no tarjetas por cada dato»).
// 2 · EL CONTENIDO SE AGRUPA POR TRABAJO, porque es la unidad con la que el dueño habla con el
//     cliente: cada grupo dice de qué obra es, con qué OC se encargó —número, fecha, importe y su
//     PDF— y cuánto lleva facturado, cobrado y pendiente.
// 3 · LAS FILAS QUE NINGÚN PAPEL ATÓ A UNA OBRA VAN AL FINAL, en su propio grupo y nunca
//     escondidas: son los saldos que Cobranzas anota contra el cliente —$47,6 M en San Francisco—
//     y sacarlas de la vista rompería la cuenta contra el Sheet.
// 4 · LOS RECORTES son los mismos chips del resto del módulo, con su conteo: Todo · Pendiente ·
//     Cobrado · B · N.
// 5 · NINGÚN PÁRRAFO EXPLICATIVO. Lo que hay que explicar de un número vive en el `title` de su
//     columna o de su fila, que es donde el OS pone la trazabilidad.
//
// LO QUE NO ESTÁ, A PROPÓSITO: costo, avance, HH, materiales. Esta es la cara COMERCIAL de la
// relación; el ERP vive en el módulo Obras.

import Link from 'next/link'
import { pesos } from '@/shared/components/canon/formato'
import { ENCABEZADO, RotuloCol, V } from '@/shared/components/v2/patron'
import { CifrasDeFicha, type CifraDeFicha } from '@/shared/components/v2/segundoNivel'
import { FiltrosSuaves } from '@/shared/components/v2/FiltrosSuaves'
import {
  agruparCobranzas, proximoCobro, recortar, totalesDeCobranzas,
  type FilaCobranza, type RecorteCobranza, type TotalesCobranza,
} from '../../services/cobranzasCliente'
import type { Orden } from '../../services/papelesCliente'
import { OrdenesDeLaObra } from '../OrdenesDeLaObra'
import { COLS_COBRANZA, dia, FilaDeCobranza, SOLO_ANCHO_COB, SOLO_MEDIO } from './FilaDeCobranza'

const AYUDA_FACTURADO = 'Lo FACTURADO: las filas «B» de la pestaña, que son las que tienen '
  + 'comprobante. Criterio DEVENGADO — se factura, todavía no entró. Las filas «N» no llevan '
  + 'comprobante y por eso no suman acá.'
const AYUDA_COBRADO = 'Lo COBRADO, total con IVA. Criterio PERCIBIDO: sólo lo que ya entró, con el '
  + 'mismo predicado que la pestaña OBRAS y que la cuenta del cliente.'
const AYUDA_PENDIENTE = 'Lo que falta cobrar, con IVA: las filas que no están cobradas ni anuladas.'
const AYUDA_VENCIDO = 'De lo pendiente, lo que ya pasó su plazo: EMISIÓN + 30 días, el reloj de la '
  + 'pestaña OBRAS. No es «pasó la fecha de cobro», que se re-tipea cada vez que un cobro se '
  + 'posterga y está condenado a cero por construcción.'
const AYUDA_PROXIMO = 'La próxima fecha de cobro pendiente, con su medio y la suma de TODO lo que '
  + 'cae ese día. Es una PREVISIÓN: la prueba de que entró es el extracto del banco.'

/** Una cifra de plata, o el motivo por el que no hay ninguna. Nunca un cero por una ausencia. */
function cifra(rotulo: string, valor: number | null, falta: string, tono?: 'warn'): CifraDeFicha {
  return { rotulo, valor: valor == null ? null : pesos(valor), falta, tono: valor ? tono : undefined }
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

  const total = totalesDeCobranzas(filas)
  const proximo = proximoCobro(filas)
  const visibles = recortar(filas, recorte)
  const grupos = agruparCobranzas(visibles, obras)

  const cifras: CifraDeFicha[] = [
    {
      rotulo: 'Contratado',
      valor: contratadoUsd != null
        ? `U$S ${Math.round(contratadoUsd).toLocaleString('es-AR')}`
        : contratado != null ? pesos(contratado) : null,
      falta: 'sin precio en OBRAS',
    },
    cifra('Facturado', total.facturado, 'ninguna fila B'),
    cifra('Cobrado c/IVA', total.cobrado, 'nada cobrado todavía'),
    cifra('Pendiente', total.pendiente, 'nada pendiente'),
    cifra('▲ Vencido', total.vencido, 'nada vencido', 'warn'),
    {
      rotulo: 'Próximo cobro',
      // LA FECHA Y EL MEDIO EN LA MISMA CIFRA: es UNA respuesta —«el 22/09 entran $19,6 M por
      // transferencia»— y partirla en tres rótulos obligaría a leer tres celdas para armarla.
      valor: proximo ? `${dia(proximo.fecha)}${proximo.importe != null ? ` · ${pesos(proximo.importe)}` : ''}` : null,
      falta: 'sin cobros previstos',
    },
  ]

  return (
    <div data-testid="solapa-cobranzas">
      <CifrasDeFicha cifras={cifras} testid="cifras-cobranzas" />
      {/* LOS `title` DE LAS CIFRAS NO EXISTEN EN `CifrasDeFicha`, así que la trazabilidad de las
          cinco columnas de esta pestaña vive en los rótulos de la tabla de abajo, que sí los llevan
          — y en el `title` de cada fila, que dice su renglón exacto del Sheet. */}
      <div style={{ padding: '14px 20px 0' }}>
        <FiltrosSuaves
          testid="filtro-cobranzas"
          conteo={{ n: visibles.length, total: filas.length, sustantivo: 'filas' }}
          opciones={[
            { clave: 'todo', etiqueta: 'Todo', href: hrefRecorte('todo'), activo: recorte === 'todo' },
            { clave: 'pendiente', etiqueta: 'Pendiente', href: hrefRecorte('pendiente'), activo: recorte === 'pendiente', cuenta: recortar(filas, 'pendiente').length },
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

        {grupos.map((g) => (
          <div key={g.obra_id ?? 'sin-obra'} data-testid="grupo-cobranzas" style={{ marginBottom: 26 }}>
            <EncabezadoDeGrupo
              titulo={g.titulo}
              sinObra={g.obra_id === null}
              totales={g.totales}
              ordenes={g.obra_id ? obrasConOC.get(g.obra_id) ?? [] : []}
              href={g.obra_id ? `/obras/${g.obra_id}` : null}
            />
            <div className={`grid gap-[12px] ${COLS_COBRANZA}`} style={ENCABEZADO}>
              <span className={`grid ${SOLO_ANCHO_COB}`}><RotuloCol>Emisión</RotuloCol></span>
              <span className={`grid ${SOLO_ANCHO_COB}`}><RotuloCol>Comprobante</RotuloCol></span>
              <RotuloCol>Concepto</RotuloCol>
              <span className={`grid ${SOLO_MEDIO}`}><RotuloCol derecha>Neto</RotuloCol></span>
              <span className={`grid ${SOLO_MEDIO}`}><RotuloCol derecha>IVA</RotuloCol></span>
              <RotuloCol derecha titulo={AYUDA_COBRADO}>Total</RotuloCol>
              <span className={`grid ${SOLO_ANCHO_COB}`}><RotuloCol titulo={AYUDA_VENCIDO}>Estado</RotuloCol></span>
              <span className={`grid ${SOLO_MEDIO}`}><RotuloCol derecha>Cobro</RotuloCol></span>
              <span className={`grid ${SOLO_MEDIO}`}><RotuloCol>Medio</RotuloCol></span>
            </div>
            {g.filas.map((f) => <FilaDeCobranza key={f.cobranza_id} f={f} />)}
            <PieDeGrupo totales={g.totales} />
          </div>
        ))}
      </div>
    </div>
  )
}

/** EL RÓTULO DEL GRUPO: de qué trabajo es, con qué OC se encargó y cuánto lleva. */
function EncabezadoDeGrupo({ titulo, totales, ordenes, href, sinObra }: {
  titulo: string
  totales: TotalesCobranza
  ordenes: Orden[]
  href: string | null
  sinObra: boolean
}) {
  return (
    <div style={{ padding: '16px 0 2px' }} data-testid="encabezado-grupo-cobranzas">
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
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
      </div>
      {/* LAS OC DEL TRABAJO, con su número, su día, su importe y su PDF. Mismo componente que la
          lista de `/clientes`: dos formatos del mismo papel se separan en cuanto uno aprende algo. */}
      {ordenes.length > 0 && (
        <div style={{ paddingTop: 4 }}>
          <OrdenesDeLaObra ordenes={ordenes} veEconomia sangria={0} />
        </div>
      )}
      <div className="font-mono tabular-nums" style={{ display: 'flex', gap: 16, paddingTop: 6, fontSize: '11px', color: V.tenue, flexWrap: 'wrap' }}>
        <span title={AYUDA_FACTURADO}>facturado {totales.facturado == null ? '—' : pesos(totales.facturado)}</span>
        <span title={AYUDA_COBRADO}>cobrado {totales.cobrado == null ? '—' : pesos(totales.cobrado)}</span>
        <span title={AYUDA_PENDIENTE}>pendiente {totales.pendiente == null ? '—' : pesos(totales.pendiente)}</span>
        {totales.vencido != null && (
          <span title={AYUDA_VENCIDO} style={{ color: V.warn }}>▲ vencido {pesos(totales.vencido)}</span>
        )}
      </div>
    </div>
  )
}

/** EL PIE DEL GRUPO: el total de lo que se está viendo, que tiene que cerrar con las filas de
 *  arriba. Es la mitad de lo que hace auditable la pantalla — la otra mitad es la cabecera. */
function PieDeGrupo({ totales }: { totales: TotalesCobranza }) {
  return (
    <div
      data-testid="pie-grupo-cobranzas"
      className="font-mono tabular-nums"
      style={{ display: 'flex', justifyContent: 'flex-end', gap: 16, padding: '6px 0', fontSize: '11px', color: V.apagado }}
      title={AYUDA_PROXIMO}
    >
      <span>{totales.filas} {totales.filas === 1 ? 'fila' : 'filas'}</span>
      {/* UNA ANULADA QUE NO SE CUENTA TIENE QUE DECIRSE: si no, el pie y el Sheet dejan de cuadrar
          y nadie sabe por qué. */}
      {totales.anuladas > 0 && <span style={{ color: V.tenue }}>+{totales.anuladas} anulada{totales.anuladas === 1 ? '' : 's'} sin sumar</span>}
    </div>
  )
}
