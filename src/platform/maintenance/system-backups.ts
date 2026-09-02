import { spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { chmod, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { ClientConfig, PoolConfig } from 'pg'
import archiver from 'archiver'
import { Client } from 'pg'

import {
  getPostgresDatabaseName,
  getPostgresPoolConfig,
  getPrimaryDataRoot,
} from '@/src/platform/config/app-config'
import { closePool } from '@/src/platform/db/postgres'
import { AppError } from '@/src/shared/errors/AppError'

export type BackupKind = 'database' | 'full'

export type BackupFileInfo = {
  filename: string
  kind: BackupKind | 'pre-reset'
  sizeBytes: number
  createdAt: string
}

const BACKUP_FILENAME_RE =
  /^vpos-ftc-(?:db|full|pre-reset)-[0-9]{8}-[0-9]{6}\.(?:dump|zip)$/

const timestamp = (date = new Date()) =>
  date.toISOString().replace(/[-:]/g, '').replace('T', '-').replace(/\..+$/, '')

export const getBackupDirectory = () =>
  path.join(/*turbopackIgnore: true*/ getPrimaryDataRoot(), 'backups')

const ensureBackupDirectory = async () => {
  const directory = getBackupDirectory()
  await mkdir(/*turbopackIgnore: true*/ directory, {
    recursive: true,
    mode: 0o750,
  })
  return directory
}

const parseConnectionString = (connectionString: string) => {
  const url = new URL(connectionString)
  return {
    host: url.hostname,
    port: url.port || '5432',
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.replace(/^\//, '')),
    sslMode: url.searchParams.get('sslmode') || undefined,
  }
}

const pgEnvironment = (config: PoolConfig) => {
  const fromUrl = config.connectionString
    ? parseConnectionString(String(config.connectionString))
    : null

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PGHOST: String(fromUrl?.host ?? config.host ?? '127.0.0.1'),
    PGPORT: String(fromUrl?.port ?? config.port ?? 5432),
    PGUSER: String(fromUrl?.user ?? config.user ?? 'postgres'),
    PGPASSWORD: String(fromUrl?.password ?? config.password ?? ''),
    PGDATABASE: String(
      fromUrl?.database ?? config.database ?? getPostgresDatabaseName(),
    ),
  }

  if (fromUrl?.sslMode) {
    env.PGSSLMODE = fromUrl.sslMode
  } else if (config.ssl) {
    env.PGSSLMODE = 'require'
  }

  return env
}

const runCommand = async (
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
) => {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      env,
      stdio: ['ignore', 'ignore', 'pipe'],
    })
    let stderr = ''

    child.stderr.on('data', (chunk) => {
      stderr += String(chunk)
    })
    child.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') {
        reject(
          new AppError(
            'INTERNAL_ERROR',
            `${command} is not installed. Install the PostgreSQL client tools or configure PG_DUMP_BIN.`,
            503,
          ),
        )
        return
      }
      reject(error)
    })
    child.on('close', (code) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(
        new AppError(
          'INTERNAL_ERROR',
          `Database backup failed with exit code ${code}.`,
          500,
          { stderr: stderr.trim().slice(-2_000) },
        ),
      )
    })
  })
}

const dumpDatabaseToPath = async (destination: string) => {
  const config = getPostgresPoolConfig()
  const executable = process.env.PG_DUMP_BIN || 'pg_dump'
  await runCommand(
    executable,
    ['--format=custom', '--no-owner', '--no-privileges', '--file', destination],
    pgEnvironment(config),
  )
  await chmod(/*turbopackIgnore: true*/ destination, 0o640)
}

const toBackupInfo = async (filePath: string): Promise<BackupFileInfo> => {
  const file = await stat(/*turbopackIgnore: true*/ filePath)
  const filename = path.basename(filePath)
  return {
    filename,
    kind: filename.startsWith('vpos-ftc-full-')
      ? 'full'
      : filename.startsWith('vpos-ftc-pre-reset-')
        ? 'pre-reset'
        : 'database',
    sizeBytes: file.size,
    createdAt: file.mtime.toISOString(),
  }
}

export const createDatabaseBackup = async (options?: {
  preReset?: boolean
}): Promise<BackupFileInfo> => {
  const directory = await ensureBackupDirectory()
  const prefix = options?.preReset ? 'vpos-ftc-pre-reset' : 'vpos-ftc-db'
  const destination = path.join(
    /*turbopackIgnore: true*/ directory,
    `${prefix}-${timestamp()}.dump`,
  )

  try {
    await dumpDatabaseToPath(destination)
    return await toBackupInfo(destination)
  } catch (error) {
    await rm(/*turbopackIgnore: true*/ destination, { force: true }).catch(
      () => undefined,
    )
    throw error
  }
}

const archiveFullBackup = async (args: {
  destination: string
  databaseDumpPath: string
  manifestPath: string
}) => {
  const dataRoot = getPrimaryDataRoot()
  const output = createWriteStream(/*turbopackIgnore: true*/ args.destination, {
    mode: 0o640,
  })
  const archive = archiver('zip', { zlib: { level: 6 } })

  await new Promise<void>((resolve, reject) => {
    output.on('close', resolve)
    output.on('error', reject)
    archive.on('warning', (error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') reject(error)
    })
    archive.on('error', reject)
    archive.pipe(output)

    archive.file(/*turbopackIgnore: true*/ args.databaseDumpPath, {
      name: `database/${path.basename(args.databaseDumpPath)}`,
    })
    archive.file(/*turbopackIgnore: true*/ args.manifestPath, {
      name: 'manifest.json',
    })

    archive.glob(
      '**/*',
      {
        cwd: /*turbopackIgnore: true*/ dataRoot,
        dot: true,
        ignore: ['backups/**', '**/*.pid', '**/*.sock', '**/node_modules/**'],
      },
      { prefix: 'data' },
    )

    archive.finalize().catch(reject)
  })
}

export const createFullBackup = async (): Promise<BackupFileInfo> => {
  const directory = await ensureBackupDirectory()
  const stamp = timestamp()
  const destination = path.join(
    /*turbopackIgnore: true*/ directory,
    `vpos-ftc-full-${stamp}.zip`,
  )
  const databaseDumpPath = path.join(
    /*turbopackIgnore: true*/ directory,
    `.full-${stamp}.dump`,
  )
  const manifestPath = path.join(
    /*turbopackIgnore: true*/ directory,
    `.full-${stamp}-manifest.json`,
  )

  const manifest = {
    schemaVersion: 2,
    createdAt: new Date().toISOString(),
    hostname: os.hostname(),
    platform: `${process.platform}-${process.arch}`,
    nodeVersion: process.version,
    database: getPostgresDatabaseName(),
    dataRoot: getPrimaryDataRoot(),
    application: {
      name: '@gilbarcoafs/vpos-ftc-app',
      version: process.env.npm_package_version || 'unknown',
    },
    contents: [
      'PostgreSQL custom-format database dump',
      'Persistent VPOS data directory',
      'Application identity and runtime metadata in this manifest',
    ],
    exclusions: [
      'Existing backups',
      'Runtime PID/socket files',
      'node_modules',
      'Application .env secret files',
      'Application binaries, source files, and service scripts',
    ],
  }

  try {
    await dumpDatabaseToPath(databaseDumpPath)
    await writeFile(
      /*turbopackIgnore: true*/ manifestPath,
      JSON.stringify(manifest, null, 2),
      {
        mode: 0o640,
      },
    )
    await archiveFullBackup({
      destination,
      databaseDumpPath,
      manifestPath,
    })
    return await toBackupInfo(destination)
  } catch (error) {
    await rm(/*turbopackIgnore: true*/ destination, { force: true }).catch(
      () => undefined,
    )
    throw error
  } finally {
    await Promise.all([
      rm(/*turbopackIgnore: true*/ databaseDumpPath, { force: true }).catch(
        () => undefined,
      ),
      rm(/*turbopackIgnore: true*/ manifestPath, { force: true }).catch(
        () => undefined,
      ),
    ])
  }
}

export const listBackupFiles = async (): Promise<BackupFileInfo[]> => {
  const directory = await ensureBackupDirectory()
  const filenames = await readdir(/*turbopackIgnore: true*/ directory)
  const backups = await Promise.all(
    filenames
      .filter((filename) => BACKUP_FILENAME_RE.test(filename))
      .map((filename) =>
        toBackupInfo(path.join(/*turbopackIgnore: true*/ directory, filename)),
      ),
  )
  return backups.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export const resolveBackupFile = async (filename: string) => {
  const safeFilename = path.basename(String(filename || ''))
  if (safeFilename !== filename || !BACKUP_FILENAME_RE.test(safeFilename)) {
    throw new AppError('VALIDATION_ERROR', 'Invalid backup filename.', 400)
  }

  const filePath = path.join(
    /*turbopackIgnore: true*/ await ensureBackupDirectory(),
    safeFilename,
  )
  try {
    const file = await stat(/*turbopackIgnore: true*/ filePath)
    if (!file.isFile()) throw new Error('Not a file')
  } catch {
    throw new AppError('NOT_FOUND', 'Backup file not found.', 404)
  }
  return filePath
}

const buildAdminConfig = (target: PoolConfig): ClientConfig => {
  if (target.connectionString) {
    const url = new URL(String(target.connectionString))
    url.pathname = '/postgres'
    return {
      connectionString: url.toString(),
      connectionTimeoutMillis: target.connectionTimeoutMillis,
    }
  }

  return {
    host: target.host,
    port: target.port,
    user: target.user,
    password: target.password,
    database: 'postgres',
    ssl: target.ssl,
    connectionTimeoutMillis: target.connectionTimeoutMillis,
  }
}

const quoteIdentifier = (value: string) => `"${value.replace(/"/g, '""')}"`

const resolveDatabaseHost = (config: PoolConfig) => {
  if (config.connectionString) {
    return parseConnectionString(String(config.connectionString)).host
  }
  return String(config.host || '127.0.0.1').trim()
}

const isLocalDatabaseHost = (host: string) => {
  const normalized = host.trim().toLowerCase()
  return (
    normalized === 'localhost' ||
    normalized === '127.0.0.1' ||
    normalized === '::1' ||
    normalized.startsWith('/')
  )
}

export const dropApplicationDatabase = async () => {
  const databaseName = getPostgresDatabaseName()
  const targetConfig = getPostgresPoolConfig()
  const databaseHost = resolveDatabaseHost(targetConfig)

  if (
    !isLocalDatabaseHost(databaseHost) &&
    String(process.env.ALLOW_REMOTE_DATABASE_RESET || '').toLowerCase() !==
      'true'
  ) {
    throw new AppError(
      'VALIDATION_ERROR',
      'Remote database reset is disabled. This operation is intended for the local station database only.',
      400,
      { databaseHost },
    )
  }

  if (['postgres', 'template0', 'template1'].includes(databaseName)) {
    throw new AppError(
      'VALIDATION_ERROR',
      `Refusing to drop protected database ${databaseName}.`,
      400,
    )
  }

  await closePool()
  const admin = new Client(buildAdminConfig(targetConfig))
  await admin.connect()
  try {
    await admin.query(
      `SELECT pg_terminate_backend(pid)
         FROM pg_stat_activity
        WHERE datname = $1
          AND pid <> pg_backend_pid()`,
      [databaseName],
    )
    await admin.query(
      `DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)}`,
    )
  } finally {
    await admin.end().catch(() => undefined)
  }

  return { databaseName }
}
