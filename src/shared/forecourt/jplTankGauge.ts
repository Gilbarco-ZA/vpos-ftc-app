export async function requestTankGaugeSnapshot() {
  const { requestJplTcpTankGaugeData } =
    await import('@/src/modules/forecourt/infrastructure/adapters/jplTcpAdapter')
  const snapshot = await requestJplTcpTankGaugeData()
  return Array.isArray(snapshot) ? snapshot : []
}
