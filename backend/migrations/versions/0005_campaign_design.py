"""Campaign banner design (style, shuffle seed) and AI background pictures.

Revision ID: 0005_design
Revises: 0004_social
"""

import sqlalchemy as sa
from alembic import op

revision = "0005_design"
down_revision = "0004_social"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "campaign_art",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("business_id", sa.Integer(), sa.ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False),
        sa.Column("campaign_id", sa.Integer(), nullable=True),
        sa.Column("data", sa.LargeBinary(), nullable=False),
        sa.Column("prompt", sa.Text(), nullable=False),
        sa.Column("provider", sa.String(30), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_campaign_art_business_id", "campaign_art", ["business_id"])
    op.create_index("ix_campaign_art_campaign_id", "campaign_art", ["campaign_id"])
    op.create_index("ix_campaign_art_created_at", "campaign_art", ["created_at"])
    op.create_foreign_key("fk_campaign_art_campaign_id", "campaign_art", "campaigns", ["campaign_id"], ["id"], ondelete="CASCADE")
    op.add_column("campaigns", sa.Column("design_style", sa.String(20), nullable=False, server_default="classic"))
    op.add_column("campaigns", sa.Column("design_seed", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("campaigns", sa.Column("art_id", sa.Integer(), nullable=True))
    op.create_foreign_key("fk_campaigns_art_id", "campaigns", "campaign_art", ["art_id"], ["id"], ondelete="SET NULL")


def downgrade() -> None:
    op.drop_constraint("fk_campaigns_art_id", "campaigns", type_="foreignkey")
    op.drop_column("campaigns", "art_id")
    op.drop_column("campaigns", "design_seed")
    op.drop_column("campaigns", "design_style")
    op.drop_constraint("fk_campaign_art_campaign_id", "campaign_art", type_="foreignkey")
    op.drop_table("campaign_art")
