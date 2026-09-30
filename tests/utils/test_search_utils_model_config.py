import json
import re

import pytest

from mlflow.entities.model_registry import ModelVersion, ModelVersionTag, RegisteredModel
from mlflow.exceptions import MlflowException
from mlflow.prompt.constants import PROMPT_MODEL_CONFIG_TAG_KEY
from mlflow.utils.search_utils import SearchModelUtils


@pytest.mark.parametrize(
    ("filter_string", "expected"),
    [
        (
            "model_config.model_name = 'gpt-4o'",
            {"type": "model_config", "key": "model_name", "comparator": "=", "value": "gpt-4o"},
        ),
        (
            "model_config.provider != 'openai'",
            {"type": "model_config", "key": "provider", "comparator": "!=", "value": "openai"},
        ),
        (
            "model_config.model_name ILIKE '%gpt%'",
            {"type": "model_config", "key": "model_name", "comparator": "ILIKE", "value": "%gpt%"},
        ),
    ],
)
def test_parse_search_filter_model_config(filter_string, expected):
    assert SearchModelUtils.parse_search_filter(filter_string) == [expected]


def test_parse_search_filter_model_config_invalid_key():
    with pytest.raises(MlflowException, match=re.escape("Invalid model config key 'temperature'")):
        SearchModelUtils.parse_search_filter("model_config.temperature = '0.2'")


def test_parse_search_filter_invalid_entity_type():
    with pytest.raises(MlflowException, match=re.escape("Invalid entity type 'latest_versions'")):
        SearchModelUtils.parse_search_filter("latest_versions.tags.foo = 'x'")


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        (None, None),
        ("", None),
        ("not json", None),
        ("[]", None),  # valid JSON, but not an object
        (json.dumps({"model_name": "gpt-4o"}), {"model_name": "gpt-4o"}),
    ],
)
def test_parse_model_config(raw, expected):
    assert SearchModelUtils.parse_model_config(raw) == expected


@pytest.mark.parametrize(
    ("config", "key", "expected"),
    [
        (None, "model_name", None),
        ({}, "model_name", None),
        ({"model_name": "gpt-4o"}, "model_name", "gpt-4o"),
        ({"model_name": "gpt-4o"}, "provider", None),
        ({"model_name": {"nested": True}}, "model_name", None),  # non-string value
    ],
)
def test_get_model_config_field(config, key, expected):
    assert SearchModelUtils.get_model_config_field(config, key) == expected


@pytest.mark.parametrize(
    ("raw", "filters", "expected"),
    [
        (json.dumps({"model_name": "gpt-4o"}), [("model_name", "=", "gpt-4o")], True),
        (json.dumps({"model_name": "gpt-4o"}), [("model_name", "=", "gpt-4o-mini")], False),
        (json.dumps({"model_name": "gpt-4o"}), [("model_name", "!=", "gpt-4o-mini")], True),
        (
            json.dumps({"model_name": "gpt-4o", "provider": "openai"}),
            [("model_name", "=", "gpt-4o"), ("provider", "=", "openai")],
            True,
        ),
        (
            json.dumps({"model_name": "gpt-4o", "provider": "anthropic"}),
            [("model_name", "=", "gpt-4o"), ("provider", "=", "openai")],
            False,
        ),
        (None, [("model_name", "=", "gpt-4o")], False),
        ("not json", [("model_name", "=", "gpt-4o")], False),
        (json.dumps({"model_name": "gpt-4o"}), [], True),
        ('{"model_name":"gpt-4o"}', [("model_name", "=", "gpt-4o")], True),
        (json.dumps({"provider": "openai"}), [("model_name", "=", "gpt-4o")], False),
        (json.dumps({"provider": "openai"}), [("model_name", "!=", "gpt-4o")], False),
        (json.dumps({"provider": "openai"}), [("model_name", "LIKE", "gpt%")], False),
    ],
)
def test_model_config_matches(raw, filters, expected):
    assert SearchModelUtils.model_config_matches(raw, filters) == expected


@pytest.mark.parametrize("reverse", [False, True])
def test_filter_model_config_uses_highest_version(reverse):
    versions = [
        ModelVersion(
            name="p",
            version=str(version),
            creation_timestamp=0,
            current_stage=stage,
            tags=[
                ModelVersionTag(
                    key=PROMPT_MODEL_CONFIG_TAG_KEY, value=json.dumps({"model_name": model_name})
                )
            ],
        )
        for version, stage, model_name in [(1, "Production", "gpt-4o"), (2, "None", "claude-3")]
    ]
    model = RegisteredModel(
        name="p", latest_versions=list(reversed(versions)) if reverse else versions
    )

    matched = SearchModelUtils.filter([model], "model_config.model_name = 'claude-3'")
    assert [m.name for m in matched] == ["p"]
    assert SearchModelUtils.filter([model], "model_config.model_name = 'gpt-4o'") == []


@pytest.mark.parametrize(
    ("filter_string", "expected_value"),
    [
        ("model_config.model_name = 'gpt-4o'", "gpt-4o"),
        # A single-quoted literal escapes an apostrophe by doubling it.
        ("model_config.model_name = 'O''Reilly'", "O'Reilly"),
        ("model_config.model_name = 'say ''hi'' \"x\"'", "say 'hi' \"x\""),
        # A double-quoted literal has no escape sequence, so its apostrophes are literal.
        ('model_config.model_name = "O\'Reilly"', "O'Reilly"),
        ("model_config.model_name = \"O''Reilly\"", "O''Reilly"),
    ],
)
def test_parse_search_filter_model_config_unescapes_only_single_quoted_values(
    filter_string, expected_value
):
    (parsed,) = SearchModelUtils.parse_search_filter(filter_string)
    assert parsed["value"] == expected_value
    assert SearchModelUtils.model_config_matches(
        json.dumps({"model_name": expected_value}),
        [(parsed["key"], parsed["comparator"], parsed["value"])],
    )
