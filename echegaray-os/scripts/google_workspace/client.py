"""Autenticación compartida para Sheets/Docs/Drive vía cuenta de servicio.

No decide qué dato es correcto -- solo da la conexión autenticada. Ver README.md
de esta carpeta para cómo crear la cuenta de servicio y compartir los archivos.
"""

import os

from google.oauth2 import service_account
from googleapiclient.discovery import build

CREDENTIALS_PATH = os.path.join(
    os.path.dirname(__file__), "credentials", "service-account.json"
)

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/documents",
    "https://www.googleapis.com/auth/drive",
]


def get_credentials():
    if not os.path.exists(CREDENTIALS_PATH):
        raise FileNotFoundError(
            f"No se encontró la credencial en {CREDENTIALS_PATH}. "
            "Ver scripts/google_workspace/README.md para crearla."
        )
    return service_account.Credentials.from_service_account_file(
        CREDENTIALS_PATH, scopes=SCOPES
    )


def sheets_service():
    return build("sheets", "v4", credentials=get_credentials())


def docs_service():
    return build("docs", "v1", credentials=get_credentials())


def drive_service():
    return build("drive", "v3", credentials=get_credentials())
