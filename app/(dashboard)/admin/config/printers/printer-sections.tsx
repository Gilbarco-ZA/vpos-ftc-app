import type {
  DeviceRow,
  PrinterConfig,
} from '@/src/modules/admin-config/presentation/printers'
import { Dispatch, ReactNode, SetStateAction, useMemo, useState } from 'react'

import { pretty } from '@/src/modules/admin-config/presentation/config-editor'
import {
  getPrinterDisplayName,
  normalizeAssignedFpIds,
  normalizePrinterConfig,
  summarizeAssignedPumps,
} from '@/src/modules/admin-config/presentation/printers'

import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { SectionHeader } from '@/components/ui/section-header'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

type SetPrinter = Dispatch<SetStateAction<PrinterConfig>>

type TestAction = 'connection' | 'receipt' | 'report'

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <div className="text-xs font-semibold text-[var(--text-secondary)]">
      {children}
    </div>
  )
}

function PumpAssignmentsEditor({
  availablePumpIds,
  selectedFpIds,
  onChange,
}: {
  availablePumpIds: number[]
  selectedFpIds: number[]
  onChange: (next: number[]) => void
}) {
  const [query, setQuery] = useState('')

  const filteredPumpIds = useMemo(() => {
    const token = query.trim()
    if (!token) return availablePumpIds
    return availablePumpIds.filter((pumpId) => String(pumpId).includes(token))
  }, [availablePumpIds, query])

  const togglePump = (pumpId: number) => {
    const current = new Set(normalizeAssignedFpIds(selectedFpIds))
    if (current.has(pumpId)) current.delete(pumpId)
    else current.add(pumpId)
    onChange(Array.from(current).sort((a, b) => a - b))
  }

  return (
    <div className="space-y-3 rounded-2xl border border-[var(--border-default)] bg-[var(--surface-muted)] p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <SectionHeader
            title="Assigned pumps"
            description="Pick every pump that should print to this receipt printer. Leave empty to use this printer only as a fallback."
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => onChange([...availablePumpIds])}
            disabled={!availablePumpIds.length}
          >
            Select all
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => onChange([])}
            disabled={!selectedFpIds.length}
          >
            Clear
          </Button>
        </div>
      </div>

      {availablePumpIds.length ? (
        <>
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter pumps (for example 1, 2, 12)"
          />
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6">
            {filteredPumpIds.map((pumpId) => {
              const checked = selectedFpIds.includes(pumpId)
              return (
                <label
                  key={pumpId}
                  className="flex cursor-pointer items-center gap-2 rounded-xl border border-[var(--border-default)] bg-[var(--surface-card)] px-3 py-2 text-sm"
                >
                  <Checkbox
                    checked={checked}
                    onChange={() => togglePump(pumpId)}
                  />
                  <span>Pump {pumpId}</span>
                </label>
              )
            })}
          </div>
          {!filteredPumpIds.length ? (
            <div className="text-sm text-[var(--text-secondary)]">
              No pumps match the current filter.
            </div>
          ) : null}
        </>
      ) : (
        <div className="text-sm text-[var(--text-secondary)]">
          No configured pumps were found yet. Complete pump setup first, then
          return here to assign printers.
        </div>
      )}
    </div>
  )
}

export function PrinterListCard({
  printers,
  selectedKey,
  onSelectKey,
  onSelectedKeyChange,
}: {
  printers: DeviceRow[]
  selectedKey: string
  onSelectKey: (key: string) => void
  onSelectedKeyChange: (key: string) => void
}) {
  return (
    <Card className="md:col-span-1">
      <CardHeader>
        <CardTitle>Printers</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {printers.length === 0 ? (
          <EmptyState
            title="No printers configured"
            description="Add a receipt printer to start printing receipts and reports."
          />
        ) : (
          <div className="space-y-2">
            {printers.map((row) => {
              const key = String(row.deviceKey ?? '')
              const active = key === selectedKey
              const printer = normalizePrinterConfig(row.configJson ?? {})
              const displayName = getPrinterDisplayName(key, printer)
              const host = String(printer.connection?.host ?? '').trim()
              const pumpCount = normalizeAssignedFpIds(printer.fpIds).length
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => onSelectKey(key)}
                  className={[
                    'w-full rounded-2xl border p-3 text-left transition-colors',
                    active
                      ? 'border-[var(--text-primary)] bg-[var(--surface-muted)]'
                      : 'border-[var(--border-default)] bg-[var(--surface-card)] hover:bg-[var(--surface-muted)]',
                  ].join(' ')}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-medium text-[var(--text-primary)]">
                        {displayName}
                      </div>
                      <div className="text-xs text-[var(--text-secondary)]">
                        {key}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-1">
                      {printer.isDefault ? (
                        <Badge variant="info">Default</Badge>
                      ) : null}
                      <Badge variant={row.enabled ? 'success' : 'neutral'}>
                        {row.enabled ? 'Enabled' : 'Disabled'}
                      </Badge>
                    </div>
                  </div>
                  <div className="mt-2 space-y-1 text-xs text-[var(--text-secondary)]">
                    <div>{host || 'No host configured yet'}</div>
                    <div>
                      {pumpCount
                        ? `Assigned to ${pumpCount} pump${pumpCount === 1 ? '' : 's'}`
                        : 'Fallback printer only'}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}

        <div className="pt-1">
          <FieldLabel>Editing device key</FieldLabel>
          <Input
            className="mt-2"
            value={selectedKey}
            onChange={(e) => onSelectedKeyChange(e.target.value)}
            placeholder="deviceKey (for example default, counter-1)"
          />
        </div>
      </CardContent>
    </Card>
  )
}

export function PrinterStructuredForm({
  printer,
  setPrinter,
  availablePumpIds,
  assignmentWarnings,
}: {
  printer: PrinterConfig
  setPrinter: SetPrinter
  availablePumpIds: number[]
  assignmentWarnings: string[]
}) {
  const [showAdvanced, setShowAdvanced] = useState(false)
  const selectedFpIds = normalizeAssignedFpIds(printer.fpIds)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="space-y-3 rounded-2xl border border-[var(--border-default)] bg-[var(--surface-card)] p-4">
          <SectionHeader
            title="Printer profile"
            description="Give the printer a clear name and mark it as the fallback printer when needed."
          />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <FieldLabel>Name</FieldLabel>
              <Input
                value={printer.name ?? ''}
                onChange={(e) =>
                  setPrinter((current) => ({
                    ...current,
                    name: e.target.value,
                  }))
                }
                placeholder="Receipt printer"
              />
            </div>
            <div>
              <FieldLabel>Internal printer id</FieldLabel>
              <Input
                value={printer.id ?? ''}
                onChange={(e) =>
                  setPrinter((current) => ({ ...current, id: e.target.value }))
                }
                placeholder="0"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div>
              <FieldLabel>Printer type</FieldLabel>
              <Input
                value={printer.type ?? ''}
                onChange={(e) =>
                  setPrinter((current) => ({
                    ...current,
                    type: e.target.value,
                  }))
                }
                placeholder="Epson compatible"
              />
            </div>
            <div>
              <FieldLabel>Driver</FieldLabel>
              <Input
                value={printer.driver ?? ''}
                onChange={(e) =>
                  setPrinter((current) => ({
                    ...current,
                    driver: e.target.value,
                  }))
                }
                placeholder="generic"
              />
            </div>
            <div>
              <FieldLabel>Paper width</FieldLabel>
              <Select
                value={String(printer.driverConfig?.width ?? 42)}
                onChange={(e) =>
                  setPrinter((current) => ({
                    ...current,
                    driverConfig: {
                      ...current.driverConfig,
                      width: Number(e.target.value || 42),
                    },
                  }))
                }
              >
                <option value="30">30 columns</option>
                <option value="42">42 columns</option>
                <option value="48">48 columns</option>
              </Select>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={printer.isDefault ? 'secondary' : 'primary'}
              aria-pressed={!!printer.isDefault}
              onClick={() =>
                setPrinter((current) => ({
                  ...current,
                  isDefault: !current.isDefault,
                }))
              }
            >
              {printer.isDefault ? 'Default printer' : 'Use as default printer'}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={printer.reprint ? 'secondary' : 'primary'}
              aria-pressed={!!printer.reprint}
              onClick={() =>
                setPrinter((current) => ({
                  ...current,
                  reprint: !current.reprint,
                }))
              }
            >
              {printer.reprint ? 'Reprints allowed' : 'Enable reprints'}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={printer.waitForResponse ? 'secondary' : 'primary'}
              aria-pressed={!!printer.waitForResponse}
              onClick={() =>
                setPrinter((current) => ({
                  ...current,
                  waitForResponse: !current.waitForResponse,
                }))
              }
            >
              {printer.waitForResponse
                ? 'Wait for printer response'
                : 'Do not wait for response'}
            </Button>
          </div>
        </div>

        <div className="space-y-3 rounded-2xl border border-[var(--border-default)] bg-[var(--surface-card)] p-4">
          <SectionHeader
            title="Connection"
            description="These are the only fields operators usually need to get a printer working."
          />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div>
              <FieldLabel>Connection type</FieldLabel>
              <Select
                value={printer.connectionType ?? 'TCP'}
                onChange={(e) =>
                  setPrinter((current) => ({
                    ...current,
                    connectionType: e.target.value as any,
                  }))
                }
              >
                <option value="TCP">TCP</option>
                <option value="USB">USB</option>
                <option value="SERIAL">SERIAL</option>
              </Select>
            </div>
            <div className="md:col-span-2">
              <FieldLabel>Printer host or IP</FieldLabel>
              <Input
                value={printer.connection?.host ?? ''}
                onChange={(e) =>
                  setPrinter((current) => ({
                    ...current,
                    connection: {
                      ...current.connection,
                      host: e.target.value,
                    },
                  }))
                }
                placeholder="192.168.1.109"
                disabled={(printer.connectionType ?? 'TCP') !== 'TCP'}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div>
              <FieldLabel>Port</FieldLabel>
              <Input
                value={String(printer.connection?.port ?? 9100)}
                onChange={(e) =>
                  setPrinter((current) => ({
                    ...current,
                    connection: {
                      ...current.connection,
                      port: Number(e.target.value || 0),
                    },
                  }))
                }
                placeholder="9100"
                disabled={(printer.connectionType ?? 'TCP') !== 'TCP'}
              />
            </div>
            <div>
              <FieldLabel>Character set</FieldLabel>
              <Input
                value={printer.driverConfig?.characterSet ?? ''}
                onChange={(e) =>
                  setPrinter((current) => ({
                    ...current,
                    driverConfig: {
                      ...current.driverConfig,
                      characterSet: e.target.value,
                    },
                  }))
                }
                placeholder="SLOVENIA"
              />
            </div>
            <div>
              <FieldLabel>Timeout (ms)</FieldLabel>
              <Input
                value={String(printer.driverConfig?.timeout ?? 1000)}
                onChange={(e) =>
                  setPrinter((current) => ({
                    ...current,
                    driverConfig: {
                      ...current.driverConfig,
                      timeout: Number(e.target.value || 0),
                    },
                  }))
                }
                placeholder="1000"
              />
            </div>
          </div>
        </div>
      </div>

      <PumpAssignmentsEditor
        availablePumpIds={availablePumpIds}
        selectedFpIds={selectedFpIds}
        onChange={(next) =>
          setPrinter((current) => ({
            ...current,
            fpIds: next,
          }))
        }
      />

      <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--surface-card)] p-4">
        <SectionHeader
          title="Assignment summary"
          description={summarizeAssignedPumps(selectedFpIds)}
        />
        {assignmentWarnings.length ? (
          <div className="mt-3 space-y-2">
            {assignmentWarnings.map((warning) => (
              <Alert key={warning} variant="warn" title="Assignment conflict">
                {warning}
              </Alert>
            ))}
          </div>
        ) : (
          <div className="mt-3 text-sm text-[var(--text-secondary)]">
            No overlapping pump assignments were detected.
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--surface-card)] p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <SectionHeader
            title="Advanced settings"
            description="Only expand this section when you need to tune protocol-specific fields or inspect the generated JSON."
          />
          <Button
            type="button"
            size="sm"
            variant={showAdvanced ? 'secondary' : 'primary'}
            aria-pressed={showAdvanced}
            onClick={() => setShowAdvanced((value) => !value)}
          >
            {showAdvanced ? 'Hide advanced settings' : 'Show advanced settings'}
          </Button>
        </div>

        {showAdvanced ? (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div>
                <FieldLabel>EPT id</FieldLabel>
                <Input
                  value={String(printer.eptId ?? 1)}
                  onChange={(e) =>
                    setPrinter((current) => ({
                      ...current,
                      eptId: Number(e.target.value || 0),
                    }))
                  }
                  placeholder="1"
                />
              </div>
              <div>
                <FieldLabel>Exec time (ms)</FieldLabel>
                <Input
                  value={String(printer.execTime ?? 20000)}
                  onChange={(e) =>
                    setPrinter((current) => ({
                      ...current,
                      execTime: Number(e.target.value || 0),
                    }))
                  }
                  placeholder="20000"
                />
              </div>
              <div>
                <FieldLabel>Order no</FieldLabel>
                <Input
                  value={printer.orderNo ?? ''}
                  onChange={(e) =>
                    setPrinter((current) => ({
                      ...current,
                      orderNo: e.target.value,
                    }))
                  }
                  placeholder="12"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <Button
                type="button"
                size="sm"
                variant={printer.heartbeatOn ? 'secondary' : 'primary'}
                aria-pressed={!!printer.heartbeatOn}
                onClick={() =>
                  setPrinter((current) => ({
                    ...current,
                    heartbeatOn: !current.heartbeatOn,
                  }))
                }
              >
                {printer.heartbeatOn ? 'Heartbeat enabled' : 'Enable heartbeat'}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={printer.online ? 'secondary' : 'primary'}
                aria-pressed={!!printer.online}
                onClick={() =>
                  setPrinter((current) => ({
                    ...current,
                    online: !current.online,
                  }))
                }
              >
                {printer.online
                  ? 'Printer marked online'
                  : 'Mark printer online'}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={
                  printer.printDailyReportOnBoot ? 'secondary' : 'primary'
                }
                aria-pressed={!!printer.printDailyReportOnBoot}
                onClick={() =>
                  setPrinter((current) => ({
                    ...current,
                    printDailyReportOnBoot: !current.printDailyReportOnBoot,
                  }))
                }
              >
                {printer.printDailyReportOnBoot
                  ? 'Print daily report on boot'
                  : 'Do not print daily report on boot'}
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <FieldLabel>Operator id</FieldLabel>
                <Input
                  value={printer.operatorId ?? ''}
                  onChange={(e) =>
                    setPrinter((current) => ({
                      ...current,
                      operatorId: e.target.value,
                    }))
                  }
                  placeholder="1"
                />
              </div>
              <div>
                <FieldLabel>Operator password</FieldLabel>
                <Input
                  value={printer.operatorPassword ?? ''}
                  onChange={(e) =>
                    setPrinter((current) => ({
                      ...current,
                      operatorPassword: e.target.value,
                    }))
                  }
                  placeholder="000000"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div>
                <FieldLabel>Station name</FieldLabel>
                <Input
                  value={printer.stationDetails?.name ?? ''}
                  onChange={(e) =>
                    setPrinter((current) => ({
                      ...current,
                      stationDetails: {
                        ...current.stationDetails,
                        name: e.target.value,
                      },
                    }))
                  }
                  placeholder="Station name"
                />
              </div>
              <div>
                <FieldLabel>Contact number</FieldLabel>
                <Input
                  value={printer.stationDetails?.contactNumber ?? ''}
                  onChange={(e) =>
                    setPrinter((current) => ({
                      ...current,
                      stationDetails: {
                        ...current.stationDetails,
                        contactNumber: e.target.value,
                      },
                    }))
                  }
                  placeholder="Contact number"
                />
              </div>
              <div>
                <FieldLabel>Contact email</FieldLabel>
                <Input
                  value={printer.stationDetails?.contactEmail ?? ''}
                  onChange={(e) =>
                    setPrinter((current) => ({
                      ...current,
                      stationDetails: {
                        ...current.stationDetails,
                        contactEmail: e.target.value,
                      },
                    }))
                  }
                  placeholder="ops@example.com"
                />
              </div>
            </div>

            <div className="rounded-xl bg-[var(--surface-muted)] p-3">
              <FieldLabel>Preview JSON</FieldLabel>
              <pre className="overflow-auto text-xs">{pretty(printer)}</pre>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

export function PrinterAdvancedJsonForm({
  configJsonText,
  parsedAdvanced,
  onConfigJsonChange,
}: {
  configJsonText: string
  parsedAdvanced: unknown
  onConfigJsonChange: (value: string) => void
}) {
  return (
    <>
      <div className="text-sm text-[var(--text-secondary)]">
        Advanced mode writes <code>configJson</code> exactly as entered.
      </div>
      <Textarea
        className="h-72 font-mono text-xs"
        value={configJsonText}
        onChange={(e) => onConfigJsonChange(e.target.value)}
      />
      {parsedAdvanced ? null : (
        <div className="text-sm text-red-700">Invalid JSON</div>
      )}
    </>
  )
}

export function PrinterSettingsCard({
  enabled,
  schemaVersion,
  advancedJsonOpen,
  printer,
  setPrinter,
  availablePumpIds,
  assignmentWarnings,
  testBusy,
  testResult,
  onEnabledToggle,
  onSchemaVersionChange,
  onAdvancedToggle,
  onRunTest,
  configJsonText,
  parsedAdvanced,
  onConfigJsonChange,
}: {
  enabled: boolean
  schemaVersion: number
  advancedJsonOpen: boolean
  printer: PrinterConfig
  setPrinter: SetPrinter
  availablePumpIds: number[]
  assignmentWarnings: string[]
  testBusy: TestAction | null
  testResult: { variant: 'success' | 'error' | 'info'; message: string } | null
  onEnabledToggle: () => void
  onSchemaVersionChange: (next: number) => void
  onAdvancedToggle: () => void
  onRunTest: (action: TestAction) => void
  configJsonText: string
  parsedAdvanced: unknown
  onConfigJsonChange: (value: string) => void
}) {
  return (
    <Card className="md:col-span-2">
      <CardHeader>
        <CardTitle>Settings</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Button
            type="button"
            size="sm"
            variant={enabled ? 'secondary' : 'primary'}
            aria-pressed={enabled}
            onClick={onEnabledToggle}
          >
            {enabled ? 'Printer enabled' : 'Enable printer'}
          </Button>

          <Input
            value={String(schemaVersion)}
            onChange={(e) => onSchemaVersionChange(Number(e.target.value || 1))}
            placeholder="schemaVersion"
          />

          <Button
            type="button"
            size="sm"
            variant={advancedJsonOpen ? 'secondary' : 'primary'}
            aria-pressed={advancedJsonOpen}
            onClick={onAdvancedToggle}
          >
            {advancedJsonOpen ? 'Advanced JSON enabled' : 'Use form editor'}
          </Button>
        </div>

        <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--surface-muted)] p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <SectionHeader
              title="Test printing"
              description="Run a connection check or print a sample receipt before you save changes."
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={testBusy != null}
                onClick={() => onRunTest('connection')}
              >
                {testBusy === 'connection' ? 'Checking…' : 'Test connection'}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={testBusy != null}
                onClick={() => onRunTest('receipt')}
              >
                {testBusy === 'receipt' ? 'Printing…' : 'Test receipt'}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={testBusy != null}
                onClick={() => onRunTest('report')}
              >
                {testBusy === 'report' ? 'Printing…' : 'Test report'}
              </Button>
            </div>
          </div>
          {testResult ? (
            <div className="mt-3">
              <Alert variant={testResult.variant}>{testResult.message}</Alert>
            </div>
          ) : null}
        </div>

        {!advancedJsonOpen ? (
          <PrinterStructuredForm
            printer={printer}
            setPrinter={setPrinter}
            availablePumpIds={availablePumpIds}
            assignmentWarnings={assignmentWarnings}
          />
        ) : (
          <PrinterAdvancedJsonForm
            configJsonText={configJsonText}
            parsedAdvanced={parsedAdvanced}
            onConfigJsonChange={onConfigJsonChange}
          />
        )}
      </CardContent>
    </Card>
  )
}
