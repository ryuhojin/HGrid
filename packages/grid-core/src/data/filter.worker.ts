import { CooperativeFilterExecutor, type FilterExecutionResult } from './filter-executor';
import { registerWorkerEntrypoint, resolveWorkerEntrypointScope, type WorkerEntrypointScope } from './worker-entry';
import { createFilterExecutionRequest, type FilterWorkerPayload } from './worker-operation-payloads';

export function registerFilterWorker(scope: WorkerEntrypointScope): () => void {
  const executor = new CooperativeFilterExecutor();
  return registerWorkerEntrypoint<FilterWorkerPayload, FilterExecutionResult, 'filter'>(scope, {
    operationType: 'filter',
    execute: (request, context) =>
      executor.execute(createFilterExecutionRequest(request.opId, request.payload), {
        isCanceled: context.isCanceled
      })
  });
}

const defaultScope = resolveWorkerEntrypointScope();
if (defaultScope) {
  registerFilterWorker(defaultScope);
}
