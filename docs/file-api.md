# MicroproTeams File Sharing & Document Management REST API

## Endpoints Summary

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/v1/files/upload` | Upload file & create version 1 record |
| `GET` | `/api/v1/files` | List organization files |
| `GET` | `/api/v1/files/recent` | List recent files |
| `GET` | `/api/v1/files/trash` | List soft-deleted files in recycle bin |
| `GET` | `/api/v1/files/search?q={query}` | Search files by name |
| `GET` | `/api/v1/files/{id}` | Get file details & version count |
| `PATCH` | `/api/v1/files/{id}` | Rename file |
| `DELETE` | `/api/v1/files/{id}` | Soft delete file (move to trash) |
| `POST` | `/api/v1/files/{id}/restore` | Restore file from trash |
| `POST` | `/api/v1/files/{id}/permanent-delete` | Permanently delete file & physical key |
| `GET` | `/api/v1/files/{id}/download-url` | Generate short-lived signed download URL |
| `GET` | `/api/v1/files/{id}/preview-url` | Generate short-lived signed preview URL |
| `GET` | `/api/v1/files/{id}/versions` | List all file versions |
| `POST` | `/api/v1/files/{id}/versions` | Upload new version (increments version_number) |
| `POST` | `/api/v1/files/{id}/versions/{version_id}/restore` | Restore past version (creates new version) |
| `GET` | `/api/v1/files/{id}/activity` | Get file activity audit log |
