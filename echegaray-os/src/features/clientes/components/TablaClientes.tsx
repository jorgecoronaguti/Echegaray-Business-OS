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
//   MATERIALES     lo que el contrato fija de materiales. «no incluye» cuando el papel dice que los
//                  provee el cliente; «—» cuando ningún papel separa.
//   MANO DE OBRA   ídem, mano de obra.
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
// Por debajo de 1250px se sueltan materiales y mano de obra; por debajo de 768px queda quién es y
// por cuánto. Lo decide una media query y no `window.innerWidth`: esta tabla se dibuja en el servidor.

import Link from 'next/link'
import { millones, pesos } from '@/shared/components/canon/formato'
import { IconoCliente, IconoObra } from '@/shared/components/iconos'
import { ALTO_V2, CAJA_CONTENIDO, ENCABEZADO, RotuloCol, V } from '@/shared/components/v2/patron'
import type { ClienteEnCartera } from '@/features/administracion/services/homeCartera'
import { frasesDeObras } from '@/features/clientes/services/cartera'
import type { PapelesDelCliente } from '@/features/clientes/services/papelesCliente'
import { SOLO_ANCHO, SOLO_TABLET, TONO } from './CeldasDeCartera'
import {
  AvanceDeCobro, ComponenteDelContrato, ContratadoDelTrabajo, baseDelContrato, sumaDeObras,
} from './CeldasDeContrato'
import { OrdenesDeLaObra } from './OrdenesDeLaObra'
import { MarcaAdicional } from './MarcaAdicional'
import { consolidar, jerarquiaDeObras } from '../services/obrasAdicionales'

/**
 * LAS CINCO COLUMNAS (11/09/2026). Literales porque Tailwind no compila una clase armada en
 * runtime, y en px porque una variante con otra unidad apaga TODOS los cortes del repositorio.
 */
const COLS
  = 'grid-cols-[minmax(0,2fr)_150px_130px_140px_210px]'
  + ' max-[1249px]:grid-cols-[minmax(200px,2fr)_150px_210px]'
  + ' max-[767px]:grid-cols-[minmax(0,2fr)_150px]'

const AYUDA_CONTRATADO = 'El total del contrato, NETO: mano de obra + materiales cuando el papel '
  + 'desglosa; si no, el precio que publica la pestaña OBRAS. Los dólares se valúan al tipo de '
  + 'cambio de hoy.'
const AYUDA_MATERIALES = 'Lo que el contrato fija de materiales. «no incluye» = el papel dice que los '
  + 'provee el cliente. «—» = ningún papel separa materiales de mano de obra.'
const AYUDA_MANO_OBRA = 'Lo que el contrato fija de mano de obra, neto, según el contrato, la OC o el '
  + 'presupuesto que lo respalda (en el título de cada celda).'
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
        <span className={`grid ${SOLO_ANCHO}`}>
          <RotuloCol derecha titulo={AYUDA_MATERIALES}>{veEconomia ? 'Materiales' : ''}</RotuloCol>
        </span>
        <span className={`grid ${SOLO_ANCHO}`}>
          <RotuloCol derecha titulo={AYUDA_MANO_OBRA}>{veEconomia ? 'Mano de obra' : ''}</RotuloCol>
        </span>
        <span className={`grid ${SOLO_TABLET}`}>
          <RotuloCol derecha titulo={AYUDA_AVANCE}>{veEconomia ? 'Avance de cobro' : ''}</RotuloCol>
        </span>
      </div>
      {clientes.map((c) => {
        const elegido = c.cliente_id === seleccionado
        const contratado = sumaDeObras(c.enCurso, baseDelContrato)
        const materiales = sumaDeObras(c.enCurso, (o) => o.materiales)
        const manoObra = sumaDeObras(c.enCurso, (o) => o.manoObra)
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
                  <CifraDeCliente valor={materiales.total} faltan={materiales.faltan} testid="materiales-cliente" clase={SOLO_ANCHO} queFalta="cuyo papel no separa materiales"
                    titulo={c.enCurso.length ? 'Materiales fijados en los contratos de sus trabajos en curso.' : 'No tiene trabajos en curso.'} />
                  <CifraDeCliente valor={manoObra.total} faltan={manoObra.faltan} testid="mano-obra-cliente" clase={SOLO_ANCHO} queFalta="cuyo papel no separa mano de obra"
                    titulo={c.enCurso.length ? 'Mano de obra fijada en los contratos de sus trabajos en curso.' : 'No tiene trabajos en curso.'} />
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
                <><span /><span className={SOLO_ANCHO} /><span className={SOLO_ANCHO} /><span className={SOLO_TABLET} /></>
              )}
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
                  <ComponenteDelContrato o={o} cual="materiales" veEconomia={veEconomia} />
                  <ComponenteDelContrato o={o} cual="manoObra" veEconomia={veEconomia} />
                  <AvanceDeCobro o={o} veEconomia={veEconomia} />
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
