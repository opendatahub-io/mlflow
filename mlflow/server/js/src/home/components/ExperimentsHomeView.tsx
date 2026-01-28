import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Spacer, Typography, useDesignSystemTheme } from '@databricks/design-system';
import type { RowSelectionState, SortingState } from '@tanstack/react-table';
import { FormattedMessage } from 'react-intl';
import { ExperimentListTable } from '../../experiment-tracking/components/ExperimentListTable';
import Routes from '../../experiment-tracking/routes';
import { Link } from '../../common/utils/RoutingUtils';
import type { ExperimentEntity } from '../../experiment-tracking/types';

type ExperimentsHomeViewProps = {
  experiments?: ExperimentEntity[];
  isLoading: boolean;
  error?: Error | null;
  onCreateExperiment: () => void;
  onRetry: () => void;
};

const ExperimentsEmptyState = ({ onCreateExperiment }: { onCreateExperiment: () => void }) => {
  const { theme } = useDesignSystemTheme();

  return (
    <div
      css={{
        padding: theme.spacing.lg,
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        gap: theme.spacing.md,
      }}
    >
      <Typography.Title level={4} css={{ margin: 0 }}>
        <FormattedMessage
          defaultMessage="Create your first experiment"
          description="Home page experiments empty state title"
        />
      </Typography.Title>
      <Typography.Text css={{ color: theme.colors.textSecondary }}>
        <FormattedMessage
          defaultMessage="Create your first experiment to start tracking ML workflows."
          description="Home page experiments empty state description"
        />
      </Typography.Text>
      <Button componentId="mlflow.home.experiments.create" onClick={onCreateExperiment}>
        <FormattedMessage defaultMessage="Create experiment" description="Home page experiments empty state CTA" />
      </Button>
    </div>
  );
};

export const ExperimentsHomeView = ({
  experiments,
  isLoading,
  error,
  onCreateExperiment,
  onRetry,
}: ExperimentsHomeViewProps) => {
  const { theme } = useDesignSystemTheme();
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [sorting, setSorting] = useState<SortingState>([]);

  const topExperiments = useMemo(() => experiments?.slice(0, 5) ?? [], [experiments]);
  const shouldShowEmptyState = !isLoading && !error && topExperiments.length === 0;

  const cardWidthPx = 320;
  const cardGapPx = theme.spacing.sm + theme.spacing.xs;
  const containerRef = useRef<HTMLElement | null>(null);
  const [columns, setColumns] = useState(1);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) {
      return;
    }
    let rafId: number | null = null;

    const computeColumns = () => {
      const w = el.getBoundingClientRect().width;
      const nextColumns = w ? Math.max(1, Math.floor((w + cardGapPx) / (cardWidthPx + cardGapPx))) : 1;
      setColumns((prev) => (prev === nextColumns ? prev : nextColumns));
    };

    computeColumns();

    const ro = new ResizeObserver(() => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      rafId = requestAnimationFrame(computeColumns);
    });

    ro.observe(el);
    return () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      ro.disconnect();
    };
  }, [cardGapPx]);

  const snappedWidth = columns === 1 ? '100%' : cardWidthPx * columns + cardGapPx * (columns - 1);

  return (
    <section ref={containerRef} css={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.sm }}>
      <Typography.Title level={3} css={{ margin: 0 }}>
        <FormattedMessage defaultMessage="Experiments" description="Home page experiments preview title" />
      </Typography.Title>
      <div
        css={{
          border: `1px solid ${theme.colors.border}`,
          overflow: 'hidden',
          backgroundColor: theme.colors.backgroundPrimary,
          width: snappedWidth,
        }}
      >
        {error ? (
          <div css={{ padding: theme.spacing.lg, display: 'flex', flexDirection: 'column', gap: theme.spacing.md }}>
            <Alert
              type="error"
              closable={false}
              componentId="mlflow.home.experiments.error"
              message={
                <FormattedMessage
                  defaultMessage="We couldn't load your experiments."
                  description="Home page experiments error message"
                />
              }
              description={error.message}
            />
            <div>
              <Button componentId="mlflow.home.experiments.retry" onClick={onRetry}>
                <FormattedMessage defaultMessage="Retry" description="Home page experiments retry CTA" />
              </Button>
            </div>
          </div>
        ) : shouldShowEmptyState ? (
          <ExperimentsEmptyState onCreateExperiment={onCreateExperiment} />
        ) : (
          <ExperimentListTable
            experiments={topExperiments}
            isLoading={isLoading}
            rowSelection={rowSelection}
            setRowSelection={setRowSelection}
            sortingProps={{ sorting, setSorting }}
            onEditTags={() => undefined}
          />
        )}
      </div>
      <Spacer size="xs" />
      <Link to={Routes.experimentsObservatoryRoute} style={{ alignSelf: 'flex-start' }}>
        <span css={{ fontSize: theme.typography.fontSizeBase }}>
          <FormattedMessage
            defaultMessage="Go to <b>Experiments</b>"
            description="Home page experiments view all link"
            values={{ b: (chunks) => <strong>{chunks}</strong> }}
          />
        </span>
      </Link>
    </section>
  );
};

export default ExperimentsHomeView;
