// 25 · CLIENTES — la cartera del CRM: el cliente, y los trabajos que le estamos ejecutando.
//
// ═══ LAS CINCO COLUMNAS QUE EL DUEÑO PIDIÓ (11/09/2026) ═══
//
// «Mostrá OC como está ahora pero quitá esa columna; OP debe estar dentro de cada cliente como OC;
// te pedí monto contratado, materiales, mano de obra y avance de cobro con barra de progreso».
//
//   CLIENTE        el nombre. Debajo cuelga cada trabajo en curso, con SUS órdenes de compra
//                  listadas —«OC 2256 · 02/09 · $ 12.100.000»— y cada una abre su PDF.
//   CONTRATADO     el total del contrato, neto: mano de obra + materiales cuando el papel desglosa;
//                  si no, el precio que publica OBRAS. En dólares se dice la moneda del papel.
//   MATERIALES     lo GASTADO A LA FECHA, no lo presupuestado (dueño, 13/09/2026): las compras
//                  asignadas a cada trabajo; en el cliente, su suma más lo que no tiene obra.
//   SUBCONTRATOS   lo facturado por terceros (14/09/2026), aparte de Materiales.
//   OTROS          equipos, servicios de obra, combustible, fletes y honorarios (18/09/2026): hasta
//                  ese día iban dentro de Materiales. Lo sin obra no se abre por este rubro.
//   MANO DE OBRA   las horas propias valorizadas a la fecha, o «sin valorizar». Los cuatro salen de
//                  `costo_obra` y los decide `costosDeObra.ts`, el mismo que la ficha.
//   AVANCE DE COBRO  la barra: cobrado NETO sobre el contrato NETO, y debajo cuánto entró y cuánto
//                  falta. Es la única barra de la fila: la del cliente publicaba una segunda y el
//                  dueño la marcó.
//
// LO QUE SE FUE Y A DÓNDE: las columnas OC c/IVA y OP c/IVA. Sus totales y las órdenes de pago
// viven en la ficha del cliente, solapa «Órdenes», agrupadas por trabajo. La columna «Obras» se
// volvió una frase debajo del nombre.
//
// ═══ EL TRABAJO SE ABRE DENTRO DEL CRM ═══
//
// La fila de la obra abre el panel lateral de este mismo módulo —sus OC, sus OP, con su PDF— y el
// ERP queda a un enlace SECUNDARIO y nombrado, «Ver en Obras», adentro del panel.
//
// ═══ EL NOMBRE NUNCA SE ESTRANGULA ═══
//
// Por debajo de 1250px se sueltan las COLUMNAS de materiales y mano de obra, pero no el dato: pasa a
// una línea a lo ancho de la fila (`CostoDeLaObraAngosto` / `CostoDelClienteAngosto`), porque el
// dueño mira el costo a la fecha desde el celular. Por debajo de 768px se suelta el avance. Lo decide
// una media query y no `window.innerWidth`: esta tabla se dibuja en el servidor.

import Link from 'next/link'
import { millones, pesos } from '@/shared/components/canon/formato'
import { IconoCliente, IconoObra } from '@/shared/components/iconos'
import { ALTO_V2, CAJA_CONTENIDO, ENCABEZADO, RotuloCol, V } from '@/shared/components/v2/patron'
import type { ClienteEnCartera } from '@/features/administracion/services/homeCartera'
import { frasesDeObras } from '@/features/clientes/services/cartera'
import type { PapelesDelCliente } from '@/features/clientes/services/papelesCliente'
import { SOLO_ANCHO, SOLO_TABLET, TONO } from './CeldasDeCartera'
import { AvanceDeCobro, ContratadoDelTrabajo, baseDelContrato, sumaDeObras } from './CeldasDeContrato'
import { CostoDeLaObra, CostoDeLaObraAngosto, CostoDelCliente, CostoDelClienteAngosto } from './CeldasDeCosto'
import { RotuloACorte } from './CostoALaFecha'
import type { CostoDeObra, GastoSinObra } from '../services/costosDeObra'
import { OrdenesDeLaObra } from './OrdenesDeLaObra'
import { MarcaAdicional } from './MarcaAdicional'
import { consolidar, jerarquiaDeObras } from '../services/obrasAdicionales'

/**
 * LAS CINCO COLUMNAS (11/09/2026). Literales porque Tailwind no compila una clase armada en
 * runtime, y en px porque una variante con otra unidad apaga TODOS los cortes del repositorio.
 */
// LA CUARTA COLUMNA DE COSTO (Otros, 18/09/2026) suma 130px + 14 de gap: a 1250px, donde estas pistas
// sobreviven, el nombre se queda con 1250 − 20·2 − (150+130+130+130+140+210) − 6·14 ≈ 236px, que
// lee un cliente entero. Por debajo, las cuatro cifras van a la línea angosta.
const COLS
  = 'grid-cols-[minmax(0,2fr)_150px_130px_130px_130px_140px_210px]'
  + ' max-[1249px]:grid-cols-[minmax(200px,2fr)_150px_210px]'
  + ' max-[767px]:grid-cols-[minmax(0,2fr)_150px]'

const AYUDA_CONTRATADO = 'El total del contrato, NETO: mano de obra + materiales cuando el papel '
  + 'desglosa; si no, el precio que publica la pestaña OBRAS. Los dólares se valúan al tipo de '
  + 'cambio de hoy.'
const AYUDA_MATERIALES = 'Lo comprado a la fecha para cada trabajo (Compras, columna K); en el cliente, '
  + 'la suma más lo que no tiene obra asignada. No es lo presupuestado. Sin subcontratos ni equipos, servicios, '
  + 'combustible y fletes, que van en sus columnas. «—» = ninguna compra.'
const AYUDA_SUBCONTRATOS = 'Lo facturado por subcontratistas a la fecha (proveedores marcados «Subcontratista» '
  + 'o familia «Subcontratos y mano de obra»). No está en Materiales ni en Mano de obra. «—» = ninguno.'
const AYUDA_OTROS = 'Alquiler y traslado de equipos, servicios de obra (baño, contenedor, agua), combustible, fletes y '
  + 'honorarios imputados a cada trabajo, a la fecha. Hasta el 18/09/2026 iban dentro de Materiales. Lo sin obra '
  + 'asignada no se abre por este rubro. «—» = ninguno.'
const AYUDA_MANO_OBRA = 'La mano de obra propia a la fecha: costo total empleador del recibo + parte en negro, '
  + 'repartidos por horas («est.» = sin recibo todavía). No es lo presupuestado. «sin valorizar» = falta la tarifa de alguien.'
const AYUDA_AVANCE = 'Cobrado NETO (lo que entró, sin IVA, criterio percibido) sobre el contrato NETO. '
  + 'Debajo, cuánto entró y cuánto falta. Nunca mezcla con lo facturado.'

const VACIO: PapelesDelCliente = {
  oc: [], op: [], facturas: [], retenciones: [], otros: [],
  porObra: new Map(), sinObra: { oc: [], op: [] }, totalOC: { n: 0, importe: null, parcial: false },
  totalOP: { n: 0, importe: null, parcial: false },
}

/** Una cifra del cliente, alineada con las de sus trabajos. `null` → «—» con su motivo. */
/**
 * O SUMA COMPLETA, O «—» CON EL MOTIVO (auditor, 11/09/2026). Messina publicaba «$ 142.054.010 ·»
 * de mano de obra con BSA sin desglosar: una suma parcial con un punto de 4 px se lee como total.
 * «no incluye» sólo cuando TODOS sus trabajos lo dicen; un cliente no afirma lo que un papel de
 * cinco no dice.
 */
function CifraDeCliente({ valor, faltan, testid, clase = '', titulo, queFalta }: {
  valor: number | null
  faltan: number
  testid: string
  clase?: string
  titulo: string
  queFalta: string
}) {
  const completa = faltan === 0 && valor !== null
  return (
    <span className={`flex items-center justify-end font-mono tabular-nums ${clase}`} data-testid={testid}
      data-estado={!completa ? 'incompleta' : valor === 0 ? 'no-incluye' : 'suma'}
      title={completa || !faltan ? titulo : `${titulo} No se publica la suma: ${faltan} trabajo(s) ${queFalta}.`}
      style={{ fontSize: '12px', color: completa ? V.tinta : V.lupa, textAlign: 'right' }}>
      {!completa ? '—' : valor === 0 ? <span style={{ color: V.apagado, fontFamily: 'inherit' }}>no incluye</span> : pesos(valor)}
    </span>
  )
}

/** Las obras cuyo costo suma el cliente: todas las que publica `obras_todas`; si esa lectura no trajo
 *  nada para el cliente, las que están en curso (nunca menos de lo que se dibuja debajo). */
function idsDeTodasSusObras(
  obrasPorCliente: ReadonlyMap<string, readonly { obra_id: string }[]>, c: ClienteEnCartera,
): string[] {
  const ids = new Set((obrasPorCliente.get(c.cliente_id) ?? []).map((o) => o.obra_id))
  for (const o of c.enCurso) ids.add(o.obra_id)
  return [...ids]
}

export function TablaClientes({
  clientes, seleccionado, hrefDe, veEconomia, obrasNoLeidas, papeles, hrefOrdenes, limpiarHref, vacio,
  costos, gastosSinObra, obrasPorCliente,
}: {
  clientes: ClienteEnCartera[]
  /** `costo_obra` por trabajo. `null` = no se pudo leer: las celdas callan, no dicen «—». */
  costos: ReadonlyMap<string, CostoDeObra> | null
  /** `costo_sin_obra` por cliente. Entra al total del cliente, nunca repartido entre sus obras. */
  gastosSinObra: ReadonlyMap<string, GastoSinObra> | null
  /** TODAS las obras de cada cliente, activas y cerradas (`obras_todas`): el costo a la fecha del
   *  cliente suma lo gastado en todas, no sólo en las que siguen en curso (QA 14/09/2026). */
  obrasPorCliente: ReadonlyMap<string, readonly { obra_id: string }[]>
  seleccionado?: string
  /** Abre la ficha del cliente (o el panel, si no tiene slug). */
  hrefDe: (clienteId: string) => string
  /** El jefe de obra no ve lo contratado. La cerradura es la RLS; acá se deja de ofrecer. */
  veEconomia: boolean
  /** `true` = la lectura de obras falló. Ninguna fila puede decir «ninguno en ejecución». */
  obrasNoLeidas: boolean
  /** Los papeles de la cartera, ya agrupados, por cliente: de acá salen las OC debajo de cada obra. */
  papeles: Map<string, PapelesDelCliente>
  /** El detalle del trabajo DENTRO del CRM: la clave es el `obra_id`. */
  hrefOrdenes: (clave: string) => string
  limpiarHref: string
  /** Qué se escribe cuando el recorte no deja a nadie. */
  vacio: string
}) {
  const papelesDe = (clienteId: string): PapelesDelCliente => papeles.get(clienteId) ?? VACIO
  return (
    <div data-testid="clientes-tabla">
      <div className={`grid gap-[14px] ${COLS}`} style={ENCABEZADO}>
        <RotuloCol>Cliente</RotuloCol>
        <RotuloCol derecha titulo={AYUDA_CONTRATADO}>{veEconomia ? 'Contratado' : ''}</RotuloCol>
        {/* «a la fecha» DEBAJO DEL NOMBRE, como en la ficha: el rótulo dice qué es el número. */}
        <span className={`grid ${SOLO_ANCHO}`}>
          {veEconomia ? <RotuloACorte texto="Materiales" titulo={AYUDA_MATERIALES} /> : null}
        </span>
        <span className={`grid ${SOLO_ANCHO}`}>
          {veEconomia ? <RotuloACorte texto="Subcontratos" titulo={AYUDA_SUBCONTRATOS} /> : null}
        </span>
        <span className={`grid ${SOLO_ANCHO}`}>
          {veEconomia ? <RotuloACorte texto="Otros" titulo={AYUDA_OTROS} /> : null}
        </span>
        <span className={`grid ${SOLO_ANCHO}`}>
          {veEconomia ? <RotuloACorte texto="Mano de obra" titulo={AYUDA_MANO_OBRA} /> : null}
        </span>
        <span className={`grid ${SOLO_TABLET}`}>
          <RotuloCol derecha titulo={AYUDA_AVANCE}>{veEconomia ? 'Avance de cobro' : ''}</RotuloCol>
        </span>
      </div>
      {clientes.map((c) => {
        const elegido = c.cliente_id === seleccionado
        const contratado = sumaDeObras(c.enCurso, baseDelContrato)
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
                minHeight: ALTO_V2.cliente,
                borderBottom: `1px solid ${c.enCurso.length ? TONO.divisorObra : V.lineaFila}`,
                background: elegido ? V.seleccion : undefined,
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                <span style={{ display: 'flex', color: V.inerte, flexShrink: 0 }}>
                  <IconoCliente className="h-[15px] w-[15px]" />
                </span>
                <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, gap: 1 }}>
                  <span className="truncate" style={{ fontSize: '12.5px', fontWeight: 600, color: V.tinta, minWidth: 96 }}>
                    {c.nombre}
                  </span>
                  {/* CUÁNTOS TRABAJOS TIENE, EN UNA FRASE debajo del nombre: dejó de ser columna. */}
                  <span className="truncate" data-testid="obras-cliente" style={{ fontSize: '11px', color: V.apagado }}>
                    {frasesDeObras(c)}
                  </span>
                </span>
              </span>
              {veEconomia ? (
                <>
                  <CifraDeCliente valor={contratado.total} faltan={contratado.faltan} testid="contratado" queFalta="sin precio en OBRAS ni en un papel"
                    titulo={c.enCurso.length ? 'Suma del contrato de sus trabajos en curso, neto.' : 'No tiene trabajos en curso: no hay contrato vigente que sumar.'} />
                  <CostoDelCliente costos={costos} sinObra={gastosSinObra} clienteId={c.cliente_id}
                    obraIds={idsDeTodasSusObras(obrasPorCliente, c)} veEconomia={veEconomia} />
                  {/* EL COBRO DEL CLIENTE ES UNA CIFRA, NO UNA BARRA: la barra mide un trabajo contra
                      su contrato; la bolsa del cliente junta cobros de trabajos cerrados y otros sin
                      repartir, y una segunda barra al lado de las de abajo es lo que el dueño marcó. */}
                  <span className={`flex items-center justify-end font-mono tabular-nums ${SOLO_TABLET}`} data-testid="cobro-cliente"
                    title="Todo lo cobrado al cliente, NETO, criterio percibido (cliente_economia). Incluye trabajos terminados y cobros que Cobranzas no repartió a un trabajo."
                    style={{ fontSize: '11.5px', color: V.apagado, textAlign: 'right' }}>
                    {c.cobradoNeto === null ? '—' : `cobrado ${millones(c.cobradoNeto)}`}
                  </span>
                </>
              ) : (
                // UNA PISTA VACÍA POR CADA COLUMNA QUE NO VE: contratado, las cuatro de costo y el avance.
                // Con menos celdas que pistas la fila no se rompe —quedan vacías al final—, pero la
                // grilla deja de ser literal y el próximo que cuente pistas se equivoca.
                <><span /><span className={SOLO_ANCHO} /><span className={SOLO_ANCHO} /><span className={SOLO_ANCHO} /><span className={SOLO_ANCHO} /><span className={SOLO_TABLET} /></>
              )}
              <CostoDelClienteAngosto costos={costos} sinObra={gastosSinObra} clienteId={c.cliente_id}
                obraIds={idsDeTodasSusObras(obrasPorCliente, c)} veEconomia={veEconomia} />
            </Link>
            {/* EL ADICIONAL VA DEBAJO DE SU OBRA MAYOR (dueño, 11/09/2026). La relación la decide
                `obra_canonica.obra_padre_id`; el orden y los dos niveles, `jerarquiaDeObras`, que es
                la MISMA función que usa la ficha del cliente. Mientras la migración 20260911T2000 no
                esté aplicada, ninguna obra trae padre y esto dibuja la lista de siempre. */}
            {jerarquiaDeObras(c.enCurso).map((fila) => {
              const o = fila.obra
              const ocDeLaObra = papelesDe(c.cliente_id).porObra.get(o.obra_id)?.oc ?? []
              // Lo suyo + sus adicionales. La celda dibuja SU número (la columna tiene que seguir
              // sumando el total del cliente) y declara el consolidado en la línea de abajo.
              const consolidado = consolidar(fila, baseDelContrato)
              return (
                <Link
                  key={o.obra_id}
                  href={hrefOrdenes(o.obra_id)}
                  prefetch={false}
                  role="row"
                  data-testid="fila-obra"
                  className={`grid items-center gap-[14px] ${CAJA_CONTENIDO} ${COLS} hover:bg-[#FAFAF8]`}
                  data-ordenes={ocDeLaObra.length ? '' : undefined}
                  style={{
                    minHeight: ocDeLaObra.length ? ALTO_V2.hijaConOrdenes : ALTO_V2.hija,
                    borderBottom: `1px solid ${TONO.divisorObra}`,
                  }}
                >
                  {/* DOS LÍNEAS: el nombre arriba, sus OC abajo, cada una abriendo su PDF. */}
                  <span style={{
                    display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2,
                    // UN PASO DE 24px (grid de 8) SOBRE LA SANGRÍA DE LA OBRA. Es el único recurso
                    // que dice «esto cuelga de lo de arriba» sin agregar un tercer nivel de
                    // navegación ni una tarjeta por dato.
                    minWidth: 0, overflow: 'hidden', paddingLeft: fila.nivel ? 38 : 14,
                  }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                      <span style={{ display: 'flex', color: V.inerte, flexShrink: 0 }}>
                        <IconoObra className="h-[13px] w-[13px]" />
                      </span>
                      <span className="truncate" style={{ fontSize: '12px', color: TONO.textoObra, minWidth: 96 }}>{o.nombre}</span>
                      {fila.esAdicional && <MarcaAdicional huerfano={fila.huerfano} />}
                    </span>
                    <OrdenesDeLaObra ordenes={ocDeLaObra} veEconomia={veEconomia} />
                  </span>
                  <ContratadoDelTrabajo o={o} veEconomia={veEconomia} consolidado={consolidado} />
                  <CostoDeLaObra costos={costos} obraId={o.obra_id} veEconomia={veEconomia} />
                  <AvanceDeCobro o={o} veEconomia={veEconomia} />
                  {/* La sangría alinea la línea con el NOMBRE de la obra: sangría + ícono + hueco. */}
                  <CostoDeLaObraAngosto costos={costos} obraId={o.obra_id} veEconomia={veEconomia}
                    sangria={(fila.nivel ? 38 : 14) + 22} />
                </Link>
              )
            })}
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
