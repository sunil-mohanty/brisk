"""Service packages (bundles of services) and reading a printed menu with AI.

Revision ID: 0016_packages_menu_scan
Revises: 0015_social_leads
"""

import sqlalchemy as sa
from alembic import op

revision = "0016_packages_menu_scan"
down_revision = "0015_social_leads"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("catalog_items", sa.Column("includes", sa.JSON(), nullable=False, server_default="[]"))
    op.add_column("businesses", sa.Column("menu_scan_month", sa.String(length=7), nullable=True))
    op.add_column("businesses", sa.Column("menu_scans", sa.Integer(), nullable=False, server_default="0"))


def downgrade() -> None:
    op.drop_column("businesses", "menu_scans")
    op.drop_column("businesses", "menu_scan_month")
    op.drop_column("catalog_items", "includes")
