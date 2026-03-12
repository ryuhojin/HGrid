import { CooperativeGroupExecutor, type GroupExecutionResult } from './group-executor';
import { registerWorkerEntrypoint, resolveWorkerEntrypointScope, type WorkerEntrypointScope } from './worker-entry';
import { createGroupExecutionRequest, type GroupWorkerPayload } from './worker-operation-payloads';

export function registerGroupWorker(scope: WorkerEntrypointScope): () => void {
  const executor = new CooperativeGroupExecutor();
  return registerWorkerEntrypoint<GroupWorkerPayload, GroupExecutionResult, 'group'>(scope, {
    operationType: 'group',
    execute: (request, context) =>
      executor.execute(createGroupExecutionRequest(request.opId, request.payload), {
        isCanceled: context.isCanceled
      })
  });
}

const defaultScope = resolveWorkerEntrypointScope();
if (defaultScope) {
  registerGroupWorker(defaultScope);
}
