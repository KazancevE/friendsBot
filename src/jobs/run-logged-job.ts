type RunLoggedJobParameters = {
  readonly name: string;
  readonly work: () => Promise<unknown>;
  readonly onError?: (error: Error) => Promise<void>;
};

export const runLoggedJob = async ({ name, work, onError }: RunLoggedJobParameters) => {
  const started = Date.now();
  try {
    await work();
    console.log(JSON.stringify({ job: name, ok: true, durationMs: Date.now() - started }));
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error(
      JSON.stringify({
        job: name,
        ok: false,
        durationMs: Date.now() - started,
        error: error.message,
      }),
    );
    if (onError !== undefined) {
      try {
        await onError(error);
      } catch (alertError) {
        const message = alertError instanceof Error ? alertError.message : String(alertError);
        console.error(JSON.stringify({ job: name, alertFailed: true, error: message }));
      }
    }
  }
};
