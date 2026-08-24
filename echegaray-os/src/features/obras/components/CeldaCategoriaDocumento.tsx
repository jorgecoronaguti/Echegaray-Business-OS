'use client'

// LA CELDA QUE CLASIFICA UN PAPEL — y el único lugar donde la sugerencia se vuelve un dato.
//
// ═══ LA SUGERENCIA SE MUESTRA, NO SE GUARDA ═══
//
// `sugerirCategoria` es una regla escrita (extensión y palabras del nombre) que produce una
// INFERENCIA. Acá se dibuja como «sugerido: X · Confirmar» y no se escribe nada hasta que alguien
// aprieta. Si se escribiera sola, en dos semanas nadie podría distinguir la categoría que puso una
// persona de la que adivinó el OS por el nombre del archivo — y esa distinción es la que permite
// revisar. Cuando la regla no da UNA sola respuesta, no hay sugerencia y la celda lo dice: el papel
// se clasifica a mano, que es lo correcto cuando el nombre no alcanza.
//
// ═══ POR QUÉ EL SELECTOR SE ESCONDE EN LOS GRUPOS YA CLASIFICADOS ═══
//
// La cabecera del grupo ya dice la categoría. Repetirla en cada fila es escribir cuatro veces lo
// que se lee una. Pero tiene que poder corregirse sin abrir un formulario, así que el selector
// existe siempre y aparece al apoyar el mouse o al tabular — el mismo patrón que «Quitar».

import { InlineEdit, Nulo, type OpcionInline, type ResultadoInline } from '@/shared/components/ds'
import { CATEGORIAS_CANONICAS, SIN_CLASIFICAR, categoriaDeclarada } from '../services/documentosCategoria'
import { sugerirCategoria, textoSugerencia } from '../services/documentosSugerencia'
import type { DocumentoObra } from '../types'

/** El vocabulario que ofrece la pantalla. El vacío primero: desclasificar tiene que ser posible. */
const OPCIONES: OpcionInline[] = [
  { valor: '', etiqueta: SIN_CLASIFICAR },
  ...CATEGORIAS_CANONICAS.map((c) => ({ valor: c, etiqueta: c })),
]

export function CeldaCategoriaDocumento({
  doc, clasificar,
}: {
  doc: DocumentoObra
  clasificar: (driveFileId: string, categoria: string) => Promise<ResultadoInline>
}) {
  const actual = categoriaDeclarada(doc.rol)
  const clasificado = CATEGORIAS_CANONICAS.includes(actual as never)
  const sugerida = clasificado ? null : sugerirCategoria(doc.name, doc.mime_type)
  const guardar = (v: string) => clasificar(doc.drive_file_id, v)

  return (
    <span className="flex min-w-0 flex-col gap-1">
      {!clasificado && (
        sugerida ? (
          <button
            type="button"
            onClick={() => void guardar(sugerida)}
            data-testid="confirmar-categoria"
            data-sugerida={sugerida}
            className="self-start text-left text-[11.5px] text-muted hover:text-ink hover:underline"
          >
            {textoSugerencia(sugerida)} · <span className="font-medium text-ink">Confirmar</span>
          </button>
        ) : (
          <Nulo>sin sugerencia — clasificar a mano</Nulo>
        )
      )}
      <span className={clasificado
        ? 'opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100'
        : ''}
      >
        <InlineEdit
          valor={clasificado ? actual : null}
          guardar={guardar}
          tipo="seleccion"
          opciones={OPCIONES}
          falta="elegir categoría"
          etiqueta={`Categoría de ${doc.name ?? doc.drive_file_id}`}
          testid="categoria-documento"
          ancho="w-[180px]"
        />
      </span>
    </span>
  )
}
