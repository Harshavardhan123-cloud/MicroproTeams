# MicroproTeams Enterprise File Storage & Versioning Architecture

## 1. Storage Architecture

```
                 Browser Client
                        |
           HTTP Upload / Download Request
                        |
                        v
                 FastAPI Backend
                        |
            +-----------+-----------+
            |                       |
            v                       v
      PostgreSQL DB            Object Storage
(Metadata, Versions,     (MinIO / AWS S3 Binary
 Activity, Permissions)    organizations/.../files/)
```

---

## 2. Server-Generated Storage Key Pattern

All files are stored using server-generated keys to prevent path traversal (`../../`) and filename collisions:

```
organizations/{organization_id}/files/{file_id}/versions/{version_id}/{storage_key}
```

- **Original Filename**: Preserved in `original_name` column in PostgreSQL and sanitized for display.
- **Physical Key**: Cryptographically random UUID string + validated file extension.

---

## 3. Immutable Multi-Version Management

Every upload or version replacement creates an **immutable `FileVersion` record**:
- **Version Numbers**: Monotonically increasing integer values (1, 2, 3, ...).
- **Restoration**: Restoring Version 2 creates a **new Version 4** with the contents of Version 2. No previous versions are ever overwritten or destroyed.

---

## 4. Signed URLs & Direct Access Security

- **Expiration**: Signed URLs expire in 15 minutes (900 seconds).
- **Credentials Isolation**: Storage provider credentials (S3 keys/MinIO secrets) are never exposed to frontend clients.

---

## 5. Storage Quotas & Accounting

- Organization usage is tracked in the `storage_usages` table.
- Storage usage increases with each version upload and decreases upon permanent deletion.
