"""Pictures and brochures on client quotes (uploaded, designed, or AI).

Revision ID: 0006_quote_pics
Revises: 0005_design
"""

import sqlalchemy as sa
from alembic import op

revision = "0006_quote_pics"
down_revision = "0005_design"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("campaign_art", sa.Column("quote_id", sa.Integer(), nullable=True))
    op.add_column("campaign_art", sa.Column("kind", sa.String(10), nullable=False, server_default="ai"))
    op.add_column("campaign_art", sa.Column("content_type", sa.String(60), nullable=False, server_default="image/jpeg"))
    op.add_column("campaign_art", sa.Column("filename", sa.String(200), nullable=True))
    op.create_index("ix_campaign_art_quote_id", "campaign_art", ["quote_id"])
    op.create_foreign_key("fk_campaign_art_quote_id", "campaign_art", "quotes", ["quote_id"], ["id"], ondelete="CASCADE")
    op.add_column("quotes", sa.Column("design_style", sa.String(20), nullable=False, server_default="none"))
    op.add_column("quotes", sa.Column("design_seed", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("quotes", sa.Column("art_id", sa.Integer(), nullable=True))
    op.create_foreign_key("fk_quotes_art_id", "quotes", "campaign_art", ["art_id"], ["id"], ondelete="SET NULL")
    op.add_column("quotes", sa.Column("file_id", sa.Integer(), nullable=True))
    op.create_foreign_key("fk_quotes_file_id", "quotes", "campaign_art", ["file_id"], ["id"], ondelete="SET NULL")


def downgrade() -> None:
    op.drop_constraint("fk_quotes_file_id", "quotes", type_="foreignkey")
    op.drop_column("quotes", "file_id")
    op.drop_constraint("fk_quotes_art_id", "quotes", type_="foreignkey")
    op.drop_column("quotes", "art_id")
    op.drop_column("quotes", "design_seed")
    op.drop_column("quotes", "design_style")
    op.drop_constraint("fk_campaign_art_quote_id", "campaign_art", type_="foreignkey")
    op.drop_index("ix_campaign_art_quote_id", "campaign_art")
    op.drop_column("campaign_art", "filename")
    op.drop_column("campaign_art", "content_type")
    op.drop_column("campaign_art", "kind")
    op.drop_column("campaign_art", "quote_id")
