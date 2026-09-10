// 25 · CLIENTES — la cartera del CRM: el cliente, y los TRABAJOS que le estamos haciendo.
//
// ═══ POR QUÉ ESTA TABLA CAMBIÓ ENTERA (dueño, 10/09/2026 17:15) ═══
//
// «Está pésimo lo que involucra a módulo Obra y módulo Administración. Administración es un CRM y
// Obra un ERP: todo lo pertinente a datos de clientes va en CRM, no mezcles cosas con obras.»
//
// Lo que se fue, y no por gusto:
//
//   · LAS DOS COLUMNAS DE PRESUPUESTO DE COSTO —mano de obra y materiales—. Son una pregunta del
//     ERP: se deciden contra lo gastado de verdad, el avance y la certificación, y ninguna de las
//     tres se mira desde la ficha de un cliente. Con las columnas se fue la LECTURA
//     (`economiaObras.ts` ya no pide esos campos) y `definiciones.json` lo prohíbe con un test:
//     mientras el dato siguiera servido, la columna volvía sola — pasó con Margen.
//   · LA BARRA DE AVANCE FÍSICO que colgaba del nombre de la obra. Mismo motivo: cuánto lleva
//     ejecutado es del ERP. Acá la única barra es la del COBRO, que es la relación con el cliente.
//
// ═══ LA FILA DEL TRABAJO REPRODUCE LA FILA DE LA PESTAÑA OBRAS ═══
//
// El dueño puso esta pantalla al lado de la pestaña OBRAS del Flujo de Caja y no coincidía NINGUNA
// de las nueve obras. La causa: la app dibujaba el cobrado NETO en una columna que en OBRAS es
// «Cobrado (total)», con IVA. Ahora la fila publica las mismas cinco columnas y con la misma
// definición —Contratado (neto) · Cobrado (total) · Por cobrar · ▲ Vencido · Próx. cobro—, y el
// fixture de esa pestaña vive en `carteraContraObras.test.ts`: si alguien vuelve a dibujar el neto,
// se pone rojo con el nombre de la obra.
//
// ═══ EL TRABAJO SE ABRE DENTRO DEL CRM ═══
//
// La fila del trabajo abría `/obras/<id>` y sacaba al dueño del CRM de un clic. Ahora abre el panel
// lateral de este mismo módulo —sus OC, sus OP, con su PDF— y el ERP queda a un enlace SECUNDARIO
// y nombrado, «Ver en Obras». Es el criterio de Figma que el OS ya usa: acciones cerca del objeto,
// sin abandonar el contexto.
//
// ═══ CADA COLUMNA, SU FUENTE (y no hay una segunda) ═══
//
//   Contratado                  `obra_economia_cartera.contratado` (obra) · `cliente_economia`
//                               (`contratado_en_curso`, el cliente). NETO.
//   Cobrado                     `obra_cobranza.cobrado` (obra) · `cliente_economia.cobrado_total`
//                               (cliente). TOTAL, con IVA, igual que OBRAS.
//   Por cobrar · ▲ Vencido ·    `obra_cobranza`. Van SÓLO en la fila del trabajo: ver `AYUDA_SALDO`.
//   Próx. cobro
//   Trabajos                    `cliente_economia.n_obras_en_curso` / `n_obras_cerradas`.
//   OC · OP                     `cliente_orden`, agrupado por `papelesCliente`. Es el total del PDF
//                               del cliente, CON IVA: no se resta contra lo contratado.
//
// ═══ EL NOMBRE NUNCA SE ESTRANGULA ═══
//
// Se sueltan primero los papeles y el próximo cobro (1400), después el saldo (1200) y por último
// todo menos el nombre y lo contratado (768). Lo decide una media query y no `window.innerWidth`:
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
  AYUDA_PROXIMO, CifraDeCobranza, Cobrado, ContratadoDeObra, ProximoCobro, SOLO_ANCHO, SOLO_TABLET,
  SOLO_XL, TONO,
} from './CeldasDeCartera'
import { AbrirOrdenes } from './AbrirOrdenes'
import { OrdenesDeLaObra } from './OrdenesDeLaObra'
import { SIN_PAPELES, TotalDePapeles } from './TotalDePapeles'

/** `25v2:154`, con las columnas de OBRAS. Literales porque Tailwind no compila una clase de runtime. */
const COLS
  = 'grid-cols-[minmax(0,1.6fr)_100px_140px_132px_152px_126px_122px_112px]'
  + ' max-[1399px]:grid-cols-[minmax(0,1.6fr)_100px_132px_152px_126px_122px]'
  + ' max-[1199px]:grid-cols-[minmax(0,1.7fr)_96px_132px_152px]'
  + ' max-[767px]:grid-cols-[minmax(0,1fr)_132px]'

// ── LOS TEXTOS DE AYUDA, DECLARADOS UNA VEZ ─────────────────────────────────────────────────────
//
// Van en el `title` y no debajo del número: un número no lleva un párrafo permanente pegado, pero
// tampoco puede quedarse sin decir de dónde sale.

const AYUDA_OC = 'Órdenes de compra y de pago que el cliente mandó por mail (cliente_orden). '
  + 'EL IMPORTE ES EL TOTAL DEL PDF, CON IVA — lo contratado de la columna de al lado es neto, '
  + 'así que los dos números no se restan ni se comparan directo.'

const AYUDA_CONTRATADO = 'Lo que la pestaña OBRAS del Flujo de Caja publica por obra, SIN IVA. '
  + 'Es precio contratado, no facturado.'

const AYUDA_COBRO = 'Lo cobrado con IVA, criterio PERCIBIDO — la misma columna «Cobrado» de la '
  + 'pestaña OBRAS del Flujo de Caja (obra_cobranza.cobrado). Nunca mezcla con lo facturado, que es '
  + 'devengado. La barra compara contra lo contratado × 1,21, porque el contrato es neto y esto no: '
  + 'sin ese ajuste el porcentaje mide dos magnitudes distintas.'

const AYUDA_SALDO = 'Lo pendiente de cobro y lo ya vencido de ESTE TRABAJO, de Cobranzas '
  + '(obra_cobranza), con el reloj de la pestaña OBRAS: vencido es emisión + 30 días, no «pasó la '
  + 'fecha de cobro» —que se re-tipea cada vez que el cobro se posterga—. La fila del CLIENTE las '
  + 'deja vacías a propósito: cliente_cuenta_corriente publica un vencido con el OTRO reloj, y dos '
  + 'relojes en la misma columna son dos definiciones.'

const AYUDA_TRABAJOS = 'Cuántos trabajos tiene, separados en los que están en ejecución y los '
  + 'terminados (cliente_economia). Debajo del cliente cuelgan sólo los que están EN CURSO. El '
  + 'estado sale del registro de obras: es el único dato del ERP que esta pantalla toma prestado.'

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
          <RotuloCol derecha titulo={AYUDA_TRABAJOS}>Trabajos</RotuloCol>
        </span>
        {/* EL «c/IVA» VA EN EL RÓTULO Y NO EN EL `title`: un rótulo que calla la unidad obliga a
            pasar el mouse para saber si dos columnas vecinas se pueden restar. */}
        <span className={`grid ${SOLO_XL}`}>
          <RotuloCol derecha titulo={AYUDA_OC}>OC · OP c/IVA</RotuloCol>
        </span>
        <RotuloCol derecha titulo={AYUDA_CONTRATADO}>{veEconomia ? 'Contratado' : ''}</RotuloCol>
        <span className={`grid ${SOLO_TABLET}`}>
          {/* SIN PERMISO ECONÓMICO, EL RÓTULO TAMPOCO: una columna «COBRADO» con la celda vacía en
              todas las filas se lee como un dato que se rompió, no como uno que no corresponde. */}
          <RotuloCol derecha titulo={AYUDA_COBRO}>{veEconomia ? 'Cobrado c/IVA' : ''}</RotuloCol>
        </span>
        <span className={`grid ${SOLO_ANCHO}`}>
          <RotuloCol derecha titulo={AYUDA_SALDO}>{veEconomia ? 'Por cobrar' : ''}</RotuloCol>
        </span>
        <span className={`grid ${SOLO_ANCHO}`}>
          {/* EL ▲ VA EN EL RÓTULO Y NO EN CADA CELDA — es la notación de la pestaña OBRAS: marca de
              una sola vez cuál es la columna de alarma. */}
          <RotuloCol derecha titulo={AYUDA_SALDO}>{veEconomia ? '▲ Vencido' : ''}</RotuloCol>
        </span>
        <span className={`grid ${SOLO_XL}`}>
          <RotuloCol derecha titulo={AYUDA_PROXIMO}>{veEconomia ? 'Próx. cobro' : ''}</RotuloCol>
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

              {/* LOS PAPELES DEL CLIENTE, EN DOS RENGLONES Y NUNCA EN EL MISMO RÓTULO: lo que
                  encargó (OC) y lo que ordenó pagar (OP). Incluye las órdenes de sus trabajos
                  TERMINADOS, que esta tabla no dibuja como fila: si contaran sólo los visibles,
                  cerrar un trabajo haría desaparecer papeles que existen. */}
              <span
                className={`flex flex-col items-end justify-center ${SOLO_XL}`}
                data-testid="papeles-cliente"
                style={{ gap: 2, textAlign: 'right' }}
              >
                <TotalDePapeles total={suyos.totalOC} sigla="OC" tam="12px" testid="total-oc-cliente" veEconomia={veEconomia} />
                <TotalDePapeles total={suyos.totalOP} sigla="OP" tam="11.5px" testid="total-op-cliente" veEconomia={veEconomia} />
              </span>

              {/* LA CELDA DE PLATA NO OPINA SOBRE LOS TRABAJOS: eso ya lo dice la columna de al
                  lado. Acá va la cifra —o nada— y el `title` distingue las dos ausencias. */}
              <span
                className={c.contratado === null ? '' : 'font-mono tabular-nums'}
                data-testid="contratado"
                title={c.contratado !== null
                  ? undefined
                  : c.enCurso.length
                    ? 'Ninguno de sus trabajos en curso tiene precio en la pestaña OBRAS'
                    : 'No tiene trabajos en curso: no hay contrato vigente que sumar'}
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
                  porcentaje sólo sale si NINGUNO de sus trabajos quedó sin precio. */}
              <Cobrado
                cobrado={c.cobradoTotal} contratado={c.contratadoTotal}
                medible={c.obrasSinPrecio === 0}
                obrasSinPrecio={c.obrasSinPrecio}
                sinObra={c.cobradoSinObra}
                veEconomia={veEconomia} testid="cobro-cliente" ambito="cliente" tam="12px"
              />
              {/* ═══ POR COBRAR Y VENCIDO NO SE SUMAN EN LA FILA DEL CLIENTE ═══

                  `cliente_cuenta_corriente` publica los dos, pero con OTRO reloj: cuenta vencido lo
                  que tiene `fecha_cobro < hoy`, y esa fecha se re-tipea cada vez que el cobro se
                  posterga —está condenada a cero por construcción, es el defecto que
                  `orquestador/lib/cobranzas-vencido.mjs` documenta—. La pestaña OBRAS usa emisión +
                  30 días. Dos relojes en la misma columna serían dos definiciones del mismo
                  concepto, que es lo que este módulo vino a cerrar. La fila del cliente calla y el
                  `title` de la columna dice por qué. */}
              <span className={SOLO_ANCHO} data-testid="por-cobrar-cliente" />
              <span className={SOLO_ANCHO} data-testid="vencido-cliente" />
              <span className={SOLO_XL} />
            </Link>

            {c.enCurso.map((o) => {
              const deLaObra = papelesDe(c.cliente_id).porObra.get(o.obra_id)
              const totalOC = deLaObra?.totalOC ?? SIN_PAPELES
              // EL NÚMERO DE LA OC ES DATO DE PRIMERA CLASE CUANDO HAY UNA SOLA. «OC 2173» dice
              // cuál papel encargó el trabajo; «1 OC» sólo dice que hay uno.
              const unicaOC = totalOC.n === 1 ? (deLaObra?.oc[0]?.numeroCorto ?? null) : null
              const ocDeLaObra = deLaObra?.oc ?? []
              return (
                <Link
                  // ═══ EL TRABAJO SE ABRE EN EL CRM, NO EN EL ERP (10/09/2026) ═══
                  //
                  // Iba a `/obras/<id>`: un clic en la fila y el dueño estaba en el módulo Obras,
                  // que es otro sistema y —dicho por él— está descuidado. El detalle del trabajo
                  // que el CRM sí puede contestar —sus OC, sus OP, con su PDF— vive en el panel
                  // lateral de esta misma pantalla. El ERP queda en un enlace nombrado.
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
                      {/* EL ÚNICO PUENTE AL ERP, Y ES EXPLÍCITO. Un `<a>` dentro de otro `<a>` es
                          HTML inválido: por eso reusa el botón que ya corta la propagación. */}
                      <AbrirOrdenes
                        href={`/obras/${o.obra_id}`}
                        titulo="Abre este trabajo en el módulo Obras (el ERP): avance, costos, plan."
                        etiqueta={`Ver ${o.nombre} en el módulo Obras`}
                        testid="ver-en-obras"
                        className={`shrink-0 ${SOLO_ANCHO}`}
                      >
                        <span style={{ fontSize: '10.5px', color: V.tenue }}>Ver en Obras →</span>
                      </AbrirOrdenes>
                    </span>
                    {/* LA SEGUNDA LÍNEA: LAS OC DE ESTE TRABAJO, con su número, su día y su
                        importe, y cada una abriendo su PDF. NINGUNA ORDEN DE PAGO: la OP no se
                        imputa al trabajo. */}
                    <OrdenesDeLaObra ordenes={ocDeLaObra} veEconomia={veEconomia} />
                  </span>

                  {/* La celda vacía de «Trabajos»: existe para que el trabajo caiga en la MISMA
                      columna que su cliente, y desaparece con la columna. */}
                  <span className={SOLO_TABLET} />

                  <span className={`flex items-center justify-end ${SOLO_XL}`} data-testid="papeles-obra">
                    {totalOC.n === 0
                      ? null
                      : (
                          <AbrirOrdenes
                            href={hrefOrdenes(o.obra_id)}
                            titulo={AYUDA_OC}
                            etiqueta={`Ver las ${totalOC.n} órdenes de compra de ${o.nombre}`}
                            testid="abrir-ordenes-obra"
                          >
                            <TotalDePapeles total={totalOC} sigla="OC" tam="11.5px" testid="total-oc-obra" veEconomia={veEconomia} numero={unicaOC} />
                          </AbrirOrdenes>
                        )}
                  </span>

                  <ContratadoDeObra o={o} veEconomia={veEconomia} />
                  {/* EN EL TRABAJO LOS DOS NÚMEROS SON DEL MISMO TRABAJO: el porcentaje siempre se
                      puede calcular cuando hay contratado. */}
                  <Cobrado
                    cobrado={o.cobradoTotal} contratado={o.contratado} medible imputacion={o.imputacion}
                    disponible={o.cobroDisponible}
                    veEconomia={veEconomia} testid="cobro-obra" tam="11.5px"
                  />
                  {veEconomia
                    ? (
                        <>
                          <CifraDeCobranza valor={o.porCobrar} tam="11.5px" testid="por-cobrar-obra" clase={SOLO_ANCHO} />
                          <CifraDeCobranza valor={o.vencido} tam="11.5px" alarma testid="vencido-obra" clase={SOLO_ANCHO} />
                          <ProximoCobro proximo={o.proximo} clase={SOLO_XL} />
                        </>
                      )
                    : (
                        <>
                          <span className={SOLO_ANCHO} /><span className={SOLO_ANCHO} /><span className={SOLO_XL} />
                        </>
                      )}
                </Link>
              )
            })}

            {/* «NO PUDE LEERLOS» SÍ SE DIBUJA; «NO HAY» YA NO. Que el cliente no tenga trabajos en
                ejecución lo dice su columna «Trabajos». Un control que no pudo mirar, en cambio,
                tiene que gritarlo: nadie puede leer esa fila vacía como «no hay». */}
            {c.enCurso.length === 0 && obrasNoLeidas && (
              <div
                className={`grid items-center gap-[14px] ${CAJA_CONTENIDO} ${COLS}`}
                style={{ height: ALTO_V2.hija - 4, borderBottom: `1px solid ${TONO.divisorObra}` }}
                data-testid="obras-sin-leer"
              >
                <span style={{ fontSize: '11.5px', color: V.warn, paddingLeft: 36 }}>
                  no pude leer sus trabajos
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
