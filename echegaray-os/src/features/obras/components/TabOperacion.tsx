// 11 · OBRA OPERACIÓN — qué la está frenando, qué pidió, qué recursos tiene y qué le hizo el clima.
//
// ═══ LA FORMA LA FIJA EL DESIGN CANÓNICO 23/08 (pantalla 11) ═══
//
//   Sub-tabs con icono y contador —Impedimentos · Pedidos · Equipos · Clima—, chips de filtro sobre
//   los impedimentos, «+ Impedimento» como acción primaria y panel lateral del impedimento elegido.
//   El orden empieza por lo que FRENA la obra: la lista anterior ordenaba por origen del dato (lo
//   que viene del Sheet primero), que es el criterio de quien construyó la pantalla, no el de quien
//   la abre a las siete de la mañana.
//
//   EQUIPOS = Herramientas + Movimientos. Son el mismo recurso —qué hay en obra y cómo llegó—, y
//   estaban en dos pestañas distintas: contestar «¿tengo la hormigonera?» obligaba a cambiar de
//   solapa para ver si había salido. Las dos tablas siguen enteras, una debajo de la otra.
//
//   CLIMA sale de `obra_restriccion` con `tipo = 'clima'` (migración 20260823T1000). No es una
//   fuente nueva: es el mismo impedimento visto por su motivo, y por eso se anota con el mismo
//   formulario.
//
//   COMPRAS ES UNA DESVIACIÓN DECLARADA: el canónico no la dibuja y acá se queda, última. Es la
//   única pantalla donde vive el detalle del costo imputado a la obra contra el total que declara
//   `obra_costo_real`. Borrarla para parecerse al dibujo habría sido perder una capacidad real.
//
// LAS LISTAS SON LO MISMO CON DISTINTO CONTENIDO, y por eso salen todas de la misma `Tabla`
// del design system: cinco tablas escritas a mano se desalinean en el primer cambio de densidad. La
// sub-vista viaja por query string igual que `vista`, así que cada lista es una URL que se comparte
// y el servidor renderiza sin estado de cliente. El TEXTO del buscador, en cambio, es cliente: las
// filas ya viajaron enteras y un viaje de red por tecla no ahorraría nada.
//
// LO QUE NO ESTÁ ES LO QUE NO EXISTE. Pedidos no muestra «solicitante»: ni el Sheet de respaldo ni
// la tabla espejo lo tienen, y una columna vacía o rellenada con el responsable de otra cosa sería
// un dato fabricado. Compras no suma su propio total: muestra el que declara la fuente única del
// costo real, y si el detalle no llega a ese total lo dice en una línea en vez de disimularlo.
//
// PEDIDOS, EQUIPOS Y COMPRAS SON DE FUENTE EXTERNA (AppSheet / Sheet) Y ACÁ NO SE EDITAN. Los que
// escriben son Impedimentos y Clima, que son la misma tabla del OS. Por eso el error de la fuente
// externa tapa a los tres primeros y no a los otros dos: `obra_restriccion` sale de Postgres y no se
// entera de que el Sheet está caído.

'use client'

import { useState, type ReactNode } from 'react'
import { Aviso, Buscador, CAMPO, Estado, FilaTotal, Nulo, SubTabs, Tabla, Td, Th, THead, Tr, Vacio } from '@/shared/components/ds'
import { IconoBloqueo, IconoCompra, IconoDinero, IconoHerramienta } from '@/shared/components/iconos'
import { AvisoDeLectura } from '@/shared/components/estado'
import { estadoInfo } from '@/features/integraciones/services/herramientasService'
import { impedimentoDeClima } from '../../../../orquestador/lib/obra-operacion.mjs'
import type {
  HerramientaOperacion, MovimientoOperacion, PedidoOperacion,
} from '../services/operacionService'
import type { ComprasObra, SubOperacion } from '../services/operacionService'
import { BloqueImpedimentos } from './BloqueImpedimentos'
import type { AccionFormulario, ResultadoAccion } from '@/shared/components/ui'
import type { Actividad, Restriccion } from '../types'
import { fecha, plata } from './formato'

const ICONO = 'h-[14px] w-[14px]'

/**
 * EL SOL DEL CANÓNICO, DIBUJADO ACÁ Y NO EN EL BARRIL DE ICONOS.
 *
 * Es el único icono nuevo que pide la pantalla y el trazo es literalmente el del design (`P.clima`).
 * No sube a `shared/components/iconos.tsx` todavía porque ese archivo lo están tocando otros frentes
 * del mismo rediseño: un icono de una sola pantalla no justifica un conflicto de merge. Si una
 * segunda pantalla lo necesita, ahí sube — y ahí deja de ser local.
 */
function IconoClima({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" />
    </svg>
  )
}

const SUBS: { id: SubOperacion; label: string; icono: ReactNode; buscar: string }[] = [
  { id: 'impedimentos', label: 'Impedimentos', icono: <IconoBloqueo className={ICONO} />, buscar: 'Buscar impedimento' },
  { id: 'pedidos', label: 'Pedidos', icono: <IconoCompra className={ICONO} />, buscar: 'Buscar material' },
  { id: 'equipos', label: 'Equipos', icono: <IconoHerramienta className={ICONO} />, buscar: 'Buscar equipo o responsable' },
  { id: 'clima', label: 'Clima', icono: <IconoClima className={ICONO} />, buscar: 'Buscar evento de clima' },
  { id: 'compras', label: 'Compras', icono: <IconoDinero className={ICONO} />, buscar: 'Buscar proveedor o concepto' },
]

const cantidad = (n: number | null) => (n == null ? '—' : n.toLocaleString('es-AR', { maximumFractionDigits: 2 }))

/** Un pedido está ENTREGADO o no; "pendiente" no es un problema y no lleva color de problema. */
const entregado = (estado: string | null) => (estado ?? '').toLowerCase().includes('entreg')

/** El tono de estado de una herramienta, traducido a los tonos del sistema visual. */
const TONO_HERRAMIENTA = { ok: 'pos', info: 'pendiente', amber: 'warn', red: 'neg' } as const

/** El filtro al teclear del sistema: sin Enter, sin distinguir mayúsculas ni acentos. */
const normal = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
const contiene = (campos: (string | null | undefined)[], q: string) =>
  q === '' || normal(campos.filter(Boolean).join(' ')).includes(q)

/**
 * LOS PEDIDOS, Y PARA QUÉ ACTIVIDAD SON.
 *
 * La columna ACTIVIDAD sólo aparece cuando la ficha pasa la lista de actividades y la acción: un
 * selector que no persiste es peor que no tenerlo.
 *
 * ES OPCIONAL Y SE VE QUE LO ES: «sin asignar» en gris, no un hueco. La obra sigue siendo el eje del
 * pedido; esto contesta «¿qué está esperando esta actividad?» cuando alguien lo sabe.
 */
function Pedidos({
  pedidos, actividades = [], asignar, q,
}: {
  pedidos: PedidoOperacion[]
  actividades?: Actividad[]
  asignar?: (idPedido: string, actividadId: string) => Promise<ResultadoAccion>
  q: string
}) {
  if (!pedidos.length) {
    return <Vacio>Los pedidos de material se registran a nombre de la obra, y ninguno quedó a nombre de ésta.</Vacio>
  }
  const visibles = pedidos.filter((p) => contiene([p.material, p.estado], q))
  if (!visibles.length) return <Vacio>Ningún pedido coincide.</Vacio>
  const elegibles = actividades.filter((a) => a.tipo !== 'resumen' && !a.archivada && !a.actividad_padre_id)
  const conActividad = Boolean(asignar) && elegibles.length > 0
  return (
    <Tabla testid="tabla-pedidos" minWidth={640}>
      <THead>
        <Th num>Fecha</Th><Th>Material</Th><Th num>Cantidad</Th><Th>Estado</Th>
        {conActividad && <Th>Para</Th>}
      </THead>
      <tbody>
        {visibles.map((p) => (
          <Tr key={p.id_pedido} compacta {...{ 'data-obra': p.obra_canonica_id ?? undefined }}>
            <Td num className="whitespace-nowrap text-muted">{fecha(p.fecha)}</Td>
            <Td fuerte>{p.material ?? <Nulo>sin material declarado</Nulo>}</Td>
            <Td num>{cantidad(p.cantidad)}</Td>
            <Td>
              {p.estado
                ? <Estado tono={entregado(p.estado) ? 'pos' : 'pendiente'} clave={p.estado}>{p.estado}</Estado>
                : <Nulo>sin estado</Nulo>}
            </Td>
            {conActividad && (
              <Td>
                <SelectActividad
                  actividades={elegibles}
                  valor={p.actividad_id}
                  alElegir={(id) => asignar!(p.id_pedido, id)}
                />
              </Td>
            )}
          </Tr>
        ))}
      </tbody>
    </Tabla>
  )
}

/** El selector guarda al elegir: un botón «guardar» por fila en una lista de treinta pedidos es
 *  treinta clics de más para un dato que es un solo campo. */
function SelectActividad({
  actividades, valor, alElegir,
}: {
  actividades: Actividad[]
  valor: string | null
  alElegir: (actividadId: string) => Promise<ResultadoAccion>
}) {
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <span className="flex flex-col gap-0.5">
      <select
        defaultValue={valor ?? ''}
        disabled={guardando}
        data-testid="pedido-actividad"
        aria-label="Para la actividad"
        className={`${CAMPO} h-[30px] max-w-[220px] border-line px-1.5 py-0 text-[12px] text-muted`}
        onChange={async (e) => {
          setGuardando(true)
          setError(null)
          const r = await alElegir(e.target.value)
          if (!r.ok) setError(r.error ?? 'No se pudo guardar.')
          setGuardando(false)
        }}
      >
        <option value="">sin asignar</option>
        {actividades.map((a) => (
          <option key={a.id} value={a.id}>{a.rubro ? `${a.rubro} · ` : ''}{a.nombre}</option>
        ))}
      </select>
      {error && <span className="text-[11px] text-neg">{error}</span>}
    </span>
  )
}

/**
 * COMPRAS COMO FILA TRANSACCIONAL (`COMPONENTS.md` §Transaction row).
 *
 * Fecha mono · comprobante · concepto · proveedor · importe mono a la derecha. La EXCEPCIÓN lleva
 * la regla interior de 3px en `warn`: un comprobante sin número es una decisión pendiente de
 * alguien —hay que ir a buscar el papel—, no una característica del gasto. Nunca un badge de color
 * por estado: el estado es texto.
 */
function Compras({ compras, q }: { compras: ComprasObra; q: string }) {
  if (!compras.filas.length) {
    // NO HAY COMPRAS y NO PUDE TRAERLAS son cosas distintas. Si la fuente del costo real declara
    // plata para esta obra y el detalle vino vacío, decir "no hay ninguna" sería tapar un agujero
    // con una frase tranquilizadora.
    return compras.completo ? (
      <Vacio>Todavía no hay ninguna compra imputada a esta obra.</Vacio>
    ) : (
      <Aviso tono="warn">
        Esta obra tiene {plata(compras.total)} en compras registradas, pero acá no se pudo listar ninguna.
      </Aviso>
    )
  }
  const visibles = compras.filas.filter((c) => contiene([c.proveedor, c.concepto, c.comprobante], q))
  return (
    <div className="flex flex-col gap-2.5">
      <Tabla testid="tabla-compras" minWidth={820}>
        <THead>
          <Th num>Fecha</Th><Th>Comprobante</Th><Th>Concepto</Th><Th>Proveedor</Th><Th num>Importe</Th>
        </THead>
        <tbody>
          {visibles.map((c) => {
            const sinComprobante = !c.comprobante
            return (
              <Tr
                key={c.id}
                compacta
                {...{ 'data-obra': c.obra_canonica_id ?? undefined }}
                className={sinComprobante ? 'border-l-[3px] border-l-warn' : ''}
              >
                <Td num className="whitespace-nowrap text-muted">{fecha(c.fecha)}</Td>
                <Td num className="text-muted">{c.comprobante ?? <Nulo>sin comprobante</Nulo>}</Td>
                <Td>{c.concepto ?? <Nulo>sin concepto</Nulo>}</Td>
                <Td fuerte>{c.proveedor ?? <Nulo>sin proveedor</Nulo>}</Td>
                <Td num fuerte>{plata(c.total)}</Td>
              </Tr>
            )
          })}
          {/* EL TOTAL NO SE SUMA ACÁ: es el que declara `obra_costo_real`, la fuente única del costo
              de la obra. Sumar la columna daría un número que coincide sólo mientras el detalle esté
              completo, y el día que no lo esté nadie sabría cuál de los dos mirar. */}
          <FilaTotal>
            <Td colSpan={4}>Costo real de la obra</Td>
            <Td num fuerte>{plata(compras.total)}</Td>
          </FilaTotal>
        </tbody>
      </Tabla>
      {!compras.completo && (
        <p className="text-[11.5px] text-warn" data-testid="cobertura-compras">
          Se listan {compras.filas.length} de {compras.nComprobantes ?? 0} comprobantes. El total lo
          declara la fuente del costo real; el detalle se lista aparte.
        </p>
      )}
    </div>
  )
}

function Herramientas({ herramientas, q }: { herramientas: HerramientaOperacion[]; q: string }) {
  if (!herramientas.length) return <Vacio>Ninguna herramienta figura hoy en esta obra.</Vacio>
  const visibles = herramientas.filter((h) => contiene([h.nombre, h.categoria, h.responsable_actual], q))
  if (!visibles.length) return <Vacio>Ninguna herramienta coincide.</Vacio>
  return (
    <Tabla testid="tabla-herramientas" minWidth={600}>
      <THead><Th>Herramienta</Th><Th>Categoría</Th><Th>Estado</Th><Th>Responsable</Th></THead>
      <tbody>
        {visibles.map((h) => {
          const e = estadoInfo(h.estado)
          return (
            <Tr key={h.id_herramienta} compacta {...{ 'data-obra': h.obra_canonica_id ?? undefined }}>
              <Td fuerte>{h.nombre}</Td>
              <Td>{h.categoria ?? <Nulo>sin categoría</Nulo>}</Td>
              <Td><Estado tono={TONO_HERRAMIENTA[e.tone]} clave={e.label}>{e.label}</Estado></Td>
              <Td>{h.responsable_actual ?? <Nulo>sin responsable</Nulo>}</Td>
            </Tr>
          )
        })}
      </tbody>
    </Tabla>
  )
}

function Movimientos({ movimientos, q }: { movimientos: MovimientoOperacion[]; q: string }) {
  if (!movimientos.length) return <Vacio>Todavía no se movió ninguna herramienta hacia esta obra.</Vacio>
  const visibles = movimientos.filter((m) => contiene([m.herramienta_nombre, m.responsable], q))
  if (!visibles.length) return <Vacio>Ningún movimiento coincide.</Vacio>
  return (
    <Tabla testid="tabla-movimientos" minWidth={520}>
      <THead><Th num>Fecha</Th><Th>Herramienta</Th><Th>Responsable</Th></THead>
      <tbody>
        {visibles.map((m) => (
          <Tr key={m.id_movimiento} compacta {...{ 'data-obra': m.obra_canonica_id ?? undefined }}>
            <Td num className="whitespace-nowrap text-muted">{fecha(m.fecha)}</Td>
            <Td fuerte>{m.herramienta_nombre ?? <Nulo>sin herramienta</Nulo>}</Td>
            <Td>{m.responsable ?? <Nulo>sin responsable</Nulo>}</Td>
          </Tr>
        ))}
      </tbody>
    </Tabla>
  )
}

export function TabOperacion({
  sub, obraId, errorFuente = null, pedidos, compras, herramientas, movimientos, asignarActividadAPedido,
  impedimentos, actividades, crearImpedimento, liberarImpedimento,
}: {
  sub: SubOperacion
  obraId: string
  /** Lo que dijo la fuente externa cuando no se pudo leer. `null` = se leyó bien. Sólo afecta a los
   *  cuatro bloques que salen de ahí: los impedimentos son del OS y siguen funcionando. */
  errorFuente?: string | null
  pedidos: PedidoOperacion[]
  /** Decir para qué actividad es un pedido. Sin ella la columna no se dibuja. */
  asignarActividadAPedido?: (idPedido: string, actividadId: string) => Promise<ResultadoAccion>
  compras: ComprasObra
  herramientas: HerramientaOperacion[]
  movimientos: MovimientoOperacion[]
  /** TODOS los de la obra. Los cuatro bloques de arriba se leen; éste se escribe. */
  impedimentos: Restriccion[]
  /** Para poder colgar el impedimento de la actividad que frena. */
  actividades: Actividad[]
  crearImpedimento: AccionFormulario
  liberarImpedimento: (restriccionId: string) => Promise<ResultadoAccion>
}) {
  // El texto del buscador se borra al cambiar de sub-vista: arrastrarlo dejaría a alguien mirando
  // una lista de tres filas convencido de que la obra no tiene herramientas.
  const [query, setQuery] = useState('')
  const [subPrevia, setSubPrevia] = useState(sub)
  if (sub !== subPrevia) { setSubPrevia(sub); setQuery('') }
  const q = normal(query.trim())

  // EL CLIMA ES UN IMPEDIMENTO CON `tipo = 'clima'`, y sigue apareciendo TAMBIÉN en Impedimentos.
  // Sacarlo de la lista principal para que no se repita escondería una obra parada por lluvia
  // detrás de una pestaña que nadie abre: la lista de lo que frena la obra tiene que estar completa.
  // Clima es una lente sobre esos mismos datos, no un cajón aparte.
  const deClima = impedimentos.filter((r) => impedimentoDeClima(r) as boolean)
  const abiertos = impedimentos.filter((r) => r.estado !== 'liberada').length
  const cuenta: Record<SubOperacion, number> = {
    pedidos: pedidos.length,
    // La cobertura del costo real la declara la fuente; el largo de la lista es lo que se ve.
    compras: compras.nComprobantes ?? compras.filas.length,
    // EQUIPOS cuenta las herramientas que están en la obra, no los movimientos: los movimientos son
    // el historial de cómo llegaron, y un número que crece con cada viaje diría «hay 40 equipos»
    // cuando hay tres que fueron y volvieron.
    equipos: herramientas.length,
    clima: deClima.filter((r) => r.estado !== 'liberada').length,
    // EL CONTADOR DE IMPEDIMENTOS CUENTA LOS ABIERTOS, no el total: los demás cuentan filas porque
    // una fila de compra o de pedido no se «cierra», y un impedimento liberado ya no frena nada.
    // Publicar el total pondría un número que sube para siempre al lado de otros que describen
    // trabajo pendiente.
    impedimentos: abiertos,
  }
  const actual = SUBS.find((s) => s.id === sub) ?? SUBS[0]

  return (
    <div className="flex flex-col gap-4">
      {/* LA BANDA DEL CANÓNICO 11, A SANGRE: fondo `surface-quiet` y hairline arriba y abajo, de
          borde a borde del marco de la ficha. Sin la banda, las sub-vistas y el buscador flotaban
          sobre el canvas y no se leía que gobiernan la lista de abajo. Los márgenes negativos son
          los del marco de la página —16px en el teléfono, 40px en escritorio—. */}
      <div className="-mx-4 flex flex-wrap items-center gap-x-[14px] gap-y-2 border-y border-line bg-surface-quiet px-4 py-1.5 lg:-mx-10 lg:px-10">
        <SubTabs
          testid="subs-operacion"
          items={SUBS.map((s) => ({
            href: `/obras/${obraId}?vista=operacion&sub=${s.id}`,
            label: <span className="inline-flex items-center gap-1.5">{s.icono}{s.label}</span>,
            cuenta: cuenta[s.id],
            activo: s.id === sub,
            testid: `sub-${s.id}`,
          }))}
        />
        {/* El buscador NO aparece sobre los impedimentos ni sobre el clima: esos dos bloques
            escriben, tienen sus propios chips de filtro y rara vez pasan de una docena de filas. Un
            campo de texto ahí es una fila de interfaz que no hace nada. */}
        {sub !== 'impedimentos' && sub !== 'clima' && !errorFuente && (
          <div className="ml-auto flex items-center gap-2">
            {/* En CAJA: sobre el #FAFAF8 de la banda el hairline inferior del buscador de lista
                no se ve y el campo queda flotando sin decir dónde empieza. 206px es la medida del
                canónico 11. */}
            <Buscador
              value={query}
              onChange={setQuery}
              placeholder={actual.buscar}
              variante="caja"
              testid="buscar-operacion"
              className="w-[206px]"
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} data-testid="limpiar-busqueda"
                className="text-[12px] text-faint hover:text-ink">✕</button>
            )}
          </div>
        )}
      </div>

      {/* CUATRO LISTAS VACÍAS NO SON «no hay nada»: son «no pude leer». Se dice cuál es, con el
          mensaje de la fuente, y sólo sobre los bloques que dependen de ella — Impedimentos sale de
          Postgres y no se entera de que el Sheet está caído. */}
      {errorFuente && sub !== 'impedimentos' && sub !== 'clima' && (
        <AvisoDeLectura mensaje={errorFuente} que="la operación de esta obra" testid="operacion-lectura-fallida" />
      )}
      {!errorFuente && sub === 'pedidos' && (
        <Pedidos pedidos={pedidos} actividades={actividades} asignar={asignarActividadAPedido} q={q} />
      )}
      {!errorFuente && sub === 'compras' && <Compras compras={compras} q={q} />}
      {/* EQUIPOS: LAS DOS TABLAS, UNA DEBAJO DE LA OTRA. Primero qué hay hoy en la obra, después
          cómo llegó — el estado antes que el historial, porque la pregunta de la mañana es la
          primera. El buscador filtra las dos a la vez: es el mismo recurso. */}
      {!errorFuente && sub === 'equipos' && (
        <div className="flex flex-col gap-5">
          <section className="flex flex-col gap-2">
            <h3 className="text-[11px] uppercase tracking-[0.06em] text-faint">En la obra</h3>
            <Herramientas herramientas={herramientas} q={q} />
          </section>
          <section className="flex flex-col gap-2">
            <h3 className="text-[11px] uppercase tracking-[0.06em] text-faint">Cómo llegaron</h3>
            <Movimientos movimientos={movimientos} q={q} />
          </section>
        </div>
      )}
      {sub === 'impedimentos' && (
        <BloqueImpedimentos
          impedimentos={impedimentos}
          actividades={actividades}
          crear={crearImpedimento}
          liberar={liberarImpedimento}
        />
      )}
      {/* CLIMA es el mismo bloque con el mismo formulario, filtrado por motivo. Un componente aparte
          para «lo mismo pero con tipo clima» habría dado dos altas del mismo dato que el día que a
          una se le agregue un campo se contestan distinto. */}
      {sub === 'clima' && (
        <BloqueImpedimentos
          impedimentos={deClima}
          actividades={actividades}
          crear={crearImpedimento}
          liberar={liberarImpedimento}
          tipoInicial="clima"
          vacio="Sin registros de clima en esta obra."
        />
      )}
    </div>
  )
}
