import { CooperativeSortExecutor, type SortExecutionResult } from './sort-executor';
import { registerWorkerEntrypoint, resolveWorkerEntrypointScope, type WorkerEntrypointScope } from './worker-entry';
import { createSortExecutionRequest, type SortWorkerPayload } from './worker-operation-payloads';

export function registerSortWorker(scope: WorkerEntrypointScope): () => void {
  const executor = new CooperativeSortExecutor();
  return registerWorkerEntrypoint<SortWorkerPayload, SortExecutionResult, 'sort'>(scope, {
    operationType: 'sort',
    execute: (request, context) =>
      executor.execute(createSortExecutionRequest(request.opId, request.payload), {
        isCanceled: context.isCanceled
      })
  });
}

const defaultScope = resolveWorkerEntrypointScope();
if (defaultScope) {
  registerSortWorker(defaultScope);
}
