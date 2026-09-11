// 25 · CLIENTES — la cartera del CRM: el cliente, y las obras que le estamos ejecutando.
//
// ═══ LAS SEIS COLUMNAS, Y NI UNA MÁS (dueño, 10/09/2026 18:12) ═══
//
// «Sección cliente todo mal, inentendible, con columnas que no solicité, información mal reflejada
// y confusa; la cambiaste por completo, te había pedido columnas determinadas.»
//
//   CLIENTE       el nombre. Debajo cuelga cada obra en curso, con SUS órdenes de compra listadas
//                 —«OC 2256 · 02/09 · $ 12.100.000»— y cada una abre su PDF.
//   OBRAS         «5 en curso · 6 cerradas» (`cliente_economia`). Una línea, una escala.
//   OC c/IVA      lo que el cliente encargó. En la obra, el total de la VENTANA que acota lo
//                 contratado; lo de una obra fusionada de otro año se dice en el `title` y NO se
//                 suma —BSA publicaba $ 49.886.583 al lado de un contratado de $ 17,7 M—.
//   OP c/IVA      lo que ordenó pagar. Una OP no prueba el cobro: eso lo prueba el banco.
//   CONTRATADO    neto, de `obra_economia_cartera`. Cuando el contrato es en dólares se dicen los
//                 dos —«U$S 63.000» y «≈ $ 95,3 M»—: el número en pesos es una valuación al TC de
//                 hoy y cambia solo. De dónde salió cuando no es un precio de OBRAS, en el `title`.
//   COBRADO c/IVA `obra_cuenta.cobrado_total`, el MISMO número que la columna E de la pestaña
//                 OBRAS, con su barra sobre lo contratado × 1,21. Sólo para quien ve economía.
//
// LO QUE SE FUE, Y POR QUÉ: las dos columnas de presupuesto de costo —el costo es del ERP, y con
// ellas se fue la lectura—; el margen; «Por cobrar», «▲ Vencido» y «Próx. cobro» —eran la pestaña
// OBRAS
// entera traducida a la pantalla—; el avance físico; y el renglón «s/obra», que ahora vive en el
// `title` del cobro del cliente. Ninguna aclaración dibujada al lado de una cifra: lo que hay que
// explicar de un número va en el `title` de su columna.
//
// ═══ LA OBRA SE ABRE DENTRO DEL CRM ═══
//
// La fila de la obra abría `/obras/<id>` y sacaba al dueño del CRM de un clic. Ahora abre el panel
// lateral de este mismo módulo —sus OC, sus OP, con su PDF— y el ERP queda a un enlace SECUNDARIO
// y nombrado, «Ver en Obras».
//
// LA COLUMNA «OBRAS» MIDE 150px Y NO 116: «5 en curso · 6 cerradas» a 12px necesita 129, y con 116
// se publicaba «5 en curso · 6 ce…» —una frase cortada a mitad de palabra, que es peor que no
// escribirla—. Medido sobre la captura de producción del 10/09/2026 18:10.
//
// ═══ EL NOMBRE NUNCA SE ESTRANGULA ═══
//
// Por debajo de 1250px se suelta el detalle económico —OC, OP y lo cobrado— y por debajo de 768px
// queda quién es y por cuánto (`25v2:154`). Lo decide una media query y no `window.innerWidth`:
// esta tabla se dibuja en el servidor.

import Link from 'next/link'
import { pesos } from '@/shared/components/canon/formato'
import { IconoCliente, IconoObra } from '@/shared/components/iconos'
import { ALTO_V2, CAJA_CONTENIDO, ENCABEZADO, RotuloCol, V } from '@/shared/components/v2/patron'
import type { ClienteEnCartera } from '@/features/administracion/services/homeCartera'
import { frasesDeObras } from '@/features/clientes/services/cartera'
import { SIN_PRECIO_EN_OBRAS } from '@/features/clientes/services/economiaObras'
import type { PapelesDelCliente } from '@/features/clientes/services/papelesCliente'
import {
  Cobrado, ContratadoDeObra, OrdenesDelTrabajo, SOLO_ANCHO, SOLO_TABLET, TONO,
} from './CeldasDeCartera'
import { OrdenesDeLaObra } from './OrdenesDeLaObra'
import { SIN_PAPELES, TotalDePapeles } from './TotalDePapeles'

/**
 * LAS SEIS COLUMNAS QUE EL DUEÑO PIDIÓ, Y NI UNA MÁS (10/09/2026 18:12).
 *
 * CLIENTE · OBRAS · OC · OP · CONTRATADO · COBRADO. `25v2:154` para los cortes: por debajo de
 * 1250px se suelta el detalle económico —OC, OP y lo cobrado— y por debajo de 768px queda quién es
 * y por cuánto. Literales porque Tailwind no compila una clase armada en runtime, y en px porque
 * una variante con otra unidad apaga TODOS los cortes del repositorio.
 */
const COLS
  = 'grid-cols-[minmax(0,1.7fr)_150px_140px_120px_150px_150px]'
  + ' max-[1249px]:grid-cols-[minmax(200px,1.7fr)_150px_150px]'
  + ' max-[767px]:grid-cols-[minmax(0,1.9fr)_150px]'

// ── LOS TEXTOS DE AYUDA, DECLARADOS UNA VEZ ─────────────────────────────────────────────────────
//
// Van en el `title` y no debajo del número: un número no lleva un párrafo permanente pegado, pero
// tampoco puede quedarse sin decir de dónde sale.

const AYUDA_OC = 'Órdenes de compra que el cliente mandó por este trabajo. EL IMPORTE ES EL TOTAL '
  + 'DEL PDF, CON IVA — lo contratado es neto, así que los dos números no se restan ni se comparan '
  + 'directo. En la fila del trabajo es el total de la VENTANA que acota lo contratado; el de una '
  + 'obra fusionada de otro año se dice en el `title` de la celda y no se suma.'

const AYUDA_OP = 'Órdenes de pago que el cliente emitió (cliente_orden), con IVA. Una OP no prueba '
  + 'el cobro: eso lo prueba el extracto del banco.'

const AYUDA_CONTRATADO = 'Lo que la pestaña OBRAS del Flujo de Caja publica por obra, SIN IVA. '
  + 'Es precio contratado, no facturado.'

const AYUDA_COBRO = 'Lo cobrado con IVA, criterio PERCIBIDO — la misma columna «Cobrado» de la '
  + 'pestaña OBRAS del Flujo de Caja (obra_cobranza.cobrado). Nunca mezcla con lo facturado, que es '
  + 'devengado. La barra compara contra lo contratado × 1,21, porque el contrato es neto y esto no: '
  + 'sin ese ajuste el porcentaje mide dos magnitudes distintas.'

const AYUDA_OBRAS = 'Cuántas obras tiene, separadas en las que están en ejecución y las cerradas '
  + '(cliente_economia). Debajo del cliente cuelgan sólo las que están EN CURSO.'

/** Un cliente del que no llegó ningún papel. Constante y no un objeto nuevo por fila. */
const VACIO: PapelesDelCliente = {
  oc: [], op: [], facturas: [], retenciones: [], otros: [],
  porObra: new Map(), sinObra: { oc: [], op: [] }, totalOC: SIN_PAPELES, totalOP: SIN_PAPELES,
}

// ─────────────────────────────────────────────────────────────────────────────────────────────

export function TablaClientes({
  clientes, seleccionado, hrefDe, veEconomia, obrasNoLeidas, papeles, hrefOrdenes, limpiarHref, vacio,
}: {
  clientes: ClienteEnCartera[]
  seleccionado?: string
  /** Abre la ficha del cliente (o el panel, si no tiene slug). */
  hrefDe: (clienteId: string) => string
  /** El jefe de obra no ve lo contratado. La cerradura es la RLS; acá se deja de ofrecer. */
  veEconomia: boolean
  /** `true` = la lectura de obras falló. Ninguna fila puede decir «ninguno en ejecución». */
  obrasNoLeidas: boolean
  /** Los papeles de la cartera, ya agrupados, por cliente. Vacío = ninguno, o la lectura falló. */
  papeles: Map<string, PapelesDelCliente>
  /** El detalle del trabajo DENTRO del CRM: la clave es el `obra_id`. */
  hrefOrdenes: (clave: string) => string
  limpiarHref: string
  /** Qué se escribe cuando el recorte no deja a nadie. */
  vacio: string
}) {
  const papelesDe = (clienteId: string): PapelesDelCliente =>
    papeles.get(clienteId) ?? VACIO

  return (
    <div data-testid="clientes-tabla">
      <div className={`grid gap-[14px] ${COLS}`} style={ENCABEZADO}>
        <RotuloCol>Cliente</RotuloCol>
        <span className={`grid ${SOLO_TABLET}`}>
          <RotuloCol derecha titulo={AYUDA_OBRAS}>Obras</RotuloCol>
        </span>
        {/* EL «c/IVA» VA EN EL RÓTULO Y NO EN EL `title`: un rótulo que calla la unidad obliga a
            pasar el mouse para saber si dos columnas vecinas se pueden restar. */}
        <span className={`grid ${SOLO_ANCHO}`}>
          <RotuloCol derecha titulo={AYUDA_OC}>OC c/IVA</RotuloCol>
        </span>
        <span className={`grid ${SOLO_ANCHO}`}>
          <RotuloCol derecha titulo={AYUDA_OP}>OP c/IVA</RotuloCol>
        </span>
        <RotuloCol derecha titulo={AYUDA_CONTRATADO}>{veEconomia ? 'Contratado' : ''}</RotuloCol>
        <span className={`grid ${SOLO_ANCHO}`}>
          {/* SIN PERMISO ECONÓMICO, EL RÓTULO TAMPOCO: una columna «COBRADO» con la celda vacía en
              todas las filas se lee como un dato que se rompió, no como uno que no corresponde. */}
          <RotuloCol derecha titulo={AYUDA_COBRO}>{veEconomia ? 'Cobrado c/IVA' : ''}</RotuloCol>
        </span>
      </div>

      {clientes.map((c) => {
        const elegido = c.cliente_id === seleccionado
        const suyos = papelesDe(c.cliente_id)
        return (
          <div key={c.cliente_id}>
            <Link
              href={hrefDe(c.cliente_id)}
              prefetch={false}
              role="row"
              data-testid="fila-cliente"
              data-seleccionada={elegido ? '' : undefined}
              className={`grid items-center gap-[14px] ${CAJA_CONTENIDO} ${COLS} ${elegido ? '' : 'hover:bg-[#F2F1ED]'}`}
              style={{
                // 48 y no el alto de una lista común: esta fila es MAESTRA — debajo le cuelgan sus
                // trabajos, y se lee como la madre del bloque y no como un renglón más (`v4B:92`).
                minHeight: ALTO_V2.cliente,
                // El divisor se afloja cuando abajo cuelgan trabajos: son el mismo bloque.
                borderBottom: `1px solid ${c.enCurso.length ? TONO.divisorObra : V.lineaFila}`,
                background: elegido ? V.seleccion : undefined,
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                <span style={{ display: 'flex', color: V.inerte, flexShrink: 0 }}>
                  <IconoCliente className="h-[15px] w-[15px]" />
                </span>
                <span className="truncate" style={{ fontSize: '12.5px', fontWeight: 600, color: V.tinta, minWidth: 96 }}>
                  {c.nombre}
                </span>
              </span>

              {/* CUÁNTOS TRABAJOS TIENE, EN UNA LÍNEA Y EN UNA ESCALA. Es una FRASE, no una cifra
                  alineada: el mono se reserva para lo que se compara de arriba abajo, que en esta
                  tabla es plata. */}
              <span
                className={`truncate ${SOLO_TABLET}`}
                data-testid="obras-cliente"
                style={{ fontSize: '12px', color: V.apagado, textAlign: 'right' }}
              >
                {frasesDeObras(c)}
              </span>

              {/* LO QUE ENCARGÓ (OC) Y LO QUE ORDENÓ PAGAR (OP), CADA UNO EN SU COLUMNA. Estaban
                  apilados en una sola celda —dos escalas en un renglón— y el dueño lo marcó. Suman
                  también las órdenes de sus trabajos TERMINADOS: si contaran sólo los visibles,
                  cerrar un trabajo haría desaparecer papeles que existen. */}
              <span className={`flex items-center justify-end ${SOLO_ANCHO}`} data-testid="papeles-cliente">
                <TotalDePapeles total={suyos.totalOC} sigla="OC" tam="12px" testid="total-oc-cliente" veEconomia={veEconomia} />
              </span>
              <span className={`flex items-center justify-end ${SOLO_ANCHO}`} data-testid="papeles-op-cliente">
                <TotalDePapeles total={suyos.totalOP} sigla="OP" tam="12px" testid="total-op-cliente" veEconomia={veEconomia} />
              </span>

              {/* LA CELDA DE PLATA NO OPINA SOBRE LOS TRABAJOS: eso ya lo dice la columna de al
                  lado. Acá va la cifra —o nada— y el `title` distingue las dos ausencias. */}
              <span
                className={c.contratado === null ? '' : 'font-mono tabular-nums'}
                data-testid="contratado"
                title={c.contratado !== null
                  ? undefined
                  : c.enCurso.length
                    ? 'Ninguna de sus obras en curso tiene precio en la pestaña OBRAS'
                    : 'No tiene obras en curso: no hay contrato vigente que sumar'}
                style={{
                  fontSize: c.contratado === null ? '11.5px' : '12px', textAlign: 'right',
                  color: c.contratado !== null ? V.tinta : c.enCurso.length ? V.warn : V.tenue,
                }}
              >
                {veEconomia
                  ? (c.contratado === null
                      ? (c.enCurso.length ? SIN_PRECIO_EN_OBRAS : '')
                      : pesos(c.contratado))
                  : ''}
              </span>
              {/* EL DENOMINADOR DEL CLIENTE ES `contratadoTotal`, NO la columna de al lado: la
                  columna dice lo contratado EN CURSO y el cobro del cliente es acumulado. Y el
                  porcentaje sólo sale si NINGUNA de sus obras quedó sin precio. */}
              <Cobrado
                cobrado={c.cobradoTotal} contratado={c.contratadoTotal}
                medible={c.obrasSinPrecio === 0}
                obrasSinPrecio={c.obrasSinPrecio}
                sinObra={c.cobradoSinObra}
                veEconomia={veEconomia} testid="cobro-cliente" ambito="cliente" tam="12px"
              />
            </Link>

            {c.enCurso.map((o) => {
              const deLaObra = papelesDe(c.cliente_id).porObra.get(o.obra_id)
              const ocDeLaObra = deLaObra?.oc ?? []
              return (
                /* ═══ EL TRABAJO SE ABRE EN EL CRM, NO EN EL ERP (10/09/2026) ═══

                   Iba a `/obras/<id>`: un clic en la fila y el dueño estaba en el módulo Obras, que
                   es otro sistema y —dicho por él— está descuidado. El detalle del trabajo que el
                   CRM sí puede contestar —sus OC, sus OP, con su PDF— vive en el panel lateral de
                   esta misma pantalla. El ERP queda en un enlace nombrado. */
                <Link
                  key={o.obra_id}
                  href={hrefOrdenes(o.obra_id)}
                  prefetch={false}
                  role="row"
                  data-testid="fila-obra"
                  className={`grid items-center gap-[14px] ${CAJA_CONTENIDO} ${COLS} hover:bg-[#FAFAF8]`}
                  data-ordenes={ocDeLaObra.length ? '' : undefined}
                  // `minHeight` Y NO `height`: la celda lleva dos renglones y a 390px el nombre
                  // puede partir. Con `height` clavado el segundo renglón queda cortado.
                  style={{
                    minHeight: ocDeLaObra.length ? ALTO_V2.hijaConOrdenes : ALTO_V2.hija,
                    borderBottom: `1px solid ${TONO.divisorObra}`,
                  }}
                >
                  {/* DOS LÍNEAS: el nombre arriba, sus OC abajo. El `overflow: hidden` se queda —lo
                      que no entre se corta en el borde de SU celda y nunca invade la de al lado. */}
                  <span style={{
                    display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2,
                    minWidth: 0, overflow: 'hidden', paddingLeft: 14,
                  }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                      <span style={{ display: 'flex', color: V.inerte, flexShrink: 0 }}>
                        <IconoObra className="h-[13px] w-[13px]" />
                      </span>
                      <span className="truncate" style={{ fontSize: '12px', color: TONO.textoObra, minWidth: 96 }}>{o.nombre}</span>
                      {/* ═══ «VER EN OBRAS» SALIÓ DE LA LISTA (dueño, 10/09/2026 18:12) ═══

                          Colgaba de CADA obra y repetía en toda la pantalla un enlace al ERP, que
                          es de lo que el dueño mandó separar este módulo. El puente sigue
                          existiendo, UNA vez y adentro del detalle del trabajo: quien quiera ir a
                          la obra abre el panel y lo encuentra ahí. */}
                    </span>
                    {/* LA SEGUNDA LÍNEA: LAS OC DE ESTE TRABAJO, con su número, su día y su
                        importe, y cada una abriendo su PDF. NINGUNA ORDEN DE PAGO: la OP no se
                        imputa al trabajo. */}
                    <OrdenesDeLaObra ordenes={ocDeLaObra} veEconomia={veEconomia} />
                  </span>

                  {/* La celda vacía de «Obras»: existe para que la obra caiga en la MISMA columna
                      que su cliente, y desaparece con la columna. */}
                  <span className={SOLO_TABLET} />

                  {/* ═══ EL TOTAL DE OC SALE DE `obra_economia_cartera`, NO DE LOS PAPELES ═══

                      Los NÚMEROS de las OC —los que abren su PDF— siguen saliendo de
                      `cliente_orden`, debajo del nombre. El TOTAL, en cambio, es el de la vista:
                      trae partido lo del año que acota el contratado y lo histórico de una obra
                      fusionada, que sumados publicaban «$ 49.886.583 · 5 OC» en BSA contra un
                      contratado de $17,7 M. Y ya no es un botón: la fila entera abre el detalle. */}
                  <span className={`flex items-center justify-end ${SOLO_ANCHO}`} data-testid="papeles-obra">
                    <OrdenesDelTrabajo o={o} veEconomia={veEconomia} clase="" />
                  </span>
                  {/* LA OP DEL TRABAJO SALE DE LOS PAPELES DEL CLIENTE (`cliente_orden`): una orden
                      de pago no la publica OBRAS, y no prueba el cobro — eso lo prueba el banco. */}
                  <span className={`flex items-center justify-end ${SOLO_ANCHO}`} data-testid="op-obra">
                    <TotalDePapeles
                      total={deLaObra?.totalOP ?? SIN_PAPELES} sigla="OP" tam="11.5px"
                      testid="total-op-obra" veEconomia={veEconomia}
                      numero={deLaObra?.totalOP.n === 1 ? deLaObra.op[0]?.numeroCorto ?? null : null}
                    />
                  </span>

                  <ContratadoDeObra o={o} veEconomia={veEconomia} />
                  {/* EN EL TRABAJO LOS DOS NÚMEROS SON DEL MISMO TRABAJO: el porcentaje siempre se
                      puede calcular cuando hay contratado. */}
                  <Cobrado
                    cobrado={o.cobradoTotal} contratado={o.contratado} medible imputacion={o.imputacion}
                    disponible={o.cobroDisponible}
                    veEconomia={veEconomia} testid="cobro-obra" tam="11.5px"
                  />
                </Link>
              )
            })}

            {/* «NO PUDE LEERLAS» SÍ SE DIBUJA; «NO HAY» YA NO. Que el cliente no tenga obras en
                ejecución lo dice su columna «Obras». Un control que no pudo mirar, en cambio, tiene
                que gritarlo: nadie puede leer esa fila vacía como «no hay». */}
            {c.enCurso.length === 0 && obrasNoLeidas && (
              <div
                className={`grid items-center gap-[14px] ${CAJA_CONTENIDO} ${COLS}`}
                style={{ height: ALTO_V2.hija - 4, borderBottom: `1px solid ${TONO.divisorObra}` }}
                data-testid="obras-sin-leer"
              >
                <span style={{ fontSize: '11.5px', color: V.warn, paddingLeft: 36 }}>
                  no pude leer sus obras
                </span>
              </div>
            )}
          </div>
        )
      })}

      {clientes.length === 0 && (
        <div style={{ padding: '24px 2px', fontSize: '12.5px', color: V.apagado }} data-testid="sin-resultados">
          {vacio}{' '}
          <Link href={limpiarHref} data-testid="clientes-ver-todo" style={{ color: V.tinta, fontWeight: 500, textDecoration: 'underline' }}>
            Ver todos
          </Link>
        </div>
      )}
    </div>
  )
}
