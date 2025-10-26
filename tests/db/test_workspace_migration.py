import re

import pytest
import sqlalchemy as sa
from alembic import command

from mlflow.store.db.utils import _get_alembic_config
from mlflow.store.tracking.dbmodels.initial_models import Base as InitialBase

REVISION = "1b5f0d9ad7c1"
PREVIOUS_REVISION = "bf29a5ff90ea"


def _prepare_database(tmp_path):
    db_path = tmp_path / "workspace_migration.sqlite"
    url = f"sqlite:///{db_path}"
    engine = sa.create_engine(url)
    InitialBase.metadata.create_all(engine)
    config = _get_alembic_config(url)
    command.upgrade(config, PREVIOUS_REVISION)
    return engine, config


def _seed_pre_workspace_entities(conn):
    conn.execute(
        sa.text(
            """
            INSERT INTO experiments (
                experiment_id,
                name,
                artifact_location,
                lifecycle_stage,
                creation_time,
                last_update_time
            )
            VALUES (
                :experiment_id,
                :name,
                :artifact_location,
                :lifecycle_stage,
                :creation_time,
                :last_update_time
            )
            """
        ),
        {
            "experiment_id": 1,
            "name": "exp-default",
            "artifact_location": "path",
            "lifecycle_stage": "active",
            "creation_time": 0,
            "last_update_time": 0,
        },
    )
    conn.execute(
        sa.text(
            """
            INSERT INTO runs (
                run_uuid,
                name,
                source_type,
                source_name,
                entry_point_name,
                user_id,
                status,
                start_time,
                end_time,
                source_version,
                lifecycle_stage,
                artifact_uri,
                experiment_id
            )
            VALUES (
                :run_uuid,
                :name,
                :source_type,
                :source_name,
                :entry_point_name,
                :user_id,
                :status,
                :start_time,
                :end_time,
                :source_version,
                :lifecycle_stage,
                :artifact_uri,
                :experiment_id
            )
            """
        ),
        {
            "run_uuid": "run-default",
            "name": "upgrade-validation-run",
            "source_type": "LOCAL",
            "source_name": "script.py",
            "entry_point_name": "main",
            "user_id": "user",
            "status": "FINISHED",
            "start_time": 0,
            "end_time": 1,
            "source_version": "abc123",
            "lifecycle_stage": "active",
            "artifact_uri": "path/artifacts",
            "experiment_id": 1,
        },
    )
    conn.execute(
        sa.text(
            """
            INSERT INTO registered_models (name, creation_time, last_updated_time, description)
            VALUES (:name, :creation_time, :last_updated_time, :description)
            """
        ),
        {"name": "rm-default", "creation_time": 0, "last_updated_time": 0, "description": "desc"},
    )
    conn.execute(
        sa.text(
            """
            INSERT INTO model_versions (
                name,
                version,
                creation_time,
                last_updated_time,
                user_id,
                current_stage,
                description,
                source,
                run_id,
                status,
                status_message,
                run_link,
                storage_location
            )
            VALUES (
                :name,
                :version,
                :creation_time,
                :last_updated_time,
                :user_id,
                :current_stage,
                :description,
                :source,
                :run_id,
                :status,
                :status_message,
                :run_link,
                :storage_location
            )
            """
        ),
        {
            "name": "rm-default",
            "version": 1,
            "creation_time": 0,
            "last_updated_time": 0,
            "user_id": "user",
            "current_stage": "None",
            "description": "desc",
            "source": "source",
            "run_id": "run-id",
            "status": "READY",
            "status_message": "message",
            "run_link": "link",
            "storage_location": "location",
        },
    )
    conn.execute(
        sa.text(
            "INSERT INTO registered_model_tags (key, value, name) VALUES (:key, :value, :name)"
        ),
        {"key": "tag", "value": "value", "name": "rm-default"},
    )
    conn.execute(
        sa.text(
            """
            INSERT INTO model_version_tags (key, value, name, version)
            VALUES (:key, :value, :name, :version)
            """
        ),
        {"key": "tag", "value": "value", "name": "rm-default", "version": 1},
    )
    conn.execute(
        sa.text(
            """
            INSERT INTO registered_model_aliases (alias, version, name)
            VALUES (:alias, :version, :name)
            """
        ),
        {"alias": "alias", "version": 1, "name": "rm-default"},
    )
    conn.execute(
        sa.text(
            """
            INSERT INTO evaluation_datasets (
                dataset_id,
                name,
                schema,
                profile,
                digest,
                created_time,
                last_update_time,
                created_by,
                last_updated_by
            )
            VALUES (
                :dataset_id,
                :name,
                :schema,
                :profile,
                :digest,
                :created_time,
                :last_update_time,
                :created_by,
                :last_updated_by
            )
            """
        ),
        {
            "dataset_id": "ds-default",
            "name": "Dataset",
            "schema": "schema",
            "profile": "profile",
            "digest": "digest",
            "created_time": 0,
            "last_update_time": 0,
            "created_by": "user",
            "last_updated_by": "user",
        },
    )


def _get_workspace_default(column_info):
    default = column_info.get("default") or column_info.get("server_default")
    if default is None:
        return None
    return str(default).strip("'\"")


def _add_workspace(conn, name: str, description: str):
    conn.execute(
        sa.text("INSERT INTO workspaces (name, description) VALUES (:name, :description)"),
        {"name": name, "description": description},
    )


def _insert_experiment(
    conn,
    *,
    experiment_id: int,
    name: str,
    workspace: str,
    artifact_location: str = "path",
    lifecycle_stage: str = "active",
):
    conn.execute(
        sa.text(
            """
            INSERT INTO experiments (
                experiment_id,
                name,
                artifact_location,
                lifecycle_stage,
                creation_time,
                last_update_time,
                workspace
            )
            VALUES (
                :experiment_id,
                :name,
                :artifact_location,
                :lifecycle_stage,
                :creation_time,
                :last_update_time,
                :workspace
            )
            """
        ),
        {
            "experiment_id": experiment_id,
            "name": name,
            "artifact_location": artifact_location,
            "lifecycle_stage": lifecycle_stage,
            "creation_time": 0,
            "last_update_time": 0,
            "workspace": workspace,
        },
    )


def _insert_run(
    conn,
    *,
    run_uuid: str,
    experiment_id: int,
    name: str = "run",
    artifact_uri: str = "path/artifacts",
):
    conn.execute(
        sa.text(
            """
            INSERT INTO runs (
                run_uuid,
                name,
                source_type,
                source_name,
                entry_point_name,
                user_id,
                status,
                start_time,
                end_time,
                source_version,
                lifecycle_stage,
                artifact_uri,
                experiment_id
            )
            VALUES (
                :run_uuid,
                :name,
                :source_type,
                :source_name,
                :entry_point_name,
                :user_id,
                :status,
                :start_time,
                :end_time,
                :source_version,
                :lifecycle_stage,
                :artifact_uri,
                :experiment_id
            )
            """
        ),
        {
            "run_uuid": run_uuid,
            "name": name,
            "source_type": "LOCAL",
            "source_name": "script.py",
            "entry_point_name": "main",
            "user_id": "user",
            "status": "FINISHED",
            "start_time": 0,
            "end_time": 1,
            "source_version": "abc123",
            "lifecycle_stage": "active",
            "artifact_uri": artifact_uri,
            "experiment_id": experiment_id,
        },
    )


def _insert_registered_model(
    conn,
    *,
    name: str,
    workspace: str,
    description: str = "desc",
    creation_time: int = 0,
):
    conn.execute(
        sa.text(
            """
            INSERT INTO registered_models (
                name,
                creation_time,
                last_updated_time,
                description,
                workspace
            )
            VALUES (
                :name,
                :creation_time,
                :last_updated_time,
                :description,
                :workspace
            )
            """
        ),
        {
            "name": name,
            "creation_time": creation_time,
            "last_updated_time": creation_time,
            "description": description,
            "workspace": workspace,
        },
    )


def _insert_model_version(
    conn,
    *,
    name: str,
    version: int,
    workspace: str,
    run_id: str = "run-id",
    storage_location: str = "location",
):
    conn.execute(
        sa.text(
            """
            INSERT INTO model_versions (
                name,
                version,
                creation_time,
                last_updated_time,
                user_id,
                current_stage,
                description,
                source,
                run_id,
                status,
                status_message,
                run_link,
                storage_location,
                workspace
            )
            VALUES (
                :name,
                :version,
                :creation_time,
                :last_updated_time,
                :user_id,
                :current_stage,
                :description,
                :source,
                :run_id,
                :status,
                :status_message,
                :run_link,
                :storage_location,
                :workspace
            )
            """
        ),
        {
            "name": name,
            "version": version,
            "creation_time": 0,
            "last_updated_time": 0,
            "user_id": "user",
            "current_stage": "None",
            "description": "desc",
            "source": "source",
            "run_id": run_id,
            "status": "READY",
            "status_message": "message",
            "run_link": "link",
            "storage_location": storage_location,
            "workspace": workspace,
        },
    )


def _insert_registered_model_tag(
    conn,
    *,
    workspace: str,
    name: str,
    key: str,
    value: str = "value",
):
    conn.execute(
        sa.text(
            """
            INSERT INTO registered_model_tags (
                workspace,
                key,
                value,
                name
            )
            VALUES (:workspace, :key, :value, :name)
            """
        ),
        {"workspace": workspace, "key": key, "value": value, "name": name},
    )


def _insert_model_version_tag(
    conn,
    *,
    workspace: str,
    name: str,
    version: int,
    key: str,
    value: str = "value",
):
    conn.execute(
        sa.text(
            """
            INSERT INTO model_version_tags (
                workspace,
                key,
                value,
                name,
                version
            )
            VALUES (:workspace, :key, :value, :name, :version)
            """
        ),
        {"workspace": workspace, "key": key, "value": value, "name": name, "version": version},
    )


def _insert_registered_model_alias(
    conn,
    *,
    workspace: str,
    name: str,
    alias: str,
    version: int = 1,
):
    conn.execute(
        sa.text(
            """
            INSERT INTO registered_model_aliases (
                workspace,
                name,
                alias,
                version
            )
            VALUES (:workspace, :name, :alias, :version)
            """
        ),
        {"workspace": workspace, "name": name, "alias": alias, "version": version},
    )


def _insert_evaluation_dataset(
    conn,
    *,
    dataset_id: str,
    workspace: str,
    name: str = "Dataset",
    digest: str = "digest",
):
    conn.execute(
        sa.text(
            """
            INSERT INTO evaluation_datasets (
                dataset_id,
                name,
                schema,
                profile,
                digest,
                created_time,
                last_update_time,
                created_by,
                last_updated_by,
                workspace
            )
            VALUES (
                :dataset_id,
                :name,
                :schema,
                :profile,
                :digest,
                :created_time,
                :last_update_time,
                :created_by,
                :last_updated_by,
                :workspace
            )
            """
        ),
        {
            "dataset_id": dataset_id,
            "name": name,
            "schema": "schema",
            "profile": "profile",
            "digest": digest,
            "created_time": 0,
            "last_update_time": 0,
            "created_by": "user",
            "last_updated_by": "user",
            "workspace": workspace,
        },
    )


def _fetch_conflicts(conn, table_name: str, columns: tuple[str, ...]):
    metadata = sa.MetaData()
    table = sa.Table(table_name, metadata, autoload_with=conn)
    group_columns = [table.c[column] for column in columns]
    stmt = sa.select(*group_columns).group_by(*group_columns).having(sa.func.count() > 1)
    return conn.execute(stmt).fetchall()


def test_workspace_migration_upgrade_adds_columns_and_backfills(tmp_path):
    engine, config = _prepare_database(tmp_path)
    try:
        with engine.begin() as conn:
            _seed_pre_workspace_entities(conn)

        command.upgrade(config, REVISION)
        inspector = sa.inspect(engine)

        def assert_workspace_column(table_name, expected_default):
            columns = inspector.get_columns(table_name)
            workspace = next((col for col in columns if col["name"] == "workspace"), None)
            assert workspace is not None, f"{table_name} lacks workspace column"
            assert not workspace.get("nullable", False)
            default_value = _get_workspace_default(workspace)
            if expected_default is None:
                assert default_value is None
            else:
                assert default_value == expected_default

        assert_workspace_column("experiments", "default")
        assert_workspace_column("registered_models", "default")
        for table in (
            "model_versions",
            "registered_model_tags",
            "model_version_tags",
            "registered_model_aliases",
            "evaluation_datasets",
        ):
            assert_workspace_column(table, None)

        with engine.connect() as conn:
            assert conn.execute(
                sa.text(
                    "SELECT experiment_id, name, workspace FROM experiments ORDER BY experiment_id"
                )
            ).fetchall() == [(1, "exp-default", "default")]

            assert conn.execute(
                sa.text("SELECT run_uuid, experiment_id FROM runs ORDER BY run_uuid")
            ).fetchall() == [("run-default", 1)]

            assert conn.execute(
                sa.text("SELECT name, workspace FROM registered_models")
            ).fetchall() == [("rm-default", "default")]

            assert conn.execute(
                sa.text("SELECT name, version, workspace FROM model_versions")
            ).fetchall() == [("rm-default", 1, "default")]

            assert conn.execute(
                sa.text("SELECT workspace, name, key FROM registered_model_tags")
            ).fetchall() == [("default", "rm-default", "tag")]

            assert conn.execute(
                sa.text("SELECT workspace, name, version, key FROM model_version_tags")
            ).fetchall() == [("default", "rm-default", 1, "tag")]

            assert conn.execute(
                sa.text("SELECT workspace, name, alias FROM registered_model_aliases")
            ).fetchall() == [("default", "rm-default", "alias")]

            assert conn.execute(
                sa.text("SELECT dataset_id, workspace FROM evaluation_datasets")
            ).fetchall() == [("ds-default", "default")]

            assert conn.execute(
                sa.text("SELECT name, description FROM workspaces ORDER BY name")
            ).fetchall() == [("default", "Default workspace for legacy resources")]

        pk_registered_models = inspector.get_pk_constraint("registered_models")
        assert pk_registered_models["constrained_columns"] == ["workspace", "name"]

        pk_model_versions = inspector.get_pk_constraint("model_versions")
        assert pk_model_versions["constrained_columns"] == [
            "workspace",
            "name",
            "version",
        ]

        pk_registered_model_tags = inspector.get_pk_constraint("registered_model_tags")
        assert pk_registered_model_tags["constrained_columns"] == [
            "workspace",
            "key",
            "name",
        ]

        pk_model_version_tags = inspector.get_pk_constraint("model_version_tags")
        assert pk_model_version_tags["constrained_columns"] == [
            "workspace",
            "key",
            "name",
            "version",
        ]

        pk_model_aliases = inspector.get_pk_constraint("registered_model_aliases")
        assert pk_model_aliases["constrained_columns"] == [
            "workspace",
            "name",
            "alias",
        ]

        unique_experiments = inspector.get_unique_constraints("experiments")
        assert any(
            {"workspace", "name"} == set(constraint.get("column_names", []))
            for constraint in unique_experiments
        )

        fk_model_versions = inspector.get_foreign_keys("model_versions")
        assert any(
            fk.get("constrained_columns") == ["workspace", "name"]
            and fk.get("referred_table") == "registered_models"
            for fk in fk_model_versions
        )

        def has_index(table, index_name, columns):
            indexes = inspector.get_indexes(table)
            return any(
                index["name"] == index_name and index.get("column_names") == columns
                for index in indexes
            )

        assert has_index("experiments", "idx_experiments_workspace", ["workspace"])
        assert has_index(
            "experiments", "idx_experiments_workspace_creation_time", ["workspace", "creation_time"]
        )
        assert has_index("registered_models", "idx_registered_models_workspace", ["workspace"])
        assert has_index("evaluation_datasets", "idx_evaluation_datasets_workspace", ["workspace"])
    finally:
        engine.dispose()


def test_workspace_migration_downgrade_reverts_schema(tmp_path):
    engine, config = _prepare_database(tmp_path)
    try:
        command.upgrade(config, REVISION)
        with engine.begin() as conn:
            _add_workspace(conn, "team-a", "Team A")
            _insert_experiment(conn, experiment_id=1, name="exp-default", workspace="default")
            _insert_run(
                conn,
                run_uuid="run-default",
                experiment_id=1,
                name="downgrade-validation-run",
            )
            _insert_experiment(conn, experiment_id=2, name="exp-team-a", workspace="team-a")

        command.downgrade(config, PREVIOUS_REVISION)
        inspector = sa.inspect(engine)

        tables = inspector.get_table_names()
        assert "workspaces" not in tables

        for table in (
            "experiments",
            "registered_models",
            "model_versions",
            "registered_model_tags",
            "model_version_tags",
            "registered_model_aliases",
            "evaluation_datasets",
        ):
            column_names = {col["name"] for col in inspector.get_columns(table)}
            assert "workspace" not in column_names

        with engine.connect() as conn:
            assert conn.execute(
                sa.text("SELECT experiment_id, name FROM experiments ORDER BY experiment_id")
            ).fetchall() == [(1, "exp-default"), (2, "exp-team-a")]
            assert conn.execute(
                sa.text("SELECT run_uuid, experiment_id FROM runs ORDER BY run_uuid")
            ).fetchall() == [("run-default", 1)]

        pk_registered_models = inspector.get_pk_constraint("registered_models")
        assert pk_registered_models["constrained_columns"] == ["name"]

        pk_model_versions = inspector.get_pk_constraint("model_versions")
        assert pk_model_versions["constrained_columns"] == ["name", "version"]

        pk_registered_model_tags = inspector.get_pk_constraint("registered_model_tags")
        assert pk_registered_model_tags["constrained_columns"] == ["key", "name"]

        pk_model_version_tags = inspector.get_pk_constraint("model_version_tags")
        assert pk_model_version_tags["constrained_columns"] == ["key", "name", "version"]

        pk_registered_model_aliases = inspector.get_pk_constraint("registered_model_aliases")
        assert pk_registered_model_aliases["constrained_columns"] == ["name", "alias"]

        unique_experiments = inspector.get_unique_constraints("experiments")
        assert any(
            set(constraint.get("column_names", [])) == {"name"} for constraint in unique_experiments
        )

        fk_model_versions = inspector.get_foreign_keys("model_versions")
        assert any(
            fk.get("constrained_columns") == ["name"]
            and fk.get("referred_table") == "registered_models"
            for fk in fk_model_versions
        )

        fk_registered_model_tags = inspector.get_foreign_keys("registered_model_tags")
        assert any(
            fk.get("constrained_columns") == ["name"]
            and fk.get("referred_table") == "registered_models"
            for fk in fk_registered_model_tags
        )

        fk_model_version_tags = inspector.get_foreign_keys("model_version_tags")
        assert any(
            fk.get("constrained_columns") == ["name", "version"]
            and fk.get("referred_table") == "model_versions"
            for fk in fk_model_version_tags
        )
    finally:
        engine.dispose()


def _setup_experiment_conflict(conn):
    _insert_experiment(conn, experiment_id=1, name="duplicate-exp", workspace="default")
    _insert_run(conn, run_uuid="run-exp-default", experiment_id=1)
    _insert_experiment(conn, experiment_id=2, name="duplicate-exp", workspace="team-a")


def _setup_registered_model_conflict(conn):
    _insert_registered_model(conn, name="duplicate-model", workspace="default")
    _insert_registered_model(conn, name="duplicate-model", workspace="team-a")


def _setup_model_version_conflict(conn):
    _insert_registered_model(conn, name="mv-model", workspace="default")
    _insert_registered_model(conn, name="mv-model", workspace="team-a")
    _insert_model_version(conn, name="mv-model", version=1, workspace="default")
    _insert_model_version(conn, name="mv-model", version=1, workspace="team-a")


def _setup_registered_model_tag_conflict(conn):
    _insert_registered_model(conn, name="tag-model", workspace="default")
    _insert_registered_model(conn, name="tag-model", workspace="team-a")
    _insert_registered_model_tag(conn, workspace="default", name="tag-model", key="tag-key")
    _insert_registered_model_tag(conn, workspace="team-a", name="tag-model", key="tag-key")


def _setup_model_version_tag_conflict(conn):
    _insert_registered_model(conn, name="mvt-model", workspace="default")
    _insert_registered_model(conn, name="mvt-model", workspace="team-a")
    _insert_model_version(conn, name="mvt-model", version=1, workspace="default")
    _insert_model_version(conn, name="mvt-model", version=1, workspace="team-a")
    _insert_model_version_tag(
        conn, workspace="default", name="mvt-model", version=1, key="mv-tag-key"
    )
    _insert_model_version_tag(
        conn, workspace="team-a", name="mvt-model", version=1, key="mv-tag-key"
    )


def _setup_registered_model_alias_conflict(conn):
    _insert_registered_model(conn, name="alias-model", workspace="default")
    _insert_registered_model(conn, name="alias-model", workspace="team-a")
    _insert_registered_model_alias(conn, workspace="default", name="alias-model", alias="latest")
    _insert_registered_model_alias(conn, workspace="team-a", name="alias-model", alias="latest")


def _setup_evaluation_dataset_conflict(conn):
    _insert_evaluation_dataset(
        conn, dataset_id="ds-default", name="duplicate-ds", workspace="default"
    )
    _insert_evaluation_dataset(
        conn, dataset_id="ds-team-a", name="duplicate-ds", workspace="team-a"
    )


@pytest.mark.parametrize(
    ("setup_conflict", "expected_fragment", "case_slug"),
    [
        (_setup_experiment_conflict, "duplicate experiments with the same name", "experiments"),
        (
            _setup_registered_model_conflict,
            "duplicate registered models with the same name",
            "models",
        ),
        (
            _setup_evaluation_dataset_conflict,
            "duplicate evaluation datasets with the same name",
            "evaluation_datasets",
        ),
    ],
)
def test_workspace_migration_downgrade_detects_conflicts(
    tmp_path, setup_conflict, expected_fragment, case_slug
):
    case_dir = tmp_path / f"conflict_{case_slug}"
    case_dir.mkdir()
    engine, config = _prepare_database(case_dir)
    try:
        command.upgrade(config, REVISION)
        with engine.begin() as conn:
            _add_workspace(conn, "team-a", "Team A")
            setup_conflict(conn)

        with pytest.raises(
            RuntimeError,
            match=re.escape(expected_fragment),
        ):
            command.downgrade(config, PREVIOUS_REVISION)
    finally:
        engine.dispose()


@pytest.mark.parametrize(
    ("setup_conflict", "table_name", "columns", "case_slug"),
    [
        (
            _setup_model_version_conflict,
            "model_versions",
            ("name", "version"),
            "model_versions",
        ),
        (
            _setup_registered_model_tag_conflict,
            "registered_model_tags",
            ("name", "key"),
            "registered_model_tags",
        ),
        (
            _setup_model_version_tag_conflict,
            "model_version_tags",
            ("name", "version", "key"),
            "model_version_tags",
        ),
        (
            _setup_registered_model_alias_conflict,
            "registered_model_aliases",
            ("name", "alias"),
            "registered_model_aliases",
        ),
    ],
)
def test_workspace_migration_conflict_detection_queries(
    tmp_path, setup_conflict, table_name, columns, case_slug
):
    case_dir = tmp_path / f"conflict_query_{case_slug}"
    case_dir.mkdir()
    engine, config = _prepare_database(case_dir)
    try:
        command.upgrade(config, REVISION)
        with engine.begin() as conn:
            _add_workspace(conn, "team-a", "Team A")
            setup_conflict(conn)
            conflicts = _fetch_conflicts(conn, table_name, columns)
            assert conflicts, f"Expected conflicts for {table_name}, found none"
    finally:
        engine.dispose()
