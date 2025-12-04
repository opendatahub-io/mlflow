import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { TrackingOutcome } from '../trackingProperties';
import { isIntegrated } from '../../../common/utils/embedUtils';
import {
  fireFormTrackingEvent,
  fireLinkTrackingEvent,
  fireSimpleTrackingEvent,
  fireMiscTrackingEvent,
  firePageEvent,
  fireIdentifyEvent,
} from '../segmentUtils';

// Mock isIntegrated so we can flip between standalone and federated per test
jest.mock('../../../common/utils/embedUtils', () => ({
  isIntegrated: jest.fn(),
}));
const mockIsIntegrated = jest.mocked(isIntegrated);

const mockAnalytics = {
  track: jest.fn(),
  page: jest.fn(),
  identify: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
  // Reset window globals
  (window as any).analytics = undefined;
  (window as any).clusterID = undefined;
});

afterEach(() => {
  delete (window as any).analytics;
  delete (window as any).clusterID;
});

describe('standalone mode — no events fire', () => {
  beforeEach(() => {
    mockIsIntegrated.mockReturnValue(false);
    (window as any).analytics = mockAnalytics;
  });

  test('fireFormTrackingEvent does not call analytics.track', () => {
    fireFormTrackingEvent('Test', { outcome: TrackingOutcome.submit });
    expect(mockAnalytics.track).not.toHaveBeenCalled();
  });

  test('fireLinkTrackingEvent does not call analytics.track', () => {
    fireLinkTrackingEvent('Test', { href: '/foo' });
    expect(mockAnalytics.track).not.toHaveBeenCalled();
  });

  test('fireSimpleTrackingEvent does not call analytics.track', () => {
    fireSimpleTrackingEvent('Test');
    expect(mockAnalytics.track).not.toHaveBeenCalled();
  });

  test('fireMiscTrackingEvent does not call analytics.track', () => {
    fireMiscTrackingEvent('Test', { key: 'value' });
    expect(mockAnalytics.track).not.toHaveBeenCalled();
  });

  test('firePageEvent does not call analytics.page', () => {
    firePageEvent();
    expect(mockAnalytics.page).not.toHaveBeenCalled();
  });

  test('fireIdentifyEvent does not call analytics.identify', () => {
    fireIdentifyEvent({ isAdmin: true, canCreateProjects: true });
    expect(mockAnalytics.identify).not.toHaveBeenCalled();
  });
});

describe('federated mode — events fire when window.analytics is present', () => {
  beforeEach(() => {
    mockIsIntegrated.mockReturnValue(true);
    (window as any).analytics = mockAnalytics;
    (window as any).clusterID = 'cluster-123';
  });

  test('fireFormTrackingEvent calls analytics.track with outcome and clusterID', () => {
    fireFormTrackingEvent('Create Experiment', { outcome: TrackingOutcome.submit, success: true });
    expect(mockAnalytics.track).toHaveBeenCalledWith(
      'Create Experiment',
      expect.objectContaining({ outcome: 'submit', success: true, clusterID: 'cluster-123' }),
      expect.any(Object),
    );
  });

  test('fireLinkTrackingEvent calls analytics.track with link properties', () => {
    fireLinkTrackingEvent('Docs Clicked', { href: '/docs', from: '/home' });
    expect(mockAnalytics.track).toHaveBeenCalledWith(
      'Docs Clicked',
      expect.objectContaining({ href: '/docs', from: '/home', clusterID: 'cluster-123' }),
      expect.any(Object),
    );
  });

  test('fireSimpleTrackingEvent calls analytics.track with only clusterID', () => {
    fireSimpleTrackingEvent('Run Comparison Opened');
    expect(mockAnalytics.track).toHaveBeenCalledWith(
      'Run Comparison Opened',
      expect.objectContaining({ clusterID: 'cluster-123' }),
      expect.any(Object),
    );
  });

  test('firePageEvent calls analytics.page with clusterID', () => {
    firePageEvent();
    expect(mockAnalytics.page).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ clusterID: 'cluster-123' }),
      expect.any(Object),
    );
  });

  test('fireIdentifyEvent calls analytics.identify with traits and clusterID', () => {
    fireIdentifyEvent({ isAdmin: true, userID: 'user-42', canCreateProjects: false });
    expect(mockAnalytics.identify).toHaveBeenCalledWith(
      'user-42',
      expect.objectContaining({ isAdmin: true, canCreateProjects: false, clusterID: 'cluster-123' }),
    );
  });
});

describe('federated mode — no events fire when window.analytics is absent', () => {
  beforeEach(() => {
    mockIsIntegrated.mockReturnValue(true);
    // analytics intentionally not set
  });

  test('fireFormTrackingEvent does not throw', () => {
    expect(() => fireFormTrackingEvent('Test', { outcome: TrackingOutcome.cancel })).not.toThrow();
  });

  test('firePageEvent does not throw', () => {
    expect(() => firePageEvent()).not.toThrow();
  });
});

describe('clusterID fallback', () => {
  beforeEach(() => {
    mockIsIntegrated.mockReturnValue(true);
    (window as any).analytics = mockAnalytics;
    // clusterID intentionally not set
  });

  test('clusterID falls back to empty string when window.clusterID is undefined', () => {
    fireSimpleTrackingEvent('Test');
    expect(mockAnalytics.track).toHaveBeenCalledWith(
      'Test',
      expect.objectContaining({ clusterID: '' }),
      expect.any(Object),
    );
  });
});
