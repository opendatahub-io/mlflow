import { afterEach, describe, expect, jest, test } from '@jest/globals';
import { render } from '@testing-library/react';
import { MemoryRouter } from '../../common/utils/RoutingUtils';
import SkillRegistryRoutes from '../../skill-registry/routes';
import { SkillRegistryBreadcrumbReporter } from './SkillRegistryBreadcrumbReporter';

const renderReporter = (path: string, onBreadcrumbChange: jest.Mock) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <SkillRegistryBreadcrumbReporter onBreadcrumbChange={onBreadcrumbChange} />
    </MemoryRouter>,
  );

describe('SkillRegistryBreadcrumbReporter', () => {
  test('reports no segments on the skill list', () => {
    const onBreadcrumbChange = jest.fn();
    renderReporter('/', onBreadcrumbChange);

    expect(onBreadcrumbChange).toHaveBeenLastCalledWith([]);
  });

  test('reports the skill name on the detail page', () => {
    const onBreadcrumbChange = jest.fn();
    renderReporter('/code-review', onBreadcrumbChange);

    expect(onBreadcrumbChange).toHaveBeenLastCalledWith([
      { label: 'Skills', path: '/' },
      { label: 'code-review', path: '/code-review' },
    ]);
  });

  test('keeps the encoded identity of an organization skill as one path segment', () => {
    const onBreadcrumbChange = jest.fn();
    renderReporter('/%40acme%2Fpdf-extract', onBreadcrumbChange);

    expect(onBreadcrumbChange).toHaveBeenLastCalledWith([
      { label: 'Skills', path: '/' },
      { label: '@acme/pdf-extract', path: '/%40acme%2Fpdf-extract' },
    ]);
  });

  test('labels unencoded two-segment organization URLs', () => {
    const onBreadcrumbChange = jest.fn();
    renderReporter('/@acme/pdf-extract', onBreadcrumbChange);

    expect(onBreadcrumbChange).toHaveBeenLastCalledWith([
      { label: 'Skills', path: '/' },
      { label: '@acme/pdf-extract', path: '/@acme/pdf-extract' },
    ]);
  });
});

describe('SkillRegistryRoutes in federated mode', () => {
  const originalMode = process.env['DEPLOYMENT_MODE'];

  afterEach(() => {
    if (originalMode === undefined) {
      delete process.env['DEPLOYMENT_MODE'];
    } else {
      process.env['DEPLOYMENT_MODE'] = originalMode;
    }
  });

  test('builds routes relative to the wrapper basename', () => {
    process.env['DEPLOYMENT_MODE'] = 'federated';

    expect(SkillRegistryRoutes.skillRegistryPageRoute).toBe('/');
    expect(SkillRegistryRoutes.getSkillDetailRoute('pdf-extract', 'acme', 2)).toBe('/%40acme%2Fpdf-extract?version=2');
  });
});
