import type { RegisteredPrompt } from './types';
import { getModelConfigFromTags } from './utils';

export const getLatestPromptVersion = (prompt: RegisteredPrompt) =>
  prompt.latest_versions?.reduce(
    (latest, version) => (Number(version.version) > Number(latest.version) ? version : latest),
    prompt.latest_versions[0],
  );

export const getPromptAssociatedModel = (prompt: RegisteredPrompt): string | undefined => {
  const modelName = getModelConfigFromTags(getLatestPromptVersion(prompt)?.tags)?.model_name;
  return typeof modelName === 'string' && modelName !== '' ? modelName : undefined;
};
