"""Add historical span skill links.

Create Date: 2026-11-16 00:00:00.000000

"""

import sqlalchemy as sa
from alembic import op

revision = "c5a8f2d9e731"
down_revision = "f4a9b2c7d1e6"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "span_skill_links",
        sa.Column("trace_id", sa.String(50), nullable=False),
        sa.Column("span_id", sa.String(50), nullable=False),
        sa.Column("skill_workspace", sa.String(63), nullable=False),
        sa.Column("skill_organization", sa.String(64), nullable=False, server_default=""),
        sa.Column("skill_name", sa.String(128), nullable=False),
        sa.Column("skill_version", sa.Integer(), nullable=False),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("created_at", sa.BigInteger(), nullable=False),
        sa.PrimaryKeyConstraint(
            "trace_id",
            "span_id",
            "skill_workspace",
            "skill_organization",
            "skill_name",
            "skill_version",
            name="span_skill_links_pk",
        ),
        sa.ForeignKeyConstraint(
            ["trace_id"],
            ["trace_info.request_id"],
            name="fk_span_skill_links_trace_id",
            ondelete="CASCADE",
        ),
    )
    op.create_index(
        "ix_span_skill_links_skill",
        "span_skill_links",
        ["skill_workspace", "skill_organization", "skill_name", "skill_version", "trace_id"],
    )


def downgrade():
    op.drop_index("ix_span_skill_links_skill", table_name="span_skill_links")
    op.drop_table("span_skill_links")
