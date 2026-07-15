#!/usr/bin/env python3
"""Lee el archivo avance_obra.xlsx desde Google Drive y extrae datos de obra."""

import sys
import json
from io import BytesIO

# Importar el cliente de Google Workspace
sys.path.insert(0, '/home/jorge/echegaray-os/app/echegaray-os/scripts/google_workspace')
from client import drive_service, sheets_service

def read_excel_from_drive(file_id):
    """Lee un archivo Excel desde Google Drive usando la API de Sheets."""
    try:
        drive = drive_service()
        sheets = sheets_service()

        # Obtener metadatos del archivo
        file_metadata = drive.files().get(fileId=file_id, fields='name, mimeType').execute()
        print(f"Leyendo archivo: {file_metadata['name']}", file=sys.stderr)

        # Para archivos .xlsx, primero exportamos a CSV o leemos con Sheets API
        # Primero intentamos obtener el ID de la hoja usando Sheets API
        try:
            spreadsheet = sheets.spreadsheets().get(spreadsheetId=file_id).execute()
            sheets_list = spreadsheet.get('sheets', [])

            resultado = {
                'nombre_archivo': file_metadata['name'],
                'mime_type': file_metadata['mimeType'],
                'hojas': []
            }

            # Leer cada hoja
            for sheet in sheets_list:
                sheet_title = sheet['properties']['title']
                print(f"Leyendo hoja: {sheet_title}", file=sys.stderr)

                # Leer todos los valores de la hoja
                result = sheets.spreadsheets().values().get(
                    spreadsheetId=file_id,
                    range=f"'{sheet_title}'!A:Z"
                ).execute()

                values = result.get('values', [])

                resultado['hojas'].append({
                    'nombre_hoja': sheet_title,
                    'datos': values
                })

            return resultado

        except Exception as e:
            print(f"Error al leer como Sheets: {e}", file=sys.stderr)
            # Si falla, intentar exportar como CSV
            raise

    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        raise

if __name__ == '__main__':
    file_id = '1XHiqSC1wiMVrXAob8H_koN5vHr9BQLLvXn61yIW18Ug'

    try:
        datos = read_excel_from_drive(file_id)
        print(json.dumps(datos, ensure_ascii=False, indent=2))
    except Exception as e:
        print(json.dumps({'error': str(e)}, ensure_ascii=False))
        sys.exit(1)
