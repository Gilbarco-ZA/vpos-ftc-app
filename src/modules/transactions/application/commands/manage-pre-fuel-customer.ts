import { runPosControlCommand } from '@/src/modules/pos/application/runPosControlCommand'
import {
  cancelPreFuelCustomerAllocation,
  createPreFuelCustomerAllocation,
  getTinCaptureOrderRepo,
  listPendingPreFuelCustomerAllocations,
} from '@/src/modules/transactions/infrastructure/preFuelCustomerAllocation'

const positiveInt = (value: unknown, label: string) => {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer`)
  }
  return parsed
}

export async function getPreFuelCustomerState(stationId: string) {
  const captureOrder = await getTinCaptureOrderRepo(stationId)
  return {
    captureOrder,
    allocations:
      captureOrder === 'before_transaction'
        ? await listPendingPreFuelCustomerAllocations(stationId)
        : [],
  }
}

export async function allocatePreFuelCustomer(input: {
  stationId: string
  userId: string
  pumpNumber: unknown
  nozzleNumber: unknown
  nozzleId?: unknown
  customerId: unknown
}) {
  const captureOrder = await getTinCaptureOrderRepo(input.stationId)
  if (captureOrder !== 'before_transaction') {
    throw Object.assign(
      new Error('TIN capture is configured for after the pump transaction'),
      { status: 409 },
    )
  }

  const pumpNumber = positiveInt(input.pumpNumber, 'Pump number')
  const nozzleNumber = positiveInt(input.nozzleNumber, 'Nozzle number')
  const customerId = String(input.customerId ?? '').trim()
  if (!customerId) throw new Error('Customer is required')

  const allocation = await createPreFuelCustomerAllocation({
    stationId: input.stationId,
    pumpNumber,
    nozzleNumber,
    nozzleId: String(input.nozzleId ?? '').trim() || null,
    customerId,
    allocatedBy: input.userId,
  })
  if (!allocation) {
    throw Object.assign(
      new Error('The selected customer/nozzle is not available at this station'),
      { status: 400 },
    )
  }

  return allocation
}

export async function cancelPendingPreFuelCustomer(input: {
  stationId: string
  allocationId: unknown
}) {
  const allocationId = String(input.allocationId ?? '').trim()
  if (!allocationId) throw new Error('Allocation id is required')

  const allocation = await cancelPreFuelCustomerAllocation({
    stationId: input.stationId,
    allocationId,
  })
  if (!allocation) {
    throw Object.assign(new Error('Pending pre-fuel allocation not found'), {
      status: 404,
    })
  }

  await runPosControlCommand({
    stationId: input.stationId,
    command: 'clearPreFuelCustomer',
    body: {
      pumpNumber: allocation.pump_number,
      nozzleNumber: allocation.nozzle_number,
      wait: true,
    },
  }).catch(() => {})

  return allocation
}
