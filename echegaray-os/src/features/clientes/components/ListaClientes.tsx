'use client'

// 25 · CLIENTES CARTERA — porte literal de `echegaray-design/25 · Clientes Cartera.dc.html`.
//
// ═══ CAMBIO DE REGLA DECLARADO (Design 23/08/2026) ═══
//
// El 19/08 el dueño pidió *"CLIENTE | OBRAS. Nada más para el MVP"* y se sacaron seis columnas. El
// canónico del 23/08 —cuatro días después, y es el contrato vigente— vuelve a dibujar la cartera con
// CLIENTE · EN EJECUCIÓN · OBRAS · CONTRATADO. **ESTO REVIERTE UNA DECISIÓN EXPLÍCITA Y TIENE QUE
// MIRARLO EL DUEÑO.** Se implementa el contrato más nuevo y se deja el rastro a la vista.
//
// ═══ LO QUE EL CANÓNICO DIBUJA Y ACÁ NO ESTÁ, POR FALTA DE FUENTE ═══
//
// - **PRESUPUESTOS (la barra de conversión).** `public.presupuestos` cuelga de la OBRA
//   (`obra_canonica_id`), no del cliente: no hay presupuesto perdido, ni enviado, ni rechazado que
//   contar por cliente. Una «tasa de conversión» calculada sobre eso sería un número inventado.
// - **ÚLT. MOV.** No existe ninguna fuente de «último movimiento del cliente». Lo más parecido es
//   `clientes.updated_at`, que es la última edición de la FICHA: ponerlo bajo ese rótulo diría
//   «hablamos hoy» cuando lo que pasó es que alguien corrigió un teléfono.
//
// Las cuatro columnas que quedan conservan SU ancho medido del canónico y el sobrante va al nombre.
//
// ═══ EL PUNTO DE «EN EJECUCIÓN» VUELVE A SER AZUL ═══
//
// La versión anterior lo dibujaba con el `Estado` del DS en tono `curso` y lo argumentaba así: «el
// canónico lo dibuja azul, pero en este sistema el grafito es en curso; gana el sistema». Ese
// criterio se dio vuelta el 24/08: gana el zip. Y el zip acá no dibuja una pastilla sino un PUNTO de
// 6px en #175CD3 con el nombre al lado en 12px — que además es lo correcto para esta celda, porque
// una pastilla alrededor de una lista de tres obras se estira hasta comerse la columna de al lado.
//
// ═══ EL BUSCADOR SIGUE FILTRANDO EN EL NAVEGADOR ═══
//
// Cinco clientes hoy, decenas en el peor caso de esta empresa. Un `?q=` por tecla convierte una
// búsqueda instantánea en cinco viajes de red. Los CHIPS de recorte sí van por la URL —son estado
// compartible y el canónico los pide así—, y el texto se filtra acá.

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { MenuContextual } from '@/shared/components/ds'
import {
  ALTO, C, CeldaTexto, EncabezadoCanon, FilaCanon, FranjaCartera, PAGINA, PieCanon, TarjetaTabla,
  VacioCanon, BuscadorCaja, IcoAlerta, IcoMasAcciones, entero, iniciales, millones,
} from '@/shared/components/canon'
import { contieneEnAlguno } from '@/shared/utils/busqueda'
import { avisoDeDatos, totalesCartera } from '../services/cartera'
import { PanelCliente } from './PanelCliente'
import type { ClientePanel, ObraDePanel } from '../types'

export interface ObraEnCurso { obra_id: string; nombre: string }

/** `25`, línea 121, sin PRESUPUESTOS ni ÚLT. MOV. */
const COLS_ECONOMIA = 'minmax(0,1.5fr) minmax(0,1.2fr) 60px 120px 26px'
const COLS_SIN_ECONOMIA = 'minmax(0,1.5fr) minmax(0,1.2fr) 60px 26px'

export function ListaClientes({
  clientes,
  enEjecucion,
  obrasPorCliente,
  veEconomia,
  accion,
  filtros,
}: {
  clientes: ClientePanel[]
  /** Las obras `activa` de cada cliente, por `cliente_id`. Vacío = ninguna, y eso se escribe. */
  enEjecucion: Record<string, ObraEnCurso[]>
  /** TODAS las obras de cada cliente, para el panel. Ausente = el panel dice «sin obras cargadas». */
  obrasPorCliente?: Record<string, ObraDePanel[]>
  /** El jefe de obra NO ve el contratado. La restricción es de la RLS; acá sólo se deja de ofrecer
   *  una columna que la base le devolvería igual pero que él no tiene por qué mirar. */
  veEconomia: boolean
  /** La primaria «Nuevo cliente», que sólo el servidor sabe si corresponde dibujar. */
  accion?: React.ReactNode
  /** Los chips de recorte, que viven en la URL y por eso los arma el servidor. */
  filtros?: React.ReactNode
}) {
  const [busqueda, setBusqueda] = useState('')
  // LA SELECCIÓN VIVE ACÁ, NO EN LA URL: el panel no lee nada nuevo del servidor (ver `PanelCliente`).
  const [sel, setSel] = useState<string | null>(null)
  // SE BUSCA POR LOS DOS NOMBRES. Buscar sólo por el comercial dejaría a «Alimentos del Sur SAS» sin
  // resultado aunque esté cargado — el que busca por la razón social la tiene delante, en una
  // factura o en un contrato. La lista muestra el comercial igual: el hallazgo no cambia el rótulo.
  const visibles = useMemo(
    () => clientes.filter((c) => contieneEnAlguno([c.nombre_comercial, c.razon_social], busqueda)),
    [clientes, busqueda],
  )
  // EL PIE CUENTA LO QUE SE VE. Un total calculado sobre la cartera entera mientras la tabla muestra
  // tres filas filtradas es un número que no cuadra con nada de lo que hay en pantalla.
  const total = useMemo(() => totalesCartera(visibles), [visibles])
  // EL PANEL SIGUE A LO QUE SE VE. Si el filtro sacó de la lista al cliente seleccionado, el panel se
  // cierra solo: un detalle abierto de una fila que ya no está es un dato huérfano en pantalla.
  const seleccionado = useMemo(() => visibles.find((c) => c.cliente_id === sel) ?? null, [visibles, sel])
  const cols = veEconomia ? COLS_ECONOMIA : COLS_SIN_ECONOMIA

  return (
    <>
      <FranjaCartera titulo="Clientes" accion={accion} testid="franja-clientes">
        {/* 230px — `25`, línea 56. */}
        <div style={{ marginLeft: 8 }}>
          <BuscadorCaja
            value={busqueda}
            onChange={setBusqueda}
            placeholder="Buscar cliente"
            ancho={230}
            testid="buscar-cliente"
          />
        </div>
        {filtros}
      </FranjaCartera>

      <div style={PAGINA.cuerpo}>
        <TarjetaTabla testid="clientes-tabla" cols={cols}>
          <EncabezadoCanon
            cols={cols}
            columnas={[
              { rotulo: 'CLIENTE' },
              { rotulo: 'EN EJECUCIÓN' },
              { rotulo: 'OBRAS', alineacion: 'derecha' },
              ...(veEconomia ? [{ rotulo: 'CONTRATADO', alineacion: 'derecha' as const }] : []),
              { rotulo: '', vacia: true },
            ]}
          />

          {visibles.map((c) => (
            <Fila
              key={c.cliente_id}
              c={c}
              cols={cols}
              obras={enEjecucion[c.cliente_id] ?? []}
              veEconomia={veEconomia}
              elegido={c.cliente_id === sel}
              onElegir={() => setSel((a) => (a === c.cliente_id ? null : c.cliente_id))}
            />
          ))}

          {visibles.length === 0 && (
            <VacioCanon testid="sin-resultados">Ningún cliente se llama así.</VacioCanon>
          )}

          {visibles.length > 0 && (
            <div data-testid="pie-cartera">
              <PieCanon
                totales={[
                  { rotulo: 'CLIENTES', valor: entero(total.clientes) ?? '0' },
                  { rotulo: 'CON OBRA ACTIVA', valor: entero(total.conObraActiva) ?? '0' },
                  ...(veEconomia
                    ? [{
                        rotulo: 'CONTRATADO',
                        // NADIE CARGÓ NINGÚN CONTRATO ≠ CONTRATADO $ 0.
                        valor: total.contratado === null ? 'sin cargar' : (millones(total.contratado) ?? 'sin cargar'),
                        fuerte: true,
                      }]
                    : []),
                ]}
              />
            </div>
          )}
        </TarjetaTabla>

        {seleccionado && (
          <PanelCliente
            c={seleccionado}
            obras={obrasPorCliente?.[seleccionado.cliente_id] ?? []}
            veEconomia={veEconomia}
            onCerrar={() => setSel(null)}
          />
        )}
      </div>
    </>
  )
}

function Fila({
  c, cols, obras, veEconomia, elegido, onElegir,
}: {
  c: ClientePanel
  cols: string
  obras: ObraEnCurso[]
  veEconomia: boolean
  elegido: boolean
  onElegir: () => void
}) {
  const aviso = avisoDeDatos(c)
  const enCurso = obras.map((o) => o.nombre).join(' · ')

  return (
    // LA FILA ENTERA ABRE EL PANEL, como el canónico 00. El nombre sigue siendo un enlace a la ficha
    // y detiene la propagación: quien quiere editar entra directo, quien está recorriendo la cartera
    // toca en cualquier otro lado y se queda en la lista.
    <FilaCanon
      cols={cols}
      alto={ALTO.filaAlta}
      seleccionada={elegido}
      onClick={onElegir}
      testid="fila-cliente"
      data-elegido={elegido || undefined}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
        <div
          aria-hidden
          style={{
            width: 26, height: 26, borderRadius: 7, background: C.avatar, color: C.tintaSuave,
            fontSize: '10px', fontWeight: 600, display: 'flex', alignItems: 'center',
            justifyContent: 'center', flexShrink: 0,
          }}
        >
          {iniciales(c.nombre_comercial)}
        </div>
        <div style={{ minWidth: 0 }}>
          {c.slug ? (
            <Link
              href={`/clientes/${c.slug}`}
              onClick={(e) => e.stopPropagation()}
              className="block truncate hover:underline"
              style={{ fontSize: '12.5px', fontWeight: 500, color: C.tinta }}
            >
              {c.nombre_comercial}
            </Link>
          ) : (
            // Sin identificador no hay ficha a la que entrar. Se muestra igual: esconderlo haría que
            // un cliente real desapareciera de la lista sin que nadie se entere.
            <span className="block truncate" style={{ fontSize: '12.5px', fontWeight: 500, color: C.tinta }}>
              {c.nombre_comercial}
              <span style={{ marginLeft: 6, fontSize: '10.5px', fontWeight: 400, color: C.warn }}>
                sin ficha todavía
              </span>
            </span>
          )}
          {/* EL CANÓNICO PONE EL TIPO DE CLIENTE («Privado · industria alimenticia») y en esta base
              no existe esa columna. La razón social es el otro nombre REAL del cliente —el de la
              factura— así que ocupa el renglón sin inventar una taxonomía. */}
          <span className="block truncate" style={{ fontSize: '11px', color: C.tenue }}>
            {c.razon_social ?? 'sin razón social'}
            {!c.activo && <span style={{ marginLeft: 6 }}>· archivado</span>}
          </span>
        </div>
        {aviso && (
          <span title={aviso} aria-label={aviso} data-testid="aviso-datos" style={{ display: 'flex', color: C.warn, flexShrink: 0 }}>
            <IcoAlerta s={13} />
          </span>
        )}
      </div>

      {/* PUNTO AZUL DE 6px + NOMBRE, como el canónico. La celda manda con `minWidth:0`: con una
          lista larga de obras, sin eso se montaba sobre la columna de al lado (QA 24/08). */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }} title={enCurso || undefined}>
        {obras.length === 0 ? (
          <span style={{ fontSize: '12px', color: C.tenue }}>ninguna</span>
        ) : (
          <>
            <span style={{ width: 6, height: 6, borderRadius: 3, background: C.info, flexShrink: 0 }} />
            <span className="truncate" style={{ fontSize: '12px', color: C.tintaSuave, minWidth: 0 }}>{enCurso}</span>
          </>
        )}
      </div>

      {/* CERO OBRAS SE ESCRIBE «—» Y NO «0»: un cliente sin obras cargadas y un cliente al que le
          contratamos cero veces son cosas distintas, y esta lista no sabe cuál es cuál. */}
      <CeldaTexto mono alineacion="derecha" color={c.n_obras ? C.tinta : C.tenue}>
        {c.n_obras || '—'}
      </CeldaTexto>

      {veEconomia && (
        <CeldaTexto mono alineacion="derecha" color={c.contratado === null ? C.tenue : C.tinta}>
          {c.contratado === null ? 'sin cargar' : (millones(c.contratado) ?? 'sin cargar')}
        </CeldaTexto>
      )}

      <div style={{ display: 'flex', justifyContent: 'center' }} onClick={(e) => e.stopPropagation()}>
        <MenuContextual
          testid={`acciones-${c.cliente_id}`}
          etiqueta={`Más acciones de ${c.nombre_comercial}`}
          disparador={<IcoMasAcciones s={15} />}
          items={[
            ...(c.slug ? [{ label: 'Abrir la ficha', href: `/clientes/${c.slug}`, testid: 'menu-ficha' }] : []),
            ...(c.slug ? [{ label: 'Documentos del cliente', href: `/clientes/${c.slug}#documentos`, testid: 'menu-docs' }] : []),
          ]}
        />
      </div>
    </FilaCanon>
  )
}
