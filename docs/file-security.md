# MicroproTeams File Security & Access Control Specifications

## 1. Multi-Tenant Organization Isolation
- Every file query explicitly filters on `organization_id == current_user.organization_id`.
- Unauthorized requests across organization boundaries return `404 Not Found` to avoid leaking metadata existence.

---

## 2. Server-Side Access Authorization
- Access control evaluation is executed strictly server-side (`FileService`).
- Frontend UI hides context actions based on permissions, but all actions are re-evaluated server-side.

---

## 3. Malware & File Type Validation
- Both extension and MIME types are validated against configured whitelist.
- Malicious filenames containing `../` or arbitrary control characters are sanitized prior to database storage.

---

## 4. SSRF & Ingress Protection
- Outbound network calls for link metadata or previews block loopback (`127.0.0.1`, `localhost`), private IPv4 ranges (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), and AWS IMDS endpoints (`169.254.169.254`).
