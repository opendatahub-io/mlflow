export type IdentifyEventProperties = {
  isAdmin: boolean;
  userID?: string;
  canCreateProjects: boolean;
};

export const TrackingOutcome = {
  submit: 'submit',
  cancel: 'cancel',
} as const;

export const MLflowEventNames = {
  EXPERIMENT_CREATED: 'MLflow Experiment Created',
  NEW_RUN_CREATED: 'MLflow New Run Created',
  EXPERIMENT_COMPARISON_STARTED: 'MLflow Experiment Comparison Started',
  EXPERIMENT_DELETED: 'MLflow Experiment Deleted',
  COMPARISON_TABLE_VIEWED: 'MLflow Comparison Table Viewed',
  RUNS_COLUMN_MODIFIED: 'MLflow Runs Column Modified',
} as const;

export const RunsColumnAction = {
  added: 'added',
  removed: 'removed',
} as const;

export type BaseFormTrackingEventProperties = {
  outcome: (typeof TrackingOutcome)[keyof typeof TrackingOutcome];
  success?: boolean;
  error?: string;
};

export type FormTrackingEventProperties = {
  [key: string]: string | number | boolean | undefined;
} & BaseFormTrackingEventProperties;

export type LinkTrackingEventProperties = {
  from?: string;
  href?: string;
  to?: string;
  type?: string;
  section?: string;
  name?: string;
};

export type MiscTrackingEventProperties = {
  [key: string]: string | number | boolean | undefined;
};
