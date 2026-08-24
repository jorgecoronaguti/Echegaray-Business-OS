import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUsuarioActual } from '@/features/auth/services/authService'
import { getPerfilPropio } from '@/features/mi-cuenta/services/miCuentaService'
import { categoriaDe } from '@/features/mi-cuenta/services/documentos'
import { SinVinculo } from '@/features/mi-cuenta/components/SinVinculo'
import { PantallaEmpleado } from '@/features/empleado/components/ShellEmpleado'
import { BotonPie, FilaGrupo, Grupo, PieFijo } from '@/features/empleado/components/Piezas'
import { C } from '@/shared/components/movil/tokens'
import { Icono } from '@/shared/components/movil/Iconos'
import { AvisoError, Pastilla, Vacio } from '@/shared/components/movil/Piezas'
import { getMisDocumentos, getMisRecibos } from '@/features/empleado/services/empleadoService'
import { hoyISO } from '@/features/empleado/services/acciones'
import {
  accionDe, agrupar, estadoEnPantalla, GRUPO_LABEL, notaDeVencimiento, pendientes,
} from '@/features/empleado/services/documentos'
import type { DocumentoDelEmpleado } from '@/features/empleado/services/documentos'

// «MIS PAPELES» (M08) — agrupados por para qué sirven, no por tipo de archivo.
//
// ═══ TRES GRUPOS Y NO UNA TABLA ═══
//
// La nota del mockup: «Recibos, salud, personales: no por extensión de archivo». La versión
// anterior era una tabla de seis columnas con su cabecera FECHA·VENCIMIENTO·ESTADO·ACCIÓN, que en
// 390px se lee con lupa. Y ordenada por tipo, el apto médico que vence en veinte días caía entre el
// DNI y el carnet de conducir.
//
// ═══ LOS RECIBOS ENTRAN, PERO SIGUEN TENIENDO SU PANTALLA ═══
//
// 652 de los 847 papeles del legajo son recibos: por eso `mi_documento_legajo` los excluye y tienen
// lista propia. Acá aparecen los ÚLTIMOS TRES —que es lo que el mockup dibuja— y el resto se abre
// con «Ver todos». Meter los 652 en esta pantalla volvería a sepultar el apto médico.
//
// ═══ LO QUE VENCE, AVISA ═══
//
// «"vence en 20 días" y "vencido" son estados distintos». Uno es una cuenta regresiva —todavía se
// puede resolver— y el otro un hecho consumado. `notaDeVencimiento()` los escribe distinto y su
// test lo prueba.

export const dynamic = 'force-dynamic'

type Filtro = 'todos' | 'resolver' | 'al-dia'
const FILTROS: Filtro[] = ['todos', 'resolver', 'al-dia']

/** Los estados que le PIDEN algo a la persona. Lo que está en revisión no: ya hizo su parte. */
const HAY_QUE_RESOLVER = ['solicitado', 'vencido', 'requiere_correccion']

export default async function MisPapelesPage({
  searchParams,
}: {
  searchParams: Promise<{ ver?: string }>
}) {
  const supabase = await createClient()
  const user = await getUsuarioActual(supabase)
  if (!user) redirect('/login')
  const perfil = await getPerfilPropio(supabase, user.id)

  if (!perfil.data?.persona_id) {
    return (
      <PantallaEmpleado titulo="Mis papeles" volver={{ href: '/mi-informacion', label: 'Yo' }}>
        <SinVinculo que="tus documentos" disponible={perfil.data?.vinculoDisponible !== false} />
      </PantallaEmpleado>
    )
  }

  const { ver } = await searchParams
  const filtro: Filtro = FILTROS.includes(ver as Filtro) ? (ver as Filtro) : 'todos'
  const hoy = await hoyISO()
  const [docs, recibos] = await Promise.all([getMisDocumentos(supabase), getMisRecibos(supabase)])

  const todos = docs.data ?? []
  const porResolver = pendientes(todos, hoy)
  const visibles = todos.filter((d) => {
    if (filtro === 'todos') return true
    const hayQueHacerAlgo = HAY_QUE_RESOLVER.includes(estadoEnPantalla(d, hoy))
    return filtro === 'resolver' ? hayQueHacerAlgo : !hayQueHacerAlgo
  })
  const grupos = agrupar(visibles, hoy)
  const ultimosRecibos = (recibos.data ?? []).slice(0, 3)

  // EL PRIMER PAPEL QUE HAY QUE RESOLVER es el destino del botón del pie: es la única puerta de
  // subida que existe hoy, porque `subirDocumento` necesita saber QUÉ documento es y el tipo lo
  // define el pedido de Administración.
  const primeroPendiente = agrupar(todos.filter((d) => HAY_QUE_RESOLVER.includes(estadoEnPantalla(d, hoy))), hoy)
  const destinoDeSubida = [...primeroPendiente.salud, ...primeroPendiente.personales][0] ?? null

  const cuenta = (n: number) => (docs.error ? null : n)

  return (
    <PantallaEmpleado
      titulo="Mis papeles"
      volver={{ href: '/mi-informacion', label: 'Yo' }}
      sub={
        porResolver > 0
          ? <span style={{ color: C.warn }} data-testid="aviso-documentos">
              {porResolver === 1 ? '1 para resolver' : `${porResolver} para resolver`} · {todos.length} papeles
            </span>
          : `${todos.length} papeles en tu legajo`
      }
      /* CHIPS «AL DÍA» Y NO «NUEVOS». El mockup dibuja un tercer filtro «Nuevos», y el OS no tiene
         con qué llenarlo: no existe marca de leído/no leído por persona sobre un documento, así que
         «nuevo» sería una fecha reciente disfrazada de novedad. «Al día» sí es un hecho. */
      franja={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, overflowX: 'auto' }} data-testid="filtros-papeles">
          {([['todos', 'Todos', cuenta(todos.length)], ['resolver', 'Para resolver', cuenta(porResolver)], ['al-dia', 'Al día', cuenta(todos.length - porResolver)]] as const).map(([id, label, n]) => (
            <Pastilla
              key={id}
              testid={`chip-${id}`}
              href={id === 'todos' ? '/mi-informacion/documentos' : `/mi-informacion/documentos?ver=${id}`}
              texto={label}
              cuenta={n}
              activa={id === filtro}
            />
          ))}
        </div>
      }
    >
      {docs.error && <AvisoError testid="documentos-error">{docs.error}</AvisoError>}

      <div data-testid="lista-documentos">
        {filtro === 'todos' && (
          <Grupo titulo="Recibos de sueldo" icono="recibo" cuenta={recibos.data?.length ?? 0} testid="grupo-recibos">
            {ultimosRecibos.length === 0 ? (
              <p style={{ padding: '14px', fontSize: 12.5, color: C.faint }} data-testid="sin-recibos">
                Todavía no hay recibos cargados en tu legajo.
              </p>
            ) : (
              <>
                {ultimosRecibos.map((r) => (
                  <FilaGrupo
                    key={r.id}
                    testid="fila-recibo-papeles"
                    href={`/mi-informacion/recibos/${r.id}`}
                    titulo={r.nombre ?? (r.periodo ? `Recibo ${r.periodo}` : 'Recibo')}
                    /* NUNCA UN NETO $ 0 PARA UN RECIBO SIN LIQUIDAR: se dice que no está liquidado.
                       Y ningún importe se escribe en esta pantalla — el neto vive en el detalle. */
                    nota={r.liquidado ? (r.fecha_documento ? `cargado ${r.fecha_documento.slice(8, 10)}/${r.fecha_documento.slice(5, 7)}` : 'cargado') : 'todavía no liquidado'}
                    tono={r.liquidado ? 'faint' : 'warn'}
                    icono="recibo"
                    marca={r.liquidado ? undefined : 'nuevo'}
                    accion={<span style={{ display: 'flex', color: C.faint, flexShrink: 0 }}><Icono nombre="descargar" tamano={20} /></span>}
                  />
                ))}
                {(recibos.data?.length ?? 0) > ultimosRecibos.length && (
                  <Link
                    href="/mi-informacion/recibos"
                    data-testid="ver-todos-recibos"
                    style={{ display: 'flex', minHeight: 48, alignItems: 'center', padding: '0 14px', fontSize: 12.5, color: C.muted }}
                  >
                    Ver los {recibos.data?.length} recibos →
                  </Link>
                )}
              </>
            )}
          </Grupo>
        )}

        {(['salud', 'personales'] as const).map((g) => (
          <Grupo key={g} titulo={GRUPO_LABEL[g]} icono={g === 'salud' ? 'salud' : 'doc'} cuenta={grupos[g].length} testid={`grupo-${g}`}>
            {grupos[g].length === 0 ? (
              <p style={{ padding: '14px', fontSize: 12.5, color: C.faint }}>
                {filtro === 'todos' ? 'No hay papeles en este grupo.' : 'Nada en este grupo con este filtro.'}
              </p>
            ) : (
              grupos[g].map((d) => <FilaPapel key={d.id} d={d} hoy={hoy} />)
            )}
          </Grupo>
        ))}
      </div>

      {todos.length === 0 && (
        <Vacio testid="sin-documentos">
          No hay documentos cargados en tu legajo. Los carga Administración, y cuando te pidan uno
          aparece acá con el estado «Solicitado».
        </Vacio>
      )}

      <p style={{ marginTop: 18, fontSize: 11.5, lineHeight: 1.6, color: C.faint }}>
        Sólo tus papeles. Lo que subís queda en revisión: no reemplaza al documento oficial hasta que
        Administración lo apruebe.
      </p>

      {/* ═══ «SUBIR UN PAPEL MÍO» LLEVA AL PAPEL QUE TE PIDIERON, Y SI NO HAY, NO MIENTE ═══
          El mockup lo describe como subir el carnet propio sin pasar por la oficina. Eso todavía no
          existe: `subirDocumento` exige `tipo_documento`, y ese tipo lo define el pedido de
          Administración —dejarlo escribir a mano crearía filas que nadie puede clasificar—. Así que
          el botón hace lo único que la base soporta, y cuando no hay nada pendiente lo dice. */}
      <PieFijo testid="pie-papeles">
        {destinoDeSubida ? (
          <Link
            href={`/mi-informacion/documentos/${destinoDeSubida.id}`}
            data-testid="subir-papel"
            style={{
              display: 'flex', width: '100%', minHeight: 52, alignItems: 'center',
              justifyContent: 'center', gap: 9, borderRadius: 12, border: `1px solid ${C.linea}`,
              background: C.surface, fontSize: 15, fontWeight: 600, color: C.ink,
            }}
          >
            <Icono nombre="subir" tamano={20} />
            Subir {(destinoDeSubida.nombre ?? categoriaDe(destinoDeSubida.tipo_documento)).toLowerCase()}
          </Link>
        ) : (
          <BotonPie disabled type="button" testid="subir-papel">
            No te falta ningún papel
          </BotonPie>
        )}
      </PieFijo>
    </PantallaEmpleado>
  )
}

/** Un papel del legajo: qué es, en qué estado está escrito con su color, y qué le toca hacer. */
function FilaPapel({ d, hoy }: { d: DocumentoDelEmpleado; hoy: string }) {
  const e = estadoEnPantalla(d, hoy)
  const a = accionDe(e)
  const nota = notaDeVencimiento(d, hoy)
  return (
    <FilaGrupo
      testid="fila-documento"
      href={`/mi-informacion/documentos/${d.id}`}
      titulo={d.nombre ?? categoriaDe(d.tipo_documento)}
      nota={nota.texto}
      tono={nota.tono}
      icono={nota.tono === 'neg' || nota.tono === 'warn' ? 'alerta' : 'ok'}
      destacada={a.primaria}
      /* LA ACCIÓN PESA CUANDO ES SUYA. «Subir» y «Volver a subir» le tocan a él y van en `ink` 500;
         «Reemplazar» y «Ver lo enviado» son opciones y quedan en `muted`. Mismo lugar siempre: lo
         que cambia es el peso, no la posición. */
      accion={
        <span
          data-testid="accion-documento"
          data-primaria={a.primaria ? 'si' : undefined}
          style={{
            flexShrink: 0, whiteSpace: 'nowrap', fontSize: 12,
            fontWeight: a.primaria ? 500 : 400, color: a.primaria ? C.ink : C.muted,
          }}
        >
          {a.texto}
        </span>
      }
    />
  )
}
