"""Staff management: profiles, skills, working hours, commission, logins with roles, attendance and leave.

Revision ID: 0009_staff
Revises: 0008_categories
"""

import sqlalchemy as sa
from alembic import op

revision = "0009_staff"
down_revision = "0008_categories"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("role", sa.String(10), nullable=False, server_default="owner"))
    op.add_column("users", sa.Column("stylist_id", sa.Integer(), nullable=True))
    op.create_index("ix_users_stylist_id", "users", ["stylist_id"])
    op.create_foreign_key("fk_users_stylist_id", "users", "stylists", ["stylist_id"], ["id"], ondelete="SET NULL")
    for name, col in (
        ("phone", sa.Column("phone", sa.String(40), nullable=True)),
        ("email", sa.Column("email", sa.String(200), nullable=True)),
        ("joined_on", sa.Column("joined_on", sa.Date(), nullable=True)),
        ("notes", sa.Column("notes", sa.Text(), nullable=True)),
        ("skill_ids", sa.Column("skill_ids", sa.JSON(), nullable=False, server_default="[]")),
        ("working_hours", sa.Column("working_hours", sa.JSON(), nullable=False, server_default="{}")),
        ("commission_rate", sa.Column("commission_rate", sa.Numeric(5, 2), nullable=False, server_default="0")),
        ("commission_by_category", sa.Column("commission_by_category", sa.JSON(), nullable=False, server_default="{}")),
        ("permissions", sa.Column("permissions", sa.JSON(), nullable=False, server_default="[]")),
    ):
        op.add_column("stylists", col)
    op.create_table(
        "attendance",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("business_id", sa.Integer(), sa.ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False),
        sa.Column("stylist_id", sa.Integer(), sa.ForeignKey("stylists.id", ondelete="CASCADE"), nullable=False),
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column("clock_in", sa.DateTime(timezone=True), nullable=True),
        sa.Column("clock_out", sa.DateTime(timezone=True), nullable=True),
        sa.Column("absent", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("note", sa.String(200), nullable=True),
        sa.Column("edited", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("stylist_id", "day", name="uq_attendance_day"),
    )
    op.create_index("ix_attendance_business_id", "attendance", ["business_id"])
    op.create_index("ix_attendance_stylist_id", "attendance", ["stylist_id"])
    op.create_index("ix_attendance_day", "attendance", ["day"])
    op.create_table(
        "leave_requests",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("business_id", sa.Integer(), sa.ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False),
        sa.Column("stylist_id", sa.Integer(), sa.ForeignKey("stylists.id", ondelete="CASCADE"), nullable=False),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("reason", sa.String(300), nullable=True),
        sa.Column("status", sa.String(10), nullable=False),
        sa.Column("reply", sa.String(300), nullable=True),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    for c in ("business_id", "stylist_id", "start_date", "end_date", "status"):
        op.create_index(f"ix_leave_requests_{c}", "leave_requests", [c])


def downgrade() -> None:
    op.drop_table("leave_requests")
    op.drop_table("attendance")
    for c in ("permissions", "commission_by_category", "commission_rate", "working_hours", "skill_ids", "notes", "joined_on", "email", "phone"):
        op.drop_column("stylists", c)
    op.drop_constraint("fk_users_stylist_id", "users", type_="foreignkey")
    op.drop_index("ix_users_stylist_id", "users")
    op.drop_column("users", "stylist_id")
    op.drop_column("users", "role")
