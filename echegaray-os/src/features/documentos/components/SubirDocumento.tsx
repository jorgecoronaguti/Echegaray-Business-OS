'use client'

// EL CONTROL «SUBIR DOCUMENTO» DE UNA FICHA.
//
// El dueño, 10/09/2026: *«te había pedido formas de subir documentos a las distintas secciones que
// permitan acopio de datos en la plataforma»*. Esto es esa forma, y es la misma en las cuatro
// fichas: elegir archivos, elegir para qué sirven, subir.
//
// ═══ LA CATEGORÍA ES DEL LOTE, NO DE CADA ARCHIVO ═══
//
// Quien sube tres hojas de un acta escaneada las sube juntas y son las tres «acta». Un desplegable
// por archivo serían tres controles para una sola decisión; si hay que mezclar, se hace en dos
// tandas y eso es explícito.
//
// ═══ LO QUE NO ENTRA SE DICE ANTES DE SUBIR ═══
//
// La revisión corre al elegir, con el archivo todavía en la máquina de la persona: rechazar un
// archivo de 40 MB después de esperar a que viaje es hacerle perder el tiempo dos veces. El
// servidor vuelve a preguntar lo mismo, y la base una tercera vez.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Aviso, Boton } from '@/shared/components/ds'
import {
  CATEGORIAS_POR_TIPO, MAX_BYTES, ROTULO_CATEGORIA, archivoEntra,
  type Categoria, type TipoEntidad,
} from '../services/subidaDeDocumento'
import { revisarRango } from '../services/certificadoDeLicencia'
import { subirDocumentos } from '../services/subidaAlBucket'

const TOPE_MB = MAX_BYTES / (1024 * 1024)

/** El `accept` del input. Es una ayuda del selector de archivos, NUNCA el control: se puede saltear
 *  con «todos los archivos» y por eso la revisión de verdad corre igual. */
const ACEPTA = '.pdf,.jpg,.jpeg,.png,.webp,.heic,.gif,.xlsx,.xls,.xlsm,.csv,.doc,.docx,.odt,.ods,.txt'

export function SubirDocumento({
  tipo, entidadId, testid = 'subir-documento',
}: {
  tipo: TipoEntidad
  entidadId: string
  testid?: string
}) {
  const categorias = CATEGORIAS_POR_TIPO[tipo] as readonly Categoria[]
  const [abierto, setAbierto] = useState(false)
  const [archivos, setArchivos] = useState<File[]>([])
  const [categoria, setCategoria] = useState<Categoria>(categorias[0])
  const [descripcion, setDescripcion] = useState('')
  const [fechas, setFechas] = useState<Fechas>({ documento: '', desde: '', hasta: '' })
  const [rechazo, setRechazo] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [subiendo, setSubiendo] = useState(false)
  const router = useRouter()

  function elegir(lista: FileList | null) {
    setMensaje(null); setError(null)
    const todos = [...(lista ?? [])]
    const malos = todos.map((a) => ({ a, r: archivoEntra(a) })).filter((x) => !x.r.ok)
    setArchivos(todos.filter((a) => archivoEntra(a).ok))
    setRechazo(malos.length ? malos.map((m) => (m.r.ok ? '' : m.r.error)).join(' · ') : null)
  }

  const esCertificado = tipo === 'persona' && categoria === 'certificado_medico'

  async function enviar() {
    if (!archivos.length || subiendo) return
    // EL RANGO SE REVISA ANTES DE QUE EL ARCHIVO VIAJE: un certificado sin «hasta» rebotaría en la
    // acción con el archivo ya en el bucket, que es basura que nadie apunta. La misma pregunta que
    // hace el servidor, hecha primero acá.
    const rango = revisarRango(esCertificado ? fechas.desde : '', esCertificado ? fechas.hasta : '')
    if (!rango.ok) { setError(rango.error); return }
    if (esCertificado && !rango.desde) { setError('El certificado médico necesita desde y hasta: son los días que respalda.'); return }
    setSubiendo(true); setMensaje(null); setError(null)
    const r = await subirDocumentos(archivos, {
      tipo, entidadId, categoria, descripcion,
      fechaDocumento: fechas.documento,
      licenciaDesde: rango.desde ?? undefined, licenciaHasta: rango.hasta ?? undefined,
    })
    setSubiendo(false)
    setMensaje(r.mensaje); setError(r.error)
    if (r.resultados.some((x) => x.ok)) {
      setArchivos([]); setDescripcion(''); setFechas({ documento: '', desde: '', hasta: '' })
      // La ficha vuelve a leer: el papel recién subido tiene que aparecer en la lista de abajo sin
      // que nadie recargue a mano.
      router.refresh()
    }
  }

  return (
    <div data-testid={testid} className="mb-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12.5px] text-muted">Documentos cargados desde la plataforma</p>
        <Boton onClick={() => setAbierto(!abierto)} variante="primaria" data-testid={`${testid}-abrir`}>
          Subir documento
        </Boton>
      </div>

      {abierto && (
        <div className="mt-2 rounded-card border border-line p-3" data-testid={`${testid}-panel`}>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-[12px] text-muted">
              <span className="mb-1 block text-[10px] uppercase tracking-[0.06em] text-faint">Archivo</span>
              <input
                type="file" multiple accept={ACEPTA} data-testid={`${testid}-archivo`}
                onChange={(e) => elegir(e.target.files)}
                className="text-[12px]"
              />
            </label>
            <label className="text-[12px] text-muted">
              <span className="mb-1 block text-[10px] uppercase tracking-[0.06em] text-faint">Para qué sirve</span>
              <select
                value={categoria} data-testid={`${testid}-categoria`}
                onChange={(e) => setCategoria(e.target.value as Categoria)}
                className="rounded-[6px] border border-line px-2 py-[5px] text-[12.5px]"
              >
                {categorias.map((c) => <option key={c} value={c}>{ROTULO_CATEGORIA[c]}</option>)}
              </select>
            </label>
            {tipo === 'persona' && (
              <CamposDeFechas fechas={fechas} onChange={setFechas} certificado={esCertificado} testid={testid} />
            )}
            <label className="grow text-[12px] text-muted">
              <span className="mb-1 block text-[10px] uppercase tracking-[0.06em] text-faint">Descripción (opcional)</span>
              <input
                value={descripcion} onChange={(e) => setDescripcion(e.target.value)} maxLength={400}
                data-testid={`${testid}-descripcion`}
                className="w-full rounded-[6px] border border-line px-2 py-[5px] text-[12.5px]"
              />
            </label>
            <Boton onClick={enviar} variante="primaria" data-testid={`${testid}-enviar`}>
              {subiendo ? 'Subiendo…' : `Guardar${archivos.length ? ` (${archivos.length})` : ''}`}
            </Boton>
          </div>

          <p className="mt-2 text-[11.5px] text-faint">
            PDF, imágenes y planillas, hasta {TOPE_MB} MB por archivo. El papel queda en el OS y se
            copia a la carpeta de Drive de la ficha.
            {esCertificado && ' El certificado se cruza con la licencia declarada y dice qué días cubre.'}
          </p>

          {rechazo && <div className="mt-2"><Aviso tono="warn" testid={`${testid}-rechazo`}>{rechazo}</Aviso></div>}
          {error && <div className="mt-2"><Aviso tono="neg" testid={`${testid}-error`}>{error}</Aviso></div>}
          {mensaje && <div className="mt-2"><Aviso tono="info" testid={`${testid}-ok`}>{mensaje}</Aviso></div>}
        </div>
      )}
    </div>
  )
}

interface Fechas { documento: string; desde: string; hasta: string }

const CAMPO = 'rounded-[6px] border border-line px-2 py-[5px] text-[12.5px]'

/**
 * LAS FECHAS DEL PAPEL DEL LEGAJO. «Fecha del documento» es la que dice el papel (la del examen, la
 * del telegrama), no la de hoy; se pide en todas las categorías y es opcional. Desde/hasta aparecen
 * SÓLO para el certificado médico, donde son obligatorias: son los días que el papel respalda.
 */
function CamposDeFechas({
  fechas, onChange, certificado, testid,
}: {
  fechas: Fechas
  onChange: (f: Fechas) => void
  certificado: boolean
  testid: string
}) {
  const campo = (k: keyof Fechas, rotulo: string, requerido = false) => (
    <label className="text-[12px] text-muted">
      <span className="mb-1 block text-[10px] uppercase tracking-[0.06em] text-faint">{rotulo}</span>
      <input
        type="date" value={fechas[k]} required={requerido} data-testid={`${testid}-${k}`}
        onChange={(e) => onChange({ ...fechas, [k]: e.target.value })}
        className={CAMPO}
      />
    </label>
  )
  return (
    <>
      {campo('documento', 'Fecha del documento')}
      {certificado && campo('desde', 'Licencia desde', true)}
      {certificado && campo('hasta', 'Licencia hasta', true)}
    </>
  )
}
