import json

import pytest

from mlflow.entities.model_registry import ModelVersionTag, RegisteredModelTag
from mlflow.entities.model_registry.prompt_version import IS_PROMPT_TAG_KEY
from mlflow.exceptions import MlflowException
from mlflow.prompt.constants import PROMPT_MODEL_CONFIG_TAG_KEY

from tests.store.model_registry.test_sqlalchemy_store import (  # noqa: F401
    store,
    workspaces_enabled,
)

pytestmark = pytest.mark.notrackingurimock


def test_search_registered_models_by_model_config(store):
    store.create_registered_model(
        "prompt_gpt", tags=[RegisteredModelTag(key=IS_PROMPT_TAG_KEY, value="true")]
    )
    store.create_model_version(
        "prompt_gpt",
        "1",
        "dummy_source",
        tags=[
            ModelVersionTag(key=IS_PROMPT_TAG_KEY, value="true"),
            ModelVersionTag(
                key=PROMPT_MODEL_CONFIG_TAG_KEY,
                value=json.dumps({"provider": "openai", "model_name": "gpt-4o"}),
            ),
        ],
    )

    store.create_registered_model(
        "prompt_claude", tags=[RegisteredModelTag(key=IS_PROMPT_TAG_KEY, value="true")]
    )
    store.create_model_version(
        "prompt_claude",
        "1",
        "dummy_source",
        tags=[
            ModelVersionTag(key=IS_PROMPT_TAG_KEY, value="true"),
            ModelVersionTag(
                key=PROMPT_MODEL_CONFIG_TAG_KEY,
                value='{"provider":"anthropic","model_name":"claude-3"}',
            ),
        ],
    )

    store.create_registered_model(
        "prompt_no_config", tags=[RegisteredModelTag(key=IS_PROMPT_TAG_KEY, value="true")]
    )
    store.create_model_version(
        "prompt_no_config",
        "1",
        "dummy_source",
        tags=[ModelVersionTag(key=IS_PROMPT_TAG_KEY, value="true")],
    )

    prompt_filter = "tags.`mlflow.prompt.is_prompt` = 'true'"

    rms = store.search_registered_models(
        filter_string=f"{prompt_filter} AND model_config.model_name = 'gpt-4o'", max_results=10
    )
    assert {rm.name for rm in rms} == {"prompt_gpt"}

    rms = store.search_registered_models(
        filter_string=f"{prompt_filter} AND model_config.model_name = 'claude-3'", max_results=10
    )
    assert {rm.name for rm in rms} == {"prompt_claude"}

    rms = store.search_registered_models(
        filter_string=f"{prompt_filter} AND model_config.model_name = 'gpt-4'", max_results=10
    )
    assert rms == []

    rms = store.search_registered_models(
        filter_string=f"{prompt_filter} AND model_config.provider = 'openai'", max_results=10
    )
    assert {rm.name for rm in rms} == {"prompt_gpt"}

    rms = store.search_registered_models(
        filter_string=f"{prompt_filter} AND model_config.model_name != 'gpt-4o'", max_results=10
    )
    assert {rm.name for rm in rms} == {"prompt_claude"}

    rms = store.search_registered_models(
        filter_string=(
            f"{prompt_filter} AND model_config.provider = 'openai' AND name = 'prompt_gpt'"
        ),
        max_results=10,
    )
    assert {rm.name for rm in rms} == {"prompt_gpt"}

    rms = store.search_registered_models(
        filter_string=f"{prompt_filter} AND model_config.model_name LIKE 'gpt%'", max_results=10
    )
    assert {rm.name for rm in rms} == {"prompt_gpt"}

    rms = store.search_registered_models(
        filter_string=f"{prompt_filter} AND model_config.model_name ILIKE 'CLAUDE%'",
        max_results=10,
    )
    assert {rm.name for rm in rms} == {"prompt_claude"}

    with pytest.raises(MlflowException, match="Invalid comparator for model config"):
        store.search_registered_models(
            filter_string=f"{prompt_filter} AND model_config.model_name > 'gpt-4o'",
            max_results=10,
        )


def test_search_registered_models_by_model_config_excludes_deleted_latest_version(store):
    store.create_registered_model(
        "my_prompt", tags=[RegisteredModelTag(key=IS_PROMPT_TAG_KEY, value="true")]
    )
    store.create_model_version(
        "my_prompt",
        "1",
        "dummy_source",
        tags=[
            ModelVersionTag(key=IS_PROMPT_TAG_KEY, value="true"),
            ModelVersionTag(
                key=PROMPT_MODEL_CONFIG_TAG_KEY, value=json.dumps({"model_name": "gpt-4o"})
            ),
        ],
    )
    store.create_model_version(
        "my_prompt",
        "2",
        "dummy_source",
        tags=[
            ModelVersionTag(key=IS_PROMPT_TAG_KEY, value="true"),
            ModelVersionTag(
                key=PROMPT_MODEL_CONFIG_TAG_KEY, value=json.dumps({"model_name": "claude-3"})
            ),
        ],
    )

    prompt_filter = "tags.`mlflow.prompt.is_prompt` = 'true'"
    rms = store.search_registered_models(
        filter_string=f"{prompt_filter} AND model_config.model_name = 'claude-3'", max_results=10
    )
    assert {rm.name for rm in rms} == {"my_prompt"}

    store.delete_model_version("my_prompt", "2")

    rms = store.search_registered_models(
        filter_string=f"{prompt_filter} AND model_config.model_name = 'claude-3'", max_results=10
    )
    assert rms == []

    rms = store.search_registered_models(
        filter_string=f"{prompt_filter} AND model_config.model_name = 'gpt-4o'", max_results=10
    )
    assert {rm.name for rm in rms} == {"my_prompt"}


def test_search_registered_models_by_model_config_ignores_older_versions_config(store):
    store.create_registered_model(
        "my_prompt", tags=[RegisteredModelTag(key=IS_PROMPT_TAG_KEY, value="true")]
    )
    store.create_model_version(
        "my_prompt",
        "1",
        "dummy_source",
        tags=[
            ModelVersionTag(key=IS_PROMPT_TAG_KEY, value="true"),
            ModelVersionTag(
                key=PROMPT_MODEL_CONFIG_TAG_KEY, value=json.dumps({"model_name": "gpt-4o"})
            ),
        ],
    )
    store.create_model_version(
        "my_prompt",
        "2",
        "dummy_source",
        tags=[ModelVersionTag(key=IS_PROMPT_TAG_KEY, value="true")],
    )

    prompt_filter = "tags.`mlflow.prompt.is_prompt` = 'true'"
    rms = store.search_registered_models(
        filter_string=f"{prompt_filter} AND model_config.model_name = 'gpt-4o'", max_results=10
    )
    assert rms == []
