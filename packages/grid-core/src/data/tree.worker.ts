import { CooperativeTreeExecutor, type TreeExecutionResult } from './tree-executor';
import { registerWorkerEntrypoint, resolveWorkerEntrypointScope, type WorkerEntrypointScope } from './worker-entry';
import { createTreeExecutionRequest, type TreeWorkerPayload } from './worker-operation-payloads';

export function registerTreeWorker(scope: WorkerEntrypointScope): () => void {
  const executor = new CooperativeTreeExecutor();
  return registerWorkerEntrypoint<TreeWorkerPayload, TreeExecutionResult, 'tree'>(scope, {
    operationType: 'tree',
    execute: (request, context) =>
      executor.execute(createTreeExecutionRequest(request.opId, request.payload), {
        isCanceled: context.isCanceled
      })
  });
}

const defaultScope = resolveWorkerEntrypointScope();
if (defaultScope) {
  registerTreeWorker(defaultScope);
}
