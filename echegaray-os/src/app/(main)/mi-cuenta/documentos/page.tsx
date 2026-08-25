// MIS DOCUMENTOS — qué papeles tengo, cuáles vencen y cuáles faltan.
//
// ═══ LOS DOCUMENTOS SIGUEN VIVIENDO EN DRIVE ═══
//
// Acá está el índice, no una copia. «Ver» abre el archivo en Drive, con sus permisos y su historial
// de versiones. Duplicarlos daría dos apto médicos distintos el día que alguien reemplace uno, y
// ninguna forma de saber cuál vale.
//
// ═══ LAS CATEGORÍAS SE SOPORTAN, NO SE SUPONEN ═══
//
// El vocabulario de la base cubre DNI, constancias, ART, apto médico, capacitaciones, EPP,
// certificados y documentación laboral. Pero la pantalla NO dibuja un renglón vacío por cada
// categoría: eso le diría a un administrativo que le falta una libreta del IERIC que su puesto no
// necesita. Lo que falta lo declara Administración marcando el documento como ausente — que es la
// afirmación de alguien, no una deducción de la pantalla.
//
// ═══ SUBIR: LO QUE HOY NO SE PUEDE, DICHO ═══
//
// El handoff pide la acción `Subir`. Cargar un papel al legajo escribe en `documentacion_legajo`,
// que es de Administración por RLS, y el archivo va a la carpeta de Drive del legajo con la cuenta
// de servicio. Ninguna de las dos cosas se resuelve desde esta pantalla sin abrir la escritura del
// legajo al interesado, así que la columna dice a quién entregárselo en vez de ofrecer un botón que
// la base va a rechazar.

import { createClient } from '@/lib/supabase/server'
import { getUsuarioActual } from '@/features/auth/services/authService'
import { getDocumentosPropios, getPerfilPropio } from '@/features/mi-cuenta/services/miCuentaService'
import { categoriaDe, estadoDe, ordenar, resumenDeAlerta } from '@/features/mi-cuenta/services/documentos'
import { MiCuentaShell } from '@/features/mi-cuenta/components/MiCuentaShell'
import { SinVinculo } from '@/features/mi-cuenta/components/SinVinculo'
import { Aviso, Ayuda, Estado, Nulo, Tabla, THead, Th, Tr, Td, Vacio } from '@/shared/components/ds'
import { fecha } from '@/features/obras/components/formato'
import type { EstadoDocumento } from '@/features/mi-cuenta/types'

export const dynamic = 'force-dynamic'

const TONO: Record<EstadoDocumento, 'pos' | 'neg' | 'warn' | 'nulo'> = {
  vigente: 'pos',
  por_vencer: 'warn',
  vencido: 'neg',
  falta: 'nulo',
}
const PALABRA: Record<EstadoDocumento, string> = {
  vigente: 'Vigente',
  por_vencer: 'Por vencer',
  vencido: 'Vencido',
  falta: 'sin cargar',
}

export default async function MisDocumentosPage() {
  const supabase = await createClient()
  const user = await getUsuarioActual(supabase)
  if (!user) return <MiCuentaShell titulo="Mis documentos"><Aviso tono="neg">Tu sesión venció. Volvé a entrar.</Aviso></MiCuentaShell>

  const perfil = await getPerfilPropio(supabase, user.id)
  if (!perfil.data?.persona_id) {
    return <MiCuentaShell titulo="Mis documentos"><SinVinculo que="tus documentos" disponible={perfil.data?.vinculoDisponible ?? true} /></MiCuentaShell>
  }

  const docs = await getDocumentosPropios(supabase)
  if (docs.error) {
    return <MiCuentaShell titulo="Mis documentos"><Aviso tono="neg" titulo="No pude leer tus documentos">{docs.error}</Aviso></MiCuentaShell>
  }

  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
  const filas = ordenar(docs.data ?? [], hoy)
  const alerta = resumenDeAlerta(filas, hoy)

  return (
    <MiCuentaShell
      titulo="Mis documentos"
      descripcion="Los papeles de tu legajo. El archivo vive en Drive: acá está el índice, nunca una copia."
    >
      {/* LO CRÍTICO SE VE ANTES QUE LA TABLA. Un apto médico vencido no puede depender de que alguien
          barra doce filas con la vista para encontrarlo. */}
      {alerta && (
        <div className="mb-5">
          <Aviso tono="warn" titulo="Hay documentos que necesitan atención" testid="alerta-documentos">
            {alerta}. Se entregan en Administración, que es quien los carga al legajo.
          </Aviso>
        </div>
      )}

      {filas.length === 0 ? (
        <Vacio>
          Tu legajo no tiene documentos cargados todavía. Los carga Administración a medida que se
          entregan.
        </Vacio>
      ) : (
        <Tabla testid="tabla-mis-documentos" minWidth={760}>
          <THead>
            <Th>Documento</Th>
            <Th className="w-[180px]">Categoría</Th>
            <Th num className="w-[100px]">Fecha</Th>
            <Th num className="w-[110px]">Vencimiento</Th>
            <Th className="w-[130px]">Estado</Th>
            <Th className="w-[90px]">Acción</Th>
          </THead>
          <tbody>
            {filas.map((d) => {
              const e = estadoDe(d, hoy)
              return (
                <Tr key={d.id}>
                  <Td fuerte>{d.nombre ?? categoriaDe(d.tipo_documento)}</Td>
                  <Td>{categoriaDe(d.tipo_documento)}</Td>
                  <Td num className="text-muted">
                    {d.fecha_documento ? fecha(d.fecha_documento) : <Nulo>sin fecha</Nulo>}
                  </Td>
                  {/* SIN FECHA DE VENCIMIENTO NO SE ESCRIBE UNA: el DNI no vence, y deducirla
                      sumándole un plazo a la emisión fabricaría un dato con cara de real. */}
                  <Td num className={e === 'vencido' ? 'text-neg' : e === 'por_vencer' ? 'text-warn' : 'text-muted'}>
                    {d.fecha_vencimiento ? fecha(d.fecha_vencimiento) : <Nulo>no vence</Nulo>}
                  </Td>
                  <Td>
                    {e === 'falta'
                      ? <span className="text-[12.5px] text-faint">{PALABRA[e]}</span>
                      : <Estado tono={TONO[e]}>{PALABRA[e]}</Estado>}
                  </Td>
                  <Td>
                    {d.drive_file_id ? (
                      <a
                        href={`https://drive.google.com/file/d/${d.drive_file_id}/view`}
                        target="_blank" rel="noreferrer"
                        data-testid="ver-documento"
                        className="text-[12.5px] text-ink hover:underline"
                      >Ver ↗</a>
                    ) : (
                      <Nulo>sin archivo</Nulo>
                    )}
                  </Td>
                </Tr>
              )
            })}
          </tbody>
        </Tabla>
      )}

      {/* 22/08/2026 · La acción se queda arriba y el mecanismo baja: al que mira esta lista lo
          único que le sirve saber es a quién le lleva un papel nuevo. Dónde vive el archivo es
          cómo funciona la pantalla. */}
      <p className="mt-3 max-w-[820px] text-[11px] leading-relaxed text-faint">
        Para entregar un documento nuevo —un apto médico, un certificado de capacitación— se lo
        pasás a Administración y aparece en esta lista.
      </p>
      <Ayuda titulo="Dónde vive cada archivo" testid="ayuda-mis-documentos">
        Los documentos los carga Administración al legajo y quedan vinculados a su archivo en Drive:
        no se duplican acá.
      </Ayuda>
    </MiCuentaShell>
  )
}
