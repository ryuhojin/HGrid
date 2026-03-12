import { CooperativePivotExecutor, type PivotExecutionResult } from './pivot-executor';
import { registerWorkerEntrypoint, resolveWorkerEntrypointScope, type WorkerEntrypointScope } from './worker-entry';
import { createPivotExecutionRequest, type PivotWorkerPayload } from './worker-operation-payloads';

export function registerPivotWorker(scope: WorkerEntrypointScope): () => void {
  const executor = new CooperativePivotExecutor();
  return registerWorkerEntrypoint<PivotWorkerPayload, PivotExecutionResult, 'pivot'>(scope, {
    operationType: 'pivot',
    execute: (request, context) =>
      executor.execute(createPivotExecutionRequest(request.opId, request.payload), {
        isCanceled: context.isCanceled
      })
  });
}

const defaultScope = resolveWorkerEntrypointScope();
if (defaultScope) {
  registerPivotWorker(defaultScope);
}
