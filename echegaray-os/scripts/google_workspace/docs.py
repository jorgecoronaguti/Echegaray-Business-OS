"""Lectura y escritura segura de Google Docs vía cuenta de servicio.

Misma regla que sheets.py: solo agrega contenido al final del documento,
nunca sobrescribe o borra texto existente.
"""

import argparse
import json
import sys

from client import docs_service


def leer_documento(document_id: str) -> str:
    service = docs_service()
    doc = service.documents().get(documentId=document_id).execute()
    texto = []
    for elemento in doc.get("body", {}).get("content", []):
        parrafo = elemento.get("paragraph")
        if not parrafo:
            continue
        for run in parrafo.get("elements", []):
            texto.append(run.get("textRun", {}).get("content", ""))
    return "".join(texto)


def agregar_texto_al_final(document_id: str, texto: str):
    """Inserta texto al final del documento -- nunca reemplaza contenido existente."""
    service = docs_service()
    doc = service.documents().get(documentId=document_id).execute()
    end_index = doc.get("body", {}).get("content", [])[-1].get("endIndex", 1)
    result = (
        service.documents()
        .batchUpdate(
            documentId=document_id,
            body={
                "requests": [
                    {
                        "insertText": {
                            "location": {"index": end_index - 1},
                            "text": f"\n{texto}",
                        }
                    }
                ]
            },
        )
        .execute()
    )
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Lectura/escritura segura de Google Docs")
    sub = parser.add_subparsers(dest="accion", required=True)

    p_leer = sub.add_parser("leer")
    p_leer.add_argument("document_id")

    p_agregar = sub.add_parser("agregar-texto")
    p_agregar.add_argument("document_id")
    p_agregar.add_argument("texto")

    args = parser.parse_args()

    if args.accion == "leer":
        print(leer_documento(args.document_id))
    elif args.accion == "agregar-texto":
        print(json.dumps(agregar_texto_al_final(args.document_id, args.texto), ensure_ascii=False, indent=2))
    else:
        sys.exit(1)
