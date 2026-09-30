import { Typography } from '@databricks/design-system';
import type { ExperimentEntity } from '../../types';
import { ConfirmModal } from './ConfirmModal';
import { deleteExperimentApi } from '../../actions';
import { useDispatch } from 'react-redux';
import type { ThunkDispatch } from '@mlflow/mlflow/src/redux-types';
import Utils from '@mlflow/mlflow/src/common/utils/Utils';
import { FormattedMessage } from 'react-intl';
import { fireFormTrackingEvent, getTrackingError } from '../../../odh/analytics/segmentUtils';
import { TrackingOutcome, MLflowEventNames } from '../../../odh/analytics/trackingProperties';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  experiments: Pick<ExperimentEntity, 'experimentId' | 'name'>[];
  onExperimentsDeleted: () => void;
};

export const BulkDeleteExperimentModal = ({ isOpen, onClose, experiments, onExperimentsDeleted }: Props) => {
  const dispatch = useDispatch<ThunkDispatch>();

  const handleSubmit = () => {
    return Promise.all(experiments.map((experiment) => dispatch(deleteExperimentApi(experiment.experimentId))))
      .then(() => {
        fireFormTrackingEvent(MLflowEventNames.EXPERIMENT_DELETED, {
          outcome: TrackingOutcome.submit,
          success: true,
          experimentCount: experiments.length,
        });
        onExperimentsDeleted();
      })
      .catch((e: any) => {
        fireFormTrackingEvent(MLflowEventNames.EXPERIMENT_DELETED, {
          outcome: TrackingOutcome.submit,
          success: false,
          error: getTrackingError(e),
          experimentCount: experiments.length,
        });
        Utils.logErrorAndNotifyUser(e);
      });
  };

  const handleCancel = () => {
    fireFormTrackingEvent(MLflowEventNames.EXPERIMENT_DELETED, {
      outcome: TrackingOutcome.cancel,
      experimentCount: experiments.length,
    });
  };

  return (
    <ConfirmModal
      isOpen={isOpen}
      onClose={onClose}
      onCancel={handleCancel}
      handleSubmit={handleSubmit}
      title={
        <FormattedMessage
          defaultMessage="Delete {count, plural, one {# experiment} other {# experiments}}"
          description="Experiments page list, delete bulk experiments modal title"
          values={{
            count: experiments.length,
          }}
        />
      }
      helpText={
        <div>
          <Typography.Paragraph>The following experiments will be deleted:</Typography.Paragraph>
          <Typography.Paragraph>
            <ul>
              {experiments.map((experiment) => (
                <li key={experiment.experimentId}>
                  <Typography.Text>
                    {experiment.name} (ID: {experiment.experimentId})
                  </Typography.Text>
                </li>
              ))}
            </ul>
          </Typography.Paragraph>
        </div>
      }
      confirmButtonText={
        <FormattedMessage
          defaultMessage="Delete"
          description="Experiments page list, delete bulk experiments modal primary button"
        />
      }
      confirmButtonProps={{ danger: true }}
    />
  );
};
