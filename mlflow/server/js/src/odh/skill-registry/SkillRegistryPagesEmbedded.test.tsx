import { describe, expect, it, jest } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { DesignSystemProvider } from '@databricks/design-system';
import { QueryClient, QueryClientProvider } from '@mlflow/mlflow/src/common/utils/reactQueryHooks';
import { testRoute, TestRouter } from '../../common/utils/RoutingTestUtils';
import { setupServer } from '../../common/utils/setup-msw';
import SkillRegistryPage from '../../skill-registry/pages/SkillRegistryPage';
import SkillDetailPage from '../../skill-registry/pages/SkillDetailPage';
import SkillRegistryRoutes from '../../skill-registry/routes';
import {
  createMockSkill,
  createMockSkillVersion,
  getMockedSearchSkillsResponse,
  getMockedSkillDetailHandlers,
} from '../../skill-registry/test-utils';

jest.mock('../../common/utils/embedUtils', () => ({
  ...jest.requireActual<typeof import('../../common/utils/embedUtils')>('../../common/utils/embedUtils'),
  isIntegrated: jest.fn(() => true),
}));

const skill = createMockSkill();

describe('Skill Registry pages embedded in the dashboard', () => {
  setupServer(
    getMockedSearchSkillsResponse([skill]),
    ...getMockedSkillDetailHandlers(skill, [createMockSkillVersion()]),
  );

  const renderPage = (initialEntries: string[]) =>
    render(
      <IntlProvider locale="en">
        <DesignSystemProvider>
          <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
            <TestRouter
              routes={[
                testRoute(<SkillRegistryPage />, '/skills'),
                testRoute(<SkillDetailPage />, '/skills/:skillKey'),
              ]}
              initialEntries={initialEntries}
            />
          </QueryClientProvider>
        </DesignSystemProvider>
      </IntlProvider>,
    );

  it('drops the catalog page header and keeps Create skill next to the view toggle', async () => {
    renderPage(['/skills']);

    const createButton = await screen.findByRole('button', { name: 'Create skill' });
    expect(screen.queryByRole('heading', { name: /Skills/ })).not.toBeInTheDocument();
    const viewToggle = document.querySelector('[data-component-id="mlflow.skill_registry.view_toggle"]');
    expect(viewToggle?.parentElement).toBe(createButton.parentElement);
  });

  it('hides the breadcrumb on the detail page, where the host renders its own', async () => {
    renderPage([SkillRegistryRoutes.getSkillDetailRoute(skill.name, skill.organization)]);

    await waitFor(() => expect(screen.getByText('Viewing version 2')).toBeInTheDocument());
    expect(screen.getByRole('heading', { name: /code-review/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Skills' })).not.toBeInTheDocument();
  });
});
