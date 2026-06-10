import { useCallback } from 'react';
import { useSearchParams } from '@mlflow/mlflow/src/common/utils/RoutingUtils';

const VERSION_QUERY_PARAM = 'version';

export const useSelectedMCPServerVersion = (latestVersion?: string) => {
  const [searchParams, setSearchParams] = useSearchParams();

  const selectedVersion = searchParams.get(VERSION_QUERY_PARAM) ?? latestVersion;

  const setSelectedVersion = useCallback(
    (version: string | undefined) => {
      setSearchParams(
        (params) => {
          if (version === undefined) {
            params.delete(VERSION_QUERY_PARAM);
            return params;
          }
          params.set(VERSION_QUERY_PARAM, version);
          return params;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  return [selectedVersion, setSelectedVersion] as const;
};
