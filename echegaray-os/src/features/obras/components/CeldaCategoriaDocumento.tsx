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

import { useState } from 'react'
import type { ResultadoInline } from '@/shared/components/ds'
import { Combo, type OpcionCombo } from './canon/Controles'
import { C } from './canon/tokens'
import { CATEGORIAS_CANONICAS, SIN_CLASIFICAR, categoriaDeclarada } from '../services/documentosCategoria'
import { sugerirCategoria } from '../services/documentosSugerencia'
import type { DocumentoObra } from '../types'

/**
 * 14 · M17: la celda es el combo del diseño (150×28, borde, «elegir»). La sugerencia NO se apila
 * encima (partía la fila de 44 en 80): va DENTRO del combo — sin elegir dice «sugerido: X» en
 * itálica tenue, y al abrirlo la sugerida es la primera opción con la nota «sugerido». Sigue sin
 * escribirse sola: se guarda cuando alguien la elige.
 */
export function CeldaCategoriaDocumento({
  doc, clasificar,
}: {
  doc: DocumentoObra
  clasificar: (driveFileId: string, categoria: string) => Promise<ResultadoInline>
}) {
  const actual = categoriaDeclarada(doc.rol)
  const clasificado = CATEGORIAS_CANONICAS.includes(actual as never)
  const sugerida = clasificado ? null : sugerirCategoria(doc.name, doc.mime_type)
  const [valor, setValor] = useState(clasificado ? actual : '')
  const [error, setError] = useState<string | null>(null)
  const guardar = async (v: string) => {
    const antes = valor
    setValor(v); setError(null)
    const r = await clasificar(doc.drive_file_id, v)
    if (!r.ok) { setValor(antes); setError(r.error ?? 'No se pudo guardar.') }
  }
  const opciones: OpcionCombo[] = [
    ...(sugerida ? [{ valor: sugerida, etiqueta: sugerida, nota: 'sugerido' }] : []),
    ...CATEGORIAS_CANONICAS.filter((c) => c !== sugerida).map((c) => ({ valor: c, etiqueta: c })),
    { valor: '', etiqueta: SIN_CLASIFICAR },
  ]
  const combo = (
    <Combo valor={valor} alCambiar={(v) => void guardar(v)} opciones={opciones} alto={28} ancho="150px" alinearMenu="derecha"
      vacio={sugerida ? `sugerido: ${sugerida}` : 'elegir'} testid="categoria-documento" etiqueta={`Categoría de ${doc.name ?? doc.drive_file_id}`} />
  )
  return (
    <span className="flex min-w-0 items-center" data-sugerida={sugerida ?? undefined} title={error ?? undefined}>
      {clasificado && valor ? (
        // Ya clasificado: el grupo lo dice; la fila muestra el nombre y el combo aparece al apoyar el mouse.
        <>
          <span className="group-hover:hidden group-focus-within:hidden" style={{ fontSize: '12.5px', color: C.tintaSuave }}>{valor}</span>
          <span className="hidden group-hover:block group-focus-within:block">{combo}</span>
        </>
      ) : combo}
      {error && <span style={{ fontSize: '11px', color: C.neg, marginLeft: '6px' }}>!</span>}
    </span>
  )
}
