// LA CABECERA DE LA OBRA — UNA SOLA, PARA TODAS LAS PANTALLAS DE LA OBRA.
//
// ═══ PORTE LITERAL DE LA BANDA QUE DIBUJAN LOS MOCKUPS 02, 03, 05 Y 06 ═══
//
// Los cuatro repiten EXACTAMENTE el mismo bloque, y de ahí salen estas medidas:
//
//   banda        `background:#FFFFFF; borderBottom:1px solid #E7E6E2; padding:9px 20px 0`
//   migaja       11,5px `#91918B`, el nombre de la obra en `#3A3A38`
//   título       21px/600, `letterSpacing:-.01em`, con 5px de aire arriba
//   pastilla     11,5px/500, radio 12, `padding:2px 10px`
//   meta         12px `#6B6B67`, 16px de gap, separadores «·» en `#D7D5CF`
//   solapas      13px, `padding:8px 11px`, activa 600 con `boxShadow:inset 0 -2px 0 #FDC900`
//
// La versión anterior componía `EntityHeader` + `Tabs` del design system y quedaba parecida, no
// igual: el título medía 20px, la migaja no existía y la línea de identidad no llevaba íconos.
//
// ═══ POR QUÉ LA BANDA ES DE ANCHO COMPLETO Y LA PÁGINA NO LE PONE PADDING ═══
//
// En los cuatro mockups la banda blanca llega a los dos bordes de la ventana y el aire de 20px va
// ADENTRO. Envuelta en el contenedor con padding de la página, quedaba una tarjeta blanca flotando
// con lienzo a los costados — que es lo que se veía hasta hoy. Por eso las seis pantallas de la
// obra la sacan de su contenedor: es el único cambio que este porte les hace.
//
// ═══ POR QUÉ RECIBE LA OBRA YA LEÍDA ═══
//
// No consulta nada. Las seis páginas ya leen `obra_panel` para lo suyo; una lectura propia acá
// sería una séptima consulta por visita para repetir un dato que la página tiene en la mano — y el
// día que las dos lecturas discrepen, el título diría una cosa y el cuerpo otra.
//
// ═══ LO QUE ESTA CABECERA NO HACE ═══
//
// NO DIBUJA EL TRACKER DE ETAPAS. Los mockups 02 y 03 —que son LA cabecera de la obra— no lo
// dibujan, y decía dos veces lo mismo: la etapa vigente ya está escrita en la línea de identidad.
// `CicloDeVida.tsx` NO se borró y sigue exportado: retirar un uso es reversible en una línea.

import Link from 'next/link'
import type { ReactNode } from 'react'
import { C, MONO } from './canon/tokens'
import { Ico, P } from './canon/Ico'
import { Pastilla } from './canon/Piezas'
import { fechaCorta } from './formato'
import { ETAPA_LABEL, type Etapa, type ObraPanel } from '../types'
import { VISTAS_OBRA, type VistaObra } from '../services/vistasObra'

/** Lo único que la cabecera necesita de la obra. Un `Pick` y no `ObraPanel` entero: así se ve de un
 *  vistazo qué la rompe si un día la vista cambia, y una página puede armarlo sin traer las 40
 *  columnas del panel. */
export type ObraDeCabecera = Pick<
  ObraPanel,
  'nombre' | 'estado' | 'etapa' | 'cliente_slug' | 'cliente_nombre' | 'cliente_texto'
  | 'fecha_inicio_plan' | 'fecha_fin_plan'
> & Partial<Pick<ObraPanel, 'jefe_obra'>>

/**
 * Un número que contesta la pregunta de ESTA pantalla, no de la obra.
 *
 * `valor: null` NO se dibuja como 0 ni como un guión: se dibuja con la palabra de `falta` («sin
 * secuencia», «sin cargar»), porque «no lo sé» y «es cero» son dos hechos distintos y confundirlos
 * en una pantalla de plazos ya costó caro.
 */
export type KpiPantalla = {
  rotulo: string
  valor: ReactNode | null
  falta?: string
}

/** La pastilla del estado de la obra, con los tres colores del mockup 02. */
function pastillaDeEstado(estado: string): { t: string; tono: 'pos' | 'curso' | 'neutro' } {
  if (estado === 'cerrada') return { t: 'Terminada', tono: 'pos' }
  if (estado === 'activa') return { t: 'En ejecución', tono: 'curso' }
  if (estado === 'pausada') return { t: 'Pausada', tono: 'neutro' }
  // UN ESTADO QUE ESTA PANTALLA NO CONOCE SE MUESTRA COMO VINO: un default de «en ejecución»
  // afirmaría que la obra está trabajando sin que nadie lo haya dicho.
  return { t: estado, tono: 'neutro' }
}

/** El separador «·» tenue que el zip pone entre los campos de la línea meta. */
function Punto() {
  return <span style={{ color: C.bordeFuerte }} aria-hidden>·</span>
}

export function CabeceraDeObra({
  obraId, obra, vistaActiva, pantalla, kpis = [], acciones,
  volverA = '/obras', volverLabel = 'Obras',
}: {
  obraId: string
  obra: ObraDeCabecera
  /**
   * A dónde vuelve la migaja. Por defecto a la cartera, que es lo que dice el zip («Obras /
   * Escuela San Juan»): las seis solapas ya llevan a cualquier parte de la obra.
   */
  volverA?: string
  volverLabel?: ReactNode
  /** La solapa de nivel 2 a la que pertenece esta pantalla. El contrato la marca activa aunque la
   *  URL no sea la del workspace: Cronograma y Subcontratos SON Trabajo, Dotación ES Personal. */
  vistaActiva?: VistaObra
  /** Cómo se llama esta pantalla dentro de la obra. En el workspace no va: la solapa activa ya lo
   *  dice. En las hijas es lo único que las distingue entre sí, porque comparten solapa activa.
   *  El zip lo pone en la línea meta (06: «Cierre de la jornada · Sáb 23/08»). */
  pantalla?: ReactNode
  kpis?: KpiPantalla[]
  /** Lo que se puede hacer desde acá. Lo pone cada página: no son de la obra, son de la pantalla. */
  acciones?: ReactNode
}) {
  const archivada = obra.estado === 'cerrada'
  const est = pastillaDeEstado(obra.estado)
  // EL CLIENTE ES UN LINK cuando existe en el eje canónico. Cuando la obra sólo tiene el nombre
  // escrito a mano, se muestra el texto y se dice que falta vincularlo: la ficha no se inventa.
  const cliente = obra.cliente_slug && obra.cliente_nombre ? (
    <Link href={`/clientes/${obra.cliente_slug}`} prefetch={false} style={{ color: C.tintaSuave }}>
      {obra.cliente_nombre}
    </Link>
  ) : (obra.cliente_nombre ?? obra.cliente_texto ?? null)
  // EL PLAZO ES UN SOLO CAMPO, NO DOS (zip: «03/08 → 05/09»). Cuando falta UNA de las dos NO se
  // dibuja media flecha: se nombra cuál falta, porque «empieza el 03/08 y no sé cuándo termina» es
  // un hecho distinto de «no tiene plan».
  const desde = obra.fecha_inicio_plan ? fechaCorta(obra.fecha_inicio_plan) : null
  const hasta = obra.fecha_fin_plan ? fechaCorta(obra.fecha_fin_plan) : null
  const plazo = desde && hasta ? `${desde} → ${hasta}` : null
  const faltaPlazo = desde ? 'sin fecha de fin' : hasta ? 'sin fecha de inicio' : 'sin fechas de plan'

  return (
    <div style={{
      background: C.superficie, borderBottom: `1px solid ${C.borde}`, padding: '9px 20px 0',
      flexShrink: 0,
    }} data-testid="cabecera-obra-banda">
      <div style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '11.5px', color: C.tenue }}>
        <Link href={volverA} prefetch={false} style={{ color: C.tenue }}>{volverLabel}</Link>
        <span aria-hidden>/</span>
        <span style={{ color: C.tintaMedia }}>{obra.nombre}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '5px', flexWrap: 'wrap' }}>
        <h1 style={{
          fontSize: '21px', fontWeight: 600, color: C.tinta, letterSpacing: '-.01em', margin: 0,
          lineHeight: 1.25,
        }}>{obra.nombre}</h1>
        <span data-testid="cabecera-obra"><Pastilla tono={est.tono} radio={12} tam={11.5}>{est.t}</Pastilla></span>
        {/* ARCHIVADA SE DICE EN EL ENCABEZADO: es la única señal de que esta ficha se abrió por su
            URL y no desde la cartera, y sin ella alguien podría cargar HH o avance sobre una obra
            archivada sin enterarse. */}
        {archivada && (
          <span data-testid="obra-archivada" style={{
            border: `1px solid ${C.borde}`, borderRadius: '4px', padding: '1px 6px',
            fontSize: '11px', color: C.tenue,
          }}>archivada</span>
        )}
        {acciones != null && (
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}>{acciones}</div>
        )}
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', gap: '16px', fontSize: '12px', color: C.tintaSuave,
        marginTop: '3px', flexWrap: 'wrap',
      }} data-testid="cabecera-obra-meta">
        {cliente != null && (
          <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <Ico d={P.cliente} s={13} />{cliente}
            {!obra.cliente_slug && obra.cliente_texto && (
              <span style={{ color: C.tenue }}>· sin ficha de cliente vinculada</span>
            )}
          </span>
        )}
        {cliente != null && <Punto />}
        <span>Etapa: {obra.etapa
          ? (ETAPA_LABEL[obra.etapa as Etapa] ?? obra.etapa)
          : <span style={{ color: C.tenue, fontStyle: 'italic' }} data-nulo="">sin declarar</span>}</span>
        <Punto />
        <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <Ico d={P.fecha} s={13} />
          {plazo
            ? <span style={{ fontFamily: MONO }}>{plazo}</span>
            : <span style={{ color: C.tenue, fontStyle: 'italic' }} data-nulo="">{faltaPlazo}</span>}
        </span>
        {obra.jefe_obra && (
          <>
            <Punto />
            <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <Ico d={P.persona} s={13} />{obra.jefe_obra}
            </span>
          </>
        )}
      </div>

      {/* LA LÍNEA DE PANTALLA — el renglón que el zip pone en las hijas (06: «Cierre de la jornada
          · Sáb 23/08»). El KPI proyectado NO va en amarillo: sobre el fondo claro el amarillo de
          marca no llega al contraste mínimo de texto, y el rótulo ya dice «Fin proyectado». */}
      {(pantalla != null || kpis.length > 0) && (
        <div style={{
          display: 'flex', alignItems: 'baseline', gap: '16px', fontSize: '12px',
          marginTop: '3px', flexWrap: 'wrap',
        }} data-testid="kpis-obra">
          {pantalla != null && <span style={{ fontWeight: 500, color: C.tinta }}>{pantalla}</span>}
          {kpis.map((k) => (
            <span key={k.rotulo} style={{ display: 'inline-flex', alignItems: 'baseline', gap: '6px', whiteSpace: 'nowrap' }}>
              <span style={{ color: C.tenue }}>{k.rotulo}:</span>
              {k.valor == null || k.valor === ''
                ? <span style={{ color: C.tenue, fontStyle: 'italic' }} data-nulo="">{k.falta ?? 'sin dato'}</span>
                : <span style={{ fontFamily: MONO, color: C.tintaMedia }}>{k.valor}</span>}
            </span>
          ))}
        </div>
      )}

      {/* NIVEL 2: las SEIS solapas, iguales en las seis pantallas. `prefetch={false}` porque seis
          rutas `force-dynamic` precargadas por página vista son seis renders que nadie pidió. */}
      <nav style={{ display: 'flex', alignItems: 'stretch', marginTop: '8px', overflowX: 'auto' }}
        data-testid="tabs-obra">
        {VISTAS_OBRA.map((v) => {
          const activo = vistaActiva === v.id
          return (
            <Link key={v.id} href={`/obras/${obraId}?vista=${v.id}`} prefetch={false}
              data-testid={`tab-${v.id}`} aria-current={activo ? 'page' : undefined}
              style={{
                fontSize: '13px', padding: '8px 11px', whiteSpace: 'nowrap',
                color: activo ? C.tinta : C.tintaSuave, fontWeight: activo ? 600 : 400,
                boxShadow: activo ? `inset 0 -2px 0 ${C.marca}` : 'none',
              }}>{v.label}</Link>
          )
        })}
      </nav>
    </div>
  )
}
