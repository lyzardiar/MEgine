/**
 * A minimal failure-isolated FIFO for AgentBridge writes.
 *
 * Queries remain concurrent, but writes must evaluate revision/conflict guards
 * in arrival order. Otherwise two asynchronous commands can both pass their
 * preflight checks before either one publishes its mutation state.
 */
export class SerialTaskQueue {
  private tail: Promise<void> = Promise.resolve();

  run<T>(operation: () => Promise<T> | T): Promise<T> {
    const result = this.tail.then(operation);
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}
