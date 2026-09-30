/**
 * NOTE: this code file was automatically migrated to TypeScript using ts-migrate and
 * may contain multiple `any` type annotations and `@ts-expect-error` directives.
 * If possible, please improve types while making changes to this file. If the type
 * annotations are already looking good, please remove this comment.
 */

import { applyMiddleware, compose, createStore } from 'redux';
import promiseMiddleware from 'redux-promise-middleware';
import thunk from 'redux-thunk';

import { rootReducer } from './experiment-tracking/reducers/Reducers';
import { onWorkspaceChange } from './workspaces/utils/WorkspaceUtils';
import { WORKSPACE_CHANGED } from './experiment-tracking/actions';

const composeEnhancers = (window as any).__REDUX_DEVTOOLS_EXTENSION_COMPOSE__ || compose;
// eslint-disable-next-line no-useless-rename
const store = createStore(rootReducer, {}, composeEnhancers(applyMiddleware(thunk, promiseMiddleware())));

// Intentionally not capturing the unsubscribe handle: the store is a
// module-level singleton that lives for the entire application lifetime.
onWorkspaceChange(() => {
  store.dispatch({ type: WORKSPACE_CHANGED });
});

export default store;
