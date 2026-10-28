/** Awaits a promise that must reject with an Error, and returns that error. */
export async function rejectionOf(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(Error);
    assert(error instanceof Error);
    return error;
  }
  throw new Error('Expected the promise to reject');
}
