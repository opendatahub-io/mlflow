/* eslint-disable import/no-nodejs-modules, import/no-extraneous-dependencies, no-sync */
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

interface RunData {
  name: string;
  metrics: Record<string, number>;
  params: Record<string, string>;
}

interface TraceData {
  input: string;
  output: string;
  sessionId?: string;
}

interface TestData {
  workspace: string;
  experimentLifecycle: {
    experimentName: string;
    runs: RunData[];
    modelName: string;
    modelDescription: string;
    aliases: { primary: string; secondary: string };
  };
  genaiObservability: {
    experimentName: string;
    experimentKindTag: string;
    experimentKindValue: string;
    sessionMetadataKey: string;
    traces: TraceData[];
    datasetName: string;
    tagKey: string;
    tagValue: string;
  };
  promptVersioning: {
    promptName: string;
    promptTemplate: string;
    promptTemplateV2: string;
  };
}

const yamlPath = path.join(__dirname, 'testData.yml');
const parsed = yaml.load(fs.readFileSync(yamlPath, 'utf8'));
if (
  !parsed ||
  typeof parsed !== 'object' ||
  !('workspace' in parsed) ||
  !('experimentLifecycle' in parsed) ||
  !('genaiObservability' in parsed) ||
  !('promptVersioning' in parsed)
) {
  throw new Error(`Invalid e2e fixture schema: ${yamlPath}`);
}
export const testData = parsed as TestData;
