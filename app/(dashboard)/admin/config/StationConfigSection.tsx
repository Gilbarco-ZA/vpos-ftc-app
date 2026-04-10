'use client'

import type { Json } from '@/src/modules/admin-config/presentation/config-editor'
import Link from 'next/link'
import ToggleButtons from '@/app/(dashboard)/admin/config/ToggleButtons'

import {
  getIn,
  joinCsv,
  joinLines,
  parseCsvNums,
  parseLines,
  setIn,
  toggleIn,
  toNum,
} from '@/src/modules/admin-config/presentation/config-editor'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

export function StationConfigSection({
  mode,
  showAdvancedJson,
  onToggleAdvancedJson,
  stationConfigText,
  onStationConfigTextChange,
  stationConfigObj,
  onStationConfigObjChange,
  busy,
  onSave,
}: {
  mode: 'basic' | 'advanced'
  showAdvancedJson: boolean
  onToggleAdvancedJson: () => void
  stationConfigText: string
  onStationConfigTextChange: (text: string) => void
  stationConfigObj: Json
  onStationConfigObjChange: (updater: (prev: any) => any) => void
  busy: string | null
  onSave: () => void
}) {
  const set = (path: (string | number)[], value: any) =>
    onStationConfigObjChange((o: any) => setIn(o, path, value))

  const setNum = (path: (string | number)[], value: string, fallback: number) =>
    onStationConfigObjChange((o: any) => setIn(o, path, toNum(value, fallback)))

  const get = (path: (string | number)[], fallback?: any) =>
    getIn(stationConfigObj, path, fallback)

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Station config</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-[var(--text-secondary)]">
              Base configuration (vpos.config.json equivalent). Plugin/device
              overlays apply on top.
            </p>
            <div className="flex items-center gap-2">
              {mode === 'advanced' && (
                <Button
                  variant="secondary"
                  onClick={onToggleAdvancedJson}
                  disabled={busy === 'station'}
                >
                  {showAdvancedJson ? 'Use form' : 'Advanced JSON'}
                </Button>
              )}
              <Button
                variant="primary"
                onClick={onSave}
                disabled={busy === 'station'}
              >
                Save station config
              </Button>
            </div>
          </div>

          {mode === 'advanced' && showAdvancedJson ? (
            <Textarea
              className="h-64 font-mono text-xs"
              value={stationConfigText}
              onChange={(e) => onStationConfigTextChange(e.target.value)}
            />
          ) : (
            <div className="space-y-4">
              {/* Global */}
              <div className="space-y-2">
                <div className="text-xs font-semibold text-[var(--text-secondary)]">
                  Global
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                  <Input
                    placeholder="version"
                    value={String(get(['version'], ''))}
                    onChange={(e) => set(['version'], e.target.value)}
                  />
                  <Input
                    placeholder="country"
                    value={String(get(['data', 'config', 'country'], ''))}
                    onChange={(e) =>
                      set(['data', 'config', 'country'], e.target.value)
                    }
                  />
                  <Input
                    placeholder="timezone"
                    value={String(get(['data', 'config', 'timezone'], ''))}
                    onChange={(e) =>
                      set(['data', 'config', 'timezone'], e.target.value)
                    }
                  />
                  <Input
                    placeholder="language"
                    value={String(get(['data', 'config', 'language'], ''))}
                    onChange={(e) =>
                      set(['data', 'config', 'language'], e.target.value)
                    }
                  />
                </div>
                <ToggleButtons
                  fields={[['RTL', ['data', 'config', 'rtl']]]}
                  obj={stationConfigObj}
                  onChange={(next) => onStationConfigObjChange(() => next)}
                />
              </div>

              {/* Supervisor */}
              <div className="space-y-2">
                <div className="text-xs font-semibold text-[var(--text-secondary)]">
                  Supervisor
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                  <Input
                    placeholder="logger label"
                    value={String(
                      get(['data', 'supervisor', 'loggerParams', 'label'], ''),
                    )}
                    onChange={(e) =>
                      set(
                        ['data', 'supervisor', 'loggerParams', 'label'],
                        e.target.value,
                      )
                    }
                  />
                  <Input
                    placeholder="logger level"
                    value={String(
                      get(['data', 'supervisor', 'loggerParams', 'level'], ''),
                    )}
                    onChange={(e) =>
                      set(
                        ['data', 'supervisor', 'loggerParams', 'level'],
                        e.target.value,
                      )
                    }
                  />
                  <Input
                    placeholder="restartDelay"
                    value={String(
                      get(['data', 'supervisor', 'restartDelay'], 0),
                    )}
                    onChange={(e) =>
                      setNum(
                        ['data', 'supervisor', 'restartDelay'],
                        e.target.value,
                        0,
                      )
                    }
                  />
                  <Input
                    placeholder="maxRestarts"
                    value={String(
                      get(['data', 'supervisor', 'maxRestarts'], 0),
                    )}
                    onChange={(e) =>
                      setNum(
                        ['data', 'supervisor', 'maxRestarts'],
                        e.target.value,
                        0,
                      )
                    }
                  />
                  <Input
                    placeholder="healthCheckInterval"
                    value={String(
                      get(['data', 'supervisor', 'healthCheckInterval'], 0),
                    )}
                    onChange={(e) =>
                      setNum(
                        ['data', 'supervisor', 'healthCheckInterval'],
                        e.target.value,
                        0,
                      )
                    }
                  />
                  <Input
                    placeholder="startupTimeout"
                    value={String(
                      get(['data', 'supervisor', 'startupTimeout'], 0),
                    )}
                    onChange={(e) =>
                      setNum(
                        ['data', 'supervisor', 'startupTimeout'],
                        e.target.value,
                        0,
                      )
                    }
                  />
                </div>
                <ToggleButtons
                  fields={[
                    [
                      'outputToConsole',
                      ['data', 'supervisor', 'loggerParams', 'outputToConsole'],
                    ],
                    [
                      'consoleOverride',
                      ['data', 'supervisor', 'loggerParams', 'consoleOverride'],
                    ],
                  ]}
                  obj={stationConfigObj}
                  onChange={(next) => onStationConfigObjChange(() => next)}
                />
              </div>

              {/* API process */}
              <div className="space-y-2">
                <div className="text-xs font-semibold text-[var(--text-secondary)]">
                  API process
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                  <Input
                    placeholder="api host"
                    value={String(
                      get(
                        [
                          'data',
                          'processes',
                          'process',
                          'api',
                          'config',
                          'host',
                        ],
                        '',
                      ),
                    )}
                    onChange={(e) =>
                      set(
                        [
                          'data',
                          'processes',
                          'process',
                          'api',
                          'config',
                          'host',
                        ],
                        e.target.value,
                      )
                    }
                  />
                  <Input
                    placeholder="api port"
                    value={String(
                      get(
                        [
                          'data',
                          'processes',
                          'process',
                          'api',
                          'config',
                          'port',
                        ],
                        0,
                      ),
                    )}
                    onChange={(e) =>
                      setNum(
                        [
                          'data',
                          'processes',
                          'process',
                          'api',
                          'config',
                          'port',
                        ],
                        e.target.value,
                        0,
                      )
                    }
                  />
                  <Input
                    placeholder="startupOrder"
                    value={String(
                      get(
                        ['data', 'processes', 'process', 'api', 'startupOrder'],
                        0,
                      ),
                    )}
                    onChange={(e) =>
                      setNum(
                        ['data', 'processes', 'process', 'api', 'startupOrder'],
                        e.target.value,
                        0,
                      )
                    }
                  />
                  <Input
                    placeholder="debugPort"
                    value={String(
                      get(
                        ['data', 'processes', 'process', 'api', 'debugPort'],
                        9229,
                      ),
                    )}
                    onChange={(e) =>
                      setNum(
                        ['data', 'processes', 'process', 'api', 'debugPort'],
                        e.target.value,
                        9229,
                      )
                    }
                  />
                </div>
                <ToggleButtons
                  fields={[
                    [
                      'enabled',
                      ['data', 'processes', 'process', 'api', 'enabled'],
                    ],
                    [
                      'required',
                      ['data', 'processes', 'process', 'api', 'required'],
                    ],
                    [
                      'autoRestart',
                      ['data', 'processes', 'process', 'api', 'autoRestart'],
                    ],
                    [
                      'allowedToStop',
                      ['data', 'processes', 'process', 'api', 'allowedToStop'],
                    ],
                    ['debug', ['data', 'processes', 'process', 'api', 'debug']],
                  ]}
                  obj={stationConfigObj}
                  onChange={(next) => onStationConfigObjChange(() => next)}
                />
              </div>

              {/* POS fclite */}
              <div className="space-y-2">
                <div className="text-xs font-semibold text-[var(--text-secondary)]">
                  POS (fclite)
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                  <Input
                    placeholder="pos host"
                    value={String(
                      get(
                        [
                          'data',
                          'processes',
                          'process',
                          'pos',
                          'config',
                          'host',
                        ],
                        '',
                      ),
                    )}
                    onChange={(e) =>
                      set(
                        [
                          'data',
                          'processes',
                          'process',
                          'pos',
                          'config',
                          'host',
                        ],
                        e.target.value,
                      )
                    }
                  />
                  <Input
                    placeholder="appId"
                    value={String(
                      get(
                        [
                          'data',
                          'processes',
                          'process',
                          'pos',
                          'plugins',
                          0,
                          'config',
                          'appId',
                        ],
                        '',
                      ),
                    )}
                    onChange={(e) =>
                      set(
                        [
                          'data',
                          'processes',
                          'process',
                          'pos',
                          'plugins',
                          0,
                          'config',
                          'appId',
                        ],
                        e.target.value,
                      )
                    }
                  />
                  <Input
                    placeholder="posId"
                    value={String(
                      get(
                        [
                          'data',
                          'processes',
                          'process',
                          'pos',
                          'plugins',
                          0,
                          'config',
                          'posId',
                        ],
                        '',
                      ),
                    )}
                    onChange={(e) =>
                      set(
                        [
                          'data',
                          'processes',
                          'process',
                          'pos',
                          'plugins',
                          0,
                          'config',
                          'posId',
                        ],
                        e.target.value,
                      )
                    }
                  />
                  <Input
                    placeholder="countryCode"
                    value={String(
                      get(
                        [
                          'data',
                          'processes',
                          'process',
                          'pos',
                          'plugins',
                          0,
                          'config',
                          'countryCode',
                        ],
                        0,
                      ),
                    )}
                    onChange={(e) =>
                      setNum(
                        [
                          'data',
                          'processes',
                          'process',
                          'pos',
                          'plugins',
                          0,
                          'config',
                          'countryCode',
                        ],
                        e.target.value,
                        0,
                      )
                    }
                  />
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <Input
                    placeholder="pollingTime"
                    value={String(
                      get(
                        [
                          'data',
                          'processes',
                          'process',
                          'pos',
                          'plugins',
                          0,
                          'config',
                          'pollingTime',
                        ],
                        0,
                      ),
                    )}
                    onChange={(e) =>
                      setNum(
                        [
                          'data',
                          'processes',
                          'process',
                          'pos',
                          'plugins',
                          0,
                          'config',
                          'pollingTime',
                        ],
                        e.target.value,
                        0,
                      )
                    }
                  />
                  <Input
                    placeholder="fpIds (comma-separated)"
                    value={joinCsv(
                      get(
                        [
                          'data',
                          'processes',
                          'process',
                          'pos',
                          'plugins',
                          0,
                          'config',
                          'fpIds',
                        ],
                        [],
                      ),
                    )}
                    onChange={(e) =>
                      set(
                        [
                          'data',
                          'processes',
                          'process',
                          'pos',
                          'plugins',
                          0,
                          'config',
                          'fpIds',
                        ],
                        parseCsvNums(e.target.value),
                      )
                    }
                  />
                  <Input
                    placeholder="skipAttendantAuthFpIds (comma-separated)"
                    value={joinCsv(
                      get(
                        [
                          'data',
                          'processes',
                          'process',
                          'pos',
                          'plugins',
                          0,
                          'config',
                          'skipAttendantAuthFpIds',
                        ],
                        [],
                      ),
                    )}
                    onChange={(e) =>
                      set(
                        [
                          'data',
                          'processes',
                          'process',
                          'pos',
                          'plugins',
                          0,
                          'config',
                          'skipAttendantAuthFpIds',
                        ],
                        parseCsvNums(e.target.value),
                      )
                    }
                  />
                </div>
                <Textarea
                  className="h-24 font-mono text-xs"
                  placeholder="autoClearErrors (one per line)"
                  value={joinLines(
                    get(
                      [
                        'data',
                        'processes',
                        'process',
                        'pos',
                        'plugins',
                        0,
                        'config',
                        'autoClearErrors',
                      ],
                      [],
                    ),
                  )}
                  onChange={(e) =>
                    set(
                      [
                        'data',
                        'processes',
                        'process',
                        'pos',
                        'plugins',
                        0,
                        'config',
                        'autoClearErrors',
                      ],
                      parseLines(e.target.value),
                    )
                  }
                />
                <ToggleButtons
                  fields={[
                    [
                      'skipAttendantAuth',
                      [
                        'data',
                        'processes',
                        'process',
                        'pos',
                        'plugins',
                        0,
                        'config',
                        'skipAttendantAuth',
                      ],
                    ],
                    [
                      'autoClearAllErrors',
                      [
                        'data',
                        'processes',
                        'process',
                        'pos',
                        'plugins',
                        0,
                        'config',
                        'autoClearAllErrors',
                      ],
                    ],
                    [
                      'skipFiscalAuth',
                      [
                        'data',
                        'processes',
                        'process',
                        'pos',
                        'plugins',
                        0,
                        'config',
                        'skipFiscalAuth',
                      ],
                    ],
                  ]}
                  obj={stationConfigObj}
                  onChange={(next) => onStationConfigObjChange(() => next)}
                />
              </div>

              {/* Fiscal TZ */}
              <div className="space-y-2">
                <div className="text-xs font-semibold text-[var(--text-secondary)]">
                  Fiscal (TZ)
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                  <Input
                    placeholder="fuelTaxCode"
                    value={String(
                      get(
                        [
                          'data',
                          'processes',
                          'process',
                          'fiscal',
                          'plugins',
                          0,
                          'config',
                          'fuelTaxCode',
                        ],
                        '',
                      ),
                    )}
                    onChange={(e) =>
                      set(
                        [
                          'data',
                          'processes',
                          'process',
                          'fiscal',
                          'plugins',
                          0,
                          'config',
                          'fuelTaxCode',
                        ],
                        e.target.value,
                      )
                    }
                  />
                  <Input
                    placeholder="interminReport (blank = null)"
                    value={String(
                      get(
                        [
                          'data',
                          'processes',
                          'process',
                          'fiscal',
                          'plugins',
                          0,
                          'config',
                          'interminReport',
                        ],
                        '',
                      ) ?? '',
                    )}
                    onChange={(e) =>
                      set(
                        [
                          'data',
                          'processes',
                          'process',
                          'fiscal',
                          'plugins',
                          0,
                          'config',
                          'interminReport',
                        ],
                        e.target.value.trim() ? e.target.value : null,
                      )
                    }
                  />
                  <Input
                    placeholder="grades (one per line below)"
                    disabled
                    value={String(
                      (
                        get(
                          [
                            'data',
                            'processes',
                            'process',
                            'fiscal',
                            'plugins',
                            0,
                            'config',
                            'grades',
                          ],
                          [],
                        ) as any[]
                      )?.length ?? 0,
                    )}
                  />
                  <Input
                    placeholder="tanks (one per line below)"
                    disabled
                    value={String(
                      (
                        get(
                          [
                            'data',
                            'processes',
                            'process',
                            'fiscal',
                            'plugins',
                            0,
                            'config',
                            'tanks',
                          ],
                          [],
                        ) as any[]
                      )?.length ?? 0,
                    )}
                  />
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <Textarea
                    className="h-28 font-mono text-xs"
                    placeholder="grades (one per line)"
                    value={joinLines(
                      get(
                        [
                          'data',
                          'processes',
                          'process',
                          'fiscal',
                          'plugins',
                          0,
                          'config',
                          'grades',
                        ],
                        [],
                      ),
                    )}
                    onChange={(e) =>
                      set(
                        [
                          'data',
                          'processes',
                          'process',
                          'fiscal',
                          'plugins',
                          0,
                          'config',
                          'grades',
                        ],
                        parseLines(e.target.value),
                      )
                    }
                  />
                  <Textarea
                    className="h-28 font-mono text-xs"
                    placeholder="tanks (one per line)"
                    value={joinLines(
                      get(
                        [
                          'data',
                          'processes',
                          'process',
                          'fiscal',
                          'plugins',
                          0,
                          'config',
                          'tanks',
                        ],
                        [],
                      ),
                    )}
                    onChange={(e) =>
                      set(
                        [
                          'data',
                          'processes',
                          'process',
                          'fiscal',
                          'plugins',
                          0,
                          'config',
                          'tanks',
                        ],
                        parseLines(e.target.value),
                      )
                    }
                  />
                </div>
                {mode === 'advanced' && (
                  <div className="rounded bg-[var(--surface-muted)] p-3 text-sm text-[var(--text-secondary)]">
                    Printers are managed in{' '}
                    <Link href="/admin/config/printers" className="underline">
                      Printer config
                    </Link>
                    . Current printers:{' '}
                    <span className="font-semibold">
                      {String(
                        (
                          get(
                            [
                              'data',
                              'processes',
                              'process',
                              'fiscal',
                              'plugins',
                              0,
                              'config',
                              'printers',
                            ],
                            [],
                          ) as any[]
                        )?.length ?? 0,
                      )}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Printer Config</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-[var(--text-secondary)]">
              Base printer configuration (vpos.config.json equivalent).
            </p>
            <Link href="/admin/config/printers">
              <Button variant="primary">Printer config</Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </>
  )
}
