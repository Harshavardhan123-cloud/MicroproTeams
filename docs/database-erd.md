# MicroproTeams — Database Schema & ERD Specification

## Entity Relationship Diagram (ERD)

```mermaid
erDiagram
    ORGANIZATIONS ||--o{ USERS : "belongs to"
    ORGANIZATIONS ||--o{ TEAMS : "contains"
    ORGANIZATIONS ||--o{ ORGANIZATION_MEMBERS : "has"
    ORGANIZATIONS ||--o{ AUDIT_LOGS : "logs"

    ROLES ||--o{ USERS : "assigned to"
    ROLES }|--|{ PERMISSIONS : "role_permissions"

    USERS ||--o{ ORGANIZATION_MEMBERS : "member of"
    USERS ||--o{ TEAM_MEMBERS : "joined"
    USERS ||--o{ USER_SESSIONS : "owns"
    USERS ||--o{ MESSAGES : "sends"
    USERS ||--o{ MESSAGE_REACTIONS : "reacts"

    TEAMS ||--o{ TEAM_MEMBERS : "has members"
    TEAMS ||--o{ CHANNELS : "contains"

    CHANNELS ||--o{ MESSAGES : "hosts"
    MESSAGES ||--o{ MESSAGE_REACTIONS : "has"
    MESSAGES ||--o{ MESSAGES : "replies to"

    ORGANIZATIONS {
        uuid id PK
        string name
        string slug UK
        string description
        string logo_url
        uuid owner_id
        datetime created_at
        datetime updated_at
    }

    USERS {
        uuid id PK
        uuid organization_id FK
        uuid role_id FK
        string email UK
        string username UK
        string hashed_password
        string first_name
        string last_name
        string display_name
        string avatar_url
        string job_title
        string department
        string timezone
        string presence
        string status_message
        boolean is_active
        boolean is_superuser
        datetime last_seen
        datetime created_at
        datetime updated_at
    }

    ORGANIZATION_MEMBERS {
        uuid id PK
        uuid organization_id FK
        uuid user_id FK
        string role
        datetime joined_at
    }

    ROLES {
        uuid id PK
        string name UK
        string description
    }

    PERMISSIONS {
        uuid id PK
        string code UK
        string description
    }

    ROLE_PERMISSIONS {
        uuid role_id PK, FK
        uuid permission_id PK, FK
    }

    USER_SESSIONS {
        uuid id PK
        uuid user_id FK
        string refresh_token UK
        string user_agent
        string ip_address
        boolean is_revoked
        datetime expires_at
        datetime created_at
    }

    TEAMS {
        uuid id PK
        uuid organization_id FK
        uuid owner_id FK
        string name
        string description
        string avatar_url
        string privacy
        datetime created_at
        datetime updated_at
    }

    TEAM_MEMBERS {
        uuid id PK
        uuid team_id FK
        uuid user_id FK
        string role
        datetime joined_at
    }

    CHANNELS {
        uuid id PK
        uuid team_id FK
        uuid created_by FK
        string name
        string description
        string type
        datetime created_at
        datetime updated_at
    }

    MESSAGES {
        uuid id PK
        uuid channel_id FK
        uuid sender_id FK
        uuid parent_message_id FK
        string message_type
        string content
        boolean is_edited
        boolean is_pinned
        datetime created_at
        datetime updated_at
    }

    MESSAGE_REACTIONS {
        uuid id PK
        uuid message_id FK
        uuid user_id FK
        string emoji
        datetime created_at
    }

    AUDIT_LOGS {
        uuid id PK
        uuid organization_id FK
        uuid user_id
        string action
        string resource_type
        string resource_id
        string ip_address
        string details
        datetime created_at
    }
```

---

## Key Constraints & Indexes
- **UUID Primary Keys**: Every table uses a 36-character UUID primary key.
- **Foreign Keys**: Cascading deletion (`ondelete="CASCADE"`) configured on child relations.
- **Unique Constraints**:
  - `organizations.slug`
  - `users.email`, `users.username`
  - `roles.name`, `permissions.code`
  - `team_members(team_id, user_id)`
  - `organization_members(organization_id, user_id)`
  - `message_reactions(message_id, user_id, emoji)`
