"""Social accounts (Facebook, Instagram, YouTube) and campaign posts.

Revision ID: 0004_social
Revises: 0003_whatsapp
"""

import sqlalchemy as sa
from alembic import op

revision = "0004_social"
down_revision = "0003_whatsapp"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "social_accounts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("business_id", sa.Integer(), sa.ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False),
        sa.Column("provider", sa.String(20), nullable=False),
        sa.Column("account_id", sa.String(80), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("handle", sa.String(200), nullable=True),
        sa.Column("picture_url", sa.String(1000), nullable=True),
        sa.Column("token_enc", sa.Text(), nullable=False),
        sa.Column("refresh_enc", sa.Text(), nullable=True),
        sa.Column("selected", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("error", sa.String(300), nullable=True),
        sa.Column("connected_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("business_id", "provider", "account_id", name="uq_social_account"),
    )
    op.create_index("ix_social_accounts_business_id", "social_accounts", ["business_id"])
    op.create_table(
        "campaign_posts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("campaign_id", sa.Integer(), sa.ForeignKey("campaigns.id", ondelete="CASCADE"), nullable=False),
        sa.Column("business_id", sa.Integer(), sa.ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False),
        sa.Column("provider", sa.String(20), nullable=False),
        sa.Column("account_name", sa.String(200), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("caption", sa.Text(), nullable=False),
        sa.Column("remote_id", sa.String(120), nullable=True),
        sa.Column("url", sa.String(500), nullable=True),
        sa.Column("error", sa.String(500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("posted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_campaign_posts_campaign_id", "campaign_posts", ["campaign_id"])
    op.create_index("ix_campaign_posts_business_id", "campaign_posts", ["business_id"])


def downgrade() -> None:
    op.drop_table("campaign_posts")
    op.drop_table("social_accounts")
