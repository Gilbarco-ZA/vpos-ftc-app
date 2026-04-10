'use client'

import type { SelectOption } from '@/src/shared/types'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { formatDate } from '@/src/shared/utils/dates'

import { PageHeader } from '@/components/layout/page-header'
import CsrfBootstrap from '@/components/security/CsrfBootstrap'
import { CsrfHiddenInput } from '@/components/security/CsrfHiddenInput'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorDetails } from '@/components/ui/error-details'
import { Input } from '@/components/ui/input'
import { LoadingOverlay } from '@/components/ui/loading-overlay'
import { Select } from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  ToastItem,
  ToastMessage,
  ToastVariant,
  ToastViewport,
} from '@/components/ui/toast'

type UserRow = {
  id: string
  username: string
  email: string
  role: string
  full_name?: string | null
  is_active?: boolean
  last_login_at?: string | null
}

const readOptions = (payload: any): SelectOption[] => {
  const options = payload?.data?.options ?? payload?.options ?? []
  return Array.isArray(options) ? options : []
}

export const UsersPageClient = () => {
  const [csrfToken, setCsrfToken] = useState('')
  const [users, setUsers] = useState<UserRow[]>([])
  const [roleOptions, setRoleOptions] = useState<SelectOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  const [createForm, setCreateForm] = useState({
    username: '',
    email: '',
    password: '',
    role: '',
    fullName: '',
  })

  const [editUser, setEditUser] = useState<UserRow | null>(null)
  const [editForm, setEditForm] = useState({
    username: '',
    email: '',
    role: '',
    fullName: '',
  })

  const [resetUser, setResetUser] = useState<UserRow | null>(null)
  const [resetPassword, setResetPassword] = useState('')

  const showToast = (variant: ToastVariant, message: string) => {
    setToasts((prev) => [
      ...prev,
      { id: `${Date.now()}-${Math.random()}`, variant, message },
    ])
  }

  const loadUsers = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [csrfRes, rolesRes, usersRes] = await Promise.all([
        fetch('/api/security/csrf', { cache: 'no-store' }),
        fetch('/api/config/user-roles', { cache: 'no-store' }),
        fetch('/api/admin/users', { cache: 'no-store' }),
      ])

      const csrfJson = await csrfRes.json().catch(() => ({}))
      if (typeof csrfJson?.token === 'string') setCsrfToken(csrfJson.token)

      setRoleOptions(readOptions(await rolesRes.json().catch(() => ({}))))

      const usersJson = await usersRes.json().catch(() => ({}))
      const rows = Array.isArray(usersJson?.data)
        ? usersJson.data
        : Array.isArray(usersJson)
          ? usersJson
          : []
      setUsers(rows)
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadUsers()
  }, [loadUsers])

  const roleLabel = useMemo(() => {
    const map = new Map(roleOptions.map((opt) => [opt.value, opt.label]))
    return (value: string) => map.get(value) ?? value
  }, [roleOptions])

  const resetCreateForm = () => {
    setCreateForm({
      username: '',
      email: '',
      password: '',
      role: roleOptions[0]?.value ?? '',
      fullName: '',
    })
  }

  useEffect(() => {
    if (!createForm.role && roleOptions.length > 0) {
      setCreateForm((prev) => ({ ...prev, role: roleOptions[0].value }))
    }
  }, [roleOptions, createForm.role])

  const handleCreate = async () => {
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({
          csrf_token: csrfToken,
          username: createForm.username.trim(),
          email: createForm.email.trim(),
          password: createForm.password,
          role: createForm.role,
          fullName: createForm.fullName.trim() || undefined,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || body?.ok === false) {
        throw new Error(
          body?.error?.message || body?.error || 'Failed to create user',
        )
      }
      showToast('success', 'User created')
      resetCreateForm()
      await loadUsers()
    } catch (err: any) {
      showToast('error', err?.message || 'Failed to create user')
    }
  }

  const handleSetActive = async (row: UserRow, nextActive: boolean) => {
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({
          csrf_token: csrfToken,
          userId: row.id,
          setActive: nextActive,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || body?.ok === false) {
        throw new Error(
          body?.error?.message || body?.error || 'Failed to update user',
        )
      }
      showToast('success', nextActive ? 'User enabled' : 'User disabled')
      await loadUsers()
    } catch (err: any) {
      showToast('error', err?.message || 'Failed to update user')
    }
  }

  const handleResetPassword = async () => {
    if (!resetUser) return
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({
          csrf_token: csrfToken,
          userId: resetUser.id,
          newPassword: resetPassword,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || body?.ok === false) {
        throw new Error(
          body?.error?.message || body?.error || 'Failed to reset password',
        )
      }
      showToast('success', 'Password reset')
      setResetPassword('')
      setResetUser(null)
    } catch (err: any) {
      showToast('error', err?.message || 'Failed to reset password')
    }
  }

  const handleEdit = async () => {
    if (!editUser) return
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({
          csrf_token: csrfToken,
          userId: editUser.id,
          username: editForm.username.trim(),
          email: editForm.email.trim(),
          role: editForm.role,
          fullName: editForm.fullName.trim() || undefined,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || body?.ok === false) {
        throw new Error(
          body?.error?.message || body?.error || 'Failed to update user',
        )
      }
      showToast('success', 'User updated')
      setEditUser(null)
      await loadUsers()
    } catch (err: any) {
      showToast('error', err?.message || 'Failed to update user')
    }
  }

  const startEdit = (row: UserRow) => {
    setEditUser(row)
    setEditForm({
      username: row.username || '',
      email: row.email || '',
      role: row.role || roleOptions[0]?.value || '',
      fullName: row.full_name || '',
    })
  }

  return (
    <div className="space-y-4">
      <CsrfBootstrap onToken={setCsrfToken} />
      <PageHeader
        title="Users"
        description="Create, update, and manage access for station staff."
      />

      <Card className="space-y-4 p-4">
        <div className="text-sm font-semibold text-[var(--text-primary)]">
          Create user
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Input
            placeholder="Username"
            value={createForm.username}
            onChange={(event) =>
              setCreateForm((prev) => ({
                ...prev,
                username: event.target.value,
              }))
            }
          />
          <Input
            placeholder="Email"
            value={createForm.email}
            onChange={(event) =>
              setCreateForm((prev) => ({ ...prev, email: event.target.value }))
            }
          />
          <Input
            placeholder="Temp password"
            type="password"
            value={createForm.password}
            onChange={(event) =>
              setCreateForm((prev) => ({
                ...prev,
                password: event.target.value,
              }))
            }
          />
          <Select
            value={createForm.role}
            onChange={(event) =>
              setCreateForm((prev) => ({
                ...prev,
                role: event.target.value,
              }))
            }
          >
            {roleOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          <Input
            className="md:col-span-2"
            placeholder="Full name (optional)"
            value={createForm.fullName}
            onChange={(event) =>
              setCreateForm((prev) => ({
                ...prev,
                fullName: event.target.value,
              }))
            }
          />
          <div className="flex justify-end md:col-span-3">
            <Button
              variant="primary"
              onClick={handleCreate}
              disabled={!csrfToken}
            >
              Create user
            </Button>
          </div>
        </div>
      </Card>

      {loading ? (
        <Card className="space-y-3 p-4">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </Card>
      ) : error ? (
        <ErrorDetails
          title="Unable to load users"
          message="Check your connection and try again."
          error={error}
        />
      ) : (
        <Card className="relative overflow-hidden">
          {loading ? <LoadingOverlay label="Refreshing users…" /> : null}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Username</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last login</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8">
                    <EmptyState
                      title="No users found"
                      description="Create the first user to get started."
                    />
                  </TableCell>
                </TableRow>
              ) : (
                users.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium text-[var(--text-primary)]">
                      {row.username}
                      {row.full_name ? (
                        <div className="text-xs text-[var(--text-muted)]">
                          {row.full_name}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>{row.email || '—'}</TableCell>
                    <TableCell>{roleLabel(row.role)}</TableCell>
                    <TableCell>
                      <Badge variant={row.is_active ? 'success' : 'warn'}>
                        {row.is_active ? 'Active' : 'Disabled'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-[var(--text-muted)]">
                      {formatDate(row.last_login_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            ⋯
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => startEdit(row)}>
                            Edit user
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() => {
                              setResetUser(row)
                              setResetPassword('')
                            }}
                          >
                            Reset password
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() =>
                              handleSetActive(row, !row.is_active)
                            }
                          >
                            {row.is_active ? 'Disable user' : 'Enable user'}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      )}

      <Sheet
        open={Boolean(editUser)}
        onOpenChange={(open) => !open && setEditUser(null)}
      >
        <SheetContent side="right" className="flex h-dvh flex-col p-0">
          <SheetHeader className="px-6 pt-6">
            <SheetTitle>Edit user</SheetTitle>
          </SheetHeader>
          <div className="flex-1 space-y-3 overflow-y-auto px-6 py-4">
            <Input
              placeholder="Username"
              value={editForm.username}
              onChange={(event) =>
                setEditForm((prev) => ({
                  ...prev,
                  username: event.target.value,
                }))
              }
            />
            <Input
              placeholder="Email"
              value={editForm.email}
              onChange={(event) =>
                setEditForm((prev) => ({
                  ...prev,
                  email: event.target.value,
                }))
              }
            />
            <Select
              value={editForm.role}
              onChange={(event) =>
                setEditForm((prev) => ({
                  ...prev,
                  role: event.target.value,
                }))
              }
            >
              {roleOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <Input
              placeholder="Full name"
              value={editForm.fullName}
              onChange={(event) =>
                setEditForm((prev) => ({
                  ...prev,
                  fullName: event.target.value,
                }))
              }
            />
          </div>
          <div className="border-t bg-[var(--surface-card)] px-6 py-4">
            <SheetFooter className="flex items-center justify-end gap-2">
              <Button variant="secondary" onClick={() => setEditUser(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleEdit}
                disabled={!csrfToken}
              >
                Save changes
              </Button>
            </SheetFooter>
          </div>
        </SheetContent>
      </Sheet>

      <Dialog
        open={Boolean(resetUser)}
        onOpenChange={(open) => !open && setResetUser(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset password</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-sm text-[var(--text-secondary)]">
              Set a new temporary password for {resetUser?.username}.
            </div>
            <Input
              placeholder="New password"
              type="password"
              value={resetPassword}
              onChange={(event) => setResetPassword(event.target.value)}
            />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary">Cancel</Button>
            </DialogClose>
            <Button
              variant="primary"
              onClick={handleResetPassword}
              disabled={!resetPassword}
            >
              Reset password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ToastViewport>
        {toasts.map((toast) => (
          <ToastItem key={toast.id} variant={toast.variant}>
            {toast.message}
          </ToastItem>
        ))}
      </ToastViewport>
    </div>
  )
}
