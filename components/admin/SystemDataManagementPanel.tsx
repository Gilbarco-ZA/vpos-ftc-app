'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  DatabaseBackup,
  Download,
  HardDriveDownload,
  Trash2,
  RotateCcw,
} from 'lucide-react'

import { STATUS_VARIANT } from '@/src/shared/status/ui'

import CsrfBootstrap from '@/components/security/CsrfBootstrap'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

const RESET_CONFIRMATION = 'DROP VPOS DATABASE'

type BackupFile = {
  filename: string
  kind: 'database' | 'full' | 'pre-reset'
  sizeBytes: number
  createdAt: string
}

const formatBytes = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return '0 B'

  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const index = Math.min(
    units.length - 1,
    Math.floor(Math.log(value) / Math.log(1024)),
  )

  return `${(value / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}

const readError = (body: any, fallback: string) =>
  String(body?.error?.message || body?.message || fallback)

export const SystemDataManagementPanel = () => {
  const [csrfToken, setCsrfToken] = useState('')
  const [backups, setBackups] = useState<BackupFile[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<'database' | 'full' | 'reset' | null>(null)
  const [confirmation, setConfirmation] = useState('')
  const [backupAction, setBackupAction] = useState<{ filename: string; action: 'delete' | 'restore' } | null>(null)
  const [backupPhrase, setBackupPhrase] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadBackups = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/admin/system/backups', {
        cache: 'no-store',
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok || body?.ok === false) {
        throw new Error(readError(body, 'Failed to load backups.'))
      }

      const items = body?.data?.backups ?? []
      setBackups(Array.isArray(items) ? items : [])
    } catch (reason: any) {
      setError(String(reason?.message || reason))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    queueMicrotask(() => {
      void loadBackups()
    })
  }, [loadBackups])

  const createBackup = async (kind: 'database' | 'full') => {
    if (!csrfToken || busy) return

    setBusy(kind)
    setMessage(null)
    setError(null)

    try {
      const response = await fetch('/api/admin/system/backups', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({ kind, csrf_token: csrfToken }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok || body?.ok === false) {
        throw new Error(readError(body, 'Backup failed.'))
      }

      const backup = body?.data?.backup
      const filename = backup?.filename ? `: ${backup.filename}` : '.'
      setMessage(
        `${kind === 'full' ? 'Full' : 'Database'} backup created${filename}`,
      )
      await loadBackups()
    } catch (reason: any) {
      setError(String(reason?.message || reason))
    } finally {
      setBusy(null)
    }
  }

  const submitBackupAction = async () => {
    if (!backupAction || !csrfToken || busy) return
    const { filename, action } = backupAction
    if (backupPhrase !== `${action.toUpperCase()} ${filename}`) return
    setBusy('reset')
    setMessage(null)
    setError(null)
    try {
      const response = await fetch(
        `/api/admin/system/backups/${encodeURIComponent(filename)}${action === 'restore' ? '/restore' : ''}`,
        {
          method: action === 'delete' ? 'DELETE' : 'POST',
          headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken },
          body: JSON.stringify({ csrf_token: csrfToken, confirmation: backupPhrase }),
        },
      )
      const body = await response.json().catch(() => ({}))
      if (!response.ok || body?.ok === false) {
        throw new Error(readError(body, `Backup ${action} failed.`))
      }
      setMessage(action === 'restore'
        ? 'Database restored; application restart requested.'
        : `Deleted backup ${filename}.`)
      setBackupAction(null)
      setBackupPhrase('')
      if (action === 'delete') await loadBackups()
    } catch (reason: any) {
      setError(String(reason?.message || reason))
    } finally {
      setBusy(null)
    }
  }

  const resetDatabase = async () => {
    if (!csrfToken || busy || confirmation.trim() !== RESET_CONFIRMATION) {
      return
    }

    setBusy('reset')
    setMessage(null)
    setError(null)

    try {
      const response = await fetch('/api/admin/system/reset-database', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({
          confirmation: confirmation.trim(),
          csrf_token: csrfToken,
        }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok || body?.ok === false) {
        throw new Error(readError(body, 'Database reset failed.'))
      }

      setMessage(
        body?.data?.message ||
          'Database reset accepted. The application is restarting.',
      )
      setConfirmation('')
    } catch (reason: any) {
      setError(String(reason?.message || reason))
      setBusy(null)
    }
  }

  return (
    <div className="space-y-6">
      <CsrfBootstrap onToken={setCsrfToken} />

      {message ? (
        <Alert variant={STATUS_VARIANT.SUCCESS}>{message}</Alert>
      ) : null}
      {error ? <Alert variant={STATUS_VARIANT.ERROR}>{error}</Alert> : null}

      <Card className="space-y-4 p-4">
        <div>
          <h2 className="text-lg font-semibold">Backups</h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Database backups contain PostgreSQL data. Full backups also contain
            the persistent VPOS data directory and a restore manifest.
            Application binaries are restored by redeploying the package.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            disabled={!csrfToken || Boolean(busy)}
            onClick={() => void createBackup('database')}
          >
            <DatabaseBackup className="mr-2 h-4 w-4" aria-hidden="true" />
            {busy === 'database'
              ? 'Creating database backup…'
              : 'Backup database'}
          </Button>
          <Button
            variant="primary"
            disabled={!csrfToken || Boolean(busy)}
            onClick={() => void createBackup('full')}
          >
            <HardDriveDownload className="mr-2 h-4 w-4" aria-hidden="true" />
            {busy === 'full' ? 'Creating full backup…' : 'Create full backup'}
          </Button>
          <Button
            variant="ghost"
            disabled={loading || Boolean(busy)}
            onClick={() => void loadBackups()}
          >
            Refresh
          </Button>
        </div>

        <div className="overflow-x-auto rounded border border-border">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">Available VPOS backups</caption>
            <thead>
              <tr className="border-b border-border bg-[var(--surface-muted)] text-left">
                <th className="p-2">Created</th>
                <th className="p-2">Type</th>
                <th className="p-2">Filename</th>
                <th className="p-2">Size</th>
                <th className="p-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {backups.map((backup, index) => (
                <tr
                  key={backup.filename}
                  className="border-b border-border last:border-b-0"
                >
                  <td className="whitespace-nowrap p-2">
                    {new Date(backup.createdAt).toLocaleString()}
                  </td>
                  <td className="p-2 capitalize">
                    {backup.kind.replace('-', ' ')}
                  </td>
                  <td className="p-2 font-mono text-xs">{backup.filename}</td>
                  <td className="whitespace-nowrap p-2">
                    {formatBytes(backup.sizeBytes)}
                  </td>
                  <td className="p-2 text-right">
                    <Button asChild variant="ghost" size="sm">
                      <a
                        href={`/api/admin/system/backups/${encodeURIComponent(backup.filename)}`}
                      >
                        <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                        Download
                      </a>
                    </Button>
                    {backup.kind !== 'full' ? (
                      <Button variant="ghost" size="sm" disabled={!csrfToken || Boolean(busy)}
                        onClick={() => { setBackupAction({ filename: backup.filename, action: 'restore' }); setBackupPhrase('') }}>
                        <RotateCcw className="mr-1 h-4 w-4" aria-hidden="true" />Restore
                      </Button>
                    ) : null}
                    <Button variant="ghost" size="sm" disabled={index === 0 || !csrfToken || Boolean(busy)}
                      title={index === 0 ? 'Newest backup is protected' : 'Delete older backup'}
                      onClick={() => { setBackupAction({ filename: backup.filename, action: 'delete' }); setBackupPhrase('') }}>
                      <Trash2 className="mr-1 h-4 w-4" aria-hidden="true" />Delete
                    </Button>
                  </td>
                </tr>
              ))}
              {!loading && backups.length === 0 ? (
                <tr>
                  <td
                    className="p-4 text-center text-[var(--text-muted)]"
                    colSpan={5}
                  >
                    No backups have been created yet.
                  </td>
                </tr>
              ) : null}
              {loading ? (
                <tr>
                  <td
                    className="p-4 text-center text-[var(--text-muted)]"
                    colSpan={5}
                  >
                    Loading backups…
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>

      {backupAction ? (
        <Card className="space-y-3 border-amber-300 p-4">
          <h3 className="font-semibold">Confirm backup {backupAction.action}</h3>
          <p className="text-sm">
            {backupAction.action === 'restore'
              ? 'This replaces the active database after creating a safety backup and restarts the application. Use a maintenance window and retain an external copy.'
              : 'This permanently deletes this older backup. The latest backup remains protected.'}
          </p>
          <label className="block text-sm" htmlFor="backup-action-confirmation">
            Type <code>{`${backupAction.action.toUpperCase()} ${backupAction.filename}`}</code>
          </label>
          <Input id="backup-action-confirmation" value={backupPhrase}
            onChange={(event) => setBackupPhrase(event.target.value)}
            autoComplete="off" spellCheck={false} />
          <div className="flex gap-2">
            <Button variant={backupAction.action === 'delete' ? 'destructive' : 'primary'}
              disabled={Boolean(busy) || backupPhrase !== `${backupAction.action.toUpperCase()} ${backupAction.filename}`}
              onClick={() => void submitBackupAction()}>Confirm {backupAction.action}</Button>
            <Button variant="ghost" onClick={() => { setBackupAction(null); setBackupPhrase('') }}>Cancel</Button>
          </div>
        </Card>
      ) : null}

      <Card className="space-y-4 border-red-300 p-4">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-red-700">
            <Trash2 className="h-5 w-5" aria-hidden="true" />
            Reset database for a new client
          </h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            This creates a mandatory pre-reset database backup, drops the
            current VPOS database, and restarts the application. Startup will
            recreate an empty database and run migrations.
          </p>
        </div>

        <Alert variant={STATUS_VARIANT.ERROR}>
          This removes all station, customer, product, transaction, user, and
          configuration records from the active database. Keep the generated
          pre-reset backup before commissioning the machine for another client.
        </Alert>

        <p className="text-xs text-[var(--text-muted)]">
          Remote database resets are blocked by default. The production
          <code className="mx-1">start.sh</code> and
          <code className="mx-1">stop.sh</code> scripts must be available.
        </p>

        <div className="max-w-xl space-y-2">
          <label
            className="text-sm font-medium"
            htmlFor="database-reset-confirmation"
          >
            Type <code>{RESET_CONFIRMATION}</code> to continue
          </label>
          <Input
            id="database-reset-confirmation"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        <Button
          variant="destructive"
          disabled={
            !csrfToken ||
            Boolean(busy) ||
            confirmation.trim() !== RESET_CONFIRMATION
          }
          onClick={() => void resetDatabase()}
        >
          {busy === 'reset'
            ? 'Backing up, dropping database, and restarting…'
            : 'Backup, drop database, and restart'}
        </Button>
      </Card>
    </div>
  )
}
