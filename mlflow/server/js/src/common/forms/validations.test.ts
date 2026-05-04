import { test, jest, expect, describe, afterEach } from '@jest/globals';
import { getExperimentNameValidator, modelNameValidator } from './validations';
import { MlflowService } from '../../experiment-tracking/sdk/MlflowService';
import { Services as ModelRegistryService } from '../../model-registry/services';

describe('ExperimentNameValidator', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('rejects name that exists in the cached list', () => {
    const experimentNames = ['Default', 'Test Experiment'];
    const value = experimentNames[0];
    const experimentNameValidator = getExperimentNameValidator(() => experimentNames);

    const mockCallback = jest.fn((err) => err);

    experimentNameValidator(undefined, value, mockCallback);
    expect(mockCallback).toHaveBeenCalledWith(`Experiment "${value}" already exists.`);
  });

  test('accepts empty and undefined values without error', () => {
    const experimentNameValidator = getExperimentNameValidator(() => ['Default']);
    const mockCallback = jest.fn((err) => err);

    experimentNameValidator(undefined, '', mockCallback);
    expect(mockCallback).toHaveBeenCalledWith(undefined);

    experimentNameValidator(undefined, undefined, mockCallback);
    expect(mockCallback).toHaveBeenCalledWith(undefined);
  });

  test('reports "already exists" when server returns an active experiment', async () => {
    jest
      .spyOn(MlflowService, 'getExperimentByName')
      .mockImplementation(() => Promise.resolve({ experiment: { lifecycleStage: 'active' } } as any));
    const experimentNameValidator = getExperimentNameValidator(() => []);
    const mockCallback = jest.fn();
    experimentNameValidator(undefined, 'my-experiment', mockCallback);
    await new Promise((resolve) => setTimeout(resolve));
    expect(mockCallback).toHaveBeenCalledWith('Experiment "my-experiment" already exists.');
  });

  test('reports "already exists in deleted state" when server returns a deleted experiment', async () => {
    jest
      .spyOn(MlflowService, 'getExperimentByName')
      .mockImplementation(() => Promise.resolve({ experiment: { lifecycleStage: 'deleted' } } as any));
    const experimentNameValidator = getExperimentNameValidator(() => []);
    const mockCallback = jest.fn();
    experimentNameValidator(undefined, 'my-experiment', mockCallback);
    await new Promise((resolve) => setTimeout(resolve));
    expect(mockCallback).toHaveBeenCalledWith(expect.stringContaining('already exists in deleted state'));
  });

  test('accepts name when server returns not-found (rejected promise)', async () => {
    jest
      .spyOn(MlflowService, 'getExperimentByName')
      .mockImplementation(() => Promise.reject(new Error('RESOURCE_DOES_NOT_EXIST')));
    const experimentNameValidator = getExperimentNameValidator(() => []);
    const mockCallback = jest.fn();
    experimentNameValidator(undefined, 'new-experiment', mockCallback);
    await new Promise((resolve) => setTimeout(resolve));
    expect(mockCallback).toHaveBeenCalledWith(undefined);
  });
});

describe('modelNameValidator should work properly', () => {
  test('should invoke callback with undefined for empty name', () => {
    const mockCallback = jest.fn((err) => err);
    modelNameValidator(undefined, '', mockCallback);
    expect(mockCallback).toHaveBeenCalledWith(undefined);
  });

  test('should invoke callback with undefined for undefined name', () => {
    const mockCallback = jest.fn((err) => err);
    modelNameValidator(undefined, undefined, mockCallback);
    expect(mockCallback).toHaveBeenCalledWith(undefined);
  });

  test('should invoke callback with error message when model exists', async () => {
    // getRegisteredModel returns resolved promise indicates model exists
    ModelRegistryService.getRegisteredModel = jest.fn(() => Promise.resolve());
    const mockCallback = jest.fn((err) => err);
    const modelName = 'model A';
    modelNameValidator(undefined, modelName, mockCallback);
    // Wait for all microtasks (promise .then()/.catch() handlers) to complete
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockCallback).toHaveBeenCalledWith(`Model "${modelName}" already exists.`);
  });

  test('should invoke callback with undefined when model does not exist', async () => {
    // getRegisteredModel returns rejected promise indicates model does not exist
    ModelRegistryService.getRegisteredModel = jest.fn(() => Promise.reject());
    const mockCallback = jest.fn((err) => err);
    const modelName = 'model A';
    modelNameValidator(undefined, modelName, mockCallback);
    // Wait for all microtasks (promise .then()/.catch() handlers) to complete
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockCallback).toHaveBeenCalledWith(undefined);
  });
});
