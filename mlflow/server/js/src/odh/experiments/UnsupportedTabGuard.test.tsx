import { jest, describe, test, expect } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from '../../common/utils/RoutingUtils';
import { WorkflowType, WorkflowTypeProvider } from '../../common/contexts/WorkflowTypeContext';
import { UnsupportedTabGuard } from './UnsupportedTabGuard';
import type { UnsupportedTabInfo } from './UnsupportedTabGuard';

// Route paths are resolved at module load, so federated mode must be set before RoutingUtils is first required
jest.mock('../../common/utils/RoutingUtils', () => {
  process.env['DEPLOYMENT_MODE'] = 'federated';
  return jest.requireActual<typeof import('../../common/utils/RoutingUtils')>('../../common/utils/RoutingUtils');
});

const LocationDisplay = () => {
  const { pathname, search } = useLocation();
  return <span data-testid="location">{`${pathname}${search}`}</span>;
};

const renderedPaths: string[] = [];

const PageContent = () => {
  const { pathname } = useLocation();
  renderedPaths.push(pathname);
  return <span data-testid="page-content" />;
};

const renderGuard = (
  initialEntry: string,
  workflowType: WorkflowType,
  onUnsupportedTab?: (info: UnsupportedTabInfo) => void,
) => {
  renderedPaths.length = 0;
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <UnsupportedTabGuard workflowType={workflowType} onUnsupportedTab={onUnsupportedTab}>
        <PageContent />
      </UnsupportedTabGuard>
      <LocationDisplay />
    </MemoryRouter>,
  );
};

describe('UnsupportedTabGuard', () => {
  test('uses the workflowType prop, not the workflow type context', () => {
    render(
      <MemoryRouter initialEntries={['/123/chat-sessions?workflowType=machine_learning']}>
        <WorkflowTypeProvider>
          <UnsupportedTabGuard workflowType={WorkflowType.GENAI} />
          <LocationDisplay />
        </WorkflowTypeProvider>
      </MemoryRouter>,
    );

    expect(screen.getByTestId('location')).toHaveTextContent(/^\/123\/chat-sessions\?workflowType=genai$/);
  });

  test('reports a GenAI-only tab under machine_learning with the relative path and search', () => {
    const onUnsupportedTab = jest.fn();
    renderGuard('/123/chat-sessions?workspace=a-test-project', WorkflowType.MACHINE_LEARNING, onUnsupportedTab);

    expect(onUnsupportedTab).toHaveBeenCalledTimes(1);
    expect(onUnsupportedTab).toHaveBeenCalledWith({
      experimentId: '123',
      tabName: 'chat-sessions',
      relativePath: '/123/chat-sessions',
      search: '?workspace=a-test-project',
      workflowType: WorkflowType.MACHINE_LEARNING,
    });
    expect(screen.getByTestId('location')).toHaveTextContent('/123/chat-sessions?workspace=a-test-project');
  });

  test.each([
    '/123/overview',
    '/123/overview/usage',
    '/123/chat-sessions',
    '/123/review-queue',
    '/123/datasets',
    '/123/evaluation-runs',
    '/123/prompts',
    '/123/prompts/my-prompt',
    '/123/playground',
    '/123/judges',
  ])('reports %s under machine_learning', (path) => {
    const onUnsupportedTab = jest.fn();
    renderGuard(path, WorkflowType.MACHINE_LEARNING, onUnsupportedTab);

    expect(onUnsupportedTab).toHaveBeenCalledWith(expect.objectContaining({ experimentId: '123', relativePath: path }));
  });

  test('reports a single chat session URL under machine_learning', () => {
    const onUnsupportedTab = jest.fn();
    renderGuard('/123/chat-sessions/session-1', WorkflowType.MACHINE_LEARNING, onUnsupportedTab);

    expect(onUnsupportedTab).toHaveBeenCalledWith(
      expect.objectContaining({ experimentId: '123', relativePath: '/123/chat-sessions/session-1' }),
    );
  });

  test('falls back to Runs under machine_learning when no callback is provided', () => {
    renderGuard('/123/chat-sessions?workspace=a-test-project&selectedTraceId=abc', WorkflowType.MACHINE_LEARNING);

    expect(screen.getByTestId('location')).toHaveTextContent(/^\/123\/runs\?workspace=a-test-project$/);
    expect(screen.getByTestId('page-content')).toBeInTheDocument();
    expect(renderedPaths).not.toContain('/123/chat-sessions');
  });

  test.each([
    ['/123/traces', WorkflowType.MACHINE_LEARNING],
    ['/123/models', WorkflowType.MACHINE_LEARNING],
    ['/123/runs', WorkflowType.MACHINE_LEARNING],
    ['/123/traces', WorkflowType.GENAI],
    ['/123/models', WorkflowType.GENAI],
    ['/123/runs', WorkflowType.GENAI],
    ['/123/chat-sessions', WorkflowType.GENAI],
    ['/123/chat-sessions/session-1', WorkflowType.GENAI],
  ])('does not treat %s under %s as unsupported', (path, workflowType) => {
    const onUnsupportedTab = jest.fn();
    renderGuard(path, workflowType, onUnsupportedTab);

    expect(onUnsupportedTab).not.toHaveBeenCalled();
    expect(screen.getByTestId('location')).toHaveTextContent(path);
    expect(screen.getByTestId('page-content')).toBeInTheDocument();
  });

  test('ignores routes outside the experiment tabs', () => {
    const onUnsupportedTab = jest.fn();
    renderGuard('/123/runs/abc/overview', WorkflowType.MACHINE_LEARNING, onUnsupportedTab);

    expect(onUnsupportedTab).not.toHaveBeenCalled();
  });

  test.each([
    ['/prompts', undefined, WorkflowType.MACHINE_LEARNING],
    ['/prompts/my-prompt', 'my-prompt', WorkflowType.MACHINE_LEARNING],
    ['/prompts/chat-sessions', 'chat-sessions', WorkflowType.MACHINE_LEARNING],
    ['/prompts/overview', 'overview', WorkflowType.MACHINE_LEARNING],
    ['/prompts/datasets', 'datasets', WorkflowType.MACHINE_LEARNING],
    ['/prompts/runs', 'runs', WorkflowType.MACHINE_LEARNING],
    ['/prompts/traces', 'traces', WorkflowType.MACHINE_LEARNING],
    ['/prompts/models', 'models', WorkflowType.MACHINE_LEARNING],
    ['/prompts/prompts', 'prompts', WorkflowType.MACHINE_LEARNING],
    ['/prompts', undefined, WorkflowType.GENAI],
    ['/prompts/my-prompt', 'my-prompt', WorkflowType.GENAI],
    ['/prompts/runs', 'runs', WorkflowType.GENAI],
    ['/prompts/chat-sessions', 'chat-sessions', WorkflowType.GENAI],
  ])('reports top-level %s as prompts under %s', (path, promptName, workflowType) => {
    const onUnsupportedTab = jest.fn();
    renderGuard(`${path}?workspace=a-test-project`, workflowType, onUnsupportedTab);

    expect(onUnsupportedTab).toHaveBeenCalledTimes(1);
    expect(onUnsupportedTab).toHaveBeenCalledWith({
      tabName: 'prompts',
      ...(promptName && { promptName }),
      relativePath: path,
      search: '?workspace=a-test-project',
      workflowType,
    });
  });

  test('leaves top-level prompt pages in place when no callback is provided', () => {
    renderGuard('/prompts/my-prompt', WorkflowType.MACHINE_LEARNING);

    expect(screen.getByTestId('location')).toHaveTextContent(/^\/prompts\/my-prompt$/);
    expect(screen.getByTestId('page-content')).toBeInTheDocument();
  });

  test('does not render the page while the host handles an unsupported tab', () => {
    renderGuard('/123/chat-sessions', WorkflowType.MACHINE_LEARNING, jest.fn());

    expect(screen.queryByTestId('page-content')).not.toBeInTheDocument();
    expect(renderedPaths).toEqual([]);
  });

  test.each(['/compare-experiments/judges', '/runs/datasets'])(
    'ignores %s, whose first segment is not an experiment ID',
    (path) => {
      const onUnsupportedTab = jest.fn();
      renderGuard(path, WorkflowType.MACHINE_LEARNING, onUnsupportedTab);

      expect(onUnsupportedTab).not.toHaveBeenCalled();
      expect(screen.getByTestId('location')).toHaveTextContent(path);
    },
  );
});
