"""Lectura y escritura segura de Google Sheets vía cuenta de servicio.

Regla de seguridad de esta sesión (2026-07-09): nunca sobrescribir una celda
que ya tiene una fórmula o dato real de otra persona. Por diseño, este módulo
solo expone operaciones que agregan (fila nueva, pestaña nueva) -- no expone
"escribir sobre un rango existente" para evitar romper un Sheet que Rodrigo
usa a diario. Si en el futuro hace falta sobrescribir una celda puntual,
agregar esa función explícitamente, con el rango exacto, nunca genérica.
"""

import argparse
import json
import sys

from client import sheets_service


def leer_rango(spreadsheet_id: str, rango: str):
    """Lee un rango (ej. 'Hoja1!A1:D10') y devuelve las filas como lista de listas."""
    service = sheets_service()
    result = (
        service.spreadsheets()
        .values()
        .get(spreadsheetId=spreadsheet_id, range=rango)
        .execute()
    )
    return result.get("values", [])


def agregar_fila(spreadsheet_id: str, nombre_hoja: str, valores: list[str]):
    """Agrega una fila al final de la hoja indicada. Nunca toca filas existentes."""
    service = sheets_service()
    result = (
        service.spreadsheets()
        .values()
        .append(
            spreadsheetId=spreadsheet_id,
            range=f"{nombre_hoja}!A1",
            valueInputOption="USER_ENTERED",
            insertDataOption="INSERT_ROWS",
            body={"values": [valores]},
        )
        .execute()
    )
    return result


def crear_pestana_nueva(spreadsheet_id: str, titulo_nuevo: str):
    """Crea una pestaña nueva y vacía -- nunca modifica las existentes."""
    service = sheets_service()
    result = (
        service.spreadsheets()
        .batchUpdate(
            spreadsheetId=spreadsheet_id,
            body={"requests": [{"addSheet": {"properties": {"title": titulo_nuevo}}}]},
        )
        .execute()
    )
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Lectura/escritura segura de Google Sheets")
    sub = parser.add_subparsers(dest="accion", required=True)

    p_leer = sub.add_parser("leer")
    p_leer.add_argument("spreadsheet_id")
    p_leer.add_argument("rango")

    p_fila = sub.add_parser("agregar-fila")
    p_fila.add_argument("spreadsheet_id")
    p_fila.add_argument("nombre_hoja")
    p_fila.add_argument("valores", nargs="+")

    p_pestana = sub.add_parser("crear-pestana")
    p_pestana.add_argument("spreadsheet_id")
    p_pestana.add_argument("titulo_nuevo")

    args = parser.parse_args()

    if args.accion == "leer":
        print(json.dumps(leer_rango(args.spreadsheet_id, args.rango), ensure_ascii=False, indent=2))
    elif args.accion == "agregar-fila":
        print(json.dumps(agregar_fila(args.spreadsheet_id, args.nombre_hoja, args.valores), ensure_ascii=False, indent=2))
    elif args.accion == "crear-pestana":
        print(json.dumps(crear_pestana_nueva(args.spreadsheet_id, args.titulo_nuevo), ensure_ascii=False, indent=2))
    else:
        sys.exit(1)
