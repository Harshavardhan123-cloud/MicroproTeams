"""Allow legacy inline avatars during SQLite-to-PostgreSQL migration.

Revision ID: 003_expand_user_avatar_url
Revises: 002_add_organization_units
"""

from alembic import op
import sqlalchemy as sa


revision = "003_expand_user_avatar_url"
down_revision = "002_add_organization_units"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("users", "avatar_url", existing_type=sa.String(length=512), type_=sa.Text())


def downgrade() -> None:
    op.alter_column("users", "avatar_url", existing_type=sa.Text(), type_=sa.String(length=512))
