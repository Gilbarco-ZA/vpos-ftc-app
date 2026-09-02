export async function readFrameworkRouteParams<P>(ctx: any): Promise<P> {
  const rawParams =
    ctx && typeof ctx === 'object' && 'params' in ctx
      ? await Promise.resolve(ctx.params)
      : {}

  return ((rawParams && typeof rawParams === 'object' ? rawParams : {}) ||
    {}) as P
}
