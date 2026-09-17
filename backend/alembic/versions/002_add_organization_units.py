"""Add organization units and employee relationship

Revision ID: 002_add_organization_units
Revises: 001_initial_schema
Create Date: 2026-09-10

"""
from alembic import op
import sqlalchemy as sa
from app.models.models import GUID

revision = '002_add_organization_units'
down_revision = '001_initial_schema'
branch_labels = None
depends_on = None

def upgrade() -> None:
    # Tables and missing columns are synced dynamically via Base.metadata.create_all and sync_db_schema_sync.
    # For full standard Alembic migrations against PostgreSQL:
    try:
        op.create_table(
            'organization_units',
            sa.Column('id', GUID(), primary_key=True),
            sa.Column('organization_id', GUID(), sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False),
            sa.Column('parent_id', GUID(), sa.ForeignKey('organization_units.id', ondelete='SET NULL'), nullable=True),
            sa.Column('name', sa.String(255), nullable=False),
            sa.Column('code', sa.String(50), nullable=True),
            sa.Column('unit_type', sa.String(50), server_default='DEPARTMENT', nullable=False),
            sa.Column('description', sa.Text(), nullable=True),
            sa.Column('manager_id', GUID(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
            sa.Column('status', sa.String(20), server_default='ACTIVE', nullable=False),
            sa.Column('order_index', sa.Integer(), server_default='0', nullable=False),
            sa.Column('created_at', sa.DateTime(), nullable=False),
            sa.Column('updated_at', sa.DateTime(), nullable=False),
            sa.Column('deleted_at', sa.DateTime(), nullable=True),
            sa.UniqueConstraint('organization_id', 'code', name='_org_unit_code_uc')
        )
        op.create_index('ix_organization_units_org_id', 'organization_units', ['organization_id'])
        op.create_index('ix_organization_units_parent_id', 'organization_units', ['parent_id'])
        op.create_index('ix_organization_units_code', 'organization_units', ['code'])
        op.create_index('ix_organization_units_manager_id', 'organization_units', ['manager_id'])
    except Exception:
        pass

    try:
        op.add_column(
            'users',
            sa.Column('organization_unit_id', GUID(), sa.ForeignKey('organization_units.id', ondelete='SET NULL'), nullable=True)
        )
        op.create_index('ix_users_org_unit_id', 'users', ['organization_unit_id'])
    except Exception:
        pass

def downgrade() -> None:
    try:
        op.drop_constraint('fk_users_org_unit_id', 'users', type_='foreignkey')
        op.drop_column('users', 'organization_unit_id')
    except Exception:
        pass

    try:
        op.drop_table('organization_units')
    except Exception:
        pass
