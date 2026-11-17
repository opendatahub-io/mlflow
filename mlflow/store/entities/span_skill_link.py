from dataclasses import dataclass
from enum import Enum

from mlflow.exceptions import MlflowException
from mlflow.utils.validation import _validate_skill_version


class SkillLinkRole(str, Enum):
    ACTIVATION = "activation"
    USAGE = "usage"

    def __str__(self):
        return self.value


@dataclass(frozen=True)
class SpanSkillLink:
    """Immutable ingestion payload for a historical skill observation on a span.

    Attributes:
        span_id: ID of the span that observed the skill.
        skill_workspace: Workspace containing the observed skill.
        skill_name: Name of the observed skill.
        skill_version: Concrete positive integer version of the observed skill.
        skill_organization: Organization containing the skill, or an empty string when absent.
        role: ``SkillLinkRole`` member describing the observation. Defaults to activation.
    """

    span_id: str
    skill_workspace: str
    skill_name: str
    skill_version: int
    skill_organization: str = ""
    role: SkillLinkRole = SkillLinkRole.ACTIVATION


def _validate_string(name: str, value: object, max_length: int, allow_empty: bool = False) -> None:
    if not isinstance(value, str) or (not value and not allow_empty) or len(value) > max_length:
        raise MlflowException.invalid_parameter_value(
            f"{name} must be a {'possibly empty' if allow_empty else 'non-empty'} string "
            f"of at most {max_length} characters."
        )


def _validate_span_skill_links(trace_id: str, links: list[SpanSkillLink]) -> None:
    _validate_string("trace_id", trace_id, 50)
    if not isinstance(links, list) or any(not isinstance(link, SpanSkillLink) for link in links):
        raise MlflowException.invalid_parameter_value(
            "links must be a list of SpanSkillLink objects."
        )
    for link in links:
        _validate_string("span_id", link.span_id, 50)
        _validate_string("skill_workspace", link.skill_workspace, 63)
        _validate_string("skill_organization", link.skill_organization, 64, allow_empty=True)
        _validate_string("skill_name", link.skill_name, 128)
        _validate_skill_version(link.skill_version)
        if not isinstance(link.role, SkillLinkRole):
            allowed_roles = ", ".join(repr(role.value) for role in SkillLinkRole)
            raise MlflowException.invalid_parameter_value(
                f"role must be a SkillLinkRole member ({allowed_roles})."
            )
