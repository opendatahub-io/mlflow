"""add agent plugins

Create the agent plugin tables, let MCP access endpoints hold stdio and unassociated
configurations, and add status reasons to skill and agent plugin versions.

Create Date: 2026-11-10

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import mssql, mysql

from mlflow.exceptions import MlflowException

revision = "6df7b2ec2a51"
down_revision = "f4a9b2c7d1e6"
branch_labels = None
depends_on = None


def _get_json_type():
    dialect_name = op.get_bind().dialect.name
    if dialect_name == "mssql":
        return mssql.JSON
    else:
        return sa.JSON


# Agent plugin version columns must be case-sensitive: SemVer treats `1.0.0-A` and
# `1.0.0-a` as different versions, while MySQL and SQL Server default to collations that
# merge them. SQLite and PostgreSQL are already case-sensitive and are left alone.
#
# Must match `AGENT_PLUGIN_VERSION_STRING` in mlflow/store/tracking/dbmodels/models.py, and
# must be identical on every column holding a plugin version string -- MySQL rejects a
# foreign key whose columns disagree on collation (error 3780).
AGENT_PLUGIN_VERSION_STRING = (
    sa
    .String(length=128)
    .with_variant(mysql.VARCHAR(128, collation="utf8mb4_bin"), "mysql")
    .with_variant(mssql.VARCHAR(128, collation="SQL_Latin1_General_CP1_CS_AS"), "mssql")
)

SKILL_REGISTRY_TAG_KEY_STRING = (
    sa
    .String(length=250)
    .with_variant(mysql.VARCHAR(250, collation="utf8mb4_bin"), "mysql")
    .with_variant(mssql.VARCHAR(250, collation="SQL_Latin1_General_CP1_CS_AS"), "mssql")
)

SKILL_REGISTRY_TAG_VALUE_TEXT = (
    sa.Text().with_variant(mysql.MEDIUMTEXT, "mysql").with_variant(mssql.NVARCHAR(None), "mssql")
)

# Must match `AGENT_PLUGIN_MCP_MEMBER_NAME_STRING` in mlflow/store/tracking/dbmodels/models.py.
AGENT_PLUGIN_MCP_MEMBER_NAME_STRING = (
    sa
    .String(length=128)
    .with_variant(mysql.VARCHAR(128, collation="utf8mb4_bin"), "mysql")
    .with_variant(mssql.VARCHAR(128, collation="SQL_Latin1_General_CP1_CS_AS"), "mssql")
)

_STREAMABLE_HTTP_DEFAULT = sa.text("'streamable-http'")

# Columns of mcp_access_endpoints that were required before this migration.
_ENDPOINT_REQUIRED_COLUMNS = (
    ("server_name", sa.String(length=256)),
    ("url", sa.String(length=2048)),
    ("transport_type", sa.String(length=32)),
)


def _alter_access_endpoints(*, upgrade):
    """Relax or restore the required mcp_access_endpoints columns.

    SQL Server can't alter a column that a foreign key uses, so the server foreign key is
    dropped and recreated around the change. SQLite can't alter columns in place, so the
    batch recreates the table there.
    """
    dialect = op.get_bind().dialect.name
    if dialect == "mssql":
        op.drop_constraint(
            "mcp_access_endpoints_server_fkey", "mcp_access_endpoints", type_="foreignkey"
        )
    with op.batch_alter_table("mcp_access_endpoints") as batch_op:
        if upgrade:
            batch_op.add_column(sa.Column("client_config", _get_json_type(), nullable=True))
        else:
            batch_op.drop_column("client_config")
        for column_name, column_type in _ENDPOINT_REQUIRED_COLUMNS:
            if column_name == "transport_type":
                # The column default would replace an explicit NULL from the ORM, which
                # would store a stdio endpoint as streamable-http.
                default_kwargs = (
                    {"server_default": None, "existing_server_default": _STREAMABLE_HTTP_DEFAULT}
                    if upgrade
                    else {"server_default": _STREAMABLE_HTTP_DEFAULT}
                )
            else:
                default_kwargs = {}
            batch_op.alter_column(
                column_name,
                existing_type=column_type,
                existing_nullable=not upgrade,
                nullable=upgrade,
                **default_kwargs,
            )
    if dialect == "mssql":
        op.create_foreign_key(
            "mcp_access_endpoints_server_fkey",
            "mcp_access_endpoints",
            "mcp_servers",
            ["workspace", "server_name"],
            ["workspace", "name"],
            ondelete="CASCADE",
            onupdate="CASCADE",
        )


def _check_endpoints_fit_previous_schema(connection):
    endpoints = sa.table(
        "mcp_access_endpoints",
        sa.column("id"),
        *(sa.column(column_name) for column_name, _ in _ENDPOINT_REQUIRED_COLUMNS),
    )
    for column_name, _ in _ENDPOINT_REQUIRED_COLUMNS:
        row = connection.execute(
            sa.select(endpoints.c.id).where(endpoints.c[column_name].is_(None)).limit(1)
        ).first()
        if row is not None:
            raise MlflowException(
                "Cannot downgrade: MCP access endpoint "
                f"{row.id!r} has no {column_name}, which the previous schema requires. "
                "No schema or data changes have been made by this downgrade. Delete or "
                "update endpoints without a server, URL or transport type, then retry."
            )


def upgrade():
    json_type = _get_json_type()

    op.create_table(
        "agent_plugins",
        sa.Column(
            "workspace",
            sa.String(length=63),
            nullable=False,
            server_default=sa.text("'default'"),
        ),
        sa.Column(
            "organization",
            sa.String(length=64),
            nullable=False,
            server_default=sa.text("''"),
        ),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("icons", json_type, nullable=True),
        sa.Column("created_by", sa.String(length=256), nullable=True),
        sa.Column("last_updated_by", sa.String(length=256), nullable=True),
        sa.Column("created_at", sa.BigInteger(), nullable=False),
        sa.Column("last_updated_at", sa.BigInteger(), nullable=False),
        sa.PrimaryKeyConstraint("workspace", "organization", "name", name="agent_plugins_pk"),
    )

    op.create_table(
        "agent_plugin_versions",
        sa.Column(
            "workspace",
            sa.String(length=63),
            nullable=False,
            server_default=sa.text("'default'"),
        ),
        sa.Column(
            "organization",
            sa.String(length=64),
            nullable=False,
            server_default=sa.text("''"),
        ),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("version", AGENT_PLUGIN_VERSION_STRING, nullable=False),
        sa.Column("version_major", sa.Integer(), nullable=False),
        sa.Column("version_minor", sa.Integer(), nullable=False),
        sa.Column("version_patch", sa.Integer(), nullable=False),
        sa.Column("version_prerelease_sort_key", sa.String(length=512), nullable=False),
        sa.Column("plugin_json", json_type, nullable=False),
        sa.Column("search_text", sa.Text(), nullable=True),
        sa.Column("source_type", sa.String(length=20), nullable=True),
        sa.Column("source", sa.String(length=2048), nullable=True),
        sa.Column("ref", sa.String(length=2048), nullable=True),
        sa.Column("subpath", sa.String(length=2048), nullable=True),
        sa.Column(
            "status",
            sa.String(length=20),
            nullable=False,
            server_default=sa.text("'active'"),
        ),
        sa.Column("status_reason", sa.Text(), nullable=True),
        sa.Column("created_by", sa.String(length=256), nullable=True),
        sa.Column("last_updated_by", sa.String(length=256), nullable=True),
        sa.Column("created_at", sa.BigInteger(), nullable=False),
        sa.Column("last_updated_at", sa.BigInteger(), nullable=False),
        sa.ForeignKeyConstraint(
            ["workspace", "organization", "name"],
            ["agent_plugins.workspace", "agent_plugins.organization", "agent_plugins.name"],
            ondelete="CASCADE",
            onupdate="CASCADE",
            name="agent_plugin_versions_plugin_fkey",
        ),
        sa.PrimaryKeyConstraint(
            "workspace", "organization", "name", "version", name="agent_plugin_versions_pk"
        ),
    )

    op.create_table(
        "agent_plugin_tags",
        sa.Column(
            "workspace",
            sa.String(length=63),
            nullable=False,
            server_default=sa.text("'default'"),
        ),
        sa.Column(
            "organization",
            sa.String(length=64),
            nullable=False,
            server_default=sa.text("''"),
        ),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("key", SKILL_REGISTRY_TAG_KEY_STRING, nullable=False),
        sa.Column("value", SKILL_REGISTRY_TAG_VALUE_TEXT, nullable=True),
        sa.ForeignKeyConstraint(
            ["workspace", "organization", "name"],
            ["agent_plugins.workspace", "agent_plugins.organization", "agent_plugins.name"],
            ondelete="CASCADE",
            onupdate="CASCADE",
            name="agent_plugin_tags_plugin_fkey",
        ),
        sa.PrimaryKeyConstraint(
            "workspace", "organization", "name", "key", name="agent_plugin_tags_pk"
        ),
    )

    op.create_table(
        "agent_plugin_version_tags",
        sa.Column(
            "workspace",
            sa.String(length=63),
            nullable=False,
            server_default=sa.text("'default'"),
        ),
        sa.Column(
            "organization",
            sa.String(length=64),
            nullable=False,
            server_default=sa.text("''"),
        ),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("version", AGENT_PLUGIN_VERSION_STRING, nullable=False),
        sa.Column("key", SKILL_REGISTRY_TAG_KEY_STRING, nullable=False),
        sa.Column("value", SKILL_REGISTRY_TAG_VALUE_TEXT, nullable=True),
        sa.ForeignKeyConstraint(
            ["workspace", "organization", "name", "version"],
            [
                "agent_plugin_versions.workspace",
                "agent_plugin_versions.organization",
                "agent_plugin_versions.name",
                "agent_plugin_versions.version",
            ],
            ondelete="CASCADE",
            onupdate="CASCADE",
            name="agent_plugin_version_tags_version_fkey",
        ),
        sa.PrimaryKeyConstraint(
            "workspace",
            "organization",
            "name",
            "version",
            "key",
            name="agent_plugin_version_tags_pk",
        ),
    )

    op.create_table(
        "agent_plugin_aliases",
        sa.Column(
            "workspace",
            sa.String(length=63),
            nullable=False,
            server_default=sa.text("'default'"),
        ),
        sa.Column(
            "organization",
            sa.String(length=64),
            nullable=False,
            server_default=sa.text("''"),
        ),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("alias", sa.String(length=256), nullable=False),
        sa.Column("version", AGENT_PLUGIN_VERSION_STRING, nullable=False),
        sa.ForeignKeyConstraint(
            ["workspace", "organization", "name"],
            ["agent_plugins.workspace", "agent_plugins.organization", "agent_plugins.name"],
            ondelete="CASCADE",
            onupdate="CASCADE",
            name="agent_plugin_aliases_plugin_fkey",
        ),
        sa.PrimaryKeyConstraint(
            "workspace", "organization", "name", "alias", name="agent_plugin_aliases_pk"
        ),
    )

    op.create_table(
        "agent_plugin_version_members",
        sa.Column(
            "plugin_workspace",
            sa.String(length=63),
            nullable=False,
            server_default=sa.text("'default'"),
        ),
        sa.Column(
            "plugin_organization",
            sa.String(length=64),
            nullable=False,
            server_default=sa.text("''"),
        ),
        sa.Column("plugin_name", sa.String(length=128), nullable=False),
        sa.Column("plugin_version", AGENT_PLUGIN_VERSION_STRING, nullable=False),
        sa.Column("member_name", sa.String(length=128), nullable=False),
        sa.Column(
            "member_organization",
            sa.String(length=64),
            nullable=False,
            server_default=sa.text("''"),
        ),
        sa.Column("member_version", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            ["plugin_workspace", "plugin_organization", "plugin_name", "plugin_version"],
            [
                "agent_plugin_versions.workspace",
                "agent_plugin_versions.organization",
                "agent_plugin_versions.name",
                "agent_plugin_versions.version",
            ],
            ondelete="CASCADE",
            onupdate="CASCADE",
            name="agent_plugin_version_members_plugin_fkey",
        ),
        # NO ACTION (not RESTRICT): SQL Server has no RESTRICT keyword, so it
        # would break the MSSQL migration; NO ACTION still blocks the delete on
        # every dialect and is the MLflow-wide convention. Keep in sync with
        # SqlAgentPluginVersionMember in dbmodels/models.py.
        sa.ForeignKeyConstraint(
            ["plugin_workspace", "member_organization", "member_name", "member_version"],
            [
                "skill_versions.workspace",
                "skill_versions.organization",
                "skill_versions.name",
                "skill_versions.version",
            ],
            ondelete="NO ACTION",
            name="agent_plugin_version_members_skill_fkey",
        ),
        sa.PrimaryKeyConstraint(
            "plugin_workspace",
            "plugin_organization",
            "plugin_name",
            "plugin_version",
            "member_name",
            name="agent_plugin_version_members_pk",
        ),
    )

    # Endpoint references are checked by the application, not by a foreign key: an
    # endpoint may be deleted while plugin versions still reference it.
    op.create_table(
        "agent_plugin_version_mcp_members",
        sa.Column(
            "plugin_workspace",
            sa.String(length=63),
            nullable=False,
            server_default=sa.text("'default'"),
        ),
        sa.Column(
            "plugin_organization",
            sa.String(length=64),
            nullable=False,
            server_default=sa.text("''"),
        ),
        sa.Column("plugin_name", sa.String(length=128), nullable=False),
        sa.Column("plugin_version", AGENT_PLUGIN_VERSION_STRING, nullable=False),
        sa.Column("member_name", AGENT_PLUGIN_MCP_MEMBER_NAME_STRING, nullable=False),
        sa.Column("access_endpoint_id", sa.String(length=36), nullable=False),
        sa.ForeignKeyConstraint(
            ["plugin_workspace", "plugin_organization", "plugin_name", "plugin_version"],
            [
                "agent_plugin_versions.workspace",
                "agent_plugin_versions.organization",
                "agent_plugin_versions.name",
                "agent_plugin_versions.version",
            ],
            ondelete="CASCADE",
            onupdate="CASCADE",
            name="agent_plugin_version_mcp_members_plugin_fkey",
        ),
        sa.PrimaryKeyConstraint(
            "plugin_workspace",
            "plugin_organization",
            "plugin_name",
            "plugin_version",
            "member_name",
            name="agent_plugin_version_mcp_members_pk",
        ),
    )

    # Keep this index narrow enough for MySQL's 3072-byte key limit: the coarse
    # SemVer core prefix prunes candidates, and the prerelease sort key (excluded
    # here) refines ordering at query time.
    op.create_index(
        "ix_agent_plugin_versions_latest_lookup",
        "agent_plugin_versions",
        [
            "workspace",
            "organization",
            "name",
            "status",
            "version_major",
            "version_minor",
            "version_patch",
            "created_at",
        ],
    )
    op.create_index(
        "ix_agent_plugin_version_members_skill_fkey",
        "agent_plugin_version_members",
        ["plugin_workspace", "member_organization", "member_name", "member_version"],
    )
    op.create_index(
        "ix_agent_plugin_version_members_member_name",
        "agent_plugin_version_members",
        ["plugin_workspace", "member_name", "plugin_organization", "plugin_name"],
    )
    op.create_index(
        "ix_agent_plugin_version_mcp_members_endpoint",
        "agent_plugin_version_mcp_members",
        ["plugin_workspace", "access_endpoint_id"],
    )

    op.add_column("skill_versions", sa.Column("status_reason", sa.Text(), nullable=True))
    _alter_access_endpoints(upgrade=True)


def downgrade():
    _check_endpoints_fit_previous_schema(op.get_bind())
    _alter_access_endpoints(upgrade=False)
    op.drop_column("skill_versions", "status_reason")

    # Drop the tables in FK-safe order (children before parents). DROP TABLE removes
    # each table's indexes along with it, so they need no separate handling -- and an
    # explicit drop of ix_agent_plugin_version_members_skill_fkey would fail on MySQL
    # anyway, which forbids dropping an index that still backs a foreign key.
    op.drop_table("agent_plugin_version_mcp_members")
    op.drop_table("agent_plugin_version_members")
    op.drop_table("agent_plugin_aliases")
    op.drop_table("agent_plugin_version_tags")
    op.drop_table("agent_plugin_tags")
    op.drop_table("agent_plugin_versions")
    op.drop_table("agent_plugins")
