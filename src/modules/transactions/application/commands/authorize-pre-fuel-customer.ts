import { runPosControlCommand } from '@/src/modules/pos/application/runPosControlCommand'
import { getPumpRuntimeState } from '@/src/modules/pumps/application/getPumpRuntimeState'
import { getPendingPreFuelCustomerAllocation } from '@/src/modules/transactions/infrastructure/preFuelCustomerAllocation'

export async function authorizePendingPreFuelCustomer(input: {
  stationId: string
  allocationId: unknown
}) {
  const allocationId = String(input.allocationId ?? '').trim()
  if (!allocationId) throw new Error('Allocation id is required')

  const allocation = await getPendingPreFuelCustomerAllocation({
    stationId: input.stationId,
    allocationId,
  })
  if (!allocation) {
    throw Object.assign(new Error('Pending pre-fuel allocation not found'), {
      status: 404,
    })
  }

  const state = await getPumpRuntimeState(input.stationId)
  const pump = state.liveState?.pumps?.find(
    (item) => Number(item.pumpId) === allocation.pump_number,
  )
  const nozzle = pump?.nozzles?.find(
    (item) => Number(item.nozzleId) === allocation.nozzle_number,
  )
  const nozzleState = String(nozzle?.state ?? '').toLowerCase()
  const authorizable = nozzleState === 'calling' || nozzleState === 'nozzle_up'

  if (!authorizable) {
    throw Object.assign(
      new Error(
        `Nozzle is ${nozzleState || 'unknown'}. Lift the nozzle and wait for DOMS to report CALLING before authorizing.`,
      ),
      { status: 409 },
    )
  }

  await runPosControlCommand({
    stationId: input.stationId,
    command: 'preFuelCustomer',
    body: {
      pumpNumber: allocation.pump_number,
      nozzleNumber: allocation.nozzle_number,
      nozzleId: allocation.nozzle_id,
      customerId: allocation.customer_id,
      wait: true,
    },
  })

  return allocation
}
