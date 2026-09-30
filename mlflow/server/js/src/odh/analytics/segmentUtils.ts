import { COLUMN_TYPES } from '../../experiment-tracking/constants';
import { MLFLOW_PUBLISHED_VERSION } from '../../common/mlflow-published-version';
import { isIntegrated } from '../../common/utils/embedUtils';
import { ErrorWrapper } from '../../common/utils/ErrorWrapper';
import type {
  FormTrackingEventProperties,
  IdentifyEventProperties,
  LinkTrackingEventProperties,
  MiscTrackingEventProperties,
} from './trackingProperties';

type WindowWithSegment = Window & {
  analytics?: {
    track: (event: string, properties?: Record<string, unknown>, context?: Record<string, unknown>) => void;
    page: (category?: string, properties?: Record<string, unknown>, context?: Record<string, unknown>) => void;
    identify: (userId?: string, traits?: Record<string, unknown>) => void;
  };
  clusterID?: string;
};

const win = window as WindowWithSegment;

const getClusterID = (): string => win.clusterID ?? '';

const fireTrackingEvent = (eventName: string, properties: Record<string, unknown>): void => {
  if (process.env['NODE_ENV'] === 'development' && isIntegrated()) {
    // eslint-disable-next-line no-console
    console.log(
      `Telemetry event triggered: ${eventName} - ${JSON.stringify(properties)} for version ${MLFLOW_PUBLISHED_VERSION}`,
    );
  } else if (isIntegrated() && win.analytics) {
    win.analytics.track(
      eventName,
      { ...properties, clusterID: getClusterID() },
      { app: { version: MLFLOW_PUBLISHED_VERSION } },
    );
  }
};

export const fireFormTrackingEvent = (eventName: string, properties: FormTrackingEventProperties): void => {
  fireTrackingEvent(eventName, properties);
};

export const fireLinkTrackingEvent = (eventName: string, properties: LinkTrackingEventProperties): void => {
  fireTrackingEvent(eventName, properties);
};

export const fireSimpleTrackingEvent = (eventName: string): void => {
  fireTrackingEvent(eventName, {});
};

export const fireMiscTrackingEvent = (eventName: string, properties: MiscTrackingEventProperties): void => {
  if (process.env['NODE_ENV'] === 'development' && isIntegrated()) {
    // eslint-disable-next-line no-console
    console.warn('This tracking event type is a last resort for legacy purposes');
  }
  fireTrackingEvent(eventName, properties);
};

export const firePageEvent = (): void => {
  if (process.env['NODE_ENV'] === 'development' && isIntegrated()) {
    // eslint-disable-next-line no-console
    console.log(`Page event triggered for version ${MLFLOW_PUBLISHED_VERSION}: ${win.location.pathname}`);
  } else if (isIntegrated() && win.analytics) {
    win.analytics.page(undefined, { clusterID: getClusterID() }, { app: { version: MLFLOW_PUBLISHED_VERSION } });
  }
};

export const fireIdentifyEvent = (properties: IdentifyEventProperties): void => {
  if (process.env['NODE_ENV'] === 'development' && isIntegrated()) {
    // eslint-disable-next-line no-console
    console.log(`Identify event triggered: ${JSON.stringify(properties)}`);
  } else if (isIntegrated() && win.analytics) {
    win.analytics.identify(properties.userID, {
      clusterID: getClusterID(),
      isAdmin: properties.isAdmin,
      canCreateProjects: properties.canCreateProjects,
    });
  }
};

export const getSafeColumnName = (canonicalKey: string): { columnType: string; columnName: string } => {
  const types = Object.values(COLUMN_TYPES);
  for (const type of types) {
    if (canonicalKey.startsWith(type)) {
      return {
        columnType: type,
        columnName: type === COLUMN_TYPES.ATTRIBUTES ? canonicalKey : '__private__',
      };
    }
  }
  return { columnType: 'unknown', columnName: '__private__' };
};

export const getTrackingError = (e: unknown): string => {
  if (e instanceof ErrorWrapper) {
    return e.getErrorCode() ?? `http_${e.getStatus()}`;
  }
  if (e instanceof Error) {
    return e.name;
  }
  return 'unknown_error';
};
