// LOS BLOQUES DE LECTURA DE LA FICHA — asignaciones, horas y documentos.
//
// Los tres LEEN de las relaciones canónicas y ninguno guarda un resumen al lado. La asignación sale
// de `obra_asignacion` —la misma fila que muestra `Obra → Personal`—, las horas de `registros_hh`, y
// los documentos son vínculos a Drive, nunca copias.
//
// UN CERO NUNCA REEMPLAZA A UN «SIN CARGAR». Donde no hay dato se escribe qué falta, con esas
// palabras: una ficha que dice «0 HH» cuando nadie imputó nada es una ficha que miente despacio.

import Link from 'next/link'
import type { ReactNode } from 'react'
import { BotonAccion, type ResultadoAccion } from '@/shared/components/ui'
import { Estado, Eyebrow, Nulo, Num, Tabla, Td, Th, THead, Tr, Vacio } from '@/shared/components/ds'
import { urlDeDrive } from '@/features/obras/services/driveUrl'
import { fecha } from '@/features/obras/components/formato'
import type { TotalHH } from '../services/hhPersonaService'
import { faltaEnElLegajo } from '../types'
import type { AsignacionDePersona, DocumentoLegajo, ImputacionHH } from '../types'
import { TIPO_HORA_LABEL, type TipoHora } from '@/features/obras/services/tipoHora'
import { PERIODOS, PERIODO_LABEL, type Periodo } from '../services/periodoHH'

const hh = (n: number) => n.toLocaleString('es-AR', { maximumFractionDigits: 1 })

/** BLOQUE C — dónde está y dónde estuvo. Las vigentes arriba; las cerradas son el historial. */
export function BloqueAsignacion({
  asignaciones, cerrar,
}: {
  asignaciones: AsignacionDePersona[]
  cerrar: (asignacionId: string) => Promise<ResultadoAccion>
}) {
  if (asignaciones.length === 0) {
    return <Vacio>Sin asignaciones a obra. Se cargan desde la solapa Personal de la obra.</Vacio>
  }
  return (
    <Tabla testid="ficha-asignaciones" minWidth={720}>
      <THead>
        <Th>Obra</Th>
        <Th>Actividad</Th>
        <Th>Cuadrilla</Th>
        <Th>Rol</Th>
        <Th>Desde</Th>
        <Th>Hasta</Th>
        <Th />
      </THead>
      <tbody>
        {asignaciones.map((a) => (
          <Tr key={a.id} data-testid="fila-asignacion">
            <Td fuerte>
              <Link href={`/obras/${a.obra_id}`} className="text-ink hover:underline">
                {a.obra_nombre ?? a.obra_id}
              </Link>
            </Td>
            <Td>{a.actividad_nombre ?? <Nulo>toda la obra</Nulo>}</Td>
            <Td>{a.cuadrilla ?? <Nulo>sin cuadrilla</Nulo>}</Td>
            <Td>{a.rol ?? 'integrante'}</Td>
            <Td num>{a.desde ? fecha(a.desde) : <Nulo>sin fecha</Nulo>}</Td>
            <Td>
              {a.hasta
                ? <Num className="text-muted">{fecha(a.hasta)}</Num>
                : <Estado tono="pos" clave="vigente">vigente</Estado>}
            </Td>
            <Td className="text-right">
              {/* CERRAR NO BORRA: escribe `hasta`. El período queda, y con él el respaldo de las
                  horas que se imputaron mientras estuvo. */}
              {!a.hasta && (
                <BotonAccion accion={cerrar} args={[a.id]} testid="cerrar-asignacion">Cerrar</BotonAccion>
              )}
            </Td>
          </Tr>
        ))}
      </tbody>
    </Tabla>
  )
}

function ListaTotales({ titulo, totales, testid }: { titulo: string; totales: TotalHH[]; testid: string }) {
  return (
    <div className="min-w-0">
      <Eyebrow className="mb-2">{titulo}</Eyebrow>
      {totales.length === 0
        ? <Nulo>sin imputaciones</Nulo>
        : (
            <ul data-testid={testid} className="space-y-1">
              {totales.map((t) => (
                <li key={t.clave} className="flex items-baseline justify-between gap-3 text-[12.5px]">
                  <span className="min-w-0 truncate text-muted">{t.etiqueta}</span>
                  <Num className="shrink-0 text-ink">{hh(t.horas)} HH</Num>
                </li>
              ))}
            </ul>
          )}
    </div>
  )
}

/** Una cifra del período: etiqueta chica arriba, número grande abajo. Sin tarjeta. */
function CifraHH({ k, v, apagada }: { k: string; v: ReactNode; apagada?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-[11.5px] text-muted">{k}</span>
      <span className={`font-mono text-[18px] font-semibold tabular-nums ${apagada ? 'text-muted' : 'text-ink'}`}>{v}</span>
    </div>
  )
}

/**
 * BLOQUE D — LAS HORAS, COMO REGISTRO OPERATIVO Y NO COMO REPORTE.
 *
 * El dueño: *"En Persona → Horas priorizar una vista operativa tipo registro/timesheet limpia, no un
 * reporte financiero"*, y que la pantalla conteste sin Sheets *"¿cuántas horas trabajó esta persona?
 * ¿en qué fechas? ¿en qué obras? ¿de qué tipo fueron? ¿cuántas tengo que considerar en la
 * liquidación?"*.
 *
 * Por eso: el período se elige arriba (día · semana · quincena · mes), el total y las clases de hora
 * van en una línea —no en cinco tarjetas de cifras, que es la dashboarditis que el lineamiento
 * prohíbe—, y abajo está el registro día por día, abierto, que es lo que se mira de verdad.
 */
export function BloqueHoras({
  periodo, horasPeriodo, porTipo, porObra, porActividad, registros, historial, periodoActivo, hrefPeriodo,
}: {
  periodo: string
  horasPeriodo: number
  porTipo: Record<TipoHora, number>
  porObra: TotalHH[]
  porActividad: TotalHH[]
  /** Lo del período elegido: es el registro que se mira. */
  registros: ImputacionHH[]
  /** TODO lo que tiene cargado, para saber si hay algo fuera del período. */
  historial: ImputacionHH[]
  periodoActivo: Periodo
  hrefPeriodo: (p: Periodo) => string
}) {
  if (historial.length === 0) {
    return <Vacio>Sin horas imputadas a nombre de esta persona. Se cargan desde la solapa Personal de la obra.</Vacio>
  }
  // Las clases con cero no se escriben: un renglón que dice «Extra 100%: 0 h» en todas las
  // quincenas del año es ruido que tapa la única que sí tuvo.
  const clases = (Object.entries(porTipo) as [TipoHora, number][]).filter(([t, h]) => h > 0 && t !== 'normal')

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-3">
        <div className="flex flex-wrap items-baseline gap-x-10 gap-y-3">
          <CifraHH k="HH del período" v={<span data-testid="hh-periodo">{hh(horasPeriodo)}</span>} />
          <CifraHH
            k="Clases de hora" apagada
            v={<span className="text-[12.5px] font-normal text-muted" data-testid="hh-por-tipo">
              {clases.length === 0 ? 'todas normales' : clases.map(([t, h]) => `${TIPO_HORA_LABEL[t]} ${hh(h)}`).join(' · ')}
            </span>}
          />
          <CifraHH k="Ventana" apagada v={<span className="text-[12.5px] font-normal text-muted">{periodo}</span>} />
        </div>
        {/* Nivel 3: texto con subrayado, nunca otra barra de solapas. */}
        <nav className="flex flex-wrap items-center gap-x-4 gap-y-1.5" data-testid="periodo-hh">
          {PERIODOS.map((p) => (
            <Link
              key={p} href={hrefPeriodo(p)} data-testid={`periodo-${p}`}
              aria-current={p === periodoActivo ? 'true' : undefined}
              className={`pb-[2px] text-[12.5px] transition-colors ${
                p === periodoActivo
                  ? 'border-b-[1.5px] border-ink font-medium text-ink'
                  : 'border-b-[1.5px] border-transparent text-muted hover:text-ink'}`}
            >{PERIODO_LABEL[p]}</Link>
          ))}
        </nav>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <ListaTotales titulo="Por obra" totales={porObra} testid="hh-por-obra" />
        <ListaTotales titulo="Por actividad" totales={porActividad} testid="hh-por-actividad" />
      </div>

      {/* EL REGISTRO, ABIERTO. Es lo que se viene a mirar; esconderlo detrás de un desplegable
          obliga a un toque de más todos los días. */}
      <Tabla testid="hh-registro" minWidth={620}>
        <THead>
          <Th>Día</Th>
          <Th>Obra</Th>
          <Th>Actividad</Th>
          <Th>Tipo</Th>
          <Th num>HH</Th>
        </THead>
        <tbody>
          {registros.length === 0 && (
            <tr className="h-fila border-b border-[#EFEEEA]">
              <td colSpan={5} className="text-[12.5px] text-faint">
                Sin horas en este período. Hay {historial.length} imputación(es) en otras fechas.
              </td>
            </tr>
          )}
          {registros.map((r) => (
            <Tr key={r.id} compacta data-testid="fila-registro">
              <Td num>{r.fecha ? fecha(r.fecha) : `semana del ${r.fecha_inicio_semana}`}</Td>
              <Td>{r.obra_nombre ?? <Nulo>sin obra</Nulo>}</Td>
              <Td>{r.actividad_nombre ?? <Nulo>toda la obra</Nulo>}</Td>
              <Td>{r.tipo_hora !== 'normal' ? TIPO_HORA_LABEL[r.tipo_hora as TipoHora] : ''}</Td>
              <Td num fuerte>{hh(r.horas)}</Td>
            </Tr>
          ))}
        </tbody>
      </Tabla>

      {historial.length > registros.length && (
        <p className="text-[11px] text-faint" data-testid="hh-fuera-del-periodo">
          {historial.length - registros.length} imputación(es) fuera del período elegido.
        </p>
      )}
    </div>
  )
}

/**
 * BLOQUE E — los documentos. El archivo vive en Drive; acá está el vínculo y se abre allá.
 *
 * ═══ QUÉ FALTA SE DERIVA, NO SE GUARDA ═══
 *
 * La línea de arriba es la pregunta que el legajo existe para contestar: a quién le falta el alta,
 * el DNI, el apto médico o la constancia de entrega de EPP. Se calcula restando lo vinculado, sin
 * ninguna fila que diga «no está»: guardar la ausencia daría dos definiciones de lo mismo y el día
 * que alguien suba el papel sólo se actualizaría una.
 *
 * Y SÓLO PARA QUIEN TRABAJA HOY: a alguien que se fue hace dos años no se le puede pedir un apto
 * médico vigente, y pintar de ámbar 43 legajos cerrados esconde los que sí importan.
 *
 * ═══ LO QUE NO SE PUEDE PINTAR ═══
 *
 * El handoff pide vencimientos: `warn` al vencer y `neg` vencido. `documentacion_legajo` NO tiene
 * fecha de vencimiento —sólo `fecha_documento`, que es la de emisión—, así que hoy nadie puede decir
 * qué venció. Pintar el semáforo con la fecha que hay sería una alerta que no mide nada.
 */
export function BloqueDocumentos({
  documentos, desvincular, enLaEmpresa = true, carpetaDrive = null,
}: {
  documentos: DocumentoLegajo[]
  desvincular: (documentoId: string) => Promise<ResultadoAccion>
  enLaEmpresa?: boolean
  carpetaDrive?: string | null
}) {
  const falta = enLaEmpresa ? faltaEnElLegajo(documentos) : []
  const encabezado = (
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <p className="text-[12.5px]" data-testid="falta-en-el-legajo">
        {falta.length === 0
          ? <span className="text-muted">{enLaEmpresa ? 'El legajo está completo.' : 'Legajo cerrado.'}</span>
          : (
              <>
                <span className="text-faint">Falta </span>
                <span className="text-warn">{falta.map((f) => f.replace(/_/g, ' ')).join(' · ')}</span>
              </>
            )}
      </p>
      {carpetaDrive && (
        <a
          href={urlDeDrive(carpetaDrive, 'carpeta')} target="_blank" rel="noreferrer"
          className="text-[12px] text-muted transition-colors hover:text-ink" data-testid="abrir-carpeta"
        >ver la carpeta en Drive →</a>
      )}
    </div>
  )
  if (documentos.length === 0) {
    return <>{encabezado}<Vacio>Sin documentos vinculados. Se agregan con el enlace de Drive, sin copiar el archivo.</Vacio></>
  }
  return (
    <>
      {encabezado}
      <Tabla testid="ficha-documentos" minWidth={620}>
        <THead>
          <Th>Categoría</Th>
          <Th>Documento</Th>
          <Th>Fecha</Th>
          <Th />
        </THead>
        <tbody>
          {documentos.map((d) => (
            <Tr key={d.id} data-testid="fila-documento">
              <Td className="w-[150px]">{d.tipo_documento?.replace(/_/g, ' ') ?? <Nulo>sin clasificar</Nulo>}</Td>
              <Td fuerte>
                {d.drive_file_id
                  ? (
                      <a
                        href={urlDeDrive(d.drive_file_id, 'archivo')} target="_blank" rel="noreferrer"
                        className="text-ink hover:underline" data-testid="abrir-documento"
                      >{d.nombre ?? d.tipo_documento ?? 'documento'}</a>
                    )
                  : <span className="text-warn">{d.nombre ?? 'sin vínculo a Drive'}</span>}
                {d.notas && <span className="block text-[11px] text-faint">{d.notas}</span>}
              </Td>
              <Td num className="w-[110px]">
                {d.fecha_documento ? fecha(d.fecha_documento) : <Nulo>sin fecha</Nulo>}
              </Td>
              <Td className="w-[70px] text-right">
                {/* UNA sola acción, no un menú. `MenuContextual` del DS cierra con `onClick`, o sea
                    una FUNCIÓN, y este archivo es un server component: una flecha pasada a un
                    componente de cliente no es una server action —compila, pasa el build y deja la
                    pantalla en blanco—. `BotonAccion` existe justamente para esto: recibe la acción
                    del servidor y sus argumentos como datos.
                    Desvincular saca el vínculo del legajo; el archivo sigue en Drive. */}
                <BotonAccion accion={desvincular} args={[d.id]} testid="desvincular-documento" tono="peligro">
                  Desvincular
                </BotonAccion>
              </Td>
            </Tr>
          ))}
        </tbody>
      </Tabla>
    </>
  )
}
