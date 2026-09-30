import { describe, expect, it } from '@jest/globals';
import type { RegisteredPrompt } from './types';
import { PROMPT_MODEL_CONFIG_TAG_KEY } from './utils';
import { getPromptAssociatedModel } from './promptModelConfig';

const version = (versionNumber: number, stage: string, modelName: unknown) => ({
  version: String(versionNumber),
  current_stage: stage,
  tags: [{ key: PROMPT_MODEL_CONFIG_TAG_KEY, value: JSON.stringify({ model_name: modelName }) }],
});

describe('getPromptAssociatedModel', () => {
  it.each([
    ['newest first', [version(2, 'None', 'claude-3'), version(1, 'Production', 'gpt-4o')]],
    ['newest last', [version(1, 'Production', 'gpt-4o'), version(2, 'None', 'claude-3')]],
  ])('picks the highest version when they arrive %s', (_label, latest_versions) => {
    expect(getPromptAssociatedModel({ latest_versions } as RegisteredPrompt)).toBe('claude-3');
  });

  it('returns undefined when the prompt has no versions', () => {
    expect(getPromptAssociatedModel({ latest_versions: [] } as unknown as RegisteredPrompt)).toBeUndefined();
  });

  it.each([
    ['an object', {}],
    ['a number', 7],
    ['null', null],
    ['an empty string', ''],
  ])('returns undefined when model_name is %s', (_label, modelName) => {
    const prompt = { latest_versions: [version(1, 'None', modelName)] } as RegisteredPrompt;
    expect(getPromptAssociatedModel(prompt)).toBeUndefined();
  });
});
