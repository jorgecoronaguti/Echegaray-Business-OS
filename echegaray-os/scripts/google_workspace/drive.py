"""Utilidad de diagnóstico: lista qué archivos puede ver hoy la cuenta de servicio.

Útil para confirmar que un Sheet/Doc ya fue compartido correctamente antes de
intentar leerlo o escribirlo -- si no aparece acá, todavía no está compartido.
"""

import json
import sys

from client import drive_service


def listar_archivos_visibles():
    service = drive_service()
    result = (
        service.files()
        .list(pageSize=50, fields="files(id, name, mimeType, owners)")
        .execute()
    )
    return result.get("files", [])


if __name__ == "__main__":
    print(json.dumps(listar_archivos_visibles(), ensure_ascii=False, indent=2))
