import type {
  DeviceRow,
  PrinterConfig,
} from '@/src/modules/admin-config/presentation/printers'
import { Dispatch, ReactNode, SetStateAction } from 'react'

import { pretty } from '@/src/modules/admin-config/presentation/config-editor'
import { parseFpIds } from '@/src/modules/admin-config/presentation/printers'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

type SetPrinter = Dispatch<SetStateAction<PrinterConfig>>

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <div className="text-xs font-semibold text-[var(--text-secondary)]">
      {children}
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
      <CardContent className="space-y-2">
        {printers.length === 0 ? (
          <EmptyState
            title="No printers configured"
            description="Add a printer overlay to configure printing behavior."
          />
        ) : (
          <div className="space-y-1">
            {printers.map((p) => {
              const key = String(p.deviceKey ?? '')
              const active = key === selectedKey
              return (
                <Button
                  key={key}
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => onSelectKey(key)}
                  className={[
                    'h-auto w-full justify-start p-2 text-left text-sm',
                    active
                      ? 'border-[var(--text-primary)] bg-[var(--surface-muted)]'
                      : 'border-border hover:bg-[var(--surface-muted)]',
                  ].join(' ')}
                >
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{key}</div>
                    <div className="text-xs text-[var(--text-secondary)]">
                      {p.enabled ? 'enabled' : 'disabled'}
                    </div>
                  </div>
                  <div className="text-xs text-[var(--text-secondary)]">
                    schema v{Number(p.schemaVersion ?? 1)}
                  </div>
                </Button>
              )
            })}
          </div>
        )}

        <div className="pt-3">
          <FieldLabel>Editing</FieldLabel>
          <Input
            className="mt-2"
            value={selectedKey}
            onChange={(e) => onSelectedKeyChange(e.target.value)}
            placeholder="deviceKey (e.g., default, counter-1)"
          />
        </div>
      </CardContent>
    </Card>
  )
}

export function PrinterStructuredForm({
  printer,
  setPrinter,
}: {
  printer: PrinterConfig
  setPrinter: SetPrinter
}) {
  return (
    <>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div>
          <FieldLabel>id</FieldLabel>
          <Input
            value={printer.id ?? ''}
            onChange={(e) => setPrinter((p) => ({ ...p, id: e.target.value }))}
            placeholder="0"
          />
        </div>

        <div>
          <FieldLabel>name</FieldLabel>
          <Input
            value={printer.name ?? ''}
            onChange={(e) =>
              setPrinter((p) => ({ ...p, name: e.target.value }))
            }
            placeholder="Printer 1"
          />
        </div>

        <div>
          <FieldLabel>connectionType</FieldLabel>
          <Select
            value={printer.connectionType ?? 'TCP'}
            onChange={(e) =>
              setPrinter((p) => ({
                ...p,
                connectionType: e.target.value as any,
              }))
            }
          >
            <option value="TCP">TCP</option>
            <option value="USB">USB</option>
            <option value="SERIAL">SERIAL</option>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div>
          <FieldLabel>connection.host</FieldLabel>
          <Input
            value={printer.connection?.host ?? ''}
            onChange={(e) =>
              setPrinter((p) => ({
                ...p,
                connection: { ...p.connection, host: e.target.value },
              }))
            }
            placeholder="192.168.1.109"
            disabled={(printer.connectionType ?? 'TCP') !== 'TCP'}
          />
        </div>

        <div>
          <FieldLabel>connection.port</FieldLabel>
          <Input
            value={String(printer.connection?.port ?? 9100)}
            onChange={(e) =>
              setPrinter((p) => ({
                ...p,
                connection: {
                  ...p.connection,
                  port: Number(e.target.value || 0),
                },
              }))
            }
            placeholder="9100"
            disabled={(printer.connectionType ?? 'TCP') !== 'TCP'}
          />
        </div>

        <div>
          <FieldLabel>driver</FieldLabel>
          <Input
            value={printer.driver ?? ''}
            onChange={(e) =>
              setPrinter((p) => ({ ...p, driver: e.target.value }))
            }
            placeholder="generic"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div>
          <FieldLabel>type</FieldLabel>
          <Input
            value={printer.type ?? ''}
            onChange={(e) =>
              setPrinter((p) => ({ ...p, type: e.target.value }))
            }
            placeholder="Epson"
          />
        </div>

        <div>
          <FieldLabel>driverConfig.width</FieldLabel>
          <Input
            value={String(printer.driverConfig?.width ?? 42)}
            onChange={(e) =>
              setPrinter((p) => ({
                ...p,
                driverConfig: {
                  ...p.driverConfig,
                  width: Number(e.target.value || 0),
                },
              }))
            }
          />
        </div>

        <div>
          <FieldLabel>driverConfig.characterSet</FieldLabel>
          <Input
            value={printer.driverConfig?.characterSet ?? ''}
            onChange={(e) =>
              setPrinter((p) => ({
                ...p,
                driverConfig: {
                  ...p.driverConfig,
                  characterSet: e.target.value,
                },
              }))
            }
            placeholder="SLOVENIA"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Button
          type="button"
          size="sm"
          variant={printer.isDefault ? 'secondary' : 'primary'}
          aria-pressed={!!printer.isDefault}
          onClick={() => setPrinter((p) => ({ ...p, isDefault: !p.isDefault }))}
        >
          isDefault: {printer.isDefault ? 'ON' : 'OFF'}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={printer.reprint ? 'secondary' : 'primary'}
          aria-pressed={!!printer.reprint}
          onClick={() => setPrinter((p) => ({ ...p, reprint: !p.reprint }))}
        >
          reprint: {printer.reprint ? 'ON' : 'OFF'}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={printer.waitForResponse ? 'secondary' : 'primary'}
          aria-pressed={!!printer.waitForResponse}
          onClick={() =>
            setPrinter((p) => ({
              ...p,
              waitForResponse: !p.waitForResponse,
            }))
          }
        >
          waitForResponse: {printer.waitForResponse ? 'ON' : 'OFF'}
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div>
          <FieldLabel>fpIds</FieldLabel>
          <Textarea
            className="h-24 font-mono text-xs"
            value={(printer.fpIds ?? []).join(', ')}
            onChange={(e) =>
              setPrinter((p) => ({
                ...p,
                fpIds: parseFpIds(e.target.value),
              }))
            }
            placeholder="1,2,3,..."
          />
        </div>
        <div>
          <FieldLabel>stationDetails.name</FieldLabel>
          <Input
            value={printer.stationDetails?.name ?? ''}
            onChange={(e) =>
              setPrinter((p) => ({
                ...p,
                stationDetails: {
                  ...p.stationDetails,
                  name: e.target.value,
                },
              }))
            }
            placeholder="Test Station"
          />
        </div>
        <div>
          <FieldLabel>stationDetails.contactEmail</FieldLabel>
          <Input
            value={printer.stationDetails?.contactEmail ?? ''}
            onChange={(e) =>
              setPrinter((p) => ({
                ...p,
                stationDetails: {
                  ...p.stationDetails,
                  contactEmail: e.target.value,
                },
              }))
            }
            placeholder="default@email.com"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div>
          <FieldLabel>eptId</FieldLabel>
          <Input
            value={String(printer.eptId ?? 1)}
            onChange={(e) =>
              setPrinter((p) => ({
                ...p,
                eptId: Number(e.target.value || 0),
              }))
            }
            placeholder="1"
          />
        </div>
        <div>
          <FieldLabel>execTime (ms)</FieldLabel>
          <Input
            value={String(printer.execTime ?? 20000)}
            onChange={(e) =>
              setPrinter((p) => ({
                ...p,
                execTime: Number(e.target.value || 0),
              }))
            }
            placeholder="20000"
          />
        </div>
        <div>
          <FieldLabel>orderNo</FieldLabel>
          <Input
            value={printer.orderNo ?? ''}
            onChange={(e) =>
              setPrinter((p) => ({ ...p, orderNo: e.target.value }))
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
            setPrinter((p) => ({
              ...p,
              heartbeatOn: !p.heartbeatOn,
            }))
          }
        >
          heartbeatOn: {printer.heartbeatOn ? 'ON' : 'OFF'}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={printer.online ? 'secondary' : 'primary'}
          aria-pressed={!!printer.online}
          onClick={() => setPrinter((p) => ({ ...p, online: !p.online }))}
        >
          online: {printer.online ? 'ON' : 'OFF'}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={printer.printDailyReportOnBoot ? 'secondary' : 'primary'}
          aria-pressed={!!printer.printDailyReportOnBoot}
          onClick={() =>
            setPrinter((p) => ({
              ...p,
              printDailyReportOnBoot: !p.printDailyReportOnBoot,
            }))
          }
        >
          printDailyReportOnBoot:{' '}
          {printer.printDailyReportOnBoot ? 'ON' : 'OFF'}
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div>
          <FieldLabel>operatorId</FieldLabel>
          <Input
            value={printer.operatorId ?? ''}
            onChange={(e) =>
              setPrinter((p) => ({
                ...p,
                operatorId: e.target.value,
              }))
            }
            placeholder="1"
          />
        </div>
        <div>
          <FieldLabel>operatorPassword</FieldLabel>
          <Input
            value={printer.operatorPassword ?? ''}
            onChange={(e) =>
              setPrinter((p) => ({
                ...p,
                operatorPassword: e.target.value,
              }))
            }
            placeholder="000000"
          />
        </div>
        <div>
          <FieldLabel>stationDetails.contactNumber</FieldLabel>
          <Input
            value={printer.stationDetails?.contactNumber ?? ''}
            onChange={(e) =>
              setPrinter((p) => ({
                ...p,
                stationDetails: {
                  ...p.stationDetails,
                  contactNumber: e.target.value,
                },
              }))
            }
            placeholder="Default Number"
          />
        </div>
      </div>

      <div className="rounded bg-[var(--surface-muted)] p-3">
        <FieldLabel>Preview JSON</FieldLabel>
        <pre className="overflow-auto text-xs">{pretty(printer)}</pre>
      </div>
    </>
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
  onEnabledToggle,
  onSchemaVersionChange,
  onAdvancedToggle,
  configJsonText,
  parsedAdvanced,
  onConfigJsonChange,
}: {
  enabled: boolean
  schemaVersion: number
  advancedJsonOpen: boolean
  printer: PrinterConfig
  setPrinter: SetPrinter
  onEnabledToggle: () => void
  onSchemaVersionChange: (next: number) => void
  onAdvancedToggle: () => void
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
            {enabled ? 'Enabled' : 'Disabled'}
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
            {advancedJsonOpen ? 'Advanced JSON: ON' : 'Advanced JSON: OFF'}
          </Button>
        </div>

        {!advancedJsonOpen ? (
          <PrinterStructuredForm printer={printer} setPrinter={setPrinter} />
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
