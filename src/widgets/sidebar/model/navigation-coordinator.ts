type CancelObsoleteQueries = () => Promise<void>;
type Navigate = (destination: string) => void;
type RecoverCurrentRoute = () => Promise<void>;

/**
 * Serializes route cancellation so an older click can never cancel queries
 * started by a newer destination. Only the latest queued destination navigates.
 */
export class NavigationCoordinator {
  private latestRequest = 0;
  private pendingDestination: string | null = null;
  private tail: Promise<void> = Promise.resolve();

  constructor(
    private readonly cancelObsoleteQueries: CancelObsoleteQueries,
    private readonly navigate: Navigate,
    private readonly recoverCurrentRoute: RecoverCurrentRoute = async () => undefined,
  ) {}

  request(destination: string, currentDestination?: string): Promise<void> | null {
    if (this.pendingDestination === destination) return null;
    if (this.pendingDestination === null && destination === currentDestination) return null;

    this.pendingDestination = destination;
    const request = ++this.latestRequest;
    const operation = this.tail.catch(() => undefined).then(async () => {
      await this.cancelObsoleteQueries();
      if (request !== this.latestRequest) return;

      this.navigate(destination);
      if (destination === currentDestination) await this.recoverCurrentRoute();
    });

    this.tail = operation
      .catch(() => undefined)
      .finally(() => {
        if (request === this.latestRequest) this.pendingDestination = null;
      });

    return operation;
  }
}
