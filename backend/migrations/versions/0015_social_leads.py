"""Facebook and Instagram comments, reactions and messages become leads (with a private reply).

Revision ID: 0015_social_leads
Revises: 0014_wa_chat_logo
"""

import sqlalchemy as sa
from alembic import op

revision = "0015_social_leads"
down_revision = "0014_wa_chat_logo"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("businesses", sa.Column("social_auto_reply", sa.Boolean(), nullable=False, server_default=sa.true()))
    op.create_table(
        "social_people",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("business_id", sa.Integer(), sa.ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False),
        sa.Column("provider", sa.String(length=20), nullable=False),
        sa.Column("person_id", sa.String(length=80), nullable=False),
        sa.Column("msg_id", sa.String(length=80), nullable=True),
        sa.Column("name", sa.String(length=200), nullable=True),
        sa.Column("username", sa.String(length=120), nullable=True),
        sa.Column("token", sa.String(length=16), nullable=False),
        sa.Column("customer_id", sa.Integer(), sa.ForeignKey("customers.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("business_id", "provider", "person_id", name="uq_social_person"),
        sa.UniqueConstraint("token"),
    )
    op.create_index("ix_social_people_business_id", "social_people", ["business_id"])
    op.create_index("ix_social_people_msg_id", "social_people", ["msg_id"])
    op.create_index("ix_social_people_customer_id", "social_people", ["customer_id"])
    op.create_table(
        "social_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("business_id", sa.Integer(), sa.ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False),
        sa.Column("person_id", sa.Integer(), sa.ForeignKey("social_people.id", ondelete="CASCADE"), nullable=True),
        sa.Column("campaign_id", sa.Integer(), sa.ForeignKey("campaigns.id", ondelete="SET NULL"), nullable=True),
        sa.Column("provider", sa.String(length=20), nullable=False),
        sa.Column("kind", sa.String(length=20), nullable=False),
        sa.Column("text", sa.Text(), nullable=True),
        sa.Column("remote_id", sa.String(length=160), nullable=True),
        sa.Column("post_id", sa.String(length=160), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=True),
        sa.Column("error", sa.String(length=300), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    for col in ("business_id", "person_id", "campaign_id", "remote_id", "created_at"):
        op.create_index(f"ix_social_events_{col}", "social_events", [col])


def downgrade() -> None:
    op.drop_table("social_events")
    op.drop_table("social_people")
    op.drop_column("businesses", "social_auto_reply")
