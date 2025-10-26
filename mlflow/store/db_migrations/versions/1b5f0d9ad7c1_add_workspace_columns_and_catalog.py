"""Add workspace columns and catalog table

Create Date: 2025-10-22 00:00:00.000000

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision = "1b5f0d9ad7c1"
down_revision = "bf29a5ff90ea"
branch_labels = None
depends_on = None

_NAMING_CONVENTION = {
    "pk": "pk_%(table_name)s",
    "fk": "fk_%(table_name)s_%(referred_table_name)s_%(column_0_name)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
}

_SQLITE_LEGACY_FKS = {
    (
        "model_versions",
        "registered_models",
        ("name",),
    ): "fk_model_versions_registered_models_name",
    (
        "registered_model_tags",
        "registered_models",
        ("name",),
    ): "fk_registered_model_tags_registered_models_name",
    (
        "model_version_tags",
        "model_versions",
        ("name", "version"),
    ): "fk_model_version_tags_model_versions_name",
    (
        "registered_model_aliases",
        "registered_models",
        ("name",),
    ): "fk_registered_model_aliases_registered_models_name",
}


def _fetch_mssql_unique_metadata(
    conn,
    dialect_name: str,
    schema: str | None,
    table_name: str,
    *,
    for_indexes: bool = False,
):
    if dialect_name != "mssql":
        return []

    if for_indexes:
        query = sa.text(
            """
            SELECT
                i.name,
                STRING_AGG(c.name, ',') WITHIN GROUP (ORDER BY ic.key_ordinal) AS column_names
            FROM sys.indexes i
            JOIN sys.tables t ON i.object_id = t.object_id
            JOIN sys.schemas s ON t.schema_id = s.schema_id
            JOIN sys.index_columns ic
                ON i.object_id = ic.object_id
               AND i.index_id = ic.index_id
            JOIN sys.columns c
                ON ic.object_id = c.object_id
               AND ic.column_id = c.column_id
            WHERE i.is_unique = 1
              AND i.is_primary_key = 0
              AND ic.is_included_column = 0
              AND t.name = :table_name
              AND (:schema IS NULL OR s.name = :schema)
            GROUP BY i.name
            """
        )
    else:
        query = sa.text(
            """
            SELECT
                kc.name,
                STRING_AGG(c.name, ',') WITHIN GROUP (ORDER BY ic.key_ordinal) AS column_names
            FROM sys.key_constraints kc
            JOIN sys.tables t ON kc.parent_object_id = t.object_id
            JOIN sys.schemas s ON t.schema_id = s.schema_id
            JOIN sys.index_columns ic
                ON kc.parent_object_id = ic.object_id
               AND kc.unique_index_id = ic.index_id
            JOIN sys.columns c
                ON ic.object_id = c.object_id
               AND ic.column_id = c.column_id
            WHERE kc.type = 'UQ'
              AND t.name = :table_name
              AND (:schema IS NULL OR s.name = :schema)
            GROUP BY kc.name
            """
        )

    result = conn.execute(query, {"table_name": table_name, "schema": schema}).fetchall()
    return [
        {
            "name": row[0],
            "column_names": [col.strip() for col in row[1].split(",") if col] if row[1] else [],
        }
        for row in result
    ]


def _with_batch(table_name):
    return op.batch_alter_table(table_name, recreate="auto", naming_convention=_NAMING_CONVENTION)


def upgrade():
    conn = op.get_bind()
    inspector = inspect(conn)

    def _ensure_workspace_column(table_name: str, *, default: bool = True):
        existing_cols = {col["name"] for col in inspector.get_columns(table_name)}
        if "workspace" in existing_cols:
            return

        server_default = sa.text("'default'") if default else None
        op.add_column(
            table_name,
            sa.Column(
                "workspace",
                sa.String(length=63),
                nullable=False,
                server_default=server_default,
            ),
        )

    _ensure_workspace_column("experiments")
    _ensure_workspace_column("registered_models")
    _ensure_workspace_column("model_versions")
    _ensure_workspace_column("registered_model_tags")
    _ensure_workspace_column("model_version_tags")
    _ensure_workspace_column("registered_model_aliases")
    _ensure_workspace_column("evaluation_datasets")
    _ensure_workspace_column("webhooks")

    dialect_name = conn.dialect.name
    schema = op.get_context().version_table_schema or inspector.default_schema_name

    def _fetch_unique_metadata(table_name: str, *, for_indexes: bool = False):
        return _fetch_mssql_unique_metadata(
            conn,
            dialect_name,
            schema,
            table_name,
            for_indexes=for_indexes,
        )

    def _get_unique_constraints(table_name: str):
        try:
            return inspector.get_unique_constraints(table_name)
        except NotImplementedError:
            metadata = _fetch_unique_metadata(table_name)
            if metadata or dialect_name == "mssql":
                return metadata
            raise

    def _get_unique_indexes(table_name: str):
        try:
            return inspector.get_indexes(table_name)
        except NotImplementedError:
            metadata = _fetch_unique_metadata(table_name, for_indexes=True)
            if metadata or dialect_name == "mssql":
                for entry in metadata:
                    entry["unique"] = True
                return metadata
            raise

    def _has_unique_constraint(table_name: str, columns: tuple[str, ...]):
        def _matches(entry):
            col_names = tuple(entry.get("column_names") or ())
            return len(col_names) == len(columns) and set(col_names) == set(columns)

        for constraint in _get_unique_constraints(table_name) or []:
            if _matches(constraint):
                return True

        for index in _get_unique_indexes(table_name) or []:
            if index.get("unique") and _matches(index):
                return True

        return False

    def drop_unique_on_name(table_name: str):
        expected_name = _NAMING_CONVENTION["uq"] % {
            "table_name": table_name,
            "column_0_name": "name",
        }

        for constraint in _get_unique_constraints(table_name) or []:
            cols = constraint.get("column_names") or []
            name = constraint.get("name")
            if cols == ["name"] or name == expected_name:
                with _with_batch(table_name) as batch_op:
                    batch_op.drop_constraint(name or expected_name, type_="unique")
                return

        for index in _get_unique_indexes(table_name) or []:
            if index.get("unique") and index.get("column_names") == ["name"]:
                op.drop_index(index["name"], table_name=table_name)
                return

    drop_unique_on_name("experiments")

    def drop_foreign_keys(table: str, referred_table: str):
        for fk in inspector.get_foreign_keys(table):
            if fk.get("referred_table") == referred_table:
                name = fk.get("name")
                if not name and dialect_name == "sqlite":
                    key = (table, referred_table, tuple(fk.get("constrained_columns") or ()))
                    name = _SQLITE_LEGACY_FKS.get(key)
                    if not name:
                        # SQLite may leave the constraint unnamed and we have no reliable alias.
                        # Let the subsequent batch recreation handle it. This matches prior
                        # migrations'
                        # behavior and has been exercised in downgrade/upgrade roundtrips.
                        continue

                with _with_batch(table) as batch_op:
                    batch_op.drop_constraint(name, type_="foreignkey")

    drop_foreign_keys("model_versions", "registered_models")
    drop_foreign_keys("registered_model_tags", "registered_models")
    drop_foreign_keys("registered_model_aliases", "registered_models")
    drop_foreign_keys("model_version_tags", "model_versions")

    drop_unique_on_name("registered_models")

    for table, pk in [
        ("registered_models", "registered_model_pk"),
        ("model_versions", "model_version_pk"),
        ("registered_model_tags", "registered_model_tag_pk"),
        ("model_version_tags", "model_version_tag_pk"),
        ("registered_model_aliases", "registered_model_alias_pk"),
    ]:
        with _with_batch(table) as batch_op:
            batch_op.drop_constraint(pk, type_="primary")

    if not _has_unique_constraint("experiments", ("workspace", "name")):
        with _with_batch("experiments") as batch_op:
            batch_op.create_unique_constraint(
                "uq_experiments_workspace_name",
                ["workspace", "name"],
            )

    for table, pk, cols in [
        ("registered_models", "registered_model_pk", ["workspace", "name"]),
        ("model_versions", "model_version_pk", ["workspace", "name", "version"]),
        ("registered_model_tags", "registered_model_tag_pk", ["workspace", "key", "name"]),
        ("model_version_tags", "model_version_tag_pk", ["workspace", "key", "name", "version"]),
        ("registered_model_aliases", "registered_model_alias_pk", ["workspace", "name", "alias"]),
    ]:
        with _with_batch(table) as batch_op:
            batch_op.create_primary_key(pk, cols)

    # After backfilling existing rows, require explicit workspace values for tables that
    # should not silently fall back to the default workspace. We retain the server default
    # on `experiments`, `registered_models`, and `webhooks` so legacy clients that are unaware of
    # workspaces continue to create resources in the `default` workspace.
    for table in [
        "model_versions",
        "registered_model_tags",
        "model_version_tags",
        "registered_model_aliases",
        "evaluation_datasets",
    ]:
        with _with_batch(table) as batch_op:
            batch_op.alter_column(
                "workspace",
                existing_type=sa.String(length=63),
                server_default=None,
            )

    with _with_batch("model_versions") as batch_op:
        batch_op.create_foreign_key(
            "fk_model_versions_registered_models",
            "registered_models",
            ["workspace", "name"],
            ["workspace", "name"],
            onupdate="CASCADE",
        )
    with _with_batch("registered_model_tags") as batch_op:
        batch_op.create_foreign_key(
            "fk_registered_model_tags_registered_models",
            "registered_models",
            ["workspace", "name"],
            ["workspace", "name"],
            onupdate="CASCADE",
        )
    with _with_batch("registered_model_aliases") as batch_op:
        batch_op.create_foreign_key(
            "fk_registered_model_aliases_registered_models",
            "registered_models",
            ["workspace", "name"],
            ["workspace", "name"],
            onupdate="CASCADE",
            ondelete="CASCADE",
        )
    with _with_batch("model_version_tags") as batch_op:
        batch_op.create_foreign_key(
            "fk_model_version_tags_model_versions",
            "model_versions",
            ["workspace", "name", "version"],
            ["workspace", "name", "version"],
            onupdate="CASCADE",
        )

    op.create_index("idx_experiments_workspace", "experiments", ["workspace"])
    op.create_index("idx_registered_models_workspace", "registered_models", ["workspace"])
    op.create_index(
        "idx_experiments_workspace_creation_time",
        "experiments",
        ["workspace", "creation_time"],
        unique=False,
    )
    op.create_index("idx_evaluation_datasets_workspace", "evaluation_datasets", ["workspace"])
    op.create_index("idx_webhooks_workspace", "webhooks", ["workspace"])

    if dialect_name == "mssql":
        created_at_column = sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("SYSUTCDATETIME()"),
        )
    else:
        created_at_column = sa.Column(
            "created_at",
            sa.TIMESTAMP(),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        )

    op.create_table(
        "workspaces",
        sa.Column("name", sa.String(length=63), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        created_at_column,
        sa.PrimaryKeyConstraint("name", name="workspaces_pk"),
    )

    schema = op.get_context().version_table_schema
    metadata = sa.MetaData()
    workspaces_table = sa.Table(
        "workspaces",
        metadata,
        sa.Column("name", sa.String(length=63)),
        sa.Column("description", sa.Text()),
        schema=schema,
    )

    conn.execute(
        workspaces_table.insert().values(
            name="default",
            description="Default workspace for legacy resources",
        )
    )


def downgrade():
    conn = op.get_bind()
    inspector = inspect(conn)
    dialect_name = conn.dialect.name
    schema = op.get_context().version_table_schema or inspector.default_schema_name

    def _fetch_unique_metadata(table_name: str):
        return _fetch_mssql_unique_metadata(
            conn,
            dialect_name,
            schema,
            table_name,
        )

    def _get_unique_constraints(table_name: str):
        try:
            return inspector.get_unique_constraints(table_name)
        except NotImplementedError:
            metadata = _fetch_unique_metadata(table_name)
            if metadata or dialect_name == "mssql":
                return metadata
            raise

    def _load_table(table_name: str):
        return sa.Table(table_name, sa.MetaData(), schema=schema, autoload_with=conn)

    def _assert_no_workspace_conflicts(
        table_name: str,
        columns: tuple[str, ...],
        resource_description: str,
    ):
        table = _load_table(table_name)
        group_columns = [table.c[column] for column in columns]
        stmt = sa.select(*group_columns).group_by(*group_columns).having(sa.func.count() > 1)
        conflicts = conn.execute(stmt).fetchall()
        if conflicts:
            formatted_conflicts = ", ".join(
                "; ".join(f"{column}={value!r}" for column, value in zip(columns, row))
                for row in conflicts[:5]
            )
            if len(conflicts) > 5:
                formatted_conflicts += ", ..."
            raise RuntimeError(
                "Downgrade aborted: merging workspaces would create duplicate "
                f"{resource_description}. Resolve the following conflicts by deleting or renaming "
                f"the affected resources and retry: {formatted_conflicts}"
            )

    def _move_resources_to_default_workspace(table_name: str):
        table = _load_table(table_name)
        conn.execute(
            table.update().where(table.c.workspace != "default").values(workspace="default")
        )

    def _drop_constraint_if_exists(
        table_name: str,
        constraint_name: str,
        *,
        type_: str,
        referred_table: str | None = None,
        columns: tuple[str, ...] | None = None,
    ):
        if type_ == "foreignkey":
            for fk in inspector.get_foreign_keys(table_name):
                fk_name = fk.get("name")
                fk_columns = tuple(fk.get("constrained_columns") or ())
                fk_referred = fk.get("referred_table")
                if not fk_name and dialect_name == "sqlite":
                    key = (table_name, fk_referred, fk_columns)
                    fk_name = _SQLITE_LEGACY_FKS.get(key)

                if fk_name == constraint_name or (
                    columns is not None
                    and fk_columns == columns
                    and (referred_table is None or fk_referred == referred_table)
                ):
                    with _with_batch(table_name) as batch_op:
                        batch_op.drop_constraint(fk_name or constraint_name, type_=type_)
                    return
        elif type_ == "unique":
            for constraint in _get_unique_constraints(table_name) or []:
                cols = tuple(constraint.get("column_names") or ())
                name = constraint.get("name")
                if name == constraint_name or cols == tuple(columns or ()):
                    with _with_batch(table_name) as batch_op:
                        batch_op.drop_constraint(name or constraint_name, type_=type_)
                    return
        elif type_ == "primary":
            pk = inspector.get_pk_constraint(table_name)
            if pk:
                name = pk.get("name") or constraint_name
                if name:
                    with _with_batch(table_name) as batch_op:
                        batch_op.drop_constraint(name, type_=type_)

    for table_name, columns, description in [
        ("experiments", ("name",), "experiments with the same name"),
        ("registered_models", ("name",), "registered models with the same name"),
        (
            "evaluation_datasets",
            ("name",),
            "evaluation datasets with the same name",
        ),
        (
            "model_versions",
            ("name", "version"),
            "model versions with the same model name and version",
        ),
        (
            "registered_model_tags",
            ("name", "key"),
            "registered model tags with the same model name and key",
        ),
        (
            "model_version_tags",
            ("name", "version", "key"),
            "model version tags with the same model name, version, and key",
        ),
        (
            "registered_model_aliases",
            ("name", "alias"),
            "registered model aliases with the same model name and alias",
        ),
    ]:
        _assert_no_workspace_conflicts(table_name, columns, description)

    for table, constraint, referred_table, cols in [
        (
            "model_version_tags",
            "fk_model_version_tags_model_versions",
            "model_versions",
            ("workspace", "name", "version"),
        ),
        (
            "registered_model_aliases",
            "fk_registered_model_aliases_registered_models",
            "registered_models",
            ("workspace", "name"),
        ),
        (
            "registered_model_tags",
            "fk_registered_model_tags_registered_models",
            "registered_models",
            ("workspace", "name"),
        ),
        (
            "model_versions",
            "fk_model_versions_registered_models",
            "registered_models",
            ("workspace", "name"),
        ),
    ]:
        _drop_constraint_if_exists(
            table,
            constraint,
            type_="foreignkey",
            referred_table=referred_table,
            columns=cols,
        )

    for table in [
        "registered_models",
        "model_versions",
        "registered_model_tags",
        "model_version_tags",
        "registered_model_aliases",
        "experiments",
        "evaluation_datasets",
        "webhooks",
    ]:
        _move_resources_to_default_workspace(table)

    _drop_constraint_if_exists(
        "experiments",
        "uq_experiments_workspace_name",
        type_="unique",
        columns=("workspace", "name"),
    )

    for table, constraint in [
        ("registered_model_aliases", "registered_model_alias_pk"),
        ("model_version_tags", "model_version_tag_pk"),
        ("registered_model_tags", "registered_model_tag_pk"),
        ("model_versions", "model_version_pk"),
        ("registered_models", "registered_model_pk"),
    ]:
        _drop_constraint_if_exists(table, constraint, type_="primary")

    op.drop_index(
        "idx_experiments_workspace_creation_time",
        table_name="experiments",
        if_exists=True,
    )
    op.drop_index(
        "idx_registered_models_workspace",
        table_name="registered_models",
        if_exists=True,
    )
    op.drop_index("idx_experiments_workspace", table_name="experiments", if_exists=True)
    op.drop_index(
        "idx_evaluation_datasets_workspace",
        table_name="evaluation_datasets",
        if_exists=True,
    )
    op.drop_index("idx_webhooks_workspace", table_name="webhooks", if_exists=True)

    if dialect_name == "mssql":
        for table in ["registered_models", "experiments"]:
            with _with_batch(table) as batch_op:
                batch_op.alter_column(
                    "workspace",
                    existing_type=sa.String(length=63),
                    server_default=None,
                )

    op.drop_column("webhooks", "workspace")
    op.drop_column("registered_model_aliases", "workspace")
    op.drop_column("model_version_tags", "workspace")
    op.drop_column("registered_model_tags", "workspace")
    op.drop_column("model_versions", "workspace")
    op.drop_column("registered_models", "workspace")
    op.drop_column("experiments", "workspace")
    op.drop_column("evaluation_datasets", "workspace")

    for table, constraint, columns in [
        ("registered_models", "registered_model_pk", ["name"]),
        ("model_versions", "model_version_pk", ["name", "version"]),
        ("registered_model_tags", "registered_model_tag_pk", ["key", "name"]),
        ("model_version_tags", "model_version_tag_pk", ["key", "name", "version"]),
        ("registered_model_aliases", "registered_model_alias_pk", ["name", "alias"]),
    ]:
        with _with_batch(table) as batch_op:
            batch_op.create_primary_key(constraint, columns)

    with _with_batch("model_versions") as batch_op:
        batch_op.create_foreign_key(
            "model_versions_name_fkey",
            "registered_models",
            ["name"],
            ["name"],
            onupdate="CASCADE",
        )
    with _with_batch("registered_model_tags") as batch_op:
        batch_op.create_foreign_key(
            "registered_model_tags_name_fkey",
            "registered_models",
            ["name"],
            ["name"],
            onupdate="CASCADE",
        )
    with _with_batch("registered_model_aliases") as batch_op:
        batch_op.create_foreign_key(
            "registered_model_alias_name_fkey",
            "registered_models",
            ["name"],
            ["name"],
            onupdate="CASCADE",
            ondelete="CASCADE",
        )
    with _with_batch("model_version_tags") as batch_op:
        batch_op.create_foreign_key(
            "model_version_tags_mv_fkey",
            "model_versions",
            ["name", "version"],
            ["name", "version"],
            onupdate="CASCADE",
        )

    op.drop_table("workspaces")

    with _with_batch("experiments") as batch_op:
        batch_op.create_unique_constraint("uq_experiments_name", ["name"])
